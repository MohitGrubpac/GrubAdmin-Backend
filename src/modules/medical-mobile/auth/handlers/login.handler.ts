import { createHandlers } from "@/utils/hono-factory";
import { loginRequestBodyValidator } from "@/modules/medical-mobile/driver/validators/auth.validators";
import { getUniqueMedicalEmployee } from "@/db/actions/medical/employee.actions";
import { APIError } from "@/types/error";
import { Bcrypt } from "@/utils/bcrypt.ts";
import { JWT } from "@/utils/jwt.ts";
import type { APIResponse } from "@/types/api";
import {
	assertOwnerAdmin,
	getOwnerClientId,
	type MedicalOwnerEmployee,
} from "@/modules/medical-mobile/owner/handlers/auth/auth.utils.ts";
import {
	assertHandlerEmployee,
	getHandlerClientId,
	type MedicalHandlerEmployee,
} from "@/modules/medical-mobile/driver/handlers/auth/auth.utils.ts";
import {
	MEDICAL_MOBILE_API_PREFIX,
	resolveMedicalMobilePersona,
	type MedicalMobilePersona,
} from "../persona.utils.ts";

interface ResponseData {
	auth_token: string;
	refresh_token?: string;
	is_password_set: boolean;
}

export const loginHandler = createHandlers(loginRequestBodyValidator, async (context) => {
	const { email, phone, password } = context.req.valid("json");

	const employee = await getUniqueMedicalEmployee({ email, phone });
	const persona = resolveMedicalMobilePersona(employee);

	if (!employee) {
		throw new APIError("No employee can be found!", undefined, undefined, 400);
	}
	if (!persona) {
		throw new APIError(
			"Unauthorized access... please contact the admin",
			undefined,
			undefined,
			403,
		);
	}

	if (persona === "owner") {
		assertOwnerAdmin(employee);
	} else {
		assertHandlerEmployee(employee);
	}

	if (!employee.employee.password) {
		return context.json(
			{
				success: false,
				code: 400,
				message:
					"Please login using OTP and set a password first to login using password",
			},
			{ status: 400 },
		);
	}

	const isCorrectPassword = await Bcrypt.compareHash({
		data: password,
		hashedValue: employee.employee.password,
	});

	if (!isCorrectPassword) {
		throw new APIError(
			"Invalid login credentials, the I'd and the password does not match",
			undefined,
			undefined,
			401,
		);
	}

	const payload =
		persona === "owner"
			? ({
					id: (employee as MedicalOwnerEmployee).employee.id,
					role: "admin" as const,
					persona: "owner" as const,
				} as const)
			: ({
					id: (employee as MedicalHandlerEmployee).employee.id,
					role: "handler" as const,
					persona: "driver" as const,
				} as const);

	const token = JWT.signMedicalMobileAuthToken(payload);
	const refreshToken = JWT.signMedicalMobileRefreshToken(payload);

	const client_id =
		persona === "owner"
			? getOwnerClientId(employee as MedicalOwnerEmployee)
			: getHandlerClientId(employee as MedicalHandlerEmployee);

	return context.json<
		APIResponse<ResponseData> & {
			persona: MedicalMobilePersona;
			api_prefix: string;
		}
	>({
		success: true,
		code: 200,
		client_id,
		persona,
		api_prefix: MEDICAL_MOBILE_API_PREFIX[persona],
		data: {
			auth_token: token,
			refresh_token: refreshToken,
			is_password_set: true,
		},
	});
});
