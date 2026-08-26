// Domain reads on top of the raw RPC client.
//
// Everything here replaces a metered Blockscout Pro endpoint with the free
// equivalent the chain already answers:
//
//   module=stats&action=tokensupply      ->  eth_call totalSupply()
//   module=account&action=tokenbalance   ->  eth_call balanceOf(addr)
//   module=logs&action=getLogs           ->  eth_getLogs
//   module=block&action=eth_block_number ->  eth_blockNumber
//   module=account&action=tokentx        ->  eth_getLogs on Transfer topics
//
// The ones with NO chain equivalent, still on Blockscout, are holder COUNTS
// (getTokenHolders) and native-ETH movement (txlist / txlistinternal). Those
// need an index built from replayed Transfer logs and a trace API the node
// does not expose -- both are follow-on work, not part of this pass.

const {
  SEL,
  TOPIC,
  addrTopic,
  encodeAddr,
  decodeUint,
  topicAddr,
} = require("./rpc.cjs");

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

const isNullAddr = (a) => !a || a.toLowerCase() === ZERO;

/**
 * totalSupply + burn-address balances for many tokens, in one batched pass.
 *
 * Replaces two metered calls PER TOKEN (tokensupply + tokenbalance) with a
 * single batched eth_call set. For the 30-token meme+stock list that is 60
 * credits -> ~3 free http requests.
 *
 * A reverted call yields null, which the caller must distinguish from zero:
 * a token whose supply read failed is not a token with no supply.
 */
async function tokenStats(rpc, tokens) {
  const list = tokens.filter((t) => !isNullAddr(t));
  const calls = [];
  for (const t of list) {
    calls.push({ to: t, data: SEL.totalSupply });
    calls.push({ to: t, data: SEL.balanceOf + encodeAddr(DEAD) });
    calls.push({ to: t, data: SEL.balanceOf + encodeAddr(ZERO) });
  }
  const raw = await rpc.calls(calls);

  const out = new Map();
  list.forEach((t, i) => {
    out.set(t.toLowerCase(), {
      supply: decodeUint(raw[i * 3]),
      dead: decodeUint(raw[i * 3 + 1]),
      zero: decodeUint(raw[i * 3 + 2]),
    });
  });
  return out;
}

/** balanceOf for arbitrary (token, holder) pairs, batched. null = call failed. */
async function balancesOf(rpc, pairs) {
  const raw = await rpc.calls(
    pairs.map((p) => ({
      to: p.token,
      data: SEL.balanceOf + encodeAddr(p.holder),
    })),
  );
  return raw.map((r) => decodeUint(r));
}

/** decimals() for many tokens, batched. Defaults to 18 when the call reverts. */
async function decimalsOf(rpc, tokens) {
  const list = [...new Set(tokens.map((t) => t.toLowerCase()))];
  const raw = await rpc.calls(list.map((t) => ({ to: t, data: SEL.decimals })));
  const out = new Map();
  list.forEach((t, i) => {
    const d = decodeUint(raw[i]);
    out.set(t, d === null ? 18 : Number(d));
  });
  return out;
}

/**
 * Logs for a contract, shaped to match what Blockscout's getLogs returned.
 *
 * The one field raw eth_getLogs does not carry is `timeStamp` -- this node
 * returns `blockTimestamp` as 0x0 -- and the activation parser downstream
 * depends on it. Reading one block per log is what the public endpoint refuses
 * to serve at volume, so timestamps come from the shared interpolation table
 * instead. See lib/blocktime.js for the measured accuracy.
 */
async function fetchLogsWithTimestamps(rpc, filter, label, blockTime) {
  const logs = await rpc.getLogs(filter, (to, end, n) => {
    if (label) process.stdout.write(`\r    ${label}: block ${to}/${end}, ${n} logs   `);
  });
  if (label) process.stdout.write(`\r    ${label}: ${logs.length} logs`.padEnd(60) + "\n");

  return logs.map((l) => {
    const bn = parseInt(l.blockNumber, 16);
    return {
      ...l,
      blockNumber: bn,
      logIndex: parseInt(l.logIndex, 16),
      transactionIndex: parseInt(l.transactionIndex, 16),
      timeStamp: blockTime ? blockTime.at(bn) : 0,
    };
  });
}

/**
 * ERC-20 Transfer events, filtered on-node by sender and/or recipient.
 *
 * This is the replacement for module=account&action=tokentx, and it is where
 * the largest saving sits. The old code walked one PAGED query per token per
 * wallet -- 17 tokens against the oracle wallet was 17+ metered requests, each
 * returning every transfer that wallet ever made so the script could throw
 * away the ones from the wrong sender.
 *
 * Topic filtering does that same selection on the node: positions AND together
 * while an array WITHIN a position ORs. So "from ANY protocol contract AND to
 * the oracle wallet, across all 17 tokens" is expressible as a single filter,
 * and only matching logs are ever sent over the wire.
 */
async function erc20Transfers(rpc, { tokens, from, to, fromBlock, toBlock, label, blockTime }) {
  const topics = [TOPIC.transfer];
  topics.push(from ? (Array.isArray(from) ? from : [from]).map(addrTopic) : null);
  topics.push(to ? (Array.isArray(to) ? to : [to]).map(addrTopic) : null);
  while (topics.length && topics[topics.length - 1] === null) topics.pop();

  const logs = await fetchLogsWithTimestamps(
    rpc,
    {
      address: tokens && tokens.length ? tokens : undefined,
      fromBlock,
      toBlock,
      topics: topics.length > 1 ? topics : [TOPIC.transfer],
    },
    label,
    blockTime,
  );

  const dec = await decimalsOf(rpc, logs.map((l) => l.address));
  return logs.map((l) => {
    const raw = decodeUint(l.data) ?? 0n;
    const d = dec.get(l.address.toLowerCase()) ?? 18;
    return {
      token: l.address.toLowerCase(),
      from: topicAddr(l.topics[1]),
      to: topicAddr(l.topics[2]),
      amount: Number(raw) / Math.pow(10, d),
      timeStamp: l.timeStamp,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
    };
  });
}

module.exports = {
  ZERO,
  DEAD,
  isNullAddr,
  tokenStats,
  balancesOf,
  decimalsOf,
  fetchLogsWithTimestamps,
  erc20Transfers,
  TOPIC,
};
