// Newest AMM swaps, activations, and deactivations for one project.
//
// gg-index already stores these as chain events. A swap is an NFT transfer
// with the AMM vault on one side. Activated and cleared are the seat events.
// block_time is empty on these rows, so a clock is estimated from the chain
// head at about 10 blocks a second, the rate measured for this chain.

import { ANVIL_VAULTS } from './anvilScan';
import { NIGHTSHADES_FACTIONS } from './nightshades';
import { ROBINHOOD_RPC } from './bonusTokenomics';

const BASE = (import.meta.env?.VITE_GG_INDEX_URL || 'https://index.ggservices.dev').replace(/\/+$/, '');
const BLOCKS_PER_SEC = 10;
const PER_KIND = 20;
const STRIP = 36;

const ZERO = '0x0000000000000000000000000000000000000000';

export function tapeBooks(projectKey, faction) {
  if (projectKey === 'nightshades') {
    const ids = faction && faction !== 'all' && NIGHTSHADES_FACTIONS.includes(faction)
      ? [faction]
      : NIGHTSHADES_FACTIONS;
    return ANVIL_VAULTS.filter((v) => ids.includes(v.faction)).map(toBook);
  }
  return ANVIL_VAULTS.filter((v) => v.key === projectKey && !v.faction).map(toBook);
}

function toBook(v) {
  return {
    slug: v.faction || v.id,
    nftCa: v.nftCa,
    ammCa: String(v.ammCa || '').toLowerCase(),
    label: v.faction ? v.name.replace(/^Nightshades /, '') : v.name,
  };
}

export function tokenAmount(value) {
  if (value == null || value === '') return null;
  let raw;
  try {
    raw = BigInt(String(value).split('.')[0]);
  } catch {
    return null;
  }
  if (raw <= 0n) return null;
  const whole = raw / 10n ** 18n;
  const n = Number(whole);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString('en-US');
}

export function eventAgeSeconds(block, head) {
  const b = Number(block);
  const h = Number(head);
  if (!Number.isFinite(b) || !Number.isFinite(h)) return null;
  if (h < b) return 0;
  return (h - b) / BLOCKS_PER_SEC;
}

export function agoLabel(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 90) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length < 10) return '';
  if (a.toLowerCase() === ZERO) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function side(event, amm) {
  const from = String(event.from || '').toLowerCase();
  const to = String(event.to || '').toLowerCase();
  if (event.kind === 'activated') return 'activation';
  if (event.kind === 'cleared') return 'deactivation';
  if (event.kind !== 'transfer' || event.token_id == null || event.token_id === '') return null;
  if (!amm) return null;
  if (to === amm && from !== amm) return 'sold-in';
  if (from === amm && to !== amm) return 'bought-out';
  return null;
}

export function buildTape(events, limit = STRIP) {
  const rows = [];
  for (const event of events || []) {
    const book = event.book;
    if (!book) continue;
    const kind = side(event, book.ammCa);
    if (!kind) continue;
    const tokenId = event.token_id == null || event.token_id === '' ? null : String(event.token_id).split('.')[0];
    const wallet = kind === 'sold-in' ? event.from : kind === 'bought-out' ? event.to : event.to;
    rows.push({
      id: `${event.transaction_hash}:${event.log_index}`,
      kind,
      tokenId,
      block: Number(event.block_number) || 0,
      logIndex: Number(event.log_index) || 0,
      tx: event.transaction_hash,
      wallet: shortAddr(wallet),
      amount: kind === 'activation' ? tokenAmount(event.value) : null,
      nftCa: book.nftCa,
      label: book.label,
      imageKey: `${book.nftCa}:${tokenId}`,
    });
  }
  rows.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchEvents(params, signal) {
  const q = new URLSearchParams(params);
  const res = await fetch(`${BASE}/v1/events?${q}`, { signal, cache: 'no-store' });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body.events) ? body.events : [];
}

export async function chainHead(signal) {
  const res = await fetch(ROBINHOOD_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal,
  });
  if (!res.ok) return null;
  const body = await res.json();
  const n = parseInt(body.result, 16);
  return Number.isFinite(n) ? n : null;
}

export async function loadEventTape(books, signal) {
  const lists = await Promise.all((books || []).flatMap((book) => {
    const tag = (events) => events.map((event) => ({ ...event, book }));
    return [
      fetchEvents({ project: book.slug, kind: 'activated', limit: String(PER_KIND) }, signal).then(tag),
      fetchEvents({ project: book.slug, kind: 'cleared', limit: String(PER_KIND) }, signal).then(tag),
      fetchEvents({
        project: book.slug,
        kind: 'transfer',
        address: book.nftCa,
        participant: book.ammCa,
        limit: String(PER_KIND),
      }, signal).then(tag),
    ];
  }));
  return buildTape(lists.flat());
}
