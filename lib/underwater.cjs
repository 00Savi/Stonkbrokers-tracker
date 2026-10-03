// Percent of holders underwater.
//
// Open dates come from gg-index, which already stores every transfer. This
// file only prices them: collection floor and token price on the day the
// position opened, plus activation cost and NFT yield since. The ownership
// tab stays blank until that fold has reached the backfill.

const WHOLE = 1;
// One whole token is still dust here (Mancer is about a fifth of a cent).
// Holder mix and the token underwater line count a bag only at this mark.
// Week cohorts still include every bag of at least one token.
const TOKEN_MIN_USD = 1;
const ZERO = "0x0000000000000000000000000000000000000000";

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

function weekKey(ts) {
  const n = Number(ts) || 0;
  if (!n) return "";
  const d = new Date(n * 1000);
  const monday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - monday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function noteEntry(row, ts) {
  if (!(ts > 0)) return;
  if (!row.entryTs || ts < row.entryTs) row.entryTs = ts;
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
  return earnedBetween(project, tierId, dayKey(startTs), "");
}

function earnedBetween(project, tierId, startDay, endDay) {
  const tier = (project?.tiers || []).find((t) => t.tier === tierId);
  if (!tier) return 0;
  const dates = tier.dailyDates || [];
  const yields = tier.dailyYields || [];
  let sum = 0;
  for (let i = 0; i < dates.length; i++) {
    const k = dateKey(dates[i]);
    if (k && startDay && k < startDay) continue;
    if (k && endDay && k > endDay) continue;
    sum += Number(yields[i]) || 0;
  }
  return sum;
}

/**
 * Price a daily holder book from the index.
 *
 * Each close is who held at the end of that day, the size of the bag, and
 * the day it opened. Token mark is the balance times that day's price; cost
 * is the same balance times the open-day price. An NFT's cost is the floor
 * on each receive day, plus activation tokens the current holder paid after
 * they received it. A day with no price is left out rather than drawn as zero.
 */
function share(n, d) {
  return d ? +((n / d) * 100).toFixed(1) : 0;
}

function scoreTape(project, tape, { tokenLeg = true, priceProject = project } = {}) {
  const snaps = project?.dailySnapshots || [];
  const priceSnaps = priceProject?.dailySnapshots || snaps;
  const tokenDays = new Map();
  const nftDays = new Map();
  for (const row of tape?.token?.days || []) {
    if (row?.complete && row.day) tokenDays.set(row.day, row);
  }
  for (const row of tape?.nft?.days || []) {
    if (row?.complete && row.day) nftDays.set(row.day, row);
  }
  const days = [...new Set([...tokenDays.keys(), ...nftDays.keys()])].sort();
  const points = [];
  for (const day of days) {
    const token = tokenLeg ? scoreTokenClose(tokenDays.get(day), day, priceSnaps) : null;
    const nft = scoreNftClose(nftDays.get(day), day, snaps, priceSnaps, project);
    if (!token && !nft) continue;
    const point = { at: day };
    if (nft) {
      point.nftWallets = nft.wallets;
      point.nftUnder = nft.under;
      point.nftPct = share(nft.under, nft.wallets);
    }
    if (token) {
      point.tokenWallets = token.wallets;
      point.tokenUnder = token.under;
      point.tokenPct = share(token.under, token.wallets);
    }
    points.push(point);
  }
  return points;
}

function scoreTokenClose(row, day, priceSnaps) {
  if (!row) return null;
  const price = valueOn(priceSnaps, day, (s) => s.tokenPriceUsd);
  if (!(price > 0)) return null;
  let wallets = 0;
  let under = 0;
  for (const group of row.cohorts || []) {
    const openPx = valueOn(priceSnaps, group.opened, (s) => s.tokenPriceUsd);
    if (!(openPx > 0)) continue;
    for (const raw of group.balances || []) {
      const bal = Number(raw);
      if (!(bal > 0)) continue;
      const mark = bal * price;
      if (mark < TOKEN_MIN_USD) continue;
      wallets += 1;
      if (mark < bal * openPx) under += 1;
    }
  }
  if (!wallets) return null;
  return { wallets, under };
}

function scoreNftClose(row, day, snaps, priceSnaps, project) {
  if (!row) return null;
  const floor = valueOn(snaps, day, (s) => s.nftFloorUsd);
  if (!(floor > 0)) return null;
  let wallets = 0;
  let under = 0;
  for (const group of row.cohorts || []) {
    const copies = Number(group.wallets) || 0;
    const days = group.days || [];
    if (!copies || !days.length) continue;
    let cost = 0;
    let priced = true;
    for (const received of days) {
      const then = valueOn(snaps, received, (s) => s.nftFloorUsd);
      if (!(then > 0)) {
        priced = false;
        break;
      }
      cost += then;
    }
    if (!priced || !(cost > 0)) continue;
    let actDay = "";
    let tier = "";
    for (const act of group.acts || []) {
      const tokens = Number(act.tokens) || 0;
      const px = valueOn(priceSnaps, act.day, (s) => s.tokenPriceUsd);
      if (tokens > 0 && px > 0) cost += tokens * px;
      if (act.day && (!actDay || act.day < actDay)) actDay = act.day;
      if (act.tier) tier = act.tier;
    }
    const mark = days.length * floor;
    const rev = tier && actDay ? earnedBetween(project, tier, actDay, day) : 0;
    wallets += copies;
    if (mark + rev < cost) under += copies;
  }
  if (!wallets) return null;
  return { wallets, under };
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
      row = { nftCost: 0, nftMark: 0, nftRev: 0, nftLegs: 0, tokenCost: 0, tokenMark: 0, tokenRev: 0, tokenLeg: false, pay: {} };
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
    noteEntry(row, ts);
    const act = active[id];
    const actTs = Number(act?.ts) || 0;
    if (act?.t && actTs > 0) {
      const tier = (project.tiers || []).find((t) => t.tier === act.t);
      const paidByOwner = actTs >= ts;
      const earned = earnedNft(project, act.t, Math.max(ts, actTs));
      if (paidByOwner) {
        const px = valueOn(priceSnaps, dayKey(actTs), (s) => s.tokenPriceUsd) || liveToken;
        const req = Number(tier?.reqTokens) || 0;
        if (req > 0 && px > 0) {
          row.nftCost += req * px;
          const bucket = row.pay[act.t] || { nfts: 0, cost: 0, yield: 0 };
          bucket.nfts += 1;
          bucket.cost += req * px;
          bucket.yield += earned;
          row.pay[act.t] = bucket;
        }
      }
      row.nftRev += earned;
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
      noteEntry(row, ts);
    }
  }

  let walletsN = 0;
  let underwater = 0;
  let nftOnly = 0;
  let tokenOnly = 0;
  let both = 0;
  let nftWallets = 0;
  let nftUnder = 0;
  let tokenWallets = 0;
  let tokenUnder = 0;
  const weeks = new Map();
  const tiers = new Map();
  for (const row of wallets.values()) {
    const hasNft = row.nftLegs > 0;
    const hasTok = row.tokenLeg;
    if (!hasNft && !hasTok) continue;
    const cost = row.nftCost + row.tokenCost;
    if (!(cost > 0)) continue;
    walletsN += 1;
    const mixTok = hasTok && row.tokenMark >= TOKEN_MIN_USD;
    if (hasNft && mixTok) both += 1;
    else if (hasNft) nftOnly += 1;
    else if (mixTok) tokenOnly += 1;
    const mark = row.nftMark + row.nftRev + row.tokenMark + row.tokenRev;
    const under = mark < cost;
    if (under) underwater += 1;
    // Each leg is scored on its own book. A wallet in both is on both lines,
    // so a token bag that is down does not mark the NFT underwater.
    if (hasNft && row.nftCost > 0) {
      nftWallets += 1;
      if (row.nftMark + row.nftRev < row.nftCost) nftUnder += 1;
    }
    if (mixTok && row.tokenCost > 0) {
      tokenWallets += 1;
      if (row.tokenMark + row.tokenRev < row.tokenCost) tokenUnder += 1;
    }
    const week = weekKey(row.entryTs);
    if (week) {
      const bucket = weeks.get(week) || { week, wallets: 0, underwater: 0 };
      bucket.wallets += 1;
      if (under) bucket.underwater += 1;
      weeks.set(week, bucket);
    }
    for (const [tier, pay] of Object.entries(row.pay || {})) {
      const acc = tiers.get(tier) || { tier, nfts: 0, cost: 0, yield: 0 };
      acc.nfts += pay.nfts;
      acc.cost += pay.cost;
      acc.yield += pay.yield;
      tiers.set(tier, acc);
    }
  }

  const byWeek = [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((b) => ({
      week: b.week,
      wallets: b.wallets,
      underwater: b.underwater,
      pct: b.wallets ? +((b.underwater / b.wallets) * 100).toFixed(1) : 0,
    }));
  const payback = [...tiers.values()]
    .sort((a, b) => String(a.tier).localeCompare(String(b.tier)))
    .map((b) => ({
      tier: b.tier,
      nfts: b.nfts,
      cost: +b.cost.toFixed(2),
      yield: +b.yield.toFixed(2),
      pct: b.cost > 0 ? +((b.yield / b.cost) * 100).toFixed(1) : 0,
    }));

  return {
    caughtUp: true,
    wallets: walletsN,
    underwater,
    pct: share(underwater, walletsN),
    nftOnly,
    tokenOnly,
    both,
    mixMinUsd: TOKEN_MIN_USD,
    nftWallets,
    nftUnder,
    nftPct: share(nftUnder, nftWallets),
    tokenWallets,
    tokenUnder,
    tokenPct: share(tokenUnder, tokenWallets),
    byWeek,
    payback,
  };
}

function scoreFromPositions(project, { nftHolds, tokenPositions, tokenLeg = true, priceProject = project, amm = "" } = {}) {
  const nft = {};
  for (const hold of nftHolds || []) {
    const owner = String(hold?.owner || "").toLowerCase();
    const ts = Number(hold?.received_at) || 0;
    const id = hold?.token_id == null ? "" : String(hold.token_id);
    if (!id || !owner || !(ts > 0)) continue;
    nft[id] = [owner, ts];
  }
  const tok = {};
  if (tokenLeg) {
    for (const row of tokenPositions || []) {
      const owner = String(row?.holder || "").toLowerCase();
      const amount = Number(row?.balance);
      const ts = Number(row?.opened_at) || 0;
      if (!owner || !(amount >= WHOLE) || !(ts > 0)) continue;
      tok[owner] = [amount, ts];
    }
  }
  return scoreHolders(project, { nft, tok }, { tokenLeg, priceProject, amm });
}

module.exports = {
  scoreHolders,
  scoreFromPositions,
  scoreTape,
};
