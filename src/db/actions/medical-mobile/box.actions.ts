import { prisma } from "@/db";
import { actionGrubpac, updateBoxLockStatus } from "@/db/actions/box.actions.ts";
import { MedicalEmployeeOtp } from "@/db/mongo-schema";
import type { hardware_state } from "@/db/types";
import { APIError } from "@/types/error";
import type {
	LockAction,
	MobileBoxConnectionResult,
	MobileBoxDetails,
	MobileBoxSettingsPatch,
	MobileBoxSettingsUpdateResult,
	MobileBoxSummary,
} from "@/types/mobile-box";
import type { MedicalBoxDiagnostics } from "@/types/medical-mobile/diagnostics";
import type { MedicalBoxLocation } from "@/types/medical-mobile/location";
import {
	boolToHardwareState,
	mergeSettingsPatch,
	toMobileBoxDetails,
	toMobileBoxSettings,
	toMobileBoxSummary,
	type BoxWithRelations,
} from "@/db/actions/medical-mobile/box.mapper.ts";
import {
	BOX_POWERED_OFF_CONNECT_MESSAGE,
	isBoxPoweredOff,
} from "@/utils/box-power.ts";
import {
	clearSimulatorHeartbeat,
	recordSimulatorHeartbeat,
} from "@/db/actions/simulator.connection.actions.ts";
import { resolveBoxGpsCoords } from "@/utils/box-gps.ts";
import { buildMedicalBoxDiagnostics } from "@/db/actions/medical-mobile/diagnostics.actions.ts";
import { buildMedicalLocationSharePayload } from "@/db/actions/medical-mobile/location-share.actions.ts";
import type { MedicalBoxLocationShareResponse } from "@/types/medical-mobile/location";

const MAX_LOCK_OTP_ATTEMPTS = 3;

const boxInclude = {
	telemetry: true,
	lock: true,
	medical_connection_employee: true,
} as const;

const boxWhereForHandler = (box_id: string, client_id: string) => ({
	id: box_id,
	client_id,
	status: { not: "suspended" as const },
});

export const resolveHandlerBoxById = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}) => {
	const assignment = await prisma.vertical_medical_employee_box.findFirst({
		where: {
			employee_id: args.employee_id,
			status: "shared",
			box: boxWhereForHandler(args.box_id, args.client_id),
		},
		include: {
			box: {
				include: boxInclude,
			},
		},
	});

	if (!assignment) {
		throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
	}

	if (assignment.status === "blocked") {
		throw new APIError(
			"Unauthorized access... please contact the admin",
			undefined,
			undefined,
			403,
		);
	}

	return { box: assignment.box, assignment };
};

export const listHandlerBoxes = async (
	employee_id: string,
	client_id: string,
): Promise<MobileBoxSummary[]> => {
	const assignments = await prisma.vertical_medical_employee_box.findMany({
		where: {
			employee_id,
			status: "shared",
			box: {
				client_id,
				status: { not: "suspended" },
			},
		},
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
		toMobileBoxSummary(assignment.box as BoxWithRelations, employee_id),
	);
};

export const registerHandlerBox = async (args: {
	scanned_code: string;
	employee_id: string;
	client_id: string;
}): Promise<MobileBoxSummary> => {
	const scanned_code = args.scanned_code.trim();
	if (!scanned_code) {
		throw new APIError("Scanned code is required", undefined, undefined, 400);
	}

	return prisma.$transaction(async (tx) => {
		const box = await tx.box.findFirst({
			where: {
				box_display_id: scanned_code,
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
				employee_id: args.employee_id,
			},
		});

		if (existing?.status === "blocked") {
			throw new APIError(
				"Unauthorized access... please contact the admin",
				undefined,
				undefined,
				403,
			);
		}

		if (existing?.status === "shared") {
			throw new APIError("Box is already registered to this handler", undefined, undefined, 409);
		}

		await tx.vertical_medical_employee_box.create({
			data: {
				box_id: box.id,
				employee_id: args.employee_id,
				status: "shared",
				access: "direct",
			},
		});

		return toMobileBoxSummary(box as BoxWithRelations, args.employee_id);
	});
};

export const getHandlerBoxDetails = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MobileBoxDetails> => {
	const { box } = await resolveHandlerBoxById(args);
	return toMobileBoxDetails(box as BoxWithRelations, args.employee_id);
};

export const unlinkHandlerBox = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<void> => {
	const { box } = await resolveHandlerBoxById(args);

	await prisma.$transaction(async (tx) => {
		const deleted = await tx.vertical_medical_employee_box.deleteMany({
			where: {
				box_id: box.id,
				employee_id: args.employee_id,
			},
		});

		if (deleted.count === 0) {
			throw new APIError(undefined, "medical.box.NOT_FOUND", undefined, 404);
		}

		if (box.medical_connection_employee_id === args.employee_id) {
			await tx.box.update({
				where: { id: box.id },
				data: { medical_connection_employee_id: null },
			});

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
		advert_screen_status?: hardware_state;
		ioniser_status?: hardware_state;
		light_status?: hardware_state;
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
	if (patch.advert_display_enabled !== undefined) {
		payload.advert_screen_status = boolToHardwareState(patch.advert_display_enabled);
	}
	if (patch.ioniser_enabled !== undefined) {
		payload.ioniser_status = boolToHardwareState(patch.ioniser_enabled);
	}
	if (patch.light_enabled !== undefined) {
		payload.light_status = boolToHardwareState(patch.light_enabled);
	}

	return payload;
};

export const updateHandlerBoxSettings = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
	patch: MobileBoxSettingsPatch;
}): Promise<MobileBoxSettingsUpdateResult> => {
	const hasPatchField = Object.values(args.patch).some((v) => v !== undefined);
	if (!hasPatchField) {
		throw new APIError("At least one setting field is required", undefined, undefined, 400);
	}

	const { box } = await resolveHandlerBoxById(args);
	const grubpacPayload = mapSettingsPatchToGrubpac(args.patch);

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

	const settings = mergeSettingsPatch(currentSettings, {
		is_dual_zone: args.patch.is_dual_zone,
		zone_1_temp: args.patch.zone_1_temp,
		zone_2_temp: args.patch.zone_2_temp,
		advert_display_enabled: args.patch.advert_display_enabled,
		ioniser_enabled: args.patch.ioniser_enabled,
		light_enabled: args.patch.light_enabled,
	});

	return {
		id: updated.id,
		box_display_id: updated.box_display_id,
		settings,
	};
};

const setBoxConnectionState = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string | null;
	connection_status: "connected" | "disconnected";
}) => {
	await prisma.$transaction(async (tx) => {
		const updated = await tx.box.updateMany({
			where: {
				id: args.box_id,
				client_id: args.client_id,
				NOT: { status: "suspended" },
			},
			data: {
				medical_connection_employee_id: args.employee_id,
			},
		});

		if (updated.count === 0) {
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

export const connectHandlerBox = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MobileBoxConnectionResult> => {
	const { box } = await resolveHandlerBoxById(args);

	if (isBoxPoweredOff(box.telemetry?.power_status)) {
		throw new APIError(BOX_POWERED_OFF_CONNECT_MESSAGE, undefined, undefined, 400);
	}

	if (
		box.medical_connection_employee_id &&
		box.medical_connection_employee_id !== args.employee_id
	) {
		throw new APIError("Box is already connected to another handler", undefined, undefined, 409);
	}

	const alreadyConnected =
		box.medical_connection_employee_id === args.employee_id &&
		box.telemetry?.connection_status === "connected";

	if (alreadyConnected) {
		recordSimulatorHeartbeat(box.id);
		return {
			id: box.id,
			box_display_id: box.box_display_id,
			is_connected: true,
		};
	}

	await setBoxConnectionState({
		box_id: box.id,
		client_id: args.client_id,
		employee_id: args.employee_id,
		connection_status: "connected",
	});

	recordSimulatorHeartbeat(box.id);

	return {
		id: box.id,
		box_display_id: box.box_display_id,
		is_connected: true,
	};
};

export const disconnectHandlerBox = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MobileBoxConnectionResult> => {
	const { box } = await resolveHandlerBoxById(args);

	if (box.medical_connection_employee_id !== args.employee_id) {
		throw new APIError("Box is not connected by this handler", undefined, undefined, 403);
	}

	await setBoxConnectionState({
		box_id: box.id,
		client_id: args.client_id,
		employee_id: null,
		connection_status: "disconnected",
	});

	clearSimulatorHeartbeat(box.id);

	return {
		id: box.id,
		box_display_id: box.box_display_id,
		is_connected: false,
	};
};

export const verifyHandlerLockOtp = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
	employee_email: string;
	employee_name: string;
	code: string;
	action: LockAction;
}): Promise<void> => {
	if (args.action !== "unlock") {
		throw new APIError("Lock action requires PATCH /boxes/:box_id/lock", undefined, undefined, 400);
	}

	const { box } = await resolveHandlerBoxById(args);

	const { getSavedMedicalEmployeeOtp, deleteSavedMedicalEmployeeOtp, compareOtp } =
		await import("@/db/actions/medical-otp.actions.ts");

	const savedOtp = await getSavedMedicalEmployeeOtp(args.employee_email);

	if (!savedOtp) {
		throw new APIError("OTP expired or invalid", undefined, undefined, 400);
	}

	if (savedOtp.for_what !== "unlock_box") {
		throw new APIError("Invalid OTP purpose", undefined, undefined, 400);
	}

	const metadata = savedOtp.metadata as {
		ids?: string[];
		box_display_id?: string;
		action?: LockAction;
	} | null;

	const metadataIds = metadata?.ids;

	if (metadataIds && !metadataIds.includes(box.id)) {
		throw new APIError("Invalid OTP session for this box", undefined, undefined, 403);
	}

	const isValidOtp = await compareOtp(args.code, savedOtp.otp);

	if (!isValidOtp) {
		const attempts = (savedOtp.failed_attempts ?? 0) + 1;

		if (attempts >= MAX_LOCK_OTP_ATTEMPTS) {
			await deleteSavedMedicalEmployeeOtp(args.employee_email);
			throw new APIError("OTP expired or invalid", undefined, undefined, 400);
		}

		await MedicalEmployeeOtp.updateOne(
			{ _id: savedOtp._id },
			{ failed_attempts: attempts },
		);

		throw new APIError("Invalid OTP", undefined, undefined, 400);
	}

	await updateBoxLockStatus({
		ids: [box.id],
		lock_status: "unlocked",
		user: {
			id: args.employee_id,
			email: args.employee_email,
			name: args.employee_name,
		},
		client_id: args.client_id,
	});

	await deleteSavedMedicalEmployeeOtp(args.employee_email);
};

export const getHandlerBoxLocation = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MedicalBoxLocation> => {
	const { box } = await resolveHandlerBoxById(args);
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

export const shareHandlerBoxLocation = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
	ttl_minutes?: number;
}): Promise<MedicalBoxLocationShareResponse> => {
	const location = await getHandlerBoxLocation(args);
	const { box } = await resolveHandlerBoxById(args);
	return buildMedicalLocationSharePayload(location, box.box_display_id);
};

export const getHandlerBoxDiagnostics = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MedicalBoxDiagnostics> => {
	const { box } = await resolveHandlerBoxById(args);
	return buildMedicalBoxDiagnostics(box);
};

export { getHandlerBoxAlerts } from "@/db/actions/medical-mobile/box-alerts.actions.ts";
