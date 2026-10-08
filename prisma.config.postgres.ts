import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/** Use for `migrate deploy` when DATABASE_URL is PostgreSQL (grubpac-v2). */
export default defineConfig({
	datasource: {
		url: env("DATABASE_URL"),
	},
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations-postgres",
		seed: "bun src/cmd/seed.ts",
	},
});
