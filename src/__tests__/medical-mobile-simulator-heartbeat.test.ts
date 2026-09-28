import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockPrisma = {
	vertical_medical_employee_box: {
		findFirst: mock(() => Promise.resolve(null)),
	},
	box: {
		updateMany: mock(() => Promise.resolve({ count: 1 })),
	},
	box_telemetry_latest: {
		upsert: mock(() => Promise.resolve({})),
	},
	$transaction: mock(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
		callback(mockPrisma),
	),
};

mock.module("@/db", () => ({
	prisma: mockPrisma,
	isMongoConnected: () => true,
	getMongoConnectionState: () => "connected",
}));

const { connectHandlerBox } = await import("@/db/actions/medical-mobile/box.actions.ts");
const {
	clearSimulatorHeartbeat,
	isSimulatorHeartbeatStale,
} = await import("@/db/actions/simulator.connection.actions.ts");

describe("Medical mobile driver connect — simulator heartbeat", () => {
	const boxId = "box-med-connect";

	beforeEach(() => {
		clearSimulatorHeartbeat(boxId);
		mockPrisma.vertical_medical_employee_box.findFirst.mockReset();
		mockPrisma.box.updateMany.mockReset();
		mockPrisma.box.updateMany.mockResolvedValue({ count: 1 });
		mockPrisma.box_telemetry_latest.upsert.mockReset();
		mockPrisma.box_telemetry_latest.upsert.mockResolvedValue({});
	});

	test("connectHandlerBox records simulator heartbeat so health poll does not drop session", async () => {
		mockPrisma.vertical_medical_employee_box.findFirst.mockResolvedValue({
			status: "shared",
			box: {
				id: boxId,
				box_display_id: "BOX-MED-1",
				medical_connection_employee_id: null,
				telemetry: { power_status: "on", connection_status: "disconnected" },
			},
		} as any);

		const result = await connectHandlerBox({
			box_id: boxId,
			client_id: "client-a",
			employee_id: "handler-1",
		});

		expect(result.is_connected).toBe(true);
		expect(isSimulatorHeartbeatStale(boxId)).toBe(false);
		clearSimulatorHeartbeat(boxId);
	});

	test("already-connected idempotent connect refreshes simulator heartbeat", async () => {
		mockPrisma.vertical_medical_employee_box.findFirst.mockResolvedValue({
			status: "shared",
			box: {
				id: boxId,
				box_display_id: "BOX-MED-1",
				medical_connection_employee_id: "handler-1",
				telemetry: { power_status: "on", connection_status: "connected" },
			},
		} as any);

		const realDateNow = Date.now;
		let fakeNow = 1_000_000;
		Date.now = () => fakeNow;

		try {
			const { SIMULATOR_HEARTBEAT_TIMEOUT_MS, recordSimulatorHeartbeat } = await import(
				"@/db/actions/simulator.connection.actions.ts"
			);
			recordSimulatorHeartbeat(boxId);
			fakeNow += SIMULATOR_HEARTBEAT_TIMEOUT_MS - 100;

			await connectHandlerBox({
				box_id: boxId,
				client_id: "client-a",
				employee_id: "handler-1",
			});

			expect(isSimulatorHeartbeatStale(boxId)).toBe(false);
			expect(mockPrisma.box.updateMany).not.toHaveBeenCalled();
		} finally {
			Date.now = realDateNow;
			clearSimulatorHeartbeat(boxId);
		}
	});
});
