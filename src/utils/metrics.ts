import { timingSafeEqual } from "crypto";
import type { Context } from "hono";

const serviceName = "grubadmin-backend";
const deploymentSlot =
	process.env.DEPLOYMENT_SLOT ||
	process.env.pm_out_log_path
		?.match(/grub[-_]prod[-_]([a-z]+)[-_]out\.log$/i)?.[1]
		?.toLowerCase() ||
	"unknown";

const durationBucketsSeconds = [
	0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];
const knownMethods = new Set([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"OPTIONS",
	"HEAD",
]);

type RequestMetric = {
	count: number;
	durationSeconds: number;
	bucketCounts: number[];
};
const requestMetrics = new Map<string, RequestMetric>();
let activeRequests = 0;
const startedAt = Date.now();

function normalizedMethod(method: string): string {
	return knownMethods.has(method) ? method : "OTHER";
}

function safeRoute(context: Context): string {
	const routePath = context.req.routePath;
	return routePath && routePath.startsWith("/") ? routePath : "/_unmatched";
}

function metricKey(method: string, route: string, status: number): string {
	return JSON.stringify([method, route, status]);
}

export function recordRequest(
	method: string,
	route: string,
	status: number,
	durationSeconds: number,
): void {
	const key = metricKey(method, route, status);
	let metric = requestMetrics.get(key);
	if (!metric) {
		metric = {
			count: 0,
			durationSeconds: 0,
			bucketCounts: durationBucketsSeconds.map(() => 0),
		};
		requestMetrics.set(key, metric);
	}

	metric.count += 1;
	metric.durationSeconds += durationSeconds;
	durationBucketsSeconds.forEach((bucket, index) => {
		if (durationSeconds <= bucket) {
			metric.bucketCounts[index] = (metric.bucketCounts[index] ?? 0) + 1;
		}
	});
}

export async function requestMetricsMiddleware(
	context: Context,
	next: () => Promise<void>,
): Promise<void> {
	const start = performance.now();
	activeRequests += 1;
	let statusCode = 500;
	try {
		await next();
		statusCode = context.res.status;
	} finally {
		const durationMs = Math.max(0, performance.now() - start);
		const method = normalizedMethod(context.req.method);
		const path = safeRoute(context);
		statusCode = context.res.status || statusCode;
		activeRequests = Math.max(0, activeRequests - 1);
		recordRequest(method, path, statusCode, durationMs / 1000);
	}
}

function escapeLabel(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function metricsText(): string {
	const lines = [
		"# HELP grubadmin_http_requests_total Total HTTP requests handled by this instance.",
		"# TYPE grubadmin_http_requests_total counter",
	];
	const metricRows = [...requestMetrics.entries()].map(([key, metric]) => ({
		labels: JSON.parse(key) as [string, string, number],
		metric,
	}));

	for (const { labels: [method, route, status], metric } of metricRows) {
		lines.push(
			`grubadmin_http_requests_total{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}",method="${method}",path="${escapeLabel(route)}",status_code="${status}"} ${metric.count}`,
		);
	}

	lines.push(
		"# HELP grubadmin_http_request_duration_seconds HTTP request duration in seconds.",
		"# TYPE grubadmin_http_request_duration_seconds histogram",
	);
	for (const { labels: [method, route, status], metric } of metricRows) {
		for (const [index, bucket] of durationBucketsSeconds.entries()) {
			lines.push(
				`grubadmin_http_request_duration_seconds_bucket{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}",method="${method}",path="${escapeLabel(route)}",status_code="${status}",le="${bucket}"} ${metric.bucketCounts[index] ?? 0}`,
			);
		}
		lines.push(
			`grubadmin_http_request_duration_seconds_bucket{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}",method="${method}",path="${escapeLabel(route)}",status_code="${status}",le="+Inf"} ${metric.count}`,
			`grubadmin_http_request_duration_seconds_sum{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}",method="${method}",path="${escapeLabel(route)}",status_code="${status}"} ${metric.durationSeconds}`,
			`grubadmin_http_request_duration_seconds_count{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}",method="${method}",path="${escapeLabel(route)}",status_code="${status}"} ${metric.count}`,
		);
	}

	lines.push(
		"# HELP grubadmin_http_active_requests Current in-flight HTTP requests.",
		"# TYPE grubadmin_http_active_requests gauge",
		`grubadmin_http_active_requests{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}"} ${activeRequests}`,
		"# HELP grubadmin_process_uptime_seconds Application process uptime in seconds.",
		"# TYPE grubadmin_process_uptime_seconds gauge",
		`grubadmin_process_uptime_seconds{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}"} ${((Date.now() - startedAt) / 1000).toFixed(3)}`,
		"# HELP grubadmin_process_resident_memory_bytes Application resident memory in bytes.",
		"# TYPE grubadmin_process_resident_memory_bytes gauge",
		`grubadmin_process_resident_memory_bytes{service="${serviceName}",deployment_slot="${escapeLabel(deploymentSlot)}"} ${process.memoryUsage().rss}`,
	);

	return `${lines.join("\n")}\n`;
}

export function metricsAuthorized(context: Context): boolean {
	const configuredToken = process.env.METRICS_BEARER_TOKEN;
	if (!configuredToken) {
		return false;
	}

	const authorization = context.req.header("authorization") || "";
	const suppliedToken = authorization.match(/^Bearer (.+)$/i)?.[1];
	if (!suppliedToken) {
		return false;
	}

	const expected = Buffer.from(configuredToken);
	const supplied = Buffer.from(suppliedToken);
	return (
		expected.length === supplied.length &&
		timingSafeEqual(expected, supplied)
	);
}

export function metricsResponse(): Response {
	return new Response(metricsText(), {
		headers: {
			"Content-Type": "text/plain; version=0.0.4; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}
