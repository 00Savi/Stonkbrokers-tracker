// Minimal JSON-RPC client for Robinhood Chain, with batching + backoff.
//
// WHY THIS EXISTS: every read in this file is answered by the chain's own
// public RPC, which is free and unmetered. The Blockscout Pro API charges a
// credit per request for the same data. Anything the chain can answer
// directly -- balances, supplies, logs, block timestamps -- belongs here.
//
// The public endpoint rate-limits hard. Measured sustainable settings against
// rpc.mainnet.chain.robinhood.com: batches of 20 with ~320ms spacing, backing
// off further after a 429. A batch of N eth_calls is ONE http request.

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Upstream/network hiccups worth retrying, as opposed to real RPC errors like
 *  a revert or a bad parameter, which will never succeed no matter how often
 *  we ask.
 *
 *  Robinhood's public URL is a proxy. Failures often surface as Go errors from
 *  an internal `10.x:8547` backend -- `context deadline exceeded`, `no route
 *  to host` -- inside a JSON-RPC error on HTTP 200. Those used to miss this
 *  regex (`connection` does not match `connect:`), so getLogs treated them as
 *  fatal and the project was carried forward. */
const TRANSIENT =
  /EOF|timeout|timed out|deadline|too many requests|429|408|500|502|503|504|connect|no route|ehostunreach|econnrefused|econnreset|temporarily|try again|reset by peer|unavailable|rate/i;
const isTransient = (msg) => TRANSIENT.test(String(msg));

/** The range was too wide. getLogs must SPLIT, not retry the same window.
 *  sendBatch must also return these to the caller instead of burning retries. */
const RANGE_TIMEOUT = /timeout|timed out|deadline|query timed/i;
const NARROWABLE =
  /exceeds limit|too many results|response size|query returned more than|limit of \d+/i;
const shouldSplit = (msg) => {
  const s = String(msg);
  return NARROWABLE.test(s) || RANGE_TIMEOUT.test(s);
};
const isNarrowable = (msg) => shouldSplit(msg) || isTransient(msg);

class Rpc {
  constructor(url = RPC_URL, opts = {}) {
    this.url = url;
    this.batchSize = opts.batchSize ?? 20;
    this.spacingMs = opts.spacingMs ?? 320;
    this.id = 0;
    /** HTTP requests actually sent. A batched set of 25 eth_calls counts as
     *  ONE, which is how providers meter it. This is the budget number. */
    this.requests = 0;
  }

  throttle(reason) {
    this.spacingMs = Math.min(2_000, this.spacingMs + 200);
    if (reason) {
      console.warn(`[warn] rpc ${reason}; spacing now ${this.spacingMs}ms`);
    }
  }

  async sendBatch(reqs) {
    const body = reqs.map((r) => ({ jsonrpc: "2.0", id: ++this.id, ...r }));
    let lastErr = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt) {
        const rate = /429|too many requests/i.test(lastErr);
        await sleep(rate ? 3_000 * attempt : 700 * attempt * attempt);
      }
      try {
        this.requests++;
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) {
          lastErr = `HTTP ${res.status}`;
          if (!isTransient(lastErr) && res.status !== 408) break;
          if (res.status === 429) this.throttle("429");
          continue;
        }
        let parsed;
        try {
          parsed = await res.json();
        } catch {
          lastErr = `HTTP ${res.status} non-json`;
          continue;
        }
        // A rate-limited batch comes back as a single error OBJECT rather than
        // an array. That shape difference is the retry signal.
        if (Array.isArray(parsed)) {
          // One-call batches (getLogs) can succeed at HTTP layer with a
          // transient backend error in the item. Retry those here. Range-
          // too-wide errors must NOT be retried -- getLogs needs to split.
          if (
            parsed.length === 1 &&
            parsed[0].error &&
            isTransient(parsed[0].error.message) &&
            !shouldSplit(parsed[0].error.message)
          ) {
            lastErr = parsed[0].error.message;
            continue;
          }
          return parsed;
        }
        lastErr = parsed?.error?.message || "non-array response";
        if (shouldSplit(lastErr) && reqs.length === 1) {
          return [{ jsonrpc: "2.0", id: body[0].id, error: { message: lastErr } }];
        }
        if (!isTransient(lastErr)) break;
        if (/429|too many requests/i.test(lastErr)) this.throttle("429");
      } catch (e) {
        lastErr = e.name === "TimeoutError" || e.name === "AbortError"
          ? "timeout"
          : e.message;
        if (shouldSplit(lastErr) && reqs.length === 1) {
          return [{ jsonrpc: "2.0", id: body[0].id, error: { message: lastErr } }];
        }
      }
    }
    throw new Error(`rpc batch failed (${reqs.length} calls): ${lastErr}`);
  }

  /** Single request. Returns the raw result, or throws on a hard error. */
  async send(method, params) {
    const [r] = await this.sendBatch([{ method, params }]);
    if (r.error) throw new Error(`${method}: ${r.error.message}`);
    return r.result;
  }

  /** Same, but a hard error returns null instead of throwing. */
  async trySend(method, params) {
    try {
      return await this.send(method, params);
    } catch {
      return null;
    }
  }

  async blockNumber() {
    return parseInt(await this.send("eth_blockNumber", []), 16);
  }

  /**
   * eth_call many targets at once.
   *
   * Returns '0x' for any call that reverted, so callers MUST treat an empty
   * result as "unknown" and never as zero. Silently reading a revert as 0 is
   * how a burn balance or a supply quietly becomes wrong.
   */
  async calls(list) {
    const out = [];
    for (let i = 0; i < list.length; i += this.batchSize) {
      if (i && this.spacingMs) await sleep(this.spacingMs);
      const chunk = list.slice(i, i + this.batchSize);
      const res = await this.sendBatch(
        chunk.map((c) => ({
          method: "eth_call",
          params: [{ to: c.to, data: c.data }, "latest"],
        })),
      );
      // Batch responses are not order-guaranteed; re-key by id.
      const byId = new Map(res.map((r) => [r.id, r.error ? "0x" : r.result]));
      const ids = res.map((r) => r.id).sort((a, b) => a - b);
      for (const id of ids) out.push(byId.get(id) ?? "0x");
    }
    return out;
  }

  /**
   * eth_getLogs over an arbitrarily wide range, splitting adaptively.
   *
   * Two distinct failure modes, both handled by narrowing rather than by
   * retrying: the node times out on a range that spans too many blocks, and it
   * silently truncates at 10,000 results. A truncated page is indistinguishable
   * from a complete one, so hitting the cap is treated as a failure and the
   * range is split -- returning 10,000 of 14,000 logs would be a wrong answer
   * wearing the costume of a right one.
   *
   * `address` may be an array: one request can cover every project at once.
   * `topics` may nest arrays for OR-matching within a position, which is what
   * makes "from ANY protocol contract AND to the oracle wallet" a single call.
   */
  async getLogs({ address, fromBlock, toBlock, topics }, onProgress) {
    const RESULT_CAP = 10000;
    const out = [];
    let step = 1_000_000; // 2M often hits the proxy's deadline on a cold scan.
    let from = fromBlock;
    let windowTries = 0;

    while (from <= toBlock) {
      const to = Math.min(from + step, toBlock);
      const filter = {
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
      };
      if (address) filter.address = address;
      if (topics) filter.topics = topics;

      let logs = null;
      let errMsg = "";
      try {
        const [r] = await this.sendBatch([
          { method: "eth_getLogs", params: [filter] },
        ]);
        if (!r.error) logs = r.result;
        else errMsg = r.error.message || "rpc error";
      } catch (e) {
        errMsg = e.message;
      }

      if (logs == null) {
        if (shouldSplit(errMsg) || !errMsg) {
          if (step <= 1000) {
            throw new Error(
              `getLogs: cannot narrow below ${step} blocks at ${from} (${errMsg || "node error"})`,
            );
          }
          step = Math.floor(step / 2);
          windowTries = 0;
          continue;
        }
        if (isTransient(errMsg) && windowTries < 8) {
          windowTries++;
          await sleep(Math.min(20_000, 1_500 * windowTries * windowTries));
          continue;
        }
        throw new Error(errMsg || "getLogs failed");
      }

      if (logs.length >= RESULT_CAP) {
        if (step <= 1000) {
          throw new Error(
            `getLogs: cannot narrow below ${step} blocks at ${from} (${logs.length} logs, at cap)`,
          );
        }
        step = Math.floor(step / 2);
        windowTries = 0;
        continue;
      }

      out.push(...logs);
      windowTries = 0;
      if (onProgress) onProgress(to, toBlock, out.length);
      from = to + 1;
      if (logs.length < RESULT_CAP / 4) step = Math.min(2_000_000, step * 2);
      if (from <= toBlock && this.spacingMs) await sleep(this.spacingMs);
    }
    return out;
  }

  /**
   * Unix timestamps for a set of block numbers, batched.
   *
   * Blockscout's getLogs returns a timeStamp on every log; raw eth_getLogs
   * does not. Activation events cluster into far fewer distinct blocks than
   * there are events, so resolving block->timestamp separately is cheap.
   */
  async blockTimestamps(blockNumbers, onProgress) {
    const uniq = [...new Set(blockNumbers)];
    const ts = new Map();
    for (let i = 0; i < uniq.length; i += this.batchSize) {
      if (i && this.spacingMs) await sleep(this.spacingMs);
      const chunk = uniq.slice(i, i + this.batchSize);
      const res = await this.sendBatch(
        chunk.map((n) => ({
          method: "eth_getBlockByNumber",
          params: ["0x" + n.toString(16), false],
        })),
      );
      const byId = new Map(res.map((r) => [r.id, r.error ? null : r.result]));
      const ids = res.map((r) => r.id).sort((a, b) => a - b);
      ids.forEach((id, k) => {
        const b = byId.get(id);
        if (b && b.timestamp) ts.set(chunk[k], parseInt(b.timestamp, 16));
      });
      if (onProgress) onProgress(Math.min(i + this.batchSize, uniq.length), uniq.length);
    }
    return ts;
  }
}

// --- ABI helpers (hand-rolled; these are all we need, so no ethers round-trip) ---

const padHex = (h) => {
  const s = typeof h === "string" ? h.replace(/^0x/, "") : h.toString(16);
  return s.toLowerCase().padStart(64, "0");
};

const encodeUint = (n) => padHex(n);
const encodeAddr = (a) => padHex(String(a).replace(/^0x/, ""));

const decodeUint = (hex, wordIndex = 0) => {
  if (!hex || hex === "0x") return null; // reverted -> unknown, NOT zero
  const body = hex.replace(/^0x/, "");
  const start = wordIndex * 64;
  if (body.length < start + 64) return null;
  return BigInt("0x" + body.slice(start, start + 64));
};

/** Last 20 bytes of a 32-byte word, as a 0x-prefixed lowercase address. */
const decodeAddr = (word) => {
  if (!word || word.length < 42) return null;
  return ("0x" + word.slice(-40)).toLowerCase();
};

/** A topic word back to an address (indexed address params are left-padded). */
const topicAddr = (t) => (t ? ("0x" + t.slice(-40)).toLowerCase() : null);

/** An address as a 32-byte topic, for filtering indexed address params. */
const addrTopic = (a) => "0x" + encodeAddr(a);

// Function selectors (verified with `cast sig`).
const SEL = {
  totalSupply: "0x18160ddd", // totalSupply() -> uint256
  balanceOf: "0x70a08231", // balanceOf(address) -> uint256
  decimals: "0x313ce567", // decimals() -> uint8
};

// Event topic0 hashes (verified with `cast keccak`).
const TOPIC = {
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  // Activated(uint256,address,uint8,uint256)
  activated: "0x4e4f107f0e9557eb4a56fbc0e0697242ee73b7aa9002ceb8c344bdaf2f5d0930",
  // ActivationUpgraded(uint256,address,uint8,uint8,uint256)
  upgraded: "0xc2bd0116c910da39fbbacb69cc1d0cfa037c1aa3821d99a23ae3d50f9adf7801",
  // ActivationCleared(uint256)
  cleared: "0x1ec7e08b83dd8db7b367b87bb54bc02469cefa6a01529922cd0f216c45352dd9",
};

module.exports = {
  Rpc,
  RPC_URL,
  sleep,
  isTransient,
  isNarrowable,
  shouldSplit,
  padHex,
  encodeUint,
  encodeAddr,
  decodeUint,
  decodeAddr,
  topicAddr,
  addrTopic,
  SEL,
  TOPIC,
};
