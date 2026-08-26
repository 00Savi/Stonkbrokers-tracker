// Block number -> unix timestamp, without reading every block.
//
// THE PROBLEM: raw eth_getLogs does not carry a usable timestamp. This node
// returns the `blockTimestamp` field but leaves it at 0x0, so the only exact
// source is eth_getBlockByNumber -- one call per block. Stonk alone touches
// 2,672 distinct blocks, and the public endpoint rate-limits batched block
// reads hard enough that resolving them took over half an hour and still
// failed most requests. Doing that for four projects every hour is not viable.
//
// THE APPROACH: anchor and interpolate. Robinhood Chain produces blocks at a
// near-constant rate -- measured across its entire 29M-block history, every
// 1M-block segment ran between 9.95 and 10.03 blocks/sec. So a sparse table of
// exact (block, timestamp) pairs plus linear interpolation between them
// reconstructs any block's time to within seconds.
//
// MEASURED ACCURACY: with anchors every 1,000,000 blocks, interpolation error
// against 25 independently fetched true timestamps was mean 13s, max 46s. This
// module anchors every 250,000 blocks -- 4x denser -- so the expected bound is
// ~12s. Everything downstream buckets by day or by 24h/7d/30d windows, where a
// sub-minute error only matters for an event landing within seconds of a
// boundary. verify() re-measures this against live truth so the claim stays
// honest rather than inherited.
//
// The table is shared by every project (it describes the CHAIN, not a
// contract), extends as the chain grows, and is a few KB on disk.

const fs = require("fs");
const path = require("path");

const ANCHOR_STEP = 250_000;
const CACHE_FILE = "cache/blocktime.json";

class BlockTime {
  constructor() {
    this.anchors = []; // sorted [block, ts] pairs
  }

  load() {
    try {
      const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      if (Array.isArray(c.anchors)) this.anchors = c.anchors;
    } catch (e) {}
    return this;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ step: ANCHOR_STEP, anchors: this.anchors }));
    } catch (e) {}
  }

  has(block) {
    return this.anchors.some(([b]) => b === block);
  }

  /**
   * Make sure the table spans [from, to], fetching only the anchors missing.
   *
   * On a warm cache this is the cheap path an hourly run takes: the chain
   * advances ~36k blocks per hour, so most runs add zero or one anchor.
   */
  async ensureRange(rpc, from, to, onProgress) {
    const want = [];
    const start = Math.floor(from / ANCHOR_STEP) * ANCHOR_STEP;
    for (let b = Math.max(start, 1); b <= to; b += ANCHOR_STEP) {
      if (!this.has(b)) want.push(b);
    }
    // Always pin the exact upper end, so the newest events interpolate between
    // two real anchors instead of extrapolating past the last one.
    if (!this.has(to)) want.push(to);

    if (!want.length) return this;

    for (let i = 0; i < want.length; i += 25) {
      const chunk = want.slice(i, i + 25);
      const ts = await rpc.blockTimestamps(chunk);
      for (const b of chunk) {
        const t = ts.get(b);
        if (t) this.anchors.push([b, t]);
      }
      if (onProgress) onProgress(Math.min(i + 25, want.length), want.length);
    }
    this.anchors.sort((a, b) => a[0] - b[0]);
    this.save();
    return this;
  }

  /** Interpolated timestamp for a block. 0 if the table is empty. */
  at(block) {
    const a = this.anchors;
    if (!a.length) return 0;
    if (block <= a[0][0]) return a[0][1];
    if (block >= a[a.length - 1][0]) return a[a.length - 1][1];

    // Binary search for the bracketing pair.
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid][0] <= block) lo = mid;
      else hi = mid;
    }
    const [b0, t0] = a[lo], [b1, t1] = a[hi];
    if (b1 === b0) return t0;
    return Math.round(t0 + ((t1 - t0) * (block - b0)) / (b1 - b0));
  }

  /**
   * The inverse of at(): roughly which block a unix timestamp falls in.
   *
   * Needed to turn "seven days ago" into a fromBlock, because the index filters
   * by block and the dashboard buckets by day. Interpolating the same anchor
   * table both directions keeps the two consistent -- deriving it from an
   * assumed 10 blocks/sec instead would drift about an hour over a week, which
   * for daily buckets misplaces a whole evening of events.
   *
   * Clamps to the ends of the table, so a timestamp before the first anchor
   * gives the first block rather than a negative one.
   */
  blockAt(ts) {
    const a = this.anchors;
    if (!a.length) return 0;
    if (ts <= a[0][1]) return a[0][0];
    if (ts >= a[a.length - 1][1]) return a[a.length - 1][0];

    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid][1] <= ts) lo = mid;
      else hi = mid;
    }
    const [b0, t0] = a[lo], [b1, t1] = a[hi];
    if (t1 === t0) return b0;
    return Math.round(b0 + ((b1 - b0) * (ts - t0)) / (t1 - t0));
  }

  /**
   * Re-measure interpolation error against blocks fetched fresh from the node.
   *
   * The accuracy claim in this file's header is only worth what a live check
   * says it is, so a run reports the real number rather than trusting a
   * comment. Cheap: one batch.
   */
  async verify(rpc, sampleBlocks) {
    if (!sampleBlocks.length) return null;
    const sample = sampleBlocks.slice(0, 25);
    const truth = await rpc.blockTimestamps(sample);
    let max = 0, sum = 0, n = 0;
    for (const b of sample) {
      const t = truth.get(b);
      if (!t) continue;
      const err = Math.abs(this.at(b) - t);
      max = Math.max(max, err);
      sum += err;
      n++;
    }
    return n ? { n, meanSec: +(sum / n).toFixed(1), maxSec: max } : null;
  }
}

module.exports = { BlockTime, ANCHOR_STEP };
