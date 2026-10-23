import { describe, expect, test, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import { medicalMobileOwnerRouter } from "@/modules/medical-mobile/owner";
import { medicalMobileDriverRouter } from "@/modules/medical-mobile/driver";
import { deliveryMobileRouter } from "@/modules/delivery-mobile";
import { APIError } from "@/types/error";

function getRoutePaths(basePath: string, router: Hono): string[] {
	const app = new Hono();
	app.route(basePath, router);
	return app.routes.map((route) => `${route.method} ${route.path}`);
}

/** Figma proposed /api/v1/medical-mobile owner routes */
const FIGMA_OWNER_ROUTES = [
	"POST /api/v1/medical-mobile/owner/auth/send-otp",
	"POST /api/v1/medical-mobile/owner/auth/verify-otp",
	"POST /api/v1/medical-mobile/owner/auth/resend-otp",
	"POST /api/v1/medical-mobile/owner/auth/set-password",
	"POST /api/v1/medical-mobile/owner/auth/logout",
	"POST /api/v1/medical-mobile/owner/auth/refresh",
	"GET /api/v1/medical-mobile/owner/account/me",
	"PUT /api/v1/medical-mobile/owner/account",
	"PUT /api/v1/medical-mobile/owner/account/password",
	"DELETE /api/v1/medical-mobile/owner/account",
	"GET /api/v1/medical-mobile/owner/dashboard",
	"GET /api/v1/medical-mobile/owner/boxes",
	"GET /api/v1/medical-mobile/owner/boxes/:box_id",
	"POST /api/v1/medical-mobile/owner/boxes/:box_id/connection",
	"DELETE /api/v1/medical-mobile/owner/boxes/:box_id/connection",
	"POST /api/v1/medical-mobile/owner/boxes/claim",
	"PATCH /api/v1/medical-mobile/owner/boxes/:box_id/settings",
	"GET /api/v1/medical-mobile/owner/boxes/:box_id/location",
	"POST /api/v1/medical-mobile/owner/boxes/:box_id/location/share",
	"GET /api/v1/medical-mobile/owner/boxes/:box_id/diagnostics",
	"GET /api/v1/medical-mobile/owner/boxes/:box_id/alerts",
	"GET /api/v1/medical-mobile/owner/emergency/call-metadata",
	"PATCH /api/v1/medical-mobile/owner/grublock/lock",
	"PATCH /api/v1/medical-mobile/owner/grublock/emergency_unlock",
	"GET /api/v1/medical-mobile/owner/notification",
	"PATCH /api/v1/medical-mobile/owner/notification",
	"GET /api/v1/medical-mobile/owner/support/category",
	"GET /api/v1/medical-mobile/owner/support/faq",
	"GET /api/v1/medical-mobile/owner/support/answer",
	"GET /api/v1/medical-mobile/owner/config",
];

describe("Medical mobile owner contract (Figma Backend API Requirements)", () => {
	test("mounts owner-scoped routes including claim and emergency unlock", () => {
		const routes = getRoutePaths("/api/v1/medical-mobile/owner", medicalMobileOwnerRouter);

		for (const route of FIGMA_OWNER_ROUTES) {
			expect(routes).toContain(route);
		}
		expect(routes).toContain("GET /api/v1/medical-mobile/owner/health");
	});

	test("does not mount driver QR register or OTP unlock paths", () => {
		const routes = getRoutePaths("/api/v1/medical-mobile/owner", medicalMobileOwnerRouter);

		expect(routes.some((r) => r === "POST /api/v1/medical-mobile/owner/boxes")).toBe(false);
		expect(routes.some((r) => r.includes("/lock/otp"))).toBe(false);
		expect(routes.some((r) => r.includes("/lock/verify"))).toBe(false);
	});

	test("does not mount delivery-manager BLOCKED routes", () => {
		const routes = getRoutePaths("/api/v1/medical-mobile/owner", medicalMobileOwnerRouter);

		expect(routes.some((r) => r.includes("/restaurant"))).toBe(false);
		expect(routes.some((r) => r.includes("/employee"))).toBe(false);
		expect(routes.some((r) => r.includes("transfer-ownership"))).toBe(false);
	});

	test("owner and driver both expose emergency alert for facility SOS", () => {
		const ownerRoutes = getRoutePaths("/api/v1/medical-mobile/owner", medicalMobileOwnerRouter);
		const driverRoutes = getRoutePaths("/api/v1/medical-mobile/driver", medicalMobileDriverRouter);

		expect(ownerRoutes.some((r) => r.includes("/emergency/alert"))).toBe(true);
		expect(driverRoutes).toContain("POST /api/v1/medical-mobile/driver/emergency/alert");
	});
});

const mockPrisma = {
	vertical_medical_employee_box: {
		findFirst: mock(() => Promise.resolve(null)),
		findMany: mock(() => Promise.resolve([])),
	},
	client: {
		findUnique: mock(() =>
			Promise.resolve({
				organization_name: "City Hospital",
				name: "City Hospital",
				state: "Delhi",
				country: "India",
			}),
		),
	},
	box: {
		findFirst: mock(() => Promise.resolve(null)),
	},
};

mock.module("@/db", () => ({
	prisma: mockPrisma,
	isMongoConnected: () => true,
	getMongoConnectionState: () => "connected",
}));

const { resolveOwnerBoxById, toOwnerDashboardBoxCard } = await import(
	"@/db/actions/medical-mobile/owner-box.actions.ts"
);
const { getOwnerDashboard } = await import(
	"@/db/actions/medical-mobile/owner-dashboard.actions.ts"
);

describe("Medical mobile owner response shape contracts", () => {
	test("dashboard box cards expose connection_status and grublock_status", () => {
		const card = toOwnerDashboardBoxCard({
			id: "box-1",
			box_display_id: "BOX-1245",
			name: "Test Box",
			medical_connection_employee_id: null,
			telemetry: { connection_status: "connected" } as never,
			lock: { lock_status: "locked" },
		});

		expect(Object.keys(card).sort()).toEqual(
			["connection_status", "display_id", "grublock_status", "id"].sort(),
		);
	});

	test("owner dashboard data includes Figma-required keys", async () => {
		mockPrisma.vertical_medical_employee_box.findMany.mockResolvedValue([]);
		mockPrisma.box.findFirst.mockResolvedValue(null);

		const data = await getOwnerDashboard({
			client_id: "client-a",
			owner_name: "Ravi",
			password: "secret",
		});

		expect(Object.keys(data).sort()).toEqual(
			[
				"boxes",
				"greeting",
				"has_boxes",
				"is_password_set",
				"location",
				"outside_temp_c",
			].sort(),
		);
	});

	test("location share payload exposes native OS share fields", async () => {
		const { buildMedicalLocationSharePayload } = await import(
			"@/db/actions/medical-mobile/location-share.actions.ts"
		);

		const payload = buildMedicalLocationSharePayload(
			{
				lat: 28.6139,
				lng: 77.209,
				updated_at: "2026-08-12T10:00:00.000Z",
				address_hint: "City Hospital, Delhi, India",
				gps_status: "on",
			},
			"BOX-9876",
		);

		expect(Object.keys(payload).sort()).toEqual(
			[
				"address_hint",
				"gps_status",
				"lat",
				"lng",
				"maps_url",
				"share_text",
				"updated_at",
			].sort(),
		);
		expect(payload.share_text).toContain("BOX-9876");
		expect(payload.share_text).not.toContain("share_url");
	});
});

describe("Medical mobile owner tenancy IDOR", () => {
	beforeEach(() => {
		mockPrisma.vertical_medical_employee_box.findFirst.mockReset();
	});

	test("resolveOwnerBoxById throws when owner has no claim", async () => {
		mockPrisma.vertical_medical_employee_box.findFirst.mockResolvedValue(null);

		await expect(
			resolveOwnerBoxById({
				box_id: "box-other-hospital",
				client_id: "client-a",
			}),
		).rejects.toThrow(APIError);
	});
});

describe("Cross-vertical regression", () => {
	test("delivery-mobile box routes unchanged", () => {
		const routes = getRoutePaths("/api/v1/delivery-mobile", deliveryMobileRouter);
		expect(routes).toContain("GET /api/v1/delivery-mobile/boxes");
		expect(routes).toContain("PATCH /api/v1/delivery-mobile/boxes/:box_id/lock");
	});

	test("driver router retains QR register and OTP unlock", () => {
		const routes = getRoutePaths("/api/v1/medical-mobile/driver", medicalMobileDriverRouter);
		expect(routes).toContain("POST /api/v1/medical-mobile/driver/boxes");
		expect(routes).toContain("POST /api/v1/medical-mobile/driver/boxes/:box_id/lock/otp");
	});
});
