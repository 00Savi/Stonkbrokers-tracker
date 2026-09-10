// Per-UTC-day realized yield and protocol streams, so a 30-day (or 90-day)
// window does not mean a 30-day Blockscout walk. Each hourly run writes
// today's buckets; older days stay on disk. GitHub Actions restores this file
// via the indexer cache. gg-index is the durable copy; this is the local
// fallback when the index is behind or unreachable.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "cache", "yield_days.json");
const KEEP = 365;

const STREAM_KEYS = ["amm", "box", "volume", "tax", "dex", "smartLp"];

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(all) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

function utcKey(ts) {
  return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
}

function asStreams(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = {};
    for (const k of STREAM_KEYS) {
      const n = Number(v[k]);
      if (Number.isFinite(n)) o[k] = n;
    }
    if (Number.isFinite(Number(v.usd)) && o.amm == null) o.amm = Number(v.usd);
    return o;
  }
  const n = Number(v);
  return Number.isFinite(n) ? { amm: n } : {};
}

function merge(all, projectKey, dayUsd) {
  const days = { ...(all[projectKey] || {}) };
  for (const [k, v] of Object.entries(dayUsd)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      days[k] = { ...asStreams(days[k]), amm: v };
    }
  }
  return prune(all, projectKey, days);
}

function mergeStreams(all, projectKey, dayMap) {
  const days = { ...(all[projectKey] || {}) };
  for (const [k, v] of Object.entries(dayMap || {})) {
    days[k] = { ...asStreams(days[k]), ...asStreams(v) };
  }
  return prune(all, projectKey, days);
}

function prune(all, projectKey, days) {
  const keys = Object.keys(days).sort();
  while (keys.length > KEEP) delete days[keys.shift()];
  all[projectKey] = days;
  return all;
}

function trailing(all, projectKey, n, endKey) {
  return trailingStreams(all, projectKey, n, endKey).map((r) => ({
    date: r.date,
    usd: Number(r.amm) || 0,
  }));
}

function trailingStreams(all, projectKey, n, endKey) {
  const days = all[projectKey] || {};
  return Object.keys(days)
    .filter((k) => !endKey || k <= endKey)
    .sort()
    .slice(-n)
    .map((date) => ({ date, ...asStreams(days[date]) }));
}

module.exports = {
  FILE,
  KEEP,
  STREAM_KEYS,
  load,
  save,
  merge,
  mergeStreams,
  trailing,
  trailingStreams,
  utcKey,
  asStreams,
};
