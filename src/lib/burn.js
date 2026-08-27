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
// There is no fallback. A chart with no data renders as no chart, because the
// alternative is what was there before: invented numbers that look exactly like
// measured ones, drifting further from the truth every day nobody notices.

/**
 * Drop snapshots whose burn total cannot be true.
 *
 * A cumulative burn cannot decrease -- tokens do not come back. So no earlier
 * point may sit above a later one, and any that does is a bad read rather than
 * a real move.
 *
 * This is not hypothetical. `getTrueDeflationStats` derives the burn as
 * `maxSupply * unitValue - currentSupply`, so a supply read that comes back
 * zero reports the *entire supply* as burnt. That is exactly what happened on
 * 8/19: STONK recorded 2,962,663,704, which is 4444 x 666666 to the token,
 * beside a true 564,943,352 the next day. Mancer, TickerYard and CardWall each
 * recorded their own full supply on the same run.
 *
 * The scan runs from the newest row backwards because the newest is the one
 * corroborated by `dualBurn.totalBurnTokens` on the same payload. Anchoring to
 * the oldest would let a poisoned first row set an impossible ceiling and
 * discard the entire real series behind it.
 */
function usable(snapshots) {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const clean = [];
  let ceiling = Infinity;

  for (let i = rows.length - 1; i >= 0; i--) {
    const value = Number(rows[i]?.totalBurn);
    if (!Number.isFinite(value) || value <= 0 || value > ceiling) continue;
    ceiling = value;
    clean.unshift(rows[i]);
  }

  return clean;
}

/**
 * Labels and values for the burn chart, windowed to a timeframe.
 *
 * `dropped` and `days` are returned so the view can say what it is actually
 * showing. The timeframe buttons offer 7D/30D/ALL, but the fetcher has only
 * been recording snapshots since 8/19 -- picking 30D cannot conjure 30 days,
 * and a chart that silently shows seven while the button reads 30D is telling
 * a smaller version of the same lie this file exists to remove.
 */
export function burnSeries(snapshots, timeframe = 'all') {
  const clean = usable(snapshots);
  const window = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : clean.length;
  const rows = clean.slice(-window);

  return {
    labels: rows.map((s) => s.date || ''),
    data: rows.map((s) => Number(s.totalBurn)),
    days: clean.length,
    dropped: (Array.isArray(snapshots) ? snapshots.length : 0) - clean.length,
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
  const clean = usable(snapshots);

  return {
    labels: clean.map((s) => s.date || ''),
    prices: clean.map((s) => Number(s.tokenPriceUsd) || 0),
    burn: clean.map((s, i) =>
      i === 0 ? 0 : Number(s.totalBurn) - Number(clean[i - 1].totalBurn),
    ),
  };
}
