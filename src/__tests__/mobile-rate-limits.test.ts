import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createMobileRateLimits } from "@/middlewares/mobile-rate-limits";

describe("Mobile rate limits", () => {
	test("auth limit returns 429 after max requests (vertical-scoped key)", async () => {
		const limits = createMobileRateLimits("test-vertical-auth");
		const app = new Hono();
		app.post("/auth/login", limits.auth, (c) => c.json({ success: true }));

		const headers = { "x-real-ip": "203.0.113.10" };

		for (let i = 0; i < 5; i++) {
			const res = await app.request("/auth/login", { method: "POST", headers });
			expect(res.status).toBe(200);
		}

		const blocked = await app.request("/auth/login", { method: "POST", headers });
		expect(blocked.status).toBe(429);
		const body = (await blocked.json()) as { success: boolean; message: string };
		expect(body.success).toBe(false);
		expect(body.message).toContain("Too many requests");
	});

	test("general and auth limits do not share counter on same IP", async () => {
		const limits = createMobileRateLimits("test-vertical-collision");
		const app = new Hono();
		app.get("/api/data", limits.general, (c) => c.json({ ok: true }));
		app.post("/auth/login", limits.auth, (c) => c.json({ success: true }));

		const headers = { "x-real-ip": "203.0.113.12" };

		for (let i = 0; i < 5; i++) {
			const res = await app.request("/auth/login", { method: "POST", headers });
			expect(res.status).toBe(200);
		}

		const blockedAuth = await app.request("/auth/login", { method: "POST", headers });
		expect(blockedAuth.status).toBe(429);

		const generalStillOk = await app.request("/api/data", { headers });
		expect(generalStillOk.status).toBe(200);
	});

	test("general limit is independent per vertical prefix", async () => {
		const limitsA = createMobileRateLimits("vertical-a");
		const limitsB = createMobileRateLimits("vertical-b");
		const app = new Hono();
		app.get("/ping", limitsA.general, (c) => c.json({ ok: true }));
		app.get("/pong", limitsB.general, (c) => c.json({ ok: true }));

		const headers = { "x-real-ip": "203.0.113.11" };

		for (let i = 0; i < 120; i++) {
			const res = await app.request("/ping", { headers });
			expect(res.status).toBe(200);
		}

		const blockedOnA = await app.request("/ping", { headers });
		expect(blockedOnA.status).toBe(429);

		const stillOkOnB = await app.request("/pong", { headers });
		expect(stillOkOnB.status).toBe(200);
	});
});
