import http from 'node:http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startMetricsServer, stopMetricsServer } from '$lib/metrics/server.js';
import { metricsContentType } from '$lib/metrics/registry.js';

function listening(server) {
	return new Promise((resolve, reject) => {
		if (server.listening) return resolve();
		server.once('listening', resolve);
		server.once('error', reject);
	});
}

async function fetchFromServer(server, path) {
	const { port } = server.address();
	return fetch(`http://127.0.0.1:${port}${path}`);
}

describe('metrics server', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(async () => {
		await stopMetricsServer();
		vi.restoreAllMocks();
	});

	it('serves Prometheus metrics on GET /metrics', async () => {
		const server = startMetricsServer(0);
		await listening(server);

		const response = await fetchFromServer(server, '/metrics');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe(metricsContentType);
		expect(await response.text()).toContain('process_cpu_user_seconds_total');
	});

	it('returns 404 for any other path', async () => {
		const server = startMetricsServer(0);
		await listening(server);

		const response = await fetchFromServer(server, '/anything-else');
		expect(response.status).toBe(404);
	});

	it('is a no-op when the server is already running', async () => {
		const server = startMetricsServer(0);
		await listening(server);

		expect(startMetricsServer(0)).toBe(server);
	});

	it('logs listen errors instead of crashing the app', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Simulate another process already holding the port.
		const blocker = http.createServer();
		blocker.listen(0);
		await listening(blocker);
		const { port } = blocker.address();

		const conflicting = startMetricsServer(port);
		await new Promise((resolve) => conflicting.once('error', resolve));

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining('metrics'),
			expect.objectContaining({ code: 'EADDRINUSE' })
		);

		await new Promise((resolve) => blocker.close(resolve));
	});
});
