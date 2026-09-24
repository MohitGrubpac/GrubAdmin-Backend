import { Hono } from "hono";
import { globalErrorHandler } from "@/middlewares/error";
import { createMobileRateLimits } from "@/middlewares/mobile-rate-limits";
import { checkAccountHandler, loginHandler } from "./handlers";

export const medicalMobileAuthRouter = new Hono();

const limits = createMobileRateLimits("medical-mobile-unified");

medicalMobileAuthRouter.onError(globalErrorHandler);
medicalMobileAuthRouter.use("*", limits.general);

medicalMobileAuthRouter.get("/health", (context) =>
	context.json({
		success: true,
		code: 200,
		message: "Medical mobile unified auth API is up",
		data: { status: "up" },
	}),
);

/** Unified entry — resolves owner vs driver persona for one Flutter app shell */
medicalMobileAuthRouter.post("/auth/check-account", limits.auth, ...checkAccountHandler);
medicalMobileAuthRouter.post("/auth/login", limits.auth, ...loginHandler);
