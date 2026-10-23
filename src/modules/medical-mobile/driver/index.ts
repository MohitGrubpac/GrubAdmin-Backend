import { Hono } from "hono";
import { globalErrorHandler } from "@/middlewares/error";
import { createMobileRateLimits } from "@/middlewares/mobile-rate-limits";
import { getConfigHandler } from "@/modules/medical-mobile/driver/handlers/config/get-config.handler";
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
} from "@/modules/medical-mobile/driver/handlers/auth";
import { getProfileHandler } from "@/modules/medical-mobile/driver/handlers/account/get-profile.handler";
import { updatePasswordHandler } from "@/modules/medical-mobile/driver/handlers/account/update-password.handler";
import { deleteAccountHandler } from "@/modules/medical-mobile/driver/handlers/account/delete-account.handler";
import { getDashboardHandler } from "@/modules/medical-mobile/driver/handlers/dashboard/get-dashboard.handler";
import { getSupportCategoriesHandler } from "@/modules/medical-mobile/driver/handlers/support/get-support-categories.handler";
import { getSupportQuestionsHandler } from "@/modules/medical-mobile/driver/handlers/support/get-support-questions.handler";
import { getSupportAnswerHandler } from "@/modules/medical-mobile/driver/handlers/support/get-support-answer.handler";
import { listBoxesHandler } from "@/modules/medical-mobile/driver/handlers/box/list-boxes.handler";
import { registerBoxHandler } from "@/modules/medical-mobile/driver/handlers/box/register-box.handler";
import { getBoxDetailsHandler } from "@/modules/medical-mobile/driver/handlers/box/get-box-details.handler";
import { removeBoxHandler } from "@/modules/medical-mobile/driver/handlers/box/remove-box.handler";
import { updateBoxSettingsHandler } from "@/modules/medical-mobile/driver/handlers/box/update-box-settings.handler";
import { connectBoxHandler } from "@/modules/medical-mobile/driver/handlers/box/connect-box.handler";
import { disconnectBoxHandler } from "@/modules/medical-mobile/driver/handlers/box/disconnect-box.handler";
import { requestLockOtpHandler } from "@/modules/medical-mobile/driver/handlers/box/request-lock-otp.handler";
import { verifyLockOtpHandler } from "@/modules/medical-mobile/driver/handlers/box/verify-lock-otp.handler";
import { lockBoxHandler } from "@/modules/medical-mobile/driver/handlers/box/lock-box.handler";
import {
	getBoxLocationHandler,
	shareBoxLocationHandler,
	getBoxDiagnosticsHandler,
	getBoxAlertsHandler,
} from "@/modules/medical-mobile/driver/handlers/box/get-box-location.handler";
import { getNotificationsHandler } from "@/modules/medical-mobile/driver/handlers/notification/get-notifications.handler";
import { markNotificationsHandler } from "@/modules/medical-mobile/driver/handlers/notification/mark-notifications.handler";
import { getCallMetadataHandler } from "@/modules/medical-mobile/driver/handlers/emergency/get-call-metadata.handler";
import { postAlertHandler } from "@/modules/medical-mobile/driver/handlers/emergency/post-alert.handler";

export const medicalMobileDriverRouter = new Hono();

const limits = createMobileRateLimits("medical-mobile-driver");

medicalMobileDriverRouter.onError(globalErrorHandler);
medicalMobileDriverRouter.use("*", limits.general);

medicalMobileDriverRouter.get("/health", (context) =>
	context.json({
		success: true,
		code: 200,
		message: "Medical mobile driver API is up",
		data: { status: "up" },
	}),
);

/** Auth — handler role only */
medicalMobileDriverRouter.post("/auth/login", limits.auth, ...loginHandler);
medicalMobileDriverRouter.post("/auth/send-otp", limits.auth, ...sendOtpHandler);
medicalMobileDriverRouter.post("/auth/verify-otp", limits.auth, ...verifyOtpHandler);
medicalMobileDriverRouter.post("/auth/resend-otp", limits.auth, ...sendOtpHandler);
medicalMobileDriverRouter.post("/auth/forget-password/otp/send", limits.auth, ...sendForgetPasswordOtpHandler);
medicalMobileDriverRouter.post("/auth/forget-password/otp/verify", limits.auth, ...verifyForgetPasswordOtpHandler);
medicalMobileDriverRouter.post("/auth/forget-password/set-password", limits.auth, ...setNewPasswordHandler);
medicalMobileDriverRouter.post("/auth/set-password", limits.auth, ...setNewPasswordHandler);
medicalMobileDriverRouter.post("/auth/forget-password/otp/resend", limits.auth, ...sendForgetPasswordOtpHandler);
medicalMobileDriverRouter.post("/auth/reset-password", limits.auth, ...resetPasswordHandler);
medicalMobileDriverRouter.post("/auth/check-account", limits.auth, ...checkAccountHandler);
medicalMobileDriverRouter.post("/auth/logout", ...logoutHandler);
medicalMobileDriverRouter.post("/auth/refresh", ...refreshTokenHandler);

/** Account */
medicalMobileDriverRouter.get("/account/me", ...getProfileHandler);
medicalMobileDriverRouter.get("/profile", ...getProfileHandler);
medicalMobileDriverRouter.put("/account/password", ...updatePasswordHandler);
medicalMobileDriverRouter.delete("/account", ...deleteAccountHandler);

/** Dashboard */
medicalMobileDriverRouter.get("/dashboard", ...getDashboardHandler);

/** Support */
medicalMobileDriverRouter.get("/support/category", ...getSupportCategoriesHandler);
medicalMobileDriverRouter.get("/support/faq", ...getSupportQuestionsHandler);
medicalMobileDriverRouter.get("/support/answer", ...getSupportAnswerHandler);

/** Config */
medicalMobileDriverRouter.get("/config", ...getConfigHandler);

/** Boxes */
medicalMobileDriverRouter.get("/boxes", ...listBoxesHandler);
medicalMobileDriverRouter.post("/boxes", ...registerBoxHandler);
medicalMobileDriverRouter.get("/boxes/:box_id", ...getBoxDetailsHandler);
medicalMobileDriverRouter.delete("/boxes/:box_id", ...removeBoxHandler);
medicalMobileDriverRouter.patch("/boxes/:box_id/settings", ...updateBoxSettingsHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/connection", ...connectBoxHandler);
medicalMobileDriverRouter.delete("/boxes/:box_id/connection", ...disconnectBoxHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/lock/otp", limits.sensitiveOtp, ...requestLockOtpHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/otp-lock", limits.sensitiveOtp, ...requestLockOtpHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/lock/otp/resend", limits.sensitiveOtp, ...requestLockOtpHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/otp-lock/resend", limits.sensitiveOtp, ...requestLockOtpHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/lock/verify", limits.sensitiveOtp, ...verifyLockOtpHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/otp-lock/verify", limits.sensitiveOtp, ...verifyLockOtpHandler);
medicalMobileDriverRouter.patch("/boxes/:box_id/lock", ...lockBoxHandler);
medicalMobileDriverRouter.get("/boxes/:box_id/location", ...getBoxLocationHandler);
medicalMobileDriverRouter.post("/boxes/:box_id/location/share", ...shareBoxLocationHandler);
medicalMobileDriverRouter.get("/boxes/:box_id/diagnostics", ...getBoxDiagnosticsHandler);
medicalMobileDriverRouter.get("/boxes/:box_id/alerts", ...getBoxAlertsHandler);

/** Emergency */
medicalMobileDriverRouter.get("/emergency/call-metadata", ...getCallMetadataHandler);
medicalMobileDriverRouter.post("/emergency/alert", ...postAlertHandler);

/** Notifications */
medicalMobileDriverRouter.get("/notification", ...getNotificationsHandler);
medicalMobileDriverRouter.patch("/notification", ...markNotificationsHandler);
