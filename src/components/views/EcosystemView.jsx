import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { projectPath, RANKING_PROJECTS, isProjectLive, PROJECTS } from '../../lib/routes';
import { ANVIL_VAULTS, quoteAnvilSnipe } from '../../lib/anvilScan';
import { ROBINHOOD_RPC } from '../../lib/bonusTokenomics';
import { listedSeat, mixUsd, nightshadesSnipeUsd, protocolFeeSeries, revenueRows, snipeSeatUsd } from '../../lib/seats';
import {
  entryEdgePct, entryHistorySeries, floorNftUsd, impliedNftUsd,
} from '../../lib/entryArb';
import { NIGHTSHADES_FACTIONS, NIGHTSHADES_FACTION_META } from '../../lib/nightshades';
import { loadFlows, loadRetentions, loadStructures, loadVaultCensus } from '../../lib/ggindex';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  compactUsd, compactNum, ViewControls, Card, Stat, Tag, KpiStrip, MiniSpark,
} from '../kit';
import { dateKey, formatLabels } from '../../lib/dates';
import { burnSeries } from '../../lib/burn';
import { cashflowRoiByDate, seriesHasInk, bucketKey, windowLen, windowPeriodLabel } from '../../lib/yieldHistory';
import { useChartView } from '../../lib/chartWindow';
import { setYieldSampleId, useYieldSampleId } from '../../lib/yieldSample';
import { useSectionScrollSpy } from '../../lib/projectScroll';
import { baseChartOptions, compactTick, compactUsdTick, PROJECT_COLORS, dualAxisOptions, levelAxis } from '../../lib/charts';
import { ChartPanel, OnboardClusterPanel } from '../HistoryCharts';
import { MethodologyCard } from '../Disclaimer';
import { CopyControl, shareSlug, ShareSection } from '../CopyControl';
import { OverlapPanel } from '../SectionInsights';
import { copyElement } from '../../lib/share';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ECO_TABS = [
  { id: 'seats', label: 'Seats' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'burn', label: 'Burn' },
  { id: 'activation', label: 'Activation' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'entry', label: 'Entry' },
  { id: 'history', label: 'History' },
];

const TAB_ALIAS = {
  roi: 'seats',
  historical: 'history',
  yield: 'history',
  rankings: 'seats',
};

const FALLBACK_LOGO = {
  stonk: 'Stonkbroker.png',
  interns: 'Intern.svg',
  mancer: 'logo.png',
  tickeryard: 'Yardkeepers.png',
  cardwall: 'wall.png',
  index: 'Index.png',
  oakmont: 'Oakmont.png',
  nightshades: 'Knight.png',
};

function logoSrc(meta, project) {
  const file = meta.logo || project?.config?.logo || FALLBACK_LOGO[meta.key] || 'Stonkbroker.png';
  return file.startsWith('http') ? file : `/${file}`;
}

function lastInk(data) {
  for (let i = (data || []).length - 1; i >= 0; i -= 1) {
    const n = Number(data[i]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sumInk(data) {
  return (data || []).reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Ranked bars — fair when every row is the same unit (%, USD in a window). */
function RankBar({ rows, format = compactUsd, suffix = '' }) {
  const max = Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const v = Number(r.value) || 0;
        const w = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : 0;
        return (
          <Link key={r.key} to={r.href} className="block">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: r.color }} />
                <span className="truncate text-[13px] text-ink">{r.name}</span>
              </span>
              <span className="num shrink-0 text-[13px] text-ink">
                {r.pending ? '—' : `${format(v)}${suffix}`}
              </span>
            </div>
            <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: r.color }} />
            </div>
            {r.note ? <p className="mt-1 font-mono text-[11px] text-faint">{r.note}</p> : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Period mix. One stacked bar, not eight lines. */
function ShareBar({ parts, format = compactUsd }) {
  const total = parts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const ranked = parts.filter((p) => (Number(p.value) || 0) > 0);
  let other = 0;
  const live = [];
  for (const p of ranked) {
    const share = total > 0 ? (Number(p.value) || 0) / total : 0;
    if (share < 0.03) other += Number(p.value) || 0;
    else live.push(p);
  }
  if (other > 0) live.push({ key: 'other', name: 'Other', value: other, color: '#575e67' });
  if (!(total > 0) || !live.length) {
    return <p className="text-[13px] text-muted">Nothing in this window.</p>;
  }
  return (
    <div>
      <div className="flex h-8 w-full gap-[2px] overflow-hidden">
        {live.map((p, i) => {
          const w = ((Number(p.value) || 0) / total) * 100;
          return (
            <div
              key={p.key}
              title={`${p.name}: ${format(p.value)} (${w.toFixed(1)}%)`}
              className={i === 0 ? 'rounded-l-[4px]' : i === live.length - 1 ? 'rounded-r-[4px]' : ''}
              style={{ width: `${w}%`, backgroundColor: p.color }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {live.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color }} />
            {p.name}{' '}
            <span className="text-ink">{format(p.value)}</span>
            <span className="text-faint">{((Number(p.value) / total) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function sparkDelta(data) {
  let first = null;
  let last = null;
  for (const v of data || []) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (first == null) first = n;
    last = n;
  }
  if (first == null || last == null || first === last) return null;
  return last - first;
}

function signedCompact(n, tick = compactTick) {
  const sign = n > 0 ? '+' : '−';
  const body = String(tick(Math.abs(n)) ?? '').replace(/^-/, '');
  return `${sign}${body}`;
}

function SparkCard({ name, href, color, labels, data, value, note, tick = compactTick }) {
  const ref = useRef(null);
  const has = seriesHasInk(data);
  const delta = sparkDelta(data);
  const opts = baseChartOptions(labels);
  return (
    <div ref={ref} className="card relative overflow-hidden">
      <Link to={href} className="block p-4 pr-12 transition-colors hover:border-muted">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
            <span className="truncate">{name}</span>
          </p>
          <p className="num shrink-0 text-[13px] text-ink">
            {value}
            {delta != null ? (
              <span className={`ml-1.5 ${delta < 0 ? 'text-danger' : 'text-accent'}`}>{signedCompact(delta, tick)}</span>
            ) : null}
          </p>
        </div>
        {note ? <p className="mt-0.5 font-mono text-[11px] text-faint">{note}</p> : null}
        <div className="relative mt-3 h-16">
          {has ? (
            <Line
              data={{
                labels,
                datasets: [{
                  data,
                  borderColor: color,
                  backgroundColor: color,
                  borderWidth: 1.5,
                  tension: 0.3,
                  pointRadius(ctx) {
                    const series = ctx.dataset.data || [];
                    let first = -1;
                    let last = -1;
                    for (let i = 0; i < series.length; i++) {
                      if (!Number.isFinite(Number(series[i]))) continue;
                      if (first < 0) first = i;
                      last = i;
                    }
                    return ctx.dataIndex === first || ctx.dataIndex === last ? 2.5 : 0;
                  },
                  pointHoverRadius: 3,
                  spanGaps: true,
                }],
              }}
              options={{
                ...opts,
                plugins: { ...opts.plugins, legend: { display: false } },
                scales: {
                  x: { display: false },
                  y: { display: false, ...levelAxis({ callback: tick }, data) },
                },
              }}
            />
          ) : (
            <p className="flex h-full items-center text-[12px] text-faint">No series in this window</p>
          )}
        </div>
      </Link>
      <div className="absolute right-2 top-2 z-20">
        <CopyControl
          heading
          tight
          idleLabel="Copy"
          title="Copy this chart for X"
          onCopy={() => copyElement(ref.current, { filename: `savi-${shareSlug(name, 'spark')}.png` })}
        />
      </div>
    </div>
  );
}

function SparkGrid({ overlay, hrefFor, formatValue, tick, noteFor }) {
  if (!overlay?.datasets?.length) {
    return <p className="text-[13px] text-muted">No history in this window.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {overlay.datasets.map((ds) => (
        <SparkCard
          key={ds.key || ds.label}
          name={ds.label}
          href={hrefFor(ds)}
          color={ds.borderColor}
          labels={overlay.labels}
          data={ds.data}
          value={formatValue(ds)}
          note={noteFor ? noteFor(ds) : null}
          tick={tick}
        />
      ))}
    </div>
  );
}

function pct1(n) {
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

function retentionOf(row) {
  // Week rows count a wallet again each time they re-enter. The index publishes
  // the distinct wallets on the leg (`holders`, `still_holding`). Summing the
  // weeks would put a returner in the denominator twice.
  const leg = row?.nft?.built ? row.nft : (row?.token?.built ? row.token : null);
  const entered = Number(leg?.holders);
  const still = Number(leg?.still_holding);
  if (!leg || !(entered > 0) || !Number.isFinite(still)) return null;
  return { entered, still, pct: (still / entered) * 100 };
}

function top10Pct(structure) {
  const raw = structure?.nft?.top10_share ?? structure?.token?.top10_share;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n * 100 : null;
}

export default function EcosystemView({ data, pending = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const aliased = TAB_ALIAS[tabFromUrl] || tabFromUrl;
  const activeTab = ECO_TABS.some((t) => t.id === aliased) ? aliased : 'seats';
  const { range: timeframe, setRange, interval, setInterval } = useChartView();
  const sampleId = useYieldSampleId();
  const [quotes, setQuotes] = useState({});
  const [structures, setStructures] = useState(null);
  const [retentions, setRetentions] = useState(null);
  const [flows, setFlows] = useState(null);
  const [vaults, setVaults] = useState(null);
  const revMixRef = useRef(null);
  const onboardCardRef = useRef(null);

  const selectTab = useCallback((id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'seats') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useSectionScrollSpy({
    sectionIds: ECO_TABS.map((t) => t.id),
    activeId: activeTab,
    ready: !!(data?.projects),
    onActiveId: selectTab,
  });

  const hidden = useMemo(
    () => new Set(PROJECTS.filter((p) => !isProjectLive(p)).map((p) => p.key)),
    [],
  );
  const board = useMemo(
    () => (data?.projects ? RANKING_PROJECTS.filter((m) => data.projects[m.key] && !hidden.has(m.key)) : []),
    [data, hidden],
  );
  const activationBoard = useMemo(
    () => board.filter((m) => m.kind !== 'cashflow' && m.kind !== 'vault'),
    [board],
  );
  const order = board.map((m) => m.key);
  const activationOrder = activationBoard.map((m) => m.key);
  const orderKey = order.join(',');

  useEffect(() => {
    if (!order.length) return undefined;
    let live = true;
    const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
    const vaultsToQuote = ANVIL_VAULTS.filter((v) => order.includes(v.key));
    Promise.all(vaultsToQuote.map(async (vault) => {
      try {
        const quote = await quoteAnvilSnipe(provider, vault.ammCa, vault.firstId || 1);
        const tokenUsd = Number(
          vault.faction
            ? data.projects.nightshades?.factions?.[vault.faction]?.market?.tokenPriceUsd
            : data.projects[vault.key]?.market?.tokenPriceUsd,
        ) || 0;
        const ethUsd = Number(
          vault.faction
            ? data.projects.nightshades?.factions?.[vault.faction]?.market?.ethPriceUsd
            : data.projects[vault.key]?.market?.ethPriceUsd,
        ) || Number(data.projects.stonk?.market?.ethPriceUsd) || 0;
        if (!(tokenUsd > 0) || !(ethUsd > 0)) return [vault.id, null];
        return [vault.id, { usd: quote.tokens * tokenUsd + quote.eth * ethUsd, tokens: quote.tokens, eth: quote.eth, feeBps: quote.feeBps }];
      } catch {
        return [vault.id, null];
      }
    })).then((rows) => {
      if (live) setQuotes(Object.fromEntries(rows));
    });
    return () => { live = false; };
  }, [orderKey, data]);

  useEffect(() => {
    if (!order.length) return undefined;
    let live = true;
    const slugs = order.flatMap((key) => (key === 'nightshades' ? NIGHTSHADES_FACTIONS : [key]));
    loadStructures(slugs).then((next) => { if (live) setStructures(next); });
    loadRetentions(slugs).then((next) => { if (live) setRetentions(next); });
    loadFlows(90).then((next) => { if (live) setFlows(next); });
    loadVaultCensus().then((next) => { if (live) setVaults(next); });
    return () => { live = false; };
  }, [orderKey]);

  if (!data || !data.projects) return <div className="text-center text-slate-400 p-12">Loading Ecosystem...</div>;

  const projectNames = Object.fromEntries(board.map((m) => [m.key, m.name]));
  const projectColors = PROJECT_COLORS;
  const period = windowPeriodLabel(timeframe);

  const overlayFromMaps = (maps, { keys = order, fill = false } = {}) => {
    const labelSet = new Set();
    for (const map of Object.values(maps)) Object.keys(map || {}).forEach((d) => labelSet.add(dateKey(d)));
    const raw = [...labelSet].filter(Boolean).sort();
    const sliced = raw.slice(-windowLen(timeframe, raw.length));
    let axis = sliced;
    if (interval && interval !== 'daily') {
      const seen = new Set();
      axis = [];
      for (const d of sliced) {
        const key = bucketKey(d, interval);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        axis.push(key);
      }
    }
    const datasets = keys.map((k) => {
      const map = maps[k] || {};
      let started = false;
      let last = null;
      const dataPts = axis.map((key) => {
        const days = interval === 'daily' ? [key] : sliced.filter((d) => bucketKey(d, interval) === key);
        const nums = days.map((d) => Number(map[d])).filter((n) => Number.isFinite(n));
        const val = nums.length ? nums[nums.length - 1] : null;
        if (!fill) return val;
        if (!started) {
          if (val == null || val === 0) return null;
          started = true;
          last = val;
          return val;
        }
        if (val == null) return last;
        last = val;
        return val;
      });
      return {
        key: k,
        label: projectNames[k],
        data: dataPts,
        borderColor: projectColors[k],
        backgroundColor: `${projectColors[k]}12`,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      };
    }).filter((ds) => seriesHasInk(ds.data));
    return { labels: formatLabels(axis), datasets };
  };

  const seriesToMap = (labels, dataPts) => {
    const map = {};
    (labels || []).forEach((lab, i) => { map[dateKey(lab)] = dataPts?.[i]; });
    return map;
  };

  const seatRows = board.map((meta) => {
    const p = data.projects[meta.key];
    const seat = listedSeat(meta, p);
    let snipe = null;
    if (meta.key === 'nightshades') {
      const by = Object.fromEntries(NIGHTSHADES_FACTIONS.map((id) => [id, quotes[`nightshades:${id}`]?.usd]));
      snipe = nightshadesSnipeUsd(p?.factions, by);
    } else if (seat.act != null && quotes[meta.key]) {
      snipe = snipeSeatUsd(quotes[meta.key].usd, seat.act);
    }
    const snipeRoi = snipe > 0 ? (seat.annual / snipe) * 100 : 0;
    return { meta, p, seat, snipe, snipeRoi };
  }).sort((a, b) => (b.seat.roi || 0) - (a.seat.roi || 0));

  const best = seatRows.find((r) => r.seat.roi > 0);
  const bestSnipe = [...seatRows].filter((r) => r.snipeRoi > 0).sort((a, b) => b.snipeRoi - a.snipeRoi)[0];

  const revParts = board.map((meta) => {
    const parts = revenueRows(data.projects[meta.key], '30d');
    return { meta, parts, mix: mixUsd(parts), outside: parts.filter((r) => !r.inMix) };
  });
  const mixRows = revParts
    .map((r) => ({
      key: r.meta.key,
      name: r.meta.name,
      color: projectColors[r.meta.key],
      value: r.mix,
      href: projectPath(r.meta.key, r.meta.key === 'nightshades' ? 'night' : 'revenue'),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const mixTotal = mixRows.reduce((s, r) => s + r.value, 0);
  const outsideRows = revParts.flatMap((r) => r.outside.map((part) => ({
    key: `${r.meta.key}-${part.source}`,
    name: r.meta.name,
    note: part.note,
    value: part.usd,
    href: projectPath(r.meta.key, 'revenue'),
  }))).filter((r) => r.value > 0);

  const burnRows = board.map((meta) => {
    const caps = burnCap(data.projects[meta.key]);
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: caps.tokenPct,
      href: meta.key === 'interns' ? projectPath(meta.key, 'activation') : projectPath(meta.key, 'burn'),
      note: caps.nftPct == null ? 'Token supply' : `NFT ${caps.nftPct.toFixed(2)}%`,
    };
  }).sort((a, b) => b.value - a.value);
  const burnNftRows = board
    .map((meta) => {
      const caps = burnCap(data.projects[meta.key]);
      if (caps.nftPct == null) return null;
      return {
        key: meta.key,
        name: meta.name,
        color: projectColors[meta.key],
        value: caps.nftPct,
        href: projectPath(meta.key, 'burn'),
        note: 'NFT-equivalent removed',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
  const burnLeader = burnRows.find((r) => r.value > 0);
  const burnInkCount = burnRows.filter((r) => r.value > 0).length;

  const actRows = activationBoard.map((meta) => {
    const p = data.projects[meta.key];
    const active = Number(p?.activation?.activeCount) || 0;
    const pctAct = Number(p?.activation?.percentActivated) || 0;
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: pctAct,
      href: projectPath(meta.key, 'activation'),
      note: `${compactNum(active)} active`,
    };
  }).sort((a, b) => b.value - a.value);
  const actLeader = actRows.find((r) => r.value > 0);

  const burnVelocityRows = board.map((meta) => {
    const p = data.projects[meta.key];
    const caps = burnCap(p);
    const series = burnSeries(p, '30d', 'daily');
    const pts = series.data || [];
    let first = null;
    let last = null;
    for (const v of pts) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (first == null) first = n;
      last = n;
    }
    const delta = first != null && last != null ? Math.max(0, last - first) : 0;
    const pct = caps.maxToken > 0 ? Math.min(100, (delta / caps.maxToken) * 100) : 0;
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: pct,
      href: meta.key === 'interns' ? projectPath(meta.key, 'activation') : projectPath(meta.key, 'burn'),
      note: delta > 0 ? `${compactNum(delta)} tokens · 30d` : 'No burn in 30d',
    };
  }).sort((a, b) => b.value - a.value);

  const breadthRows = board.map((meta) => {
    const p = data.projects[meta.key];
    const ratio = Number(p?.ownership?.ownershipRatio);
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: Number.isFinite(ratio) ? ratio : 0,
      href: projectPath(meta.key, 'ownership'),
      note: `NFT ${compactNum(p?.ownership?.nftHolders || 0)} · token ${compactNum(p?.ownership?.tokenHolders || p?.ownership?.stonkHolders || p?.ownership?.erc20Holders || 0)}`,
    };
  }).sort((a, b) => b.value - a.value);

  const holdRows = board.flatMap((meta) => {
    const parts = meta.key === 'nightshades'
      ? NIGHTSHADES_FACTION_META.map((f) => ({ slug: f.id, name: f.label }))
      : [{ slug: meta.key, name: meta.name }];
    return parts.map((part) => {
      const share = retentionOf(retentions?.[part.slug]);
      const entered = share?.entered || 0;
      const still = share?.still || 0;
      return {
        key: part.slug,
        name: part.name,
        color: projectColors[meta.key],
        value: entered > 0 ? (still / entered) * 100 : 0,
        href: projectPath(meta.key, 'ownership'),
        pending: retentions == null,
        note: entered > 0 ? `${compactNum(still)} of ${compactNum(entered)} still hold` : (retentions ? 'Fold has not run' : null),
      };
    });
  }).filter((r) => r.value > 0 || r.note);

  const concRows = board.flatMap((meta) => {
    const slugs = meta.key === 'nightshades'
      ? NIGHTSHADES_FACTIONS.map((id) => ({ slug: id, name: id }))
      : [{ slug: meta.key, name: meta.name }];
    return slugs.map((row) => {
      const pct = top10Pct(structures?.[row.slug]);
      if (pct == null) return null;
      return {
        key: row.slug,
        name: row.name,
        color: projectColors[meta.key],
        value: pct,
        href: projectPath(meta.key, 'ownership'),
      };
    }).filter(Boolean);
  }).sort((a, b) => b.value - a.value);

  const roiMaps = {};
  const feeMaps = {};
  const tokenMaps = {};
  const actMaps = {};
  const concMaps = {};
  for (const k of order) {
    const p = data.projects[k];
    const t0 = p?.tiers?.[0];
    const map = {};
    const rebuilt = cashflowRoiByDate(p);
    const useRebuilt = p?.config?.kind === 'cashflow'
      && Object.values(rebuilt).some((v) => Number.isFinite(Number(v)));
    if (useRebuilt) {
      for (const [d, v] of Object.entries(rebuilt)) {
        if (Number.isFinite(Number(v))) map[dateKey(d)] = Number(v);
      }
    } else {
      for (const [d, v] of Object.entries(rebuilt)) {
        if (Number.isFinite(Number(v))) map[dateKey(d)] = Number(v);
      }
      for (const s of p?.dailySnapshots || []) {
        const row = s.tiers?.find((st) => st.tier === (t0?.tier || 'T0'));
        const roi = row?.roi != null ? Number(row.roi) : (s.roi != null ? Number(s.roi) : null);
        if (Number.isFinite(roi)) map[dateKey(s.date)] = roi;
      }
    }
    roiMaps[k] = map;
    const fees = protocolFeeSeries(p);
    feeMaps[k] = seriesToMap(fees.labels, fees.data);
    const series = burnSeries(p, timeframe, interval);
    const days = series.rawLabels || [];
    const caps = burnCap(p);
    tokenMaps[k] = seriesToMap(days, (series.data || []).map((burn) => (
      caps.maxToken > 0 ? +Math.min(100, ((Number(burn) || 0) / caps.maxToken) * 100).toFixed(2) : null
    )));
    const histAct = p?.activation?.history || {};
    if (activationOrder.includes(k)) {
      actMaps[k] = seriesToMap(histAct.labels, histAct.cumulative);
    }
    concMaps[k] = seriesToMap(
      (p?.dailySnapshots || []).map((s) => s.date),
      (p?.dailySnapshots || []).map((s) => (s.ownershipRatio == null ? null : Number(s.ownershipRatio))),
    );
  }

  const onboard = data.onboarding || {};
  const onboardBy = onboard.byProject || {};
  const onboardRows = [
    { key: 'stonk', name: 'StonkBrokers' },
    { key: 'mancer', name: 'Mancer' },
    { key: 'cardwall', name: 'The Card Wall' },
    { key: 'tickeryard', name: 'TickerYard' },
    { key: 'interns', name: 'Interns' },
  ].map((row) => ({
    key: row.key,
    name: row.name,
    color: projectColors[row.key],
    value: Number(onboardBy[row.key]?.wallets) || 0,
    href: projectPath(row.key, 'ownership'),
    note: (() => {
      const nft = Number(onboardBy[row.key]?.nft) || 0;
      const token = Number(onboardBy[row.key]?.token) || 0;
      if (token) return `NFT ${compactNum(nft)} · token ${compactNum(token)}`;
      return nft ? `NFT ${compactNum(nft)}` : null;
    })(),
  })).sort((a, b) => b.value - a.value);
  const onboardTotal = onboardRows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const onboardShareRows = onboardRows.map((r) => ({
    ...r,
    value: onboardTotal > 0 ? ((Number(r.value) || 0) / onboardTotal) * 100 : 0,
    note: r.value > 0 ? `${compactNum(r.value)} wallets` : r.note,
  }));
  const onboardNote = onboard.complete === false && (onboard.pending || 0) > 0
    ? `Still folding ${compactNum(onboard.pending)} txs`
    : 'NFT or AMM buy · nonce 0–9';

  const anvilKeys = new Set(ANVIL_VAULTS.map((v) => v.key));
  const entryGapRows = board
    .filter((meta) => anvilKeys.has(meta.key) && meta.key !== 'nightshades')
    .map((meta) => {
      const p = data.projects[meta.key];
      const seat = listedSeat(meta, p);
      const floorNft = floorNftUsd(p);
      const implied = impliedNftUsd(p, meta.key);
      const quoteUsd = Number(quotes[meta.key]?.usd) || 0;
      const snipe = seat.act != null && quoteUsd > 0 ? snipeSeatUsd(quoteUsd, seat.act) : 0;
      const floorEdge = entryEdgePct(floorNft, implied);
      const snipeEdge = quoteUsd > 0 ? entryEdgePct(quoteUsd, implied) : null;
      return {
        meta,
        p,
        floorSeat: seat.listed,
        snipe,
        implied,
        floorEdge,
        snipeEdge,
        quoting: anvilKeys.has(meta.key) && !Object.keys(quotes).length,
      };
    })
    .filter((r) => r.implied > 0 || r.floorSeat > 0)
    .sort((a, b) => (Number(b.floorEdge) || -999) - (Number(a.floorEdge) || -999));

  const entryHistoryKeys = board
    .map((m) => m.key)
    .filter((k) => {
      const p = data.projects[k];
      if (!(Number(p?.config?.unitValue) > 0)) return false;
      const hist = entryHistorySeries(p, { key: k, timeframe, interval });
      return (hist.floor || []).some((v) => v != null && v > 0)
        && (hist.implied || []).some((v) => v != null && v > 0);
    });
  // Stonk first — deepest unitValue + snapshot history.
  entryHistoryKeys.sort((a, b) => (a === 'stonk' ? -1 : b === 'stonk' ? 1 : 0));

  const hrefFor = (tab) => (ds) => projectPath(ds.key, tab);
  const flowPairs = (flows?.pairs || []).slice(0, 8);
  const vaultRows = vaults?.vaults || [];

  return (
    <div className="relative space-y-6 pt-4">
      <div className="sticky top-[var(--header-h,5.5rem)] z-20 -mx-3 bg-[#08090b] px-3" data-share-omit>
        <div className="flex flex-col gap-2 border-b border-line pb-3 pt-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 pr-1 font-mono text-[10px] uppercase tracking-wider text-faint">Jump</span>
            {ECO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[12px] transition-colors sm:px-3 sm:py-1.5 sm:text-[13px] ${
                  activeTab === tab.id ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <ViewControls
            sampleId={sampleId}
            onSample={setYieldSampleId}
            timeframe={timeframe}
            onRange={setRange}
            interval={interval}
            onInterval={setInterval}
          />
        </div>
      </div>

      <ShareSection id="seats" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Last sync"
          sub="Cheapest live seat. Floor is the OpenSea listing plus the tokens that seat must hold. Snipe replaces the listing with the AMM specific-buy quote. A Wall uses its cheapest star, not the collection floor for every rarity."
        >
          <KpiStrip>
            <Stat label="Best floor CoC" value={best ? pct1(best.seat.roi) : '—'} tone="accent" note={best?.meta.name} />
            <Stat label="Best snipe CoC" value={bestSnipe ? pct1(bestSnipe.snipeRoi) : '—'} note={bestSnipe?.meta.name || 'Quoting'} />
            <Stat label="Projects" value={String(board.length)} />
            <Stat label="30D fees kept" value={compactUsd(mixTotal)} note="Protocol revenue" />
          </KpiStrip>
        </Card>
        <Card flush eyebrow="Seats" sub="Cash-on-cash uses the run rate on this bar, divided by that cost. The snipe column fills in as each vault answers.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Project</th>
                  <th className="px-3 py-3 font-normal">Seat</th>
                  <th className="px-3 py-3 font-normal">Floor</th>
                  <th className="px-3 py-3 font-normal">Snipe</th>
                  <th className="px-3 py-3 font-normal">Yield</th>
                  <th className="hidden px-3 py-3 font-normal lg:table-cell">30d fees</th>
                  <th className="px-3 py-3 font-normal">Floor CoC</th>
                  <th className="px-5 py-3 text-right font-normal">Snipe CoC</th>
                </tr>
              </thead>
              <tbody>
                {seatRows.map(({ meta, p, seat, snipe, snipeRoi }) => {
                  const spark = (protocolFeeSeries(p).data || []).slice(-30);
                  const mark = PROJECT_COLORS[meta.key] || '#00a804';
                  return (
                  <tr key={meta.key} className="border-b border-line-soft">
                    <td className="px-5 py-3">
                      <Link to={projectPath(meta.key, 'roi')} className="flex items-center gap-3">
                        <img src={logoSrc(meta, p)} alt="" className="h-8 w-8 rounded-md border border-line object-cover bg-panel" style={String(logoSrc(meta, p)).endsWith('Mutual.png') ? { imageRendering: 'pixelated' } : undefined} />
                        <span className="text-[13px] text-ink">{meta.name}</span>
                        {best?.meta.key === meta.key && seat.roi > 0 && <Tag tone="good">best</Tag>}
                        {p?.underConstruction && <Tag tone="warn">pre-launch</Tag>}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-[13px] text-ink">{seat.name}</div>
                      <div className="font-mono text-[11px] text-faint">{seat.note}</div>
                    </td>
                    <td className="num px-3 py-3 text-[13px] text-ink">{p?.underConstruction ? '—' : compactUsd(seat.listed)}</td>
                    <td className="num px-3 py-3 text-[13px] text-ink">
                      {snipe > 0 ? compactUsd(snipe) : (ANVIL_VAULTS.some((v) => v.key === meta.key) && !Object.keys(quotes).length ? '…' : '—')}
                    </td>
                    <td className="num px-3 py-3 text-[13px] text-ink">{p?.underConstruction ? 'TBD' : compactUsd(seat.annual)}</td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {!p?.underConstruction && spark.length > 1 ? (
                        <MiniSpark data={spark} color={mark} width={64} height={20} />
                      ) : (
                        <span className="font-mono text-[11px] text-faint">—</span>
                      )}
                    </td>
                    <td className={`num px-3 py-3 text-[13px] ${seat.roi > 0 ? 'text-accent' : 'text-faint'}`}>
                      {p?.underConstruction || !(seat.roi > 0) ? '—' : pct1(seat.roi)}
                    </td>
                    <td className={`num px-5 py-3 text-right text-[13px] ${snipeRoi > 0 ? 'text-accent' : 'text-faint'}`}>
                      {snipeRoi > 0 ? pct1(snipeRoi) : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          ref={revMixRef}
          eyebrow="Trailing 30 days"
          sub="Fees the protocol kept, plus Card Wall Alley/Claw spread as an estimate. Holder payouts, raw gacha pulls, and yield÷365 sit under the bar."
          corner={(
            <CopyControl
              heading
              alwaysLabel
              idleLabel="Copy"
              title="Copy protocol revenue mix for X"
              className="bg-[#08090b]"
              onCopy={() => copyElement(revMixRef.current, { filename: 'savi-protocol-revenue.png' })}
            />
          )}
        >
          <KpiStrip>
            <Stat label="Fees kept" value={compactUsd(mixTotal)} />
            <Stat label="Leader" value={mixRows[0]?.name || '—'} note={mixRows[0] ? compactUsd(mixRows[0].value) : null} />
            <Stat label="Leader share" value={mixTotal > 0 ? `${((mixRows[0].value / mixTotal) * 100).toFixed(0)}%` : '—'} />
          </KpiStrip>
          <div className="mt-5">
            <ShareBar parts={mixRows} />
          </div>
        </Card>
        <Card eyebrow="Ranked" sub="Same 30 days, fees kept only.">
          <RankBar rows={mixRows} />
        </Card>
        {outsideRows.length ? (
          <Card eyebrow="Outside the mix" sub="Real money, different meaning. Not added to the bar.">
            <div className="space-y-2">
              {outsideRows.map((row) => (
                <Link key={row.key} to={row.href} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink">{row.name} <span className="font-mono text-[11px] text-faint">{row.note}</span></span>
                  <span className="num text-muted">{compactUsd(row.value)}</span>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}
      </ShareSection>

      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Share of own supply burnt"
          sub="Normalized to each token’s cap, so a 3k collection is comparable to a million-supply ERC-20. Raw token counts are not."
        >
          <KpiStrip className="mb-5">
            <Stat label="Leader" value={burnLeader ? `${burnLeader.value.toFixed(2)}%` : '—'} tone="accent" note={burnLeader?.name} />
            <Stat label="With burn ink" value={String(burnInkCount)} note={`of ${board.length}`} />
          </KpiStrip>
          <RankBar rows={burnRows} format={(v) => `${Number(v).toFixed(2)}%`} />
        </Card>
        {burnNftRows.length ? (
          <Card
            eyebrow="NFT-equivalent % removed"
            sub="Burn translated into collection supply when unitValue exists. Machines and brokers use real NFT burns only."
          >
            <RankBar rows={burnNftRows} format={(v) => `${Number(v).toFixed(2)}%`} />
          </Card>
        ) : null}
        <SparkGrid
          overlay={overlayFromMaps(tokenMaps, { fill: true })}
          hrefFor={(ds) => (ds.key === 'interns' ? projectPath(ds.key, 'activation') : projectPath(ds.key, 'burn'))}
          tick={(v) => `${compactTick(v)}%`}
          formatValue={(ds) => {
            const v = lastInk(ds.data);
            return v == null ? '—' : `${v.toFixed(2)}%`;
          }}
        />
      </ShareSection>

      <ShareSection id="activation" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="% of own collection earning"
          sub="Percent activated on each supply — not raw active units. Cashflow and vault seats stay off this board."
        >
          <KpiStrip className="mb-5">
            <Stat label="Leader" value={actLeader ? `${actLeader.value.toFixed(1)}%` : '—'} tone="accent" note={actLeader?.name} />
            <Stat label="Projects" value={String(actRows.length)} />
          </KpiStrip>
          <RankBar rows={actRows} format={(v) => `${Number(v).toFixed(1)}%`} />
        </Card>
        <SparkGrid
          overlay={overlayFromMaps(actMaps, { keys: activationOrder })}
          hrefFor={hrefFor('activation')}
          formatValue={(ds) => compactNum(lastInk(ds.data) || 0)}
          noteFor={() => 'Net active · own scale'}
        />
      </ShareSection>

      <ShareSection id="ownership" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Wallets per 100 NFTs"
          sub="Unique NFT wallets divided by circulating supply, times 100. A higher bar is a collection more people hold, not a collection one wallet controls."
        >
          <RankBar rows={breadthRows} format={(v) => Number(v).toFixed(2)} />
        </Card>
        {concRows.length ? (
          <Card
            eyebrow="Top 10 wallets"
            sub="Share of the included float held by the ten largest wallets. gg-index structure, excluding dust, burn addresses, and catalog contracts."
          >
            <RankBar rows={concRows} format={(v) => `${Number(v).toFixed(1)}%`} />
          </Card>
        ) : null}
        {holdRows.length ? (
          <Card
            eyebrow="Still holding"
            sub="Distinct wallets who entered, and how many of those bags are still open. A returner counts once. Nightshades factions are separate. Empty until the activity book is rebuilt."
          >
            <RankBar rows={holdRows} format={(v) => `${Number(v).toFixed(1)}%`} />
          </Card>
        ) : null}
        {vaultRows.length ? (
          <Card eyebrow="NFTs in the AMM" sub="Counted from current holders in gg-index. What is inside each token-bound wallet is the Anvil scan.">
            <RankBar
              rows={vaultRows.map((row) => ({
                key: row.slug,
                name: row.name || row.slug,
                color: projectColors[row.slug] || '#94a3b8',
                value: Number(row.nfts) || 0,
                href: '/anvil',
              }))}
              format={compactNum}
            />
          </Card>
        ) : null}
        {flowPairs.length ? (
          <Card eyebrow="Sold one, bought another" sub="NFT wallets who sent one collection and received a different one inside 14 days, over the last 90. Overlap below is who holds both right now.">
            <div className="space-y-2">
              {flowPairs.map((pair) => (
                <p key={`${pair.from}-${pair.to}`} className="flex items-baseline justify-between font-mono text-[12px] text-muted">
                  <span>{pair.from} → {pair.to}</span>
                  <span className="text-ink">{compactNum(pair.wallets)} wallets</span>
                </p>
              ))}
            </div>
          </Card>
        ) : null}
        <Card
          ref={onboardCardRef}
          eyebrow="Robinhood Chain onboard"
          sub={`Wallets whose first cluster buy or mint was one of their first ${onboard.lookbackTxs || 10} transactions. Airdrops and contracts do not count. ${onboardNote}.`}
          corner={(
            <CopyControl
              heading
              alwaysLabel
              idleLabel="Copy"
              title="Copy Robinhood Chain onboard for X"
              className="bg-[#08090b]"
              onCopy={() => copyElement(onboardCardRef.current, { filename: 'savi-robinhood-chain-onboard.png' })}
            />
          )}
        >
          <KpiStrip className="mb-5">
            <Stat label="Wallets" value={compactNum(onboard.wallets || 0)} tone="accent" note="Unique EOAs" />
            <Stat label="First touch" value={onboardRows[0]?.name || '—'} note={onboardRows[0] ? compactNum(onboardRows[0].value) : null} />
            <Stat label="Classified" value={compactNum(onboard.scanned || 0)} note={onboard.complete ? 'Complete' : 'In progress'} />
          </KpiStrip>
          <RankBar rows={onboardRows} format={compactNum} />
        </Card>
        {onboardTotal > 0 ? (
          <Card
            eyebrow="Onboard share"
            sub="Each project’s share of classified first-touch wallets. Same fold as the count above."
          >
            <RankBar rows={onboardShareRows} format={(v) => `${Number(v).toFixed(1)}%`} />
          </Card>
        ) : null}
        <Card
          eyebrow="Burn velocity · 30d"
          sub="Trailing thirty-day burn as a percent of each token’s own supply cap — pace, not the cumulative level on the Burn tab."
        >
          <RankBar rows={burnVelocityRows} format={(v) => `${Number(v).toFixed(3)}%`} />
        </Card>
        <OnboardClusterPanel data={data} timeframe="30d" interval="daily" />
        <OverlapPanel />
      </ShareSection>

      <ShareSection id="entry" className="scroll-mt-32 space-y-4">
        <Card
          flush
          eyebrow="Live gap"
          sub="Anvil vaults only. Floor seat is OpenSea (or star) plus T0 tokens. Snipe replaces the listing with the AMM specific-buy. Implied is unit × token (Stonk × 1.10). Edge % compares the NFT legs — OpenSea floor or AMM quote — to implied."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Project</th>
                  <th className="px-3 py-3 font-normal">Floor seat</th>
                  <th className="px-3 py-3 font-normal">Snipe seat</th>
                  <th className="px-3 py-3 font-normal">Implied</th>
                  <th className="px-3 py-3 font-normal">Floor vs implied</th>
                  <th className="px-5 py-3 text-right font-normal">Snipe vs implied</th>
                </tr>
              </thead>
              <tbody>
                {entryGapRows.map((row) => (
                  <tr key={row.meta.key} className="border-b border-line-soft">
                    <td className="px-5 py-3">
                      <Link to={`/anvil?project=${row.meta.key}`} className="flex items-center gap-3">
                        <img
                          src={logoSrc(row.meta, row.p)}
                          alt=""
                          className="h-8 w-8 rounded-md border border-line object-cover bg-panel"
                        />
                        <span className="text-[13px] text-ink">{row.meta.name}</span>
                      </Link>
                    </td>
                    <td className="num px-3 py-3 text-[13px] text-ink">
                      {row.floorSeat > 0 ? compactUsd(row.floorSeat) : '—'}
                    </td>
                    <td className="num px-3 py-3 text-[13px] text-ink">
                      {row.snipe > 0 ? compactUsd(row.snipe) : (row.quoting ? '…' : '—')}
                    </td>
                    <td className="num px-3 py-3 text-[13px] text-ink">
                      {row.implied > 0 ? compactUsd(row.implied) : '—'}
                    </td>
                    <td className={`num px-3 py-3 text-[13px] ${edgeTone(row.floorEdge)}`}>
                      {row.floorEdge == null ? '—' : pct1(row.floorEdge)}
                    </td>
                    <td className={`num px-5 py-3 text-right text-[13px] ${edgeTone(row.snipeEdge)}`}>
                      {row.snipeEdge == null ? '—' : pct1(row.snipeEdge)}
                    </td>
                  </tr>
                ))}
                {!entryGapRows.length ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-[13px] text-muted">No Anvil vaults with a readable floor or implied yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
        {entryHistoryKeys.map((key) => {
          const p = data.projects[key];
          return (
            <div key={key} className="space-y-4">
              <EntryFloorImpliedChart
                project={p}
                projectKey={key}
                timeframe={timeframe}
                interval={interval}
                color={projectColors[key]}
              />
              {key === 'stonk' || entryHistoryKeys.length === 1 ? (
                <EntryEdgeChart
                  project={p}
                  projectKey={key}
                  timeframe={timeframe}
                  interval={interval}
                  color={projectColors[key]}
                />
              ) : null}
            </div>
          );
        })}
      </ShareSection>

      <ShareSection id="history" className="scroll-mt-32 space-y-4">
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
          {period} on each project’s own scale. The seat table above stays at last sync.
        </p>
        <p className="font-mono text-[11px] text-faint">T0 cash-on-cash</p>
        <SparkGrid
          overlay={overlayFromMaps(roiMaps, { fill: true })}
          hrefFor={hrefFor('historical')}
          tick={(v) => `${compactTick(v)}%`}
          formatValue={(ds) => { const v = lastInk(ds.data); return v == null ? '—' : `${v.toFixed(1)}%`; }}
        />
        <p className="font-mono text-[11px] text-faint">Fees kept</p>
        <SparkGrid
          overlay={overlayFromMaps(feeMaps)}
          hrefFor={(ds) => projectPath(ds.key, ds.key === 'nightshades' ? 'night' : 'revenue')}
          tick={compactUsdTick}
          formatValue={(ds) => compactUsd(sumInk(ds.data))}
          noteFor={() => `${period} in view`}
        />
        <p className="font-mono text-[11px] text-faint">Share of own token supply burnt</p>
        <SparkGrid
          overlay={overlayFromMaps(tokenMaps, { fill: true })}
          hrefFor={(ds) => (ds.key === 'interns' ? projectPath(ds.key, 'activation') : projectPath(ds.key, 'burn'))}
          tick={(v) => `${compactTick(v)}%`}
          formatValue={(ds) => { const v = lastInk(ds.data); return v == null ? '—' : `${v.toFixed(2)}%`; }}
        />
        <p className="font-mono text-[11px] text-faint">Net active</p>
        <SparkGrid
          overlay={overlayFromMaps(actMaps, { keys: activationOrder })}
          hrefFor={hrefFor('activation')}
          formatValue={(ds) => compactNum(lastInk(ds.data) || 0)}
          noteFor={() => 'Own scale'}
        />
        <p className="font-mono text-[11px] text-faint">Wallets per 100 NFTs</p>
        <SparkGrid
          overlay={overlayFromMaps(concMaps)}
          hrefFor={hrefFor('ownership')}
          tick={compactTick}
          formatValue={(ds) => { const v = lastInk(ds.data); return v == null ? '—' : v.toFixed(2); }}
        />
      </ShareSection>

      <MethodologyCard>
        <p><strong className="text-white">Seats:</strong> Floor cost is the cheapest listing plus the T0 token requirement, at the last sync. For The Card Wall that listing is the cheapest star, and the row lists the rest. Snipe cost is the AMM specific-buy quote for one NFT plus those same activation tokens. Nightshades is one typical faction, weighted by how many are active, not the sum of four.</p>
        <p><strong className="text-white">Revenue:</strong> The bar is fees the protocol kept over the trailing 30 days. Cash already paid to seats, cash still sitting in the oracle or vault, gacha pulls, and a yield divided by 365 stay on the page and out of that total. Seat yield follows the Run rate on the bar above. Range and Interval only change the charts.</p>
        <p><strong className="text-white">Burn:</strong> Ranked as percent of each project’s own token supply cap permanently removed. NFT-equivalent % uses burnt units ÷ collection supply when unitValue exists.</p>
        <p><strong className="text-white">Activation:</strong> Percent of that collection currently earning. Cashflow and vault seats are excluded. Sparks are net active on each project’s own scale.</p>
        <p><strong className="text-white">Ownership:</strong> Wallets per 100 NFTs is unique wallets divided by circulating supply, times 100. Top 10 is the share those wallets hold. Still holding is written when the activity rebuild records who entered and who left. Onboard share is each project’s cut of first-touch wallets. Burn velocity is the trailing 30-day burn as % of own supply. NFTs in the AMM are a count. The Anvil scan is where a vault’s contents are priced.</p>
        <p><strong className="text-white">Entry:</strong> Floor seat = OpenSea (or star) + T0 tokens. Snipe = AMM specific-buy + the same T0. Implied = unitValue × token (Stonk × 1.10). Edge % is (implied − floor) ÷ implied on the NFT legs — not guaranteed profit after fees, TBA contents, and exit liquidity.</p>
        <p><strong className="text-white">Chain onboard:</strong> Unique EOAs that sent a transaction with nonce 0–9 which received or minted a StonkBrokers, Mancer, Card Wall, TickerYard, or Interns NFT, or bought that project’s token off its AMM. Airdrops and peer transfers do not count.</p>
      </MethodologyCard>
    </div>
  );
}

function burnCap(p) {
  const kind = p?.config?.kind;
  const tokenOnly = kind === 'cashflow' || kind === 'vault';
  const nftSupply = Number(p?.ownership?.currentMaxSupply || p?.config?.maxSupply || 0);
  const circ = Number(p?.ownership?.circulatingSupply || 0);
  const burntTok = Math.max(
    Number(p?.activation?.dualBurn?.totalBurnTokens || 0),
    Number(p?.ownership?.permanentlyBurntTokens || 0),
  );
  let maxToken = Number(p?.config?.maxTokenSupply) || 0;
  if (!maxToken) {
    if (tokenOnly) maxToken = nftSupply || circ + burntTok;
    else {
      const unit = Number(p?.config?.unitValue);
      if ((kind === 'machines' || kind === 'brokers') && (circ > 0 || burntTok > 0)) maxToken = circ + burntTok;
      else if (unit > 0 && nftSupply > 0) maxToken = nftSupply * unit;
      else maxToken = nftSupply * 1000000;
    }
  }
  const tokenPct = maxToken > 0 ? Math.min(100, (burntTok / maxToken) * 100) : 0;
  let nftPct = null;
  if (!tokenOnly && nftSupply > 0) {
    const realNft = Number(p?.ownership?.burntNfts || 0);
    const units = Number(p?.ownership?.permanentlyBurntUnits || 0);
    const equiv = Number(p?.activation?.dualBurn?.equivalentBrokersBurnt || 0);
    const nftBurned = (kind === 'machines' || kind === 'brokers')
      ? realNft
      : Math.max(realNft, units, equiv);
    nftPct = Math.min(100, (nftBurned / nftSupply) * 100);
  }
  return { tokenPct, nftPct, maxToken, burntTok, tokenOnly };
}

function edgeTone(pct) {
  if (pct == null || !Number.isFinite(pct)) return 'text-faint';
  if (pct > 0) return 'text-accent';
  if (pct < 0) return 'text-danger';
  return 'text-muted';
}

function EntryFloorImpliedChart({ project, projectKey, timeframe, interval, color }) {
  const hist = entryHistorySeries(project, { key: projectKey, timeframe, interval });
  const labels = formatLabels(hist.dates);
  const has = (hist.floor || []).some((v) => v != null) && (hist.implied || []).some((v) => v != null);
  if (!has) return null;
  const tokenColor = '#8b929b';
  return (
    <ChartPanel
      title={`${PROJECTS.find((p) => p.key === projectKey)?.name || projectKey} · floor vs implied`}
      note="OpenSea floor USD against token-implied NFT value (unit × spot; Stonk × 1.10). Token price on the right axis."
      footer={(
        <p className="text-[12px] leading-relaxed text-muted">
          When implied runs above floor, buying the NFT to access token value is incentivized.
        </p>
      )}
    >
      <Line
        data={{
          labels,
          datasets: [
            {
              label: 'OpenSea floor',
              data: hist.floor,
              borderColor: color || '#00a804',
              backgroundColor: `${color || '#00a804'}18`,
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
              yAxisID: 'y',
            },
            {
              label: 'Implied NFT',
              data: hist.implied,
              borderColor: '#e8eaed',
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [4, 3],
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
              yAxisID: 'y',
            },
            {
              label: 'Token',
              data: hist.token,
              borderColor: tokenColor,
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
              yAxisID: 'y1',
            },
          ],
        }}
        options={dualAxisOptions({
          labels,
          interval,
          leftTick: compactUsdTick,
          rightTick: compactUsdTick,
          rightColor: tokenColor,
          leftKind: 'level',
          rightKind: 'level',
          leftValues: [...(hist.floor || []), ...(hist.implied || [])],
          rightValues: hist.token,
          leftUnit: 'USD',
          rightUnit: 'token',
        })}
      />
    </ChartPanel>
  );
}

function EntryEdgeChart({ project, projectKey, timeframe, interval, color }) {
  const hist = entryHistorySeries(project, { key: projectKey, timeframe, interval });
  const labels = formatLabels(hist.dates);
  const has = (hist.edge || []).some((v) => v != null && Number.isFinite(v));
  if (!has) return null;
  return (
    <ChartPanel
      title="Arb room"
      note="(implied − floor) ÷ implied. Positive = floor cheap vs token value."
    >
      <Line
        data={{
          labels,
          datasets: [{
            label: 'Edge %',
            data: hist.edge,
            borderColor: color || '#00a804',
            backgroundColor: `${color || '#00a804'}22`,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            spanGaps: true,
            fill: true,
          }],
        }}
        options={{
          ...baseChartOptions(labels, interval),
          scales: {
            ...baseChartOptions(labels, interval).scales,
            y: {
              ...baseChartOptions(labels, interval).scales.y,
              ...levelAxis(
                { ...baseChartOptions(labels, interval).scales.y.ticks, callback: (v) => `${compactTick(v)}%` },
                hist.edge,
              ),
            },
          },
        }}
      />
    </ChartPanel>
  );
}
