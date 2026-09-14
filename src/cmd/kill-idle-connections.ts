import { readFileSync } from "fs";
import { createPool } from "mariadb";

const DATABASE_SSL_CA_PATH = process.env.DATABASE_SSL_CA_PATH;

function buildSsl(dbUrl: URL) {
	const host = dbUrl.hostname.toLowerCase();
	const sslMode = dbUrl.searchParams.get("ssl-mode")?.toLowerCase();
	const tlsRequired =
		sslMode === "required" ||
		sslMode === "verify_ca" ||
		sslMode === "verify_identity" ||
		host.includes("rds.amazonaws.com") ||
		host.includes("aivencloud.com");

	if (!tlsRequired) {
		return undefined;
	}

	if (DATABASE_SSL_CA_PATH) {
		try {
			const ca = readFileSync(DATABASE_SSL_CA_PATH, "utf8");
			if (ca.trim()) {
				return {
					ca,
					rejectUnauthorized: true,
					servername: dbUrl.hostname,
					checkServerIdentity: () => undefined,
				};
			}
		} catch {
			// fall through to unverified TLS
		}
	}

	return {
		rejectUnauthorized: false,
		servername: dbUrl.hostname,
	};
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.log("DATABASE_URL not set, skipping idle connection cleanup");
		return;
	}

	const dbUrl = new URL(databaseUrl);
	const pool = createPool({
		host: dbUrl.hostname,
		port: parseInt(dbUrl.port || "3306", 10),
		user: decodeURIComponent(dbUrl.username),
		password: decodeURIComponent(dbUrl.password),
		database: dbUrl.pathname.replace(/^\//, ""),
		ssl: buildSsl(dbUrl),
		connectionLimit: 1,
		acquireTimeout: 10000,
		connectTimeout: 10000,
	});

	const conn = await pool.getConnection();
	const rows = await conn.query("SHOW PROCESSLIST");
	let killed = 0;
	for (const r of rows) {
		if (r.Command === "Sleep" && r.Time > 0) {
			try {
				await conn.query(`KILL CONNECTION ${r.Id}`);
				killed++;
			} catch {
				// connection may have ended between list and kill
			}
		}
	}
	console.log(`Killed ${killed} idle MySQL connection(s) on ${dbUrl.pathname.replace(/^\//, "")}`);
	await conn.end();
	await pool.end();
}

main().catch((e) => {
	console.error("Failed to kill idle connections:", e instanceof Error ? e.message : e);
	process.exit(1);
});
