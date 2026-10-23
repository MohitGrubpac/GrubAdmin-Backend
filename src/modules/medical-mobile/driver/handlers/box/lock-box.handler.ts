import { loggerService } from "@/services/system-log.ts";
import { createHandlers } from "@/utils/hono-factory.ts";
import { medicalMobileAuthGuard } from "@/middlewares/auth";
import { patchHandlerBoxLock } from "@/db/actions/medical-mobile/box.actions.ts";
import {
	boxIdParamValidator,
	boxLockActionBodyValidator,
} from "@/modules/medical-mobile/driver/validators/box.validators.ts";
import type { APIResponse } from "@/types/api";

interface LockReadback {
	id: string;
	is_locked: boolean;
}

export const lockBoxHandler = createHandlers(
	medicalMobileAuthGuard(["handler"], "driver"),
	boxIdParamValidator,
	boxLockActionBodyValidator,
	async (context) => {
		const user_id = context.get("user_id");
		const client_id = context.get("client_id");
		const user = context.get("user") as {
			email?: string;
			first_name?: string;
			last_name?: string;
		};
		const employeeEmail = user.email?.trim() ?? "";
		const employeeName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
		const { box_id } = context.req.valid("param");
		const { action } = context.req.valid("json");

		const data = await patchHandlerBoxLock({
			box_id,
			client_id,
			employee_id: user_id,
			action,
			user: {
				id: user_id,
				email: employeeEmail,
				name: employeeName,
			},
		});

		try {
			await loggerService.log({
				category: "GrubLock",
				type: "Status",
				actor: {
					id: user_id,
					name: employeeEmail || "Handler",
					role: "handler",
					table: "vertical_medical_employee",
				},
				client_id,
				subject: { id: data.id, name: box_id, type: "box" },
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
