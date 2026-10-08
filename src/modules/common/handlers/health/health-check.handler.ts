import type { APIResponse } from "@/types/api/api-response";
import { createHandlers } from "@/utils/hono-factory";
import {
	prisma,
	isMongoConnected,
	getMongoConnectionState,
	isPrismaConnected,
	isPostgresDatabaseUrl,
} from "@/db";
import { DATABASE_URL } from "@/configs/env";
import mongoose from "mongoose";
import { NODE_ENV } from "@/configs/env";
import { logger } from "@/utils/logger";

interface HealthCheckData {
	sql?: {
		user: string;
		database: string;
		host: string;
		connected: boolean;
	};
	mongodb?: {
		user: string;
		database: string;
		host: string;
		state: string;
		connected: boolean;
	};
}

// Liveness check — is the server process alive?
export const livenessHandler = createHandlers(async (context) => {
	return context.json<APIResponse<null>>(
		{
			success: true,
			code: 200,
			message: "alive",
			data: null,
		},
		{
			status: 200,
		},
	);
});

// Readiness check — are dependencies ready to serve requests?
export const readinessHandler = createHandlers(async (context) => {
	const errors: string[] = [];
	const warnings: string[] = [];

	const sqlLabel = isPostgresDatabaseUrl() ? "postgres" : "mysql";

	if (!isPrismaConnected()) {
		errors.push(`${sqlLabel}: not connected (Prisma initialization failed)`);
	} else {
		try {
			await prisma.$queryRaw`SELECT 1`;
		} catch (e) {
			errors.push(`${sqlLabel}: query failed — ${e}`);
		}
	}

	// Check MongoDB connectivity
	const mongoState = getMongoConnectionState();
	if (mongoState !== "connected" && mongoState !== "connecting") {
		// MongoDB may be intentionally offline — warn but don't fail readiness
		// unless the app explicitly requires it.
		warnings.push(`mongodb: ${mongoState}`);
	}

	if (errors.length === 0) {
		return context.json<APIResponse<{ healthy: boolean; warnings?: string[] }>>(
			{
				success: true,
				code: 200,
				message: "ready",
				data: {
					healthy: true,
					...(warnings.length > 0 ? { warnings } : {}),
				},
			},
			{ status: 200 },
		);
	}

	return context.json(
		{
			success: false as const,
			code: 503,
			error: `not ready: ${errors.join("; ")}`,
		},
		{ status: 503 },
	);
});

// Full health check (detailed, for debugging)
export const healthCheckHandler = createHandlers(async (context) => {
	let sqlInfo = { user: "unknown", database: "unknown", host: "unknown", connected: false };
	let mongoInfo = { user: "unknown", database: "unknown", host: "unknown", state: "unknown", connected: false };

	try {
		if (isPrismaConnected()) {
			const sqlRes: any[] = isPostgresDatabaseUrl(DATABASE_URL)
				? await prisma.$queryRaw`
					SELECT
						current_user AS user,
						current_database() AS db,
						COALESCE(inet_server_addr()::text, 'local') AS host
				`
				: await prisma.$queryRaw`SELECT USER() as user, DATABASE() as db, @@hostname as host`;
			if (sqlRes.length > 0) {
				sqlInfo = {
					user: sqlRes[0].user,
					database: sqlRes[0].db,
					host: sqlRes[0].host,
					connected: true,
				};
			}
		} else {
			sqlInfo.connected = false;
		}
	} catch (e) {
		logger.error("SQL Health check failed", e);
	}

	try {
		const state = getMongoConnectionState();
		mongoInfo = {
			user: mongoose.connection.user || "admin",
			database: mongoose.connection.name || "unknown",
			host: mongoose.connection.host || "unknown",
			state,
			connected: state === "connected",
		};
	} catch (e) {
		logger.error("Mongo Health check failed", e);
	}

	const data: HealthCheckData = {};
	if (NODE_ENV !== "production") {
		data.sql = sqlInfo;
		data.mongodb = mongoInfo;
	}

	return context.json<APIResponse<HealthCheckData>>(
		{
			success: true,
			code: 200,
			message: "The grubpac APIs are working!",
			data,
		},
		{
			status: 200,
		},
	);
});
