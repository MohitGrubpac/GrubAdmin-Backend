import type { MedicalEmployeeRoleType } from "../common";

export interface MedicalMobileAuthPayload {
	id: string;
	role: MedicalEmployeeRoleType;
	persona?: "driver" | "owner";
	token_version?: number;
}
