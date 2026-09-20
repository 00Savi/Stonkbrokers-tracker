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

module.exports = { CACHE, loadCache, saveCache, applyToProject, applyCached, historyFromMap };
