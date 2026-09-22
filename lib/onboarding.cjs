/**
 * Wallets onboarded to Robinhood Chain *via* the StonkBrokers cluster.
 *
 * A wallet counts when it SENT a transaction with nonce 0–9 that received
 * or minted a cluster NFT, or bought STONK / MANCER / YARD / WALL off that
 * project's AMM. Airdrops do not count. Contracts (TBAs, vaults) are not
 * wallets; a mint-to-TBA still counts the minter.
 *
 * Token side does *not* walk 36k holders. getLogs is topic-filtered to
 * Transfer from the AMM (a buy), then one tx lookup per unclassified
 * recipient. Wallets already decided from the NFT pass are skipped.
 * Interns share STONK — those buys stay on StonkBrokers so they are not
 * double-counted. Set ONBOARD_SKIP_TOKENS=1 to NFT-only.
 *
 * The fold is incremental. Resolved txs, bytecode, and wallet outcomes live
 * in cache/onboarding.json — not in data.json. Each hourly run only looks up
 * new hashes. NFT transfers reuse cache_<key>_nft_logs.json when the fetcher
 * already walked that collection.
 */

const fs = require("fs");
const path = require("path");
const { Rpc, TOPIC, topicAddr, addrTopic } = require("./rpc.cjs");
const { BlockTime } = require("./blocktime.cjs");
const { fetchLogsWithTimestamps } = require("./chain.cjs");
const dates = require("./dates.cjs");

const CACHE_FILE = path.join("cache", "onboarding.json");
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const NONCE_CAP = 10;
const DEFAULT_BUDGET = Number(process.env.ONBOARD_BUDGET || 1500);

const CLUSTER = [
  { key: "stonk", label: "StonkBrokers", nft: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0", token: "0xe934e36a439c94017b64a3fece66af12099abf50", amm: "0xe302733accf4800146e55fc45b46b4e4ffc032d2", genesis: 12600000 },
  { key: "mancer", label: "Mancer", nft: "0x797a2e030b7e49107c8f07bf0300ea9cae88ca57", token: "0xc72f232a6869e6cf34dc06129affd07f8a2a246a", amm: "0x2554cad3d851381ec1a16b7bf7b4737ed46b40fe", genesis: 29000000 },
  { key: "cardwall", label: "The Card Wall", nft: "0x890215157dbec26d67605324271b34ba05ee9e58", token: "0xb03058b8a39f3967df08d833682c1c99b29821b1", amm: "0xdd59536f394c4b589e695f5921723b89ea479379", genesis: 38000000 },
  { key: "tickeryard", label: "TickerYard", nft: "0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97", token: "0xe3fa12da7fa026b21817f16622e8ae48fa785166", amm: "0xfe0b24a3b4052ad78f10fa75a27118c3e54a00e6", genesis: 33500000 },
  { key: "interns", label: "Interns", nft: "0xfc4b0c4f464dc3037cf013934648a8a726d565a5", token: null, amm: null, genesis: 66628699 },
];

function emptyCache() {
  return {
    version: 2,
    nonceCap: NONCE_CAP,
    cursors: {},
    txs: {},
    codes: {},
    seen: {},
    routers: {},
  };
}

function loadCache() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (c && typeof c === "object") {
      c.cursors = c.cursors || {};
      c.txs = c.txs || {};
      c.codes = c.codes || {};
      c.seen = c.seen || {};
      c.routers = c.routers || {};
      return c;
    }
  } catch (e) {}
  return emptyCache();
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

function isHexAddr(a) {
  return typeof a === "string" && /^0x[a-f0-9]{40}$/.test(a);
}

function parseBlock(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v);
  return s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10) || 0;
}

function parseNonce(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v);
  const n = s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function isContractCode(code) {
  return typeof code === "string" && code !== "0x" && code !== "0x0";
}

function skipSet(projects) {
  const out = new Set([ZERO, DEAD]);
  const take = (v) => {
    if (isHexAddr(v)) out.add(v.toLowerCase());
  };
  for (const conf of Object.values(projects || {})) {
    for (const bag of [conf, conf?.config]) {
      if (!bag) continue;
      for (const k of ["ammCa", "activationCa", "internEngineCa", "launchpad", "oracleSource", "vaultLedger"]) {
        take(bag[k]);
      }
      for (const v of Object.values(bag.streams || {})) take(v);
    }
  }
  return out;
}

function sourcesFor(projects, { tokens } = { tokens: false }) {
  const out = [];
  for (const row of CLUSTER) {
    const conf = projects?.[row.key] || {};
    const genesis = Number(conf.genesisBlock) || row.genesis;
    const nft = (conf.nftCa || row.nft || "").toLowerCase();
    const token = (conf.tokenCa || row.token || "").toLowerCase();
    if (!tokens && isHexAddr(nft)) {
      out.push({ id: `${row.key}:nft`, key: row.key, asset: "nft", address: nft, genesis });
    }
    if (tokens && row.token && isHexAddr(token)) {
      const amm = (conf.ammCa || row.amm || "").toLowerCase();
      if (!isHexAddr(amm)) continue;
      out.push({
        id: `${row.key}:token`,
        key: row.key,
        asset: "token",
        address: token,
        genesis,
        froms: [amm],
      });
    }
  }
  return out;
}

function fileTag(src) {
  return src.tag || src.asset;
}

function logFilesFor(src) {
  const files = [];
  if (src.asset === "nft" && !src.tag) files.push(`cache_${src.key}_nft_logs.json`);
  files.push(path.join("cache", `onboard_${src.key}_${fileTag(src)}_logs.json`));
  return files;
}

function readLogFile(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const logs = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(logs) ? logs : [];
  } catch (e) {
    return [];
  }
}

function highestBlock(logs) {
  let max = 0;
  for (const log of logs) {
    const n = parseBlock(log.blockNumber);
    if (n > max) max = n;
  }
  return max;
}

function mergeLogs(parts) {
  const map = new Map();
  for (const log of parts) {
    const key = `${String(log.transactionHash || "").toLowerCase()}:${parseBlock(log.logIndex)}`;
    if (!map.has(key)) map.set(key, log);
  }
  return [...map.values()];
}

async function loadSourceLogs(src, rpc, blockTime, head) {
  const parts = [];
  let last = src.genesis - 1;
  const ownedFile = path.join("cache", `onboard_${src.key}_${fileTag(src)}_logs.json`);
  for (const file of logFilesFor(src)) {
    const part = readLogFile(file);
    if (!part.length) continue;
    parts.push(part);
    const hi = highestBlock(part);
    if (hi > last) last = hi;
  }
  let logs = mergeLogs(parts.flat());
  const from = last >= src.genesis ? last + 1 : src.genesis;
  if (from <= head) {
    try {
      const topics = [TOPIC.transfer];
      if (src.froms?.length) {
        topics.push(src.froms.length === 1 ? addrTopic(src.froms[0]) : src.froms.map(addrTopic));
      }
      const fresh = await fetchLogsWithTimestamps(
        rpc,
        {
          address: src.address,
          fromBlock: from,
          toBlock: head,
          topics,
        },
        `onboard ${src.id}`,
        blockTime,
      );
      if (fresh.length) {
        const existing = readLogFile(ownedFile);
        fs.mkdirSync(path.dirname(ownedFile), { recursive: true });
        fs.writeFileSync(ownedFile, JSON.stringify(existing.concat(fresh)));
        logs = mergeLogs(logs.concat(fresh));
      }
    } catch (e) {
      console.warn(`[warn] onboard logs ${src.id}: ${e.message}`);
    }
  }
  return logs;
}

async function discoverRouters(logs, skip, cache, rpc) {
  const counts = new Map();
  for (const log of logs) {
    const to = topicAddr(log.topics?.[2]);
    if (!isHexAddr(to) || skip.has(to)) continue;
    counts.set(to, (counts.get(to) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const unknown = ranked.filter((a) => cache.codes[a] == null).slice(0, 40);
  if (unknown.length) {
    const codes = await rpc.codes(unknown);
    for (const [a, c] of codes) cache.codes[a] = c || "0x";
  }
  return ranked.filter((a) => isContractCode(cache.codes[a] || "0x")).slice(0, 8);
}

async function loadTokenLogs(src, rpc, blockTime, head, skip, cache) {
  const ammLogs = await loadSourceLogs(src, rpc, blockTime, head);
  const found = await discoverRouters(ammLogs, skip, cache, rpc);
  cache.routers = cache.routers || {};
  const routers = [...new Set([...(cache.routers[src.id] || []), ...found])];
  cache.routers[src.id] = routers;
  if (!routers.length) return ammLogs;
  for (const r of routers) skip.add(r);
  const viaLogs = await loadSourceLogs(
    { ...src, id: `${src.id}:via`, tag: `${src.asset}_via`, froms: routers },
    rpc,
    blockTime,
    head,
  );
  console.log(`    onboard ${src.id} via ${routers.length} router(s)`);
  return mergeLogs(ammLogs.concat(viaLogs));
}

function eventsFromLogs(logs, src, blockTime, skip) {
  const out = [];
  for (const log of logs) {
    const fromAddr = topicAddr(log.topics?.[1]);
    const toAddr = topicAddr(log.topics?.[2]);
    if (!isHexAddr(toAddr) || skip.has(toAddr)) continue;
    const block = parseBlock(log.blockNumber);
    const ts = Number(log.timeStamp) || (blockTime && block ? blockTime.at(block) : 0) || 0;
    out.push({
      to: toAddr,
      from: fromAddr,
      tx: String(log.transactionHash || "").toLowerCase(),
      block,
      logIndex: parseBlock(log.logIndex),
      txIndex: parseBlock(log.transactionIndex),
      project: src.key,
      asset: src.asset,
      mint: fromAddr === ZERO,
      day: ts ? dates.utcIsoFromTs(ts) : "",
    });
  }
  return out;
}

function classify(events, cache, skip) {
  const sorted = events.slice().sort((a, b) => a.block - b.block || a.txIndex - b.txIndex || a.logIndex - b.logIndex);
  for (const ev of sorted) {
    const raw = cache.txs[ev.tx];
    if (!raw || !raw.from) continue;
    const sender = String(raw.from).toLowerCase();
    const nonce = parseNonce(raw.nonce);
    const toCode = cache.codes[ev.to] || "0x";
    const senderCode = cache.codes[sender] || "0x";

    if (isContractCode(toCode) && cache.seen[ev.to]?.status !== "onboarded" && cache.seen[ev.to]?.status !== "later") {
      cache.seen[ev.to] = { status: "contract", project: ev.project, asset: ev.asset };
    }

    const buyer = ev.mint ? sender : sender === ev.to ? sender : null;
    if (!buyer) continue;
    if (skip.has(buyer) || isContractCode(senderCode)) continue;
    if (cache.seen[buyer]?.status === "contract") continue;
    const prev = cache.seen[buyer];
    if (prev && (prev.status === "onboarded" || prev.status === "later") && (prev.block || 0) <= ev.block) continue;

    cache.seen[buyer] = {
      status: Number.isFinite(nonce) && nonce < NONCE_CAP ? "onboarded" : "later",
      nonce: Number.isFinite(nonce) ? nonce : null,
      project: ev.project,
      asset: ev.asset,
      tx: ev.tx,
      block: ev.block,
      day: ev.day,
    };
  }
}

function pendingHashes(events, cache) {
  const seenH = new Set();
  const tokenFirst = new Set();
  const queues = new Map();
  const ordered = events.slice().sort((a, b) => a.block - b.block || a.txIndex - b.txIndex || a.logIndex - b.logIndex);
  for (const ev of ordered) {
    if (!ev.tx || cache.txs[ev.tx] || seenH.has(ev.tx)) continue;
    if (ev.asset === "token") {
      const rec = cache.seen[ev.to];
      if (rec && (rec.status === "onboarded" || rec.status === "later" || rec.status === "contract")) continue;
      if (tokenFirst.has(ev.to)) continue;
      tokenFirst.add(ev.to);
    }
    seenH.add(ev.tx);
    if (!queues.has(ev.project)) queues.set(ev.project, []);
    queues.get(ev.project).push(ev.tx);
  }
  const keys = [...queues.keys()];
  const out = [];
  let more = true;
  while (more) {
    more = false;
    for (const k of keys) {
      const q = queues.get(k);
      if (q && q.length) {
        out.push(q.shift());
        more = true;
      }
    }
  }
  return out;
}

async function resolveBatch(rpc, cache, hashes, extraAddrs) {
  if (!hashes.length && !(extraAddrs || []).length) return;
  const txs = hashes.length ? await rpc.transactions(hashes) : new Map();
  const addrs = [...(extraAddrs || [])];
  for (const h of hashes) {
    const tx = txs.get(h);
    if (tx?.from) {
      const from = String(tx.from).toLowerCase();
      cache.txs[h] = { from, nonce: parseNonce(tx.nonce) };
      addrs.push(from);
    } else {
      cache.txs[h] = { from: null, nonce: null };
    }
  }
  const fresh = [...new Set(addrs.filter((a) => isHexAddr(a) && cache.codes[a] == null))];
  if (!fresh.length) return;
  const codes = await rpc.codes(fresh);
  for (const [addr, code] of codes) cache.codes[addr] = code || "0x";
}

function enumerateDays(start, end) {
  const out = [];
  if (!start || !end || start > end) return out;
  const d = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return out;
  while (d.getTime() <= last.getTime()) {
    out.push(dates.utcIso(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function summarize(cache, pending) {
  const byProject = {};
  const projHits = {};
  for (const row of CLUSTER) {
    byProject[row.key] = { wallets: 0, nft: 0, token: 0, label: row.label, daily: { dates: [], wallets: [] } };
    projHits[row.key] = new Map();
  }
  let wallets = 0;
  let scanned = 0;
  const dayHits = new Map();
  for (const rec of Object.values(cache.seen || {})) {
    if (rec.status === "contract") continue;
    scanned++;
    if (rec.status !== "onboarded") continue;
    wallets++;
    const bucket = byProject[rec.project];
    if (bucket) {
      bucket.wallets++;
      if (rec.asset === "token") bucket.token++;
      else bucket.nft++;
    }
    if (rec.day) {
      dayHits.set(rec.day, (dayHits.get(rec.day) || 0) + 1);
      const hits = projHits[rec.project];
      if (hits) hits.set(rec.day, (hits.get(rec.day) || 0) + 1);
    }
  }
  const hitDays = [...dayHits.keys()].sort();
  const end = dates.utcIso(new Date()) || hitDays[hitDays.length - 1];
  const days = hitDays.length ? enumerateDays(hitDays[0], end) : [];
  const stair = (map) => {
    let run = 0;
    return days.map((d) => (run += map.get(d) || 0));
  };
  const daily = { dates: days, wallets: stair(dayHits) };
  for (const row of CLUSTER) {
    byProject[row.key].daily = { dates: days, wallets: stair(projHits[row.key]) };
  }
  return {
    updated: new Date().toISOString(),
    lookbackTxs: NONCE_CAP,
    wallets,
    scanned,
    pending,
    complete: pending === 0,
    byProject,
    daily,
  };
}

function emptySummary(prev) {
  if (prev && typeof prev.wallets === "number") {
    return { ...prev, complete: false };
  }
  const byProject = {};
  for (const row of CLUSTER) {
    byProject[row.key] = { wallets: 0, nft: 0, token: 0, label: row.label, daily: { dates: [], wallets: [] } };
  }
  return {
    updated: null,
    lookbackTxs: NONCE_CAP,
    wallets: 0,
    scanned: 0,
    pending: 0,
    complete: false,
    byProject,
    daily: { dates: [], wallets: [] },
  };
}

async function ingestSources(srcs, { rpc, blockTime, head, skip, cache, budget, events }) {
  let left = budget;
  for (const src of srcs) {
    const logs = src.asset === "token"
      ? await loadTokenLogs(src, rpc, blockTime, head, skip, cache)
      : await loadSourceLogs(src, rpc, blockTime, head);
    const part = eventsFromLogs(logs, src, blockTime, skip);
    events.push(...part);
    cache.cursors[src.id] = Math.max(cache.cursors[src.id] || 0, head);
  }
  const need = pendingHashes(events, cache);
  const batch = need.slice(0, Math.max(0, left));
  const CHUNK = 400;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    const sliceSet = new Set(slice);
    const extra = [];
    for (const ev of events) {
      if (sliceSet.has(ev.tx)) extra.push(ev.to);
    }
    await resolveBatch(rpc, cache, slice, extra);
    classify(events, cache, skip);
    saveCache(cache);
    console.log(`    onboard resolve: ${Math.min(i + CHUNK, batch.length)}/${batch.length} txs`);
  }
  classify(events, cache, skip);
  return need.length - batch.length;
}

/**
 * Pull new Transfer logs and classify up to `budget` unseen transaction hashes.
 */
async function foldOnboarding({ rpc, blockTime, projects, budget = DEFAULT_BUDGET, head }) {
  const cache = loadCache();
  const skip = skipSet(projects);
  const chainHead = head || (await rpc.blockNumber());
  const events = [];

  const nftLeft = await ingestSources(sourcesFor(projects, { tokens: false }), {
    rpc,
    blockTime,
    head: chainHead,
    skip,
    cache,
    budget,
    events,
  });

  let pending = nftLeft;
  if (nftLeft <= 0 && process.env.ONBOARD_SKIP_TOKENS !== "1") {
    pending = await ingestSources(sourcesFor(projects, { tokens: true }), {
      rpc,
      blockTime,
      head: chainHead,
      skip,
      cache,
      budget,
      events,
    });
  }

  saveCache(cache);
  const summary = summarize(cache, Math.max(0, pending));
  console.log(
    `  onboard: ${summary.wallets} wallets in first ${NONCE_CAP} txs` +
      ` (${summary.scanned} classified, ${summary.pending} hashes queued)`,
  );
  return summary;
}

function compactByProject(byProject) {
  const out = {};
  for (const [k, v] of Object.entries(byProject || {})) {
    out[k] = { wallets: v.wallets, nft: v.nft, token: v.token, label: v.label };
  }
  return out;
}

async function patchDataJson(summary) {
  const files = ["public/data.json", "docs/data.json"];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.onboarding = summary;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }
}

module.exports = {
  CLUSTER,
  NONCE_CAP,
  foldOnboarding,
  emptySummary,
  loadCache,
  summarize,
};

if (require.main === module) {
  (async () => {
    if (process.env.ONBOARD_SUMMARIZE === "1") {
      const cache = loadCache();
      let pending = 0;
      try {
        pending = JSON.parse(fs.readFileSync("public/data.json", "utf8")).onboarding?.pending || 0;
      } catch (e) {
        pending = 0;
      }
      const summary = summarize(cache, pending);
      await patchDataJson(summary);
      console.log(JSON.stringify({ wallets: summary.wallets, pending: summary.pending, complete: summary.complete, byProject: compactByProject(summary.byProject) }, null, 2));
      return;
    }
    const rpc = new Rpc();
    const blockTime = new BlockTime();
    blockTime.load();
    const head = await rpc.blockNumber();
    const genesis = Math.min(...CLUSTER.map((c) => c.genesis));
    try {
      await blockTime.ensureRange(rpc, genesis, head);
    } catch (e) {
      console.warn(`[warn] block-time: ${e.message}`);
    }
    let projects = {};
    try {
      const prev = JSON.parse(fs.readFileSync("public/data.json", "utf8"));
      for (const row of CLUSTER) {
        const p = prev.projects?.[row.key] || {};
        projects[row.key] = {
          ...p,
          ...(p.config || {}),
          nftCa: row.nft,
          tokenCa: row.token,
          ammCa: row.amm || p.ammCa || p.config?.ammCa,
          genesisBlock: row.genesis,
        };
      }
    } catch (e) {
      for (const row of CLUSTER) {
        projects[row.key] = { nftCa: row.nft, tokenCa: row.token, ammCa: row.amm, genesisBlock: row.genesis };
      }
    }
    const summary = await foldOnboarding({ rpc, blockTime, projects, head });
    await patchDataJson(summary);
    console.log(JSON.stringify({ wallets: summary.wallets, pending: summary.pending, complete: summary.complete, byProject: compactByProject(summary.byProject) }, null, 2));
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
