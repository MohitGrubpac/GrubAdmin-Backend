import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
	BOX_POWERED_OFF_CONNECT_MESSAGE,
	isBoxPoweredOff,
} from "@/utils/box-power.ts";

const mockPrisma = {
	box: {
		findUnique: mock(() => Promise.resolve(null)),
		update: mock(() => Promise.resolve({})),
	},
	$transaction: mock(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
		callback(mockPrisma),
	),
	vertical_delivery_employee: {
		updateMany: mock(() => Promise.resolve({ count: 1 })),
	},
	box_telemetry_latest: {
		upsert: mock(() => Promise.resolve({})),
	},
};

mock.module("@/db", () => ({
	prisma: mockPrisma,
}));

const {
	SIMULATOR_HEARTBEAT_TIMEOUT_MS,
	buildSimulatorConnectedUser,
	clearSimulatorHeartbeat,
	connectSimulatorBox,
	enforceSimulatorHeartbeatTimeout,
	isSimulatorHeartbeatStale,
	recordSimulatorHeartbeat,
} = await import("@/db/actions/simulator.connection.actions.ts");

describe("simulator connection — power off guard", () => {
	beforeEach(() => {
		mockPrisma.box.findUnique.mockReset();
	});

	test("isBoxPoweredOff is true only for off status", () => {
		expect(isBoxPoweredOff("off")).toBe(true);
		expect(isBoxPoweredOff("on")).toBe(false);
		expect(isBoxPoweredOff(null)).toBe(false);
		expect(isBoxPoweredOff(undefined)).toBe(false);
	});

	test("connectSimulatorBox rejects when box power is off", async () => {
		mockPrisma.box.findUnique.mockResolvedValue({
			id: "box-1",
			connection_employee_id: null,
			medical_connection_employee_id: null,
			telemetry: { power_status: "off" },
		} as any);

		const result = await connectSimulatorBox("box-1", "driver-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
			expect(result.message).toBe(BOX_POWERED_OFF_CONNECT_MESSAGE);
		}
	});

	test("connectSimulatorBox allows connect when power is on", async () => {
		mockPrisma.box.findUnique.mockResolvedValue({
			id: "box-1",
			connection_employee_id: null,
			medical_connection_employee_id: null,
			telemetry: { power_status: "on" },
			vertical: { name: "Delivery" },
		} as any);

		const result = await connectSimulatorBox("box-1", "driver-1");

		expect(result.ok).toBe(true);
	});

	test("buildSimulatorConnectedUser prefers medical handler when set", () => {
		const connected = buildSimulatorConnectedUser({
			connection_employee_id: "del-1",
			medical_connection_employee_id: "med-1",
			connection_employee: {
				id: "del-1",
				employee_display_id: "DEL-001",
				first_name: "Delivery",
				last_name: "Driver",
			},
			medical_connection_employee: {
				id: "med-1",
				employee_display_id: "MED-001",
				first_name: "Medical",
				last_name: "Handler",
			},
		});

		expect(connected).toEqual({
			driver_id: "med-1",
			driver_user_id: "med-1",
			employee_display_id: "MED-001",
			name: "Medical Handler",
		});
	});
});

describe("simulator heartbeat — medical mobile connection", () => {
	const boxId = "box-med-heartbeat";

	beforeEach(() => {
		clearSimulatorHeartbeat(boxId);
		mockPrisma.box.findUnique.mockReset();
		mockPrisma.box.update.mockReset();
		mockPrisma.$transaction.mockReset();
		mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
			callback(mockPrisma),
		);
	});

	test("stale heartbeat disconnects medical_connection_employee_id", async () => {
		const realDateNow = Date.now;
		let fakeNow = 1_000_000;
		Date.now = () => fakeNow;

		try {
			recordSimulatorHeartbeat(boxId);
			fakeNow += SIMULATOR_HEARTBEAT_TIMEOUT_MS + 1;

			mockPrisma.box.findUnique
				.mockResolvedValueOnce({
					connection_employee_id: null,
					medical_connection_employee_id: "handler-1",
				} as any)
				.mockResolvedValueOnce({
					id: boxId,
					connection_employee_id: null,
					medical_connection_employee_id: "handler-1",
				} as any);

			await enforceSimulatorHeartbeatTimeout(boxId);

			expect(mockPrisma.box.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: boxId },
					data: expect.objectContaining({
						medical_connection_employee_id: null,
						connection_employee_id: null,
					}),
				}),
			);
		} finally {
			Date.now = realDateNow;
			clearSimulatorHeartbeat(boxId);
		}
	});

	test("fresh heartbeat keeps medical handler connected through health enforce", async () => {
		mockPrisma.box.findUnique.mockResolvedValue({
			connection_employee_id: null,
			medical_connection_employee_id: "handler-1",
		} as any);

		recordSimulatorHeartbeat(boxId);
		expect(isSimulatorHeartbeatStale(boxId)).toBe(false);

		await enforceSimulatorHeartbeatTimeout(boxId);

		expect(mockPrisma.box.update).not.toHaveBeenCalled();
		clearSimulatorHeartbeat(boxId);
	});
});
