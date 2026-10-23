import { createHandlers } from "@/utils/hono-factory.ts";
import { medicalMobileAuthGuard } from "@/middlewares/auth";
import { postEmergencyAlert } from "@/db/actions/medical-mobile/emergency.actions.ts";
import { postEmergencyAlertBodyValidator } from "@/modules/medical-mobile/driver/validators/emergency.validators.ts";
import type { APIResponse } from "@/types/api";
import type { MedicalEmergencyAlertResponse } from "@/types/medical-mobile/emergency";
import type { client } from "@/db/types";

export const postAlertHandler = createHandlers(
	medicalMobileAuthGuard(["admin"], "owner"),
	postEmergencyAlertBodyValidator,
	async (context) => {
		const client_id = context.get("client_id");
		const user_id = context.get("user_id");
		const user = context.get("user") as client;
		const payload = context.req.valid("json");

		const data = await postEmergencyAlert({
			client_id,
			employee_id: user_id,
			employee_email: user.email ?? "",
			actor_role: "owner",
			payload,
		});

		return context.json<APIResponse<MedicalEmergencyAlertResponse>>(
			{
				success: true,
				code: 200,
				message: "Emergency alert dispatched",
				data,
			},
			{ status: 200 },
		);
	},
);
