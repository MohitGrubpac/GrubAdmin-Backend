/**
 * Thin wrapper — prefer:
 *   bun scripts/migrate-admin-mysql-to-postgres.ts --slot staging
 */
process.argv.push("--slot", "staging");
await import("./migrate-admin-mysql-to-postgres.ts");
