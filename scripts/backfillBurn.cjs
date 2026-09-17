/**
 * Reconstruct daily cumulative token burn from Transfer events.
 *
 * The hourly job only started recording totalBurn in mid-August. The Stonk
 * ROI backfill then copied that first live read onto every earlier clock_in
 * snapshot, which is why the burn chart is a flat line until ~8/20.
 *
 * Live dual-burn is cap − totalSupply + dead + zero, and for STONK also the
 * activation-contract lock. This walk folds the same addresses from genesis.
 * Days the dashboard already measured are left alone. Revenue / tax / TVL
 * history is not touched.
 *
 * Usage: node scripts/backfillBurn.cjs [stonk tickeryard …]
 */
const fs = require("fs");
const path = require("path");
const { Rpc, TOPIC, addrTopic, decodeUint, topicAddr } = require("../lib/rpc.cjs");
const { BlockTime } = require("../lib/blocktime.cjs");
const dates = require("../lib/dates.cjs");
const { GgIndex } = require("../lib/ggindex.cjs");

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const SCALE = 10 ** 18;
const DATA = path.join(__dirname, "..", "public", "data.json");
const DOCS = path.join(__dirname, "..", "docs", "data.json");
const CACHE = path.join(__dirname, "..", "cache", "burn_days.json");

const PROJECTS = {
  stonk: {
    genesisBlock: 12_600_000,
    tokenCa: "0xe934e36a439c94017b64a3fece66af12099abf50",
    activationCa: "0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664",
    maxSupply: 4444,
    unitValue: 666666,
    ticker: "STONK",
    includeLocked: true,
  },
  mancer: {
    genesisBlock: 29_000_000,
    tokenCa: "0xc72f232a6869e6cf34dc06129affd07f8a2a246a",
    activationCa: "0x47c2194caacfc778c0baa41e10008bb7d720cd59",
    maxSupply: 5000,
    unitValue: 500000,
    ticker: "MANCER",
    includeLocked: false,
  },
  tickeryard: {
    genesisBlock: 33_500_000,
    tokenCa: "0xe3fa12da7fa026b21817f16622e8ae48fa785166",
    activationCa: "0xef5f726990442bc3207d72d1f9dcf8677cf02358",
    maxSupply: 3333,
    unitValue: 300030,
    ticker: "YARD",
    includeLocked: false,
  },
  cardwall: {
    genesisBlock: 38_000_000,
    tokenCa: "0xb03058b8a39f3967df08d833682c1c99b29821b1",
    activationCa: "0xb3f6f0fad13b0b60873ac2a90281ebe431fdb6ed",
    maxSupply: 4444,
    unitValue: 500000,
    ticker: "WALL",
    includeLocked: false,
  },
  ghosts: {
    genesisBlock: 62_890_000,
    tokenCa: "0xd6b619a75667cfcc827a3b9b75d807d98b5456d2",
    activationCa: "0xf8de142e9f6c4b5f276416b4bcad01758acdcace",
    maxSupply: 3000,
    unitValue: 1_000_000,
    ticker: "GHOSTS",
    includeLocked: false,
    nested: ["nightshades", "factions", "ghosts"],
  },
  zombies: {
    genesisBlock: 62_890_000,
    tokenCa: "0xe4bef9d0845a13bd39c57c7ee4463ff5d0cc20b6",
    activationCa: "0x8fef7779c917ca4db5bd4b2691aaab4122531361",
    maxSupply: 3000,
    unitValue: 1_000_000,
    ticker: "ZOMBIES",
    includeLocked: false,
    nested: ["nightshades", "factions", "zombies"],
  },
  knights: {
    genesisBlock: 62_890_000,
    tokenCa: "0xb6062468073a43c79cd7fd07fbe496da9ef544c3",
    activationCa: "0xe6253d5548844b943ad4ff99680d429fd73d600c",
    maxSupply: 3000,
    unitValue: 1_000_000,
    ticker: "KNIGHTS",
    includeLocked: false,
    nested: ["nightshades", "factions", "knights"],
  },
  watchers: {
    genesisBlock: 62_890_000,
    tokenCa: "0x4ffefdfefc16daac253140125f50d8be9baffa52",
    activationCa: "0x9507068897b4f60adb12ca9032e0cf03dfac13d4",
    maxSupply: 3000,
    unitValue: 1_000_000,
    ticker: "WATCHERS",
    includeLocked: false,
    nested: ["nightshades", "factions", "watchers"],
  },
};

function emptyState() {
  return { supply: 0n, dead: 0n, zero: 0n, locked: 0n };
}

function seedState(conf, mintCount) {
  const state = emptyState();
  // Many Anvil tokens mint the cap in the constructor (no Transfer from 0x0).
  if (mintCount === 0) {
    state.supply = BigInt(conf.maxSupply) * BigInt(Math.round(conf.unitValue)) * 10n ** 18n;
  }
  return state;
}

function tokens(wei) {
  return Number(wei) / SCALE;
}

function burnedOf(state, conf) {
  // Match getTrueDeflationStats: cap − totalSupply + dead + (STONK) lock.
  // OpenZeppelin _burn emits Transfer(from, 0x0) and lowers totalSupply
  // without crediting balanceOf(0x0), so the zero accumulator is not added
  // here — native already has those tokens.
  const cap = conf.maxSupply * conf.unitValue;
  const supply = tokens(state.supply);
  const native = Math.max(0, cap - supply);
  const dead = tokens(state.dead);
  const locked = conf.includeLocked ? tokens(state.locked) : 0;
  return native + dead + locked;
}

function applyTransfer(state, from, to, value, lockedAddr) {
  const v = value == null ? 0n : BigInt(value);
  if (v <= 0n) return state;
  from = (from || ZERO).toLowerCase();
  to = (to || ZERO).toLowerCase();
  lockedAddr = lockedAddr && lockedAddr.toLowerCase();

  if (from === ZERO && to !== ZERO) state.supply += v;
  if (to === ZERO && from !== ZERO) {
    state.supply = state.supply > v ? state.supply - v : 0n;
    state.zero += v;
  }
  if (to === DEAD && from !== DEAD) state.dead += v;
  if (from === DEAD && to !== DEAD) state.dead = state.dead > v ? state.dead - v : 0n;
  if (lockedAddr) {
    if (to === lockedAddr && from !== lockedAddr) state.locked += v;
    if (from === lockedAddr && to !== lockedAddr) {
      state.locked = state.locked > v ? state.locked - v : 0n;
    }
  }
  return state;
}

function logKey(log) {
  return `${parseInt(log.blockNumber, 16)}:${parseInt(log.logIndex, 16)}`;
}

async function collectSinkLogs(rpc, conf, fromBlock, toBlock) {
  const token = conf.tokenCa;
  const locked = conf.includeLocked ? conf.activationCa : null;
  const filters = [
    { label: "mint", topics: [TOPIC.transfer, addrTopic(ZERO)] },
    { label: "to-zero", topics: [TOPIC.transfer, null, addrTopic(ZERO)] },
    { label: "to-dead", topics: [TOPIC.transfer, null, addrTopic(DEAD)] },
    { label: "from-dead", topics: [TOPIC.transfer, addrTopic(DEAD)] },
  ];
  if (locked) {
    filters.push(
      { label: "to-lock", topics: [TOPIC.transfer, null, addrTopic(locked)] },
      { label: "from-lock", topics: [TOPIC.transfer, addrTopic(locked)] },
    );
  }

  const seen = new Set();
  const logs = [];
  for (const f of filters) {
    process.stdout.write(`  ${conf.ticker} ${f.label}…`);
    const part = await rpc.getLogs(
      { address: token, fromBlock, toBlock, topics: f.topics },
      (to, end, n) => {
        process.stdout.write(
          `\r  ${conf.ticker} ${f.label}: block ${to}/${end}  ${n} logs   `,
        );
      },
    );
    let added = 0;
    for (const log of part) {
      const k = logKey(log);
      if (seen.has(k)) continue;
      seen.add(k);
      logs.push(log);
      added++;
    }
    console.log(`\r  ${conf.ticker} ${f.label}: ${part.length} logs (${added} new)`.padEnd(70));
  }

  logs.sort((a, b) => {
    const ba = parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16);
    if (ba) return ba;
    return parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16);
  });
  return logs;
}

function foldDays(logs, conf, blockTime, throughIso, mintCount) {
  const state = seedState(conf, mintCount);
  const byDay = new Map();
  let currentDay = null;

  const flushTo = (until) => {
    if (!currentDay || !until || until < currentDay) return;
    const start = Date.parse(`${currentDay}T00:00:00Z`);
    const end = Date.parse(`${until}T00:00:00Z`);
    const snap = { ...state };
    for (let t = start; t <= end; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      byDay.set(d, burnedOf(snap, conf));
    }
  };

  for (const log of logs) {
    const bn = parseInt(log.blockNumber, 16);
    const day = dates.utcIsoFromTs(blockTime.at(bn));
    if (!day) continue;
    if (currentDay && day > currentDay) flushTo(dayOfPrev(day));
    applyTransfer(
      state,
      topicAddr(log.topics[1]),
      topicAddr(log.topics[2]),
      decodeUint(log.data, 0),
      conf.includeLocked ? conf.activationCa : null,
    );
    if (!currentDay || day > currentDay) currentDay = day;
  }
  flushTo(throughIso);
  return { byDay, state };
}

function dayOfPrev(iso) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

function burnedFromIndexRow(row, conf) {
  const cap = conf.maxSupply * conf.unitValue;
  const supply = Number(row.supply) / SCALE;
  const dead = Number(row.dead) / SCALE;
  const locked = conf.includeLocked ? Number(row.locked) / SCALE : 0;
  const native = Math.max(0, cap - supply);
  return native + dead + locked;
}

async function fromGgIndex(gg, key, conf) {
  try {
    const hist = await gg.projectSupplyDaily(key, { days: 365 });
    const rows = hist?.daily || [];
    if (!rows.length) return null;
    const byDay = new Map();
    for (const row of rows) {
      const d = String(row.date || "").slice(0, 10);
      const n = burnedFromIndexRow(row, conf);
      if (d && Number.isFinite(n) && n > 0) byDay.set(d, n);
    }
    return byDay.size ? byDay : null;
  } catch (e) {
    console.warn(`  ${conf.ticker} gg-index supply daily: ${e.message}`);
    return null;
  }
}

function projectBlob(data, conf, key) {
  if (conf.nested) {
    let cur = data.projects;
    for (const part of conf.nested) cur = cur?.[part];
    return cur || null;
  }
  return data.projects?.[key] || null;
}

function firstLiveSnapDate(project) {
  const rows = (project?.dailySnapshots || [])
    .filter((s) => s?.yieldSource !== "clock_in")
    .map((s) => dates.dateKey(s.date))
    .filter(Boolean)
    .sort();
  return rows[0] || null;
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

function writeData(data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(DATA, json);
  fs.writeFileSync(DOCS, json);
}

function wantedKeys() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!args.length) return ["stonk", "tickeryard", "zombies", "watchers"];
  return args;
}

async function main() {
  const keys = wantedKeys();
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const rpc = new Rpc();
  const gg = new GgIndex();
  const blockTime = new BlockTime().load();
  const cache = loadCache();
  const head = await rpc.blockNumber();
  const today = dates.utcIso();

  const earliest = Math.min(...keys.map((k) => PROJECTS[k]?.genesisBlock).filter(Boolean));
  await blockTime.ensureRange(rpc, earliest, head, (done, total) => {
    process.stdout.write(`\r  block-time anchors: ${done}/${total}   `);
  });
  console.log(`\r  block-time anchors: ${blockTime.anchors.length} covering to ${head}`.padEnd(70));

  for (const key of keys) {
    const conf = PROJECTS[key];
    if (!conf) {
      console.warn(`unknown project ${key}`);
      continue;
    }
    const project = projectBlob(data, conf, key);
    if (!project) {
      console.warn(`no ${key} in data.json`);
      continue;
    }

    console.log(`\n--- ${conf.ticker} ---`);
    let source = "gg-index";
    let byDay = await fromGgIndex(gg, key, conf);
    if (byDay) {
      console.log(`  gg-index: ${[...byDay.keys()].sort()[0]} → ${[...byDay.keys()].sort().at(-1)} (${byDay.size}d)`);
    } else {
      source = "transfer-fold";
      const logs = await collectSinkLogs(rpc, conf, conf.genesisBlock, head);
      console.log(`  folding ${logs.length} sink transfers`);
      const mintCount = logs.filter((l) => topicAddr(l.topics[1]) === ZERO).length;
      const folded = foldDays(logs, conf, blockTime, today, mintCount);
      byDay = folded.byDay;
      const last = [...byDay.keys()].sort().at(-1);
      console.log(
        `  fold ${[...byDay.keys()].sort()[0] || "—"} → ${last || "—"} (${byDay.size}d)` +
        `  close ${last ? Math.round(byDay.get(last)) : 0}` +
        `  live ${Math.round(Number(project.activation?.dualBurn?.totalBurnTokens) || 0)}`,
      );
    }

    cache[key] = Object.fromEntries([...byDay.entries()].sort());
    saveCache(cache);

    const liveDate = firstLiveSnapDate(project);
    const liveBurn = liveDate
      ? Number((project.dailySnapshots || []).find((s) => dates.dateKey(s.date) === liveDate && s.yieldSource !== "clock_in")?.totalBurn)
      : 0;
    const foldAtLive = liveDate ? Number(byDay.get(liveDate)) || 0 : 0;
    const factor = liveBurn > 0 && foldAtLive > 0 ? liveBurn / foldAtLive : 1;
    if (factor !== 1) {
      console.log(`  scale ×${factor.toFixed(4)} so ${liveDate} meets live ${Math.round(liveBurn)} (fold ${Math.round(foldAtLive)})`);
    }

    const labels = [...byDay.keys()].sort();
    const series = labels.map((d) => {
      const raw = Number(byDay.get(d)) || 0;
      const scaled = liveDate && d < liveDate ? raw * factor : raw;
      return Math.round(scaled);
    });

    project.ownership = project.ownership || {};
    project.ownership.burnHistory = {
      labels,
      data: series,
      source,
    };

    let patched = 0;
    for (const snap of project.dailySnapshots || []) {
      const d = dates.dateKey(snap.date);
      if (!d) continue;
      const idx = labels.indexOf(d);
      if (idx < 0) continue;
      if (snap.yieldSource === "clock_in" || (liveDate && d < liveDate)) {
        snap.totalBurn = series[idx];
        patched++;
      }
    }
    console.log(`  burnHistory ${labels[0]} → ${labels[labels.length - 1]} (${labels.length}d); patched ${patched} snapshots`);
  }

  writeData(data);
  console.log("\nwrote public/data.json and docs/data.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
