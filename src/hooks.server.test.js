import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handle } from './hooks.server.js';
import { recordHttpRequest } from '$lib/metrics/registry.js';

vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/metrics/registry.js', () => ({
	recordHttpRequest: vi.fn(),
	resolveMetricsPort: vi.fn(() => 9119)
}));
vi.mock('$lib/metrics/server.js', () => ({ startMetricsServer: vi.fn() }));

function makeEvent(routeId) {
	return {
		request: new Request('http://localhost/anything', { method: 'GET' }),
		route: { id: routeId }
	};
}

describe('handle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('records the route template, not the concrete URL, to bound label cardinality', async () => {
		const response = new Response('ok', { status: 201 });
		const resolve = vi.fn(async () => response);

		const result = await handle({ event: makeEvent('/stops/[stopID]'), resolve });

		expect(result).toBe(response);
		expect(recordHttpRequest).toHaveBeenCalledWith({
			method: 'GET',
			route: '/stops/[stopID]',
			status: 201,
			durationSeconds: expect.any(Number)
		});
	});

	it('labels unmatched routes as (unmatched)', async () => {
		const resolve = vi.fn(async () => new Response('nope', { status: 404 }));

		await handle({ event: makeEvent(null), resolve });

		expect(recordHttpRequest).toHaveBeenCalledWith(
			expect.objectContaining({ route: '(unmatched)', status: 404 })
		);
	});

	it('records a 500 and rethrows when resolve throws', async () => {
		const boom = new Error('boom');
		const resolve = vi.fn(async () => {
			throw boom;
		});

		await expect(handle({ event: makeEvent('/stops/[stopID]'), resolve })).rejects.toThrow(boom);
		expect(recordHttpRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
	});
});
