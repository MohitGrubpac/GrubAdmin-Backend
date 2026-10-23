import { createHandlers } from "@/utils/hono-factory.ts";
import { verifyOtpRequestBodyValidator } from "@/modules/medical-mobile/driver/validators/auth.validators.ts";
import {
	deleteSavedMedicalEmployeeOtp,
	getSavedMedicalEmployeeOtp,
	compareOtp,
} from "@/db/actions/medical-otp.actions.ts";
import { APIError } from "@/types/error";
import {
	activateMedicalEmployee,
	getUniqueMedicalEmployee,
} from "@/db/actions/medical/employee.actions";
import { signMedicalMobileSessionTokens } from "@/modules/medical-mobile/auth/medical-mobile-session.ts";
import type { APIResponse } from "@/types/api";
import { assertHandlerEmployee, getHandlerClientId } from "./auth.utils.ts";

interface ResponseData {
	auth_token: string;
	refresh_token?: string;
	otp_for_what: string;
	is_password_set: boolean;
}

export const verifyOtpHandler = createHandlers(verifyOtpRequestBodyValidator, async (context) => {
	const { email, phone, otp } = context.req.valid("json");

	const employee = await getUniqueMedicalEmployee({ email, phone });
	assertHandlerEmployee(employee);

	const employeeEmail = employee.employee.email;
	const savedOtp = await getSavedMedicalEmployeeOtp(employeeEmail);

	if (!savedOtp) {
		throw new APIError("OTP expired or invalid", undefined, undefined, 400);
	}

	const for_what = savedOtp.for_what;
	const isOtpValid = await compareOtp(otp, savedOtp.otp);
	if (!isOtpValid) {
		throw new APIError("Invalid otp", undefined, undefined, 400);
	}

	if (savedOtp.for_what !== "login") {
		throw new APIError("Invalid otp purpose", undefined, undefined, 401);
	}

	await deleteSavedMedicalEmployeeOtp(employeeEmail);

	if (employee.employee.status === "suspended") {
		throw new APIError("Your account has been suspended!", undefined, undefined, 403);
	}

	if (employee.employee.status === "unassigned") {
		await activateMedicalEmployee({
			id: employee.employee.id,
			email: employeeEmail,
			type: "handler",
		});
	}

	const client_id = getHandlerClientId(employee);
	const { auth_token: token, refresh_token: refreshToken } =
		await signMedicalMobileSessionTokens({
			id: employee.employee.id,
			role: "handler",
			persona: "driver",
			client_id,
		});

	return context.json<APIResponse<ResponseData>>({
		success: true,
		code: 200,
		client_id,
		data: {
			auth_token: token,
			refresh_token: refreshToken,
			otp_for_what: for_what,
			is_password_set: !!employee.employee.password,
		},
	});
});
