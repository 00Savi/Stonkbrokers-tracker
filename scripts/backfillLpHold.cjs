// Stamp versusHold onto the Smart LP vaults already in public/data.json.
// Reads each vault's Uniswap position and the pool price at the start of the
// 7-day window. Leaves the file alone when no vault can be priced.

const fs = require("fs");
const { Rpc } = require("../lib/rpc.cjs");
const { BlockTime } = require("../lib/blocktime.cjs");
const { enrichVersusHold } = require("../lib/smartLp.cjs");

const path = "public/data.json";

(async () => {
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const smart = data.projects?.stonk?.revenue?.smartLp;
  if (!smart?.vaults?.length) {
    console.error("no smart LP vaults");
    process.exit(1);
  }
  const rpc = new Rpc();
  const blockTime = new BlockTime();
  blockTime.load();
  const head = await rpc.blockNumber();
  const last = blockTime.anchors.length ? blockTime.anchors[blockTime.anchors.length - 1][0] : 0;
  await blockTime.ensureRange(rpc, last || head, head);
  const eth = data.projects.stonk.market?.ethPriceUsd;
  const tokenPrices = {};
  for (const p of Object.values(data.projects || {})) {
    const ca = p.config?.tokenCa;
    const px = Number(p.market?.tokenPriceUsd);
    if (ca && px > 0) tokenPrices[String(ca).toLowerCase()] = px;
  }
  console.log(`vaults ${smart.vaults.length}, eth $${eth}, known prices ${Object.keys(tokenPrices).length}`);
  await enrichVersusHold(smart, {
    rpc,
    blockTime,
    ethPriceUsd: eth,
    tokenPrices,
    lookbackDays: 7,
  });
  const priced = smart.vaults.filter((v) => Number.isFinite(Number(v.versusHold?.gapUsd)));
  if (!priced.length) {
    console.error("no hold gaps; leaving data.json unchanged");
    process.exit(1);
  }
  const kept = priced.reduce((s, v) => s + v.versusHold.feesKeptUsd, 0);
  const gap = priced.reduce((s, v) => s + v.versusHold.gapUsd, 0);
  const net = priced.reduce((s, v) => s + v.versusHold.netUsd, 0);
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `wrote versusHold on ${priced.length}/${smart.vaults.length} vaults, fees kept $${kept.toFixed(0)}, versus hold $${gap.toFixed(0)}, net $${net.toFixed(0)}`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
