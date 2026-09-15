import type { Context } from "hono";
import { rateLimit } from "@/middlewares/rate-limit";

const mobileAuthMax = () =>
	parseInt(process.env.MOBILE_AUTH_RATE_MAX || "500", 10);
const mobileGeneralMax = () =>
	parseInt(process.env.MOBILE_GENERAL_RATE_MAX || "500", 10);
const mobileSensitiveOtpMax = () =>
	parseInt(process.env.MOBILE_SENSITIVE_OTP_RATE_MAX || "200", 10);

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
		general: rateLimit({ windowMs: 60_000, max: mobileGeneralMax(), keyGenerator: generalKey }),
		/** auth login & OTP send/verify (max via MOBILE_AUTH_RATE_MAX) */
		auth: rateLimit({ windowMs: 15 * 60 * 1000, max: mobileAuthMax(), keyGenerator: authKey }),
		/** lock OTP, account confirm, transfer verify */
		sensitiveOtp: rateLimit({ windowMs: 15 * 60 * 1000, max: mobileSensitiveOtpMax(), keyGenerator: sensitiveOtpKey }),
	};
}
