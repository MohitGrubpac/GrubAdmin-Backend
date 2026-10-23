import { prisma } from "@/db";
import { APIError } from "@/types/error";
import type { MedicalMobileAuthPayload } from "@/types/jwt/medical-mobile-auth-payload";
import type { MedicalEmployeeRoleType } from "@/types/common";
import { JWT } from "@/utils/jwt.ts";

export const fetchMedicalMobileClientAuthTokenVersion = async (
	client_id: string,
): Promise<number> => {
	const client = await prisma.client.findUnique({
		where: { id: client_id },
		select: { auth_token_version: true },
	});
	return client?.auth_token_version ?? 0;
};

export const buildMedicalMobileAuthPayload = async (args: {
	id: string;
	role: MedicalEmployeeRoleType;
	persona: "owner" | "driver";
	client_id: string;
}): Promise<MedicalMobileAuthPayload> => {
	const token_version = await fetchMedicalMobileClientAuthTokenVersion(args.client_id);
	return {
		id: args.id,
		role: args.role,
		persona: args.persona,
		token_version,
	};
};

export const invalidateMedicalMobileClientSessions = async (client_id: string): Promise<void> => {
	await prisma.client.update({
		where: { id: client_id },
		data: { auth_token_version: { increment: 1 } },
	});
};

export const signMedicalMobileSessionTokens = async (args: {
	id: string;
	role: MedicalEmployeeRoleType;
	persona: "owner" | "driver";
	client_id: string;
}) => {
	const payload = await buildMedicalMobileAuthPayload(args);
	return {
		auth_token: JWT.signMedicalMobileAuthToken(payload),
		refresh_token: JWT.signMedicalMobileRefreshToken(payload),
	};
};

export const assertMedicalMobileTokenVersion = (
	tokenVersion: number | undefined,
	currentVersion: number,
): void => {
	if ((tokenVersion ?? 0) !== (currentVersion ?? 0)) {
		throw new APIError("Session expired. Please sign in again.", undefined, undefined, 401);
	}
};
