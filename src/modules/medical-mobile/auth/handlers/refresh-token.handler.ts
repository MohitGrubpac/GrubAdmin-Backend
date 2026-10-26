import { createHandlers } from "@/utils/hono-factory";
import { refreshTokenRequestBodyValidator } from "@/modules/medical-mobile/driver/validators/auth.validators";
import { JWT } from "@/utils/jwt.ts";
import { APIError } from "@/types/error";
import { getUniqueMedicalEmployee } from "@/db/actions/medical/employee.actions";
import type { APIResponse } from "@/types/api";
import {
	assertMedicalMobileTokenVersion,
	buildMedicalMobileAuthPayload,
	fetchMedicalMobileClientAuthTokenVersion,
} from "@/modules/medical-mobile/auth/medical-mobile-session.ts";
import { resolveMedicalMobilePersona } from "@/modules/medical-mobile/auth/persona.utils.ts";
import {
	assertHandlerEmployee,
	getHandlerClientId,
	type MedicalHandlerEmployee,
} from "@/modules/medical-mobile/driver/handlers/auth/auth.utils.ts";
import {
	assertOwnerAdmin,
	getOwnerClientId,
	type MedicalOwnerEmployee,
} from "@/modules/medical-mobile/owner/handlers/auth/auth.utils.ts";

interface ResponseData {
	auth_token: string;
	refresh_token: string;
}

export const refreshTokenHandler = createHandlers(
	refreshTokenRequestBodyValidator,
	async (context) => {
		const { refresh_token } = context.req.valid("json");

		const decoded = JWT.verifyMedicalMobileRefreshToken(refresh_token);

		if (!decoded?.id) {
			throw new APIError("Invalid refresh token", undefined, undefined, 401);
		}

		const employee = await getUniqueMedicalEmployee({ id: decoded.id });

		if (!employee) {
			throw new APIError("Employee not found", undefined, undefined, 404);
		}

		const persona = resolveMedicalMobilePersona(employee);
		if (!persona) {
			throw new APIError("Employee not found", undefined, undefined, 404);
		}

		if (employee.employee.status !== "active") {
			throw new APIError("Employee is no longer active", undefined, undefined, 403);
		}

		if (persona === "owner") {
			assertOwnerAdmin(employee);
		} else {
			assertHandlerEmployee(employee);
		}

		const client_id =
			persona === "owner"
				? getOwnerClientId(employee as MedicalOwnerEmployee)
				: getHandlerClientId(employee as MedicalHandlerEmployee);

		const currentVersion = await fetchMedicalMobileClientAuthTokenVersion(client_id);
		assertMedicalMobileTokenVersion(decoded.token_version, currentVersion);

		const payload = await buildMedicalMobileAuthPayload({
			id: employee.employee.id,
			role: persona === "owner" ? "admin" : "handler",
			persona,
			client_id,
		});

		const newAuthToken = JWT.signMedicalMobileAuthToken(payload);
		const newRefreshToken = JWT.signMedicalMobileRefreshToken(payload);

		return context.json<APIResponse<ResponseData>>({
			success: true,
			code: 200,
			data: {
				auth_token: newAuthToken,
				refresh_token: newRefreshToken,
			},
		});
	},
);
