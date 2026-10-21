// A UTC month of seat cash, plus the streams printed that day.
//
// The cell is the cash `seatCashByDate` already uses: this tier's weight of
// the holder book. Paid-out and still-in-the-pot are the two sides of that
// same cash. Clock-In, snipe tax, partner share, and the Smart LP skim are
// the protocol streams on that day. A stream that *is* the holder book is
// the pot, not a second fee.

import { holderStreams } from './books';
import { dateKey } from './dates';
import { seatCashByDate } from './yieldSample';

const WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PROTOCOL = [
  { key: 'box', label: 'Clock-In', field: 'historyBox' },
  { key: 'tax', label: 'Snipe tax', field: 'historyTax' },
  { key: 'booster', label: 'Partner share', field: 'historyBooster' },
  { key: 'smartLp', label: 'Smart LP skim', field: 'historySmartLp' },
  { key: 'dex', label: 'DEX', field: 'historyDex' },
  { key: 'amm', label: 'AMM', field: 'historyAmm' },
];

const HOLDER_LABEL = {
  paid: 'Paid to seats',
  float: 'Cash in the pot',
  amm: 'AMM book',
  dex: 'DEX',
};

function column(rev, field) {
  const map = new Map();
  const dates = rev?.historyDates || [];
  const values = rev?.[field] || [];
  dates.forEach((day, i) => {
    const key = dateKey(day);
    const n = Number(values[i]);
    if (!key || !Number.isFinite(n)) return;
    map.set(key, n);
  });
  return map;
}

export function payoutDays(project, tier) {
  const cash = seatCashByDate(project, tier);
  if (!cash.size) return [];
  const rev = project?.revenue || {};
  const streams = holderStreams(project);
  const holderKeys = new Set([...(streams.paid || []), ...(streams.float || [])]);
  const maps = {};
  for (const spec of PROTOCOL) maps[spec.key] = column(rev, spec.field);
  maps.paid = column(rev, 'historyPaid');
  maps.float = column(rev, 'historyFloat');

  const days = [];
  for (const [date, seat] of cash) {
    const amount = Number(seat) || 0;
    let paidPot = 0;
    let floatPot = 0;
    const potLines = [];
    for (const key of streams.paid || []) {
      const usd = maps[key]?.get(date) || 0;
      paidPot += usd;
      potLines.push({ key, label: HOLDER_LABEL[key] || key, usd, side: 'paid' });
    }
    for (const key of streams.float || []) {
      const usd = maps[key]?.get(date) || 0;
      floatPot += usd;
      potLines.push({ key, label: HOLDER_LABEL[key] || key, usd, side: 'float' });
    }
    const pot = paidPot + floatPot;
    let paidShare = 0;
    let floatShare = 0;
    if (pot > 0) {
      paidShare = amount * paidPot / pot;
      floatShare = amount * floatPot / pot;
    } else if ((streams.float || []).length && !(streams.paid || []).length) {
      floatShare = amount;
    } else {
      paidShare = amount;
    }
    const sources = PROTOCOL
      .filter((spec) => !holderKeys.has(spec.key))
      .map((spec) => ({ key: spec.key, label: spec.label, usd: maps[spec.key]?.get(date) || 0 }))
      .filter((row) => row.usd > 0);
    days.push({
      date,
      seat: amount,
      paidShare,
      floatShare,
      pot,
      potLines,
      sources,
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

export function weekdayRollup(days) {
  const buckets = WEEK_SHORT.map((short, dow) => ({
    dow,
    short,
    long: WEEK_LONG[dow],
    cash: 0,
    n: 0,
    active: 0,
    avg: 0,
  }));
  for (const day of days || []) {
    const [y, m, d] = day.date.split('-').map(Number);
    if (!y || !m || !d) continue;
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const bucket = buckets[dow];
    bucket.cash += day.seat || 0;
    bucket.n += 1;
    if ((day.seat || 0) > 0) bucket.active += 1;
  }
  for (const bucket of buckets) {
    bucket.avg = bucket.n ? bucket.cash / bucket.n : 0;
  }
  return buckets;
}

export function heaviestWeekday(buckets) {
  let best = null;
  for (const bucket of buckets || []) {
    if (!bucket.n) continue;
    if (!best || bucket.avg > best.avg) best = bucket;
  }
  return best;
}

export function monthsIn(days) {
  const out = [];
  const seen = new Set();
  for (const day of days || []) {
    const key = day.date.slice(0, 7);
    if (seen.has(key)) continue;
    seen.add(key);
    const [year, month] = key.split('-').map(Number);
    out.push({ key, year, month });
  }
  return out;
}

/** Monday-first cells. `null` is a leading or trailing blank. */
export function monthCells(year, month, byDate) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = (firstDow + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day, row: byDate.get(date) || null });
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
