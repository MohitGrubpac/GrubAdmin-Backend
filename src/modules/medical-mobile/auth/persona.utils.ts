import type { GetUniqueMedicalEmployeeResponse } from "@/db/actions/medical/employee.actions";

export type MedicalMobilePersona = "owner" | "driver";

export const MEDICAL_MOBILE_API_PREFIX: Record<MedicalMobilePersona, string> = {
	owner: "medical-mobile/owner/",
	driver: "medical-mobile/driver/",
};

/** Owner = medical client admin; driver = handler employee. Other roles are not mobile personas. */
export function resolveMedicalMobilePersona(
	employee: GetUniqueMedicalEmployeeResponse,
): MedicalMobilePersona | null {
	if (!employee) {
		return null;
	}
	if (employee.type === "admin") {
		return "owner";
	}
	if (employee.type === "handler") {
		return "driver";
	}
	return null;
}
