/**
 * Copy Grub Admin data: MySQL pilot slot DB → Postgres grubadmin_* on grubpac-v2.
 *
 * Usage:
 *   bun scripts/migrate-admin-mysql-to-postgres.ts --slot staging|preprod|prod
 *
 * Env (`.env.grubpac-v2.local` + optional slot MySQL URL):
 *   GRUBADMIN_PG_{STAGING|PREPROD|PROD}_URL — required Postgres target
 *   GRUBADMIN_MYSQL_{STAGING|PREPROD|PROD}_URL — preferred MySQL source
 *   DATABASE_URL — fallback MySQL when run on EC2 with slot .env.production sourced
 *   DATABASE_SSL_CA_PATH — optional RDS CA bundle for MySQL TLS on EC2
 *
 * Flags: --dry-run | --skip-truncate
 */
import { readFileSync } from "fs";
import dotenv from "dotenv";
import mariadb from "mariadb";
import pg from "pg";
import {
	assertMysqlSourceDb,
	assertPostgresTargetDb,
	getDatabaseNameFromUrl,
} from "./lib/assert-target-db";

type Slot = "staging" | "preprod" | "prod";

const SLOT_CONFIG: Record<
	Slot,
	{
		mysqlDb: string;
		pgDb: string;
		pgEnv: string;
		mysqlEnv: string;
	}
> = {
	staging: {
		mysqlDb: "grub_staging",
		pgDb: "grubadmin_staging",
		pgEnv: "GRUBADMIN_PG_STAGING_URL",
		mysqlEnv: "GRUBADMIN_MYSQL_STAGING_URL",
	},
	preprod: {
		mysqlDb: "grub_preprod",
		pgDb: "grubadmin_preprod",
		pgEnv: "GRUBADMIN_PG_PREPROD_URL",
		mysqlEnv: "GRUBADMIN_MYSQL_PREPROD_URL",
	},
	prod: {
		mysqlDb: "grub_prod",
		pgDb: "grubadmin_prod",
		pgEnv: "GRUBADMIN_PG_PROD_URL",
		mysqlEnv: "GRUBADMIN_MYSQL_PROD_URL",
	},
};

const BATCH_SIZE = 500;

/** MySQL-only; PG schema may come from `db push` (no `_prisma_migrations` table). */
const MYSQL_TABLES_SKIP = new Set(["_prisma_migrations"]);

function parseSlot(argv: string[]): Slot {
	const idx = argv.indexOf("--slot");
	if (idx === -1 || !argv[idx + 1]) {
		throw new Error(
			"Missing --slot staging|preprod|prod (e.g. bun scripts/migrate-admin-mysql-to-postgres.ts --slot staging)",
		);
	}
	const slot = argv[idx + 1] as Slot;
	if (!SLOT_CONFIG[slot]) {
		throw new Error(`Invalid --slot "${argv[idx + 1]}"; use staging, preprod, or prod`);
	}
	return slot;
}

const argv = process.argv.slice(2);
const slot = parseSlot(argv);
const config = SLOT_CONFIG[slot];

const flagArgs = argv.filter((a, i) => {
	if (a === "--slot") {
		return false;
	}
	if (i > 0 && argv[i - 1] === "--slot") {
		return false;
	}
	return true;
});
const args = new Set(flagArgs);
const dryRun = args.has("--dry-run");
const skipTruncate = args.has("--skip-truncate");

dotenv.config({ path: ".env.grubpac-v2.local" });

const pgUrl = process.env[config.pgEnv]?.trim();
const mysqlUrl = (process.env[config.mysqlEnv] ?? process.env.DATABASE_URL)?.trim();

if (!pgUrl) {
	throw new Error(`Missing ${config.pgEnv} in .env.grubpac-v2.local`);
}
if (!mysqlUrl) {
	throw new Error(
		`Missing MySQL source: set ${config.mysqlEnv} or DATABASE_URL (${config.mysqlDb})`,
	);
}

assertPostgresTargetDb(config.pgDb, pgUrl);
assertMysqlSourceDb(config.mysqlDb, mysqlUrl);

function buildMysqlSsl(dbUrl: URL): mariadb.ConnectionConfig["ssl"] | undefined {
	const host = dbUrl.hostname.toLowerCase();
	const isRemote =
		host.includes("rds.amazonaws.com") || host.includes("aivencloud.com");
	if (!isRemote) {
		return undefined;
	}

	const caPath = process.env.DATABASE_SSL_CA_PATH?.trim();
	if (caPath) {
		try {
			const ca = readFileSync(caPath, "utf8");
			if (ca.trim()) {
				return {
					ca,
					rejectUnauthorized: true,
					servername: dbUrl.hostname,
					checkServerIdentity: () => undefined,
				};
			}
		} catch {
			// fall through
		}
	}

	return { rejectUnauthorized: false };
}

function mysqlConnectionConfig(url: string): mariadb.ConnectionConfig {
	const u = new URL(url);
	const database = getDatabaseNameFromUrl(url);
	return {
		host: u.hostname,
		port: parseInt(u.port || "3306", 10),
		user: decodeURIComponent(u.username),
		password: decodeURIComponent(u.password),
		database,
		connectTimeout: 30_000,
		ssl: buildMysqlSsl(u),
	};
}

function pgClientConfig(url: string): pg.ClientConfig {
	const parsed = new URL(url);
	parsed.searchParams.delete("sslmode");
	return {
		connectionString: parsed.toString(),
		ssl: { rejectUnauthorized: false },
	};
}

type PgColumnMeta = { dataType: string; udtName: string };

function normalizeCell(value: unknown, meta: PgColumnMeta | undefined): unknown {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	if (Buffer.isBuffer(value)) {
		return value;
	}
	if (value instanceof Date) {
		return value;
	}

	const pgType = meta?.udtName ?? meta?.dataType ?? "";
	if (pgType === "bool") {
		if (typeof value === "boolean") {
			return value;
		}
		if (typeof value === "number") {
			return value !== 0;
		}
		if (typeof value === "string") {
			return value === "1" || value.toLowerCase() === "true";
		}
	}

	if (pgType === "json" || pgType === "jsonb") {
		if (typeof value === "string") {
			try {
				JSON.parse(value);
				return value;
			} catch {
				return JSON.stringify(value);
			}
		}
		return JSON.stringify(value);
	}

	return value;
}

async function listMysqlTables(conn: mariadb.Connection): Promise<string[]> {
	const rows = (await conn.query(
		`SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
	)) as { name: string }[];
	return rows.map((r) => r.name).filter((n) => !MYSQL_TABLES_SKIP.has(n));
}

async function mysqlFkDeps(
	conn: mariadb.Connection,
	tables: string[],
): Promise<Map<string, Set<string>>> {
	const rows = (await conn.query(
		`SELECT TABLE_NAME AS tbl, REFERENCED_TABLE_NAME AS ref
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
	)) as { tbl: string; ref: string }[];

	const tableSet = new Set(tables);
	const deps = new Map<string, Set<string>>();
	for (const t of tables) {
		deps.set(t, new Set());
	}
	for (const { tbl, ref } of rows) {
		if (!tableSet.has(tbl) || !tableSet.has(ref)) {
			continue;
		}
		deps.get(tbl)!.add(ref);
	}
	return deps;
}

function topoSortTables(tables: string[], deps: Map<string, Set<string>>): string[] {
	const sorted: string[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(table: string): void {
		if (visited.has(table)) {
			return;
		}
		if (visiting.has(table)) {
			throw new Error(`FK cycle involving table "${table}"`);
		}
		visiting.add(table);
		for (const dep of deps.get(table) ?? []) {
			visit(dep);
		}
		visiting.delete(table);
		visited.add(table);
		sorted.push(table);
	}

	for (const t of tables) {
		visit(t);
	}
	return sorted;
}

async function getSharedColumns(
	mysqlConn: mariadb.Connection,
	pgClient: pg.Client,
	table: string,
): Promise<{ names: string[]; pgMeta: Map<string, PgColumnMeta> }> {
	const mysqlCols = (await mysqlConn.query(
		`SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
		[table],
	)) as { name: string }[];

	const pgRes = await pgClient.query(
		`SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
		[table],
	);

	const pgMeta = new Map<string, PgColumnMeta>();
	for (const row of pgRes.rows) {
		pgMeta.set(row.column_name, {
			dataType: row.data_type,
			udtName: row.udt_name,
		});
	}

	const names = mysqlCols.map((c) => c.name).filter((n) => pgMeta.has(n));
	return { names, pgMeta };
}

async function countMysql(conn: mariadb.Connection, table: string): Promise<number> {
	const rows = (await conn.query(`SELECT COUNT(*) AS c FROM \`${table}\``)) as {
		c: number;
	}[];
	return Number(rows[0]?.c ?? 0);
}

async function countPg(client: pg.Client, table: string): Promise<number> {
	const res = await client.query(`SELECT COUNT(*)::bigint AS c FROM "${table}"`);
	return Number(res.rows[0]?.c ?? 0);
}

async function copyTable(
	mysqlConn: mariadb.Connection,
	pgClient: pg.Client,
	table: string,
): Promise<{ source: number; inserted: number }> {
	const sourceCount = await countMysql(mysqlConn, table);
	if (sourceCount === 0) {
		return { source: 0, inserted: 0 };
	}

	const { names, pgMeta } = await getSharedColumns(mysqlConn, pgClient, table);
	if (names.length === 0) {
		console.warn(`[skip] ${table}: no overlapping columns`);
		return { source: sourceCount, inserted: 0 };
	}

	const colList = names.map((c) => `"${c}"`).join(", ");
	let inserted = 0;
	let offset = 0;

	while (offset < sourceCount) {
		const rows = (await mysqlConn.query(
			`SELECT ${names.map((c) => `\`${c}\``).join(", ")} FROM \`${table}\` LIMIT ? OFFSET ?`,
			[BATCH_SIZE, offset],
		)) as Record<string, unknown>[];

		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			const values = names.map((col) =>
				normalizeCell(row[col], pgMeta.get(col)),
			);
			const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
			await pgClient.query(
				`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
				values,
			);
			inserted += 1;
		}

		offset += rows.length;
	}

	return { source: sourceCount, inserted };
}

async function truncatePgTables(pgClient: pg.Client, tables: string[]): Promise<void> {
	if (tables.length === 0) {
		return;
	}
	const list = tables.map((t) => `"${t}"`).join(", ");
	await pgClient.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main(): Promise<void> {
	console.log(
		`[migrate] ${slot} MySQL → Postgres${dryRun ? " (dry-run)" : ""}${skipTruncate ? " (skip-truncate)" : ""}`,
	);

	const mysqlConn = await mariadb.createConnection(mysqlConnectionConfig(mysqlUrl!));
	const pgClient = new pg.Client(pgClientConfig(pgUrl!));
	await pgClient.connect();

	try {
		const tables = await listMysqlTables(mysqlConn);
		const deps = await mysqlFkDeps(mysqlConn, tables);
		const order = topoSortTables(tables, deps);
		console.log(`[migrate] ${order.length} tables (FK order)`);

		if (!dryRun && !skipTruncate) {
			console.log("[migrate] truncating Postgres target tables…");
			await truncatePgTables(pgClient, [...order].reverse());
		}

		const summary: { table: string; source: number; target: number; ok: boolean }[] =
			[];

		for (const table of order) {
			const source = await countMysql(mysqlConn, table);
			let target = skipTruncate ? await countPg(pgClient, table) : 0;

			if (!dryRun && source > 0) {
				if (skipTruncate && target > 0) {
					console.log(`[skip] ${table}: target already has ${target} rows`);
				} else {
					const result = await copyTable(mysqlConn, pgClient, table);
					target = await countPg(pgClient, table);
					if (result.inserted !== result.source) {
						console.warn(
							`[warn] ${table}: inserted ${result.inserted} vs source ${result.source}`,
						);
					}
				}
			} else if (dryRun) {
				target = await countPg(pgClient, table);
			}

			const ok = source === target;
			summary.push({ table, source, target, ok });
			const mark = ok ? "OK" : "MISMATCH";
			console.log(
				`[${mark}] ${table}: mysql=${source} postgres=${target}${dryRun ? " (dry-run)" : ""}`,
			);
		}

		const critical = ["client", "box", "admin", "vertical_delivery_employee"];
		console.log("\n[critical sample]");
		for (const name of critical) {
			const row = summary.find((s) => s.table === name);
			if (row) {
				console.log(`  ${name}: mysql=${row.source} postgres=${row.target}`);
			}
		}

		const mismatches = summary.filter((s) => !s.ok);
		if (mismatches.length > 0) {
			console.log(`\n[migrate] ${mismatches.length} table(s) with count mismatch`);
			process.exitCode = 1;
		} else {
			console.log("\n[migrate] all table counts match");
		}
	} finally {
		await mysqlConn.end();
		await pgClient.end();
	}
}

main().catch((err) => {
	console.error("[migrate] failed:", err instanceof Error ? err.message : err);
	process.exit(1);
});
