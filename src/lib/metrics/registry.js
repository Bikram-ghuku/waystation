import os from 'node:os';
import client from 'prom-client';

/**
 * Prometheus instrumentation for Waystation. The HTTP metrics
 * (http_requests_total, http_request_duration_seconds) and the default port
 * match Wayfinder and the OneBusAway Twilio app so dashboards and alert rules
 * can be shared. oba_upstream_requests_total and the system_* gauges are
 * Waystation-specific (the system gauges also exist in Wayfinder).
 */

export const DEFAULT_METRICS_PORT = 9119;

function createMetrics() {
	const registry = new client.Registry();
	client.collectDefaultMetrics({ register: registry });

	const httpRequests = new client.Counter({
		name: 'http_requests_total',
		help: 'Total HTTP requests by method, route template, and status code.',
		labelNames: ['method', 'route', 'status'],
		registers: [registry]
	});

	const httpDuration = new client.Histogram({
		name: 'http_request_duration_seconds',
		help: 'HTTP request latency by method and route template.',
		labelNames: ['method', 'route'],
		registers: [registry]
	});

	const upstreamRequests = new client.Counter({
		name: 'oba_upstream_requests_total',
		help: 'OneBusAway upstream fetches by endpoint and outcome (fresh, empty, stale, or error).',
		labelNames: ['endpoint', 'result'],
		registers: [registry]
	});

	new client.Gauge({
		name: 'system_cpu_load_average_1m',
		help: 'System load average over the last minute.',
		registers: [registry],
		collect() {
			this.set(os.loadavg()[0]);
		}
	});

	new client.Gauge({
		name: 'system_memory_total_bytes',
		help: 'Total system memory in bytes.',
		registers: [registry],
		collect() {
			this.set(os.totalmem());
		}
	});

	new client.Gauge({
		name: 'system_memory_free_bytes',
		help: 'Free system memory in bytes.',
		registers: [registry],
		collect() {
			this.set(os.freemem());
		}
	});

	return { registry, httpRequests, httpDuration, upstreamRequests };
}

// Stored on globalThis so dev-mode HMR re-evaluation reuses the same registry —
// otherwise the hooks would record into a fresh registry while the running
// metrics server kept serving the orphaned old one.
const metrics = (globalThis.__waystationMetrics ??= createMetrics());

export const metricsContentType = metrics.registry.contentType;

// The record functions swallow their own failures: instrumentation must never
// turn a healthy response into an error or mask a real one (they are called
// from finally/catch blocks, where a throw replaces the pending result).
export function recordHttpRequest({ method, route, status, durationSeconds }) {
	try {
		metrics.httpRequests.inc({ method, route, status });
		metrics.httpDuration.observe({ method, route }, durationSeconds);
	} catch (error) {
		console.error('metrics: failed to record HTTP request:', error);
	}
}

export function recordUpstreamRequest({ endpoint, result }) {
	try {
		metrics.upstreamRequests.inc({ endpoint, result });
	} catch (error) {
		console.error('metrics: failed to record upstream request:', error);
	}
}

export function renderMetrics() {
	return metrics.registry.metrics();
}

/**
 * Validates a METRICS_PORT value with the same semantics as Wayfinder:
 * unset/empty silently uses the default; anything that is not an integer in
 * [1, 65535] logs a warning and uses the default.
 */
export function resolveMetricsPort(raw) {
	const trimmed = (raw ?? '').trim();
	if (trimmed === '') {
		return DEFAULT_METRICS_PORT;
	}
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
		console.warn(`Invalid METRICS_PORT="${raw}", using default ${DEFAULT_METRICS_PORT}`);
		return DEFAULT_METRICS_PORT;
	}
	return parsed;
}
