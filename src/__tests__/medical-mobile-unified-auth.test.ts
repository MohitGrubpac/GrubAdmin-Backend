import { describe, expect, test, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import { medicalMobileAuthRouter } from "@/modules/medical-mobile/auth";
import { globalErrorHandler } from "@/middlewares/error";

const getUniqueMedicalEmployee = mock(() => Promise.resolve(null));

mock.module("@/db/actions/medical/employee.actions", () => ({
	getUniqueMedicalEmployee,
}));

const sendOtpToOwner = mock(() => Promise.resolve({ otp: "1234", email: "owner@test.com" }));
const sendOtpToHandler = mock(() => Promise.resolve({ otp: "1234", email: "driver@test.com" }));

mock.module("@/modules/medical-mobile/owner/handlers/auth/auth.utils.ts", () => ({
	assertOwnerAdmin: (employee: unknown) => {
		if (!employee) throw new Error("No employee");
	},
	sendOtpToOwner,
	getOwnerClientId: (employee: { employee: { id: string } }) => employee.employee.id,
	getOwnerDisplayName: () => "Owner",
}));

mock.module("@/modules/medical-mobile/driver/handlers/auth/auth.utils.ts", () => ({
	assertHandlerEmployee: (employee: unknown) => {
		if (!employee) throw new Error("No employee");
	},
	sendOtpToHandler,
	getHandlerClientId: (employee: { employee: { client_id: string } }) =>
		employee.employee.client_id,
}));

const compareHash = mock(() => Promise.resolve(true));
mock.module("@/utils/bcrypt.ts", () => ({
	Bcrypt: { compareHash },
}));

const signMedicalMobileAuthToken = mock(() => "auth-token-mock");
const signMedicalMobileRefreshToken = mock(() => "refresh-token-mock");
mock.module("@/utils/jwt.ts", () => ({
	JWT: {
		signMedicalMobileAuthToken,
		signMedicalMobileRefreshToken,
	},
}));

function createTestApp() {
	const app = new Hono();
	app.onError(globalErrorHandler);
	app.route("/api/v1/medical-mobile", medicalMobileAuthRouter);
	return app;
}

describe("Medical mobile unified auth route registration", () => {
	test("registers check-account, login, and health", () => {
		const app = createTestApp();
		const routes = app.routes.map((r) => `${r.method} ${r.path}`);

		expect(routes).toContain("GET /api/v1/medical-mobile/health");
		expect(routes).toContain("POST /api/v1/medical-mobile/auth/check-account");
		expect(routes).toContain("POST /api/v1/medical-mobile/auth/login");
	});
});

describe("Medical mobile unified auth — check-account", () => {
	beforeEach(() => {
		getUniqueMedicalEmployee.mockReset();
		sendOtpToOwner.mockClear();
		sendOtpToHandler.mockClear();
	});

	test("unknown email returns not found without persona", async () => {
		getUniqueMedicalEmployee.mockResolvedValue(null);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "missing@test.com" }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.is_account_found).toBe(false);
		expect(body.is_password_set).toBe(false);
		expect(body.persona).toBeUndefined();
		expect(body.api_prefix).toBeUndefined();
	});

	test("owner admin returns persona owner and api_prefix", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "admin",
			employee: { id: "client-1", email: "owner@test.com", password: "hashed" },
		});
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "owner@test.com" }),
		});

		const body = await res.json();
		expect(body.is_account_found).toBe(true);
		expect(body.is_password_set).toBe(true);
		expect(body.persona).toBe("owner");
		expect(body.api_prefix).toBe("medical-mobile/owner/");
	});

	test("handler returns persona driver", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "handler",
			employee: {
				id: "handler-1",
				client_id: "client-1",
				email: "driver@test.com",
				password: null,
			},
		});
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "driver@test.com" }),
		});

		const body = await res.json();
		expect(body.is_account_found).toBe(true);
		expect(body.is_password_set).toBe(false);
		expect(body.persona).toBe("driver");
		expect(body.api_prefix).toBe("medical-mobile/driver/");
		expect(body.message).toBe("OTP sent successfully.");
		expect(sendOtpToHandler).toHaveBeenCalled();
	});

	test("medical manager role is not a mobile persona", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "manager",
			employee: { id: "mgr-1", email: "mgr@test.com", password: "hashed" },
		});
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "mgr@test.com" }),
		});

		const body = await res.json();
		expect(body.is_account_found).toBe(false);
		expect(body.persona).toBeUndefined();
	});
});

describe("Medical mobile unified auth — login", () => {
	beforeEach(() => {
		getUniqueMedicalEmployee.mockReset();
		compareHash.mockReset();
		compareHash.mockResolvedValue(true);
		signMedicalMobileAuthToken.mockClear();
	});

	test("owner login returns tokens, persona, and api_prefix", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "admin",
			employee: { id: "client-1", email: "owner@test.com", password: "hashed" },
		});
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "owner@test.com", password: "secret123" }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.persona).toBe("owner");
		expect(body.api_prefix).toBe("medical-mobile/owner/");
		expect(body.client_id).toBe("client-1");
		expect(body.data.auth_token).toBe("auth-token-mock");
		expect(signMedicalMobileAuthToken).toHaveBeenCalledWith({
			id: "client-1",
			role: "admin",
			persona: "owner",
		});
	});

	test("driver login returns driver persona tokens", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "handler",
			employee: {
				id: "handler-1",
				client_id: "client-a",
				email: "driver@test.com",
				password: "hashed",
			},
		});
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "driver@test.com", password: "secret123" }),
		});

		const body = await res.json();
		expect(body.persona).toBe("driver");
		expect(body.api_prefix).toBe("medical-mobile/driver/");
		expect(body.client_id).toBe("client-a");
		expect(signMedicalMobileAuthToken).toHaveBeenCalledWith({
			id: "handler-1",
			role: "handler",
			persona: "driver",
		});
	});

	test("wrong password returns 401", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "admin",
			employee: { id: "client-1", email: "owner@test.com", password: "hashed" },
		});
		compareHash.mockResolvedValue(false);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "owner@test.com", password: "wrongpass" }),
		});

		expect(res.status).toBe(401);
	});

	test("missing account returns 400", async () => {
		getUniqueMedicalEmployee.mockResolvedValue(null);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "missing@test.com", password: "secret123" }),
		});

		expect(res.status).toBe(400);
	});
});
