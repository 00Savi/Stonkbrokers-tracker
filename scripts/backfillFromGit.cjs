/**
 * Copy fields we already recorded in hourly public/data.json commits onto
 * matching dailySnapshots. Does not interpolate or invent series.
 *
 * Live scalars (holders, activation, locked LP, floors) come from the last
 * commit that UTC day. Rolling 7-day fee windows are stitched by date so
 * older snapshot days can show AMM / Clock-In / volume when that hour's
 * fetch had them.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function mdUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function mdFromTs(ms) {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function lastCommitPerUtcDay() {
  const log = execSync("git log --format=%H%n%cI -- public/data.json", {
    encoding: "utf8",
    maxBuffer: 8e6,
  });
  const lines = log.trim().split(/\r?\n/);
  const byDay = new Map();
  for (let i = 0; i < lines.length; i += 2) {
    const hash = lines[i];
    const iso = lines[i + 1];
    if (!hash || !iso) continue;
    const day = mdUtc(iso);
    if (!day || byDay.has(day)) continue;
    byDay.set(day, { hash, iso });
  }
  return [...byDay.entries()].reverse();
}

function showData(hash) {
  const raw = execSync(`git show ${hash}:public/data.json`, {
    encoding: "utf8",
    maxBuffer: 80e6,
  });
  return JSON.parse(raw);
}

function inferredDates(iso, n) {
  const end = Date.parse(iso);
  if (!Number.isFinite(end) || !(n > 0)) return [];
  const sevenAgoMs = end - 7 * 86400000;
  return Array.from({ length: n }, (_, i) => mdFromTs(sevenAgoMs + i * 86400000));
}

function isoFromMd(md, commitIso) {
  const c = new Date(commitIso);
  if (Number.isNaN(c.getTime())) return null;
  let y = c.getUTCFullYear();
  const [m, d] = String(md).split("/").map(Number);
  if (!m || !d) return null;
  if (c.getUTCMonth() === 0 && m === 12) y -= 1;
  if (c.getUTCMonth() === 11 && m === 1) y += 1;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const STREAMS = [
  ["revAmm", "dailyAmm", "amm"],
  ["revDex", "dailyDex", "dex"],
  ["revBox", "dailySecurityBox", "box"],
  ["revVolume", "dailyLaunchpad", "volume"],
  ["revTax", "dailyBondingTax", "tax"],
  ["revSmartLp", "dailySmartLp", "smartLp"],
  ["revSmartLpGross", "dailySmartLpGross", null],
];

const days = lastCommitPerUtcDay();
const liveByProject = {};
const feesByProject = {};

for (const [day, { hash, iso }] of days) {
  let data;
  try {
    data = showData(hash);
  } catch (e) {
    console.warn(`skip ${hash}: ${e.message}`);
    continue;
  }
  for (const [key, p] of Object.entries(data.projects || {})) {
    if (!p) continue;
    const own = p.ownership || {};
    const act = p.activation || {};
    const m = p.market || {};
    const lp = p.lockedLp || {};
    const r = p.revenue || {};
    const sl = r.smartLp || {};
    liveByProject[key] ||= {};
    liveByProject[key][day] = {
      tokenHolders: num(own.stonkHolders ?? own.tokenHolders),
      nftHolders: num(own.nftHolders),
      ownershipRatio: num(own.ownershipRatio),
      activeCount: num(act.activeCount),
      percentActivated: num(act.percentActivated),
      tierActive: act.breakdown && typeof act.breakdown === "object" ? { ...act.breakdown } : null,
      nftFloorEth: num(m.nftFloorEth),
      nftFloorUsd: num(m.nftFloorEth) != null && num(m.ethPriceUsd) != null
        ? num(m.nftFloorEth) * num(m.ethPriceUsd)
        : null,
      lockedStonk: num(lp.totalStonkLocked),
      lockedLpUsd: num(lp.totalLpUsd),
      smartLpTvl: key === "stonk" ? num(sl.totalTvlUsd) : null,
    };
    const n = Math.max(
      (r.dailyAmm || []).length,
      (r.dailyDex || []).length,
      (r.dailySecurityBox || []).length,
      (r.dailyLaunchpad || []).length,
      (r.dailyBondingTax || []).length,
      (r.dailySmartLp || []).length
    );
    const dates = (r.dailyDates && r.dailyDates.length === n)
      ? r.dailyDates
      : inferredDates(iso, n);
    feesByProject[key] ||= {};
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (!d) continue;
      const row = (feesByProject[key][d] ||= {});
      if (!row.iso) {
        const isoDay = isoFromMd(d, iso);
        if (isoDay) row.iso = isoDay;
      }
      for (const [snapKey, dailyKey] of STREAMS) {
        const v = num(r[dailyKey]?.[i]);
        if (v != null) row[snapKey] = v;
      }
    }
  }
  console.log(`read ${day} ${hash.slice(0, 7)}`);
}

const file = path.join(__dirname, "..", "public", "data.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const counts = {};

for (const [key, p] of Object.entries(data.projects || {})) {
  const snaps = p.dailySnapshots || [];
  let filledLive = 0;
  let filledFee = 0;
  for (const s of snaps) {
    const live = liveByProject[key]?.[s.date];
    const fees = feesByProject[key]?.[s.date];
    if (live) {
      const assign = (field, v) => {
        if (v == null || v === 0 && field === "smartLpTvl") return;
        if (s[field] == null) {
          s[field] = v;
          filledLive++;
        }
      };
      assign("tokenHolders", live.tokenHolders);
      assign("nftHolders", live.nftHolders);
      assign("ownershipRatio", live.ownershipRatio);
      assign("activeCount", live.activeCount);
      assign("percentActivated", live.percentActivated);
      if (!s.tierActive && live.tierActive) {
        s.tierActive = live.tierActive;
        filledLive++;
      }
      assign("nftFloorEth", live.nftFloorEth);
      assign("nftFloorUsd", live.nftFloorUsd);
      assign("lockedStonk", live.lockedStonk);
      assign("lockedLpUsd", live.lockedLpUsd);
      if (key === "stonk") assign("smartLpTvl", live.smartLpTvl);
    }
    if (fees) {
      for (const [snapKey] of STREAMS) {
        if (s[snapKey] == null && fees[snapKey] != null) {
          s[snapKey] = fees[snapKey];
          filledFee++;
        }
      }
    }
  }
  const feeDays = Object.keys(feesByProject[key] || {}).sort((a, b) => {
    const [am, ad] = a.split("/").map(Number);
    const [bm, bd] = b.split("/").map(Number);
    return am - bm || ad - bd;
  });
  if (feeDays.length && p.revenue) {
    p.revenue.historyDates = feeDays;
    p.revenue.historyAmm = feeDays.map((d) => Number(feesByProject[key][d].revAmm) || 0);
    p.revenue.historyBox = feeDays.map((d) => Number(feesByProject[key][d].revBox) || 0);
    p.revenue.historyVolume = feeDays.map((d) => Number(feesByProject[key][d].revVolume) || 0);
    p.revenue.historyTax = feeDays.map((d) => Number(feesByProject[key][d].revTax) || 0);
    p.revenue.historyDex = feeDays.map((d) => Number(feesByProject[key][d].revDex) || 0);
    p.revenue.historySmartLp = feeDays.map((d) => Number(feesByProject[key][d].revSmartLp) || 0);
    p.revenue.historyTotalUsd = p.revenue.historyAmm;
  }
  counts[key] = { snaps: snaps.length, filledLive, filledFee, feeDays: feeDays.length };
}

const yieldDays = require("../lib/yieldDays.cjs");
let allDays = yieldDays.load();
const gitRows = [];
for (const [key, byDay] of Object.entries(feesByProject)) {
  const dayMap = {};
  for (const row of Object.values(byDay)) {
    if (!row.iso) continue;
    dayMap[row.iso] = {
      amm: row.revAmm,
      box: row.revBox,
      volume: row.revVolume,
      tax: row.revTax,
      dex: row.revDex,
      smartLp: row.revSmartLp,
    };
    for (const [, , stream] of STREAMS) {
      if (!stream) continue;
      const usd = row[{ amm: "revAmm", box: "revBox", volume: "revVolume", tax: "revTax", dex: "revDex", smartLp: "revSmartLp" }[stream]];
      if (usd == null) continue;
      gitRows.push({ project: key, day: row.iso, stream: stream === "smartLp" ? "smart_lp" : stream, usd });
    }
  }
  allDays = yieldDays.mergeStreams(allDays, key, dayMap);
}
yieldDays.save(allDays);

const gitFile = path.join(__dirname, "..", "cache", "stream_days_git.json");
fs.mkdirSync(path.dirname(gitFile), { recursive: true });
fs.writeFileSync(gitFile, JSON.stringify(gitRows));
const ggFile = path.join(__dirname, "..", "..", "gg-index", "priv", "repo", "stream_days_git.json");
try {
  fs.mkdirSync(path.dirname(ggFile), { recursive: true });
  fs.writeFileSync(ggFile, JSON.stringify(gitRows));
} catch (e) {
  console.warn(`skip gg-index copy: ${e.message}`);
}

fs.writeFileSync(file, JSON.stringify(data));
fs.writeFileSync(path.join(__dirname, "..", "docs", "data.json"), JSON.stringify(data));
console.log(JSON.stringify({ ...counts, gitRows: gitRows.length }, null, 2));
