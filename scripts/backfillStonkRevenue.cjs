/**
 * Replay StonkBooster protocol revenue from chain, for days before the
 * dashboard existed (history currently starts 2026-08-15 from git snapshots).
 *
 * Streams match the live mix:
 *   amm      — WETH/ETH/STONK into Clock In v1 (retired), v2, and Overtime
 *              (Anvil / Clock In fees). Box→v1 WETH hops are not AMM.
 *   box      — ERC-20 into the Safety Deposit Clock In router
 *   tax      — V2/V3 pad tax (not Nightshades 99% withhold)
 *   booster  — civ 13.33% + Mancer 25% of DEX collector WETH
 *   smartLp  — Smart LP FeesCollected skim
 *
 * Days the dashboard already printed are left alone. Writes cache/yield_days.json
 * and extends public/data.json (and docs/) history arrays.
 *
 * `--holders-only` skips the chain walk: fills historyHolder from Clock In AMM
 * and estimates ROI snapshots before the T4 oracle (2026-08-20).
 */
const fs = require("fs");
const path = require("path");
const { Rpc, TOPIC, addrTopic, decodeUint, topicAddr } = require("../lib/rpc.cjs");
const { decimalsOf } = require("../lib/chain.cjs");
const { BlockTime } = require("../lib/blocktime.cjs");
const dates = require("../lib/dates.cjs");
const yieldDays = require("../lib/yieldDays.cjs");

const GENESIS = 12_600_000;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const STONK = "0xe934e36a439c94017b64a3fece66af12099abf50";
const BOX = "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c";
const CLOCK_IN_V2 = "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9";
const CLOCK_IN_V1 = "0x038a7f4e4e89448ad74e044337c9ac25c11e726b";
const OVERTIME = "0xf9ca5f6d8622c82758914681a12674e2d489259a";
const DASHBOARD_START = "2026-08-15";
const ORACLE_START = "2026-08-20";
const FEE_ROUTER = "0x74f161cfd4035be8f1606e6604a34548c89447a5";
const LP_LOCKER = "0xa6bff814fc8ee3e1f134c767d384d0d9d94147c8";
const NIGHTSHADES_PAD = "0xca389585c4940b107d49af4a37ad259c5fb69081";
const MANCER_DEX = "0x5f3b7e837f2d5b6c38e78ee4f45bd140a226656e";
const CIV_BOOSTER_BPS = 1333n;
const MANCER_SHARE = 0.25;

const SAFE_BUY = "0xba22b06917da96d20a8f4f80d45cbdaaf3294856de78268558edcce22e4298df";
const SAFE_SELL = "0x2de6d6d1573ee69658d3daae2e752379e6eb0676622a5ade2812088d7cb56581";
const CIV_BUY = "0x8eabef5bff7d4e7ca4c2c908d2aaf985e647a5009b534a12c423ab7e37a42c86";
const FEES_COLLECTED = "0xf5d590414d56d256b8c16b850d0b57f2f5d2ed90686166e150b48a96f0dbdd61";

const PADS = [
  { pad: "0xfcd61b25bbf3abd6cf0070d6328e351cc30eec9f", quote: WETH },
  { pad: "0x8f6782c5aa37804d08a9b7bf3984ff3245fd6cd4", quote: STONK },
  { pad: "0xd4f20033586977a2511f4a2db4af7c79a340d70a", quote: "usdg" },
  { pad: "0x4b9dcd6ccfaef0f6d23065dd78e79d5e20ec8cfd", quote: "0x1b0e319c6a659f002271b69db8a7df2f911c153e" },
  { pad: "0xee96d955d5634813374ece4c74f2c0ff71b1f9fb", quote: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" },
  { pad: "0xb0453a81cbf963903409fff18ad92941e1c7a864", quote: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" },
  { pad: "0x0c3b4eded41696eff0ed70841f132b519d81c947", quote: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" },
  { pad: "0xdb3c81c841ff88db6cdfbddb0ee049d162a6053b", quote: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" },
  { pad: "0x5bceefba6fdf437a7388adc5c9056c827baca3b3", quote: WETH },
  { pad: "0x406fd0b957bb8cf1dd57c78540d009578e971131", quote: STONK },
  { pad: "0xf0a06ac7bbb0cc3049b68c257c3ee27ccea40eea", quote: "usdg" },
  { pad: "0x5b21f8a5ef81586627b4725844ad447325d0992b", quote: "0x1b0e319c6a659f002271b69db8a7df2f911c153e" },
  { pad: "0xdf03953dca8db733345278a0c5fd2e81fa2a9b54", quote: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" },
  { pad: "0xc522dfae0d1a140257702392b665183a6de7657f", quote: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" },
  { pad: "0xd82da1d8ef59959b170b59147283ab1f2f1ca86a", quote: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" },
  { pad: "0x644b19512052a1b6d38d7b16c6c3fb1d3f7270d2", quote: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" },
  { pad: NIGHTSHADES_PAD, quote: WETH, civ: true },
];

const TOKENS = [
  WETH, USDG, STONK,
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9",
  "0x12f190a9f9d7d37a250758b26824b97ce941bf54",
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
  "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f",
  "0xe93237c50d904957cf27e7b1133b510c669c2e74",
  "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2",
  "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea",
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3",
  "0x1b0e319c6a659f002271b69db8a7df2f911c153e",
  "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344",
  "0xc72f232a6869e6cf34dc06129affd07f8a2a246a",
  "0xe3fa12da7fa026b21817f16622e8ae48fa785166",
  "0xb03058b8a39f3967df08d833682c1c99b29821b1",
];

const DATA = path.join(__dirname, "..", "public", "data.json");
const DOCS = path.join(__dirname, "..", "docs", "data.json");
const WETH_ZERO = "0x0000000000000000000000000000000000000000";

function emptyDay() {
  return { amm: 0, box: 0, tax: 0, booster: 0, smartLp: 0, volume: 0 };
}

function add(map, day, stream, usd) {
  if (!(usd > 0) || !day) return;
  const row = map.get(day) || emptyDay();
  row[stream] = (row[stream] || 0) + usd;
  map.set(day, row);
}

function dayOf(blockTime, log) {
  const bn = typeof log.blockNumber === "number"
    ? log.blockNumber
    : parseInt(log.blockNumber, 16);
  return dates.utcIsoFromTs(blockTime.at(bn));
}

async function ethDailyCloses() {
  const end = new Date();
  const start = new Date(Date.UTC(2026, 5, 1));
  const url = `https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=86400&start=${start.toISOString()}&end=${end.toISOString()}`;
  const r = await fetch(url);
  const rows = await r.json();
  const out = new Map();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const [t, , , , close] = row;
    if (!(close > 0)) continue;
    out.set(dates.utcIsoFromTs(t), Number(close));
  }
  return out;
}

async function dexPrices(tokens) {
  const out = new Map();
  out.set(USDG, 1);
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokens.join(",")}`);
    const j = await r.json();
    const rows = Array.isArray(j?.pairs) ? j.pairs : [];
    for (const p of rows) {
      const addr = String(p?.baseToken?.address || "").toLowerCase();
      const px = Number(p?.priceUsd);
      if (addr && px > 0) {
        const prev = out.get(addr) || 0;
        if (px > prev) out.set(addr, px);
      }
    }
  } catch (e) {
    console.warn("[warn] dexscreener", e.message);
  }
  return out;
}

async function internals(address) {
  const out = [];
  for (let page = 1; page <= 80; page++) {
    const url = `https://robinhoodchain.blockscout.com/api?module=account&action=txlistinternal&address=${address}&page=${page}&offset=1000&sort=asc`;
    const r = await fetch(url);
    const j = await r.json().catch(() => null);
    const rows = Array.isArray(j?.result) ? j.result : [];
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < 1000) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  return out;
}

function fillHolderAndRoi(stonk) {
  const histDates = (stonk.revenue?.historyDates || []).map((d) => dates.dateKey(d)).filter(Boolean);
  const amm = stonk.revenue?.historyAmm || [];
  const ammBy = new Map(histDates.map((d, i) => [d, Number(amm[i]) || 0]));

  const liveSnaps = (stonk.dailySnapshots || []).filter((s) => s.yieldSource !== "clock_in");
  const firstSnap = liveSnaps.find((s) => dates.dateKey(s.date));
  const oracleStart = firstSnap ? dates.dateKey(firstSnap.date) : ORACLE_START;

  stonk.revenue.historyHolder = histDates.map((d) => (
    d >= oracleStart ? 0 : +(ammBy.get(d) || 0).toFixed(2)
  ));

  const anchor = liveSnaps.find((s) => {
    const n = Number(s.activeCount)
      || Object.values(s.tierActive || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    return n > 0 && Number(s.nftFloorUsd) > 0;
  }) || liveSnaps.find((s) => Number(s.nftFloorUsd) > 0) || liveSnaps[0];

  if (!anchor) {
    return { oracleStart, holderDays: histDates.filter((d) => d < oracleStart).length, roiDays: 0 };
  }

  const tiers = stonk.tiers || [];
  const weights = Object.fromEntries(tiers.map((t) => [t.tier, Number(t.weight) || 0]));
  const mix = { ...(anchor.tierActive || {}) };
  const mixN = Object.values(mix).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  const mixW = Object.entries(mix).reduce((s, [k, n]) => s + (Number(n) || 0) * (weights[k] || 0), 0);
  const floorUsd = Number(anchor.nftFloorUsd) || 0;
  const floorEth = Number(anchor.nftFloorEth) || 0;
  const px = Number(anchor.tokenPriceUsd) || 0;
  const burn = Number(firstSnap?.totalBurn) || Number(anchor.totalBurn) || 1;
  const maxSupply = Number(stonk.config?.maxSupply) || 4444;

  const cumBy = new Map();
  const ah = stonk.activation?.history || {};
  (ah.labels || []).forEach((d, i) => {
    const iso = dates.dateKey(d);
    if (iso) cumBy.set(iso, Number(ah.cumulative[i]) || 0);
  });

  const have = new Set(liveSnaps.map((s) => dates.dateKey(s.date)).filter(Boolean));
  const extra = [];
  const roiAmm = (d, i) => {
    const v = ammBy.get(d) || 0;
    const prev = i > 0 ? ammBy.get(histDates[i - 1]) || 0 : v;
    const next = i < histDates.length - 1 ? ammBy.get(histDates[i + 1]) || 0 : v;
    const neighbor = Math.min(prev, next);
    // Inside a FOMO plateau (~$140k+ days), a UTC bucket can print half or
    // a tenth of its neighbors. Annualizing that as yield/CoC carves a V.
    // Only interpolate when both sides are already hot.
    const hot = 50_000;
    if (prev > hot && next > hot && neighbor > 0 && v < neighbor * 0.7) {
      return (prev + next) / 2;
    }
    return v;
  };
  for (let i = 0; i < histDates.length; i++) {
    const d = histDates[i];
    if (d >= oracleStart || have.has(d)) continue;
    const dayAmm = roiAmm(d, i);
    const cum = cumBy.get(d);
    const scaleAct = cum > 0 ? cum / mixN : 1;
    const dayWeight = mixW * scaleAct;
    const perW = dayWeight > 0 ? dayAmm / dayWeight : 0;
    const tierActive = {};
    let activeCount = 0;
    for (const [k, n] of Object.entries(mix)) {
      const c = Math.round((Number(n) || 0) * scaleAct);
      tierActive[k] = c;
      activeCount += c;
    }
    extra.push({
      date: d,
      timestamp: Date.parse(`${d}T12:00:00Z`),
      tokenPriceUsd: px,
      nftFloorEth: floorEth,
      nftFloorUsd: floorUsd,
      totalBurn: burn,
      yieldSource: "clock_in",
      activeCount,
      percentActivated: +((activeCount / maxSupply) * 100).toFixed(2),
      tierActive,
      tiers: tiers.map((t) => {
        const annual = perW * (Number(t.weight) || 0) * 365;
        const cost = floorUsd + (Number(t.reqTokens) || 0) * px;
        return {
          tier: t.tier,
          yieldUsd: +annual.toFixed(4),
          roi: cost > 0 ? (annual / cost) * 100 : 0,
        };
      }),
    });
  }
  extra.sort((a, b) => a.date.localeCompare(b.date));
  stonk.dailySnapshots = [...extra, ...liveSnaps];
  return {
    oracleStart,
    holderDays: histDates.filter((d) => d < oracleStart).length,
    roiDays: extra.length,
  };
}

function writeData(prev) {
  const json = JSON.stringify(prev, null, 2);
  fs.writeFileSync(DATA, json);
  fs.writeFileSync(DOCS, json);
}

async function holdersOnly() {
  const prev = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const stats = fillHolderAndRoi(prev.projects.stonk);
  writeData(prev);
  console.log("Holder / ROI backfill", stats);
}

async function main() {
  if (process.argv.includes("--holders-only")) {
    await holdersOnly();
    return;
  }

  const prev = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const stonk = prev.projects.stonk;
  const keepFrom = DASHBOARD_START;
  console.log("keep dashboard history from", keepFrom, "(Clock In v1 + v2 + Overtime before that)");

  const snaps = stonk.dailySnapshots || [];
  const stonkPxByDay = new Map();
  for (const s of snaps) {
    const d = dates.dateKey(s.date);
    const px = Number(s.tokenPriceUsd);
    if (d && px > 0) stonkPxByDay.set(d, px);
  }

  const rpc = new Rpc();
  const blockTime = new BlockTime().load();
  const head = await rpc.blockNumber();
  await blockTime.ensureRange(rpc, GENESIS, head);
  blockTime.save();
  console.log("head", head, "anchors", blockTime.anchors.length);

  const ethPx = await ethDailyCloses();
  const live = await dexPrices([...new Set(TOKENS)]);
  if (!live.get(WETH) && ethPx.size) live.set(WETH, [...ethPx.values()].at(-1));
  console.log("ETH days", ethPx.size, "STONK live", live.get(STONK) || 0);

  const dec = await decimalsOf(rpc, TOKENS);
  const pxOf = (token, day) => {
    const t = token.toLowerCase();
    if (t === USDG) return 1;
    if (t === WETH) return ethPx.get(day) || live.get(WETH) || 0;
    if (t === STONK) return stonkPxByDay.get(day) || live.get(STONK) || 0;
    return live.get(t) || 0;
  };
  const amtUsd = (token, raw, day) => {
    const d = dec.get(token.toLowerCase()) ?? 18;
    const px = pxOf(token, day);
    if (!(px > 0) || raw == null) return 0;
    return (Number(raw) / 10 ** d) * px;
  };

  const byDay = new Map();
  const padBy = new Map(PADS.map((p) => [p.pad, p]));
  const padSet = new Set(PADS.map((p) => p.pad));

  const ammPots = new Set([CLOCK_IN_V1, CLOCK_IN_V2, OVERTIME]);
  const sinks = {
    [BOX]: "box",
    [CLOCK_IN_V1]: "amm",
    [CLOCK_IN_V2]: "amm",
    [OVERTIME]: "amm",
    [FEE_ROUTER]: "tax",
    [MANCER_DEX]: "mancerDex",
  };

  console.log("ERC-20 inflows to box / Clock In v1+v2 / Overtime / fee router / Mancer DEX…");
  const tokenLogs = await rpc.getLogs({
    address: TOKENS,
    fromBlock: GENESIS,
    toBlock: head,
    topics: [TOPIC.transfer, null, Object.keys(sinks).map(addrTopic)],
  }, (to, end, n) => process.stdout.write(`\r  tokens ${to}/${end} ${n} logs`));
  process.stdout.write(`\n  token logs ${tokenLogs.length}\n`);

  for (const log of tokenLogs) {
    const to = topicAddr(log.topics[2]);
    const from = topicAddr(log.topics[1]);
    const stream = sinks[to];
    if (!stream) continue;
    if (from === LP_LOCKER || from === to) continue;
    // Locker fees are the box series. v1 still receives the 90% WETH hop from
    // the box — that is not extra Anvil AMM.
    if (stream === "amm" && (from === BOX || ammPots.has(from))) continue;
    if (stream === "tax" && (padSet.has(from) || from === FEE_ROUTER)) continue;
    const day = dayOf(blockTime, log);
    const usd = amtUsd(log.address, decodeUint(log.data, 0), day);
    if (stream === "mancerDex") add(byDay, day, "booster", usd * MANCER_SHARE);
    else add(byDay, day, stream, usd);
  }

  console.log("Native ETH internals (Clock In v1+v2 + box)…");
  for (const [addr, stream] of [[CLOCK_IN_V1, "amm"], [CLOCK_IN_V2, "amm"], [OVERTIME, "amm"], [BOX, "box"]]) {
    const rows = await internals(addr);
    console.log(" ", addr.slice(0, 10), rows.length, "internal txs");
    for (const tx of rows) {
      if (tx.isError === "1") continue;
      const to = String(tx.to || "").toLowerCase();
      const from = String(tx.from || "").toLowerCase();
      if (to !== addr) continue;
      if (from === WETH || from === BOX || ammPots.has(from)) continue;
      const eth = Number(tx.value || 0) / 1e18;
      if (!(eth > 0)) continue;
      const day = dates.utcIsoFromTs(parseInt(tx.timeStamp || tx.timestamp || 0, 10));
      add(byDay, day, stream, eth * (ethPx.get(day) || live.get(WETH) || 0));
    }
  }

  console.log("Launchpad SafeBuy / SafeSell / civ…");
  const padLogs = await rpc.getLogs({
    address: PADS.map((p) => p.pad),
    fromBlock: GENESIS,
    toBlock: head,
    topics: [[SAFE_BUY, SAFE_SELL, CIV_BUY]],
  }, (to, end, n) => process.stdout.write(`\r  pads ${to}/${end} ${n} logs`));
  process.stdout.write(`\n  pad logs ${padLogs.length}\n`);

  for (const log of padLogs) {
    const pad = padBy.get((log.address || "").toLowerCase());
    if (!pad) continue;
    const topic0 = (log.topics[0] || "").toLowerCase();
    const quoteWei = topic0 === SAFE_SELL ? decodeUint(log.data, 3) : decodeUint(log.data, 0);
    if (quoteWei == null || quoteWei <= 0n) continue;
    const taxPaid = decodeUint(log.data, 1);
    const taxBps = decodeUint(log.data, 2) || 0n;
    const taxWei = topic0 === CIV_BUY
      ? (taxPaid || 0n)
      : (taxPaid != null && taxPaid > 0n ? taxPaid : (quoteWei * taxBps) / 10000n);
    const day = dayOf(blockTime, log);
    const quoteToken = pad.quote === "usdg" ? USDG : pad.quote;
    const vol = amtUsd(quoteToken, quoteWei, day);
    add(byDay, day, "volume", vol);
    if (topic0 === CIV_BUY && taxWei > 0n) {
      add(byDay, day, "booster", amtUsd(quoteToken, (taxWei * CIV_BOOSTER_BPS) / 10000n, day));
    } else if (!pad.civ && taxWei > 0n) {
      add(byDay, day, "tax", amtUsd(quoteToken, taxWei, day));
    }
  }

  const vaultCas = (stonk.revenue?.smartLp?.vaults || []).map((v) => String(v.ca || "").toLowerCase()).filter(Boolean);
  if (vaultCas.length) {
    console.log("Smart LP FeesCollected on", vaultCas.length, "vaults…");
    const skimLogs = await rpc.getLogs({
      address: vaultCas,
      fromBlock: GENESIS,
      toBlock: head,
      topics: [FEES_COLLECTED],
    }, (to, end, n) => process.stdout.write(`\r  skim ${to}/${end} ${n} logs`));
    process.stdout.write(`\n  skim logs ${skimLogs.length}\n`);
    const vaultBy = new Map((stonk.revenue.smartLp.vaults || []).map((v) => [String(v.ca || "").toLowerCase(), v]));
    for (const log of skimLogs) {
      const v = vaultBy.get((log.address || "").toLowerCase());
      if (!v) continue;
      const day = dayOf(blockTime, log);
      const skim0 = decodeUint(log.data, 2);
      const skim1 = decodeUint(log.data, 3);
      let usd = 0;
      if (v.token0) usd += amtUsd(v.token0, skim0, day);
      if (v.token1) usd += amtUsd(v.token1, skim1, day);
      add(byDay, day, "smartLp", usd);
    }
  }

  const days = [...byDay.keys()].filter(Boolean).sort();
  const sum = (k) => days.reduce((s, d) => s + (byDay.get(d)[k] || 0), 0);
  const chainTotal = sum("amm") + sum("box") + sum("tax") + sum("booster") + sum("smartLp");
  console.log("\nChain replay (all days, USD):");
  console.log("  amm     ", sum("amm").toFixed(0));
  console.log("  box     ", sum("box").toFixed(0));
  console.log("  tax     ", sum("tax").toFixed(0));
  console.log("  booster ", sum("booster").toFixed(0));
  console.log("  smartLp ", sum("smartLp").toFixed(0));
  console.log("  TOTAL   ", chainTotal.toFixed(0));
  console.log("  first   ", days[0], "last", days[days.length - 1], "n", days.length);

  const filled = days.filter((d) => d < keepFrom);
  console.log("Filling", filled.length, "days before", keepFrom);

  const dayMap = {};
  for (const d of filled) dayMap[d] = byDay.get(d);
  yieldDays.save(yieldDays.mergeStreams(yieldDays.load(), "stonk", dayMap));

  const hist = {
    dates: stonk.revenue.historyDates || [],
    amm: stonk.revenue.historyAmm || [],
    box: stonk.revenue.historyBox || [],
    tax: stonk.revenue.historyTax || [],
    booster: stonk.revenue.historyBooster || [],
    smartLp: stonk.revenue.historySmartLp || [],
    volume: stonk.revenue.historyVolume || [],
    dex: stonk.revenue.historyDex || [],
  };
  const byIso = new Map();
  hist.dates.forEach((d, i) => {
    const iso = dates.dateKey(d);
    if (!iso) return;
    byIso.set(iso, {
      amm: Number(hist.amm[i]) || 0,
      box: Number(hist.box[i]) || 0,
      tax: Number(hist.tax[i]) || 0,
      booster: Number(hist.booster[i]) || 0,
      smartLp: Number(hist.smartLp[i]) || 0,
      volume: Number(hist.volume[i]) || 0,
      dex: Number(hist.dex[i]) || 0,
    });
  });
  for (const d of filled) {
    const row = byDay.get(d);
    byIso.set(d, {
      amm: +row.amm.toFixed(2),
      box: +row.box.toFixed(2),
      tax: +row.tax.toFixed(2),
      booster: +row.booster.toFixed(2),
      smartLp: +row.smartLp.toFixed(2),
      volume: +row.volume.toFixed(2),
      dex: 0,
    });
  }
  const all = [...byIso.keys()].sort();
  const col = (k) => all.map((d) => Number(byIso.get(d)[k]) || 0);
  stonk.revenue.historyDates = all;
  stonk.revenue.historyAmm = col("amm");
  stonk.revenue.historyBox = col("box");
  stonk.revenue.historyTax = col("tax");
  stonk.revenue.historyBooster = col("booster");
  stonk.revenue.historySmartLp = col("smartLp");
  stonk.revenue.historyVolume = col("volume");
  stonk.revenue.historyDex = col("dex");
  stonk.revenue.historyTotalUsd = stonk.revenue.historyAmm;

  const holderStats = fillHolderAndRoi(stonk);
  writeData(prev);

  const shown = all.reduce((s, d) => {
    const r = byIso.get(d);
    return s + r.amm + r.box + r.tax + r.booster + r.smartLp;
  }, 0);
  console.log("\nDashboard history now", all[0], "→", all[all.length - 1], all.length, "days");
  console.log("StonkBooster history total $", shown.toFixed(0));
  console.log("Holder / ROI backfill", holderStats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
