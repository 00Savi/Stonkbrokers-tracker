// Percent of holders underwater, built in the hourly fetcher.
//
// A full holder walk does not fit in one run. This keeps a compact checkpoint
// in cache_underwater.json (the Actions cache, not git) and spends a few
// minutes of eth_getLogs per hour. The ownership tab stays blank until both
// the NFT transfers and the token transfers have reached chain head.
//
// Cost is the collection floor, and the token price, on the day the position
// opened. An activation this owner paid is added at that day's token price.
// Revenue since then comes off the tier's daily yield. A wallet is one holder
// even when it holds the NFT and the token.

const fs = require("fs");
const { ethers } = require("ethers");

const CACHE = "cache_underwater.json";
const STEP = 200_000;
const WHOLE = 1;
const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER = ethers.id("Transfer(address,address,uint256)");

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return raw && typeof raw === "object" ? raw : { projects: {} };
  } catch {
    return { projects: {} };
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

function num(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (!s) return 0;
  return s.startsWith("0x") || s.startsWith("0X") ? parseInt(s, 16) : parseInt(s, 10);
}

function addrOf(topic) {
  if (!topic || String(topic).length < 40) return "";
  return `0x${String(topic).slice(-40)}`.toLowerCase();
}

function dayKey(ts) {
  const n = Number(ts) || 0;
  if (!n) return "";
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function dateKey(value) {
  const s = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function roundTokens(n) {
  return Math.round(n * 1e6) / 1e6;
}

function blankState(genesis) {
  return { nftTo: genesis, tokenTo: genesis, nft: {}, tok: {} };
}

function applyNft(state, to, id, ts) {
  if (!id) return;
  if (!to || to === ZERO) {
    delete state.nft[id];
    return;
  }
  state.nft[id] = [to, ts || 0];
}

function applyToken(state, from, to, amount, ts) {
  const touch = (addr, delta) => {
    if (!addr || addr === ZERO) return;
    const prev = state.tok[addr];
    const bal = (prev ? Number(prev[0]) : 0) + delta;
    if (!(bal >= WHOLE)) {
      delete state.tok[addr];
      return;
    }
    const start = prev && Number(prev[0]) >= WHOLE ? prev[1] : (ts || 0);
    state.tok[addr] = [roundTokens(bal), start];
  };
  touch(from, -amount);
  touch(to, amount);
}

function applyLog(state, log, kind, ts) {
  const topics = Array.isArray(log.topics) ? log.topics : [];
  if (kind === "nft") {
    if (topics.length !== 4) return;
    const id = BigInt(topics[3]).toString();
    applyNft(state, addrOf(topics[2]), id, ts);
    return;
  }
  if (topics.length !== 3) return;
  let amount = 0;
  try {
    amount = Number(ethers.formatUnits(BigInt(log.data || "0x0"), 18));
  } catch {
    amount = 0;
  }
  if (!(amount > 0)) return;
  applyToken(state, addrOf(topics[1]), addrOf(topics[2]), amount, ts);
}

function valueOn(snaps, day, pick) {
  if (!day) return 0;
  let bestDay = "";
  let best = 0;
  for (const snap of snaps || []) {
    const k = dateKey(snap?.date);
    if (!k || k > day) continue;
    const n = Number(pick(snap)) || 0;
    if (!(n > 0)) continue;
    if (k >= bestDay) {
      bestDay = k;
      best = n;
    }
  }
  return best;
}

function earnedNft(project, tierId, startTs) {
  const tier = (project?.tiers || []).find((t) => t.tier === tierId);
  if (!tier) return 0;
  const start = dayKey(startTs);
  const dates = tier.dailyDates || [];
  const yields = tier.dailyYields || [];
  let sum = 0;
  for (let i = 0; i < dates.length; i++) {
    const k = dateKey(dates[i]);
    if (k && start && k < start) continue;
    sum += Number(yields[i]) || 0;
  }
  return sum;
}

/**
 * One wallet, counted once. Legs with no price that day are left out.
 * `priceProject` is the token whose spot prices the activation (Stonk for Interns).
 */
function scoreHolders(project, state, { tokenLeg = true, priceProject = project, amm = "" } = {}) {
  const snaps = project?.dailySnapshots || [];
  const priceSnaps = priceProject?.dailySnapshots || snaps;
  const liveFloor = (Number(project?.market?.nftFloorEth) || 0) * (Number(project?.market?.ethPriceUsd) || 0);
  const liveToken = Number(priceProject?.market?.tokenPriceUsd) || 0;
  const active = project?.activation?.activeTokenTiers || {};
  const vault = String(amm || "").toLowerCase();
  const wallets = new Map();

  const book = (addr) => {
    let row = wallets.get(addr);
    if (!row) {
      row = { nftCost: 0, nftMark: 0, nftRev: 0, nftLegs: 0, tokenCost: 0, tokenMark: 0, tokenRev: 0, tokenLeg: false };
      wallets.set(addr, row);
    }
    return row;
  };

  for (const [id, pair] of Object.entries(state?.nft || {})) {
    const owner = String(pair?.[0] || "").toLowerCase();
    const ts = Number(pair?.[1]) || 0;
    if (!owner || owner === ZERO || (vault && owner === vault)) continue;
    const day = dayKey(ts);
    const floorThen = valueOn(snaps, day, (s) => s.nftFloorUsd);
    if (!(floorThen > 0) || !(liveFloor > 0)) continue;
    const row = book(owner);
    row.nftLegs += 1;
    row.nftCost += floorThen;
    row.nftMark += liveFloor;
    const act = active[id];
    const actTs = Number(act?.ts) || 0;
    if (act?.t && actTs > 0) {
      const tier = (project.tiers || []).find((t) => t.tier === act.t);
      const paidByOwner = actTs >= ts;
      if (paidByOwner) {
        const px = valueOn(priceSnaps, dayKey(actTs), (s) => s.tokenPriceUsd) || liveToken;
        const req = Number(tier?.reqTokens) || 0;
        if (req > 0 && px > 0) row.nftCost += req * px;
      }
      row.nftRev += earnedNft(project, act.t, Math.max(ts, actTs));
    }
  }

  if (tokenLeg) {
    for (const [addr, pair] of Object.entries(state?.tok || {})) {
      const owner = String(addr || "").toLowerCase();
      const amount = Number(pair?.[0]) || 0;
      const ts = Number(pair?.[1]) || 0;
      if (!(amount >= WHOLE) || !owner || owner === ZERO || (vault && owner === vault)) continue;
      const px = valueOn(priceSnaps, dayKey(ts), (s) => s.tokenPriceUsd);
      if (!(px > 0) || !(liveToken > 0)) continue;
      const row = book(owner);
      row.tokenLeg = true;
      row.tokenCost += amount * px;
      row.tokenMark += amount * liveToken;
    }
  }

  let walletsN = 0;
  let underwater = 0;
  let nftOnly = 0;
  let tokenOnly = 0;
  let both = 0;
  for (const row of wallets.values()) {
    const hasNft = row.nftLegs > 0;
    const hasTok = row.tokenLeg;
    if (!hasNft && !hasTok) continue;
    const cost = row.nftCost + row.tokenCost;
    if (!(cost > 0)) continue;
    walletsN += 1;
    if (hasNft && hasTok) both += 1;
    else if (hasNft) nftOnly += 1;
    else tokenOnly += 1;
    const mark = row.nftMark + row.nftRev + row.tokenMark + row.tokenRev;
    if (mark < cost) underwater += 1;
  }

  return {
    caughtUp: true,
    wallets: walletsN,
    underwater,
    pct: walletsN ? +((underwater / walletsN) * 100).toFixed(1) : 0,
    nftOnly,
    tokenOnly,
    both,
  };
}

function logTs(log, blockTime) {
  const stamped = num(log.timeStamp || log.timestamp);
  if (stamped > 0) return stamped;
  const block = num(log.blockNumber);
  return blockTime?.at ? blockTime.at(block) : 0;
}

function replayCachedNfts(state, file) {
  if (!file || !fs.existsSync(file)) return 0;
  let logs = [];
  try {
    logs = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return 0;
  }
  if (!Array.isArray(logs) || !logs.length) return 0;
  logs.sort((a, b) => num(a.blockNumber) - num(b.blockNumber) || num(a.logIndex) - num(b.logIndex));
  let high = 0;
  for (const log of logs) {
    const block = num(log.blockNumber);
    if (block > high) high = block;
    applyLog(state, log, "nft", logTs(log, null));
  }
  if (high > state.nftTo) state.nftTo = high;
  return logs.length;
}

async function pullRange(rpc, blockTime, address, from, to, kind, state) {
  if (from > to) return;
  await blockTime.ensureRange(rpc, from, to);
  const logs = await rpc.getLogs({
    address,
    fromBlock: from,
    toBlock: to,
    topics: [TRANSFER],
  });
  logs.sort((a, b) => num(a.blockNumber) - num(b.blockNumber) || num(a.logIndex) - num(b.logIndex));
  for (const log of logs) applyLog(state, log, kind, logTs(log, blockTime));
}

async function advanceUnderwater({ rpc, blockTime, jobs, budgetMs = 3 * 60 * 1000 } = {}) {
  const cache = loadCache();
  cache.projects = cache.projects || {};
  const deadline = Date.now() + budgetMs;
  let head = 0;
  try {
    head = await rpc.blockNumber();
  } catch (e) {
    console.warn(`[warn] underwater head: ${e.message}`);
    return;
  }
  if (!(head > 0)) return;

  const rows = [];
  for (const job of jobs || []) {
    if (!job?.project || !job.conf) continue;
    const genesis = Number(job.conf.genesisBlock) || 0;
    const state = cache.projects[job.key] || blankState(genesis);
    if (state.nftTo == null) state.nftTo = genesis;
    if (!job.tokenLeg) state.tokenTo = head;
    else if (state.tokenTo == null) state.tokenTo = genesis;
    if (!state.nft) state.nft = {};
    if (!state.tok) state.tok = {};
    if (job.nftCache && state.nftTo <= genesis) {
      const n = replayCachedNfts(state, job.nftCache);
      if (n) console.log(`  underwater ${job.key}: replayed ${n} cached nft transfers`);
    }
    cache.projects[job.key] = state;
    rows.push({ ...job, state, genesis });
  }

  let guard = 0;
  while (Date.now() < deadline && guard < 400) {
    guard += 1;
    let moved = false;
    for (const job of rows) {
      if (Date.now() >= deadline) break;
      const nftBehind = job.state.nftTo < head;
      const tokenBehind = job.tokenLeg && job.state.tokenTo < head;
      if (!nftBehind && !tokenBehind) continue;
      const kind = nftBehind ? "nft" : "token";
      const cursor = kind === "nft" ? job.state.nftTo : job.state.tokenTo;
      const from = cursor <= job.genesis ? job.genesis : cursor + 1;
      const to = Math.min(head, from + STEP - 1);
      const address = kind === "nft" ? job.conf.nftCa : job.conf.tokenCa;
      try {
        await pullRange(rpc, blockTime, address, from, to, kind, job.state);
        if (kind === "nft") job.state.nftTo = to;
        else job.state.tokenTo = to;
        moved = true;
        console.log(`  underwater ${job.key} ${kind} → ${to} / ${head}`);
      } catch (e) {
        console.warn(`[warn] underwater ${job.key} ${kind}: ${e.message}`);
      }
    }
    saveCache(cache);
    if (!moved) break;
  }

  for (const job of rows) {
    const caught = job.state.nftTo >= head && (!job.tokenLeg || job.state.tokenTo >= head);
    if (!caught) {
      job.project.ownership = job.project.ownership || {};
      job.project.ownership.underwater = { caughtUp: false };
      continue;
    }
    const summary = scoreHolders(job.project, job.state, {
      tokenLeg: job.tokenLeg,
      priceProject: job.priceProject || job.project,
      amm: job.conf.ammCa,
    });
    job.project.ownership = job.project.ownership || {};
    job.project.ownership.underwater = summary;
    console.log(
      `  underwater ${job.key}: ${summary.pct}% of ${summary.wallets} ` +
      `(nft ${summary.nftOnly}, token ${summary.tokenOnly}, both ${summary.both})`,
    );
  }
  saveCache(cache);
}

module.exports = {
  advanceUnderwater,
  scoreHolders,
  applyNft,
  applyToken,
  applyLog,
};
