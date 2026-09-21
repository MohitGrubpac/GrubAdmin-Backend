import { prisma } from "@/db";
import { ulid } from "ulid";
import { MEDICAL_VERTICAL_NAME } from "@/configs/constants";
import { BOX_POWERED_OFF_CONNECT_MESSAGE, isBoxPoweredOff } from "@/utils/box-power.ts";

const simulatorEmployeeSelect = {
	id: true,
	employee_display_id: true,
	first_name: true,
	last_name: true,
} as const;

export const simulatorBoxConnectionInclude = {
	connection_employee: { select: simulatorEmployeeSelect },
	medical_connection_employee: { select: simulatorEmployeeSelect },
} as const;

type SimulatorEmployeeSnapshot = {
	id: string;
	employee_display_id: string | null;
	first_name: string;
	last_name: string | null;
};

export const resolveSimulatorActiveConnectionEmployeeId = (box: {
	medical_connection_employee_id?: string | null;
	connection_employee_id?: string | null;
}) => box.medical_connection_employee_id ?? box.connection_employee_id ?? null;

export const isSimulatorDriverConnected = (box: {
	medical_connection_employee_id?: string | null;
	connection_employee_id?: string | null;
}) => !!resolveSimulatorActiveConnectionEmployeeId(box);

export const SIMULATOR_HEARTBEAT_TIMEOUT_MS = 20_000;

export { BOX_POWERED_OFF_CONNECT_MESSAGE, isBoxPoweredOff };

const lastPingMs = new Map<string, number>();

export const recordSimulatorHeartbeat = (box_id: string) => {
	lastPingMs.set(box_id, Date.now());
};

export const clearSimulatorHeartbeat = (box_id: string) => {
	lastPingMs.delete(box_id);
};

export const isSimulatorHeartbeatStale = (box_id: string): boolean => {
	const last = lastPingMs.get(box_id);
	if (!last) return false;
	return Date.now() - last >= SIMULATOR_HEARTBEAT_TIMEOUT_MS;
};

export const getSimulatorTrackedBoxIds = (): string[] => [...lastPingMs.keys()];

const clearEmployeeLastConnectedBox = async (box_id: string, employee_id: string | null) => {
	if (!employee_id) return;

	await prisma.vertical_delivery_employee.updateMany({
		where: {
			id: employee_id,
			last_connected_box_id: box_id,
		},
		data: { last_connected_box_id: null },
	});
};

export const resetSimulatorBoxConnection = async (box_id: string) => {
	const box = await prisma.box.findUnique({
		where: { id: box_id },
		select: {
			id: true,
			connection_employee_id: true,
			medical_connection_employee_id: true,
		},
	});

	if (!box) {
		return null;
	}

	const previousDriverId = box.connection_employee_id;

	await prisma.$transaction(async (tx) => {
		await tx.box.update({
			where: { id: box_id },
			data: {
				connection_employee_id: null,
				medical_connection_employee_id: null,
			},
		});

		await tx.box_telemetry_latest.upsert({
			where: { box_id },
			update: {
				connection_status: "disconnected",
				cellular_signal: "offline",
			},
			create: {
				id: ulid(),
				box_id,
				connection_status: "disconnected",
				cellular_signal: "offline",
			},
		});
	});

	await clearEmployeeLastConnectedBox(box_id, previousDriverId);
	clearSimulatorHeartbeat(box_id);

	return box;
};

export const connectSimulatorBox = async (box_id: string, driver_id: string) => {
	const box = await prisma.box.findUnique({
		where: { id: box_id },
		select: {
			id: true,
			connection_employee_id: true,
			medical_connection_employee_id: true,
			telemetry: { select: { power_status: true } },
			vertical: { select: { name: true } },
		},
	});

	if (!box) {
		return { ok: false as const, status: 404, message: "Box not found" };
	}

	if (isBoxPoweredOff(box.telemetry?.power_status)) {
		return {
			ok: false as const,
			status: 400,
			message: BOX_POWERED_OFF_CONNECT_MESSAGE,
		};
	}

	const occupiedBy =
		(box.connection_employee_id && box.connection_employee_id !== driver_id
			? box.connection_employee_id
			: null) ||
		(box.medical_connection_employee_id && box.medical_connection_employee_id !== driver_id
			? box.medical_connection_employee_id
			: null);

	if (occupiedBy) {
		return {
			ok: false as const,
			status: 409,
			message: "Box is already connected to another user",
		};
	}

	const isMedicalBox = box.vertical?.name === MEDICAL_VERTICAL_NAME;

	await prisma.$transaction(async (tx) => {
		await tx.box.update({
			where: { id: box_id },
			data: isMedicalBox
				? { medical_connection_employee_id: driver_id }
				: { connection_employee_id: driver_id },
		});

		if (!isMedicalBox) {
			await tx.vertical_delivery_employee.updateMany({
				where: { id: driver_id },
				data: { last_connected_box_id: box_id },
			});
		}

		await tx.box_telemetry_latest.upsert({
			where: { box_id },
			update: {
				connection_status: "connected",
				cellular_signal: "strong",
			},
			create: {
				id: ulid(),
				box_id,
				connection_status: "connected",
				cellular_signal: "strong",
			},
		});
	});

	recordSimulatorHeartbeat(box_id);

	return { ok: true as const };
};

export const disconnectSimulatorBoxOnPowerOff = async (box_id: string) => {
	const box = await prisma.box.findUnique({
		where: { id: box_id },
		select: { connection_employee_id: true, medical_connection_employee_id: true },
	});

	if (!isSimulatorDriverConnected(box ?? {})) {
		return;
	}

	await resetSimulatorBoxConnection(box_id);
};

export const enforceSimulatorHeartbeatTimeout = async (box_id: string) => {
	const box = await prisma.box.findUnique({
		where: { id: box_id },
		select: { connection_employee_id: true, medical_connection_employee_id: true },
	});

	if (!isSimulatorDriverConnected(box ?? {})) {
		clearSimulatorHeartbeat(box_id);
		return;
	}

	if (isSimulatorHeartbeatStale(box_id)) {
		await resetSimulatorBoxConnection(box_id);
	}
};

export const runSimulatorHeartbeatSweep = async () => {
	for (const box_id of getSimulatorTrackedBoxIds()) {
		await enforceSimulatorHeartbeatTimeout(box_id);
	}
};

const toSimulatorConnectedUser = (
	employeeId: string,
	employee?: SimulatorEmployeeSnapshot | null,
) => ({
	driver_id: employeeId,
	driver_user_id: employeeId,
	employee_display_id: employee?.employee_display_id ?? null,
	name: employee ? `${employee.first_name} ${employee.last_name || ""}`.trim() : null,
});

export const buildSimulatorConnectedUser = (box: {
	connection_employee_id?: string | null;
	medical_connection_employee_id?: string | null;
	connection_employee?: SimulatorEmployeeSnapshot | null;
	medical_connection_employee?: SimulatorEmployeeSnapshot | null;
}) => {
	if (box.medical_connection_employee_id) {
		return toSimulatorConnectedUser(
			box.medical_connection_employee_id,
			box.medical_connection_employee,
		);
	}

	if (!box.connection_employee_id) {
		return null;
	}

	return toSimulatorConnectedUser(box.connection_employee_id, box.connection_employee);
};
