import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { Prisma } from "@/db/prisma";
import { logger } from "@/utils/logger";
import {
	GENERIC_SERVER_ERROR_MESSAGE,
	GENERIC_UNAVAILABLE_MESSAGE,
	globalErrorHandler,
	sanitizeClientErrorPayload,
} from "@/middlewares/error";
import { hospitalityErrorHandler } from "@/modules/hospitality/middlewares/hospitality-error-handler";

describe("global error handler — sanitizeClientErrorPayload", () => {
	let priorNodeEnv: string | undefined;

	beforeEach(() => {
		priorNodeEnv = process.env.NODE_ENV;
	});

	afterEach(() => {
		if (priorNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = priorNodeEnv;
		}
	});

	test("development preserves prisma diagnostics on 500", () => {
		process.env.NODE_ENV = "development";
		const body = {
			success: false,
			error: "Database error. Please try again.",
			code: 500,
			root_cause: "prisma_known_error",
			prisma_code: "P9999",
			prisma_meta: { modelName: "Box" },
		};

		const out = sanitizeClientErrorPayload(body, 500);
		expect(out.prisma_code).toBe("P9999");
		expect(out.prisma_meta).toEqual({ modelName: "Box" });
		expect(out.root_cause).toBe("prisma_known_error");
	});

	test("production strips prisma diagnostics and genericizes 500", () => {
		process.env.NODE_ENV = "production";
		const body = {
			success: false,
			error: "Database error. Please try again.",
			code: 500,
			request_id: "req-1",
			root_cause: "prisma_known_error",
			prisma_code: "P9999",
			prisma_meta: { modelName: "Box" },
		};

		const out = sanitizeClientErrorPayload(body, 500);
		expect(out.error).toBe(GENERIC_SERVER_ERROR_MESSAGE);
		expect(out.request_id).toBe("req-1");
		expect(out.prisma_code).toBeUndefined();
		expect(out.prisma_meta).toBeUndefined();
		expect(out.root_cause).toBeUndefined();
	});

	test("production keeps ops root_cause for mysql pool timeout", () => {
		process.env.NODE_ENV = "production";
		const body = {
			success: false,
			error: GENERIC_UNAVAILABLE_MESSAGE,
			code: 503,
			root_cause: "mysql_pool_timeout",
			request_id: "req-pool",
		};

		const out = sanitizeClientErrorPayload(body, 503);
		expect(out.root_cause).toBe("mysql_pool_timeout");
		expect(out.error).toBe(GENERIC_UNAVAILABLE_MESSAGE);
	});

	test("production leaves 4xx validation payloads intact", () => {
		process.env.NODE_ENV = "production";
		const body = {
			success: false,
			error: "Email is required",
			code: 400,
			root_cause: "validation_error",
		};

		const out = sanitizeClientErrorPayload(body, 400);
		expect(out.error).toBe("Email is required");
		expect(out.root_cause).toBe("validation_error");
	});
});

describe("global error handler — integration", () => {
	let priorNodeEnv: string | undefined;
	let priorLoggerSilent: boolean;

	beforeEach(() => {
		priorNodeEnv = process.env.NODE_ENV;
		priorLoggerSilent = logger.silent;
		logger.silent = true;
	});

	afterEach(() => {
		logger.silent = priorLoggerSilent;
		if (priorNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = priorNodeEnv;
		}
	});

	test("production hides unhandled prisma 500 details", async () => {
		process.env.NODE_ENV = "production";
		const app = new Hono();
		app.onError(globalErrorHandler);
		app.get("/fail", () => {
			throw new Prisma.PrismaClientKnownRequestError("SELECT * FROM secret_table", {
				code: "P9999",
				clientVersion: "test",
			});
		});

		const res = await app.request("/fail");
		expect(res.status).toBe(500);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.error).toBe(GENERIC_SERVER_ERROR_MESSAGE);
		expect(body.prisma_code).toBeUndefined();
		expect(body.prisma_meta).toBeUndefined();
		expect(body.root_cause).toBeUndefined();
	});

	test("development exposes unhandled prisma 500 details", async () => {
		process.env.NODE_ENV = "development";
		const app = new Hono();
		app.onError(globalErrorHandler);
		app.get("/fail", () => {
			throw new Prisma.PrismaClientKnownRequestError("SELECT * FROM secret_table", {
				code: "P9999",
				clientVersion: "test",
			});
		});

		const res = await app.request("/fail");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.prisma_code).toBe("P9999");
		expect(body.root_cause).toBe("prisma_known_error");
	});

	test("production maps mysql pool timeout with ops root_cause", async () => {
		process.env.NODE_ENV = "production";
		const app = new Hono();
		app.onError(globalErrorHandler);
		app.get("/fail", () => {
			throw new Error("pool timeout: failed to retrieve a connection from pool");
		});

		const res = await app.request("/fail");
		expect(res.status).toBe(503);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.error).toBe(GENERIC_UNAVAILABLE_MESSAGE);
		expect(body.root_cause).toBe("mysql_pool_timeout");
		expect(String(body.error)).not.toContain("pool timeout");
	});

	test("production maps ECONNREFUSED to mysql_pool_timeout ops root_cause", async () => {
		process.env.NODE_ENV = "production";
		const app = new Hono();
		app.onError(globalErrorHandler);
		app.get("/fail", () => {
			throw new Error("connect ECONNREFUSED 127.0.0.1:3306");
		});

		const res = await app.request("/fail");
		expect(res.status).toBe(503);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.root_cause).toBe("mysql_pool_timeout");
		expect(body.error).toBe(GENERIC_UNAVAILABLE_MESSAGE);
		expect(String(body.error)).not.toContain("ECONNREFUSED");
	});
});

describe("hospitality error handler — 5xx wrapper", () => {
	let priorLoggerSilent: boolean;

	beforeEach(() => {
		priorLoggerSilent = logger.silent;
		logger.silent = true;
	});

	afterEach(() => {
		logger.silent = priorLoggerSilent;
	});

	test("strips root_cause from hospitality 503 even when shared handler keeps ops code", async () => {
		process.env.NODE_ENV = "production";
		const app = new Hono();
		app.onError(hospitalityErrorHandler);
		app.get("/fail", () => {
			throw new Error("pool timeout: failed to retrieve a connection from pool");
		});

		const res = await app.request("/fail");
		expect(res.status).toBe(503);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.error).toBe(GENERIC_SERVER_ERROR_MESSAGE);
		expect(body.root_cause).toBeUndefined();
		expect(body.code).toBe(503);
	});
});
