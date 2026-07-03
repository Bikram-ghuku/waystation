import oba, { handleOBAResponse } from '$lib/obaSdk.js';
import { error } from '@sveltejs/kit';
import { recordUpstreamRequest } from '$lib/metrics/registry.js';

const cache = new Map();
const METRICS_ENDPOINT = 'name-and-code-for-stop';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	const stopIDs = params.id.split('+');

	try {
		const stopResponses = await Promise.all(stopIDs.map((eachID) => oba.stop.retrieve(eachID)));

		const stopBodies = await Promise.all(
			stopResponses.map((eachResponse) => handleOBAResponse(eachResponse, 'stop').json())
		);

		const dataBlocks = stopBodies.map((stopBody) => stopBody.data.entry);

		stopIDs.forEach((id, i) => {
			cache.set(id, stopBodies[i]);
		});

		recordUpstreamRequest({ endpoint: METRICS_ENDPOINT, result: 'fresh' });
		return new Response(JSON.stringify(dataBlocks), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.warn(`OBA fetch failed for stops [${stopIDs.join(', ')}]: ${err.message}`);

		if (stopIDs.every((id) => cache.has(id))) {
			recordUpstreamRequest({ endpoint: METRICS_ENDPOINT, result: 'stale' });
			const cachedBlocks = stopIDs.map((id) => cache.get(id).data.entry);

			return new Response(JSON.stringify(cachedBlocks.map((b) => ({ ...b, stale: true }))), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		recordUpstreamRequest({ endpoint: METRICS_ENDPOINT, result: 'error' });
		throw error(503, `No data available for stops [${stopIDs.join(', ')}]`);
	}
}
