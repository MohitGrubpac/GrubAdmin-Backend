import { authGuard } from "@/middlewares/auth";
import { createHandlers } from "@/utils/hono-factory";
import { getClientRequestQueryValidator } from "../../validators/client.validators";
import { getClients } from "@/db/actions/client.actions";
import type { APIResponse } from "@/types/api";
import { calculatePagination } from "@/utils/pagination.ts";
import type { client } from "@/db/types";
import { Permission } from "@/utils/permission.ts";
import { CLIENTS_PERMISSIONS, BOX_VERTICALS } from "@/configs/constants.ts";

interface ResponseData {
	customers: client[];
	count: number;
}

export const getClientsHandler = createHandlers(
	authGuard(["admin", "employee"]),
	getClientRequestQueryValidator,
	async (context) => {
		const { filter, order, order_factor, page_number, page_size, query } =
			context.req.valid("query");

		const { admin } = context.var;

		const perms = Permission.checkAdminPermissions({
			admin,
			permissions_allowed: {
				verticals: typeof filter === "string" ? [filter] : filter,
				clients: [CLIENTS_PERMISSIONS.view_clients_list],
			},
		});

		const clientsData = await getClients({
			query,
			order,
			orderingFactor: order_factor,
			pageNumber: page_number,
			pageSize: page_size,
			filter: filter
				? typeof filter === "string"
					? [filter]
					: filter
				: !perms.is_super_admin
					? (Permission.getAllowedVerticalDbNames(perms.perm) as typeof BOX_VERTICALS[number][])
					: undefined,
			omit: {
				password: true,
			},
		});

		return context.json<APIResponse<ResponseData>>(
			{
				success: true,
				code: 200,
				data: {
					...clientsData,
					customers: clientsData.clients.map((c) => {
						const { password, ...safeClient } = c as any;
						return {
							...safeClient,
							client_id: safeClient.client_display_id,
						};
					}),
				},
				pagination: calculatePagination(page_number, page_size, clientsData.count),
			},
			{
				status: 200,
			},
		);
	},
);
