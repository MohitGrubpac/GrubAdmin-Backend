import { logger } from "@/utils/logger";
import { connectMongoDB, isPostgresDatabaseUrl, prisma } from "@/db";
import mongoose from "mongoose";

const TABLES_IN_DELETE_ORDER = [
  // Junction/child tables first
  "faq_question_category",
  "faq_question",
  "faq_category",
  "vertical_delivery_employee_box",
  "restaurant_box",
  "vertical_delivery_consumer_box",
  "vertical_delivery_consumer",
  "box_telemetry_latest",
  "box_lock",
  "notification",
  "vertical_delivery_employee",
  "box",
  "restaurant",
  "client",
  "vertical_delivery_employee_deleted",
  "restaurant_deleted",
  "box_deleted",
  "client_deleted",
  "admin",
  "admin_dismissed",
  "icon",
  "vertical",
  "role",
  "system_config",
];

export const resetDb = async () => {
  try {
    logger.info("Starting full database reset...");

    const usePostgres = isPostgresDatabaseUrl();
    if (usePostgres) {
      for (const table of TABLES_IN_DELETE_ORDER) {
        logger.info(`  Truncating table: ${table}`);
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
      }
      logger.info("PostgreSQL tables truncated.");
    } else {
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");

      for (const table of TABLES_IN_DELETE_ORDER) {
        logger.info(`  Clearing table: ${table}`);
        await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }

      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");

      logger.info("MySQL tables cleared.");
    }

    // Clear MongoDB collections
    await connectMongoDB();
    const mongoCollections = await mongoose.connection.db!.listCollections().toArray();
    for (const col of mongoCollections) {
      logger.info(`  Clearing MongoDB collection: ${col.name}`);
      await mongoose.connection.db!.dropCollection(col.name);
    }
    logger.info("MongoDB collections cleared.");

    logger.info("Database reset complete. Ready for seeding.");
  } catch (error) {
    if (!isPostgresDatabaseUrl()) {
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    }
    logger.error(`Reset failed: ${error}`);
    process.exit(1);
  }
};

await resetDb();
process.exit(0);
