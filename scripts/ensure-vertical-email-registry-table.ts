/**
 * Creates vertical_email_registry if missing (manual migration not in prisma/migrations yet).
 * Safe on empty preprod; idempotent CREATE TABLE IF NOT EXISTS.
 */
import { prisma, isPostgresDatabaseUrl } from "@/db";
import { getDatabaseNameFromUrl } from "./lib/assert-target-db";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`vertical_email_registry\` (
  \`id\` VARCHAR(26) NOT NULL,
  \`vertical_id\` VARCHAR(26) NOT NULL,
  \`email\` VARCHAR(191) NOT NULL,
  \`owner_type\` ENUM('client', 'delivery_employee', 'medical_employee', 'hospitality_employee') NOT NULL,
  \`owner_id\` VARCHAR(26) NOT NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`vertical_email_registry_vertical_id_email_key\` (\`vertical_id\`, \`email\`),
  UNIQUE KEY \`vertical_email_registry_owner_type_owner_id_key\` (\`owner_type\`, \`owner_id\`),
  KEY \`vertical_email_registry_email_idx\` (\`email\`),
  CONSTRAINT \`vertical_email_registry_vertical_id_fkey\`
    FOREIGN KEY (\`vertical_id\`) REFERENCES \`vertical\`(\`id\`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`;

async function main() {
	const dbUrl = process.env.DATABASE_URL ?? "";
	const dbName = getDatabaseNameFromUrl(dbUrl);

	if (isPostgresDatabaseUrl(dbUrl)) {
		console.log(
			"[ensure-vertical-email-registry] PostgreSQL — table is managed by Prisma baseline/migrations; skipping MySQL DDL.",
		);
		return;
	}

	if (dbName !== "grub_preprod" && dbName !== "grub_prod") {
		throw new Error(`Refusing: unexpected db "${dbName}" (grub_preprod or grub_prod only).`);
	}
	console.log(`[ensure-vertical-email-registry] DATABASE: ${dbName}`);
	await prisma.$executeRawUnsafe(CREATE_TABLE_SQL);
	console.log("[ensure-vertical-email-registry] Table ready.");
}

main()
	.catch((err) => {
		console.error("[ensure-vertical-email-registry] FAILED:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
