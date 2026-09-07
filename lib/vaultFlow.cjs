// Hourly vault-set diffs for contracts that do not emit Activated.
//
// SoftStakingVault (Card Wall) answers activations(id) and activeCount() but
// does not emit the Anvil Activated topic. Transfer-log reconstruction then
// counted buys of currently-active tokens as deactivations and hardcoded
// dailyActivations to 0, which is why the dashboard's 7D ACT column stayed
// empty while 841 NFTs were sitting in the vault.
//
// The scan of activations(id) is already the source of truth for *who is in
// the vault right now*. Diffing that set against last hour's set is the
// activation/deactivation event the contract refused to emit. Windows fill
// as the hourly job runs; a cold start does not treat the live vault as
// brand-new activations.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "cache", "vault_flow.json");
const KEEP_SEC = 40 * 86400;
const TIERS = ["T0", "T1", "T2", "T3", "T4"];

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(all) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

function emptyPair() {
  return { act: 0, deact: 0 };
}

function emptyStats(liveBreakdown) {
  const stats = {};
  for (const t of TIERS) {
    stats[t] = {
      "24h": emptyPair(),
      "7d": emptyPair(),
      "30d": emptyPair(),
      // ALL is the live vault mix. Cumulative "ever activated" is not
      // recoverable: the contract never logged it. Windows (24h/7d/30d) are
      // the flow this module actually observes.
      allTime: { act: Number(liveBreakdown?.[t] || 0), deact: 0 },
    };
  }
  return stats;
}

function dateLabel(ts) {
  const d = new Date(Number(ts) * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function eventKey(e) {
  return `${e.ts}|${e.type}|${e.id}|${e.t || ""}`;
}

function mergeEvents(a, b) {
  const out = [];
  const seen = new Set();
  for (const e of [...(a || []), ...(b || [])]) {
    if (!e || !e.ts || !e.type || e.id == null) continue;
    const k = eventKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((x, y) => x.ts - y.ts || String(x.id).localeCompare(String(y.id)));
}

function prune(events, now) {
  const floor = now - KEEP_SEC;
  return (events || []).filter((e) => Number(e.ts) >= floor);
}

/**
 * Entries that appeared, left, or changed tier between two activations(id) maps.
 *
 * `prev` empty + `curr` large is a first run (or a wiped cache), not 841
 * people activating in one hour.
 */
function diffSets(prev, curr, ts) {
  prev = prev || {};
  curr = curr || {};
  const prevN = Object.keys(prev).length;
  const currN = Object.keys(curr).length;
  if (prevN === 0 && currN > 10) return [];

  const events = [];
  for (const id of Object.keys(curr)) {
    const t = curr[id]?.t;
    if (!t) continue;
    if (!prev[id]) events.push({ ts, id, type: "act", t });
    else if (prev[id].t && prev[id].t !== t) events.push({ ts, id, type: "up", t, from: prev[id].t });
  }
  for (const id of Object.keys(prev)) {
    if (curr[id]) continue;
    const t = prev[id]?.t;
    if (t) events.push({ ts, id, type: "deact", t });
  }
  return events;
}

function historyFromFlow(flow, liveCount, now) {
  const dailyData = {};
  let net = 0;
  for (const e of flow) {
    if (e.type === "act") net += 1;
    else if (e.type === "deact") net -= 1;
    else continue;
    const dateStr = dateLabel(e.ts);
    if (!dailyData[dateStr]) {
      dailyData[dateStr] = { activated: 0, deactivated: 0, timestamp: e.ts };
    }
    if (e.type === "act") dailyData[dateStr].activated++;
    if (e.type === "deact") dailyData[dateStr].deactivated++;
    if (e.ts < dailyData[dateStr].timestamp) dailyData[dateStr].timestamp = e.ts;
  }

  let dayStart = new Date((flow[0]?.ts || now) * 1000);
  dayStart.setHours(0, 0, 0, 0);
  for (let t = dayStart.getTime() / 1000; t <= now; t += 86400) {
    const dateStr = dateLabel(t);
    if (!dailyData[dateStr]) dailyData[dateStr] = { activated: 0, deactivated: 0, timestamp: t };
  }

  const sortedDates = Object.keys(dailyData).sort(
    (a, b) => dailyData[a].timestamp - dailyData[b].timestamp,
  );

  const history = {
    labels: [],
    dailyActivations: [],
    dailyDeactivations: [],
    cumulative: [],
    cumulativeGross: [],
  };
  let running = Math.max(0, liveCount - net);
  let runningGross = running;
  for (const dateStr of sortedDates) {
    const d = dailyData[dateStr];
    history.labels.push(dateStr);
    history.dailyActivations.push(d.activated);
    history.dailyDeactivations.push(d.deactivated);
    running = Math.max(0, running + d.activated - d.deactivated);
    runningGross += d.activated;
    history.cumulative.push(running);
    history.cumulativeGross.push(runningGross);
  }
  return history;
}

function statsFromFlow(flow, liveBreakdown, now) {
  const oneDay = 86400;
  const tierStats = emptyStats(liveBreakdown);
  for (const e of flow) {
    const t = e.t;
    if (!tierStats[t]) continue;
    const age = now - e.ts;
    if (e.type === "act") {
      if (age <= oneDay) tierStats[t]["24h"].act++;
      if (age <= 7 * oneDay) tierStats[t]["7d"].act++;
      if (age <= 30 * oneDay) tierStats[t]["30d"].act++;
    } else if (e.type === "deact") {
      tierStats[t].allTime.deact++;
      if (age <= oneDay) tierStats[t]["24h"].deact++;
      if (age <= 7 * oneDay) tierStats[t]["7d"].deact++;
      if (age <= 30 * oneDay) tierStats[t]["30d"].deact++;
    } else if (e.type === "up") {
      // A rarity change is not an enter/leave. Count it as act at the new
      // star and deact at the old one so the 7D mix still moves.
      if (tierStats[e.from]) {
        if (age <= oneDay) tierStats[e.from]["24h"].deact++;
        if (age <= 7 * oneDay) tierStats[e.from]["7d"].deact++;
        if (age <= 30 * oneDay) tierStats[e.from]["30d"].deact++;
        tierStats[e.from].allTime.deact++;
      }
      if (age <= oneDay) tierStats[t]["24h"].act++;
      if (age <= 7 * oneDay) tierStats[t]["7d"].act++;
      if (age <= 30 * oneDay) tierStats[t]["30d"].act++;
    }
  }
  return tierStats;
}

/**
 * Record this hour's vault-set diff, persist it, and rebuild the dashboard
 * windows. `prevFlow` is the copy last written into data.json so a missing
 * Actions cache still has a 7-day memory.
 */
function observe({ projectKey, prevSet, prevFlow, currSet, liveBreakdown, liveCount, now }) {
  const ts = now || Math.floor(Date.now() / 1000);
  const disk = load();
  const added = diffSets(prevSet, currSet, ts);
  const flow = prune(mergeEvents(disk[projectKey], prevFlow).concat(added), ts);
  disk[projectKey] = flow;
  save(disk);

  const live = Number(liveCount || 0);
  return {
    added,
    flow,
    tierStats: statsFromFlow(flow, liveBreakdown, ts),
    history: historyFromFlow(flow, live, ts),
  };
}

module.exports = {
  FILE,
  KEEP_SEC,
  load,
  save,
  diffSets,
  mergeEvents,
  prune,
  statsFromFlow,
  historyFromFlow,
  observe,
};
