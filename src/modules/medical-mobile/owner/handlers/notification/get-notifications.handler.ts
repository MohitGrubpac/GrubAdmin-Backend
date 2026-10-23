import { createHandlers } from "@/utils/hono-factory.ts";
import { medicalMobileAuthGuard } from "@/middlewares/auth";
import { getNotificationsRequestQueryValidator } from "@/modules/medical-mobile/owner/validators/notification.validators.ts";
import { getOwnerMobileNotifications } from "@/db/actions/medical-mobile/notification.actions.ts";
import type { notification_category, notification_type } from "@/db/prisma";

export const getNotificationsHandler = createHandlers(
	medicalMobileAuthGuard(["admin"], "owner"),
	getNotificationsRequestQueryValidator,
	async (context) => {
		const client_id = context.get("client_id");
		const { page, limit, box_ids, types, categories, start_date, end_date } =
			context.req.valid("query");

		const result = await getOwnerMobileNotifications({
			client_id,
			page,
			limit,
			filters: {
				box_ids: box_ids ? box_ids.split(",").map((id) => id.trim()).filter(Boolean) : undefined,
				types: types
					? (types.split(",").map((t) => t.trim()) as notification_type[])
					: undefined,
				categories: categories
					? (categories.split(",").map((c) => c.trim()) as notification_category[])
					: undefined,
				start_date,
				end_date,
			},
		});

		return context.json(
			{
				success: true,
				code: 200,
				message: "Notifications fetched successfully",
				data: result,
			},
			{ status: 200 },
		);
	},
);
