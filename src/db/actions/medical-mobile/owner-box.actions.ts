import { prisma } from "@/db";
import { actionGrubpac, updateBoxLockStatus } from "@/db/actions/box.actions.ts";
import type { hardware_state } from "@/db/types";
import { APIError } from "@/types/error";
import type {
	MobileBoxConnectionResult,
	MobileBoxDetails,
	MobileBoxSettingsPatch,
	MobileBoxSettingsUpdateResult,
	MobileBoxSummary,
} from "@/types/mobile-box";
import type { MedicalBoxLocation } from "@/types/medical-mobile/location";
import type { MedicalBoxDiagnostics } from "@/types/medical-mobile/diagnostics";
import { resolveBoxGpsCoords } from "@/utils/box-gps.ts";
import { buildMedicalBoxDiagnostics } from "@/db/actions/medical-mobile/diagnostics.actions.ts";
import { buildMedicalLocationSharePayload } from "@/db/actions/medical-mobile/location-share.actions.ts";
import type { MedicalBoxLocationShareResponse } from "@/types/medical-mobile/location";
import type { MedicalOwnerDashboardBoxCard } from "@/types/medical-mobile/owner-dashboard";
import {
	boolToHardwareState,
	hardwareStateToBool,
	mergeSettingsPatch,
	toMobileBoxSettings,
	type BoxWithRelations,
} from "@/db/actions/medical-mobile/box.mapper.ts";
import { computeBatteryEstimatedHours, computeOverallBatteryLevel } from "@/utils/box-battery.ts";
import {
	BOX_POWERED_OFF_CONNECT_MESSAGE,
	isBoxPoweredOff,
} from "@/utils/box-power.ts";

const boxInclude = {
	telemetry: true,
	lock: true,
	medical_connection_employee: true,
} as const;

const boxWhereForOwner = (box_id: string, client_id: string) => ({
	id: box_id,
	client_id,
	status: { not: "suspended" as const },
});

const ownerAssignmentWhere = (client_id: string, box_id?: string) => ({
	employee_id: null,
	status: "shared" as const,
	box: {
		...(box_id ? { id: box_id } : {}),
		client_id,
		status: { not: "suspended" as const },
	},
});

export const toOwnerMobileBoxSummary = (box: BoxWithRelations): MobileBoxSummary => {
	const telemetry = box.telemetry;

	return {
		id: box.id,
		box_display_id: box.box_display_id,
		name: box.name,
		is_connected: telemetry?.connection_status === "connected",
		battery_level: computeOverallBatteryLevel(telemetry),
		is_locked: box.lock?.lock_status === "locked",
	};
};

export const toOwnerMobileBoxDetails = (box: BoxWithRelations): MobileBoxDetails => {
	const summary = toOwnerMobileBoxSummary(box);
	const telemetry = box.telemetry;
	const batteryLevel = summary.battery_level;
	const isCharging = hardwareStateToBool(telemetry?.charging_status);
	const isPowerOn = hardwareStateToBool(telemetry?.power_status);

	return {
		...summary,
		zone_1_temp: telemetry?.zone1_temp ?? null,
		zone_2_temp: telemetry?.zone2_temp ?? null,
		ext_temp: telemetry?.ext_temp ?? null,
		connection_status: telemetry?.cellular_signal ?? telemetry?.connection_status ?? null,
		power_status: telemetry?.power_status ?? null,
		health_status: telemetry?.health_status ?? null,
		battery_1_level: telemetry?.battery_1_percentage ?? null,
		battery_2_level: telemetry?.battery_2_percentage ?? null,
		is_charging: isCharging,
		wifi_connected: hardwareStateToBool(telemetry?.wifi_status),
		bluetooth_available: hardwareStateToBool(telemetry?.bluetooth_status),
		is_power_on: isPowerOn,
		battery_estimated_hours: computeBatteryEstimatedHours(batteryLevel, isCharging, isPowerOn),
		is_driver_connected: !!box.medical_connection_employee_id,
		settings: toMobileBoxSettings(telemetry),
	};
};

export const toOwnerDashboardBoxCard = (box: BoxWithRelations): MedicalOwnerDashboardBoxCard => ({
	id: box.id,
	display_id: box.box_display_id,
	connection_status: box.telemetry?.connection_status ?? "disconnected",
	grublock_status: box.lock?.lock_status ?? "unlocked",
});

export const resolveOwnerBoxById = async (args: { box_id: string; client_id: string }) => {
	const assignment = await prisma.vertical_medical_employee_box.findFirst({
		where: ownerAssignmentWhere(args.client_id, args.box_id),
		include: {
			box: {
				include: boxInclude,
			},
		},
	});

	if (!assignment) {
		throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
	}

	return { box: assignment.box, assignment };
};

export const resolveOwnerBoxesByIds = async (args: { ids: string[]; client_id: string }) => {
	const assignments = await prisma.vertical_medical_employee_box.findMany({
		where: {
			employee_id: null,
			status: "shared",
			box_id: { in: args.ids },
			box: {
				client_id: args.client_id,
				status: { not: "suspended" },
			},
		},
		select: { box_id: true },
	});

	const validIds = new Set(assignments.map((a) => a.box_id));
	const missing = args.ids.filter((id) => !validIds.has(id));

	if (missing.length > 0) {
		throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
	}

	return args.ids;
};

export const listOwnerBoxes = async (client_id: string): Promise<MobileBoxSummary[]> => {
	const assignments = await prisma.vertical_medical_employee_box.findMany({
		where: ownerAssignmentWhere(client_id),
		include: {
			box: {
				include: {
					telemetry: true,
					lock: true,
				},
			},
		},
	});

	return assignments.map((assignment) =>
		toOwnerMobileBoxSummary(assignment.box as BoxWithRelations),
	);
};

export const listOwnerDashboardBoxCards = async (
	client_id: string,
): Promise<MedicalOwnerDashboardBoxCard[]> => {
	const assignments = await prisma.vertical_medical_employee_box.findMany({
		where: ownerAssignmentWhere(client_id),
		include: {
			box: {
				include: {
					telemetry: true,
					lock: true,
				},
			},
		},
	});

	return assignments.map((assignment) =>
		toOwnerDashboardBoxCard(assignment.box as BoxWithRelations),
	);
};

export const claimOwnerBox = async (args: {
	display_id?: string;
	box_display_id?: string;
	client_id: string;
}): Promise<MobileBoxSummary> => {
	const displayId = (args.display_id ?? args.box_display_id ?? "").trim();
	if (!displayId) {
		throw new APIError("Display id is required", undefined, undefined, 400);
	}

	return prisma.$transaction(async (tx) => {
		const box = await tx.box.findFirst({
			where: {
				box_display_id: displayId,
				client_id: args.client_id,
			},
			include: {
				telemetry: true,
				lock: true,
			},
		});

		if (!box || box.status === "suspended") {
			throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
		}

		const existing = await tx.vertical_medical_employee_box.findFirst({
			where: {
				box_id: box.id,
				employee_id: null,
			},
		});

		if (existing?.status === "shared") {
			throw new APIError("Box is already claimed by this owner", undefined, undefined, 409);
		}

		if (existing) {
			await tx.vertical_medical_employee_box.update({
				where: { id: existing.id },
				data: { status: "shared" },
			});
		} else {
			await tx.vertical_medical_employee_box.create({
				data: {
					box_id: box.id,
					employee_id: null,
					status: "shared",
					access: "direct",
				},
			});
		}

		return toOwnerMobileBoxSummary(box as BoxWithRelations);
	});
};

export const getOwnerBoxDetails = async (args: {
	box_id: string;
	client_id: string;
}): Promise<MobileBoxDetails> => {
	const { box } = await resolveOwnerBoxById(args);
	return toOwnerMobileBoxDetails(box as BoxWithRelations);
};

export const unassignOwnerBox = async (args: { box_id: string; client_id: string }): Promise<void> => {
	const { box } = await resolveOwnerBoxById(args);

	await prisma.$transaction(async (tx) => {
		const deleted = await tx.vertical_medical_employee_box.deleteMany({
			where: {
				box_id: box.id,
				employee_id: null,
			},
		});

		if (deleted.count === 0) {
			throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
		}

		if (box.telemetry?.connection_status === "connected") {
			await tx.box_telemetry_latest.upsert({
				where: { box_id: box.id },
				create: {
					box_id: box.id,
					connection_status: "disconnected",
				},
				update: {
					connection_status: "disconnected",
				},
			});
		}
	});
};

const mapSettingsPatchToGrubpac = (patch: MobileBoxSettingsPatch) => {
	const payload: {
		dual_zone_status?: hardware_state;
		zone1_temp?: number;
		zone2_temp?: number;
		ioniser_status?: hardware_state;
	} = {};

	if (patch.is_dual_zone !== undefined) {
		payload.dual_zone_status = boolToHardwareState(patch.is_dual_zone);
	}
	if (patch.zone_1_temp !== undefined) {
		payload.zone1_temp = patch.zone_1_temp;
	}
	if (patch.zone_2_temp !== undefined) {
		payload.zone2_temp = patch.zone_2_temp;
	}
	if (patch.ioniser_enabled !== undefined) {
		payload.ioniser_status = boolToHardwareState(patch.ioniser_enabled);
	}

	return payload;
};

export const updateOwnerBoxSettings = async (args: {
	box_id: string;
	client_id: string;
	patch: MobileBoxSettingsPatch;
}): Promise<MobileBoxSettingsUpdateResult> => {
	const allowedKeys: (keyof MobileBoxSettingsPatch)[] = [
		"is_dual_zone",
		"zone_1_temp",
		"zone_2_temp",
		"ioniser_enabled",
	];
	const hasPatchField = allowedKeys.some((key) => args.patch[key] !== undefined);

	if (!hasPatchField) {
		throw new APIError("At least one owner setting field is required", undefined, undefined, 400);
	}

	const ownerPatch: MobileBoxSettingsPatch = {
		is_dual_zone: args.patch.is_dual_zone,
		zone_1_temp: args.patch.zone_1_temp,
		zone_2_temp: args.patch.zone_2_temp,
		ioniser_enabled: args.patch.ioniser_enabled,
	};

	const { box } = await resolveOwnerBoxById(args);
	const grubpacPayload = mapSettingsPatchToGrubpac(ownerPatch);

	if (Object.keys(grubpacPayload).length > 0) {
		await actionGrubpac({
			ids: [box.id],
			client_id: args.client_id,
			...grubpacPayload,
		});
	}

	const updated = await prisma.box.findFirst({
		where: { id: box.id },
		include: {
			telemetry: true,
			lock: true,
		},
	});

	if (!updated) {
		throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
	}

	const currentSettings = toMobileBoxSettings(updated.telemetry);
	const settings = mergeSettingsPatch(currentSettings, ownerPatch);

	return {
		id: updated.id,
		box_display_id: updated.box_display_id,
		settings,
	};
};

const setOwnerBoxConnectionState = async (args: {
	box_id: string;
	client_id: string;
	connection_status: "connected" | "disconnected";
}) => {
	await prisma.$transaction(async (tx) => {
		const box = await tx.box.findFirst({
			where: boxWhereForOwner(args.box_id, args.client_id),
			select: { id: true },
		});

		if (!box) {
			throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
		}

		await tx.box_telemetry_latest.upsert({
			where: { box_id: args.box_id },
			create: {
				box_id: args.box_id,
				connection_status: args.connection_status,
			},
			update: {
				connection_status: args.connection_status,
			},
		});
	});
};

export const connectOwnerBox = async (args: {
	box_id: string;
	client_id: string;
}): Promise<MobileBoxConnectionResult> => {
	const { box } = await resolveOwnerBoxById(args);

	if (isBoxPoweredOff(box.telemetry?.power_status)) {
		throw new APIError(BOX_POWERED_OFF_CONNECT_MESSAGE, undefined, undefined, 400);
	}

	if (box.telemetry?.connection_status === "connected") {
		return {
			id: box.id,
			box_display_id: box.box_display_id,
			is_connected: true,
		};
	}

	await setOwnerBoxConnectionState({
		box_id: box.id,
		client_id: args.client_id,
		connection_status: "connected",
	});

	return {
		id: box.id,
		box_display_id: box.box_display_id,
		is_connected: true,
	};
};

export const disconnectOwnerBox = async (args: {
	box_id: string;
	client_id: string;
}): Promise<MobileBoxConnectionResult> => {
	const { box } = await resolveOwnerBoxById(args);

	if (box.telemetry?.connection_status !== "connected") {
		throw new APIError("Box is not connected", undefined, undefined, 403);
	}

	await setOwnerBoxConnectionState({
		box_id: box.id,
		client_id: args.client_id,
		connection_status: "disconnected",
	});

	return {
		id: box.id,
		box_display_id: box.box_display_id,
		is_connected: false,
	};
};

export const lockOwnerBoxes = async (args: {
	ids: string[];
	client_id: string;
	user: { id: string; email: string; name: string };
}): Promise<void> => {
	await resolveOwnerBoxesByIds({ ids: args.ids, client_id: args.client_id });

	await updateBoxLockStatus({
		ids: args.ids,
		lock_status: "locked",
		user: args.user,
		client_id: args.client_id,
	});
};

export const getOwnerBoxLocation = async (args: {
	box_id: string;
	client_id: string;
}): Promise<MedicalBoxLocation> => {
	const { box } = await resolveOwnerBoxById(args);
	const telemetry = box.telemetry;
	const client = await prisma.client.findUnique({
		where: { id: args.client_id },
		select: { organization_name: true, state: true, country: true },
	});

	const gps = resolveBoxGpsCoords(telemetry);
	const addressParts = [client?.organization_name, client?.state, client?.country].filter(Boolean);

	return {
		lat: gps.lat,
		lng: gps.lng,
		gps_status: gps.gps_status,
		updated_at: gps.updated_at ?? new Date().toISOString(),
		address_hint: addressParts.length > 0 ? addressParts.join(", ") : null,
	};
};

export const shareOwnerBoxLocation = async (args: {
	box_id: string;
	client_id: string;
	ttl_minutes?: number;
}): Promise<MedicalBoxLocationShareResponse> => {
	const location = await getOwnerBoxLocation(args);
	const { box } = await resolveOwnerBoxById(args);
	return buildMedicalLocationSharePayload(location, box.box_display_id);
};

export const getOwnerBoxDiagnostics = async (args: {
	box_id: string;
	client_id: string;
}): Promise<MedicalBoxDiagnostics> => {
	const { box } = await resolveOwnerBoxById(args);
	return buildMedicalBoxDiagnostics(box);
};

export { getOwnerBoxAlerts } from "@/db/actions/medical-mobile/box-alerts.actions.ts";

export const revokeOwnerMobileAccess = async (client_id: string): Promise<void> => {
	await prisma.$transaction(async (tx) => {
		const connectedBoxes = await tx.vertical_medical_employee_box.findMany({
			where: ownerAssignmentWhere(client_id),
			include: { box: { include: { telemetry: true } } },
		});

		const hasConnected = connectedBoxes.some(
			(a) => a.box.telemetry?.connection_status === "connected",
		);

		if (hasConnected) {
			throw new APIError(
				"Cannot delete account: disconnect all claimed boxes first.",
				undefined,
				undefined,
				400,
			);
		}

		await tx.vertical_medical_employee_box.deleteMany({
			where: ownerAssignmentWhere(client_id),
		});

		await tx.client.update({
			where: { id: client_id },
			data: { auth_token_version: { increment: 1 } },
		});
	});
};
