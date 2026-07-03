import http from 'node:http';
import { metricsContentType, renderMetrics } from './registry.js';

/**
 * Starts the HTTP server that exposes GET /metrics. It binds a different port
 * than the app so the app port can be public while this one is kept off the
 * open internet — it listens on all interfaces, so exposure must be restricted
 * at the network layer. Idempotent: dev HMR re-runs and repeated calls return
 * the previously created server (even if its listen attempt failed). Listen
 * errors (e.g. EADDRINUSE) are logged and never crash the app.
 */
export function startMetricsServer(port) {
	if (globalThis.__waystationMetricsServer) {
		return globalThis.__waystationMetricsServer;
	}

	const server = http.createServer(async (req, res) => {
		const path = (req.url ?? '').split('?')[0];
		if (req.method === 'GET' && path === '/metrics') {
			try {
				const body = await renderMetrics();
				res.writeHead(200, { 'Content-Type': metricsContentType });
				res.end(body);
			} catch (error) {
				console.error('metrics: failed to render metrics:', error);
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('metrics collection failed');
			}
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('not found');
		}
	});

	server.on('error', (error) => {
		console.error(`metrics: server error on port ${port}:`, error);
	});

	// Never keep the process alive on account of the metrics server.
	server.unref();
	server.listen(port, () => {
		console.log(`metrics: Prometheus /metrics listening on port ${server.address().port}`);
	});

	globalThis.__waystationMetricsServer = server;
	return server;
}

export function stopMetricsServer() {
	const server = globalThis.__waystationMetricsServer;
	globalThis.__waystationMetricsServer = undefined;
	if (!server) {
		return Promise.resolve();
	}
	return new Promise((resolve) => server.close(resolve));
}
