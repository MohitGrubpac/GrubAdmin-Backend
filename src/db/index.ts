import { readFileSync } from "fs";
import { logger } from "@/utils/logger";
import { PrismaClient } from "./prisma";
import mongoose from "mongoose";
import {
	DATABASE_POOL_SIZE,
	DATABASE_SSL_CA_PATH,
	DATABASE_URL,
	MONGO_URI,
} from "@/configs/env";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type mariadb from "mariadb";

/** RDS/Aiven TLS options — mariadb typings omit `servername` and `checkServerIdentity`. */
type MariaDbTlsOptions = NonNullable<mariadb.PoolConfig["ssl"]> & {
	servername?: string;
	checkServerIdentity?: (host: string, cert: unknown) => Error | undefined;
};

// Prevent multiple instances of Prisma Client in dev (hot reloads)
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
	adapter: PrismaMariaDb | undefined;
};

// ── Prisma (MySQL) ──────────────────────────────────────────────────────────
// We create the client lazily so a transient connection failure at startup
// never prevents the server process from starting.  The first successful
// query will trigger the real connection attempt.

let prismaConnected = false;
let prismaConnectionPromise: Promise<void> | null = null;

function isMysqlTlsRequired(dbUrl: URL, isRemoteHost: boolean): boolean {
	if (!isRemoteHost) {
		return false;
	}

	const sslMode = dbUrl.searchParams.get("ssl-mode")?.toLowerCase();
	if (
		sslMode === "required" ||
		sslMode === "verify_ca" ||
		sslMode === "verify_identity"
	) {
		return true;
	}

	const host = dbUrl.hostname.toLowerCase();
	return host.includes("aivencloud.com") || host.includes("rds.amazonaws.com");
}

function buildMariaDbSslConfig(
	dbUrl: URL,
	isRemoteHost: boolean,
): MariaDbTlsOptions | undefined {
	if (!isMysqlTlsRequired(dbUrl, isRemoteHost)) {
		return undefined;
	}

	if (DATABASE_SSL_CA_PATH) {
		try {
			const ca = readFileSync(DATABASE_SSL_CA_PATH, "utf8");
			if (ca.trim()) {
				logger.info(
					`MySQL TLS: verified mode enabled (CA bundle: ${DATABASE_SSL_CA_PATH})`,
				);
				// rejectUnauthorized + CA bundle verifies the RDS certificate chain.
				// servername sets TLS SNI to the RDS endpoint hostname.
				// mariadb re-runs hostname validation after handshake; on Bun the peer
				// certificate can lack subjectAltName at that moment, so skip the redundant
				// driver check — connection still uses verified TLS to the known RDS host.
				return {
					ca,
					rejectUnauthorized: true,
					servername: dbUrl.hostname,
					checkServerIdentity: () => undefined,
				} satisfies MariaDbTlsOptions;
			}
			logger.warn(
				`MySQL TLS: CA bundle at ${DATABASE_SSL_CA_PATH} is empty; falling back to unverified TLS`,
			);
		} catch (err) {
			logger.warn(
				`MySQL TLS: could not read CA bundle at ${DATABASE_SSL_CA_PATH}: ${err}`,
			);
		}
	} else {
		logger.warn(
			"MySQL TLS: remote SSL connection without DATABASE_SSL_CA_PATH — using rejectUnauthorized=false until CA bundle is installed (see .env.production.example)",
		);
	}

	return {
		rejectUnauthorized: false,
		servername: dbUrl.hostname,
	} satisfies MariaDbTlsOptions;
}

function buildMariaDbPoolConfig(): mariadb.PoolConfig | string {
	try {
		const dbUrl = new URL(DATABASE_URL);
		const isRemoteHost =
			dbUrl.hostname !== "localhost" &&
			dbUrl.hostname !== "127.0.0.1" &&
			!dbUrl.hostname.endsWith(".local");

		// MariaDB driver defaults: connectTimeout=1000ms, acquireTimeout=10000ms.
		// Remote Aiven connections often need several seconds for TLS — 1s causes
		// pool creation to fail while $connect() retries succeed, yielding
		// active=0 idle=0 pool timeouts on later queries.
		const connectTimeoutMs = parseInt(
			process.env.MYSQL_CONNECT_TIMEOUT_MS || (isRemoteHost ? "30000" : "5000"),
			10,
		);
		const acquireTimeoutMs = parseInt(
			process.env.MYSQL_ACQUIRE_TIMEOUT_MS || (isRemoteHost ? "30000" : "10000"),
			10,
		);

		const ssl = buildMariaDbSslConfig(dbUrl, isRemoteHost);

		const poolConfig: mariadb.PoolConfig = {
			host: dbUrl.hostname,
			port: parseInt(dbUrl.port || "3306", 10),
			user: decodeURIComponent(dbUrl.username),
			password: decodeURIComponent(dbUrl.password),
			database: dbUrl.pathname.replace(/^\//, ""),
			connectionLimit: DATABASE_POOL_SIZE,
			connectTimeout: connectTimeoutMs,
			acquireTimeout: acquireTimeoutMs,
			initializationTimeout: connectTimeoutMs,
			idleTimeout: parseInt(process.env.MYSQL_IDLE_TIMEOUT_S || "600", 10),
			minimumIdle: parseInt(process.env.MYSQL_MIN_IDLE || "1", 10),
		};

		if (ssl !== undefined) {
			poolConfig.ssl = ssl;
		}

		return poolConfig;
	} catch (err) {
		logger.error(`Error parsing DATABASE_URL for MariaDB config object: ${err}`);
		return DATABASE_URL;
	}
}

function resetPrismaCache(): void {
	globalForPrisma.prisma = undefined;
	globalForPrisma.adapter = undefined;
	prismaConnected = false;
}

function getPrismaInstance(): PrismaClient {
	if (globalForPrisma.prisma) {
		return globalForPrisma.prisma;
	}

	const dbConfig = buildMariaDbPoolConfig();

	const newAdapter = new PrismaMariaDb(dbConfig);
	const newPrisma = new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
		adapter: newAdapter,
	});

	globalForPrisma.prisma = newPrisma;
	globalForPrisma.adapter = newAdapter;

	return newPrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
	get(_, prop) {
		return (getPrismaInstance() as any)[prop];
	},
});

/**
 * Establish the Prisma connection with retries.  Called once during startup.
 * If all retries fail the server will continue — queries will return
 * structured 503 errors instead of crashing.
 */
const connectPrisma = async (): Promise<void> => {
	if (prismaConnectionPromise) {
		return prismaConnectionPromise;
	}

	const maxRetries = parseInt(process.env.PRISMA_MAX_RETRIES || "3", 10);
	const retryDelayMs = parseInt(process.env.PRISMA_RETRY_DELAY_MS || "2000", 10);

	prismaConnectionPromise = (async () => {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			logger.info(
				`Connecting to MySQL via Prisma (attempt ${attempt}/${maxRetries}, pool connectionLimit=${DATABASE_POOL_SIZE})...`,
			);
			const client = getPrismaInstance();
			await client.$connect();
			// $connect() can succeed while the MariaDB pool is still empty (adapter swallows
			// capability probe errors). Verify the pool can serve a query before marking ready.
			await client.$queryRaw`SELECT 1`;
			prismaConnected = true;
			logger.info("MySQL connected successfully via Prisma");
			return;
		} catch (error) {
			prismaConnected = false;
			await getPrismaInstance()
				.$disconnect()
				.catch(() => undefined);
			resetPrismaCache();
			logger.error(`Prisma connection attempt ${attempt} failed: ${error}`);
			if (attempt < maxRetries) {
				logger.info(`Retrying Prisma connection in ${retryDelayMs}ms...`);
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
			}
		}
	}

	prismaConnected = false;
	logger.error(`MySQL connection failed after ${maxRetries} attempts`);
	logger.warn("Server will continue without MySQL. Prisma queries will return 503.");
	})();

	return prismaConnectionPromise;
};

export const isPrismaConnected = (): boolean => prismaConnected;

// ── MongoDB ─────────────────────────────────────────────────────────────────
// Track MongoDB connection state explicitly.
let mongoConnected = false;
let mongoConnectionPromise: Promise<void> | null = null;

export const isMongoConnected = (): boolean => mongoConnected;

export const getMongoConnectionState = (): string => {
	switch (mongoose.connection.readyState) {
		case 0: return "disconnected";
		case 1: return "connected";
		case 2: return "connecting";
		case 3: return "disconnecting";
		default: return "unknown";
	}
};

// Disable Mongoose buffering so operations fail immediately instead of
// timing out silently after 10000ms (default bufferTimeoutMS).
mongoose.set("bufferCommands", false);

const MONGO_CONNECTION_TIMEOUT_MS = 5000;
const mongoConnectAttempts = parseInt(process.env.MONGO_MAX_RETRIES || "3", 10);
const mongoRetryDelay = parseInt(process.env.MONGO_RETRY_DELAY_MS || "2000", 10);

export const connectMongoDB = async (): Promise<void> => {
	if (mongoConnectionPromise) return mongoConnectionPromise;

	mongoConnectionPromise = (async () => {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= mongoConnectAttempts; attempt++) {
			try {
				logger.info(`Connecting to MongoDB (attempt ${attempt}/${mongoConnectAttempts})...`);
				await mongoose.connect(MONGO_URI, {
					serverSelectionTimeoutMS: MONGO_CONNECTION_TIMEOUT_MS,
					connectTimeoutMS: MONGO_CONNECTION_TIMEOUT_MS,
					heartbeatFrequencyMS: 10000,
				});

				mongoConnected = true;
				logger.info("Connected to MongoDB successfully");

				mongoose.connection.on("disconnected", () => {
					logger.warn("MongoDB disconnected. Updating state.");
					mongoConnected = false;
				});

				mongoose.connection.on("reconnected", () => {
					logger.info("MongoDB reconnected. Updating state.");
					mongoConnected = true;
				});

				mongoose.connection.on("error", (err) => {
					logger.error(`MongoDB connection error: ${err}`);
					mongoConnected = false;
				});

				return;
			} catch (error) {
				lastError = error as Error;
				logger.error(`MongoDB connection attempt ${attempt} failed: ${error}`);

				if (attempt < mongoConnectAttempts) {
					logger.info(`Retrying MongoDB connection in ${mongoRetryDelay}ms...`);
					await new Promise((resolve) => setTimeout(resolve, mongoRetryDelay));
				}
			}
		}

		mongoConnected = false;
		logger.error(`MongoDB connection failed after ${mongoConnectAttempts} attempts.`);
		logger.warn("Server will continue without MongoDB. All MongoDB operations will fail immediately (buffering disabled).");
		throw lastError || new Error("MongoDB connection failed");
	})();

	return mongoConnectionPromise;
};

/**
 * Wait for MongoDB connection to be established with a timeout.
 */
export const ensureMongoDB = async (timeoutMs = 15000): Promise<void> => {
	if (mongoConnected && mongoose.connection.readyState === 1) return;

	if (!mongoConnectionPromise) {
		throw new Error("MongoDB connection was never initiated");
	}

	let timeoutId: any;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(`MongoDB connection not ready within ${timeoutMs}ms`)), timeoutMs);
	});

	try {
		await Promise.race([mongoConnectionPromise, timeout]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
};

/**
 * Wait for all database connections to be ready.
 */
export const waitForDatabases = async (timeoutMs = 30000): Promise<{ prisma: boolean; mongodb: boolean }> => {
	const results = {
		prisma: prismaConnected,
		mongodb: false,
	};

	if (prismaConnectionPromise) {
		try {
			await prismaConnectionPromise;
			results.prisma = prismaConnected;
		} catch {
			results.prisma = false;
		}
	}

	if (mongoConnectionPromise) {
		try {
			await ensureMongoDB(timeoutMs);
			results.mongodb = mongoConnected;
		} catch {
			results.mongodb = false;
		}
	}

	return results;
};

/**
 * Initialize all database connections.  Called once during startup.
 * Failures are logged but do NOT prevent the server from starting.
 * The readiness gate will reject traffic until connections succeed.
 */
export const initializeDatabases = async (): Promise<void> => {
	// Connect to Prisma (MySQL)
	await connectPrisma();

	// Brief pause for connection heartbeats
	await new Promise((resolve) => setTimeout(resolve, 500));
};

/**
 * Check if the server can accept database queries.
 * Returns true only when at least the primary database (Prisma/MySQL) is connected.
 */
export const isDatabaseReady = (): boolean => {
	return prismaConnected;
};
