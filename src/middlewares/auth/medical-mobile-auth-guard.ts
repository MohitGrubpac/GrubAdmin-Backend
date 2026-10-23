import type { MedicalEmployeeRoleType } from "@/types/common";
import { createMiddleware } from "hono/factory";
import type { client, vertical_medical_employee } from "@/db/types";
import { APIError } from "@/types/error";
import { JWT } from "@/utils/jwt.ts";
import { getUniqueMedicalEmployee } from "@/db/actions/medical/employee.actions";
import { prisma } from "@/db";
import { logger } from "@/utils/logger";
import type { MedicalMobileAuthPayload } from "@/types/jwt/medical-mobile-auth-payload";
import { assertMedicalMobileTokenVersion } from "@/modules/medical-mobile/auth/medical-mobile-session.ts";

const MOBILE_ALLOWED_ROLES: MedicalEmployeeRoleType[] = ["handler", "admin"];

export const medicalMobileAuthGuard = (
	roles: MedicalEmployeeRoleType[] = MOBILE_ALLOWED_ROLES,
	persona?: MedicalMobileAuthPayload["persona"],
	customErrorMessage?: string,
) =>
	createMiddleware<{
		Variables: {
			user_id: string;
			client_id: string;
			vertical_id: string;
			user: client | vertical_medical_employee;
			type: MedicalEmployeeRoleType;
			persona?: MedicalMobileAuthPayload["persona"];
		};
	}>(async (context, next) => {
		const authToken = context.req.header("authorization")?.split(" ")[1];

		if (!authToken) {
			throw new APIError("Unauthenticated access", undefined, undefined, 401);
		}

		if (JWT.isImpersonationToken(authToken)) {
			throw new APIError(
				"Impersonation tokens are not supported on medical mobile routes",
				undefined,
				undefined,
				403,
			);
		}

		const tokenUser = JWT.verifyMedicalAuthToken(authToken) as MedicalMobileAuthPayload;
		const employee = await getUniqueMedicalEmployee({ id: tokenUser.id });

		if (!employee) {
			logger.error(`[Auth] Medical mobile employee lookup failed: userId=${tokenUser.id}`);
			throw new APIError("No employee found... unauthorized access", undefined, undefined, 403);
		}

		if (roles.length > 0 && !roles.includes(employee.type)) {
			logger.warn(
				`[Auth] Medical mobile role check failed: userId=${tokenUser.id} expectedType=${roles.join(",")} actualType=${employee.type}`,
			);
			throw new APIError(
				customErrorMessage || "Unauthorized access... please contact the admin",
				undefined,
				undefined,
				403,
			);
		}

		if (persona && tokenUser.persona !== persona) {
			throw new APIError(
				customErrorMessage || "Unauthorized access... please contact the admin",
				undefined,
				undefined,
				403,
			);
		}

		const client_id =
			employee.type === "admin"
				? (employee.employee as client).id
				: (employee.employee as vertical_medical_employee).client_id;

		if (!client_id) {
			logger.error(`[Auth] No client ID: userId=${tokenUser.id} employeeType=${employee.type}`);
			throw new APIError(
				"No client ID found associated with this account",
				undefined,
				undefined,
				403,
			);
		}

		const clientRecord = await prisma.client.findUnique({
			where: { id: client_id },
			select: { vertical_id: true, auth_token_version: true },
		});

		const currentTokenVersion = clientRecord?.auth_token_version ?? 0;
		assertMedicalMobileTokenVersion(tokenUser.token_version, currentTokenVersion);

		context.set("user", employee.employee);
		context.set("type", employee.type);
		context.set("user_id", tokenUser.id);
		context.set("client_id", client_id);
		context.set("vertical_id", clientRecord?.vertical_id || "");
		if (tokenUser.persona) context.set("persona", tokenUser.persona);

		await next();
	});
