import type { Context } from "hono";
import { MOBILE_AUTH_RATE_MAX } from "@/configs/env";
import { rateLimit } from "@/middlewares/rate-limit";

const clientIp = (c: Context): string =>
	c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
	c.req.header("x-real-ip") ||
	"unknown";

/**
 * Vertical-scoped rate limiters for mobile routers.
 * Keys include vertical + limiter kind so general/auth/OTP counters do not collide on the same IP.
 */
export function createMobileRateLimits(verticalKey: string) {
	const generalKey = (c: Context) => `${verticalKey}:general:${clientIp(c)}`;
	const authKey = (c: Context) => `${verticalKey}:auth:${clientIp(c)}`;
	const sensitiveOtpKey = (c: Context) => `${verticalKey}:sensitiveOtp:${clientIp(c)}`;

	return {
		/** 120 requests / minute — general API traffic */
		general: rateLimit({ windowMs: 60_000, max: 120, keyGenerator: generalKey }),
		/** auth login & OTP send/verify (matches hospitality/admin; max via MOBILE_AUTH_RATE_MAX) */
		auth: rateLimit({ windowMs: 15 * 60 * 1000, max: MOBILE_AUTH_RATE_MAX, keyGenerator: authKey }),
		/** 10 requests / 15 min — lock OTP, account confirm, transfer verify */
		sensitiveOtp: rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyGenerator: sensitiveOtpKey }),
	};
}
