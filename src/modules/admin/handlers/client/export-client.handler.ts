import { createHandlers } from "@/utils/hono-factory.ts";
import { authGuard } from "@/middlewares/auth";
import { exportClientRequestQueryValidator } from "@/modules/admin/validators/client.validators";
import { getClients } from "@/db/actions/client.actions.ts";
import { json2csv } from "json-2-csv";
import { Permission } from "@/utils/permission.ts";
import { CLIENTS_PERMISSIONS, BOX_VERTICALS } from "@/configs/constants.ts";
import { services } from "@/services";
import { ipMiddleware } from "@/middlewares/common/ip.ts";
import { sanitizeCsvValue } from "@/utils/string.ts";
import { resolveAdminExportPagination, ADMIN_EXPORT_MAX_ROWS } from "@/modules/admin/configs/admin-export-limits.ts";

export const exportClientHandler = createHandlers(
	authGuard(["admin", "employee"]),
	exportClientRequestQueryValidator,
	ipMiddleware,
	async (context) => {
		const {
			query,
			fetch_all,
			order,
			order_factor,
			filter,
			page_size,
			page_number,
		} = context.req.valid("query");

		const { admin, role, ip } = context.var;

		const perms = Permission.checkAdminPermissions({
			admin,
			permissions_allowed: {
				verticals: typeof filter === "string" ? [filter] : filter,
				clients: [CLIENTS_PERMISSIONS.export_clients_list],
			},
		});

		const exportPagination = resolveAdminExportPagination({
			fetch_all,
			page_number,
			page_size,
		});

		const data = await getClients({
			query,
			pageSize: exportPagination.page_size,
			fetch_all: exportPagination.fetch_all,
			pageNumber: exportPagination.page_number,
			maxPageSize: ADMIN_EXPORT_MAX_ROWS,
			filter: filter
				? typeof filter === "string"
					? [filter]
					: filter
				: !perms.is_super_admin
					? (Permission.getAllowedVerticalDbNames(perms.perm) as typeof BOX_VERTICALS[number][])
					: undefined,
			order,
			orderingFactor: order_factor,
			omit: {
				password: true,
			},
		});

		const formattedClients = data.clients.map((c) => {
			const { password, ...safeClient } = c as any;
			return {
				...safeClient,
				client_id: safeClient.client_display_id,
			};
		});

		const sanitizedClients = formattedClients.map((c) => sanitizeCsvValue(c));

		const csv = json2csv(sanitizedClients, {
			emptyFieldValue: null,
			delimiter: {
				field: ",",
				wrap: '"', // ensures commas in text are safely escaped
			},
		});

		services.adminLogger.log({
			module: "client",
			action: "export",
			admin_id: admin?.id,
			admin_name: `${admin?.first_name} ${admin?.last_name}`,
			role_id: admin?.role_id,
			role_name: role?.name,
			ip,
		});

		context.header("Content-Type", "text/csv; charset=utf-8");
		context.header(
			"Content-Disposition",
			`attachment; filename="clients.csv"`,
		);

		return context.body(csv);
	},
);
