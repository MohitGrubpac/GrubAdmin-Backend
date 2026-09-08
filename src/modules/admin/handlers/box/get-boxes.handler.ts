import { createHandlers } from "@/utils/hono-factory.ts";
import { authGuard } from "@/middlewares/auth";
import { getBoxesRequestQueryValidator } from "@/modules/admin/validators/box.validators.ts";
import { getBoxes } from "@/db/actions/box.actions.ts";
import type { box } from "@/db/types";
import type { APIResponse } from "@/types/api";
import { calculatePagination } from "@/utils/pagination.ts";
import { Permission } from "@/utils/permission.ts";
import { GRUBPACS_PERMISSIONS, BOX_VERTICALS } from "@/configs/constants.ts";
import { getVerticals } from "@/db/actions/vertical.actions.ts";

interface ResponseData {
	boxes: box[];
	count: number;
}

export const getBoxesHandler = createHandlers(
	authGuard(["admin", "employee"]),
	getBoxesRequestQueryValidator,
	async (context) => {
		const { admin } = context.var;
		const { query, page_size, page_number, state, verticals, client_id } =
			context.req.valid("query");

		const perms = Permission.checkAdminPermissions({
			admin,
			permissions_allowed: {
				grubpac: [GRUBPACS_PERMISSIONS.view_grubpacs],
				verticals: (typeof verticals === "string" ? [verticals] : verticals) as any,
			},
		});

		const allowedVerticalNames = !perms.is_super_admin
			? new Set(Permission.getAllowedVerticalNames(perms.perm))
			: null;

		const allVerticals = allowedVerticalNames
			? await getVerticals()
			: [];
		const allowedVerticalIds = allowedVerticalNames
			? allVerticals
					.filter((vertical) =>
						allowedVerticalNames.has(
							vertical.name.toLowerCase() as (typeof BOX_VERTICALS)[number],
						),
					)
					.map((vertical) => vertical.id)
			: undefined;

		const requestedVerticals =
			typeof verticals === "string" ? [verticals] : verticals;
		const effectiveVerticals = requestedVerticals?.length
			? allowedVerticalIds
				? requestedVerticals.filter((id) => allowedVerticalIds.includes(id))
				: requestedVerticals
			: allowedVerticalIds;

		if (effectiveVerticals && effectiveVerticals.length === 0) {
			return context.json<APIResponse<ResponseData>>(
				{
					success: true,
					code: 200,
					data: { boxes: [], count: 0 },
					pagination: calculatePagination(page_number, page_size, 0),
				},
				{ status: 200 },
			);
		}

		const boxesData = await getBoxes({
			query,
			pageSize: page_size,
			pageNumber: page_number,
			state,
			verticals: effectiveVerticals,
			client_id,
		});

		return context.json<APIResponse<ResponseData>>(
			{
				success: true,
				code: 200,
				data: {
					...boxesData,
					boxes: boxesData.boxes.map((b) => ({
						...b,
						box_id: (b as any).box_display_id,
					})) as any,
				},
				pagination: calculatePagination(page_number, page_size, boxesData.count),
			},
			{
				status: 200,
			},
		);
	},
);
