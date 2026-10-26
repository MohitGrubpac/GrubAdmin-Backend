import { createHandlers } from "@/utils/hono-factory.ts";
import { campingAuthGuard } from "@/middlewares/auth/camping-auth-guard.ts";
import { getNotificationsRequestQueryValidator } from "@/modules/camp-consumer/validators/notification.validators.ts";
import { getCampingConsumerNotifications } from "@/db/actions/camp-consumer/notification.actions.ts";
import type { notification_category, notification_type } from "@/db/prisma";

export const getNotificationsHandler = createHandlers(
	campingAuthGuard(),
	getNotificationsRequestQueryValidator,
	async (context) => {
		const user_id = context.get("user_id");
		const client_id = context.get("client_id");
		const { page, limit, box_ids, types, categories, start_date, end_date } =
			context.req.valid("query");

		const result = await getCampingConsumerNotifications({
			client_id,
			consumer_id: user_id,
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
