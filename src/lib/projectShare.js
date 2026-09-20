/** Compact 16:9 share cards. Numbers match the on-page CoC math. */

import { PROJECTS, RANKING_PROJECTS } from './routes';
import { NIGHTSHADES_FACTION_META } from './nightshades';
import { burnOfSupplyPct, burnSeries } from './burn';
import { holderRevenueCol, protocolRevenueChart, sliceCols, windowLen, windowPeriodLabel } from './yieldHistory';
import { parseChartWindow } from './chartWindow';

function money(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  if (abs >= 1) return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  if (abs === 0) return '$0';
  return `${sign}$${abs.toFixed(abs < 0.01 ? 6 : 4)}`;
}

function count(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function px(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n < 1) return `$${n.toFixed(n < 0.01 ? 6 : 4)}`;
  return `$${n.toFixed(2)}`;
}

function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function floorUsd(market = {}) {
  return (Number(market.nftFloorEth) || 0) * (Number(market.ethPriceUsd) || 0);
}

function tokenUsd(market = {}) {
  return Number(market.tokenPriceUsd) || 0;
}

function tierFloorUsd(project, tier, index) {
  const market = project?.market || {};
  const ethP = Number(market.ethPriceUsd) || 0;
  if (Number(tier?.floorEth) > 0) return Number(tier.floorEth) * ethP;
  if (Array.isArray(market.starFloorEth) && Number(market.starFloorEth[index]) > 0) {
    return Number(market.starFloorEth[index]) * ethP;
  }
  return floorUsd(market);
}

function entryUsd(project, tier, index = 0) {
  if (Number(tier?.entryUsd) > 0) return Number(tier.entryUsd);
  const kind = project?.config?.kind;
  const tok = tokenUsd(project?.market);
  const req = Number(tier?.reqTokens) || 0;
  const fl = tierFloorUsd(project, tier, index);
  if (kind === 'machines') return fl + req * tok * 1.15;
  if (kind === 'cashflow' || kind === 'vault') return req * tok;
  return fl + req * tok;
}

function roiPct(yieldUsd, cost) {
  return cost > 0 ? ((Number(yieldUsd) || 0) / cost) * 100 : NaN;
}

function last(arr) {
  return arr?.length ? arr[arr.length - 1] : 0;
}

function windowValues(arr, timeframe) {
  const a = (arr || []).map((v) => Number(v) || 0);
  const n = windowLen(timeframe, a.length);
  return a.slice(-n);
}

function deltaLabel(values, kind = 'num') {
  if (!values || values.length < 2) return '';
  const a = Number(values[0]) || 0;
  const b = Number(values[values.length - 1]) || 0;
  const d = b - a;
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return '';
  const sign = d > 0 ? '+' : '−';
  const abs = Math.abs(d);
  if (kind === 'pp') return `${sign}${abs.toFixed(1)} pp`;
  if (kind === 'int') return `${sign}${count(Math.round(abs))}`;
  if (abs >= 100) return `${sign}${count(abs)}`;
  if (abs >= 1) return `${sign}${abs.toFixed(1)}`;
  return `${sign}${abs.toFixed(2)}`;
}

function t0RoiSeries(project) {
  const t0 = project?.tiers?.[0];
  const tier = t0?.tier || 'T0';
  const fromSnaps = (project?.dailySnapshots || [])
    .map((s) => {
      const row = s.tiers?.find((st) => st.tier === tier);
      const roi = row?.roi ?? s.roi;
      return Number(roi);
    })
    .filter((n) => Number.isFinite(n));
  if (fromSnaps.length > 1) return fromSnaps;
  if (t0?.dailyYields?.length) return t0.dailyYields.map(Number);
  return [];
}

function windowMeta(timeframe) {
  const tf = parseChartWindow(timeframe);
  const label = tf === '7d' ? '7D' : tf === '30d' ? '30D' : tf === '90d' ? '90D' : 'All';
  const period = windowPeriodLabel(tf);
  return { tf, label, period };
}

const TOPIC_LABEL = {
  roi: 'ROI',
  yield: 'Yield',
  historical: 'Yield',
  revenue: 'Revenue',
  night: 'Night',
  liquidity: 'Smart LPs',
  burn: 'Burn',
  activation: 'Activation',
  ownership: 'Ownership',
};

export function buildTopicShareCard(data, opts = {}) {
  const card = buildProjectShareCard(data, opts);
  if (!card) return null;
  const tab = opts.tab || 'roi';
  const topic = TOPIC_LABEL[tab] || String(tab);
  const stem = String(card.filename || 'savi-card.png').replace(/\.png$/i, '');
  return {
    ...card,
    page: true,
    title: `${card.title} · ${topic}`,
    filename: `${stem}-${tab}.png`,
  };
}

function projectStory(project, timeframe) {
  const { tf, period } = windowMeta(timeframe);
  const t0 = project?.tiers?.[0];
  const y0 = Number(t0?.trackedAnnualYieldUsd) || Number(project?.cashflow?.holdersAnnualized) || 0;
  const roi = roiPct(y0, entryUsd(project, t0, 0));
  const kind = project?.config?.kind;
  let shownRoi = roi;
  if (kind === 'vault' && project?.market?.claimApyPct != null) {
    shownRoi = Number(project.market.claimApyPct);
  } else if (kind === 'cashflow') {
    const circulating = project?.ownership?.circulatingSupply || 0;
    const annual = project?.cashflow?.holdersAnnualized || 0;
    const tok = tokenUsd(project?.market);
    const per = circulating > 0 ? annual / circulating : 0;
    shownRoi = tok > 0 ? (per / tok) * 100 : roi;
  }

  const burn = burnSeries(project, tf);
  const burntLive = last(burnSeries(project, 'all').data);
  const burnt = last(burn.data);
  const burnPct = burnOfSupplyPct(project, burntLive);
  const active = project?.activation?.activeCount;
  const actPct = project?.activation?.percentActivated;
  const raw = protocolRevenueChart(project);
  const axis = raw.rawLabels || raw.labels || [];
  const holder = holderRevenueCol(project, axis);
  const holderWin = sliceCols(axis, [holder], tf);
  const holderTot = Number(holderWin.cols?.[0]?.total) || 0;
  const actCum = windowValues(project?.activation?.history?.cumulative, tf);
  const roiLine = windowValues(t0RoiSeries(project), tf);
  const holderBars = holderWin.cols?.[0]?.data || [];
  const latestRoi = roiLine.length ? last(roiLine) : shownRoi;

  return {
    tiles: [
      { label: 'T0 cash-on-cash', value: pct(shownRoi), color: '#00a804', hero: true },
      {
        label: 'Burn',
        value: burnPct != null ? `${count(burntLive)} · ${burnPct.toFixed(1)}%` : count(burntLive),
        color: '#fb923c',
      },
      {
        label: 'Active',
        value: active != null
          ? `${count(active)}${actPct != null ? ` · ${Number(actPct).toFixed(0)}%` : ''}`
          : '—',
        color: '#38bdf8',
      },
      { label: `Holders · ${period}`, value: money(holderTot), color: '#f7931a' },
    ],
    charts: [
      {
        title: 'Historic yield',
        headline: deltaLabel(roiLine, 'pp') || pct(latestRoi),
        color: '#00a804',
        values: roiLine,
        kind: 'line',
      },
      {
        title: `Holder revenue · ${period}`,
        headline: money(holderTot),
        color: '#f7931a',
        values: holderBars.map((v) => Number(v) || 0),
        kind: 'bar',
      },
      {
        title: 'Burn',
        headline: deltaLabel(burn.data) || count(burnt),
        color: '#fb923c',
        values: burn.data || [],
        kind: 'line',
      },
      {
        title: 'Activations',
        headline: deltaLabel(actCum, 'int') || (active != null ? count(active) : '—'),
        color: '#38bdf8',
        values: actCum.length ? actCum : (active != null ? [active] : []),
        kind: 'line',
      },
    ],
  };
}

function withStory(base, project, timeframe) {
  const s = projectStory(project, timeframe);
  const { tf, label } = windowMeta(timeframe);
  const stem = String(base.filename || 'savi-card.png').replace(/\.png$/i, '');
  return {
    ...base,
    tiles: s.tiles,
    charts: s.charts,
    window: label,
    filename: tf === 'all' ? `${stem}.png` : `${stem}-${tf}.png`,
  };
}

function nftPayload(project, { name, ticker, filename, timeframe }) {
  const tiers = Array.isArray(project?.tiers) ? project.tiers : [];
  return withStory({
    filename,
    title: name,
    kicker: `$${ticker} · savicrypto.xyz`,
    columns: ['Tier', 'Entry', 'Yield', 'CoC'],
    rows: tiers.slice(0, 6).map((t, i) => {
      const cost = entryUsd(project, t, i);
      const y = Number(t.trackedAnnualYieldUsd) || 0;
      return { cells: [t.name || t.tier || `T${i}`, money(cost), money(y), pct(roiPct(y, cost))] };
    }),
    note: '',
  }, project, timeframe);
}

function specialPayload(project, meta, timeframe) {
  const ticker = meta.ticker || project.config?.ticker;
  const cashflow = project.cashflow || {};
  const annual = cashflow.holdersAnnualized || cashflow.revenueAnnualized || 0;
  const tok = tokenUsd(project.market);
  const circulating = project.ownership?.circulatingSupply || 0;
  const perToken = circulating > 0 ? annual / circulating : 0;
  const tokenRoi = tok > 0 ? (perToken / tok) * 100 : NaN;
  const rows = (project.tiers || []).map((t, i) => {
    const cost = entryUsd(project, t, i);
    const y = Number(t.trackedAnnualYieldUsd) || 0;
    return { cells: [t.name || t.tier || `T${i}`, money(cost), money(y), pct(roiPct(y, cost))] };
  });
  if (!rows.length) {
    rows.push({ cells: [`$${ticker}`, px(tok), money(annual), pct(tokenRoi)] });
  }
  return withStory({
    filename: `savi-${meta.slug}.png`,
    title: meta.name,
    kicker: `$${ticker} · savicrypto.xyz`,
    columns: ['Unit', 'Entry', 'Yield', 'CoC'],
    rows,
    note: '',
  }, project, timeframe);
}

function vaultPayload(project, meta, timeframe) {
  const rows = (project.tiers || []).map((t) => {
    const cost = Number(t.entryUsd) || 0;
    const y = Number(t.trackedAnnualYieldUsd) || 0;
    return { cells: [t.name || t.tier, money(cost), money(y), pct(roiPct(y, cost))] };
  });
  return withStory({
    filename: `savi-${meta.slug}.png`,
    title: meta.name,
    kicker: `$${meta.ticker} · savicrypto.xyz`,
    columns: ['Holder', 'Spot', 'Fee / yr', 'Fee CoC'],
    rows,
    note: '',
  }, project, timeframe);
}

function nightshadesAllPayload(project, timeframe) {
  const rows = NIGHTSHADES_FACTION_META.map((f) => {
    const slice = project.factions?.[f.id];
    const t0 = slice?.tiers?.[0];
    const cost = entryUsd(slice, t0, 0);
    const y = Number(t0?.trackedAnnualYieldUsd) || 0;
    const r = roiPct(y, cost);
    return { cells: [f.label, money(cost), money(y), pct(r)], roi: r, yield: y };
  });
  const rois = rows.map((r) => r.roi).filter((n) => Number.isFinite(n));
  const avgRoi = rois.length ? rois.reduce((s, n) => s + n, 0) / rois.length : NaN;
  const card = withStory({
    filename: 'savi-nightshades.png',
    title: 'Nightshades',
    kicker: 'Four Anvil factions · savicrypto.xyz',
    columns: ['Faction', 'Entry', 'Yield', 'CoC'],
    rows: rows.map(({ cells }) => ({ cells })),
    note: '',
  }, project, timeframe);
  card.tiles = (card.tiles || []).map((t) => {
    if (t.hero || t.label === 'T0 cash-on-cash' || t.label === 'T0 CoC' || t.label === 'ROI') {
      return { ...t, value: pct(avgRoi), hero: true };
    }
    return t;
  });
  return card;
}

export function buildProjectShareCard(data, { projectKey, faction, timeframe } = {}) {
  const meta = PROJECTS.find((p) => p.key === projectKey);
  const project = data?.projects?.[projectKey];
  if (!meta || !project) return null;
  const filename = `savi-${meta.slug}.png`;
  if (projectKey === 'nightshades') {
    const id = String(faction || 'all').toLowerCase();
    if (id && id !== 'all') {
      const slice = project.factions?.[id];
      const fm = NIGHTSHADES_FACTION_META.find((f) => f.id === id);
      if (slice && fm) {
        return nftPayload(slice, {
          name: `Nightshades ${fm.label}`,
          ticker: fm.ticker,
          filename: `savi-nightshades-${id}.png`,
          timeframe,
        });
      }
    }
    return nightshadesAllPayload(project, timeframe);
  }
  const kind = project.config?.kind || meta.kind;
  if (kind === 'vault') return vaultPayload(project, meta, timeframe);
  if (kind === 'cashflow' || kind === 'brokers' || kind === 'machines') {
    return specialPayload(project, meta, timeframe);
  }
  return nftPayload(project, {
    name: meta.name,
    ticker: meta.ticker || project.config?.ticker,
    filename,
    timeframe,
  });
}

function headlineRow(meta, project) {
  const kind = project.config?.kind || meta.kind;
  if (kind === 'vault') {
    const t0 = project.tiers?.[0];
    const cost = Number(t0?.entryUsd) || 0;
    const y = Number(t0?.trackedAnnualYieldUsd) || 0;
    const r = roiPct(y, cost);
    const claim = project.market?.claimApyPct;
    return {
      roi: Number.isFinite(claim) ? claim : (Number.isFinite(r) ? r : -1),
      cells: [meta.name, money(cost) || px(tokenUsd(project.market)), money(y), Number.isFinite(r) ? pct(r) : pct(claim)],
    };
  }
  if (kind === 'cashflow') {
    const tok = tokenUsd(project.market);
    const circulating = project.ownership?.circulatingSupply || 0;
    const annual = project.cashflow?.holdersAnnualized || 0;
    const per = circulating > 0 ? annual / circulating : 0;
    const r = tok > 0 ? (per / tok) * 100 : NaN;
    const lot = Number(project.activation?.eligibleMin) || 10000;
    return {
      roi: Number.isFinite(r) ? r : -1,
      cells: [meta.name, money(lot * tok), money(lot * per), pct(r)],
    };
  }
  const t0 = project.tiers?.[0];
  const cost = entryUsd(project, t0, 0);
  const y = Number(t0?.trackedAnnualYieldUsd) || 0;
  const r = roiPct(y, cost);
  return { roi: Number.isFinite(r) ? r : -1, cells: [meta.name, money(cost), money(y), pct(r)] };
}

export function buildEcosystemShareCard(data, { timeframe } = {}) {
  const { tf, label } = windowMeta(timeframe);
  const rows = [];
  for (const meta of RANKING_PROJECTS) {
    const project = data?.projects?.[meta.key];
    if (!project) continue;
    if (meta.key === 'nightshades') {
      for (const f of NIGHTSHADES_FACTION_META) {
        const slice = project.factions?.[f.id];
        if (!slice) continue;
        const t0 = slice.tiers?.[0];
        const cost = entryUsd(slice, t0, 0);
        const y = Number(t0?.trackedAnnualYieldUsd) || 0;
        const r = roiPct(y, cost);
        rows.push({
          roi: Number.isFinite(r) ? r : -1,
          cells: [`NS ${f.label}`, money(cost), money(y), pct(r)],
        });
      }
      continue;
    }
    rows.push(headlineRow(meta, project));
  }
  rows.sort((a, b) => (b.roi || 0) - (a.roi || 0));
  const top = rows.slice(0, 4);
  return {
    filename: tf === 'all' ? 'savi-ecosystem.png' : `savi-ecosystem-${tf}.png`,
    title: 'Robinhood Chain yield',
    kicker: 'savicrypto.xyz',
    window: label,
    tiles: top.map((r) => ({ label: r.cells[0], value: r.cells[3], color: '#00a804' })),
    columns: ['Project', 'Entry', 'Yield', 'CoC'],
    rows,
    note: '',
  };
}
