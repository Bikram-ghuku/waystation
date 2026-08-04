// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/svelte';
import { describe, test, expect, afterEach } from 'vitest';
import Board from './board.svelte';

// When a stop has no departures, the board renders the EmptyBoard whose headline
// is driven by emptyMode (see board.svelte). The two axes are independent:
//   has data?  yes: stale / empty    no: error / connecting
// These tests pin every branch. The ordering is easy to invert and a regression
// would silently show a rider the wrong state (e.g. "NO DATA" instead of "NO LIVE DATA"
// when data exists but the feed has gone stale).
describe('Board empty state', () => {
	afterEach(() => {
		cleanup();
	});

	const now = new Date('2026-06-11T15:55:00Z');

	function renderEmpty(props) {
		return render(Board, { props: { arrivals: [], now, ...props } });
	}

	test('shows CONNECTING before the first fetch resolves', () => {
		const { container } = renderEmpty({ lastUpdatedAt: null });
		expect(container.innerHTML).toContain('CONNECTING');
	});

	test('shows NO DEPARTURES once loaded with no service', () => {
		const { container } = renderEmpty({ lastUpdatedAt: now.getTime(), isStale: false });
		expect(container.innerHTML).toContain('NO DEPARTURES');
	});

	test('shows NO LIVE DATA when the upstream feed is flagged stale', () => {
		const { container } = renderEmpty({ lastUpdatedAt: now.getTime(), isStale: true });
		expect(container.innerHTML).toContain('NO LIVE DATA');
	});

	test('shows NO LIVE DATA when data ages past the 90s staleness threshold', () => {
		const { container } = renderEmpty({ lastUpdatedAt: now.getTime() - 91_000, isStale: false });
		expect(container.innerHTML).toContain('NO LIVE DATA');
	});

	test('shows NO DATA when all fetches fail on first load', () => {
		const { container } = renderEmpty({ lastUpdatedAt: null, fetchFailed: true });
		expect(container.innerHTML).toContain('NO DATA');
	});

	test('does not show NO DATA when a fetch fails but data already exists', () => {
		const { container } = renderEmpty({ lastUpdatedAt: now.getTime(), fetchFailed: true });
		expect(container.innerHTML).not.toContain('NO DATA');
	});

	test('shows the failed-stop badge even when the surviving stop has arrivals', () => {
		const { container } = render(Board, {
			props: {
				now,
				lastUpdatedAt: now.getTime(),
				arrivals: [{ tripId: 't1', route: '49', departureAt: now.getTime() + 60_000, min: 1 }],
				failedStopIds: ['1_200']
			}
		});
		expect(container.innerHTML).toContain('DATA UNAVAILABLE FOR STOP');
	});

	test('shows the failed-stop badge with no arrivals at all', () => {
		const { container } = renderEmpty({
			lastUpdatedAt: now.getTime(),
			isStale: false,
			failedStopIds: ['1_200']
		});
		expect(container.innerHTML).toContain('DATA UNAVAILABLE FOR STOP');
		expect(container.innerHTML).toContain('#200');
	});
});
