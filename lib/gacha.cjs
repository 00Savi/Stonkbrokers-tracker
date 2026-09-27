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

const { id, keccak256, toUtf8Bytes } = require("ethers");
const dates = require("./dates.cjs");

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
  const labels = new Map();
  try {
    const res = await fetch(MACHINES_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return labels;
    const body = await res.json();
    for (const m of body.machines || []) {
      if (!m?.id) continue;
      labels.set(keccak256(toUtf8Bytes(m.id)), m.label || m.id);
    }
  } catch {
    // Labels are cosmetic. The pull totals do not depend on the site.
  }
  return labels;
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
  if (!map.has(day)) map.set(day, { alley: 0, claw: 0 });
  const row = map.get(day);
  row[key] += amount;
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

  const [alleyLogs, clawLogs, rescueLogs, labels, sticker] = await Promise.all([
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

  const rescued = new Set(rescueLogs.map((l) => l.topics[1]));
  const days = new Map();
  const machines = new Map();
  const alley = { address: ALLEY, pulls: 0, usd: 0, rails: emptyRails() };
  const claw = { address: CLAW, pulls: 0, usd: 0, creditPulls: 0, emptyPulls: 0, rails: emptyRails() };
  let unpriced = 0;

  for (const log of alleyLogs) {
    const machine = log.topics[3];
    const railIdx = Number(word(log.data, 0));
    const cents = Number(word(log.data, 2));
    const paid = cents / 100;
    const day = dates.utcIsoFromTs(blockTime.at(parseInt(log.blockNumber, 16)));
    if (!day || !(paid > 0)) continue;
    const rail = ALLEY_RAILS[railIdx] || "other";
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

  for (const log of clawLogs) {
    if (rescued.has(log.topics[1])) continue;
    const cash = word(log.data, 1);
    const wall = word(log.data, 2);
    const weth = word(log.data, 3);
    const credit = word(log.data, 4);
    const day = dates.utcIsoFromTs(blockTime.at(parseInt(log.blockNumber, 16)));
    if (!day) continue;

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
      continue;
    }
    if (!(paid > 0)) {
      claw.emptyPulls += 1;
      continue;
    }
    claw.pulls += 1;
    claw.usd += paid;
    bump(days, day, "claw", paid);
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
      if (!days.has(key)) days.set(key, { alley: 0, claw: 0 });
    }
  }

  const historyDates = filled;
  const historyAlley = historyDates.map((d) => usd(days.get(d).alley));
  const historyClaw = historyDates.map((d) => usd(days.get(d).claw));
  const historyUsd = historyDates.map((_, i) => usd(historyAlley[i] + historyClaw[i]));

  alley.usd = usd(alley.usd);
  claw.usd = usd(claw.usd);
  const machineRows = [...machines.values()]
    .map((m) => ({ ...m, usd: usd(m.usd) }))
    .sort((a, b) => b.usd - a.usd || b.pulls - a.pulls);

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
  };
}

module.exports = {
  ALLEY,
  CLAW,
  ALLEY_PULL,
  CLAW_PULL,
  fetchGachaRevenue,
};
