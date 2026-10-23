import { Hono } from "hono";
import { globalErrorHandler } from "@/middlewares/error";
import { createMobileRateLimits } from "@/middlewares/mobile-rate-limits";
import { getConfigHandler } from "@/modules/medical-mobile/owner/handlers/config/get-config.handler";
import {
	loginHandler,
	sendOtpHandler,
	verifyOtpHandler,
	sendForgetPasswordOtpHandler,
	verifyForgetPasswordOtpHandler,
	setNewPasswordHandler,
	resetPasswordHandler,
	checkAccountHandler,
	logoutHandler,
	refreshTokenHandler,
} from "@/modules/medical-mobile/owner/handlers/auth";
import { getProfileHandler } from "@/modules/medical-mobile/owner/handlers/account/get-profile.handler";
import { updateAccountHandler } from "@/modules/medical-mobile/owner/handlers/account/update-account.handler";
import { updatePasswordHandler } from "@/modules/medical-mobile/owner/handlers/account/update-password.handler";
import { deleteAccountHandler } from "@/modules/medical-mobile/owner/handlers/account/delete-account.handler";
import { getDashboardHandler } from "@/modules/medical-mobile/owner/handlers/dashboard/get-dashboard.handler";
import { getSupportCategoriesHandler } from "@/modules/medical-mobile/owner/handlers/support/get-support-categories.handler";
import { getSupportQuestionsHandler } from "@/modules/medical-mobile/owner/handlers/support/get-support-questions.handler";
import { getSupportAnswerHandler } from "@/modules/medical-mobile/owner/handlers/support/get-support-answer.handler";
import { listBoxesHandler } from "@/modules/medical-mobile/owner/handlers/box/list-boxes.handler";
import { claimBoxHandler } from "@/modules/medical-mobile/owner/handlers/box/claim-box.handler";
import { getBoxDetailsHandler } from "@/modules/medical-mobile/owner/handlers/box/get-box-details.handler";
import { removeBoxHandler } from "@/modules/medical-mobile/owner/handlers/box/remove-box.handler";
import { updateBoxSettingsHandler } from "@/modules/medical-mobile/owner/handlers/box/update-box-settings.handler";
import { connectBoxHandler } from "@/modules/medical-mobile/owner/handlers/box/connect-box.handler";
import { disconnectBoxHandler } from "@/modules/medical-mobile/owner/handlers/box/disconnect-box.handler";
import {
	getBoxLocationHandler,
	shareBoxLocationHandler,
	getBoxDiagnosticsHandler,
	getBoxAlertsHandler,
} from "@/modules/medical-mobile/owner/handlers/box/get-box-location.handler";
import { getCallMetadataHandler } from "@/modules/medical-mobile/owner/handlers/emergency/get-call-metadata.handler";
import { postAlertHandler as postOwnerEmergencyAlertHandler } from "@/modules/medical-mobile/owner/handlers/emergency/post-alert.handler";
import { lockBoxByIdHandler } from "@/modules/medical-mobile/owner/handlers/grublock/lock-box-by-id.handler";
import { lockGrublockHandler } from "@/modules/medical-mobile/owner/handlers/grublock/lock-box.handler";
import { emergencyUnlockHandler } from "@/modules/medical-mobile/owner/handlers/grublock/emergency-unlock.handler";
import { getNotificationsHandler } from "@/modules/medical-mobile/owner/handlers/notification/get-notifications.handler";
import { markNotificationsHandler } from "@/modules/medical-mobile/owner/handlers/notification/mark-notifications.handler";

export const medicalMobileOwnerRouter = new Hono();

const limits = createMobileRateLimits("medical-mobile-owner");

medicalMobileOwnerRouter.onError(globalErrorHandler);
medicalMobileOwnerRouter.use("*", limits.general);

medicalMobileOwnerRouter.get("/health", (context) =>
	context.json({
		success: true,
		code: 200,
		message: "Medical mobile owner API is up",
		data: { status: "up" },
	}),
);

/** Auth — admin role + owner persona only */
medicalMobileOwnerRouter.post("/auth/login", limits.auth, ...loginHandler);
medicalMobileOwnerRouter.post("/auth/send-otp", limits.auth, ...sendOtpHandler);
medicalMobileOwnerRouter.post("/auth/verify-otp", limits.auth, ...verifyOtpHandler);
medicalMobileOwnerRouter.post("/auth/resend-otp", limits.auth, ...sendOtpHandler);
medicalMobileOwnerRouter.post("/auth/forget-password/otp/send", limits.auth, ...sendForgetPasswordOtpHandler);
medicalMobileOwnerRouter.post("/auth/forget-password/otp/verify", limits.auth, ...verifyForgetPasswordOtpHandler);
medicalMobileOwnerRouter.post("/auth/forget-password/set-password", limits.auth, ...setNewPasswordHandler);
medicalMobileOwnerRouter.post("/auth/set-password", limits.auth, ...setNewPasswordHandler);
medicalMobileOwnerRouter.post("/auth/forget-password/otp/resend", limits.auth, ...sendForgetPasswordOtpHandler);
medicalMobileOwnerRouter.post("/auth/reset-password", limits.auth, ...resetPasswordHandler);
medicalMobileOwnerRouter.post("/auth/check-account", limits.auth, ...checkAccountHandler);
medicalMobileOwnerRouter.post("/auth/logout", ...logoutHandler);
medicalMobileOwnerRouter.post("/auth/refresh", ...refreshTokenHandler);

/** Account */
medicalMobileOwnerRouter.get("/account/me", ...getProfileHandler);
medicalMobileOwnerRouter.get("/profile", ...getProfileHandler);
medicalMobileOwnerRouter.put("/account", ...updateAccountHandler);
medicalMobileOwnerRouter.put("/account/password", ...updatePasswordHandler);
medicalMobileOwnerRouter.delete("/account", ...deleteAccountHandler);

/** Dashboard */
medicalMobileOwnerRouter.get("/dashboard", ...getDashboardHandler);

/** Support */
medicalMobileOwnerRouter.get("/support/category", ...getSupportCategoriesHandler);
medicalMobileOwnerRouter.get("/support/faq", ...getSupportQuestionsHandler);
medicalMobileOwnerRouter.get("/support/answer", ...getSupportAnswerHandler);

/** Config */
medicalMobileOwnerRouter.get("/config", ...getConfigHandler);

/** Boxes — owner-scoped claim/unassign (no QR register) */
medicalMobileOwnerRouter.get("/boxes", ...listBoxesHandler);
medicalMobileOwnerRouter.post("/boxes/claim", ...claimBoxHandler);
medicalMobileOwnerRouter.get("/boxes/:box_id", ...getBoxDetailsHandler);
medicalMobileOwnerRouter.delete("/boxes/:box_id", ...removeBoxHandler);
medicalMobileOwnerRouter.patch("/boxes/:box_id/settings", ...updateBoxSettingsHandler);
medicalMobileOwnerRouter.post("/boxes/:box_id/connection", ...connectBoxHandler);
medicalMobileOwnerRouter.delete("/boxes/:box_id/connection", ...disconnectBoxHandler);
medicalMobileOwnerRouter.get("/boxes/:box_id/location", ...getBoxLocationHandler);
medicalMobileOwnerRouter.post("/boxes/:box_id/location/share", ...shareBoxLocationHandler);
medicalMobileOwnerRouter.get("/boxes/:box_id/diagnostics", ...getBoxDiagnosticsHandler);
medicalMobileOwnerRouter.get("/boxes/:box_id/alerts", ...getBoxAlertsHandler);
medicalMobileOwnerRouter.get("/emergency/call-metadata", ...getCallMetadataHandler);
medicalMobileOwnerRouter.post("/emergency/alert", ...postOwnerEmergencyAlertHandler);
medicalMobileOwnerRouter.patch("/boxes/:box_id/lock", ...lockBoxByIdHandler);

/** GrubLock — lock without OTP; emergency unlock without OTP */
medicalMobileOwnerRouter.patch("/grublock/lock", ...lockGrublockHandler);
medicalMobileOwnerRouter.patch("/grublock/emergency_unlock", ...emergencyUnlockHandler);

/** Notifications */
medicalMobileOwnerRouter.get("/notification", ...getNotificationsHandler);
medicalMobileOwnerRouter.patch("/notification", ...markNotificationsHandler);
