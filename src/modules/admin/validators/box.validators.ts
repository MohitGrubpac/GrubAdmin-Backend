import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validatorErrorHandler } from "@/utils/zod.ts";
import { BOX_VERTICALS, LONG_PAGE_SIZE, PAGE_SIZE } from "@/configs/constants.ts";

export const createBoxRequestBodyValidator = zValidator(
	"json",
	z.object({
		box_id: z
			.string({
				error: "box_id is required",
			})
			.trim()
			.min(1, "Box ID cannot be empty"),
		name: z
			.string({
				error: "name is required",
			})
			.trim()
			.min(1, "Name cannot be empty")
			.max(30, "Name must not be greater than 30 characters")
			.optional(),
		vertical: z.ulid({
			error: "Please provide a valid vertical id (ULID format expected, e.g. 01KBQDHRG48S8MTJ3JWS1E00PD)",
		}),
		vehicle_number: z.string().trim().optional().nullable(),
		status: z.string().trim().optional().default("active"),
		power_status: z.string().trim().optional().nullable(),
		health_status: z.string().trim().optional().nullable(),
		ioniser_status: z.string().trim().optional().nullable(),
		battery_percentage: z.coerce
			.number({ error: "Battery percentage must be a number" })
			.int("Battery percentage must be an integer between 0 and 100")
			.min(0, "Battery percentage must be between 0 and 100")
			.max(100, "Battery percentage must be between 0 and 100")
			.optional()
			.nullable(),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const updateBoxRequestBodyValidator = zValidator(
	"json",
	z.object({
		box_id: z
			.string({
				error: "box_id is required",
			})
			.trim()
			.min(1, "Box ID cannot be empty")
			.optional(),
		name: z
			.string({
				error: "name is required",
			})
			.trim()
			.min(1, "Name cannot be empty")
			.max(30, "Name must not be greater than 30 characters")
			.optional()
			.nullable(),
		vehicle_number: z.string().trim().optional().nullable(),
		status: z.string().trim().optional(),
		power_status: z.string().trim().optional().nullable(),
		health_status: z.string().trim().optional().nullable(),
		ioniser_status: z.string().trim().optional().nullable(),
		battery_percentage: z.coerce
			.number({ error: "Battery percentage must be a number" })
			.int("Battery percentage must be an integer between 0 and 100")
			.min(0, "Battery percentage must be between 0 and 100")
			.max(100, "Battery percentage must be between 0 and 100")
			.optional()
			.nullable(),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const updateBoxRequestParamValidator = zValidator(
	"param",
	z.object({
		id: z.ulid("Please provide a box id"),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const removeBoxesAssignmentRequestBodyValidator = zValidator(
	"json",
	z.object({
		box_ids: z.ulid("Please provide a valid id").array(),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const assignBoxesRequestBodyValidator = zValidator(
	"json",
	z.object({
		box_ids: z.ulid("Please provide a valid id").array(),
		customer: z.ulid("Please provide a valid id"),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const deleteBoxesRequestBodyValidator = zValidator(
	"json",
	z.object({
		box_ids: z.ulid("Please provide a valid id").array(),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const getBoxesRequestQueryValidator = zValidator(
	"query",
	z.object({
		query: z
			.string({
				error: "Please provide a query",
			})
			.trim()
			.optional(),
		page_number: z.coerce
			.number("Please provide a page number")
			.int("Page number must an integer")
			.nonnegative("Page number cannot be negative")
			.default(1),
		page_size: z.coerce
			.number("Please provide a page size")
			.int("Page size must an integer")
			.min(1, "Page size must be at least 1")
			.max(LONG_PAGE_SIZE, `page_size must be less than or equal to ${LONG_PAGE_SIZE}`)
			.default(PAGE_SIZE),
		state: z
			.union(
				[z.literal("assigned"), z.literal("unassigned")],
				"Please provide a valid state",
			)
			.optional(),
		verticals: z
			.union([
				z.ulid("Please provide a valid id"),
				z.ulid("Please provide a valid ids").array(),
			])
			.optional(),
		client_id: z.ulid("Please provide a valid client id").optional(),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);
