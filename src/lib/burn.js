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
import { windowLen } from './yieldHistory';

/** Labels and values for the burn chart, windowed to a timeframe. */
export function burnSeries(snapshots, timeframe = 'all') {
  const clean = usableSnapshots(snapshots);
  const rows = clean.slice(-windowLen(timeframe, clean.length));

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
export function burnRateSeries(snapshots, timeframe = 'all') {
  const clean = usableSnapshots(snapshots);
  const n = windowLen(timeframe, clean.length);
  const start = Math.max(0, clean.length - n);
  const prev = start > 0 ? clean[start - 1] : null;
  const rows = clean.slice(start);

  return {
    labels: rows.map((s) => s.date || ''),
    prices: rows.map((s) => Number(s.tokenPriceUsd) || 0),
    burn: rows.map((s, i) => {
      const prior = i === 0
        ? (prev ? Number(prev.totalBurn) : Number(s.totalBurn))
        : Number(rows[i - 1].totalBurn);
      return Number(s.totalBurn) - prior;
    }),
  };
}
