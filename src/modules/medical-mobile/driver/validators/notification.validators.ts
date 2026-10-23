import { validatorErrorHandler } from "@/utils/zod";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { pageLimitFields } from "@/validators/pagination.ts";

export const getNotificationsRequestQueryValidator = zValidator(
	"query",
	z.object({
		page: pageLimitFields.page.default(1),
		limit: pageLimitFields.limit.default(10),
		box_ids: z.string().optional(), // Comma-separated
		types: z.string().optional(), // Comma-separated (warning,error,success,notification)
		categories: z.string().optional(), // Comma-separated (camera,battery,lock,display,other)
		start_date: z.string().optional(), // ISO string
		end_date: z.string().optional(), // ISO string
	}),
	(r) => {
		if (!r.success) validatorErrorHandler(r.error);
	},
);

export const markNotificationsRequestBodyValidator = zValidator(
	"json",
	z.object({
		ids: z.array(z.string().min(1)),
		is_dismissed: z.boolean().optional(),
		is_read: z.boolean().optional(),
	}).refine(data => data.is_dismissed !== undefined || data.is_read !== undefined, {
		message: "Either is_dismissed or is_read must be provided"
	}),
	(r) => {
		if (!r.success) validatorErrorHandler(r.error);
	},
);

export const createTestNotificationBodyValidator = zValidator(
	"json",
	z.object({
		box_id: z.string().optional(),
		category: z.enum(["camera", "battery", "lock", "display", "other"]).optional(),
		type: z.enum(["warning", "error", "success", "notification"]).optional().default("notification"),
		title: z.string().min(1),
		description: z.string().min(1),
	}),
	(r) => {
		if (!r.success) validatorErrorHandler(r.error);
	},
);
