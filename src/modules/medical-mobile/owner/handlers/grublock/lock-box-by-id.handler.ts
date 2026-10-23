import { loggerService } from "@/services/system-log.ts";
import { createHandlers } from "@/utils/hono-factory.ts";
import { medicalMobileAuthGuard } from "@/middlewares/auth";
import { patchOwnerBoxLock } from "@/db/actions/medical-mobile/owner-box.actions.ts";
import {
	boxIdParamValidator,
	boxLockActionBodyValidator,
} from "@/modules/medical-mobile/owner/validators/box.validators.ts";
import type { APIResponse } from "@/types/api";
import type { client } from "@/db/types";
import { getOwnerDisplayName } from "@/modules/medical-mobile/owner/handlers/auth/auth.utils.ts";

interface LockReadback {
	id: string;
	is_locked: boolean;
}

export const lockBoxByIdHandler = createHandlers(
	medicalMobileAuthGuard(["admin"], "owner"),
	boxIdParamValidator,
	boxLockActionBodyValidator,
	async (context) => {
		const user_id = context.get("user_id");
		const client_id = context.get("client_id");
		const user = context.get("user") as client;
		const { box_id } = context.req.valid("param");
		const { action } = context.req.valid("json");

		const data = await patchOwnerBoxLock({
			box_id,
			client_id,
			action,
			user: {
				id: user_id,
				email: user.email?.trim() ?? "",
				name: getOwnerDisplayName(user),
			},
		});

		try {
			await loggerService.log({
				category: "GrubLock",
				type: "Status",
				actor: {
					id: user_id,
					name: user.email || "Owner",
					role: "owner",
					table: "client",
				},
				client_id,
				subject: { id: box_id, name: box_id, type: "box" },
				metadata: { action },
			});
		} catch {
			// Do not block response for logging failure
		}

		return context.json<APIResponse<LockReadback>>(
			{
				success: true,
				code: 200,
				message: action === "lock" ? "Box locked successfully" : "Box unlocked successfully",
				data,
			},
			{ status: 200 },
		);
	},
);
