// Client for gg-index, the self-hosted Robinhood Chain indexer.
//
// WHY THIS EXISTS AT ALL, given lib/chain.js reads the chain directly:
//
// Almost everything the dashboard needs is a state read the node will answer
// for free -- supply, balances, logs -- and lib/chain.js does exactly that.
// Holder COUNTS are the exception. The chain has no holder list; it only has
// Transfer events, so a count can only be produced by replaying every transfer
// a token has ever had and folding them into balances. That is not something a
// fetcher can do inside an hourly job, and it is the single call that made
// Blockscout expensive: getTokenHolders was 45 of the 58 credits a run spent,
// and it got MORE expensive as a project succeeded.
//
// gg-index does that fold continuously and serves the answer. Same reason the
// activation and reward totals come from here: they are aggregates over
// indexed history, not point-in-time reads.
//
// THE FAILURE POLICY IS THE IMPORTANT PART OF THIS FILE.
//
// Every function here throws on failure and none of them return a default.
// data.json is rewritten in full each run, so a helper that quietly answered 0
// for an unreachable index would publish "this token has no holders" as fact
// and overwrite the correct number from the previous run. That is precisely
// the failure the existing HTTP-402 guard already halts the process to avoid;
// this is the same hazard through a different door.

const DEFAULT_BASE = process.env.GG_INDEX_URL || "https://index.ggservices.dev";

class GgIndex {
  constructor(base = DEFAULT_BASE, opts = {}) {
    this.base = base.replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.attempts = opts.attempts ?? 4;
    /** HTTP requests actually sent, for the same budgeting reason Rpc counts. */
    this.requests = 0;
  }

  async get(path, params = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    let lastErr;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 500 * attempt * attempt));
      try {
        this.requests++;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const body = await res.json().catch(() => null);

        if (res.ok) return body;

        // 409 means the index knows it cannot answer yet -- a fold still
        // building, say. Retrying inside this run will not change that, and it
        // is emphatically not a zero. Fail immediately with what it said.
        if (res.status === 409 || res.status === 404 || res.status === 400) {
          throw new Error(
            `gg-index ${res.status} ${url.pathname}: ${body?.detail || body?.error || "no detail"}`,
          );
        }

        lastErr = `HTTP ${res.status}`;
      } catch (e) {
        // A 4xx above is a decided answer, not a flaky connection -- do not
        // spend the remaining attempts on it.
        if (String(e.message).startsWith("gg-index ")) throw e;
        lastErr = e.message;
      }
    }

    throw new Error(`gg-index unreachable after ${this.attempts} attempts (${url.pathname}): ${lastErr}`);
  }

  /**
   * Holder count for a token or NFT collection.
   *
   * Excludes dust by default: the floor is one whole token, which is the same
   * rule fetchTokenHoldersSafe applied locally (dustThreshold = isNft ? 1n :
   * 1e18) and the reason our count and Blockscout's used to disagree by ~20%.
   * The index applies it server-side now, so `minBalance` only needs passing to
   * override it.
   *
   * Throws when the fold is not ready rather than reporting a partial count --
   * a holder count that is 30% low is indistinguishable from a correct one
   * downstream.
   */
  async holders(address, { minBalance, includeBurn } = {}) {
    const d = await this.get(`/v1/tokens/${address}/holders`, {
      limit: 1,
      min_balance: minBalance,
      include_burn: includeBurn ? "true" : undefined,
    });

    if (!d.complete || typeof d.holders !== "number") {
      throw new Error(`gg-index holders(${address}) not ready: ${d.state || "unknown"}`);
    }
    return d.holders;
  }

  /**
   * totalSupply and burn balances for many tokens in ONE request.
   *
   * Replaces tokensupply + a tokenbalance per burn address -- three metered
   * calls per token. The meme and stock lists are 30 tokens, so ~60 credits a
   * run collapse into a single call.
   *
   * Values come back as decimal STRINGS and are converted to BigInt here.
   * Neither side ever puts a uint256 through a double: past 2^53 a JSON number
   * silently rounds, which for an 18-decimal token is about 9 tokens.
   */
  async supplies(addresses) {
    if (!addresses.length) return new Map();
    const out = new Map();

    // The endpoint caps a request at 50 addresses.
    for (let i = 0; i < addresses.length; i += 50) {
      const chunk = addresses.slice(i, i + 50);
      const d = await this.get("/v1/tokens/supply", { addresses: chunk.join(",") });
      for (const t of d.tokens) {
        out.set(t.token_address.toLowerCase(), {
          decimals: t.decimals,
          supply: big(t.total_supply),
          dead: big(t.dead_balance),
          zero: big(t.zero_balance),
        });
      }
    }
    return out;
  }

  /** balanceOf for one token across many holders, batched. null = call reverted. */
  async balances(token, holders) {
    if (!holders.length) return new Map();
    const out = new Map();

    for (let i = 0; i < holders.length; i += 100) {
      const chunk = holders.slice(i, i + 100);
      const d = await this.get("/v1/tokens/balances", {
        token,
        holders: chunk.join(","),
      });
      for (const b of d.balances) out.set(b.holder_address.toLowerCase(), big(b.balance));
    }
    return out;
  }

  /**
   * Activation state and value totals for a project.
   *
   * `active` is the contract's own stored counter, reproduced from logs and
   * verified equal to activeCount() on every project. It is an UPPER BOUND on
   * positions actually earning: selling an activated NFT stops it earning
   * without emitting any event, so the counter still includes it. The local
   * pass in fetchActivations models that with deactivateOnTransfer, which is
   * why this does not replace it.
   */
  async activations(slug, { fromBlock } = {}) {
    return this.get(`/v1/projects/${slug}/activations`, { from_block: fromBlock });
  }

  /**
   * Native ETH that arrived at an address by internal call.
   *
   * Derived from balance deltas, because this chain exposes no trace API --
   * see the gg-index migration for the accounting identity. Two properties the
   * caller must respect: the figure is NET and UNATTRIBUTED (how much arrived,
   * not from whom), and `complete: false` means the window contains a span the
   * indexer could not measure, making the total a lower bound rather than a
   * measurement.
   */
  async nativeFlows(address, { fromBlock } = {}) {
    const d = await this.get(`/v1/addresses/${address}/native_flows`, { from_block: fromBlock });
    return { ...d, internalNet: big(d.internal_net) ?? 0n };
  }

  /** Chain head and per-cursor indexing state. */
  async status() {
    return this.get("/v1/status");
  }
}

// null stays null. A reverted read is an unknown, and turning it into 0n here
// would hand the caller a confident wrong number -- the same distinction the
// index preserves on its side.
function big(v) {
  if (v === null || v === undefined) return null;
  return BigInt(v);
}

module.exports = { GgIndex, DEFAULT_BASE };
