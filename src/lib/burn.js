// The cumulative burn series, read from the recorded daily snapshots.
//
// Every detail view used to carry a hardcoded array here, reached whenever
// `ownership.burnHistory` was missing. It was missing always: nothing in
// fetcher.cjs has ever emitted that field, for any project. So the burn charts
// were not stale, they were literals -- STONK's last point was the string
// 'Aug 23' and the number 574,100,000, against a real 569,426,666 that the
// headline on the same screen was already showing correctly.
//
// The real series was in `dailySnapshots` the whole time. This reads it.
//
// Row validity lives in snapshots.js, because the burn is not the only chart
// reading these rows and a run that failed did not fail for burn alone.
//
// There is no fallback. A chart with no data renders as no chart, because the
// alternative is what was there before: invented numbers that look exactly like
// measured ones, drifting further from the truth every day nobody notices.

import { usableSnapshots } from './snapshots';

/** Labels and values for the burn chart, windowed to a timeframe. */
export function burnSeries(snapshots, timeframe = 'all') {
  const clean = usableSnapshots(snapshots);
  const window = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : clean.length;
  const rows = clean.slice(-window);

  return {
    labels: rows.map((s) => s.date || ''),
    data: rows.map((s) => Number(s.totalBurn)),
  };
}

/**
 * Daily burn rate -- the first difference of the cumulative series.
 *
 * Shares the same filter, so a poisoned row cannot show up here as a single
 * enormous bar. The old inline version clamped negatives to zero with
 * `Math.max(0, curr - prev)`, which hid the 8/19 row rather than removing it:
 * the flywheel looked fine while the cumulative chart above it did not.
 */
export function burnRateSeries(snapshots) {
  const clean = usableSnapshots(snapshots);

  return {
    labels: clean.map((s) => s.date || ''),
    prices: clean.map((s) => Number(s.tokenPriceUsd) || 0),
    burn: clean.map((s, i) =>
      i === 0 ? 0 : Number(s.totalBurn) - Number(clean[i - 1].totalBurn),
    ),
  };
}
