import { MEDICAL_MOBILE_OTP_TTL_SECONDS } from "@/modules/medical-mobile/constants/box-settings.ts";

export const maskEmailRecipient = (email: string): string => {
	const trimmed = email.trim();
	const at = trimmed.indexOf("@");
	if (at <= 1) return "***";
	const local = trimmed.slice(0, at);
	const domain = trimmed.slice(at + 1);
	const maskedLocal =
		local.length <= 2 ? `${local[0] ?? ""}*` : `${local[0]}***${local[local.length - 1]}`;
	return `${maskedLocal}@${domain}`;
};

export const buildMedicalLockOtpChallengeMeta = (args: {
	otp_id: string;
	created_at: Date;
	recipient: string;
	recipient_type: "email" | "test";
}) => {
	const expires_at = new Date(
		args.created_at.getTime() + MEDICAL_MOBILE_OTP_TTL_SECONDS * 1000,
	).toISOString();

	return {
		challenge_id: args.otp_id,
		expires_at,
		cooldown_seconds: MEDICAL_MOBILE_OTP_TTL_SECONDS,
		recipient: {
			type: args.recipient_type,
			masked: args.recipient_type === "email" ? maskEmailRecipient(args.recipient) : args.recipient,
		},
	};
};
