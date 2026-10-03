import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { projectPath, RANKING_PROJECTS, isProjectLive, PROJECTS } from '../../lib/routes';
import { ANVIL_VAULTS, quoteAnvilSnipe } from '../../lib/anvilScan';
import { ROBINHOOD_RPC } from '../../lib/bonusTokenomics';
import { listedSeat, mixUsd, nightshadesSnipeUsd, protocolFeeSeries, revenueRows, snipeSeatUsd } from '../../lib/seats';
import { NIGHTSHADES_FACTIONS } from '../../lib/nightshades';
import { loadFlows, loadRetentions, loadStructures, loadVaultCensus } from '../../lib/ggindex';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  compactUsd, compactNum, WindowBar, IntervalBar, Card, Stat, Tag, KpiStrip,
} from '../kit';
import { dateKey, formatLabels } from '../../lib/dates';
import { burnSeries } from '../../lib/burn';
import { cashflowRoiByDate, seriesHasInk, bucketKey, windowLen, windowPeriodLabel } from '../../lib/yieldHistory';
import { useChartView } from '../../lib/chartWindow';
import { useSectionScrollSpy } from '../../lib/projectScroll';
import { baseChartOptions, compactTick, compactUsdTick, PROJECT_COLORS, levelAxis } from '../../lib/charts';
import { OnboardClusterPanel } from '../HistoryCharts';
import { MethodologyCard } from '../Disclaimer';
import { CopyControl, shareSlug, ShareSection } from '../CopyControl';
import { OverlapPanel } from '../SectionInsights';
import { copyElement } from '../../lib/share';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ECO_TABS = [
  { id: 'seats', label: 'Seats' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'history', label: 'History' },
];

const TAB_ALIAS = {
  roi: 'seats',
  historical: 'history',
  yield: 'history',
  rankings: 'seats',
  burn: 'history',
  activation: 'history',
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
  const weeks = row?.nft?.built ? row.nft.weeks : (row?.token?.built ? row.token.weeks : null);
  if (!weeks?.length) return null;
  const entered = weeks.reduce((s, w) => s + (Number(w.entered) || 0), 0);
  const still = weeks.reduce((s, w) => s + (Number(w.still) || 0), 0);
  if (!(entered > 0)) return null;
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
  const order = board.map((m) => m.key);
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

  const holdRows = board.map((meta) => {
    const slugs = meta.key === 'nightshades' ? NIGHTSHADES_FACTIONS : [meta.key];
    const shares = slugs.map((slug) => retentionOf(retentions?.[slug])).filter(Boolean);
    const entered = shares.reduce((s, r) => s + r.entered, 0);
    const still = shares.reduce((s, r) => s + r.still, 0);
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: entered > 0 ? (still / entered) * 100 : 0,
      href: projectPath(meta.key, 'ownership'),
      pending: retentions == null,
      note: entered > 0 ? `${compactNum(still)} of ${compactNum(entered)} still hold` : (retentions ? 'Fold has not run' : null),
    };
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
    for (const [d, v] of Object.entries(cashflowRoiByDate(p))) {
      if (Number.isFinite(Number(v))) map[dateKey(d)] = Number(v);
    }
    for (const s of p?.dailySnapshots || []) {
      const row = s.tiers?.find((st) => st.tier === (t0?.tier || 'T0'));
      const roi = row?.roi != null ? Number(row.roi) : (s.roi != null ? Number(s.roi) : null);
      if (Number.isFinite(roi)) map[dateKey(s.date)] = roi;
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
    actMaps[k] = seriesToMap(histAct.labels, histAct.cumulative);
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
  const onboardNote = onboard.complete === false && (onboard.pending || 0) > 0
    ? `Still folding ${compactNum(onboard.pending)} txs`
    : 'NFT or AMM buy · nonce 0–9';

  const hrefFor = (tab) => (ds) => projectPath(ds.key, tab);
  const flowPairs = (flows?.pairs || []).slice(0, 8);
  const vaultRows = vaults?.vaults || [];

  return (
    <div className="relative space-y-6 pt-4">
      <div className="sticky top-[var(--header-h,5.5rem)] z-20 -mx-3 bg-[#08090b] px-3" data-share-omit>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-1 pb-3 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <Card flush eyebrow="Seats" sub="Cash-on-cash is trailing yield divided by that cost. The snipe column fills in as each vault answers.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Project</th>
                  <th className="px-3 py-3 font-normal">Seat</th>
                  <th className="px-3 py-3 font-normal">Floor</th>
                  <th className="px-3 py-3 font-normal">Snipe</th>
                  <th className="px-3 py-3 font-normal">Yield</th>
                  <th className="px-3 py-3 font-normal">Floor CoC</th>
                  <th className="px-5 py-3 text-right font-normal">Snipe CoC</th>
                </tr>
              </thead>
              <tbody>
                {seatRows.map(({ meta, p, seat, snipe, snipeRoi }) => (
                  <tr key={meta.key} className="border-b border-line-soft">
                    <td className="px-5 py-3">
                      <Link to={projectPath(meta.key, 'roi')} className="flex items-center gap-3">
                        <img src={logoSrc(meta, p)} alt="" className="h-8 w-8 rounded-md border border-line object-cover bg-panel" />
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
                    <td className={`num px-3 py-3 text-[13px] ${seat.roi > 0 ? 'text-accent' : 'text-faint'}`}>
                      {p?.underConstruction || !(seat.roi > 0) ? '—' : pct1(seat.roi)}
                    </td>
                    <td className={`num px-5 py-3 text-right text-[13px] ${snipeRoi > 0 ? 'text-accent' : 'text-faint'}`}>
                      {snipeRoi > 0 ? pct1(snipeRoi) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          ref={revMixRef}
          eyebrow="Trailing 30 days"
          sub="Fees the protocol kept. Holder payouts, gacha pulls, and yield divided by 365 are listed under the bar and are not in the total."
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
            sub="Of the wallets who entered this collection, the share that still hold. A wallet who left and came back counts on the later week. Empty until the activity rebuild writes the book."
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
        <OnboardClusterPanel data={data} timeframe="30d" interval="daily" />
        <OverlapPanel />
      </ShareSection>

      <ShareSection id="history" className="scroll-mt-32 space-y-4">
        <div className="flex items-center justify-end gap-2" data-share-omit>
          <WindowBar compact value={timeframe} onChange={setRange} />
          <IntervalBar compact value={interval} onChange={setInterval} />
        </div>
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
          overlay={overlayFromMaps(actMaps)}
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
        <p><strong className="text-white">Revenue:</strong> The bar is protocol-kept fees over the trailing 30 days. Paid-to-members, gacha pulls, and a yield divided by 365 stay on the page and out of the total. The window control on History is the only one that changes a chart.</p>
        <p><strong className="text-white">Ownership:</strong> Wallets per 100 NFTs is unique wallets divided by circulating supply, times 100. Top 10 is the share those wallets hold. Still holding is written when the activity rebuild records who entered and who left. NFTs in the AMM are a count. The Anvil scan is where a vault’s contents are priced.</p>
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
  return { maxToken };
}
