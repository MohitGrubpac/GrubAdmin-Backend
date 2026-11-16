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

	test("requires a configured bearer token and rejects invalid credentials", () => {
		delete process.env.METRICS_BEARER_TOKEN;
		const app = new Hono();
		expect(metricsAuthorized(app.createContext(new Request("http://local/metrics")))).toBe(false);

		process.env.METRICS_BEARER_TOKEN = "test-token";
		expect(
			metricsAuthorized(
				app.createContext(
					new Request("http://local/metrics", {
						headers: { Authorization: "Bearer wrong-token" },
					}),
				),
			),
		).toBe(false);
		expect(
			metricsAuthorized(
				app.createContext(
					new Request("http://local/metrics", {
						headers: { Authorization: "Bearer test-token" },
					}),
				),
			),
		).toBe(true);
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
