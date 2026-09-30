// Percent of holders underwater.
//
// Open dates come from gg-index, which already stores every transfer. This
// file only prices them: collection floor and token price on the day the
// position opened, plus activation cost and NFT yield since. The ownership
// tab stays blank until that fold has reached the backfill.

const WHOLE = 1;
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
};
