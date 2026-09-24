import { createHandlers } from "@/utils/hono-factory.ts";
import { checkAccountRequestBodyValidator } from "@/modules/medical-mobile/driver/validators/auth.validators.ts";
import { getUniqueMedicalEmployee } from "@/db/actions/medical/employee.actions";
import type { APIResponse } from "@/types/api";
import {
	assertOwnerAdmin,
	sendOtpToOwner,
} from "@/modules/medical-mobile/owner/handlers/auth/auth.utils.ts";
import {
	assertHandlerEmployee,
	sendOtpToHandler,
} from "@/modules/medical-mobile/driver/handlers/auth/auth.utils.ts";
import {
	MEDICAL_MOBILE_API_PREFIX,
	resolveMedicalMobilePersona,
	type MedicalMobilePersona,
} from "../persona.utils.ts";

export const checkAccountHandler = createHandlers(
	checkAccountRequestBodyValidator,
	async (context) => {
		const { email, phone } = context.req.valid("json");

		const employee = await getUniqueMedicalEmployee({ email, phone });
		const persona = resolveMedicalMobilePersona(employee);
		const is_account_found = persona !== null;

		let is_password_set = false;
		if (persona === "owner" && employee?.type === "admin") {
			is_password_set = !!employee.employee.password;
		} else if (persona === "driver" && employee?.type === "handler") {
			is_password_set = !!employee.employee.password;
		}

		let message: string | undefined;

		if (persona === "owner" && employee?.type === "admin" && !is_password_set) {
			assertOwnerAdmin(employee);
			await sendOtpToOwner(employee);
			message = "OTP sent successfully.";
		} else if (persona === "driver" && employee?.type === "handler" && !is_password_set) {
			assertHandlerEmployee(employee);
			await sendOtpToHandler(employee);
			message = "OTP sent successfully.";
		}

		const body: APIResponse & {
			is_account_found: boolean;
			is_password_set: boolean;
			persona?: MedicalMobilePersona;
			api_prefix?: string;
			message?: string;
		} = {
			success: true,
			code: 200,
			is_account_found,
			is_password_set,
		};

		if (persona) {
			body.persona = persona;
			body.api_prefix = MEDICAL_MOBILE_API_PREFIX[persona];
		}
		if (message) {
			body.message = message;
		}

		return context.json(body, { status: 200 });
	},
);
