// Browser-side reads from gg-index.
//
// `data.json` stays the base payload. This overlays the parts the index can
// answer authoritatively, which are exactly the parts Blockscout got wrong.
//
// Blockscout's holder endpoint is paged and silently returns a short page, and
// a truncated page is indistinguishable from a complete one — so the walk ends
// early and publishes a partial count as a final answer. Measured on one run:
// 11,997 reported against a true 23,589. It is intermittent, which is worse
// than being consistently wrong, because the number looks plausible either way.
// gg-index folds Transfer events into a balance table instead, so its count
// reconciles against `totalSupply()` with difference 0.
//
// Activation is a different story. The index reproduces the contract's
// `activeCount()`, which is an upper bound: a sale can stop a position
// earning without an event, so the counter still includes it. The hourly
// fetcher already models that with deactivateOnTransfer. Overlaying `active`
// here used to undo that pass (and disagreed with lib/ggindex.cjs, which
// refuses to replace the local count). Holders still come from the index.
// Activation stays on the snapshot.

const BASE = (import.meta.env?.VITE_GG_INDEX_URL || 'https://index.ggservices.dev').replace(/\/+$/, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with a short retry.
 *
 * The retry is for connection failures, not slow answers — every endpoint used
 * here returns in under two seconds, but opening several sockets at once to the
 * same host drops one often enough to matter (measured: 1-2 of 9 parallel
 * requests failing to connect on every run from Node). A browser multiplexes
 * these over one HTTP/2 connection and should rarely see it, which is exactly
 * why it needs handling: a failure that only appears sometimes, somewhere, is
 * the kind that ships.
 *
 * A 4xx is not retried. The server understood the question and answered it —
 * asking again produces the same response and just delays the page.
 */
async function get(path, signal, attempts = 3) {
  let lastErr;

  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(250 * i * i);
    try {
      const res = await fetch(`${BASE}/v1${path}`, { signal });
      if (res.ok) return res.json();
      const err = new Error(`gg-index ${path} -> ${res.status}`);
      if (res.status >= 400 && res.status < 500) throw err;
      lastErr = err;
    } catch (e) {
      if (signal?.aborted || String(e.message).includes('-> 4')) throw e;
      lastErr = e;
    }
  }

  throw lastErr;
}

const addressOfKind = (contracts, kind) =>
  contracts.find((c) => c.kind === kind)?.address || null;

// `limit=1` because only the count is wanted here. Without it the response
// carries the top 100 balances, which is a payload the dashboard never reads.
async function holderCount(address, signal) {
  if (!address) return null;
  const { holders } = await get(`/tokens/${address}/holders?limit=1`, signal);
  return typeof holders === 'number' ? holders : null;
}

async function projectPatch(project, signal) {
  const { slug, contracts = [] } = project;
  const patch = {};

  const [tokenHolders, nftHolders] = await Promise.all([
    holderCount(addressOfKind(contracts, 'token'), signal),
    holderCount(addressOfKind(contracts, 'nft'), signal),
  ]);

  const ownership = {};
  if (tokenHolders !== null) {
    // Views read this under several names depending on the project
    // (`stonkHolders`, `mancerHolders`, a generic `tokenHolders`). Setting all
    // of them keeps whichever alias a view happens to reach for consistent,
    // rather than leaving one of them holding the stale Blockscout figure.
    ownership.tokenHolders = tokenHolders;
    ownership.erc20Holders = tokenHolders;
    ownership[`${slug}Holders`] = tokenHolders;
    if (slug === 'tickeryard') ownership.yardHolders = tokenHolders;
    if (slug === 'cardwall') ownership.wallHolders = tokenHolders;
  }
  if (nftHolders !== null) ownership.nftHolders = nftHolders;
  if (Object.keys(ownership).length) patch.ownership = ownership;

  return patch;
}

/**
 * The catalog: every project with its contract addresses by kind.
 *
 * Shared so the page fetches it once. The price layer needs it too — data.json's
 * `config` carries each project's NFT address but not its token's, and the
 * token address is what DexScreener is keyed on.
 */
export async function loadProjects(signal) {
  const { projects = [] } = await get('/projects', signal);
  return projects;
}

/**
 * Fetch every project's authoritative figures, keyed by slug.
 *
 * One slow or failing project must not cost the others their correction, so
 * these settle independently.
 */
export async function loadOverlay(signal, known) {
  const projects = known ?? (await loadProjects(signal));

  const results = await Promise.allSettled(
    projects.map((p) => projectPatch(p, signal).then((patch) => [p.slug, patch])),
  );

  const overlay = {};
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.warn('gg-index: project overlay failed', r.reason);
      continue;
    }
    const [slug, patch] = r.value;
    if (Object.keys(patch).length) overlay[slug] = patch;
  }
  return overlay;
}

/**
 * Merge an overlay onto a `data.json` payload without disturbing the rest.
 *
 * Only `ownership` is touched, and only the keys the index actually returned.
 * Activation stays on the snapshot (see file header).
 */
export function applyOverlay(base, overlay) {
  if (!base?.projects || !overlay) return base;

  const projects = { ...base.projects };
  for (const [slug, patch] of Object.entries(overlay)) {
    const p = projects[slug];
    if (!p) continue;
    projects[slug] = {
      ...p,
      ...(patch.ownership ? { ownership: { ...p.ownership, ...patch.ownership } } : {}),
    };
  }
  return { ...base, projects };
}
