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
  return [...byId.values()]
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 36);
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
