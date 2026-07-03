import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { recordHttpRequest, resolveMetricsPort } from '$lib/metrics/registry.js';
import { startMetricsServer } from '$lib/metrics/server.js';

/** @type {import('@sveltejs/kit').ServerInit} */
export function init() {
	// `building` guards the prerender pass, which also runs server hooks.
	if (!building) {
		startMetricsServer(resolveMetricsPort(env.METRICS_PORT));
	}
}

export async function handle({ event, resolve }) {
	const startTime = performance.now();
	let status = 500;
	try {
		const response = await resolve(event);
		status = response.status;
		return response;
	} finally {
		recordHttpRequest({
			method: event.request.method,
			route: event.route.id ?? '(unmatched)',
			status,
			durationSeconds: (performance.now() - startTime) / 1000
		});
	}
}
