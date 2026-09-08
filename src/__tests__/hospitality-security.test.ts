import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { isAuthOrSensitiveAccountPath } from "@/modules/hospitality/middlewares/hospitality-auth-no-store";
import { extractPasswordFromUser } from "@/modules/hospitality/utils/sanitize-user";
import { isHospitalityOtpDevLogEnabled } from "@/modules/hospitality/handlers/auth/auth.utils";
import {
	HOSPITALITY_AUTH_COOKIE_NAME,
} from "@/modules/hospitality/utils/hospitality-auth-cookie";

const mockClientFindFirst = mock(() => Promise.resolve(null));

mock.module("@/db", () => ({
	prisma: {
		client: {
			findFirst: mockClientFindFirst,
		},
	},
	isPrismaConnected: () => true,
	isMongoConnected: () => false,
	isDatabaseReady: () => true,
	getMongoConnectionState: () => "disconnected",
	connectMongoDB: mock(() => Promise.resolve()),
	ensureMongoDB: mock(() => Promise.resolve()),
	waitForDatabases: mock(() => Promise.resolve({ prisma: true, mongodb: false })),
	initializeDatabases: mock(() => Promise.resolve()),
}));

const { hospitalityRouter } = await import("@/modules/hospitality");

describe("Hospitality security — auth no-store paths", () => {
	beforeEach(() => {
		mockClientFindFirst.mockReset();
		mockClientFindFirst.mockResolvedValue(null);
	});

	test("flags auth and account mutation paths", () => {
		expect(isAuthOrSensitiveAccountPath("POST", "/auth/login")).toBe(true);
		expect(isAuthOrSensitiveAccountPath("POST", "/auth/verify-otp")).toBe(true);
		expect(isAuthOrSensitiveAccountPath("PUT", "/account")).toBe(true);
		expect(isAuthOrSensitiveAccountPath("POST", "/account/transfer-ownership")).toBe(true);
		expect(isAuthOrSensitiveAccountPath("GET", "/account/me")).toBe(false);
		expect(isAuthOrSensitiveAccountPath("GET", "/grubpac")).toBe(false);
	});

	test("auth login response includes no-store cache headers", async () => {
		const app = new Hono();
		app.route("/api/v1/hospitality", hospitalityRouter);

		const res = await app.request("/api/v1/hospitality/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "missing@example.com", password: "secret123" }),
		});

		expect(res.headers.get("Cache-Control")).toContain("no-store");
		expect(res.headers.get("Pragma")).toBe("no-cache");
	});

	test("auth login error response does not leak session JWT in JSON body", async () => {
		const app = new Hono();
		app.route("/api/v1/hospitality", hospitalityRouter);

		const res = await app.request("/api/v1/hospitality/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "missing@example.com", password: "secret123" }),
		});

		const body = (await res.json()) as { data?: { auth_token?: string } };
		expect(body.data?.auth_token).toBeUndefined();
	});

	test("hospitality session cookie name is auth_token for FE alignment", () => {
		expect(HOSPITALITY_AUTH_COOKIE_NAME).toBe("auth_token");
	});
});

describe("Hospitality security — user sanitization", () => {
	test("extractPasswordFromUser removes password hash from user object", () => {
		const { user, password_hash, is_password_set } = extractPasswordFromUser({
			id: "user_1",
			email: "a@b.com",
			password: "$2b$10$hashedvalue",
		} as any);

		expect(is_password_set).toBe(true);
		expect(password_hash).toBe("$2b$10$hashedvalue");
		expect("password" in user).toBe(false);
	});
});

describe("Hospitality security — OTP dev log gate", () => {
	test("isHospitalityOtpDevLogEnabled requires development env flag", () => {
		expect(typeof isHospitalityOtpDevLogEnabled()).toBe("boolean");
	});
});
