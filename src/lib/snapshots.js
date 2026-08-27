// Which recorded daily snapshots can be trusted, and how far back to plot them.
//
// `fetcher.cjs` appends one row per day and keeps 90. Every chart that shows
// history reads from those rows, so they all inherit the same question: was
// this row written by a run that worked?

/**
 * Drop snapshots left behind by a failed run.
 *
 * The marker is the cumulative burn, because a cumulative burn cannot decrease
 * -- tokens do not come back. Any row sitting above a later one is therefore a
 * bad read, and a run that got the burn wrong got the whole row wrong: price,
 * tier ROI and yield were all computed in the same pass.
 *
 * On 8/19 every project recorded exactly its own total supply as burnt (STONK
 * 2,962,663,704 = 4444 x 666666) because `getTrueDeflationStats` derives the
 * burn as `maxSupply * unitValue - currentSupply` and the supply read came back
 * zero. That row also carries 0.00% ROI across every tier.
 *
 * Note what is deliberately NOT the signal: an all-zero ROI row. CardWall
 * reports zero yield on every snapshot it has, because it is genuinely not
 * earning yet -- rejecting rows on that basis would erase a correct series and
 * call it data hygiene.
 *
 * The scan runs newest-first because the newest row is the one corroborated by
 * `dualBurn.totalBurnTokens` in the same payload. Anchoring to the oldest would
 * let a poisoned first row set an impossible floor and discard everything real
 * behind it.
 */
export function usableSnapshots(snapshots) {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const clean = [];
  let ceiling = Infinity;

  for (let i = rows.length - 1; i >= 0; i--) {
    const burn = Number(rows[i]?.totalBurn);
    if (!Number.isFinite(burn) || burn <= 0 || burn > ceiling) continue;
    ceiling = burn;
    clean.unshift(rows[i]);
  }

  return clean;
}

/**
 * The trailing `days` usable snapshots, oldest first.
 *
 * Fewer rows than asked for is the normal answer, not an error to paper over.
 * Snapshots only began on 8/19, so a 14-day window returns what exists and the
 * chart simply starts where the record does.
 */
export function trailingSnapshots(snapshots, days) {
  const clean = usableSnapshots(snapshots);
  return days > 0 ? clean.slice(-days) : clean;
}
