// Newest Card Wall slabs, fetched when the page loads.
//
// thecardwall.com does not allow this origin to read pull results. gg-index
// does that read and returns the same drop shape the hourly snapshot stores.
// The snapshot stays on screen until this answers, and it stays there if the
// request fails.

const BASE = (import.meta.env?.VITE_GG_INDEX_URL || 'https://index.ggservices.dev').replace(/\/+$/, '');
const LOCAL_ART = /^\/gacha-drops\//;

export function dropArtUrl(dropId) {
  const [game, id] = String(dropId || '').split(':');
  if ((game !== 'alley' && game !== 'claw') || !/^\d+$/.test(id || '')) return null;
  return `${BASE}/v1/cardwall/art/${game}/${id}`;
}

export async function loadLiveDrops(signal) {
  const res = await fetch(`${BASE}/v1/cardwall/drops`, { signal, cache: 'no-store' });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body.drops) ? body.drops : null;
}

const STRIP = 36;

function machineName(drop) {
  if (!drop) return '';
  if (drop.game === 'claw' || String(drop.id || '').startsWith('claw:')) return 'The Claw';
  return drop.machine || '';
}

function newest(drops, limit = STRIP) {
  return [...drops]
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, limit);
}

/** Snapshot first, then any pulls the hourly index has not written yet. */
export function mergeDrops(snapshot, live) {
  const byId = new Map();
  for (const drop of snapshot || []) {
    if (drop?.id) byId.set(drop.id, drop);
  }
  for (const drop of live || []) {
    if (!drop?.id) continue;
    const prev = byId.get(drop.id);
    byId.set(drop.id, prev ? fill(prev, drop) : drop);
  }
  return newest(byId.values());
}

/**
 * All machines: the mixed newest strip.
 * One machine: that till's newest slabs from the pull index, with any live
 * spins the index has not written yet laid on top. No extra request.
 */
export function dropsForMachine(snapshotDrops, liveDrops, machinePulls, machine) {
  if (!machine) return mergeDrops(snapshotDrops, liveDrops);
  const byId = new Map();
  const take = (drop) => {
    if (!drop?.id || machineName(drop) !== machine) return;
    const prev = byId.get(drop.id);
    byId.set(drop.id, prev ? fill(prev, drop) : drop);
  };
  if (machine !== 'The Claw') {
    for (const pull of machinePulls || []) take(pull);
  }
  for (const drop of snapshotDrops || []) take(drop);
  for (const drop of liveDrops || []) take(drop);
  return newest(byId.values());
}

/** Alley spins the hourly snapshot has not counted yet. Same payload as the drops strip. */
export function freshAlleyDrops(snapshotDrops, liveDrops) {
  const seen = new Set();
  let cutoff = '';
  for (const drop of snapshotDrops || []) {
    if (drop?.id) seen.add(drop.id);
    if (drop?.at && drop.at > cutoff) cutoff = drop.at;
  }
  if (!cutoff) return [];
  return (liveDrops || []).filter((drop) => {
    if (!drop?.id || seen.has(drop.id)) return false;
    if (drop.game && drop.game !== 'alley') return false;
    if (!drop.game && !String(drop.id).startsWith('alley:')) return false;
    if (!drop.machine) return false;
    return String(drop.at || '') > cutoff;
  });
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Till rows the hourly snapshot has not written yet.
 * Match on the on-chain hash first, then the label, so a live spin and the
 * catalog do not open two rows for one machine.
 */
export function mergeMachineCatalog(machines, catalog) {
  const rows = (machines || []).map((row) => ({ ...row }));
  const byId = new Map();
  const byLabel = new Map();
  for (const row of rows) {
    byId.set(String(row.id || '').toLowerCase(), row);
    if (row.label) byLabel.set(row.label, row);
  }
  for (const entry of catalog || []) {
    const id = String(entry.id || '').toLowerCase();
    const label = entry.label;
    if (!id || !label) continue;
    const existing = byId.get(id) || byLabel.get(label);
    const priceCents = Number(entry.priceCents) || 0;
    const available = entry.available !== false;
    if (!existing) {
      const row = {
        id,
        label,
        game: 'alley',
        pulls: 0,
        usd: 0,
        paidIn: 0,
        valueOut: 0,
        spread: 0,
        priceCents,
        available,
      };
      rows.push(row);
      byId.set(id, row);
      byLabel.set(label, row);
      continue;
    }
    if (!existing.label || existing.label === 'Alley machine') existing.label = label;
    if (priceCents) existing.priceCents = priceCents;
    if (entry.available === false) existing.available = false;
    if (!String(existing.id || '').startsWith('0x')) existing.id = id;
    byId.set(id, existing);
    byLabel.set(label, existing);
  }
  rows.sort((a, b) =>
    (Number(b.usd) || 0) - (Number(a.usd) || 0)
    || (Number(b.pulls) || 0) - (Number(a.pulls) || 0)
    || (Number(b.priceCents) || 0) - (Number(a.priceCents) || 0)
  );
  return rows;
}

export async function loadMachineCatalog(signal) {
  const res = await fetch(`/alley-machines.json?v=${Date.now()}`, { signal, cache: 'no-store' });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body.machines) ? body.machines : [];
}

/** Add those spins onto the hourly machine totals. Machines with no spins stay on the hourly list. */
export function applyLiveMachines(machines, fresh) {
  if (!fresh?.length) return machines || [];
  const rows = (machines || []).map((row) => ({ ...row }));
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  for (const drop of fresh) {
    let row = byLabel.get(drop.machine);
    if (!row) {
      row = {
        id: `live:${drop.machine}`,
        label: drop.machine,
        game: 'alley',
        pulls: 0,
        usd: 0,
        paidIn: 0,
        valueOut: 0,
        spread: 0,
      };
      rows.push(row);
      byLabel.set(drop.machine, row);
    }
    const paid = Number(drop.paid) || 0;
    const value = Number(drop.value) || 0;
    const prevPaid = Number(row.paidIn ?? row.usd) || 0;
    row.pulls = (Number(row.pulls) || 0) + 1;
    row.usd = roundMoney((Number(row.usd) || 0) + paid);
    row.paidIn = roundMoney(prevPaid + paid);
    row.valueOut = roundMoney((Number(row.valueOut) || 0) + value);
    row.spread = roundMoney(row.paidIn - row.valueOut);
  }
  rows.sort((a, b) => (Number(b.usd) || 0) - (Number(a.usd) || 0) || (Number(b.pulls) || 0) - (Number(a.pulls) || 0));
  return rows;
}

function fill(prev, live) {
  const out = { ...prev };
  for (const [key, value] of Object.entries(live)) {
    if (value === null || value === undefined || value === '') continue;
    if (key === 'buyback') {
      out.buyback = Math.max(Number(prev.buyback) || 0, Number(value) || 0);
      continue;
    }
    if (key === 'delivered') {
      out.delivered = Boolean(prev.delivered) || Boolean(value);
      continue;
    }
    out[key] = value;
  }
  if (LOCAL_ART.test(prev.image || '')) out.image = prev.image;
  return out;
}
