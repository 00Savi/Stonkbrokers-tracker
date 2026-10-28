/**
 * Daily close of USD sitting in StonkBroker token-bound wallets the AMM holds.
 *
 * gg-index folds current balances only. It does not keep a balance for each
 * past day, so this series starts the first day a close is written. Earlier
 * days can be prepended later if a transfer replay is built; appendAnvilDay
 * inserts by date so a backfill does not have to be appended at the end.
 */

export function normalizeAnvilValue(series) {
  const dates = [];
  const usd = [];
  const nfts = [];
  const srcDates = series?.dates || [];
  const srcUsd = series?.usd || [];
  const srcNfts = series?.nfts || [];
  for (let i = 0; i < srcDates.length; i++) {
    const date = String(srcDates[i] || '');
    const value = Number(srcUsd[i]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(value > 0)) continue;
    dates.push(date);
    usd.push(value);
    nfts.push(Math.max(0, Math.round(Number(srcNfts[i]) || 0)));
  }
  return { dates, usd, nfts };
}

export function anvilDayStamped(series, date) {
  const base = normalizeAnvilValue(series);
  return base.dates.includes(String(date || ''));
}

/** Insert or replace one UTC day. A zero or blank close is ignored. */
export function appendAnvilDay(series, point) {
  const next = normalizeAnvilValue(series);
  const date = String(point?.date || '');
  const value = Number(point?.usd);
  const count = Math.max(0, Math.round(Number(point?.nfts) || 0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(value > 0)) return next;
  const existing = next.dates.indexOf(date);
  if (existing >= 0) {
    next.usd[existing] = value;
    next.nfts[existing] = count;
    return next;
  }
  let at = next.dates.findIndex((d) => d > date);
  if (at < 0) at = next.dates.length;
  next.dates.splice(at, 0, date);
  next.usd.splice(at, 0, value);
  next.nfts.splice(at, 0, count);
  return next;
}

export function anvilValueLatest(series) {
  const base = normalizeAnvilValue(series);
  const i = base.dates.length - 1;
  if (i < 0) return null;
  return { date: base.dates[i], usd: base.usd[i], nfts: base.nfts[i] };
}
