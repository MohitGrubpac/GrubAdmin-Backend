import { Hono } from "hono";
import {
	loginHandler,
	logoutHandler,
	resendOtpHandler,
	sendOtpHandler,
	verifyAuthenticatedHandler,
	verifyOtpHandler,
	sentResetPasswordOtpHandler,
	confirmResetPasswordHandler,
	resendResetPasswordOtpHandler,
} from "./handlers/auth";
import { ADMIN_AUTH_RATE_MAX } from "@/configs/env";
import { rateLimit } from "@/middlewares/rate-limit";
import { globalErrorHandler } from "@/middlewares/error";
import { ipMiddleware } from "@/middlewares/common/ip.ts";
import {
	confirmUpdateAccountHandler,
	deleteAccountEligiblityHandler,
	deleteAccountHandler,
	getMyAccountHandler,
	updateAccountResendOtpHandler,
	updateAccountHandler,
} from "./handlers/account";
import {
	createClientHandler,
	exportClientHandler,
	getClientsHandler,
	getClientHandler,
	updateClientHandler,
	deleteClientHandler,
	patchClientStatusHandler,
	impersonateClientHandler,
	exitImpersonationHandler,
} from "./handlers/client";
import {
	createVerticalHandler,
	getVerticalsHandler,
	deleteVerticalHandler,
} from "@/modules/admin/handlers/vertical";
import { createConfigHandler } from "@/modules/admin/handlers/config";
import { createIconsHandler } from "@/modules/admin/handlers/icon";
import {
	createFaqCategoryHandler,
	deleteFaqCategoriesHandler,
	exportFaqCategoriesHandler,
	getFaqCategoryHandler,
	reactivateFaqCategoriesHandler,
	reorderFaqCategoryHandler,
	suspendFaqCategoriesHandler,
	updateFaqCategoryHandler,
} from "@/modules/admin/handlers/faq-category";
import {
	changeFaqCategoryBulkHandler,
	createFaqHandler,
	deleteFaqsHandler,
	exportFaqsHandler,
	getFaqsHandler,
	patchFaqHandler,
	patchFAQStatusHandler,
	recoverFaqHandler,
	suspendFaqQuestionsHandler,
	updateFaqHandler,
} from "@/modules/admin/handlers/faq";
import {
	createRoleHandler,
	deleteRoleHandler,
	getRolesHandler,
	updateRoleHandler,
} from "@/modules/admin/handlers/role";
import {
	assignBulkRoleHandler,
	createAdminHandler,
	deleteAdminsHandler,
	exportAdminsHandler,
	getAdminsHandler,
	reactivateAdminsHandler,
	suspendAdminsHandler,
	updateAdminHandler,
} from "@/modules/admin/handlers/admin";
import {
	assignBoxesHandler,
	createBoxHandler,
	deleteBoxesHandler,
	getBoxesHandler,
	removeAssignedBoxesHandler,
	updateBoxHandler,
} from "@/modules/admin/handlers/box";
import { getAdminLogsHandler } from "@/modules/admin/handlers/admin-logs";
import {
	getAdminNotificationsHandler,
	readNotificationHandler,
} from "@/modules/admin/handlers/admin-notifications";

export const adminRouter = new Hono();

adminRouter.onError(globalErrorHandler);

/**
 * Name: Admin Auth Router
 * Description: This router is responsible for handling all the admin auth things including the Super Admins and Employees of the Grubpac team.
 * Base route: /api/v1/admin/auth
 */
adminRouter.post("/auth/login", ...loginHandler);
adminRouter.post("/auth/logout", ...logoutHandler);
const otpRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: ADMIN_AUTH_RATE_MAX });
adminRouter.post("/auth/send-otp", otpRateLimit, ...sendOtpHandler);
adminRouter.post("/auth/verify-otp", otpRateLimit, ...verifyOtpHandler);
adminRouter.post("/auth/resend-otp", otpRateLimit, ...resendOtpHandler);
adminRouter.get("/auth/verify-authenticated", ...verifyAuthenticatedHandler);
adminRouter.post(
	"/auth/reset-password/otp/send",
	otpRateLimit,
	...sentResetPasswordOtpHandler,
);
adminRouter.post(
	"/auth/reset-password/otp/resend",
	otpRateLimit,
	...resendResetPasswordOtpHandler,
);
adminRouter.post(
	"/auth/reset-password/confirm",
	otpRateLimit,   // Brute-force protection: 4-digit OTP has only 10,000 combinations
	...confirmResetPasswordHandler,
);

/**
 * Name: Config Router
 * Description: This router is responsible for handling the config related things throughout the application
 * Base route: /api/v1/admin/config
 */

adminRouter.post("/config", ...createConfigHandler);

/**
 * Name: Admin Account Router
 * Description: This router is responsible for handling all the admin profile things including the Super Admins and Employees of the Grubpac team.
 * Base route: /api/v1/admin/account
 */
adminRouter.patch("/account", ...updateAccountHandler);
adminRouter.put("/account/update", ...updateAccountHandler);
adminRouter.patch("/account/update", ...updateAccountHandler);
adminRouter.patch(
	"/account/update/resend-otp",
	...updateAccountResendOtpHandler,
);
adminRouter.patch("/account/confirm", ...confirmUpdateAccountHandler);
adminRouter.get("/account/me", ...getMyAccountHandler);
adminRouter.get(
	"/account/delete-eligibility",
	...deleteAccountEligiblityHandler,
);
adminRouter.delete("/account/delete", ...deleteAccountHandler);

/**
 * Name: Admin Customer Route
 * Description: This router is responsible for handling all the customer related interaction in the admin panel according to their roles
 * Base route: /api/v1/admin/customer
 */
adminRouter.post("/customer", ...createClientHandler);
adminRouter.get("/customer", ...getClientsHandler);
adminRouter.get("/customer/export", ...exportClientHandler);
adminRouter.get("/customer/:id", ...getClientHandler);
adminRouter.patch("/customer/:id", ...updateClientHandler);
adminRouter.delete("/customer/:id", ...deleteClientHandler);
adminRouter.patch("/customer/:id/status", ...patchClientStatusHandler);
adminRouter.post("/customer/:id/impersonate", ...impersonateClientHandler);
adminRouter.post("/customer/exit-impersonation", ...exitImpersonationHandler);

/**
 * Name: Admin Vertical Route
 * Description: This router is responsible for handling all the vertical related interaction in the admin panel according to their roles
 * Base route: /api/v1/admin/vertical
 */
adminRouter.post("/vertical", ipMiddleware, ...createVerticalHandler);
adminRouter.get("/vertical", ...getVerticalsHandler);
adminRouter.delete("/vertical/:id", ipMiddleware, ...deleteVerticalHandler);

/**
 * Name: Icon Router
 * Description: This router is responsible for handling all icon related interactions.
 * Base route: /api/v1/admin/icon
 */
adminRouter.post("/icon", ...createIconsHandler);

/**
 * Name: Faq Category Router
 * Description: This router is responsible for handling all faq category related interactions.
 * Base route: /api/v1/admin/faq-category
 */
adminRouter.post("/faq-category", ...createFaqCategoryHandler);
adminRouter.get("/faq-category", ...getFaqCategoryHandler);
adminRouter.patch("/faq-category/reorder", ...reorderFaqCategoryHandler);
adminRouter.get("/faq-category/export", ...exportFaqCategoriesHandler);
adminRouter.patch("/faq-category/suspend", ...suspendFaqCategoriesHandler);
adminRouter.patch(
	"/faq-category/reactivate",
	...reactivateFaqCategoriesHandler,
);
adminRouter.put("/faq-category", ...updateFaqCategoryHandler);
adminRouter.delete("/faq-category", ...deleteFaqCategoriesHandler);

/**
 * Name: Faq Question Router
 * Description: This router is responsible for handling all faq questions related actions
 * Base route: /api/v1/admin/faq
 */

adminRouter.post("/faq", ...createFaqHandler);
adminRouter.get("/faq", ...getFaqsHandler);
adminRouter.delete("/faq", ...deleteFaqsHandler);
adminRouter.put("/faq", ...updateFaqHandler);
adminRouter.put("/faq/:id", ...patchFaqHandler);
adminRouter.patch("/faq/status/toggle", ...patchFAQStatusHandler);
adminRouter.patch("/faq/suspend", ...suspendFaqQuestionsHandler);
adminRouter.patch("/faq/reactivate", ...recoverFaqHandler);
adminRouter.patch("/faq/change-category/bulk", ...changeFaqCategoryBulkHandler);
adminRouter.get("/faq/export", ...exportFaqsHandler);

/**
 * Name: Roles Router
 * Description: This router is responsible for handling all roles related
 * Base route: /api/v1/admin/role
 */
adminRouter.post("/role", ...createRoleHandler);
adminRouter.get("/role", ...getRolesHandler);
adminRouter.put("/role/:id", ...updateRoleHandler);
adminRouter.delete("/role/:id", ...deleteRoleHandler);

/**
 * Name: Admin Router
 * Description: This router is responsible for handling all admin related actions
 * Base route: /api/v1/admin/admin
 */
adminRouter.post("/admin", ...createAdminHandler);
adminRouter.get("/admin", ...getAdminsHandler);
adminRouter.patch("/admin/assign-role/bulk", ...assignBulkRoleHandler);
adminRouter.patch("/admin/suspend", ...suspendAdminsHandler);
adminRouter.patch("/admin/reactivate", ...reactivateAdminsHandler);
adminRouter.delete("/admin", ...deleteAdminsHandler);
adminRouter.put("/admin", ...updateAdminHandler);
adminRouter.get("/admin/export", ...exportAdminsHandler);

/**
 * Name: Box Router
 * Description: This router is responsible for handling all box related actions
 * Base route: /api/v1/admin/box
 */
adminRouter.post("/box", ...createBoxHandler);
adminRouter.get("/box", ...getBoxesHandler);
adminRouter.put("/box/:id", ...updateBoxHandler);
adminRouter.delete("/box", ...deleteBoxesHandler);
adminRouter.patch("/box/assign/remove", ...removeAssignedBoxesHandler);
adminRouter.patch("/box/assign", ...assignBoxesHandler);

/**
 * Name: Logs Router
 * Description: This router is responsible for handling all logs related actions
 * Base route: /api/v1/admin/box
 */
adminRouter.get("/logs", ...getAdminLogsHandler);

/**
 * Name: Notifications Router
 * Description: This router is responsible for handling all notifications related actions
 * Base route: /api/v1/admin/box
 */
adminRouter.get("/notifications", ...getAdminNotificationsHandler);
adminRouter.patch("/notifications", ...readNotificationHandler);
