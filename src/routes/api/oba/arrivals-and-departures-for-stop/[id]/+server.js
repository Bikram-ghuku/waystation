import oba from '$lib/obaSdk';
import { error } from '@sveltejs/kit';
import { recordUpstreamRequest } from '$lib/metrics/registry.js';

const cache = new Map();
const METRICS_ENDPOINT = 'arrivals-and-departures-for-stop';

export async function GET({ params }) {
	const stopID = params.id;

	try {
		const response = await oba.arrivalAndDeparture.list(stopID);

		// Upstream returns `null` (HTTP 200) for some valid stops with no real-time
		// data. Only cache responses with real data so we never serve null as stale,
		// and record those as "empty" so a feed outage behind a healthy API is
		// visible on dashboards instead of counting as fresh.
		const hasData = Boolean(response?.data?.entry?.arrivalsAndDepartures);
		if (hasData) {
			cache.set(stopID, response);
		}

		recordUpstreamRequest({ endpoint: METRICS_ENDPOINT, result: hasData ? 'fresh' : 'empty' });
		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.warn(`OBA fetch failed for stop ${stopID}: ${err.message}`);

		if (cache.has(stopID)) {
			recordUpstreamRequest({ endpoint: METRICS_ENDPOINT, result: 'stale' });
			return new Response(
				JSON.stringify({
					...cache.get(stopID),
					stale: true
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			);
		}

		recordUpstreamRequest({ endpoint: METRICS_ENDPOINT, result: 'error' });
		throw error(503, `No data available for stop ${stopID}`);
	}
}
