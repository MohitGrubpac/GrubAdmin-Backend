import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
	metricsAuthorized,
	metricsResponse,
	requestMetricsMiddleware,
	recordRequest,
} from "@/utils/metrics";

describe("production observability metrics", () => {
	const previousToken = process.env.METRICS_BEARER_TOKEN;

	afterEach(() => {
		if (previousToken === undefined) {
			delete process.env.METRICS_BEARER_TOKEN;
		} else {
			process.env.METRICS_BEARER_TOKEN = previousToken;
		}
	});

	test("requires a configured bearer token and rejects invalid credentials", async () => {
		const app = new Hono();
		app.get("/metrics", (context) => {
			if (!metricsAuthorized(context)) {
				return context.body(null, 404);
			}
			return context.text("authorized");
		});

		delete process.env.METRICS_BEARER_TOKEN;
		const noToken = await app.request("/metrics");
		expect(noToken.status).toBe(404);

		process.env.METRICS_BEARER_TOKEN = "test-token";
		const invalidToken = await app.request("/metrics", {
			headers: { Authorization: "Bearer wrong-token" },
		});
		expect(invalidToken.status).toBe(404);

		const validToken = await app.request("/metrics", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(validToken.status).toBe(200);
	});

	test("uses matched route templates and excludes request data from metric labels", async () => {
		const app = new Hono();
		app.use("*", requestMetricsMiddleware);
		app.get("/users/:userId", (context) => context.text("ok"));

		const response = await app.request("/users/private-user-id?token=secret");
		expect(response.status).toBe(200);

		recordRequest("GET", "/users/:userId", 200, 0.025);
		const metrics = await metricsResponse().text();
		expect(metrics).toContain('path="/users/:userId"');
		expect(metrics).not.toContain("private-user-id");
		expect(metrics).not.toContain("token=secret");
		expect(metrics).not.toContain('request_id="');
	});
});
