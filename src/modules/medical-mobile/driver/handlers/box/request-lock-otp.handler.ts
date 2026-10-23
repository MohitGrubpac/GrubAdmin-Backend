import { loggerService } from "@/services/system-log.ts";
import { createHandlers } from "@/utils/hono-factory.ts";
import { medicalMobileAuthGuard } from "@/middlewares/auth";
import { resolveHandlerBoxById } from "@/db/actions/medical-mobile/box.actions.ts";
import { saveMedicalEmployeeOtp } from "@/db/actions/medical-otp.actions.ts";
import {
	boxIdParamValidator,
	lockOtpBodyValidator,
} from "@/modules/medical-mobile/driver/validators/box.validators.ts";
import type { APIResponse } from "@/types/api";
import { APIError } from "@/types/error";
import { Otp } from "@/utils/otp.ts";
import { services } from "@/services";
import { buildMedicalLockOtpChallengeMeta } from "@/modules/medical-mobile/utils/otp-response.ts";

const DEV_LOCK_OTP = "1234";

interface LockOtpResponseData {
	otp?: string;
	otp_details: {
		type: string;
		values: string[];
	};
	challenge_id: string;
	expires_at: string;
	cooldown_seconds: number;
	recipient: {
		type: string;
		masked: string;
	};
}

/**
 * POST /boxes/:box_id/lock/otp (alias: .../otp-lock)
 * Request: { "action": "unlock" }
 */
export const requestLockOtpHandler = createHandlers(
	medicalMobileAuthGuard(["handler"], "driver"),
	boxIdParamValidator,
	lockOtpBodyValidator,
	async (context) => {
		const user_id = context.get("user_id");
		const client_id = context.get("client_id");
		const user = context.get("user") as { email?: string };
		const employeeEmail = user.email?.trim() ?? "";
		const { box_id } = context.req.valid("param");
		const { action } = context.req.valid("json");
		const isProduction = process.env.NODE_ENV === "production";

		const { box } = await resolveHandlerBoxById({
			box_id,
			client_id,
			employee_id: user_id,
		});

		const otp = isProduction ? Otp.generateOtp(4) : DEV_LOCK_OTP;

		if (isProduction && !employeeEmail) {
			throw new APIError("No email found for this account!", undefined, undefined, 400);
		}

		const updatedOtpRecord = await saveMedicalEmployeeOtp({
			email: employeeEmail,
			otp,
			role: "handler",
			for_what: "unlock_box",
			metadata: {
				ids: [box.id],
				box_display_id: box.box_display_id,
				action,
			},
		});

		if (!updatedOtpRecord) {
			return context.json<APIResponse<null>>(
				{ success: false, code: 500, error: "Failed to generate OTP" },
				{ status: 500 },
			);
		}

		const createdAt =
			updatedOtpRecord.createdAt instanceof Date
				? updatedOtpRecord.createdAt
				: new Date(updatedOtpRecord.createdAt ?? Date.now());

		const challengeMeta = buildMedicalLockOtpChallengeMeta({
			otp_id: String(updatedOtpRecord.otp_id ?? updatedOtpRecord._id),
			created_at: createdAt,
			recipient: isProduction ? employeeEmail : DEV_LOCK_OTP,
			recipient_type: isProduction ? "email" : "test",
		});

		if (isProduction) {
			await services.mailer.sendEmail({
				from: "ankan@sqaby.com",
				subject: "Medical Driver - GrubLock unlock OTP",
				to: employeeEmail,
				text: `Your OTP to unlock GrubLock on ${box.box_display_id} is ${otp}`,
			});
		}

		try {
			await loggerService.log({
				category: "GrubLock",
				type: "Status",
				actor: {
					id: user_id,
					name: employeeEmail || "Handler",
					role: "handler",
					table: "vertical_medical_employee",
				},
				client_id,
				subject: { id: box.id, name: box.box_display_id, type: "box" },
				metadata: { action, challenge_id: challengeMeta.challenge_id },
			});
		} catch {
			// logging must not block OTP response
		}

		const responseData: LockOtpResponseData = isProduction
			? {
					otp_details: {
						type: "email",
						values: [employeeEmail],
					},
					challenge_id: challengeMeta.challenge_id,
					expires_at: challengeMeta.expires_at,
					cooldown_seconds: challengeMeta.cooldown_seconds,
					recipient: challengeMeta.recipient,
				}
			: {
					otp: DEV_LOCK_OTP,
					otp_details: {
						type: "test",
						values: [DEV_LOCK_OTP],
					},
					challenge_id: challengeMeta.challenge_id,
					expires_at: challengeMeta.expires_at,
					cooldown_seconds: challengeMeta.cooldown_seconds,
					recipient: challengeMeta.recipient,
				};

		return context.json<APIResponse<LockOtpResponseData>>(
			{
				success: true,
				code: 200,
				message: "Unlock OTP sent successfully",
				data: responseData,
			},
			{ status: 200 },
		);
	},
);
