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
