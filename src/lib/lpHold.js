function inMode(vault, mode) {
  if (mode === 0 || mode === 1 || mode === 2) return vault.mode === mode;
  return true;
}

export function feesKeptUsd(vaults, mode) {
  let feesKeptUsd = 0;
  let n = 0;
  for (const v of vaults || []) {
    if (!inMode(v, mode)) continue;
    feesKeptUsd += (Number(v.fees7dUsd) || 0) - (Number(v.protocolFees7dUsd) || 0);
    n += 1;
  }
  return { n, feesKeptUsd };
}

export function sumVersusHold(vaults, mode) {
  const rows = [];
  for (const v of vaults || []) {
    if (!inMode(v, mode)) continue;
    const gap = Number(v.versusHold?.gapUsd);
    if (!Number.isFinite(gap)) continue;
    rows.push(v);
  }
  if (!rows.length) return null;
  let feesKept = 0;
  let gapUsd = 0;
  let netUsd = 0;
  let tvlUsd = 0;
  for (const v of rows) {
    const kept = Number(v.versusHold.feesKeptUsd);
    const gap = Number(v.versusHold.gapUsd);
    const net = Number(v.versusHold.netUsd);
    feesKept += Number.isFinite(kept) ? kept : (Number(v.fees7dUsd) || 0) - (Number(v.protocolFees7dUsd) || 0);
    gapUsd += gap;
    netUsd += Number.isFinite(net) ? net : gap;
    tvlUsd += Number(v.tvlUsd) || 0;
  }
  return {
    n: rows.length,
    feesKeptUsd: feesKept,
    gapUsd,
    netUsd,
    tvlUsd,
    windowDays: Number(rows[0].versusHold.windowDays) || 7,
  };
}
