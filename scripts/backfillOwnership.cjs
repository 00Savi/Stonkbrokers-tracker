/**
 * Reconstruct StonkBrokers ownership + locked-LP history from chain logs.
 *
 * Circulating NFTs = maxSupply − AMM vault inventory.
 * Concentration = unique NFT wallets (excluding the vault and burn
 * addresses) ÷ that circulating number.
 *
 * Token-holder days come from the hourly historicalGrowth series with
 * failed-read dips removed. Locked STONK is the token sitting in Uniswap
 * v4 PoolManager plus every 20-byte DexScreener pool contract.
 *
 * The NFT Transfer fold undercounts AMM inventory vs live balanceOf (the
 * node is pruned; some marketplace fills never show up as a Transfer to
 * the vault). Historical vault is scaled onto the live read so circulating
 * stays maxSupply − vault all the way back.
 *
 * Does not touch tax / TVL / revenue streams.
 *
 * Usage: node scripts/backfillOwnership.cjs
 */
const fs = require("fs");
const path = require("path");
const { Rpc, TOPIC, addrTopic, decodeUint, topicAddr } = require("../lib/rpc.cjs");
const { BlockTime } = require("../lib/blocktime.cjs");
const dates = require("../lib/dates.cjs");

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const SCALE = 1e18;
const CONSECUTIVE =
  "0xdeaa91b6123d068f5821d0fb0678463d1a8a6079fe8af5de3ce5e896dcf9133d";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const DATA = path.join(__dirname, "..", "public", "data.json");
const DOCS = path.join(__dirname, "..", "docs", "data.json");

const STONK = {
  genesisBlock: 12_600_000,
  tokenCa: "0xe934e36a439c94017b64a3fece66af12099abf50",
  nftCa: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0",
  ammCa: "0xe302733accf4800146e55fc45b46b4e4ffc032d2",
  maxSupply: 4444,
};

function excludedNft(addr, amm) {
  const a = (addr || "").toLowerCase();
  return !a || a === ZERO || a === DEAD || a === amm;
}

function logKey(log) {
  return `${parseInt(log.blockNumber, 16)}:${parseInt(log.logIndex, 16)}`;
}

async function collectLogs(rpc, filter, label, fromBlock, toBlock) {
  process.stdout.write(`  ${label}…`);
  const logs = await rpc.getLogs(
    { ...filter, fromBlock, toBlock },
    (to, end, n) => {
      process.stdout.write(`\r  ${label}: block ${to}/${end}  ${n} logs   `);
    },
  );
  console.log(`\r  ${label}: ${logs.length} logs`.padEnd(70));
  return logs;
}

function sortLogs(logs) {
  logs.sort((a, b) => {
    const ba = parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16);
    if (ba) return ba;
    return parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16);
  });
  return logs;
}

function applyNftTransfer(owners, from, to, id) {
  if (id == null) return;
  const cur = owners.get(id);
  if (from && from !== ZERO && cur === from) owners.delete(id);
  if (to && to !== ZERO) owners.set(id, to);
  else owners.delete(id);
}

function nftSnapshot(owners, amm, maxSupply) {
  const counts = new Map();
  for (const owner of owners.values()) {
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }
  const vault = counts.get(amm) || 0;
  let wallets = 0;
  for (const [addr, n] of counts) {
    if (n > 0 && !excludedNft(addr, amm)) wallets++;
  }
  const circulating = Math.max(0, maxSupply - vault);
  const ratio = circulating > 0 ? (wallets / circulating) * 100 : 0;
  return { vault, wallets, circulating, ratio };
}

function foldNftDays(logs, blockTime, amm, maxSupply, throughIso) {
  const owners = new Map();
  const byDay = new Map();
  let currentDay = null;
  let lastSnap = { vault: 0, wallets: 0, circulating: maxSupply, ratio: 0 };

  const flushTo = (until) => {
    if (!currentDay || !until || until < currentDay) return;
    const start = Date.parse(`${currentDay}T00:00:00Z`);
    const end = Date.parse(`${until}T00:00:00Z`);
    for (let t = start; t <= end; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      byDay.set(d, { ...lastSnap });
    }
  };

  for (const log of logs) {
    const day = dates.utcIsoFromTs(blockTime.at(parseInt(log.blockNumber, 16)));
    if (!day) continue;
    if (currentDay && day > currentDay) {
      lastSnap = nftSnapshot(owners, amm, maxSupply);
      flushTo(new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10));
    }
    const topic0 = (log.topics && log.topics[0] || "").toLowerCase();
    if (topic0 === CONSECUTIVE) {
      const fromId = decodeUint(log.topics[1], 0);
      const toId = decodeUint(log.data, 0);
      const from = topicAddr(log.topics[2]);
      const to = topicAddr(log.topics[3]);
      if (fromId != null && toId != null) {
        const a = Number(fromId);
        const b = Number(toId);
        for (let id = a; id <= b; id++) applyNftTransfer(owners, from, to, id);
      }
    } else {
      applyNftTransfer(
        owners,
        topicAddr(log.topics[1]),
        topicAddr(log.topics[2]),
        log.topics[3] ? Number(decodeUint(log.topics[3], 0)) : Number(decodeUint(log.data, 0)),
      );
    }
    if (!currentDay || day > currentDay) currentDay = day;
  }
  lastSnap = nftSnapshot(owners, amm, maxSupply);
  flushTo(throughIso);
  return { byDay, lastSnap };
}

function applyTokenMove(bal, from, to, value, sinks) {
  const v = value == null ? 0n : BigInt(value);
  if (v <= 0n) return;
  from = (from || ZERO).toLowerCase();
  to = (to || ZERO).toLowerCase();
  if (sinks.has(from)) sinks.set(from, (sinks.get(from) || 0n) > v ? sinks.get(from) - v : 0n);
  if (sinks.has(to)) sinks.set(to, (sinks.get(to) || 0n) + v);
}

function foldLpDays(logs, blockTime, sinkSet, throughIso) {
  const bal = new Map([...sinkSet].map((a) => [a, 0n]));
  const byDay = new Map();
  let currentDay = null;
  let last = 0;

  const close = () => {
    let sum = 0n;
    for (const v of bal.values()) sum += v;
    return Number(sum) / SCALE;
  };

  const flushTo = (until) => {
    if (!currentDay || !until || until < currentDay) return;
    const start = Date.parse(`${currentDay}T00:00:00Z`);
    const end = Date.parse(`${until}T00:00:00Z`);
    for (let t = start; t <= end; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      byDay.set(d, last);
    }
  };

  for (const log of logs) {
    const day = dates.utcIsoFromTs(blockTime.at(parseInt(log.blockNumber, 16)));
    if (!day) continue;
    if (currentDay && day > currentDay) {
      last = close();
      flushTo(new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10));
    }
    applyTokenMove(
      bal,
      topicAddr(log.topics[1]),
      topicAddr(log.topics[2]),
      decodeUint(log.data, 0),
      bal,
    );
    if (!currentDay || day > currentDay) currentDay = day;
  }
  last = close();
  flushTo(throughIso);
  return byDay;
}

function cleanedTokenHolders(hist) {
  const pts = [];
  (hist?.labels || []).forEach((label, i) => {
    const d = dates.dateKey(label);
    const n = Number(hist.data[i]);
    if (d && Number.isFinite(n) && n > 0) pts.push({ d, n });
  });
  pts.sort((a, b) => a.d.localeCompare(b.d));
  const kept = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = kept[kept.length - 1];
    if (!prev || p.n >= prev.n * 0.75) {
      kept.push(p);
      continue;
    }
    let recovers = false;
    for (let j = i + 1; j < pts.length && j <= i + 4; j++) {
      if (pts[j].n >= prev.n * 0.9) {
        recovers = true;
        break;
      }
    }
    if (!recovers) kept.push(p);
  }
  if (!kept.length) return new Map();
  const byDay = new Map();
  let gi = 0;
  const start = Date.parse(`${kept[0].d}T00:00:00Z`);
  const end = Date.parse(`${kept[kept.length - 1].d}T00:00:00Z`);
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    while (gi + 1 < kept.length && kept[gi + 1].d <= d) gi++;
    byDay.set(d, Math.round(kept[gi].n));
  }
  return byDay;
}

async function dexLpContracts(tokenCa) {
  const sinks = new Set([POOL_MANAGER]);
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCa}`);
    const j = await r.json();
    for (const p of j.pairs || []) {
      if (p.chainId !== "robinhood" && !(p.url || "").includes("robinhood")) continue;
      const addr = (p.pairAddress || "").toLowerCase();
      if (addr.length === 42) sinks.add(addr);
    }
  } catch (e) {
    console.warn(`  dexscreener pairs: ${e.message}`);
  }
  return sinks;
}

function writeData(data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(DATA, json);
  fs.writeFileSync(DOCS, json);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const project = data.projects.stonk;
  if (!project) throw new Error("no stonk project");

  const rpc = new Rpc();
  const blockTime = new BlockTime().load();
  const head = await rpc.blockNumber();
  const today = dates.utcIso();
  const amm = STONK.ammCa;

  await blockTime.ensureRange(rpc, STONK.genesisBlock, head, (done, total) => {
    process.stdout.write(`\r  block-time anchors: ${done}/${total}   `);
  });
  console.log(`\r  block-time anchors: ${blockTime.anchors.length} covering to ${head}`.padEnd(70));

  console.log("\n--- NFT holders / AMM vault ---");
  const nftLogs = sortLogs([
    ...(await collectLogs(
      rpc,
      { address: STONK.nftCa, topics: [TOPIC.transfer] },
      "NFT Transfer",
      STONK.genesisBlock,
      head,
    )),
    ...(await collectLogs(
      rpc,
      { address: STONK.nftCa, topics: [CONSECUTIVE] },
      "NFT ConsecutiveTransfer",
      STONK.genesisBlock,
      head,
    )),
  ]);
  const nft = foldNftDays(nftLogs, blockTime, amm, STONK.maxSupply, today);
  const nftDays = [...nft.byDay.keys()].sort();
  console.log(
    `  ${nftDays[0]} → ${nftDays.at(-1)}  wallets ${nft.lastSnap.wallets}` +
    `  vault ${nft.lastSnap.vault}  circ ${nft.lastSnap.circulating}` +
    `  conc ${nft.lastSnap.ratio.toFixed(2)}%` +
    `  live vault ${project.ownership?.ammVaultNfts} holders ${project.ownership?.nftHolders}`,
  );

  console.log("\n--- Token holders (cleaned hourly series) ---");
  const tokenByDay = cleanedTokenHolders(project.ownership?.historicalGrowth);
  const tokDays = [...tokenByDay.keys()].sort();
  console.log(`  ${tokDays[0] || "—"} → ${tokDays.at(-1) || "—"} (${tokDays.length}d) last ${tokenByDay.get(tokDays.at(-1))}`);

  console.log("\n--- Locked STONK in LP ---");
  const sinks = await dexLpContracts(STONK.tokenCa);
  console.log(`  ${sinks.size} LP contracts (PoolManager + 20-byte pools)`);
  const seen = new Set();
  const lpLogs = [];
  for (const sink of sinks) {
    for (const [label, topics] of [
      [`to ${sink.slice(0, 10)}`, [TOPIC.transfer, null, addrTopic(sink)]],
      [`from ${sink.slice(0, 10)}`, [TOPIC.transfer, addrTopic(sink)]],
    ]) {
      const part = await collectLogs(
        rpc,
        { address: STONK.tokenCa, topics },
        label,
        STONK.genesisBlock,
        head,
      );
      for (const log of part) {
        const k = logKey(log);
        if (seen.has(k)) continue;
        seen.add(k);
        lpLogs.push(log);
      }
    }
  }
  sortLogs(lpLogs);
  const lpByDay = foldLpDays(lpLogs, blockTime, sinks, today);
  const lpDays = [...lpByDay.keys()].sort();
  console.log(
    `  ${lpDays[0] || "—"} → ${lpDays.at(-1) || "—"}  close ${Math.round(lpByDay.get(lpDays.at(-1)) || 0)}` +
    `  live ${project.lockedLp?.totalStonkLocked}`,
  );

  const liveVault = Number(project.ownership?.ammVaultNfts) || nft.lastSnap.vault;
  const liveHolders = Number(project.ownership?.nftHolders) || 0;
  const liveLocked = Number(project.lockedLp?.totalStonkLocked) || 0;
  const foldLocked = Number(lpByDay.get(today) || lpByDay.get(lpDays.at(-1))) || 0;
  const lockFactor = liveLocked > 0 && foldLocked > 0 ? liveLocked / foldLocked : 1;
  const foldVault = nft.lastSnap.vault || 0;
  const vaultScale = liveVault > 0 && foldVault > 0 ? liveVault / foldVault : 1;
  console.log(`  vault scale ${vaultScale.toFixed(4)}  fold ${foldVault} → live ${liveVault}`);

  const o = project.ownership || {};
  o.ammVaultNfts = liveVault || nft.lastSnap.vault;
  o.circulatingNftSupply = Math.max(0, STONK.maxSupply - o.ammVaultNfts);
  o.nftHolders = liveHolders > 0 ? liveHolders : nft.lastSnap.wallets;
  o.ownershipRatio = o.circulatingNftSupply > 0
    ? +Math.min(100, (o.nftHolders / o.circulatingNftSupply) * 100).toFixed(2)
    : 0;
  if (tokDays.length) {
    o.historicalGrowth = {
      labels: tokDays,
      data: tokDays.map((d) => tokenByDay.get(d)),
    };
  }
  project.ownership = o;

  let patched = 0;
  for (const snap of project.dailySnapshots || []) {
    const d = dates.dateKey(snap.date);
    if (!d) continue;
    const row = nft.byDay.get(d);
    if (row) {
      const vault = Math.round(row.vault * vaultScale);
      const circ = Math.max(0, STONK.maxSupply - vault);
      snap.nftHolders = row.wallets;
      snap.ammVaultNfts = vault;
      snap.ownershipRatio = circ > 0
        ? +Math.min(100, (row.wallets / circ) * 100).toFixed(2)
        : 0;
    }
    const tok = tokenByDay.get(d);
    if (tok > 0) snap.tokenHolders = tok;
    const locked = lpByDay.get(d);
    if (locked > 0) {
      const tokens = locked * lockFactor;
      snap.lockedStonk = Math.round(tokens);
      const px = Number(snap.tokenPriceUsd);
      const price = px > 0 && px !== 0.03 ? px : Number(project.market?.tokenPriceUsd) || 0;
      if (price > 0) snap.lockedLpUsd = Math.round(tokens * price);
    }
    patched++;
  }

  writeData(data);
  console.log(`\npatched ${patched} snapshots`);
  console.log(`live tiles  vault ${o.ammVaultNfts}  circ ${o.circulatingNftSupply}  wallets ${o.nftHolders}  conc ${o.ownershipRatio}%`);
  console.log("wrote public/data.json and docs/data.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
