import { createHandlers } from "@/utils/hono-factory";
import { loginRequestBodyValidator } from "@/modules/medical-mobile/owner/validators/auth.validators";
import { getUniqueMedicalEmployee } from "@/db/actions/medical/employee.actions";
import { APIError } from "@/types/error";
import { Bcrypt } from "@/utils/bcrypt.ts";
import { signMedicalMobileSessionTokens } from "@/modules/medical-mobile/auth/medical-mobile-session.ts";
import type { APIResponse } from "@/types/api";
import { assertOwnerAdmin, getOwnerClientId } from "./auth.utils.ts";

interface ResponseData {
	auth_token: string;
	refresh_token?: string;
	is_password_set: boolean;
}

export const loginHandler = createHandlers(loginRequestBodyValidator, async (context) => {
	const { email, phone, password } = context.req.valid("json");

	const employee = await getUniqueMedicalEmployee({ email, phone });
	assertOwnerAdmin(employee);

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

	const client_id = getOwnerClientId(employee);
	const { auth_token: token, refresh_token: refreshToken } =
		await signMedicalMobileSessionTokens({
			id: employee.employee.id,
			role: "admin",
			persona: "owner",
			client_id,
		});

	return context.json<APIResponse<ResponseData>>({
		success: true,
		code: 200,
		client_id,
		data: {
			auth_token: token,
			refresh_token: refreshToken,
			is_password_set: true,
		},
	});
});
