/**
 * Refuse to run seed/fix scripts against the wrong MySQL database.
 * Parses DATABASE_URL path segment (db name before query string).
 */
export function getDatabaseNameFromUrl(dbUrl: string): string {
	return dbUrl.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "unknown";
}

export function assertTargetDb(expectedDbName: string): void {
	const dbUrl = process.env.DATABASE_URL ?? "";
	const dbName = getDatabaseNameFromUrl(dbUrl);
	console.log(`[db-guard] DATABASE: ${dbName}`);

	if (dbName !== expectedDbName) {
		throw new Error(
			`Refusing to run: expected DATABASE_URL db "${expectedDbName}", got "${dbName}". Source the correct slot .env.production on EC2.`,
		);
	}
}

/** Grub Admin PG migration — never write to other product databases on grubpac-v2. */
export const FORBIDDEN_POSTGRES_DATABASES = [
	"delivery_db",
	"medical_db",
	"hospitality_db",
	"kitchen",
	"platform_db",
	"grubfleet_erp_nonprod",
	"grubfleet_erp_preprod",
	"grubfleet_erp_production",
	"rdsadmin",
] as const;

export function assertPostgresTargetDb(
	expectedDbName: string,
	pgUrl: string,
): void {
	const dbName = getDatabaseNameFromUrl(pgUrl);
	console.log(`[db-guard] PG target: ${dbName}`);

	if ((FORBIDDEN_POSTGRES_DATABASES as readonly string[]).includes(dbName)) {
		throw new Error(
			`Refusing to run: Postgres database "${dbName}" is forbidden for Grub Admin migration.`,
		);
	}

	if (dbName !== expectedDbName) {
		throw new Error(
			`Refusing to run: expected Postgres db "${expectedDbName}", got "${dbName}".`,
		);
	}
}

export function assertMysqlSourceDb(
	expectedDbName: string,
	mysqlUrl: string,
): void {
	if (!mysqlUrl.startsWith("mysql://")) {
		throw new Error("Refusing to run: MySQL source URL must start with mysql://");
	}

	const dbName = getDatabaseNameFromUrl(mysqlUrl);
	console.log(`[db-guard] MySQL source: ${dbName}`);

	if (dbName !== expectedDbName) {
		throw new Error(
			`Refusing to run: expected MySQL source db "${expectedDbName}", got "${dbName}".`,
		);
	}
}
