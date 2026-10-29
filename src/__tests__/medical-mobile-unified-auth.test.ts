import { describe, expect, test, mock, beforeEach, beforeAll } from "bun:test";
import { Hono } from "hono";
import type { Hono as HonoBase } from "hono";
import { globalErrorHandler } from "@/middlewares/error";
import type { GetUniqueMedicalEmployeeResponse } from "@/db/actions/medical/employee.actions";

type CheckAccountJson = {
	is_account_found?: boolean;
	is_password_set?: boolean;
	persona?: string;
	api_prefix?: string;
	message?: string;
};

type LoginJson = {
	persona?: string;
	api_prefix?: string;
	client_id?: string;
	data?: { auth_token?: string };
};

const getUniqueMedicalEmployee = mock(
	(_args: {
		email?: string;
		phone?: string;
		id?: string;
		employee_display_id?: string;
	}): Promise<GetUniqueMedicalEmployeeResponse> => Promise.resolve(null),
);

mock.module("@/db/actions/medical/employee.actions", () => ({
	getUniqueMedicalEmployee,
}));

mock.module("@/db", () => ({
	prisma: {
		client: {
			findUnique: mock(() => Promise.resolve({ auth_token_version: 0 })),
		},
	},
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

const signMedicalMobileSessionTokens = mock(async () => ({
	auth_token: "auth-token-mock",
	refresh_token: "refresh-token-mock",
}));

mock.module("@/modules/medical-mobile/auth/medical-mobile-session.ts", () => ({
	signMedicalMobileSessionTokens,
	fetchMedicalMobileClientAuthTokenVersion: mock(async () => 0),
	buildMedicalMobileAuthPayload: mock(async (args: unknown) => ({
		...(args as object),
		token_version: 0,
	})),
	invalidateMedicalMobileClientSessions: mock(async () => {}),
	assertMedicalMobileTokenVersion: () => {},
}));

let medicalMobileAuthRouter: HonoBase;

beforeAll(async () => {
	({ medicalMobileAuthRouter } = await import("@/modules/medical-mobile/auth"));
});

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
		expect(routes).toContain("POST /api/v1/medical-mobile/auth/refresh");
	});
});

describe("Medical mobile unified auth — check-account", () => {
	beforeEach(() => {
		getUniqueMedicalEmployee.mockReset();
		getUniqueMedicalEmployee.mockImplementation(() => Promise.resolve(null));
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
		const body = (await res.json()) as CheckAccountJson;
		expect(body.is_account_found).toBe(false);
		expect(body.is_password_set).toBe(false);
		expect(body.persona).toBeUndefined();
		expect(body.api_prefix).toBeUndefined();
	});

	test("owner admin returns persona owner and api_prefix", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "admin",
			employee: { id: "client-1", email: "owner@test.com", password: "hashed" },
		} as GetUniqueMedicalEmployeeResponse);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "owner@test.com" }),
		});

		const body = (await res.json()) as CheckAccountJson;
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
		} as GetUniqueMedicalEmployeeResponse);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "driver@test.com" }),
		});

		const body = (await res.json()) as CheckAccountJson;
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
		} as GetUniqueMedicalEmployeeResponse);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/check-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "mgr@test.com" }),
		});

		const body = (await res.json()) as CheckAccountJson;
		expect(body.is_account_found).toBe(false);
		expect(body.persona).toBeUndefined();
	});
});

describe("Medical mobile unified auth — login", () => {
	beforeEach(() => {
		getUniqueMedicalEmployee.mockReset();
		getUniqueMedicalEmployee.mockImplementation(() => Promise.resolve(null));
		compareHash.mockReset();
		compareHash.mockResolvedValue(true);
		signMedicalMobileSessionTokens.mockClear();
	});

	test("owner login returns tokens, persona, and api_prefix", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "admin",
			employee: { id: "client-1", email: "owner@test.com", password: "hashed" },
		} as GetUniqueMedicalEmployeeResponse);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "owner@test.com", password: "secret123" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as LoginJson;
		expect(body.persona).toBe("owner");
		expect(body.api_prefix).toBe("medical-mobile/owner/");
		expect(body.client_id).toBe("client-1");
		expect(body.data?.auth_token).toBe("auth-token-mock");
		expect(signMedicalMobileSessionTokens).toHaveBeenCalledWith({
			id: "client-1",
			role: "admin",
			persona: "owner",
			client_id: "client-1",
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
		} as GetUniqueMedicalEmployeeResponse);
		const app = createTestApp();

		const res = await app.request("/api/v1/medical-mobile/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "driver@test.com", password: "secret123" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as LoginJson;
		expect(body.persona).toBe("driver");
		expect(body.api_prefix).toBe("medical-mobile/driver/");
		expect(body.client_id).toBe("client-a");
		expect(signMedicalMobileSessionTokens).toHaveBeenCalledWith({
			id: "handler-1",
			role: "handler",
			persona: "driver",
			client_id: "client-a",
		});
	});

	test("wrong password returns 401", async () => {
		getUniqueMedicalEmployee.mockResolvedValue({
			type: "admin",
			employee: { id: "client-1", email: "owner@test.com", password: "hashed" },
		} as GetUniqueMedicalEmployeeResponse);
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
