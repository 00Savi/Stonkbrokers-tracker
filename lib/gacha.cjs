// Card Wall gacha pull revenue: The Alley and The Claw (the crane).
//
// A pull pays ETH, WETH, USDG, or $WALL and takes a slab. Both machines emit
// PullRequested. The USD booked here is the price the machine charged:
//
//   Alley  referenceValueCents on the event (the signed quote).
//   Claw   USDG `cashPaid`, plus $WALL and WETH priced at that day's close.
//          A wall or WETH pull with no price falls back to the claw's
//          pullPrice(), which is what lifetimeGross() accrues per pull.
//          Buyback credit is a recycled payout and is not counted again.
//
// PullRescued drops a claw pull that was refunded.

const fs = require("fs");
const path = require("path");
const { id, keccak256, toUtf8Bytes } = require("ethers");
const dates = require("./dates.cjs");

const SITE = "https://thecardwall.com";
const DROP_CACHE = "cache/gacha-drops.json";
// CloudFront serves the slab photos with no CORS header, so a clipboard
// snapshot cannot read those pixels and the frames copy empty. Mirror the
// newest drops onto our own origin and point the cards at that copy.
const DROP_ART_DIR = path.join(__dirname, "..", "public", "gacha-drops");
// Every awarded Alley slab, so the machines table can open a machine and sort
// its pulls. Kept out of data.json: that file loads on every page.
const PULL_INDEX = path.join(__dirname, "..", "public", "gacha-pulls.json");

const ALLEY = "0x668676e967e9c3820ee36ef9aadc115165ea5676";
const CLAW = "0xc004e705ac4dd59c7f43f13934032105e4876b33";

// PullRequested(uint256 indexed pullId, address indexed player, bytes32 indexed machine,
//   uint8 asset, uint256 amountPaid, uint256 referenceValueCents, bytes32 userSeed)
const ALLEY_PULL = id("PullRequested(uint256,address,bytes32,uint8,uint256,uint256,bytes32)");
// PullRequested(uint256 indexed requestId, address indexed buyer, uint256 indexed batchId,
//   bytes32 userSeed, uint128 cashPaid, uint128 wallPaid, uint128 wethPaid, uint128 creditUsed)
const CLAW_PULL = id("PullRequested(uint256,address,uint256,bytes32,uint128,uint128,uint128,uint128)");
const CLAW_RESCUE = id("PullRescued(uint256,address,uint128,uint128,uint128,uint128)");

// First observed pull. Earlier blocks have no events; scanning them only burns RPC.
const ALLEY_FROM = 71_900_000;
const CLAW_FROM = 65_600_000;

const ALLEY_RAILS = ["wall", "usdg", "eth", "weth"];
const WEI = 10n ** 18n;

const MACHINES_URL = "https://thecardwall.com/api/alley/machines";
const MACHINE_CATALOG = path.join(__dirname, "..", "public", "alley-machines.json");

function word(data, i) {
  const hex = data.slice(2 + i * 64, 2 + (i + 1) * 64);
  if (hex.length !== 64) return 0n;
  return BigInt("0x" + hex);
}

function usd(n) {
  return Math.round(n * 100) / 100;
}

function emptyRails() {
  return { wall: 0, usdg: 0, eth: 0, weth: 0, credit: 0 };
}

function addRail(rails, rail, amount) {
  if (!rails[rail]) rails[rail] = 0;
  rails[rail] = usd(rails[rail] + amount);
}

async function machineLabels() {
  const byHash = new Map();
  const byId = new Map();
  const catalog = [];
  try {
    const res = await fetch(MACHINES_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { byHash, byId, catalog };
    const body = await res.json();
    for (const m of body.machines || []) {
      if (!m?.id) continue;
      const label = m.label || m.id;
      const hash = keccak256(toUtf8Bytes(m.id)).toLowerCase();
      byId.set(m.id, label);
      byHash.set(hash, label);
      // The till takes this hash as the machine id. A machine can be live
      // on the till before anyone has pulled it, so the catalog is what
      // puts a zero row on the table.
      catalog.push({
        hash,
        label,
        priceCents: Number(m.priceCents) || 0,
        available: m.available !== false,
      });
    }
    if (catalog.length) writeMachineCatalog(catalog);
  } catch {
    // Labels are cosmetic. The pull totals do not depend on the site.
  }
  return { byHash, byId, catalog };
}

/** Same-origin till list. The page merges this onto the hourly snapshot so a
 *  machine that just opened is on the table before the next data.json write.
 *  thecardwall.com does not send CORS headers, so the browser cannot ask it. */
function writeMachineCatalog(catalog) {
  const machines = catalog.map((m) => ({
    id: m.hash,
    label: m.label,
    priceCents: m.priceCents || 0,
    available: m.available !== false,
  }));
  fs.mkdirSync(path.dirname(MACHINE_CATALOG), { recursive: true });
  const tmp = `${MACHINE_CATALOG}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ machines }));
  fs.renameSync(tmp, MACHINE_CATALOG);
}

async function clawPullPriceUsd(rpc) {
  const data = id("pullPrice()").slice(0, 10);
  const raw = await rpc.trySend("eth_call", [{ to: CLAW, data }, "latest"]);
  if (!raw || raw === "0x") return 0;
  return Number(BigInt(raw)) / 1e6;
}

function priceFor(byDay, spot, day) {
  const hist = Number(byDay?.[day]);
  if (hist > 0) return hist;
  return Number(spot) > 0 ? Number(spot) : 0;
}

function bump(map, day, key, amount) {
  if (!map.has(day)) map.set(day, { alley: 0, claw: 0, value: 0 });
  const row = map.get(day);
  row[key] += amount;
}

function absImage(src) {
  if (!src || typeof src !== "string") return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/")) return SITE + src;
  return null;
}

function imageExt(contentType, buf) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  return "img";
}

function artFileName(id, ext) {
  const slug = String(id || "drop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "drop"}.${ext}`;
}

async function mirrorDropImages(drops) {
  fs.mkdirSync(DROP_ART_DIR, { recursive: true });
  const keep = new Set();
  let mirrored = 0;
  await mapPool(drops, 4, async (drop) => {
    const remote = drop.image;
    const localName = typeof remote === "string" && remote.startsWith("/gacha-drops/")
      ? path.basename(remote)
      : null;
    if (localName && fs.existsSync(path.join(DROP_ART_DIR, localName))) keep.add(localName);
    if (!remote || !/^https?:/i.test(remote)) return;
    try {
      const res = await fetch(remote, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("empty");
      const name = artFileName(drop.id, imageExt(res.headers.get("content-type"), buf));
      fs.writeFileSync(path.join(DROP_ART_DIR, name), buf);
      drop.image = `/gacha-drops/${name}`;
      keep.add(name);
      mirrored += 1;
    } catch (e) {
      console.warn(`[warn] gacha image ${drop.id}: ${e.message}`);
    }
  });
  if (keep.size) {
    for (const file of fs.readdirSync(DROP_ART_DIR)) {
      if (!keep.has(file)) fs.unlinkSync(path.join(DROP_ART_DIR, file));
    }
  }
  console.log(`gacha drop art: ${mirrored}/${drops.length} mirrored`);
}

function loadDropCache() {
  try {
    const c = JSON.parse(fs.readFileSync(DROP_CACHE, "utf8"));
    return { alley: c.alley || {}, claw: c.claw || {} };
  } catch {
    return { alley: {}, claw: {} };
  }
}

function saveDropCache(cache) {
  try {
    fs.mkdirSync("cache", { recursive: true });
    fs.writeFileSync(DROP_CACHE, JSON.stringify(cache));
  } catch (e) {
    console.warn(`[warn] gacha drop cache: ${e.message}`);
  }
}

function outcomeFrozen(game, row) {
  if (!row || row.error) return false;
  if (game === "alley") {
    if (row.state === "refunded") return true;
    return !!(row.prizeName && (row.payoutTx || row.deliverTx));
  }
  return Number(row.slab?.fmvUsd) > 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOutcome(pull) {
  const url = pull.game === "alley"
    ? `${SITE}/api/alley/pull-result?id=${encodeURIComponent(pull.id)}`
    : `${SITE}/api/gacha/pull-result?requestId=${encodeURIComponent(pull.id)}`;
  const headers = pull.game === "claw" ? { "x-tcw-attest": "1" } : {};
  let last = "failed";
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await sleep(500 * attempt * attempt);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    if (res.status === 429 || res.status === 503) {
      last = String(res.status);
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${pull.game} ${pull.id} ${res.status}`);
    return res.json();
  }
  throw new Error(`${pull.game} ${pull.id} ${last}`);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length);
  if (n > 0) await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function readCard(game, row) {
  if (!row || row.error) return null;
  if (game === "alley") {
    if (row.state === "refunded") return { refunded: true };
    const value = Number(row.insured);
    if (!row.prizeName || !(value > 0)) return null;
    return {
      name: row.prizeName,
      grade: row.grade || null,
      image: absImage(row.image),
      value,
      machineId: row.machineId || null,
      buybackUsd: Number(row.payoutUsd) > 0 ? Number(row.payoutUsd) : 0,
      delivered: !!row.deliverTx,
      cert: row.cert || null,
      rarity: row.rarity || null,
      set: row.set || null,
      year: row.year || null,
      number: row.cardNumber || null,
      parallel: row.parallel || null,
      language: row.language || null,
      edition: row.edition || null,
      title: row.game || null,
      payoutTx: row.payoutTx || null,
      payoutWall: Number(row.payoutWall) > 0 ? Number(row.payoutWall) : null,
      deliverTx: row.deliverTx || null,
    };
  }
  const slab = row.slab || {};
  const value = Number(slab.fmvUsd);
  if (!(value > 0)) return null;
  return {
    name: slab.name || "Slab",
    grade: slab.grade || null,
    image: absImage(slab.image),
    value,
    machineId: null,
    buybackUsd: 0,
    delivered: false,
    cert: slab.psaCert || null,
    rarity: row.tier || null,
    set: null,
    year: null,
    number: null,
    parallel: null,
    language: null,
    edition: null,
    title: null,
    payoutTx: null,
    payoutWall: null,
    deliverTx: null,
  };
}

async function attachOutcomes(pulls, byId) {
  const cache = loadDropCache();
  const pending = pulls.filter((p) => !outcomeFrozen(p.game, cache[p.game][p.id]));
  let done = 0;
  await mapPool(pending, 3, async (pull) => {
    try {
      cache[pull.game][pull.id] = await fetchOutcome(pull);
    } catch (e) {
      if (!cache[pull.game][pull.id] || cache[pull.game][pull.id].error) {
        cache[pull.game][pull.id] = { error: e.message };
      }
    }
    done += 1;
    if (done % 100 === 0 || done === pending.length) {
      process.stdout.write(`\r    pull cards: ${done}/${pending.length}   `);
    }
  });
  if (pending.length) process.stdout.write("\r" + " ".repeat(48) + "\r");
  saveDropCache(cache);

  const edge = {
    moneyIn: 0,
    valueOut: 0,
    spread: 0,
    awarded: 0,
    refunded: 0,
    refundedUsd: 0,
    missing: 0,
    creditAwarded: 0,
    creditValue: 0,
    buybackPulls: 0,
    buybackUsd: 0,
    deliveredPulls: 0,
    deliveredValue: 0,
    alley: { moneyIn: 0, valueOut: 0, awarded: 0 },
    claw: { moneyIn: 0, valueOut: 0, awarded: 0 },
  };
  const drops = [];
  const valueByDay = new Map();
  const valueByMachine = new Map();
  const paidByMachine = new Map();

  for (const pull of pulls) {
    const card = readCard(pull.game, cache[pull.game][pull.id]);
    if (!card) {
      edge.missing += 1;
      // The machines table counts every paid pull. Keep the row when the
      // card API has not answered, so a machine still opens to its full list.
      if (pull.game === "alley" && pull.machineHash) {
        drops.push({
          id: `${pull.game}:${pull.id}`,
          game: pull.game,
          machineHash: pull.machineHash,
          machine: pull.label || "Alley machine",
          name: "Card not posted yet",
          grade: null,
          image: null,
          value: 0,
          paid: usd(pull.paid),
          at: pull.at,
          pending: true,
          buyback: 0,
          cert: null,
          rarity: null,
          set: null,
          year: null,
          number: null,
          parallel: null,
          language: null,
          edition: null,
          title: null,
          delivered: false,
          tx: pull.tx || null,
          payoutTx: null,
          payoutWall: null,
          deliverTx: null,
        });
      }
      continue;
    }
    if (card.refunded) {
      edge.refunded += 1;
      edge.refundedUsd += pull.paid;
      continue;
    }
    edge.awarded += 1;
    edge.valueOut += card.value;
    const side = edge[pull.game];
    side.awarded += 1;
    side.valueOut += card.value;
    if (pull.credit) {
      edge.creditAwarded += 1;
      edge.creditValue += card.value;
    } else {
      edge.moneyIn += pull.paid;
      side.moneyIn += pull.paid;
    }
    if (card.buybackUsd > 0) {
      edge.buybackPulls += 1;
      edge.buybackUsd += card.buybackUsd;
    }
    if (card.delivered) {
      edge.deliveredPulls += 1;
      edge.deliveredValue += card.value;
    }
    valueByDay.set(pull.day, (valueByDay.get(pull.day) || 0) + card.value);
    if (pull.machineHash) {
      valueByMachine.set(pull.machineHash, (valueByMachine.get(pull.machineHash) || 0) + card.value);
      if (!pull.credit) paidByMachine.set(pull.machineHash, (paidByMachine.get(pull.machineHash) || 0) + pull.paid);
    }
    const label = (card.machineId && byId.get(card.machineId)) || pull.label || (pull.game === "claw" ? "The Claw" : "Alley machine");
    drops.push({
      id: `${pull.game}:${pull.id}`,
      game: pull.game,
      machineHash: pull.machineHash || null,
      machine: label,
      name: card.name,
      grade: card.grade,
      image: card.image,
      value: usd(card.value),
      paid: usd(pull.paid),
      at: pull.at,
      buyback: card.buybackUsd > 0 ? usd(card.buybackUsd) : 0,
      cert: card.cert,
      rarity: card.rarity,
      set: card.set,
      year: card.year,
      number: card.number,
      parallel: card.parallel,
      language: card.language,
      edition: card.edition,
      title: card.title,
      delivered: card.delivered,
      tx: pull.tx || null,
      payoutTx: card.payoutTx,
      payoutWall: card.payoutWall,
      deliverTx: card.deliverTx,
    });
  }

  edge.moneyIn = usd(edge.moneyIn);
  edge.valueOut = usd(edge.valueOut);
  edge.spread = usd(edge.moneyIn - edge.valueOut);
  edge.refundedUsd = usd(edge.refundedUsd);
  edge.creditValue = usd(edge.creditValue);
  edge.buybackUsd = usd(edge.buybackUsd);
  edge.deliveredValue = usd(edge.deliveredValue);
  edge.alley.moneyIn = usd(edge.alley.moneyIn);
  edge.alley.valueOut = usd(edge.alley.valueOut);
  edge.alley.spread = usd(edge.alley.moneyIn - edge.alley.valueOut);
  edge.claw.moneyIn = usd(edge.claw.moneyIn);
  edge.claw.valueOut = usd(edge.claw.valueOut);
  edge.claw.spread = usd(edge.claw.moneyIn - edge.claw.valueOut);

  drops.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  return {
    edge,
    drops: drops.slice(0, 36),
    pulls: drops.filter((d) => d.game === "alley"),
    valueByDay,
    valueByMachine,
    paidByMachine,
  };
}

function writePullIndex(pulls) {
  const slim = pulls.map((pull) => {
    const out = {};
    for (const [key, value] of Object.entries(pull)) {
      if (value === null || value === undefined || value === "" || value === false) continue;
      if (key === "buyback" && !value) continue;
      out[key] = value;
    }
    return out;
  });
  fs.mkdirSync(path.dirname(PULL_INDEX), { recursive: true });
  fs.writeFileSync(PULL_INDEX, JSON.stringify({ pulls: slim }));
  console.log(`gacha pull index: ${slim.length} alley pulls`);
}

/**
 * @param {object} opts
 * @param {import("./rpc.cjs").Rpc} opts.rpc
 * @param {import("./blocktime.cjs").BlockTime} opts.blockTime
 * @param {Record<string, number>} [opts.wallByDay] UTC day -> $WALL close
 * @param {number} [opts.wallSpot]
 * @param {number} [opts.ethSpot]
 */
async function fetchGachaRevenue({ rpc, blockTime, wallByDay = {}, wallSpot = 0, ethSpot = 0 }) {
  const head = await rpc.blockNumber();
  const from = CLAW_FROM;
  await blockTime.ensureRange(rpc, from, head);

  const [alleyLogs, clawLogs, rescueLogs, labelMaps, sticker] = await Promise.all([
    rpc.getLogs({ address: ALLEY, fromBlock: ALLEY_FROM, toBlock: head, topics: [ALLEY_PULL] }, (to, end, n) => {
      process.stdout.write(`\r    alley pulls: block ${to}/${end}, ${n}   `);
    }),
    rpc.getLogs({ address: CLAW, fromBlock: CLAW_FROM, toBlock: head, topics: [CLAW_PULL] }, (to, end, n) => {
      process.stdout.write(`\r    claw pulls: block ${to}/${end}, ${n}   `);
    }),
    rpc.getLogs({ address: CLAW, fromBlock: CLAW_FROM, toBlock: head, topics: [CLAW_RESCUE] }),
    machineLabels(),
    clawPullPriceUsd(rpc),
  ]);
  process.stdout.write("\r" + " ".repeat(72) + "\r");

  const labels = labelMaps.byHash;
  const labelsById = labelMaps.byId;
  const catalog = labelMaps.catalog || [];
  const rescued = new Set(rescueLogs.map((l) => l.topics[1]));
  const days = new Map();
  const pullRows = [];
  const machines = new Map();
  const alley = { address: ALLEY, pulls: 0, usd: 0, rails: emptyRails() };
  const claw = { address: CLAW, pulls: 0, usd: 0, creditPulls: 0, emptyPulls: 0, rails: emptyRails() };
  let unpriced = 0;

  for (const log of alleyLogs) {
    const machine = (log.topics[3] || "").toLowerCase();
    const railIdx = Number(word(log.data, 0));
    const cents = Number(word(log.data, 2));
    const paid = cents / 100;
    const ts = blockTime.at(parseInt(log.blockNumber, 16));
    const day = dates.utcIsoFromTs(ts);
    if (!day || !(paid > 0)) continue;
    const rail = ALLEY_RAILS[railIdx] || "other";
    pullRows.push({
      game: "alley",
      id: BigInt(log.topics[1]).toString(),
      paid,
      credit: false,
      day,
      at: ts ? new Date(ts * 1000).toISOString() : null,
      tx: log.transactionHash || null,
      machineHash: machine,
      label: labels.get(machine) || "Alley machine",
    });
    alley.pulls += 1;
    alley.usd += paid;
    addRail(alley.rails, rail, paid);
    bump(days, day, "alley", paid);
    if (!machines.has(machine)) {
      machines.set(machine, {
        id: machine,
        label: labels.get(machine) || "Alley machine",
        game: "alley",
        pulls: 0,
        usd: 0,
      });
    }
    const row = machines.get(machine);
    row.pulls += 1;
    row.usd += paid;
  }

  // Till catalog, including machines nobody has spun yet. Pulls above win
  // on the same hash, so a live machine is not double-counted.
  for (const entry of catalog) {
    const key = entry.hash;
    if (!machines.has(key)) {
      machines.set(key, {
        id: key,
        label: entry.label,
        game: "alley",
        pulls: 0,
        usd: 0,
        priceCents: entry.priceCents,
      });
      continue;
    }
    const row = machines.get(key);
    if (!row.label || row.label === "Alley machine") row.label = entry.label;
    row.priceCents = entry.priceCents;
  }

  for (const log of clawLogs) {
    if (rescued.has(log.topics[1])) continue;
    const cash = word(log.data, 1);
    const wall = word(log.data, 2);
    const weth = word(log.data, 3);
    const credit = word(log.data, 4);
    const ts = blockTime.at(parseInt(log.blockNumber, 16));
    const day = dates.utcIsoFromTs(ts);
    if (!day) continue;
    const pullId = BigInt(log.topics[1]).toString();
    const at = ts ? new Date(ts * 1000).toISOString() : null;

    let paid = 0;
    if (cash > 0n) {
      const n = Number(cash) / 1e6;
      paid += n;
      addRail(claw.rails, "usdg", n);
    }
    if (wall > 0n) {
      const px = priceFor(wallByDay, wallSpot, day);
      const tokens = Number(wall) / Number(WEI);
      if (px > 0) {
        const n = tokens * px;
        paid += n;
        addRail(claw.rails, "wall", n);
      } else if (sticker > 0 && cash === 0n && weth === 0n) {
        paid += sticker;
        addRail(claw.rails, "wall", sticker);
      } else {
        unpriced += 1;
      }
    }
    if (weth > 0n) {
      const px = Number(ethSpot) > 0 ? Number(ethSpot) : 0;
      const tokens = Number(weth) / Number(WEI);
      if (px > 0) {
        const n = tokens * px;
        paid += n;
        addRail(claw.rails, "weth", n);
      } else if (sticker > 0 && cash === 0n && wall === 0n) {
        paid += sticker;
        addRail(claw.rails, "weth", sticker);
      } else {
        unpriced += 1;
      }
    }
    if (paid === 0 && credit > 0n && cash === 0n && wall === 0n && weth === 0n) {
      claw.creditPulls += 1;
      pullRows.push({
        game: "claw",
        id: pullId,
        paid: 0,
        credit: true,
        day,
        at,
        tx: log.transactionHash || null,
        machineHash: null,
        label: "The Claw",
      });
      continue;
    }
    if (!(paid > 0)) {
      claw.emptyPulls += 1;
      continue;
    }
    pullRows.push({
      game: "claw",
      id: pullId,
      paid,
      credit: false,
      day,
      at,
      tx: log.transactionHash || null,
      machineHash: null,
      label: "The Claw",
    });
    claw.pulls += 1;
    claw.usd += paid;
    bump(days, day, "claw", paid);
  }

  let outcomes = null;
  try {
    outcomes = await attachOutcomes(pullRows, labelsById);
  } catch (e) {
    console.warn(`[warn] gacha card values: ${e.message}`);
  }
  if (outcomes) {
    for (const [day, amount] of outcomes.valueByDay) {
      if (!days.has(day)) days.set(day, { alley: 0, claw: 0, value: 0 });
      days.get(day).value += amount;
    }
  }

  const today = dates.utcIso();
  const keys = [...days.keys()].sort();
  if (keys.length && today && keys[keys.length - 1] < today) keys.push(today);
  const filled = [];
  if (keys.length) {
    const start = Date.parse(`${keys[0]}T00:00:00Z`);
    const end = Date.parse(`${(today && today > keys[keys.length - 1] ? today : keys[keys.length - 1])}T00:00:00Z`);
    for (let t = start; t <= end; t += 86400000) {
      const key = new Date(t).toISOString().slice(0, 10);
      filled.push(key);
      if (!days.has(key)) days.set(key, { alley: 0, claw: 0, value: 0 });
    }
  }

  const historyDates = filled;
  const historyAlley = historyDates.map((d) => usd(days.get(d).alley));
  const historyClaw = historyDates.map((d) => usd(days.get(d).claw));
  const historyUsd = historyDates.map((_, i) => usd(historyAlley[i] + historyClaw[i]));
  const historyValue = historyDates.map((d) => usd(days.get(d).value || 0));

  const drops = outcomes?.drops || [];
  if (outcomes?.pulls) {
    try {
      // Write before the image mirror. The mirror rewrites the newest strip
      // onto /gacha-drops/ and would point this index at files it then deletes.
      writePullIndex(outcomes.pulls);
    } catch (e) {
      console.warn(`[warn] gacha pull index: ${e.message}`);
    }
  }
  if (drops.length) {
    try {
      await mirrorDropImages(drops);
    } catch (e) {
      console.warn(`[warn] gacha drop images: ${e.message}`);
    }
  }

  alley.usd = usd(alley.usd);
  claw.usd = usd(claw.usd);
  const valueByMachine = outcomes?.valueByMachine || new Map();
  const paidByMachine = outcomes?.paidByMachine || new Map();
  const machineRows = [...machines.values()]
    .map((m) => {
      const valueOut = usd(valueByMachine.get(m.id) || 0);
      const paidIn = outcomes ? usd(paidByMachine.get(m.id) || 0) : usd(m.usd);
      return {
        id: m.id,
        label: m.label,
        game: m.game,
        pulls: m.pulls,
        usd: usd(m.usd),
        paidIn,
        valueOut,
        spread: usd(paidIn - valueOut),
        priceCents: m.priceCents || 0,
      };
    })
    .sort((a, b) => (b.usd - a.usd) || (b.pulls - a.pulls) || ((b.priceCents || 0) - (a.priceCents || 0)))
    .map(({ priceCents, ...row }) => row);

  return {
    usd: usd(alley.usd + claw.usd),
    pulls: alley.pulls + claw.pulls,
    unpriced,
    stickerUsd: sticker,
    alley,
    claw,
    machines: machineRows,
    historyDates,
    historyUsd,
    historyAlley,
    historyClaw,
    historyValue,
    edge: outcomes?.edge || null,
    drops,
  };
}

module.exports = {
  ALLEY,
  CLAW,
  ALLEY_PULL,
  CLAW_PULL,
  fetchGachaRevenue,
  mirrorDropImages,
};
