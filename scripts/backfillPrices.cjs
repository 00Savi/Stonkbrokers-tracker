/**
 * Backfill daily token USD closes onto clock_in snapshots.
 *
 * The flywheel was drawing a flat line through July because the first live
 * DexScreener print ($0.01386 for STONK) was copied onto every earlier row.
 * GeckoTerminal has the pool's daily close from first mint.
 *
 * Usage: node scripts/backfillPrices.cjs [stonk …]
 */
const fs = require("fs");
const path = require("path");
const priceDays = require("../lib/priceDays.cjs");

const DATA = path.join(__dirname, "..", "public", "data.json");
const DOCS = path.join(__dirname, "..", "docs", "data.json");

const POOLS = {
  stonk: {
    network: "robinhood",
    // Deepest STONK/WETH pool. The seeded V3 0.3% pool is a fraction of this.
    pool: "0xd33c8fd38b06e989cdbd4dffdefab71c4bdd415b24964c8d69e38ff35b068f92",
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCloses(network, pool) {
  const url =
    `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}` +
    `/ohlcv/day?aggregate=1&limit=1000&currency=usd`;
  let lastErr;
  for (let i = 0; i < 5; i++) {
    if (i) await sleep(4000 * i);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 429) {
      lastErr = "429";
      continue;
    }
    if (!res.ok) throw new Error(`geckoterminal ${res.status} ${url}`);
    const j = await res.json();
    const rows = j?.data?.attributes?.ohlcv_list || [];
    const byDate = {};
    for (const row of rows) {
      const ts = Number(row[0]);
      const close = Number(row[4]);
      if (!(ts > 0) || !(close > 0)) continue;
      const day = new Date(ts * 1000).toISOString().slice(0, 10);
      byDate[day] = close;
    }
    if (!Object.keys(byDate).length) throw new Error(`geckoterminal empty ohlcv for ${pool}`);
    return byDate;
  }
  throw new Error(`geckoterminal rate-limited: ${lastErr}`);
}

async function main() {
  const want = process.argv.slice(2);
  const keys = want.length ? want : Object.keys(POOLS);
  const cache = priceDays.loadCache();

  for (const key of keys) {
    const spec = POOLS[key];
    if (!spec) throw new Error(`no pool configured for ${key}`);
    const byDate = await fetchCloses(spec.network, spec.pool);
    const days = Object.keys(byDate).sort();
    cache[key] = byDate;
    console.log(
      `${key}: ${days.length} daily closes ${days[0]} → ${days[days.length - 1]} ` +
        `($${Number(byDate[days[0]]).toPrecision(3)} → $${Number(byDate[days[days.length - 1]]).toPrecision(3)})`,
    );
  }
  priceDays.saveCache(cache);

  const payload = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const n = priceDays.applyCached(payload, cache);
  const json = JSON.stringify(payload, null, 2);
  fs.writeFileSync(DATA, json);
  if (fs.existsSync(path.dirname(DOCS))) fs.writeFileSync(DOCS, json);
  console.log(`wrote ${n} snapshot prices → public/data.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
