// Daily USD closes for flywheel / snapshot backfill.
//
// Hourly snapshots only started ~2026-08-20. The ROI backfill then copied the
// first live DexScreener print onto every earlier clock_in row, so the
// flywheel drew a flat $0.01386 line through July and most of August.
//
// Real closes live in cache/price_days.json (GeckoTerminal pool OHLCV). This
// module stamps them onto clock_in rows and ownership.priceHistory. Live
// hourly rows are left alone.

const fs = require("fs");
const path = require("path");
const dates = require("./dates.cjs");

const CACHE = path.join(__dirname, "..", "cache", "price_days.json");

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveCache(all) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(all, null, 2));
}

function historyFromMap(byDate) {
  const labels = Object.keys(byDate)
    .filter((k) => Number(byDate[k]) > 0)
    .sort();
  return {
    labels,
    data: labels.map((k) => Number(byDate[k])),
    source: "geckoterminal",
  };
}

function applyToProject(project, byDate) {
  if (!project || !byDate || typeof byDate !== "object") return 0;
  let n = 0;
  for (const s of project.dailySnapshots || []) {
    const k = dates.dateKey(s.date);
    const px = Number(byDate[k]);
    if (!(px > 0) || px === 0.03) continue;
    // Only replace the copied first-print / clock_in placeholders. A later
    // hourly DexScreener row is a real observation and wins.
    if (s.yieldSource === "clock_in" || !(Number(s.tokenPriceUsd) > 0) || Number(s.tokenPriceUsd) === 0.03) {
      s.tokenPriceUsd = px;
      n++;
    }
  }
  project.ownership = {
    ...(project.ownership || {}),
    priceHistory: historyFromMap(byDate),
  };
  return n;
}

function applyCached(payload, cache = loadCache()) {
  if (!payload?.projects) return 0;
  let n = 0;
  for (const [key, byDate] of Object.entries(cache)) {
    if (key.startsWith("_") || !byDate || typeof byDate !== "object") continue;
    if (payload.projects[key]) n += applyToProject(payload.projects[key], byDate);
  }
  return n;
}

function mergeCloses(existing, rows) {
  const out = existing && typeof existing === "object" ? { ...existing } : {};
  let added = 0;
  for (const row of rows || []) {
    const day = String(row?.captured_at || row?.date || "").slice(0, 10);
    const px = Number(row?.price_usd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(px > 0)) continue;
    if (!(Number(out[day]) > 0)) {
      out[day] = px;
      added++;
    }
  }
  return { byDate: out, added };
}

// Days the indexer has and the dashboard does not yet. Existing positive
// prices and floors stay. A derived floor is unitValue × token × 1.10, which
// is the Anvil quote. Interns pass prepend:false and unitValue 0.
function ensureSnapshotDays(project, byDate, { unitValue = 0, prepend = true } = {}) {
  if (!project || !byDate) return 0;
  const snaps = Array.isArray(project.dailySnapshots) ? project.dailySnapshots : [];
  const have = new Set(snaps.map((s) => String(s?.date || "").slice(0, 10)).filter(Boolean));
  const dates = [...have].sort();
  const last = dates[dates.length - 1] || "";
  let n = 0;
  for (const [day, raw] of Object.entries(byDate)) {
    const px = Number(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(px > 0)) continue;
    if (have.has(day)) {
      const snap = snaps.find((s) => String(s?.date || "").slice(0, 10) === day);
      if (snap && !(Number(snap.tokenPriceUsd) > 0)) {
        snap.tokenPriceUsd = px;
        n++;
      }
      continue;
    }
    if (!prepend || (last && day > last)) continue;
    snaps.push({
      date: day,
      timestamp: Date.parse(`${day}T12:00:00Z`),
      tokenPriceUsd: px,
    });
    have.add(day);
    n++;
  }
  if (unitValue > 1) {
    for (const snap of snaps) {
      const px = Number(snap.tokenPriceUsd);
      if (px > 0 && !(Number(snap.nftFloorUsd) > 0)) snap.nftFloorUsd = unitValue * px * 1.1;
    }
  }
  snaps.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  project.dailySnapshots = snaps;
  return n;
}

module.exports = {
  CACHE,
  loadCache,
  saveCache,
  applyToProject,
  applyCached,
  historyFromMap,
  mergeCloses,
  ensureSnapshotDays,
};
