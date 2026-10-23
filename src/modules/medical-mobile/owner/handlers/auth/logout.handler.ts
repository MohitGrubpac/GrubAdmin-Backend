import { createHandlers } from "@/utils/hono-factory";
import type { APIResponse } from "@/types/api";
import { medicalMobileAuthGuard } from "@/middlewares/auth";
import { invalidateMedicalMobileClientSessions } from "@/modules/medical-mobile/auth/medical-mobile-session.ts";

export const logoutHandler = createHandlers(
	medicalMobileAuthGuard(["admin"], "owner"),
	async (context) => {
		const client_id = context.get("client_id");
		await invalidateMedicalMobileClientSessions(client_id);

		return context.json<APIResponse>(
			{
				success: true,
				code: 200,
				message: "Logged out successfully",
			},
			{ status: 200 },
		);
	},
);
