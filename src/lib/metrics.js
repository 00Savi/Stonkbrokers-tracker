// Pure derivations over the data.json payload.
//
// Kept out of the components on purpose: before this, Burn / Activation /
// Ownership rendered literals copy-pasted off the live site the night the React
// port was written. They matched reality for about an hour and then silently
// stopped, and because every project rendered the same literals, switching
// projects looked like it did nothing. Everything below reads the payload.

export const PROJECT_ORDER = ['stonk', 'mancer', 'tickeryard', 'cardwall'];

export const PROJECT_META = {
  stonk:      { name: 'StonkBrokers',  trackerName: 'StonkBrokers Tracker',  color: '#3b82f6', dot: 'bg-blue-500',    logo: '/Stonkbroker.png' },
  mancer:     { name: 'Mancer',        trackerName: 'Mancer Tracker',        color: '#a855f7', dot: 'bg-purple-500',  logo: '/logo.png' },
  tickeryard: { name: 'TickerYard',    trackerName: 'TickerYard Tracker',    color: '#10b981', dot: 'bg-emerald-500', logo: '/Yardkeepers.png' },
  cardwall:   { name: 'The Card Wall', trackerName: 'The Card Wall Tracker', color: '#f59e0b', dot: 'bg-amber-500',   logo: '/wall.png' },
};

// Tier series colours, indexed T0..T4. Matches the old dashboard.
export const TIER_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa'];
export const TIER_DOTS = ['bg-blue-400', 'bg-emerald-400', 'bg-pink-400', 'bg-amber-400', 'bg-violet-400'];

export const projectName = (key) => PROJECT_META[key]?.name || key;
export const projectColor = (key) => PROJECT_META[key]?.color || '#64748b';

export const listProjects = (data) =>
  PROJECT_ORDER.filter((key) => data?.projects?.[key]).map((key) => ({
    key,
    ...PROJECT_META[key],
    project: data.projects[key],
  }));

export const isUnderConstruction = (project) => Boolean(project?.underConstruction);

// --- cost basis -------------------------------------------------------------

export function floorCostUsd(project) {
  const market = project?.market || {};
  return (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
}

export function tierCost(project, tier) {
  const tokenPrice = project?.market?.tokenPriceUsd || 0;
  const activationUsd = (tier?.reqTokens || 0) * tokenPrice;
  return { activationUsd, totalUsd: floorCostUsd(project) + activationUsd };
}

export function tierRoiPct(project, tier) {
  const { totalUsd } = tierCost(project, tier);
  return totalUsd > 0 ? ((tier?.trackedAnnualYieldUsd || 0) / totalUsd) * 100 : 0;
}

// null rather than 0 or Infinity: a tier with no tracked yield has no payback
// horizon, which is a different statement from "pays back immediately".
export function paybackYears(project, tier) {
  const { totalUsd } = tierCost(project, tier);
  const annual = tier?.trackedAnnualYieldUsd || 0;
  return annual > 0 ? totalUsd / annual : null;
}

// --- supply / burn ----------------------------------------------------------

export function maxSupplyTokens(project) {
  return (project?.activation?.totalSupply || 0) * (project?.config?.unitValue || 0);
}

export function deflationPct(project) {
  const supply = maxSupplyTokens(project);
  const burnt = project?.activation?.dualBurn?.totalBurnTokens || 0;
  return supply > 0 ? (burnt / supply) * 100 : 0;
}

// --- daily snapshots --------------------------------------------------------
//
// A snapshot written before the payload was reseeded (see DATA-SOURCES.md §8,
// "the carry-forward inherited a poisoned seed") records totalBurn as the whole
// supply and every tier ROI at 0. Charting those raw draws a line from 100%
// burnt down to 19% on day two. Filter per-metric rather than dropping the row
// wholesale, because the two fields went bad independently.

export function burnSnapshots(project) {
  const supply = maxSupplyTokens(project);
  return (project?.dailySnapshots || []).filter(
    (snap) => snap && snap.totalBurn > 0 && (supply <= 0 || snap.totalBurn < supply)
  );
}

export function roiSnapshots(project) {
  return (project?.dailySnapshots || []).filter((snap) =>
    (snap?.tiers || []).some((t) => (t?.roi || 0) > 0)
  );
}

// Per-tier ROI history. Returns { labels, series: [{ tier, name, data }] }.
export function tierRoiHistory(project) {
  const snaps = roiSnapshots(project);
  const tiers = project?.tiers || [];
  return {
    labels: snaps.map((s) => s.date),
    series: tiers.map((tier) => ({
      tier: tier.tier,
      name: tier.name,
      data: snaps.map((snap) => {
        const row = (snap.tiers || []).find((t) => t.tier === tier.tier);
        return row ? row.roi : null;
      }),
    })),
  };
}

// Cumulative burn as a % of max supply, over time.
export function burnPctHistory(project) {
  const supply = maxSupplyTokens(project);
  const snaps = burnSnapshots(project);
  return {
    labels: snaps.map((s) => s.date),
    data: snaps.map((s) => (supply > 0 ? (s.totalBurn / supply) * 100 : 0)),
  };
}

// --- activation -------------------------------------------------------------

export function tierBreakdown(project) {
  const breakdown = project?.activation?.breakdown || {};
  return (project?.tiers || []).map((tier, i) => ({
    tier: tier.tier,
    name: tier.name,
    count: breakdown[tier.tier] || 0,
    color: TIER_COLORS[i % TIER_COLORS.length],
    dot: TIER_DOTS[i % TIER_DOTS.length],
  }));
}

export const TIER_FLOW_WINDOWS = [
  { id: '24h', label: 'D' },
  { id: '7d', label: 'W' },
  { id: '30d', label: 'M' },
  { id: 'allTime', label: 'ALL' },
];

// The "activation boxes": per-tier activations vs deactivations over a window.
// activation.tierStats has carried this the whole time; nothing rendered it.
export function tierFlow(project, window = 'allTime') {
  const stats = project?.activation?.tierStats || {};
  return (project?.tiers || []).map((tier, i) => {
    const row = stats[tier.tier]?.[window] || {};
    const act = row.act || 0;
    const deact = row.deact || 0;
    return {
      tier: tier.tier,
      name: tier.name,
      act,
      deact,
      net: act - deact,
      color: TIER_COLORS[i % TIER_COLORS.length],
    };
  });
}

export function activationHistory(project) {
  const history = project?.activation?.history || {};
  return {
    labels: history.labels || [],
    net: history.cumulative || [],
    gross: history.cumulativeGross || history.cumulative || [],
    dailyActivations: history.dailyActivations || [],
    dailyDeactivations: history.dailyDeactivations || [],
  };
}

// --- revenue ----------------------------------------------------------------

export const REVENUE_STREAMS = [
  { key: 'dailyAmm', total: 'ammFeesUsd', label: 'AMM & Swaps', color: '#34d399' },
  { key: 'dailySecurityBox', total: 'securityBoxUsd', label: 'Clock-In Box', color: '#60a5fa' },
  { key: 'dailyLaunchpad', total: 'launchpadUsd', label: 'Safe Launchpad', color: '#a78bfa' },
  { key: 'dailyDex', total: 'dexFeesUsd', label: 'DEX Fees', color: '#f472b6' },
];

export function revenueStreams(project) {
  const revenue = project?.revenue || {};
  return REVENUE_STREAMS
    .map((stream) => ({
      ...stream,
      totalUsd: revenue[stream.total] || 0,
      daily: revenue[stream.key] || [],
    }))
    // dailyDex is all zeros for every project today. An always-empty series in
    // the legend reads as a broken stream rather than an absent one.
    .filter((stream) => stream.totalUsd > 0 || stream.daily.some((v) => v > 0));
}

export function totalRevenueUsd(project) {
  return revenueStreams(project).reduce((sum, s) => sum + s.totalUsd, 0);
}

// Fields the fetcher carried forward because the metered key was exhausted.
// DATA-SOURCES.md §8: "Unknown was published as zero" — the payload marks these
// and nothing has ever rendered the mark.
export function degradedFields(project) {
  const degraded = project?.revenue?.degraded;
  if (!degraded) return [];
  return Array.isArray(degraded) ? degraded : Object.keys(degraded);
}

// --- ownership --------------------------------------------------------------

export function ownershipStats(project) {
  const own = project?.ownership || {};
  return {
    currentMaxSupply: own.currentMaxSupply || 0,
    burntNfts: own.burntNfts || 0,
    ammVaultNfts: own.ammVaultNfts || 0,
    circulatingNftSupply: own.circulatingNftSupply || 0,
    nftHolders: own.nftHolders || 0,
    tokenHolders: own.stonkHolders || 0,
    ownershipRatio: own.ownershipRatio || 0,
  };
}

export function holderHistory(project) {
  const growth = project?.ownership?.historicalGrowth || {};
  return { labels: growth.labels || [], data: growth.data || [] };
}

// --- ecosystem rollups ------------------------------------------------------

export function ecosystemActivation(data) {
  return listProjects(data).map(({ key, name, color, dot, project }) => ({
    key,
    name,
    color,
    dot,
    activeCount: project.activation?.activeCount || 0,
    percentActivated: project.activation?.percentActivated || 0,
    underConstruction: isUnderConstruction(project),
  }));
}

export function ecosystemDeflation(data) {
  return listProjects(data).map(({ key, name, color, dot, project }) => ({
    key,
    name,
    color,
    dot,
    pct: deflationPct(project),
    equivalentUnits: project.activation?.dualBurn?.equivalentBrokersBurnt || 0,
    tokensBurnt: project.activation?.dualBurn?.totalBurnTokens || 0,
  }));
}

export function ecosystemOwnership(data) {
  return listProjects(data).map(({ key, name, color, project }) => ({
    key,
    name,
    color,
    ...ownershipStats(project),
  }));
}

// Base (T0) entry economics per project, for the ecosystem ROI table.
export function ecosystemRoiRows(data) {
  return listProjects(data).map(({ key, name, logo, color, project }) => {
    const tier = (project.tiers || [])[0];
    const { activationUsd, totalUsd } = tierCost(project, tier);
    return {
      key,
      name,
      logo,
      color,
      project,
      tier,
      tierName: tier?.name || '—',
      reqTokens: tier?.reqTokens || 0,
      ticker: project.config?.ticker || '',
      activationUsd,
      totalUsd,
      annualYieldUsd: tier?.trackedAnnualYieldUsd || 0,
      roiPct: tierRoiPct(project, tier),
      underConstruction: isUnderConstruction(project),
    };
  });
}

// Align every project's series onto one label axis. Projects start at different
// dates and the fetcher does not pad them, so zipping by index silently shifts
// a short series left. Join on the label instead and carry the last known value
// forward across gaps.
export function alignSeries(entries) {
  const labels = [];
  const seen = new Set();
  for (const entry of entries) {
    for (const label of entry.labels || []) {
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
  }
  return {
    labels,
    series: entries.map((entry) => {
      const byLabel = new Map((entry.labels || []).map((l, i) => [l, entry.data[i]]));
      let last = null;
      return {
        ...entry,
        data: labels.map((label) => {
          if (byLabel.has(label)) last = byLabel.get(label);
          return last;
        }),
      };
    }),
  };
}

// --- timeframe slicing ------------------------------------------------------

export const TIMEFRAMES = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: 'all', label: 'ALL', days: null },
];

export function sliceTimeframe(labels, seriesList, timeframe) {
  const spec = TIMEFRAMES.find((t) => t.id === timeframe);
  const days = spec?.days;
  if (!days || days >= labels.length) return { labels, series: seriesList };
  return {
    labels: labels.slice(-days),
    series: seriesList.map((s) => ({ ...s, data: (s.data || []).slice(-days) })),
  };
}

// --- chart legends ----------------------------------------------------------
//
// Savi's ask, on both the tier-ROI chart and the ecosystem burn chart: show the
// current number next to the series name in the legend at the top. The last
// point is often the only one anybody wants, and reading it off the right-hand
// edge of five overlapping lines does not work.
export function latestValue(data) {
  for (let i = (data || []).length - 1; i >= 0; i--) {
    if (data[i] !== null && data[i] !== undefined && !Number.isNaN(data[i])) return data[i];
  }
  return null;
}

export function labelWithCurrent(name, data, format) {
  const current = latestValue(data);
  return current === null ? name : `${name} — ${format(current)}`;
}
