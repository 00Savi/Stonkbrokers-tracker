// Per-UTC-day realized yield, so a 30-day (or 90-day) window does not mean a
// 30-day Blockscout walk. Each hourly run writes today's bucket; older days
// stay on disk. GitHub Actions restores this file via the indexer cache.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "cache", "yield_days.json");
const KEEP = 120;

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

function merge(all, projectKey, dayUsd) {
  const days = { ...(all[projectKey] || {}) };
  for (const [k, v] of Object.entries(dayUsd)) {
    if (typeof v === "number" && Number.isFinite(v)) days[k] = v;
  }
  const keys = Object.keys(days).sort();
  while (keys.length > KEEP) {
    delete days[keys.shift()];
  }
  all[projectKey] = days;
  return all;
}

function trailing(all, projectKey, n, endKey) {
  const days = all[projectKey] || {};
  return Object.keys(days)
    .filter((k) => !endKey || k <= endKey)
    .sort()
    .slice(-n)
    .map((date) => ({ date, usd: Number(days[date]) || 0 }));
}

module.exports = { FILE, load, save, merge, trailing, utcKey };
