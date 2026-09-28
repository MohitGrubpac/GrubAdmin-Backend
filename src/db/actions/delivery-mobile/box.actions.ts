import { prisma } from "@/db";
import { actionGrubpac, updateBoxLockStatus } from "@/db/actions/box.actions.ts";
import { DeliveryEmployeeOtp } from "@/db/mongo-schema";
import type { hardware_state, Prisma } from "@/db/types";
import { APIError } from "@/types/error";
import type {
	LockAction,
	MobileBoxConnectionResult,
	MobileBoxDetails,
	MobileBoxSettings,
	MobileBoxSettingsPatch,
	MobileBoxSettingsUpdateResult,
	MobileBoxSummary,
} from "@/types/delivery-mobile-box";
import {
	boolToHardwareState,
	mergeSettingsPatch,
	toMobileBoxDetails,
	toMobileBoxSettings,
	toMobileBoxSummary,
	type BoxWithRelations,
} from "@/db/actions/delivery-mobile/box.mapper.ts";
import {
	BOX_POWERED_OFF_CONNECT_MESSAGE,
	isBoxPoweredOff,
} from "@/utils/box-power.ts";
import {
	clearSimulatorHeartbeat,
	recordSimulatorHeartbeat,
} from "@/db/actions/simulator.connection.actions.ts";
import { SEARCH_PAGE_SIZE } from "@/validators/pagination.ts";

const MAX_LOCK_OTP_ATTEMPTS = 3;
const MAX_MY_GRUBPACS_PAGE_SIZE = SEARCH_PAGE_SIZE;
const MAX_DRIVER_BOXES_PAGE_SIZE = SEARCH_PAGE_SIZE;

const boxInclude = {
	telemetry: true,
	lock: true,
	connection_employee: true,
} as const;

const boxWhereForDriver = (box_id: string, client_id: string) => ({
	id: box_id,
	client_id,
	status: { not: "suspended" as const },
});

export const resolveDriverBoxById = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}) => {
	const assignment = await prisma.vertical_delivery_employee_box.findFirst({
		where: {
			employee_id: args.employee_id,
			box: boxWhereForDriver(args.box_id, args.client_id),
		},
		include: {
			box: {
				include: boxInclude,
			},
		},
	});

	if (!assignment) {
		throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
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

export type ListDriverBoxesParams = {
	employee_id: string;
	client_id: string;
	page?: number;
	limit?: number;
	include_historical?: boolean;
};

const driverBoxAssignmentWhere = (args: {
	employee_id: string;
	client_id: string;
	include_historical?: boolean;
}): Prisma.vertical_delivery_employee_boxWhereInput => ({
	employee_id: args.employee_id,
	status: args.include_historical
		? { in: ["shared", "unlinked"] }
		: "shared",
	box: {
		client_id: args.client_id,
		status: { not: "suspended" },
	},
});

/** Driver box list — always paginated; default and max page size 50 (DM-04). */
export const listDriverBoxes = async (
	args: ListDriverBoxesParams,
): Promise<{
	boxes: MobileBoxSummary[];
	count: number;
	page: number;
	limit: number;
}> => {
	const page = args.page ?? 1;
	const limit = Math.min(
		args.limit ?? MAX_DRIVER_BOXES_PAGE_SIZE,
		MAX_DRIVER_BOXES_PAGE_SIZE,
	);
	const skip = (page - 1) * limit;
	const where = driverBoxAssignmentWhere(args);

	const [assignments, count] = await Promise.all([
		prisma.vertical_delivery_employee_box.findMany({
			where,
			include: {
				box: {
					include: {
						telemetry: true,
						lock: true,
					},
				},
			},
			skip,
			take: limit,
			orderBy: { created_at: "desc" },
		}),
		prisma.vertical_delivery_employee_box.count({ where }),
	]);

	return {
		boxes: assignments.map((assignment) =>
			toMobileBoxSummary(assignment.box as BoxWithRelations, args.employee_id),
		),
		count,
		page,
		limit,
	};
};

export type GetMyGrubpacsForClientParams = {
	client_id: string;
	power_status?: "on" | "off" | "unknown";
	query?: string;
	page?: number;
	limit?: number;
};

export type MyGrubpacListItem = Record<string, unknown>;

const myGrubpacBoxSelect = {
	id: true,
	box_display_id: true,
	name: true,
	vehicle_number: true,
	status: true,
	created_at: true,
	updated_at: true,
	telemetry: true,
} as const;

const buildMyGrubpacsWhereClause = (args: {
	client_id: string;
	power_status?: "on" | "off" | "unknown";
	query?: string;
}) => {
	const whereClause: {
		client_id: string;
		status: { not: "suspended" };
		telemetry?: { is: { power_status: "on" | "off" | "unknown" } };
		OR?: Array<
			| { name: { contains: string } }
			| { box_display_id: { contains: string } }
		>;
	} = {
		client_id: args.client_id,
		status: {
			not: "suspended",
		},
	};

	if (args.power_status) {
		whereClause.telemetry = {
			is: {
				power_status: args.power_status,
			},
		};
	}

	if (args.query) {
		whereClause.OR = [
			{ name: { contains: args.query } },
			{ box_display_id: { contains: args.query } },
		];
	}

	return whereClause;
};

const formatMyGrubpacBox = (box: {
	id: string;
	box_display_id: string;
	name: string | null;
	vehicle_number: string | null;
	status: string;
	created_at: Date;
	updated_at: Date;
	telemetry: Record<string, unknown> | null;
}): MyGrubpacListItem => {
	const { telemetry, ...boxData } = box;
	const {
		id: _telemetryId,
		box_id: _telemetryBoxId,
		updated_at: _telemetryUpdatedAt,
		...telemetryData
	} = (telemetry || {}) as Record<string, unknown>;

	return {
		...boxData,
		...telemetryData,
	};
};

/** Account my GrubPacs — always paginated; default and max page size 50 (DM-03). */
export const getMyGrubpacsForClient = async (
	args: GetMyGrubpacsForClientParams,
): Promise<{
	boxes: MyGrubpacListItem[];
	count: number;
	page: number;
	limit: number;
}> => {
	const page = args.page ?? 1;
	const limit = Math.min(args.limit ?? MAX_MY_GRUBPACS_PAGE_SIZE, MAX_MY_GRUBPACS_PAGE_SIZE);
	const skip = (page - 1) * limit;
	const whereClause = buildMyGrubpacsWhereClause(args);

	const [boxes, count] = await Promise.all([
		prisma.box.findMany({
			where: whereClause,
			select: myGrubpacBoxSelect,
			skip,
			take: limit,
			orderBy: { created_at: "desc" },
		}),
		prisma.box.count({ where: whereClause }),
	]);

	return {
		boxes: boxes.map(formatMyGrubpacBox),
		count,
		page,
		limit,
	};
};

export const registerDriverBox = async (args: {
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

		if (!box) {
			throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
		}

		if (box.status === "suspended") {
			throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
		}

		const existing = await tx.vertical_delivery_employee_box.findFirst({
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
			throw new APIError("Box is already registered to this driver", undefined, undefined, 409);
		}

		if (existing?.status === "unlinked") {
			const reactivated = await tx.vertical_delivery_employee_box.updateMany({
				where: {
					id: existing.id,
					employee_id: args.employee_id,
					box_id: box.id,
					status: "unlinked",
					box: { client_id: args.client_id },
				},
				data: {
					status: "shared",
					unlinked_at: null,
					access: "direct",
					created_at: new Date(),
				},
			});

			if (reactivated.count === 1) {
				return toMobileBoxSummary(box as BoxWithRelations, args.employee_id);
			}

			const current = await tx.vertical_delivery_employee_box.findUnique({
				where: {
					employee_id_box_id: {
						employee_id: args.employee_id,
						box_id: box.id,
					},
				},
				select: { status: true },
			});

			if (current?.status === "blocked") {
				throw new APIError(
					"Unauthorized access... please contact the admin",
					undefined,
					undefined,
					403,
				);
			}

			throw new APIError("Box is already registered to this driver", undefined, undefined, 409);
		}

		await tx.vertical_delivery_employee_box.create({
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

export const getDriverBoxDetails = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MobileBoxDetails> => {
	const { box } = await resolveDriverBoxById(args);
	return toMobileBoxDetails(box as BoxWithRelations, args.employee_id);
};

export const unlinkDriverBox = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<void> => {
	const { box } = await resolveDriverBoxById(args);

	await prisma.$transaction(async (tx) => {
		const updated = await tx.vertical_delivery_employee_box.updateMany({
			where: {
				box_id: box.id,
				employee_id: args.employee_id,
			},
			data: {
				status: "unlinked",
				unlinked_at: new Date(),
			},
		});

		if (updated.count === 0) {
			throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
		}

		if (box.connection_employee_id === args.employee_id) {
			await tx.box.update({
				where: { id: box.id },
				data: { connection_employee_id: null },
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

export const updateDriverBoxSettings = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
	patch: MobileBoxSettingsPatch;
}): Promise<MobileBoxSettingsUpdateResult> => {
	const hasPatchField = Object.values(args.patch).some((v) => v !== undefined);
	if (!hasPatchField) {
		throw new APIError("At least one setting field is required", undefined, undefined, 400);
	}

	const { box } = await resolveDriverBoxById(args);
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
		throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
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
				connection_employee_id: args.employee_id,
			},
		});

		if (updated.count === 0) {
			throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
		}

		if (args.employee_id && args.connection_status === "connected") {
			await tx.vertical_delivery_employee.update({
				where: { id: args.employee_id },
				data: { last_connected_box_id: args.box_id },
			});
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

export const connectDriverBox = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MobileBoxConnectionResult> => {
	const { box } = await resolveDriverBoxById(args);

	if (isBoxPoweredOff(box.telemetry?.power_status)) {
		throw new APIError(BOX_POWERED_OFF_CONNECT_MESSAGE, undefined, undefined, 400);
	}

	if (
		box.connection_employee_id &&
		box.connection_employee_id !== args.employee_id
	) {
		throw new APIError("Box is already connected to another driver", undefined, undefined, 409);
	}

	const alreadyConnected =
		box.connection_employee_id === args.employee_id &&
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

export const disconnectDriverBox = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
}): Promise<MobileBoxConnectionResult> => {
	const { box } = await resolveDriverBoxById(args);

	if (box.connection_employee_id !== args.employee_id) {
		throw new APIError("Box is not connected by this driver", undefined, undefined, 403);
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

export const verifyDriverLockOtp = async (args: {
	box_id: string;
	client_id: string;
	employee_id: string;
	employee_email: string;
	employee_name: string;
	code: string;
	action: LockAction;
}): Promise<void> => {
	const { box } = await resolveDriverBoxById(args);

	const { getSavedDeliveryEmployeeOtp, deleteSavedDeliveryEmployeeOtp, compareOtp } =
		await import("@/db/actions/delivery-employee-otp.actions.ts");

	const savedOtp = await getSavedDeliveryEmployeeOtp(args.employee_email);

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
			await deleteSavedDeliveryEmployeeOtp(args.employee_email);
			throw new APIError("OTP expired or invalid", undefined, undefined, 400);
		}

		await DeliveryEmployeeOtp.updateOne(
			{ _id: savedOtp._id },
			{ failed_attempts: attempts },
		);

		throw new APIError("Invalid OTP", undefined, undefined, 400);
	}

	const lockStatus = args.action === "unlock" ? "unlocked" : "locked";

	await updateBoxLockStatus({
		ids: [box.id],
		lock_status: lockStatus,
		user: {
			id: args.employee_id,
			email: args.employee_email,
			name: args.employee_name,
		},
		client_id: args.client_id,
	});

	await deleteSavedDeliveryEmployeeOtp(args.employee_email);
};
