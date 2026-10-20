// NFT flow through an Anvil AMM vault, plus the ETH fee charged on each trade.
//
// Inventory snapshots only show the stock. A day that gains 57 NFTs can be
// 66 sold in and 9 bought out. Those are ERC-721 transfers to and from the
// vault. The fee is the ETH leg on the vault's own trade log: the first word
// is the token amount (666,666 on a full seat) and the second is the ETH
// charged. A reserve sync log is two ETH-sized words and is skipped.

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOKEN_MIN = 1000n * 10n ** 18n;
const ETH_MAX = 500n * 10n ** 18n;

function padTopic(addr) {
  return `0x${String(addr).toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

function words(data) {
  const hex = String(data || '').replace(/^0x/, '');
  const out = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) out.push(BigInt(`0x${hex.slice(i, i + 64)}`));
  return out;
}

function feeEthOf(log) {
  const w = words(log.data);
  if (w.length < 2) return 0;
  if (w[0] < TOKEN_MIN || w[1] <= 0n || w[1] > ETH_MAX) return 0;
  return Number(w[1]) / 1e18;
}

function dayOf(blockTime, blockHex) {
  const block = parseInt(blockHex, 16);
  if (!Number.isFinite(block)) return '';
  const ts = blockTime.at(block);
  if (!ts) return '';
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function add(map, day, n) {
  if (!day || !(n > 0)) return;
  map.set(day, (map.get(day) || 0) + n);
}

/**
 * @returns {{ dates: string[], entered: number[], left: number[], feeEth: number[] }}
 */
async function walkAmmFlow({ rpc, blockTime, nft, amm, fromBlock, toBlock, onProgress }) {
  const nftAddr = String(nft).toLowerCase();
  const ammAddr = String(amm).toLowerCase();
  const pad = padTopic(ammAddr);
  const entered = new Map();
  const left = new Map();
  const fee = new Map();

  const bucket = (logs, into) => {
    for (const log of logs || []) {
      const day = dayOf(blockTime, log.blockNumber);
      if (into === 'fee') add(fee, day, feeEthOf(log));
      else add(into === 'in' ? entered : left, day, 1);
    }
  };

  const span = { address: nftAddr, fromBlock, toBlock };
  bucket(await rpc.getLogs({ ...span, topics: [TRANSFER, null, pad] }, onProgress), 'in');
  bucket(await rpc.getLogs({ ...span, topics: [TRANSFER, pad, null] }, onProgress), 'out');
  bucket(await rpc.getLogs({ address: ammAddr, fromBlock, toBlock }, onProgress), 'fee');

  const days = [...new Set([...entered.keys(), ...left.keys(), ...fee.keys()])].sort();
  if (!days.length) return { dates: [], entered: [], left: [], feeEth: [] };
  const start = Date.parse(`${days[0]}T00:00:00Z`);
  const end = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  const dates = [];
  for (let t = start; t <= end; t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  return {
    dates,
    entered: dates.map((d) => entered.get(d) || 0),
    left: dates.map((d) => left.get(d) || 0),
    feeEth: dates.map((d) => +(fee.get(d) || 0).toFixed(6)),
  };
}

function mergeAmmFlow(prev, next) {
  const map = new Map();
  const take = (flow) => {
    (flow?.dates || []).forEach((day, i) => {
      map.set(day, {
        entered: Number(flow.entered?.[i]) || 0,
        left: Number(flow.left?.[i]) || 0,
        feeEth: Number(flow.feeEth?.[i]) || 0,
      });
    });
  };
  take(prev);
  take(next);
  const dates = [...map.keys()].sort();
  return {
    dates,
    entered: dates.map((d) => map.get(d).entered),
    left: dates.map((d) => map.get(d).left),
    feeEth: dates.map((d) => +map.get(d).feeEth.toFixed(6)),
  };
}

module.exports = { walkAmmFlow, mergeAmmFlow, feeEthOf };
