import { prisma } from "@/db";
import { ulid } from "ulid";
import { logger } from "@/utils/logger";
import { APIError } from "@/types/error";
import {
	type box,
	type Prisma,
	type box_status,
	type box_health_status,
	type hardware_state,
	type box_lock_status,
	type box_connection_status,
	type employee_box_status,
} from "@/db/types";

import { getUniqueClient } from "@/db/actions/client.actions.ts";
import { BoxConfig } from "@/db/mongo-schema";
import { loggerService } from "@/services/system-log.ts";
import { withFullAddress } from "@/utils/restaurant.ts";
import { nullifyEmptyFKs } from "@/utils/clean-query.ts";
import { isMongoConnected, getMongoConnectionState } from "@/db";
import { calculatePagination } from "@/utils/pagination.ts";
import { SEARCH_PAGE_SIZE } from "@/validators/pagination.ts";

/**
 * Assert that MongoDB is connected before executing a MongoDB operation.
 * Throws immediately instead of letting Mongoose buffer and timeout.
 */
const requireMongoDB = (operation: string): void => {
	if (!isMongoConnected()) {
		logger.error(`MongoDB not connected — cannot execute "${operation}". State: ${getMongoConnectionState()}`);
		throw new APIError(
			"Database service temporarily unavailable. Please try again.",
			undefined,
			undefined,
			503,
		);
	}
};

export const calculateAccessMode = (
	sharedPermissions: { employee_id: string | null; access: string }[],
	allEmployees: { id: string; restaurant_id: string | null;[key: string]: any }[],
	restaurantIds: string[]
) => {
	if (sharedPermissions.some(p => p.access === "public")) {
		return "public";
	}

	if (sharedPermissions.some(p => p.access === "all_employees")) {
		return "all_employees";
	}

	const sharedEmployeeIds = sharedPermissions.map(p => p.employee_id).filter(Boolean);

	const expectedRestaurantEmployeeIds = allEmployees
		.filter((e) => e.restaurant_id && restaurantIds.includes(e.restaurant_id))
		.map((e) => e.id);

	const isRestaurantEmployees =
		restaurantIds.length > 0 &&
		expectedRestaurantEmployeeIds.every((id) => sharedEmployeeIds.includes(id)) &&
		sharedEmployeeIds.length === expectedRestaurantEmployeeIds.length;

	if (isRestaurantEmployees) {
		return "restaurant_employees";
	}

	const allActiveEmployeeIds = allEmployees.map((e) => e.id);
	const isAllEmployees =
		allActiveEmployeeIds.length > 0 &&
		allActiveEmployeeIds.every((id) => sharedEmployeeIds.includes(id)) &&
		sharedEmployeeIds.length === allActiveEmployeeIds.length;

	if (isAllEmployees) {
		return "all_employees";
	}

	if (sharedEmployeeIds.length === 0) {
		if (restaurantIds.length > 0) return "restaurant_employees";
		return "all_employees";
	}

	return "restaurant_employees";
};

export const getGlobalStatus = (box: any) => {
	const telemetry = box.telemetry || {};
	if (box.status === "suspended") return "suspended";
	if (telemetry.power_status === "off") return "power_off";
	if (telemetry.connection_status === "disconnected" || telemetry.connection_status === "unknown")
		return "disconnected";
	if (telemetry.health_status === "critical") return "critical";
	if (telemetry.health_status === "attention") return "attention";
	return "ready";
};

export const getHandlerStatus = (box: any) => {
	const telemetry = box.telemetry || {};
	if (telemetry.power_status === "off") {
		return { status: "offline", details: null };
	}

	const hasSharedEmployees = (box.vertical_delivery_employee_boxes?.length || 0) > 0;
	if (!hasSharedEmployees) {
		return { status: "not_shared", details: null };
	}

	if (telemetry.connection_status === "connected" && box.connection_employee) {
		return {
			status: "connected",
			details: {
				...box.connection_employee,
				employee_id: box.connection_employee.employee_display_id,
				password: undefined,
			},
		};
	}

	return { status: "disconnected", details: null };
};


interface CreateBoxArgs {
	box_display_id: string;
	name?: string;
	vertical_id: string;
	client_id?: string | null;
	vehicle_number?: string | null;
	status: box_status;
	power_status?: hardware_state | null;
	health_status?: box_health_status | null;
	ioniser_status?: hardware_state | null;
	advert_screen_status?: hardware_state | null;
	gyrosensor_status?: hardware_state | null;
	wifi_status?: hardware_state | null;
	bluetooth_status?: hardware_state | null;
	sim_status?: hardware_state | null;
	gps_status?: hardware_state | null;
	solar_status?: hardware_state | null;
	camera_status?: hardware_state | null;
	adas_status?: hardware_state | null;
	port_big_status?: hardware_state | null;
	port_small_status?: hardware_state | null;
	turn_signal_status?: hardware_state | null;
	memory_percentage?: number | null;
	save_to_memory_status?: hardware_state | null;
	battery_percentage?: number | null;
	ext_temp?: number | null;
	connection_employee_id?: string | null;
}

export const createBox = async (args: CreateBoxArgs) => {
	const box = await prisma.box.create({
		data: {
			box_display_id: args.box_display_id,
			name: args.name,
			vertical_id: args.vertical_id,
			client_id: args.client_id,
			vehicle_number: args.vehicle_number,
			status: args.status,
			connection_employee_id: args.connection_employee_id,
			telemetry: {
				create: {
					power_status: args.power_status,
					health_status: args.health_status,
					ioniser_status: args.ioniser_status,
					gyrosensor_status: args.gyrosensor_status,
					wifi_status: args.wifi_status,
					bluetooth_status: args.bluetooth_status,
					sim_status: args.sim_status,
					gps_status: args.gps_status,
					solar_status: args.solar_status,
					camera_status: args.camera_status,
					adas_status: args.adas_status,
					port_big_status: args.port_big_status,
					port_small_status: args.port_small_status,
					turn_signal_status: args.turn_signal_status,
					memory_percentage: args.memory_percentage,
					save_to_memory_status: args.save_to_memory_status,
					advert_screen_status: args.advert_screen_status,
					battery_percentage: args.battery_percentage,
					ext_temp: args.ext_temp,
				},
			},
		},
		include: {
			vertical: true,
			telemetry: true,
		},
	});

	requireMongoDB("BoxConfig.create");
	await BoxConfig.create({
		box_id: box.id,
		client_id: args.client_id ?? null,
	});

	await prisma.box_lock.create({
		data: {
			box_id: box.id,
			lock_status: "unlocked",
		},
	});

	return box;
};


interface UpdateBoxArgs {
	id: string;
	box_display_id?: string;
	name?: string | null;
	client_id?: string | null;
	vehicle_number?: string | null;
	status?: box_status;
	power_status?: hardware_state | null;
	health_status?: box_health_status | null;
	ioniser_status?: hardware_state | null;
	gyrosensor_status?: hardware_state | null;
	wifi_status?: hardware_state | null;
	bluetooth_status?: hardware_state | null;
	sim_status?: hardware_state | null;
	gps_status?: hardware_state | null;
	solar_status?: hardware_state | null;
	camera_status?: hardware_state | null;
	adas_status?: hardware_state | null;
	port_big_status?: hardware_state | null;
	port_small_status?: hardware_state | null;
	turn_signal_status?: hardware_state | null;
	memory_percentage?: number | null;
	save_to_memory_status?: hardware_state | null;
	advert_screen_status?: hardware_state | null;
	battery_percentage?: number | null;
	ext_temp?: number | null;
	connection_employee_id?: string | null;
}

export const updateBox = async (args: UpdateBoxArgs) => {
	args = nullifyEmptyFKs(args);

	const telemetryData = {
		power_status: args.power_status,
		health_status: args.health_status,
		ioniser_status: args.ioniser_status,
		gyrosensor_status: args.gyrosensor_status,
		wifi_status: args.wifi_status,
		bluetooth_status: args.bluetooth_status,
		sim_status: args.sim_status,
		gps_status: args.gps_status,
		solar_status: args.solar_status,
		camera_status: args.camera_status,
		adas_status: args.adas_status,
		port_big_status: args.port_big_status,
		port_small_status: args.port_small_status,
		turn_signal_status: args.turn_signal_status,
		memory_percentage: args.memory_percentage,
		save_to_memory_status: args.save_to_memory_status,
		advert_screen_status: args.advert_screen_status,
		battery_percentage: args.battery_percentage,
		ext_temp: args.ext_temp,
	};

	// Remove undefined fields to avoid overwriting with null unless intended
	const filteredTelemetry = Object.fromEntries(
		Object.entries(telemetryData).filter(([_, v]) => v !== undefined)
	);

	return prisma.box.update({
		where: {
			id: args.id,
		},
		data: {
			box_display_id: args.box_display_id,
			name: args.name,
			client_id: args.client_id,
			vehicle_number: args.vehicle_number,
			status: args.status,
			connection_employee_id: args.connection_employee_id,
			...(Object.keys(filteredTelemetry).length > 0 ? {
				telemetry: {
					upsert: {
						create: filteredTelemetry,
						update: filteredTelemetry,
					},
				},
			} : {}),
		},
		include: {
			vertical: true,
			telemetry: true,
		},
	});
};


interface ToggleAssignBoxesArgs {
	client_id: string | null;
	box_ids: string[];
}

export const toggleAssignBoxes = async (args: ToggleAssignBoxesArgs) => {
	const { client_id, box_ids } = args;

	if (!Array.isArray(box_ids) || box_ids.length === 0) {
		throw new APIError("No boxes provided", undefined, undefined, 400);
	}

	return prisma.$transaction(async (tx) => {
		// Always fetch boxes first so we can enforce business rules (active-only) deterministically.
		const boxes = await tx.box.findMany({
			where: {
				id: { in: box_ids },
			},
			select: {
				id: true,
				vertical_id: true,
				status: true,
				client_id: true,
			},
		});

		const foundBoxIds = new Set(boxes.map((b) => b.id));
		const missing = box_ids.filter((id) => !foundBoxIds.has(id));
		if (missing.length > 0) {
			throw new APIError(`Some boxes were not found: ${missing.slice(0, 5).join(", ")}`, undefined, undefined, 404);
		}

		if (client_id) {
			// Active-only enforcement
			const inactive = boxes.filter((b) => b.status !== "active");
			if (inactive.length > 0) {
				throw new APIError(
					"Only active boxes can be assigned.",
					undefined,
					undefined,
					400
				);
			}

			const client = await getUniqueClient({ id: client_id });
			if (!client) {
				throw new APIError("Client not found", undefined, undefined, 404);
			}
			for (const box of boxes) {
				if (box.vertical_id !== client.vertical_id) {
					throw new APIError(undefined, "delivery.box.VERTICAL_MISMATCH", undefined, 400);
				}
				if (box.client_id && box.client_id !== client_id) {
					throw new APIError(
						"One or more boxes are already assigned to another client.",
						undefined,
						undefined,
						409,
					);
				}
			}
		}

		// Sync BoxConfig.client_id to match assignment state
		try {
			if (client_id) {
				requireMongoDB("BoxConfig.updateMany");
				await BoxConfig.updateMany(
					{ box_id: { $in: box_ids } },
					{ $set: { client_id } },
				);
			} else {
				requireMongoDB("BoxConfig.updateMany");
				await BoxConfig.updateMany(
					{ box_id: { $in: box_ids } },
					{ $unset: { client_id: "" } },
				);
			}
		} catch (err) {
			logger.warn(`MongoDB BoxConfig update failed during box assignment: ${err}`);
		}

		// Single source of truth for this module’s "assignment" UI is box.client_id.
		// However, we must also clear dependent assignment relations on unassign so the UI and lists stay consistent.
		if (client_id === null) {
			// Clear any restaurant-level assignments and employee-level shares tied to these boxes.
			await tx.restaurant_box.updateMany({
				where: {
					box_id: { in: box_ids },
				},
				data: {
					status: "not_shared",
				},
			});

			await tx.vertical_delivery_employee_box.updateMany({
				where: {
					box_id: { in: box_ids },
					status: "shared",
				},
				data: {
					status: "blocked",
				},
			});
		}

		return tx.box.updateMany({
			where: {
				id: { in: box_ids },
			},
			data: {
				client_id,
			},
		});
	});
};


interface DeleteBoxesArgs {
	box_ids: string[];
}

export const deleteBoxes = async (args: DeleteBoxesArgs) => {
	const boxes = await prisma.box.findMany({
		where: {
			id: {
				in: args.box_ids,
			},
		},
		include: {
			client: true,
			vertical: true,
		},
	});

	let assignedClients = 0;

	for (const box of boxes) {
		if (box.client_id && args.box_ids.length === 1) {
			throw new APIError(undefined, "delivery.box.CLIENT_ASSIGNED", undefined, 400);
		} else if (box.client_id) {
			assignedClients++;
		}
	}

	if (assignedClients > 0) {
		throw new APIError(undefined, "delivery.box.BULK_CLIENT_ASSIGNED", { count: assignedClients }, 400);
	}

	// Archive boxes to box_deleted, then delete — atomic to avoid ghost archive rows on failure
	return prisma.$transaction(async (tx) => {
		await tx.box_deleted.createMany({
			data: boxes.map((box) => ({
				id: box.id,
				name: box.name,
				box_display_id: box.box_display_id,
				vertical_id: box.vertical_id,
				vertical_name: box.vertical?.name ?? "",
				client_id: box.client_id,
				client_name: box.client?.name ?? "",
				vehicle_number: box.vehicle_number,
				x_primary_key: box.id,
			})),
		});

		return tx.box.deleteMany({
			where: {
				id: {
					in: args.box_ids,
				},
			},
		});
	});
};

interface GetBoxesArgs {
	query?: string;
	verticals?: string[];
	state?: "assigned" | "unassigned";
	client_id?: string;
	pageNumber?: number;
	pageSize?: number;
	fetchAll?: boolean;
	ids?: string[];
}

interface GetBoxesResponse {
	boxes: any[];
	count: number;
}

export const getBoxes = async (
	args: GetBoxesArgs,
): Promise<GetBoxesResponse> => {
	const { fetchAll, pageSize, pageNumber, state, verticals, query, ids, client_id } =
		args;

	const boxesQueryArgs: Prisma.boxFindManyArgs = {
		where: {
			id: ids
				? {
					in: ids,
				}
				: undefined,
			OR: query
				? [
					{
						name: {
							contains: query,
						},
					},
					{
						client: {
							name: {
								contains: query,
							},
						},
					},
					{
						box_display_id: {
							contains: query,
						},
					},
				]
				: undefined,
			vertical_id: {
				in: verticals,
			},
			client_id: client_id
				? client_id
				: state
					? state === "assigned"
						? {
							not: null,
						}
						: null
					: undefined,
		},
		skip:
			!fetchAll && pageNumber && pageSize
				? (pageNumber - 1) * pageSize
				: undefined,
		take: pageSize ? pageSize : undefined,
		include: {
			client: true,
			vertical: true,
			connection_employee: true,
			vertical_delivery_employee_boxes: true,
			telemetry: true,
		},
	};

	const [boxesResponse, boxesCountResponse] = await Promise.allSettled([
		prisma.box.findMany(boxesQueryArgs),
		prisma.box.count({
			where: {
				...boxesQueryArgs.where,
			},
		}),
	]);

	if (boxesResponse.status === "rejected") {
		throw new APIError(String(boxesResponse.reason), undefined, undefined, 400);
	}

	if (boxesCountResponse.status === "rejected") {
		throw new APIError(String(boxesCountResponse.reason), undefined, undefined, 400);
	}

	return {
		boxes: boxesResponse.value.map((box) => {
			const { vertical_delivery_employee_boxes, connection_employee, telemetry, ...boxData } = (box as any);
			const { id: _telemetryId, box_id: _telemetryBoxId, updated_at: _telemetryUpdatedAt, ...telemetryData } = (telemetry || {}) as any;
			const boxWithTelemetry = { ...boxData, telemetry };
			const handler = getHandlerStatus(boxWithTelemetry);
			return {
				...boxData,
				...telemetryData,
				global_status: getGlobalStatus(boxWithTelemetry),
				handler_status: handler.status,
				handler_employee: handler.details,
				permissions: vertical_delivery_employee_boxes,
			};
		}),
		count: boxesCountResponse.value,
	};
};


export const clientHasBoxes = async (client_id: string) => {
	const count = await prisma.box.count({
		where: {
			client_id,
			status: { not: "suspended" },
		},
	});
	return count > 0;
};

export const getDeliveryEmployeeBoxes = async (employeeId: string) => {
	const assignments = await prisma.vertical_delivery_employee_box.findMany({
		where: {
			employee_id: employeeId,
		},
		include: {
			box: {
				include: {
					vertical: true,
					connection_employee: true,
					vertical_delivery_employee_boxes: true,
					telemetry: true,
				},
			},
		},
	});

	return assignments.map((a) => {
		const { vertical_delivery_employee_boxes, connection_employee, telemetry, ...boxData } = (a.box as any);
		const { id: _telemetryId, box_id: _telemetryBoxId, updated_at: _telemetryUpdatedAt, ...telemetryData } = (telemetry || {}) as any;
		const boxWithTelemetry = { ...boxData, telemetry };
		const handler = getHandlerStatus(boxWithTelemetry);
		return {
			...boxData,
			...telemetryData,
			global_status: getGlobalStatus(boxWithTelemetry),
			handler_status: handler.status,
			handler_employee: handler.details,
			permissions: vertical_delivery_employee_boxes,
		};
	});
};


export const DELIVERY_BOX_LIST_MAX_PAGE_SIZE = 50;
export const DELIVERY_BOX_LIST_DEFAULT_PAGE_SIZE = 50;
const MAX_DELIVERY_GROUP_KEYS = 100;

export const resolveDeliveryListPage = (page?: number) =>
	page && page > 0 ? page : 1;

export const resolveDeliveryListLimit = (limit?: number) => {
	if (!limit || limit <= 0) return DELIVERY_BOX_LIST_DEFAULT_PAGE_SIZE;
	return Math.min(limit, DELIVERY_BOX_LIST_MAX_PAGE_SIZE);
};

interface GetVerticalDeliveryBoxesArgs {
	client_id: string;
	status?: "active" | "suspended" | "";
	restaurant_id?: string | null;
	page_size?: number;
	page_number?: number;
	fetchAll?: boolean;
	include_configs?: boolean;
	connection_status?: string;
	connection_status_exclude?: string;
	power_status?: string;
	power_status_exclude?: string;
	health_status?: string;
	grublock_status?: string;
	grublock_status_exclude?: box_lock_status;
	restaurant_assigned?: boolean;
	vehicle_assigned?: boolean;
	ioniser_status?: string;
	dual_zone_status?: string;
	zone1_min?: number;
	zone1_max?: number;
	zone2_min?: number;
	zone2_max?: number;
	ext_min?: number;
	ext_max?: number;
	employee_id?: string | null;
	permission_status?: string;
	query?: string;
}

const buildDeliveryBoxWhereInput = async (
	args: GetVerticalDeliveryBoxesArgs,
): Promise<Prisma.boxWhereInput> => {
	const {
		client_id,
		status,
		restaurant_id,
		connection_status,
		connection_status_exclude,
		power_status,
		power_status_exclude,
		health_status,
		grublock_status,
		grublock_status_exclude,
		restaurant_assigned,
		vehicle_assigned,
		ioniser_status,
		dual_zone_status,
		zone1_min,
		zone1_max,
		zone2_min,
		zone2_max,
		ext_min,
		ext_max,
		employee_id,
		permission_status,
		query,
	} = args;

	const telemetryFilter: Prisma.box_telemetry_latestWhereInput = {};
	if (connection_status) {
		telemetryFilter.connection_status = connection_status as box_connection_status;
	}
	if (power_status) telemetryFilter.power_status = power_status as hardware_state;
	if (health_status) telemetryFilter.health_status = health_status as box_health_status;
	if (ioniser_status) telemetryFilter.ioniser_status = ioniser_status as hardware_state;
	if (dual_zone_status) telemetryFilter.dual_zone_status = dual_zone_status as hardware_state;

	if (zone1_min !== undefined || zone1_max !== undefined) {
		telemetryFilter.zone1_temp = { gte: zone1_min, lte: zone1_max };
	}
	if (zone2_min !== undefined || zone2_max !== undefined) {
		telemetryFilter.zone2_temp = { gte: zone2_min, lte: zone2_max };
	}
	if (ext_min !== undefined || ext_max !== undefined) {
		telemetryFilter.ext_temp = { gte: ext_min, lte: ext_max };
	}

	const employeeFilter: Prisma.boxWhereInput = employee_id
		? (await (async () => {
			const employee = await prisma.vertical_delivery_employee.findUnique({
				where: { id: employee_id, client_id },
				select: { role: true, restaurant_id: true },
			});

			if (employee?.role === "manager") {
				if (!employee.restaurant_id) return { id: { in: [] } };
				if (permission_status === "blocked") {
					return {
						vertical_delivery_employee_boxes: {
							some: {
								employee_id,
								status: "blocked",
							},
						},
					};
				}
				return {
					restaurant_boxes: { some: { restaurant_id: employee.restaurant_id } },
					NOT: {
						vertical_delivery_employee_boxes: {
							some: {
								employee_id,
								status: "blocked",
							},
						},
					},
				};
			}

			if (permission_status === "shared") {
				return {
					OR: [
						{ vertical_delivery_employee_boxes: { some: { employee_id, status: "shared", access: "direct" } } },
						{ vertical_delivery_employee_boxes: { some: { status: "shared", access: "public" } } },
						{ vertical_delivery_employee_boxes: { some: { status: "shared", access: "all_employees" } } },
					],
				};
			}

			return {
				vertical_delivery_employee_boxes: {
					some: {
						employee_id,
						...(permission_status ? { status: permission_status as employee_box_status } : {}),
					},
				},
			};
		})())
		: (permission_status
			? {
				vertical_delivery_employee_boxes: {
					some: {
						status: permission_status as employee_box_status,
					},
				},
			}
			: {});

	const { OR: employeeOr, ...employeeFilterRest } = employeeFilter;

	const searchOr: Prisma.boxWhereInput[] | undefined = query
		? [
			{ name: { contains: query } },
			{ box_display_id: { contains: query } },
			{ vehicle_number: { contains: query } },
			{
				restaurant_boxes: {
					some: {
						restaurant: { name: { contains: query } },
						status: "shared",
					},
				},
			},
		]
		: undefined;

	const andConditions: Prisma.boxWhereInput[] = [];
	if (employeeOr) andConditions.push({ OR: employeeOr });
	if (searchOr) andConditions.push({ OR: searchOr });
	if (connection_status_exclude) {
		andConditions.push({
			OR: [
				{ telemetry: { connection_status: { not: connection_status_exclude as box_connection_status } } },
				{ telemetry: { is: null } },
			],
		});
	}
	if (power_status_exclude) {
		andConditions.push({
			OR: [
				{ telemetry: { power_status: { not: power_status_exclude as hardware_state } } },
				{ telemetry: { is: null } },
			],
		});
	}

	let lockFilter: Prisma.boxWhereInput["lock"] | undefined;
	if (grublock_status) {
		lockFilter = { lock_status: grublock_status as box_lock_status };
	} else if (grublock_status_exclude) {
		andConditions.push({
			OR: [
				{ lock: { is: null } },
				{ lock: { lock_status: { not: grublock_status_exclude } } },
			],
		});
	}

	return {
		client_id,
		status: status || { not: "suspended" },
		restaurant_boxes:
			restaurant_assigned !== undefined
				? restaurant_assigned
					? { some: { status: "shared" } }
					: { none: { status: "shared" } }
				: restaurant_id
					? {
						some: {
							restaurant_id,
							status: "shared",
						},
					}
					: undefined,
		vehicle_number:
			vehicle_assigned !== undefined
				? vehicle_assigned
					? { not: null }
					: null
				: undefined,
		...(Object.keys(telemetryFilter).length > 0 ? { telemetry: { is: telemetryFilter } } : {}),
		lock: lockFilter,
		...employeeFilterRest,
		...(andConditions.length > 0 ? { AND: andConditions } : {}),
	};
};

export interface GetDeliveryGrubpacListArgs extends GetVerticalDeliveryBoxesArgs {
	group_by?: "lock_status" | "restaurants" | "power_status" | "restaurant";
	group_by_selected_table?: string;
	group_by_restaurants_has_offline_box?: number;
}

type DeliveryGrubpacGroupPayload = {
	array: Awaited<ReturnType<typeof getVerticalDeliveryBoxes>>["boxes"];
	count: number;
	pagination: ReturnType<typeof calculatePagination>;
	name?: string;
	address?: string;
};

const restaurantSlug = (name: string) => name.toLowerCase().replace(/\s+/g, "_");

const fetchDeliveryBoxPage = async (args: GetVerticalDeliveryBoxesArgs) => {
	const page = resolveDeliveryListPage(args.page_number);
	const limit = resolveDeliveryListLimit(args.page_size);
	return getVerticalDeliveryBoxes({
		...args,
		page_number: page,
		page_size: limit,
		fetchAll: false,
	});
};

export const getDeliveryGrubpacList = async (args: GetDeliveryGrubpacListArgs) => {
	const page = resolveDeliveryListPage(args.page_number);
	const limit = resolveDeliveryListLimit(args.page_size);
	const baseArgs: GetVerticalDeliveryBoxesArgs = {
		...args,
		page_number: page,
		page_size: limit,
		fetchAll: false,
		...(args.group_by_restaurants_has_offline_box === 0
			? { connection_status_exclude: "disconnected" }
			: {}),
	};

	if (!args.group_by) {
		const result = await fetchDeliveryBoxPage(baseArgs);
		return {
			boxes: result.boxes,
			count: result.count,
			total_count: result.count,
			pagination: calculatePagination(page, limit, result.count),
		};
	}

	if (args.group_by === "power_status") {
		const requested = args.group_by_selected_table;
		const keys =
			requested === "on" || requested === "off"
				? [requested]
				: requested
					? [requested]
					: (["on", "off"] as const);

		const groups: Record<string, DeliveryGrubpacGroupPayload> = {};
		let totalCount = 0;

		await Promise.all(
			keys.map(async (key) => {
				if (key !== "on" && key !== "off") return;
				const result = await fetchDeliveryBoxPage({
					...baseArgs,
					include_configs: true,
					power_status: key === "on" ? "on" : undefined,
					power_status_exclude: key === "off" ? "on" : undefined,
				});
				totalCount += result.count;
				if (result.count > 0 || requested) {
					groups[key] = {
						array: result.boxes,
						count: result.count,
						pagination: calculatePagination(page, limit, result.count),
					};
				}
			}),
		);

		return { boxes: [], count: totalCount, total_count: totalCount, groups };
	}

	if (args.group_by === "lock_status") {
		const requested = args.group_by_selected_table;
		const keys =
			requested === "locked" || requested === "unlocked"
				? [requested]
				: requested
					? [requested]
					: (["locked", "unlocked"] as const);

		const groups: Record<string, DeliveryGrubpacGroupPayload> = {};
		let totalCount = 0;

		await Promise.all(
			keys.map(async (key) => {
				if (key !== "locked" && key !== "unlocked") return;
				const result = await fetchDeliveryBoxPage({
					...baseArgs,
					grublock_status: key === "locked" ? "locked" : undefined,
					grublock_status_exclude: key === "unlocked" ? "locked" : undefined,
				});
				totalCount += result.count;
				if (result.count > 0 || requested) {
					groups[key] = {
						array: result.boxes,
						count: result.count,
						pagination: calculatePagination(page, limit, result.count),
					};
				}
			}),
		);

		return { boxes: [], count: totalCount, total_count: totalCount, groups };
	}

	const requestedTable = args.group_by_selected_table;
	const groups: Record<string, DeliveryGrubpacGroupPayload> = {};

	if (requestedTable === "unassigned") {
		const result = await fetchDeliveryBoxPage({
			...baseArgs,
			restaurant_assigned: false,
		});
		if (result.count > 0 || requestedTable) {
			groups.unassigned = {
				array: result.boxes,
				count: result.count,
				pagination: calculatePagination(page, limit, result.count),
				name: "Unassigned",
			};
		}
		return {
			boxes: [],
			count: result.count,
			total_count: result.count,
			groups,
		};
	}

	if (requestedTable) {
		const restaurants = await prisma.restaurant.findMany({
			where: { client_id: args.client_id },
			select: { id: true, name: true, full_address: true },
		});
		const matched = restaurants.find(
			(r) =>
				restaurantSlug(r.name) === requestedTable || r.name === requestedTable,
		);
		if (!matched) {
			return { boxes: [], count: 0, total_count: 0, groups: {} };
		}

		const slug = restaurantSlug(matched.name);
		const result = await fetchDeliveryBoxPage({
			...baseArgs,
			restaurant_id: matched.id,
		});
		groups[slug] = {
			array: result.boxes,
			count: result.count,
			pagination: calculatePagination(page, limit, result.count),
			name: matched.name,
			address: matched.full_address ?? undefined,
		};
		return {
			boxes: [],
			count: result.count,
			total_count: result.count,
			groups,
		};
	}

	const baseWhere = await buildDeliveryBoxWhereInput(baseArgs);
	const restaurantCounts = await prisma.restaurant_box.groupBy({
		by: ["restaurant_id"],
		where: {
			status: "shared",
			restaurant: { client_id: args.client_id },
			box: baseWhere,
		},
		_count: { _all: true },
	});

	const sortedRestaurantCounts = [...restaurantCounts]
		.sort((a, b) => b._count._all - a._count._all)
		.slice(0, MAX_DELIVERY_GROUP_KEYS);

	const restaurantIds = sortedRestaurantCounts.map((row) => row.restaurant_id);
	const restaurants = restaurantIds.length
		? await prisma.restaurant.findMany({
			where: { id: { in: restaurantIds }, client_id: args.client_id },
			select: { id: true, name: true, full_address: true },
		})
		: [];
	const restaurantById = new Map(restaurants.map((r) => [r.id, r]));

	let totalCountAcrossGroups = 0;

	await Promise.all(
		sortedRestaurantCounts.map(async (row) => {
			const restaurant = restaurantById.get(row.restaurant_id);
			if (!restaurant) return;

			const result = await fetchDeliveryBoxPage({
				...baseArgs,
				restaurant_id: row.restaurant_id,
			});
			const slug = restaurantSlug(restaurant.name);
			totalCountAcrossGroups += row._count._all;
			groups[slug] = {
				array: result.boxes,
				count: row._count._all,
				pagination: calculatePagination(page, limit, row._count._all),
				name: restaurant.name,
				address: restaurant.full_address ?? undefined,
			};
		}),
	);

	if (baseArgs.restaurant_assigned !== false && baseArgs.restaurant_id == null) {
		const unassigned = await fetchDeliveryBoxPage({
			...baseArgs,
			restaurant_assigned: false,
		});
		if (unassigned.count > 0) {
			totalCountAcrossGroups += unassigned.count;
			groups.unassigned = {
				array: unassigned.boxes,
				count: unassigned.count,
				pagination: calculatePagination(page, limit, unassigned.count),
				name: "Unassigned",
			};
		}
	}

	const [totalMatching] = await prisma.$transaction([
		prisma.box.count({ where: baseWhere }),
	]);

	return {
		boxes: [],
		count: totalCountAcrossGroups,
		total_count: totalMatching,
		groups,
	};
};

export const getVerticalDeliveryBoxes = async (args: GetVerticalDeliveryBoxesArgs) => {
	const {
		client_id,
		page_size,
		page_number,
		fetchAll,
		include_configs,
	} = args;

	const effectivePage = resolveDeliveryListPage(page_number);
	const effectivePageSize = resolveDeliveryListLimit(page_size);
	const where = await buildDeliveryBoxWhereInput(args);

	const boxesQueryArgs: Prisma.boxFindManyArgs = {
		where,

		skip: fetchAll ? undefined : (effectivePage - 1) * effectivePageSize,
		take: fetchAll ? undefined : effectivePageSize,
		include: {
			restaurant_boxes: {
				include: {
					restaurant: true,
				},
				where: {
					status: "shared"
				}
			},
			lock: true,
			vertical_delivery_employee_boxes: {
				select: {
					employee_id: true,
					status: true,
					access: true,
					created_at: true,
					updated_at: true,
				},
			},
			boxes: {
				include: {
					consumer: true,
				},
				orderBy: {
					created_at: "desc",
				},
				take: 1,
			},
			connection_employee: true,
			telemetry: true,
		},
	};

	logger.debug("Prisma Boxes Query Args:", JSON.stringify(boxesQueryArgs, null, 2));

	const [boxes, count] = await prisma.$transaction([
		prisma.box.findMany(boxesQueryArgs),
		prisma.box.count({
			where: {
				...boxesQueryArgs.where,
			},
		}),
	]);

	// Optimization: Only fetch necessary fields for all employees and create a map for O(1) lookup
	const allEmployees = await prisma.vertical_delivery_employee.findMany({
		where: { client_id, status: { not: "suspended" } },
		select: {
			id: true,
			restaurant_id: true,
			employee_display_id: true,
			first_name: true,
			last_name: true,
			role: true,
			created_at: true,
			updated_at: true,
		}
	});
	const employeeMap = new Map(allEmployees.map(e => [e.id, e]));

	const mapBox = (box: any) => {
		const { lock, vertical_delivery_employee_boxes, restaurant_boxes, boxes: consumerBoxes, connection_employee, telemetry, ...boxData } = box;
		const permissions = vertical_delivery_employee_boxes || [];
		const sharedPermissions = permissions.filter((p: any) => p.status === "shared");

		const restaurantIds = (restaurant_boxes || []).map((rb: any) => rb.restaurant_id);
		const boxWithTelemetry = { ...boxData, telemetry };
		const access_mode = calculateAccessMode(sharedPermissions, allEmployees, restaurantIds);

		const employees = permissions
			.map((p: any) => {
				const emp = employeeMap.get(p.employee_id);
				if (!emp) return null;
				return {
					...emp,
					employee_id: emp.employee_display_id,
					password: undefined,
				};
			})
			.filter(Boolean);

		const consumer_info = consumerBoxes?.[0]?.consumer || null;
		const global_status = getGlobalStatus(boxWithTelemetry);
		const handler = getHandlerStatus(boxWithTelemetry);
		const { id: _telemetryId, box_id: _telemetryBoxId, ...telemetryData } = (telemetry || {}) as any;

		const blockedPermissions = permissions.filter((p: any) => p.status === "blocked");

		return {
			...boxData,
			...telemetryData,
			box_id: boxData.box_display_id,
			global_status,
			handler_status: handler.status,
			handler_employee: handler.details,
			employees,
			access_mode,
			permissions_blocked: blockedPermissions,
			permissions_blocked_count: blockedPermissions.length,
			blocked_employee_ids: blockedPermissions
				.map((p: any) => p.employee_id)
				.filter(Boolean),
			grublock_status: lock?.lock_status || "unlocked",
			consumer_info,
			restaurants: (restaurant_boxes || [])
				.map((rb: any) => rb.restaurant ? withFullAddress(rb.restaurant) : null)
				.filter(Boolean),
		};
	};

	if (include_configs) {
		const boxIds = boxes.map((box) => box.id);
		requireMongoDB("BoxConfig.find");
		const configs = await BoxConfig.find({ box_id: { $in: boxIds } });

		const boxWithConfigs = boxes.map((box) => {
			const config = configs.find((c) => c.box_id === box.id);
			return {
				...mapBox(box),
				config: config ? config.toObject() : null,
			};
		});

		return { boxes: boxWithConfigs, count };
	}


	return { boxes: boxes.map(mapBox), count };
};

export const deleteVerticalDeliveryBoxes = async (ids: string[], client_id: string) => {
	const boxes = await prisma.box.findMany({
		where: {
			id: { in: ids },
			client_id: client_id,
		},
		include: {
			client: true,
			vertical: true,
		},
	});

	if (boxes.length === 0) {
		throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
	}

	// Archive boxes to box_deleted, then delete — atomic to avoid ghost archive rows on failure
	return prisma.$transaction(async (tx) => {
		await tx.box_deleted.createMany({
			data: boxes.map((box) => ({
				id: box.id,
				name: box.name,
				box_display_id: box.box_display_id,
				vertical_id: box.vertical_id,
				vertical_name: box.vertical?.name ?? "",
				client_id: box.client_id,
				client_name: box.client?.name ?? "",
				vehicle_number: box.vehicle_number,
				x_primary_key: box.id,
			})),
		});

		return tx.box.deleteMany({
			where: {
				id: { in: ids },
				client_id: client_id,
			},
		});
	});
};

export const reassignVerticalDeliveryBoxes = async (
	ids: string[],
	restaurant_id: string | null,
	client_id: string,
) => {
	return await prisma.$transaction(async (tx) => {
		// First verify box ownership by Client
		const boxes = await tx.box.findMany({
			where: { id: { in: ids }, client_id: client_id },
			select: { id: true },
		});

		if (boxes.length === 0) {
			throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
		}

		const boxIds = boxes.map((b) => b.id);

		let updatedCount = 0;
		let alreadyInStateCount = 0;

		const currentAssignments = await tx.restaurant_box.findMany({
			where: { box_id: { in: boxIds }, status: "shared" },
			select: { box_id: true, restaurant_id: true },
		});

		// Boxes already in the target restaurant
		const alreadyThere = currentAssignments.filter(a => a.restaurant_id === restaurant_id);
		alreadyInStateCount = alreadyThere.length;

		// Clear current 'shared' status for these boxes across ALL restaurants
		await tx.restaurant_box.updateMany({
			where: {
				box_id: { in: boxIds },
				status: "shared",
			},
			data: {
				status: "not_shared",
			},
		});

		if (restaurant_id) {
			const restaurant = await tx.restaurant.findUnique({
				where: { id: restaurant_id, client_id },
			});

			if (!restaurant) {
				throw new APIError(undefined, "delivery.restaurant.assign.manager.RESTAURANT_NOT_FOUND", undefined, 404);
			}

			// Assign boxes to the target restaurant
			for (const boxId of boxIds) {
				const existing = await tx.restaurant_box.findFirst({
					where: { box_id: boxId, restaurant_id },
				});

				if (existing) {
					await tx.restaurant_box.update({
						where: { id: existing.id },
						data: { status: "shared" },
					});
				} else {
					await tx.restaurant_box.create({
						data: {
							box_id: boxId,
							restaurant_id,
							status: "shared",
						},
					});
				}
			}
			updatedCount = boxIds.length - alreadyInStateCount;
		} else {
			// Unassigning
			updatedCount = currentAssignments.length;
			alreadyInStateCount = boxIds.length - currentAssignments.length;
		}

		if (updatedCount === 0) {
			throw new APIError(
				restaurant_id
					? "All selected boxes are already assigned to this restaurant."
					: "All selected boxes are already unassigned.",
				undefined,
				undefined,
				400
			);
		}

		return {
			updated_count: updatedCount,
			already_in_state_count: alreadyInStateCount,
			total_found: boxIds.length,
		};
	});
};

interface CreateVerticalDeliveryGrubpacArgs {
	name?: string;
	box_display_id: string;
	vehicle_number?: string | null;
	restaurant_ids: string[];
	blocked_employee_ids: string[];
	client_id: string;
	vertical_id: string;
	access_mode: "public" | "all_employees" | "restaurant_employees";
}

export const createVerticalDeliveryGrubpac = async (args: CreateVerticalDeliveryGrubpacArgs) => {
	const {
		name,
		box_display_id,
		vehicle_number,
		restaurant_ids,
		blocked_employee_ids,
		client_id,
		vertical_id,
		access_mode,
	} = args;

	return await prisma.$transaction(async (tx) => {
		const box = await tx.box.create({
			data: {
				box_display_id,
				name,
				vertical_id,
				client_id: client_id,
				vehicle_number,
				status: "active",
				lock: {
					create: {
						lock_status: "unlocked",
					},
				},
			},
			include: {
				lock: true,
			},
		});

		if (restaurant_ids.length > 0) {
			await tx.restaurant_box.createMany({
				data: restaurant_ids.map((id) => ({
					box_id: box.id,
					restaurant_id: id,
					status: "shared",
				})),
			});
		}

		if (blocked_employee_ids.length > 0) {
			await tx.vertical_delivery_employee_box.createMany({
				data: blocked_employee_ids.map((id) => ({
					box_id: box.id,
					employee_id: id,
					status: "blocked",
				})),
			});
		}

		// Handle access_mode
		if (access_mode === "public") {
			// Set all other entries to blocked
			await tx.vertical_delivery_employee_box.updateMany({
				where: { box_id: box.id, status: "shared" },
				data: { status: "blocked" }
			});
			// Upsert public record (where employee_id is null)
			await tx.vertical_delivery_employee_box.create({
				data: { box_id: box.id, employee_id: null, status: "shared", access: "public" }
			});
		} else if (access_mode === "all_employees") {
			// Set all other entries to blocked
			await tx.vertical_delivery_employee_box.updateMany({
				where: { box_id: box.id, status: "shared" },
				data: { status: "blocked" }
			});
			// Create all_employees record
			await tx.vertical_delivery_employee_box.create({
				data: { box_id: box.id, employee_id: null, status: "shared", access: "all_employees" }
			});
		} else if (access_mode === "restaurant_employees") {
			const employees = await tx.vertical_delivery_employee.findMany({
				where: {
					client_id,
					restaurant_id: { in: restaurant_ids },
				},
				select: { id: true },
			});

			if (employees.length > 0) {
				await tx.vertical_delivery_employee_box.createMany({
					data: employees.map((emp) => ({
						id: ulid(),
						box_id: box.id,
						employee_id: emp.id,
						status: "shared",
						access: "direct",
					})),
				});
			}
		} else {
			// Default is direct if not specified or "private"
			// (Assuming initial creation already handled blocked ids above)
		}

		requireMongoDB("BoxConfig.create");
		await BoxConfig.create({
			box_id: box.id,
			client_id,
		});

		return box;
	});
};

interface UpdateVerticalDeliveryGrubpacArgs {
	id: string;
	name?: string;
	box_display_id?: string;
	vehicle_number?: string | null;
	restaurant_ids?: string[];
	blocked_employee_ids?: string[];
	client_id: string;
	access_mode?: "public" | "all_employees" | "restaurant_employees";
	ext_temp?: number | null;
	connection_employee_id?: string | null;
}

export const updateVerticalDeliveryGrubpac = async (args: UpdateVerticalDeliveryGrubpacArgs) => {
	args = nullifyEmptyFKs(args);
	const {
		id,
		name,
		box_display_id,
		vehicle_number,
		restaurant_ids,
		blocked_employee_ids,
		client_id,
		access_mode,
		ext_temp,
		connection_employee_id,
	} = args;

	return await prisma.$transaction(async (tx) => {
		const box = await tx.box.findUnique({
			where: { id, client_id: client_id, status: { not: "suspended" } },
		});

		if (!box) {
			throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
		}

		const updatedBox = await tx.box.update({
			where: { id },
			data: {
				box_display_id: box_display_id ?? undefined,
				name: name ?? undefined,
				vehicle_number: vehicle_number !== undefined ? vehicle_number : undefined,
				connection_employee_id: connection_employee_id !== undefined ? connection_employee_id : undefined,
				...(ext_temp !== undefined ? {
					telemetry: {
						upsert: {
							create: { ext_temp },
							update: { ext_temp },
						},
					},
				} : {}),
			},
			include: {
				lock: true,
				telemetry: true,
			},
		});


		if (restaurant_ids !== undefined) {
			if (restaurant_ids.length > 0) {
				// Enforce tenant ownership: every restaurant must belong to the
				// same client as the box, otherwise a caller could link a box to
				// another tenant's restaurant (cross-tenant IDOR).
				const uniqueRestaurantIds = [...new Set(restaurant_ids)];
				const ownedCount = await tx.restaurant.count({
					where: {
						id: { in: uniqueRestaurantIds },
						client_id,
					},
				});

				if (ownedCount !== uniqueRestaurantIds.length) {
					throw new APIError(
						"One or more restaurants are invalid or do not belong to this account.",
						"delivery.box.INVALID_RESTAURANT",
						undefined,
						400,
					);
				}
			}

			await tx.restaurant_box.deleteMany({
				where: {
					box_id: id,
				},
			});

			if (restaurant_ids.length > 0) {
				await tx.restaurant_box.createMany({
					data: restaurant_ids.map((res_id) => ({
						box_id: id,
						restaurant_id: res_id,
						status: "shared",
					})),
				});
			}
		}

		if (blocked_employee_ids !== undefined) {
			await tx.vertical_delivery_employee_box.updateMany({
				where: {
					box_id: id,
					status: "blocked",
				},
				data: {
					status: "blocked",
				},
			});

			if (blocked_employee_ids.length > 0) {
				await Promise.all(
					blocked_employee_ids.map((emp_id) =>
						tx.vertical_delivery_employee_box.upsert({
							where: {
								employee_id_box_id: {
									employee_id: emp_id,
									box_id: id,
								},
							},
							update: {
								status: "blocked",
							},
							create: {
								box_id: id,
								employee_id: emp_id,
								status: "blocked",
							},
						})
					)
				);
			}
		}

		if (access_mode !== undefined) {
			// Update existing SHARED permissions to 'blocked'
			await tx.vertical_delivery_employee_box.updateMany({
				where: {
					box_id: id,
					status: "shared",
				},
				data: {
					status: "blocked",
				},
			});

			if (access_mode === "public") {
				await tx.vertical_delivery_employee_box.create({
					data: {
						box_id: id,
						employee_id: null,
						status: "shared",
						access: "public",
					},
				});
			} else if (access_mode === "all_employees") {
				await tx.vertical_delivery_employee_box.create({
					data: {
						box_id: id,
						employee_id: null,
						status: "shared",
						access: "all_employees",
					},
				});
			} else if (access_mode === "restaurant_employees") {
				// We need current restaurant_ids if they weren't passed
				let targetResIds = restaurant_ids;
				if (targetResIds === undefined) {
					const rbs = await tx.restaurant_box.findMany({ where: { box_id: id } });
					targetResIds = rbs.map((rb) => rb.restaurant_id);
				}

				const employees = await tx.vertical_delivery_employee.findMany({
					where: {
						client_id,
						restaurant_id: { in: targetResIds },
					},
					select: { id: true },
				});

				if (employees.length > 0) {
					const empIds = employees.map((emp) => emp.id);
					await tx.vertical_delivery_employee_box.deleteMany({
						where: {
							box_id: id,
							employee_id: { in: empIds },
						},
					});

					await tx.vertical_delivery_employee_box.createMany({
						data: employees.map((emp) => ({
							id: ulid(),
							box_id: id,
							employee_id: emp.id,
							status: "shared",
							access: "direct",
						})),
					});
				}
			}
		}

		// Recompute permission summary from the persisted state so the response
		// carries top-level access_mode + blocked_employee_ids for immediate UI
		// (avoids a stale read until the next full list refresh).
		const finalPermissions = await tx.vertical_delivery_employee_box.findMany({
			where: { box_id: id },
			select: { employee_id: true, status: true, access: true },
		});
		const finalRestaurantBoxes = await tx.restaurant_box.findMany({
			where: { box_id: id },
			select: { restaurant_id: true },
		});
		const clientEmployees = await tx.vertical_delivery_employee.findMany({
			where: { client_id, status: { not: "suspended" } },
			select: { id: true, restaurant_id: true },
		});

		const sharedPermissions = finalPermissions.filter((p) => p.status === "shared");
		const blockedEmployeeIds = finalPermissions
			.filter((p) => p.status === "blocked" && p.employee_id)
			.map((p) => p.employee_id as string);
		const resolvedAccessMode = calculateAccessMode(
			sharedPermissions,
			clientEmployees,
			finalRestaurantBoxes.map((rb) => rb.restaurant_id),
		);

		return {
			...updatedBox,
			access_mode: resolvedAccessMode,
			blocked_employee_ids: blockedEmployeeIds,
		};
	});
};

interface ActionGrubpacArgs {
	ids: string[];
	status?: box_status;
	power_status?: hardware_state;
	ioniser_status?: hardware_state;
	dual_zone_status?: hardware_state;
	zone1_temp?: number;
	zone2_temp?: number;
	assign_restaurant_id?: string | null;
	vehicle_number?: string | null;
	adas_status?: hardware_state;
	bluetooth_status?: hardware_state;
	camera_status?: hardware_state;
	gps_status?: hardware_state;
	gyrosensor_status?: hardware_state;
	save_to_memory_status?: hardware_state;
	sim_status?: hardware_state;
	solar_status?: hardware_state;
	wifi_status?: hardware_state;
	turn_signal_status?: hardware_state;
	advert_screen_status?: hardware_state;
	light_status?: hardware_state;
	port_small_status?: hardware_state;
	port_big_status?: hardware_state;
	ext_temp?: number;
	connection_employee_id?: string | null;
	client_id: string;
}


export const actionGrubpac = async (args: ActionGrubpacArgs) => {
	args = nullifyEmptyFKs(args);
	const {
		ids,
		status,
		power_status,
		ioniser_status,
		dual_zone_status,
		zone1_temp,
		zone2_temp,
		assign_restaurant_id,
		vehicle_number,
		adas_status,
		bluetooth_status,
		camera_status,
		gps_status,
		gyrosensor_status,
		save_to_memory_status,
		sim_status,
		solar_status,
		wifi_status,
		turn_signal_status,
		advert_screen_status,
		light_status,
		port_small_status,
		port_big_status,
		ext_temp,
		connection_employee_id,
		client_id,
	} = args;

	return await prisma.$transaction(async (tx) => {
		const updateResult = await tx.box.updateMany({
			where: {
				id: { in: ids },
				client_id: client_id,
				NOT: { status: "suspended" },
			},
			data: {
				status: status ?? undefined,
				vehicle_number: vehicle_number !== undefined ? vehicle_number : undefined,
				connection_employee_id: connection_employee_id !== undefined ? connection_employee_id : undefined,
			},
		});

		const telemetryUpdateData = {
			power_status: power_status ?? undefined,
			ioniser_status: ioniser_status ?? undefined,
			dual_zone_status: dual_zone_status ?? undefined,
			zone1_temp: zone1_temp ?? undefined,
			zone2_temp: zone2_temp ?? undefined,
			adas_status: adas_status ?? undefined,
			bluetooth_status: bluetooth_status ?? undefined,
			camera_status: camera_status ?? undefined,
			gps_status: gps_status ?? undefined,
			gyrosensor_status: gyrosensor_status ?? undefined,
			save_to_memory_status: save_to_memory_status ?? undefined,
			sim_status: sim_status ?? undefined,
			solar_status: solar_status ?? undefined,
			wifi_status: wifi_status ?? undefined,
			turn_signal_status: turn_signal_status ?? undefined,
			advert_screen_status: advert_screen_status ?? undefined,
			light_status: light_status ?? undefined,
			port_small_status: port_small_status ?? undefined,
			port_big_status: port_big_status ?? undefined,
			ext_temp: ext_temp ?? undefined,
		};

		const filteredTelemetry = Object.fromEntries(
			Object.entries(telemetryUpdateData).filter(([_, v]) => v !== undefined)
		);

		if (Object.keys(filteredTelemetry).length > 0) {
			await tx.box_telemetry_latest.updateMany({
				where: {
					box_id: { in: ids },
				},
				data: filteredTelemetry,
			});
		}


		if (assign_restaurant_id !== undefined) {
			// First delete existing assignments for these boxes
			await tx.restaurant_box.deleteMany({
				where: {
					box_id: { in: ids },
				},
			});

			// Then create new ones if a restaurant is provided
			if (assign_restaurant_id) {
				await tx.restaurant_box.createMany({
					data: ids.map((box_id) => ({
						box_id,
						restaurant_id: assign_restaurant_id,
						status: "shared",
					})),
				});
			}
		}

		return updateResult;
	});
};

interface GetVerticalDeliveryGrubpacDetailsArgs {
	id: string;
	client_id: string;
	user_id?: string;
	type?: string;
	with_permission_for_employee_id?: string;
}

export const getVerticalDeliveryGrubpacDetails = async (args: GetVerticalDeliveryGrubpacDetailsArgs) => {
	const { id, client_id, user_id, type, with_permission_for_employee_id } = args;

	const boxExists = await prisma.box.findUnique({
		where: { id },
		select: { client_id: true },
	});

	if (!boxExists) {
		throw new APIError("No such box found!", undefined, undefined, 404);
	}

	if (boxExists.client_id !== client_id) {
		throw new APIError(undefined, "delivery.common.ACCESS_DENIED", undefined, 403);
	}

	const box = await prisma.box.findUnique({
		where: {
			id,
		},
		include: {
			lock: true,
			vertical_delivery_employee_boxes: {
				include: {
					employee: true,
				},
			},
			restaurant_boxes: {
				include: {
					restaurant: true,
				},
			},
			boxes: {
				include: {
					consumer: true,
				},
				orderBy: {
					created_at: "desc",
				},
				take: 1,
			},
			connection_employee: true,
			telemetry: true,
		},
	});


	if (!box) {
		throw new APIError("Box not found", undefined, undefined, 404);
	}

	if (type !== "admin" && type !== "admin" && user_id) {
		const permission = await prisma.vertical_delivery_employee_box.findFirst({
			where: {
				box_id: id,
				employee_id: user_id,
			},
		});

		if (permission?.status === "blocked") {
			throw new APIError("Unauthorized access... please contact the admin", undefined, undefined, 403);
		}
	}

	const allEmployees = await prisma.vertical_delivery_employee.findMany({
		where: { client_id },
	});

	const { lock, vertical_delivery_employee_boxes, restaurant_boxes, boxes: consumerBoxes, connection_employee, telemetry, ...boxData } = box;
	const permissions = vertical_delivery_employee_boxes || [];
	const sharedPermissions = permissions.filter((p: any) => p.status === "shared");

	const restaurantIds = (restaurant_boxes || []).map((rb: any) => rb.restaurant_id);
	const boxWithTelemetry = { ...boxData, telemetry };
	const access_mode = calculateAccessMode(sharedPermissions, allEmployees, restaurantIds);

	const employees = permissions
		.filter((p: any) => p.employee)
		.map((p: any) => ({
			...p.employee,
			employee_id: p.employee.employee_display_id,
			password: undefined,
		}));

	const consumer_info = consumerBoxes?.[0]?.consumer || null;
	const global_status = getGlobalStatus(boxWithTelemetry);
	const handler = getHandlerStatus(boxWithTelemetry);
	const { id: _telemetryId, box_id: _telemetryBoxId, ...telemetryData } = (telemetry || {}) as any;
	const blockedEmployees = permissions
		.filter((p: any) => p.status === "blocked" && p.employee)
		.map((p: any) => ({
			...p.employee,
			employee_id: p.employee.employee_display_id,
			password: undefined,
		}));

	let permission_status: string | null = null;
	if (with_permission_for_employee_id) {
		const perm = permissions.find((p: any) => p.employee_id === with_permission_for_employee_id);
		permission_status = perm?.status === "blocked" ? "blocked" : null;
	}

	return {
		...boxData,
		...telemetryData,
		box_id: boxData.box_display_id,
		global_status,
		handler_status: handler.status,
		handler_employee: handler.details,
		employees,
		access_mode,
		permissions_blocked: blockedEmployees,
		permissions_blocked_count: blockedEmployees.length,
		blocked_employee_ids: permissions
			.filter((p: any) => p.status === "blocked" && p.employee_id)
			.map((p: any) => p.employee_id),
		permission_status: with_permission_for_employee_id ? permission_status : undefined,
		grublock_status: lock?.lock_status || "unlocked",
		consumer_info,
		restaurants: (restaurant_boxes || [])
			.map((rb: any) => rb.restaurant)
			.filter(Boolean),
	};
};

interface GetVerticalDeliveryGrubpacEditDetailsArgs {
	id: string;
	client_id: string;
}

export const getVerticalDeliveryGrubpacEditDetails = async (
	args: GetVerticalDeliveryGrubpacEditDetailsArgs,
) => {
	const { id, client_id } = args;

	const box = await prisma.box.findFirst({
		where: { id, client_id, status: { not: "suspended" } },
		select: {
			id: true,
			name: true,
			box_display_id: true,
			vehicle_number: true,
			restaurant_boxes: {
				where: { status: "shared" },
				select: { restaurant_id: true },
			},
			vertical_delivery_employee_boxes: {
				select: {
					employee_id: true,
					status: true,
					access: true,
				},
			},
		},
	});

	if (!box) {
		throw new APIError(undefined, "delivery.box.NOT_FOUND", undefined, 404);
	}

	const clientEmployees = await prisma.vertical_delivery_employee.findMany({
		where: { client_id },
		select: { id: true, restaurant_id: true },
	});

	const restaurant_ids = box.restaurant_boxes.map((rb) => rb.restaurant_id);
	const sharedPermissions = box.vertical_delivery_employee_boxes.filter(
		(p) => p.status === "shared",
	);
	const access_mode = calculateAccessMode(
		sharedPermissions,
		clientEmployees,
		restaurant_ids,
	);
	const blocked_employee_ids = box.vertical_delivery_employee_boxes
		.filter((p) => p.status === "blocked" && p.employee_id)
		.map((p) => p.employee_id as string);

	const blockedCount = blocked_employee_ids.length;
	const sharedCount = sharedPermissions.length;
	const totalCount = box.vertical_delivery_employee_boxes.length;

	return {
		id: box.id,
		name: box.name,
		box_id: box.box_display_id,
		vehicle_number: box.vehicle_number,
		restaurant_ids,
		access_mode,
		blocked_employee_ids,
		permissions_blocked_count: blockedCount,
		permissionSummary: {
			total: totalCount,
			blocked: blockedCount,
			shared: sharedCount,
		},
	};
};


export const suspendVerticalDeliveryBoxes = async (ids: string[], client_id: string) => {
	const currentBoxes = await prisma.box.findMany({
		where: { id: { in: ids }, client_id: client_id },
		select: { id: true, status: true, name: true, box_display_id: true, created_at: true, updated_at: true },
	});

	if (currentBoxes.length === 0) {
		throw new APIError("No boxes found", undefined, undefined, 404);
	}

	const alreadySuspended = currentBoxes.filter((b) => b.status === "suspended");
	const toUpdate = currentBoxes.filter((b) => b.status !== "suspended");

	if (toUpdate.length === 0) {
		throw new APIError("All selected boxes are already suspended.", undefined, undefined, 400);
	}

	await prisma.box.updateMany({
		where: { id: { in: toUpdate.map((b) => b.id) } },
		data: { status: "suspended" },
	});

	return {
		updated_boxes: toUpdate,
		already_in_state_count: alreadySuspended.length,
	};
};

export const reactivateVerticalDeliveryBoxes = async (ids: string[], client_id: string, reassign?: boolean) => {
	const currentBoxes = await prisma.box.findMany({
		where: { id: { in: ids }, client_id: client_id },
		select: { id: true, status: true, name: true, box_display_id: true, created_at: true, updated_at: true },
	});

	if (currentBoxes.length === 0) {
		throw new APIError("No boxes found", undefined, undefined, 404);
	}

	const alreadyActive = currentBoxes.filter((b) => b.status === "active");
	const toUpdate = currentBoxes.filter((b) => b.status !== "active");

	if (toUpdate.length === 0) {
		throw new APIError("All selected boxes are already active.", undefined, undefined, 400);
	}

	if (reassign === false) {
		await prisma.restaurant_box.deleteMany({
			where: { box_id: { in: toUpdate.map((b) => b.id) } },
		});
	}

	await prisma.box.updateMany({
		where: { id: { in: toUpdate.map((b) => b.id) } },
		data: { status: "active" },
	});

	return {
		updated_boxes: toUpdate,
		already_in_state_count: alreadyActive.length,
	};
};

export interface SearchVerticalDeliveryBoxesArgs {
	query?: string;
	limit?: number;
	status?: box_status;
	client_id: string;
}

export const searchVerticalDeliveryBoxes = async (args: SearchVerticalDeliveryBoxesArgs) => {
	const { query = "", limit = SEARCH_PAGE_SIZE, status, client_id } = args;
	const effectiveLimit = Math.min(Math.max(1, limit), SEARCH_PAGE_SIZE);

	return await prisma.box.findMany({
		where: {
			client_id: client_id,
			status: status || { not: "suspended" },
			OR: [
				{
					name: {
						contains: query,
					},
				},
				{
					box_display_id: {
						contains: query,
					},
				},
			],
		},
		select: {
			id: true,
			name: true,
			box_display_id: true,
			status: true,
			created_at: true,
			updated_at: true,
		},
		take: effectiveLimit,
	});
};

export const updateBoxLockStatus = async (args: {
	ids: string[];
	lock_status: string;
	user: { id: string; email: string; name: string };
	reason?: string;
	client_id: string;
	consumer?: {
		full_name: string;
		country_code: string;
		phone: string;
	};
}) => {
	const { ids, lock_status, user, reason, client_id, consumer } = args;

	return await prisma.$transaction(async (tx) => {
		// First verify these boxes belong to the client
		const boxes = await tx.box.findMany({
			where: {
				id: { in: ids },
				client_id: client_id,
				NOT: { status: "suspended" },
			},
			select: { id: true },
		});

		const validIds = boxes.map((b) => b.id);

		if (validIds.length === 0) {
			throw new APIError("No valid boxes found to update", undefined, undefined, 404);
		}

		await tx.box_lock.updateMany({
			where: {
				box_id: { in: validIds },
			},
			data: {
				lock_status: lock_status as box_lock_status,
			},
		});

		// Sync MongoDB BoxConfig.grublock to mirror the authoritative Prisma lock_status
		if (lock_status === "locked" || lock_status === "unlocked") {
			await BoxConfig.updateMany(
				{ box_id: { $in: validIds } },
				{ $set: { grublock: lock_status } },
			);
		}

		// Handle consumer details if provided (only for locking)
		if (lock_status === "locked") {
			if (consumer && consumer.full_name) {
				const country_code = consumer.country_code || "";
				const phone = consumer.phone || "";

				const consumerRecord = await tx.vertical_delivery_consumer.upsert({
					where: {
						phone_country_code: {
							phone,
							country_code,
						},
					},
					update: {
						full_name: consumer.full_name,
						status: "pending",
						client_id,
					},
					create: {
						full_name: consumer.full_name,
						country_code,
						phone,
						status: "pending",
						client_id,
					},
				});

				await tx.vertical_delivery_consumer_box.createMany({
					data: validIds.map((box_id) => ({
						id: ulid(),
						box_id,
						consumer_id: consumerRecord.id,
					})),
				});
			}
		} else if (lock_status === "unlocked") {
			// Find consumers linked to these boxes and update status to delivered if they are pending
			const consumerLinks = await tx.vertical_delivery_consumer_box.findMany({
				where: { box_id: { in: validIds } },
			});

			const consumerIds = Array.from(new Set(consumerLinks.map((l) => l.consumer_id)));
			if (consumerIds.length > 0) {
				await tx.vertical_delivery_consumer.updateMany({
					where: {
						id: { in: consumerIds },
						status: "pending",
					},
					data: { status: "delivered" },
				});
			}
		}

		// Log actions to MongoDB after successful database updates
		for (const boxId of validIds) {
			const box = await tx.box.findUnique({ where: { id: boxId } });
			await loggerService.log({
				category: "GrubLock",
				type: lock_status === "unlocked" && reason ? "Emergency unlock" : "Status",
				actor: {
					id: user.id,
					name: user.name,
					role: (user as any).role,
					table: (user as any).type === "admin" ? "client" : "vertical_delivery_employee",
					ip: (user as any).ip,
				},
				client_id: (user as any).client_id || client_id,
				subject: {
					id: boxId,
					name: box?.name || "Unknown Box",
					type: "box",
				},
				metadata: {
					action: lock_status === "unlocked" ? (reason ? "emergency_unlock" : "unlock") : "lock",
					reason: reason ?? null,
					lock_status,
					recipient: consumer ? `${consumer.full_name}, ${consumer.phone}` : "No Recepient Info",
				},
			});
		}

		return { count: validIds.length };
	});
};


/**
 * Generic function to update box-employee relationship status.
 * If employee_ids is null or empty, unassign all current shared employees for the given boxes (set to "blocked").
 */
export const updateBoxEmployeeStatus = async (
	box_ids: string[],
	employee_ids: string[],
	status: employee_box_status,
	client_id: string,
) => {
	return await prisma.$transaction(async (tx) => {
		// 1. Verify boxes belong to the client
		const boxes = await tx.box.findMany({
			where: {
				id: { in: box_ids },
				client_id: client_id,
				NOT: { status: "suspended" },
			},
			select: { id: true },
		});

		if (boxes.length === 0) {
			throw new APIError("No valid boxes found", undefined, undefined, 404);
		}

		// 2. Verify employees belong to the client
		const employees = await tx.vertical_delivery_employee.findMany({
			where: {
				id: { in: employee_ids },
				client_id,
			},
			select: { id: true },
		});

		if (employees.length === 0) {
			throw new APIError("No valid employees found", undefined, undefined, 404);
		}

		const validBoxIds = boxes.map((b) => b.id);
		const validEmployeeIds = employees.map((e) => e.id);

		// Partial update: only touch the specifically requested assignments
		for (const box_id of validBoxIds) {
			for (const employee_id of validEmployeeIds) {
				await tx.vertical_delivery_employee_box.upsert({
					where: {
						employee_id_box_id: {
							employee_id,
							box_id,
						},
					},
					update: {
						status,
					},
					create: {
						employee_id,
						box_id,
						status,
					},
				});
			}
		}

		return { count: validBoxIds.length * validEmployeeIds.length };
	});
};

/**
 * Reassign employees to boxes.
 */
export const reassignBoxEmployees = async (
	box_ids: string[],
	employee_ids: string[],
	client_id: string,
) => {
	return updateBoxEmployeeStatus(box_ids, employee_ids, "shared", client_id);
};

/**
 * Block employees from boxes.
 */
export const blockBoxEmployees = async (
	box_ids: string[],
	employee_ids: string[],
	client_id: string,
) => {
	return updateBoxEmployeeStatus(box_ids, employee_ids, "blocked", client_id);
};

/**
 * Remove employees from boxes (set to blocked).
 */
export const removeBoxEmployees = async (
	box_ids: string[],
	employee_ids: string[],
	client_id: string,
) => {
	return updateBoxEmployeeStatus(box_ids, employee_ids, "blocked", client_id);
};


