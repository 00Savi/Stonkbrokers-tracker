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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const STREAMS = [
  ["revAmm", "dailyAmm"],
  ["revDex", "dailyDex"],
  ["revBox", "dailySecurityBox"],
  ["revVolume", "dailyLaunchpad"],
  ["revTax", "dailyBondingTax"],
  ["revSmartLp", "dailySmartLp"],
  ["revSmartLpGross", "dailySmartLpGross"],
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
    p.revenue.historyTotalUsd = feeDays.map((d) => Number(feesByProject[key][d].revAmm) || 0);
  }
  counts[key] = { snaps: snaps.length, filledLive, filledFee, feeDays: feeDays.length };
}

fs.writeFileSync(file, JSON.stringify(data));
fs.writeFileSync(path.join(__dirname, "..", "docs", "data.json"), JSON.stringify(data));
console.log(JSON.stringify(counts, null, 2));
