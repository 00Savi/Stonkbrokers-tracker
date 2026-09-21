import React, { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { projectPath, RANKING_PROJECTS, isProjectLive, PROJECTS } from '../../lib/routes';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import OverviewView from './OverviewView';
import {
  compactUsd, compactNum, WindowBar, IntervalBar, YieldPeriodToggle,
  scaleAnnualYield, yieldSuffix, yieldPeriodLabel, Card, Stat, Tag, KpiStrip,
} from '../kit';
import { dateKey, formatLabels } from '../../lib/dates';
import { burnSeries } from '../../lib/burn';
import { cashflowRoiByDate, protocolFeeCols, protocolRevenueChart, seriesHasInk, bucketKey, windowLen, windowPeriodLabel } from '../../lib/yieldHistory';
import { typicalNightshadesSeat } from '../../lib/nightshades';
import { useChartView } from '../../lib/chartWindow';
import { baseChartOptions, compactTick, compactUsdTick, PROJECT_COLORS, levelAxis } from '../../lib/charts';
import { EmptyChart } from '../HistoryCharts';
import { MethodologyCard } from '../Disclaimer';
import { CopyControl, shareSlug, ShareSection } from '../CopyControl';
import { copyElement } from '../../lib/share';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ECO_TABS = [
  { id: 'roi', label: 'ROI' },
  { id: 'historical', label: 'Yield' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'burn', label: 'Burn' },
  { id: 'activation', label: 'Activation' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'rankings', label: 'All tiers' },
];

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
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
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
  const live = parts.filter((p) => (Number(p.value) || 0) > 0);
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

function SparkCard({ name, href, color, labels, data, value, note, tick = compactTick }) {
  const ref = useRef(null);
  const has = seriesHasInk(data);
  const opts = baseChartOptions(labels);
  return (
    <div ref={ref} className="card relative overflow-hidden">
      <Link to={href} className="block p-4 pr-12 transition-colors hover:border-muted">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
            <span className="truncate">{name}</span>
          </p>
          <p className="num shrink-0 text-[13px] text-ink">{value}</p>
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
                  borderWidth: 1.5,
                  tension: 0.3,
                  pointRadius: 0,
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

export default function EcosystemView({ data, pending = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab = ECO_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'roi';
  const [expandedProject, setExpandedProject] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const { range: timeframe, setRange, interval, setInterval } = useChartView();

  const selectTab = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'roi') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  };

  if (!data || !data.projects) return <div className="text-center text-slate-400 p-12">Loading Ecosystem...</div>;

  const hidden = new Set(PROJECTS.filter((p) => !isProjectLive(p)).map((p) => p.key));
  const board = RANKING_PROJECTS.filter((m) => data.projects[m.key] && !hidden.has(m.key));
  const order = board.map((m) => m.key);
  const activationBoard = board.filter((m) => m.kind !== 'cashflow' && m.kind !== 'vault');
  const activationOrder = activationBoard.map((m) => m.key);
  const projectNames = Object.fromEntries(board.map((m) => [m.key, m.name]));
  const projectColors = PROJECT_COLORS;
  const period = windowPeriodLabel(timeframe);
  const scaleYield = (annual) => scaleAnnualYield(annual, yieldPeriod);
  const yieldLabel = yieldPeriodLabel(yieldPeriod);
  const yieldUnit = yieldSuffix(yieldPeriod);

  const chartOptions = baseChartOptions();

  const overlayFromMaps = (maps, { keys = order, fill = false } = {}) => {
    const labelSet = new Set();
    for (const map of Object.values(maps)) {
      Object.keys(map || {}).forEach((d) => labelSet.add(dateKey(d)));
    }
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
    (labels || []).forEach((lab, i) => {
      map[dateKey(lab)] = dataPts?.[i];
    });
    return map;
  };

  const burnCaps = (p) => {
    const kind = p?.config?.kind;
    const tokenOnly = kind === 'cashflow' || kind === 'vault';
    const nftSupply = Number(p?.ownership?.currentMaxSupply || p?.config?.maxSupply || 0);
    const circ = Number(p?.ownership?.circulatingSupply || 0);
    const burntTok = Math.max(
      Number(p?.activation?.dualBurn?.totalBurnTokens || 0),
      Number(p?.ownership?.permanentlyBurntTokens || 0)
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
      const nftBurned = (kind === 'machines' || kind === 'brokers') ? realNft : Math.max(realNft, units, equiv);
      nftPct = Math.min(100, (nftBurned / nftSupply) * 100);
    }
    return { tokenPct, nftPct, maxToken, burntTok, tokenOnly };
  };

  const projectRevenueSeries = (p) => {
    const chart = protocolRevenueChart(p);
    if (chart.labels?.length) {
      const fees = protocolFeeCols(chart.cols);
      const dataPts = chart.labels.map((_, i) =>
        fees.reduce((s, c) => s + (Number(c.data?.[i]) || 0), 0)
      );
      if (dataPts.some((v) => v > 0)) return { labels: chart.labels, data: dataPts, source: 'protocol' };
    }
    const snaps = Array.isArray(p?.dailySnapshots) ? p.dailySnapshots : [];
    if (snaps.some((s) => Number(s.annualYield) > 0)) {
      return {
        labels: formatLabels(snaps.map((s) => s.date)),
        data: snaps.map((s) => Number(s.annualYield) / 365),
        source: 'snapshot-est',
      };
    }
    return { labels: [], data: [], source: null };
  };

  const getProjectRev = (projKey) => {
    const p = data.projects[projKey];
    if (!p) return 0;
    const series = projectRevenueSeries(p);
    if (series.data.length) {
      const n = windowLen(timeframe, series.data.length);
      return series.data.slice(-n).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    const cf = p.cashflow || {};
    if (timeframe === '7d') return Number(cf.revenue7d || cf.holders7d || cf.fees7d) || 0;
    if (timeframe === '30d') return Number(cf.revenue30d || cf.holders30d || cf.fees30d) || 0;
    return Number(cf.revenueAllTime || cf.feesAllTime || cf.revenueAnnualized) || 0;
  };

  const roiMaps = {};
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
  }
  const hist = overlayFromMaps(roiMaps, { fill: true });

  const revMaps = {};
  for (const k of order) {
    const series = projectRevenueSeries(data.projects[k]);
    revMaps[k] = seriesToMap(series.labels, series.data);
  }
  const revOverlay = overlayFromMaps(revMaps);

  const tokenMaps = {};
  const nftMaps = {};
  const nftKeys = [];
  for (const k of order) {
    const p = data.projects[k];
    const { maxToken } = burnCaps(p);
    const series = burnSeries(p, timeframe, interval);
    const days = series.rawLabels || [];
    tokenMaps[k] = seriesToMap(
      days,
      (series.data || []).map((burn) => (
        maxToken > 0 ? +Math.min(100, ((Number(burn) || 0) / maxToken) * 100).toFixed(2) : null
      )),
    );
    if (burnCaps(p).nftPct == null) continue;
    nftKeys.push(k);
    const maxNft = Number(p?.ownership?.currentMaxSupply || p?.config?.maxSupply || 0);
    const unit = Number(p?.config?.unitValue) || 0;
    nftMaps[k] = seriesToMap(
      days,
      (series.data || []).map((burn) => {
        if (!(maxNft > 0) || !(unit > 0)) return null;
        return +Math.min(100, (((Number(burn) || 0) / unit) / maxNft) * 100).toFixed(2);
      }),
    );
  }
  const tokenBurn = overlayFromMaps(tokenMaps, { fill: true });
  const nftBurn = overlayFromMaps(nftMaps, { keys: nftKeys, fill: true });

  const actMaps = {};
  for (const k of activationOrder) {
    const histAct = data.projects[k]?.activation?.history || {};
    actMaps[k] = seriesToMap(histAct.labels, histAct.cumulative);
  }
  const actOverlay = overlayFromMaps(actMaps, { keys: activationOrder });

  const nftHolderMaps = {};
  const concMaps = {};
  for (const k of order) {
    const p = data.projects[k];
    const snaps = p?.dailySnapshots || [];
    const nft = snaps.map((s) => (s.nftHolders == null ? null : Number(s.nftHolders)));
    const liveNft = Number(p?.ownership?.nftHolders) || 0;
    if (nft.length && liveNft > 0 && nft[nft.length - 1] == null) nft[nft.length - 1] = liveNft;
    nftHolderMaps[k] = seriesToMap(snaps.map((s) => s.date), nft);
    concMaps[k] = seriesToMap(
      snaps.map((s) => s.date),
      snaps.map((s) => (s.ownershipRatio == null ? null : Number(s.ownershipRatio))),
    );
  }
  const nftHolders = overlayFromMaps(nftHolderMaps);
  const concOverlay = overlayFromMaps(concMaps);

  const roiRows = board.map((meta) => {
    const p = data.projects[meta.key];
    const t0 = p?.tiers?.[0];
    const night = (meta.key === 'nightshades' || p?.config?.kind === 'factions')
      ? typicalNightshadesSeat(p?.factions, t0?.tier || 'T0')
      : null;
    const floorCost = (p?.market?.nftFloorEth || 0) * (p?.market?.ethPriceUsd || 0);
    const actCost = (t0?.reqTokens || 0) * (p?.market?.tokenPriceUsd || 0);
    const totalCost = night?.cost || (t0?.entryUsd > 0 ? t0.entryUsd : floorCost + actCost);
    const annual = night ? night.annual : (Number(t0?.trackedAnnualYieldUsd) || 0);
    const roi = night ? night.roi : (totalCost > 0 && annual > 0 ? (annual / totalCost) * 100 : 0);
    return { meta, p, t0, floorCost, actCost, totalCost, annual, roi, typicalNight: !!night };
  }).sort((a, b) => (b.roi || 0) - (a.roi || 0));

  const revRows = board.map((meta) => ({
    key: meta.key,
    name: meta.name,
    color: projectColors[meta.key],
    value: getProjectRev(meta.key),
    href: projectPath(meta.key, meta.key === 'nightshades' ? 'night' : 'revenue'),
  })).sort((a, b) => b.value - a.value);
  const revTotal = revRows.reduce((s, r) => s + r.value, 0);

  const burnRows = board.map((meta) => {
    const caps = burnCaps(data.projects[meta.key]);
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: caps.tokenPct,
      href: meta.key === 'interns' ? projectPath(meta.key, 'activation') : projectPath(meta.key, 'burn'),
      note: caps.nftPct == null ? 'Token supply' : `NFT ${caps.nftPct.toFixed(2)}%`,
    };
  }).sort((a, b) => b.value - a.value);

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

  const ownRows = board.map((meta) => {
    const p = data.projects[meta.key];
    const conc = Number(p?.ownership?.ownershipRatio);
    return {
      key: meta.key,
      name: meta.name,
      color: projectColors[meta.key],
      value: Number.isFinite(conc) ? conc : 0,
      href: projectPath(meta.key, 'ownership'),
      note: `NFT ${compactNum(p?.ownership?.nftHolders || 0)} · token ${compactNum(p?.ownership?.tokenHolders || p?.ownership?.stonkHolders || p?.ownership?.erc20Holders || 0)}`,
    };
  }).sort((a, b) => b.value - a.value);

  const bestRoi = roiRows.find((r) => r.roi > 0);
  const hrefFor = (tab) => (ds) => projectPath(ds.key, tab);

  return (
    <div className="relative space-y-6 pt-4">
      <div className="sticky top-[var(--header-h,5.5rem)] z-20 -mx-3 bg-[#08090b] px-3" data-share-omit>
        <div className="-mx-1 flex flex-col gap-2 overflow-x-auto border-b border-line px-1 pb-3 pt-4 sm:mx-0 sm:flex-row sm:items-center sm:gap-2 sm:px-0">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <div className="flex shrink-0 items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <WindowBar compact value={timeframe} onChange={setRange} />
              <IntervalBar compact value={interval} onChange={setInterval} />
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'roi' && (
      <ShareSection id="roi" className="space-y-4">
        <Card
          eyebrow="Base-seat CoC"
          sub="Each project’s cheapest live seat, ranked. This is not one combined yield — cost basis and payouts differ, so the table is a comparison, not a rollup."
        >
          <KpiStrip>
            <Stat
              label="Best T0 CoC"
              value={bestRoi ? `${bestRoi.roi.toFixed(1)}%` : '—'}
              tone="accent"
              note={bestRoi?.meta.name}
            />
            <Stat label="Projects" value={String(board.length)} />
            <Stat
              label={`${period} protocol rev`}
              value={compactUsd(revTotal)}
              note="Kept fees only"
            />
          </KpiStrip>
        </Card>

        <Card eyebrow="Cash-on-cash" sub="T0 expected yield ÷ (floor + activation) at last sync.">
          <RankBar
            rows={roiRows.map((r) => ({
              key: r.meta.key,
              name: r.meta.name,
              color: projectColors[r.meta.key],
              value: r.roi,
              href: projectPath(r.meta.key, 'roi'),
              pending: r.p?.underConstruction,
            }))}
            format={(v) => `${Number(v).toFixed(1)}%`}
          />
        </Card>

        <Card flush eyebrow="T0 seats" corner={<YieldPeriodToggle value={yieldPeriod} onChange={setYieldPeriod} />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Project</th>
                  <th className="px-3 py-3 font-normal">Seat</th>
                  <th className="px-3 py-3 font-normal">Cost</th>
                  <th className="px-3 py-3 font-normal">Yield {yieldLabel !== 'Annualized' ? `(${yieldLabel})` : ''}</th>
                  <th className="px-5 py-3 text-right font-normal">CoC</th>
                </tr>
              </thead>
              <tbody>
                {roiRows.map(({ meta, p, t0, actCost, totalCost, annual, roi, typicalNight }) => {
                  const isExpanded = expandedProject === meta.key;
                  const leader = bestRoi?.meta.key === meta.key && roi > 0;
                  return (
                    <React.Fragment key={meta.key}>
                      <tr
                        onClick={() => setExpandedProject(isExpanded ? null : meta.key)}
                        className="cursor-pointer border-b border-line-soft transition-colors hover:bg-panel-2"
                      >
                        <td className="px-5 py-3">
                          <Link
                            to={projectPath(meta.key, 'roi')}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-3"
                          >
                            <img src={logoSrc(meta, p)} alt="" className="h-8 w-8 rounded-md border border-line object-cover bg-panel" />
                            <span className="text-[13px] text-ink underline-offset-2 hover:underline">{meta.name}</span>
                            {leader && <Tag tone="good">best</Tag>}
                            {p?.underConstruction && <Tag tone="warn">pre-launch</Tag>}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-[13px] text-ink">{t0?.name || '—'}</div>
                          <div className="font-mono text-[11px] text-faint">{compactNum(t0?.reqTokens || 0)} {p?.config?.ticker || meta.ticker}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="num text-[13px] text-ink">{compactUsd(totalCost)}</div>
                          <div className="font-mono text-[11px] text-faint">
                            {typicalNight ? 'Typical Shade · 4 factions' : `Floor + ${compactUsd(actCost)}`}
                          </div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {p?.underConstruction ? (
                            <span className="text-faint">TBD</span>
                          ) : (
                            <>{compactUsd(scaleYield(annual))} <span className="font-mono text-[11px] text-muted">{yieldUnit}</span></>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`num text-[13px] ${roi > 0 ? 'text-accent' : 'text-faint'}`}>
                            {p?.underConstruction || !(roi > 0) ? '—' : `${roi.toFixed(1)}%`}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && !p?.underConstruction && (
                        <tr className="border-b border-line-soft bg-panel-2/40">
                          <td colSpan="5" className="px-5 py-4">
                            <p className="mb-2 text-[13px] text-muted">
                              {t0?.rainWeight ? 'VaultLedger rain (annualized)' : 'Trailing 7-day realized yield'} · {t0?.name}
                            </p>
                            <div className="relative h-32 w-full">
                              {seriesHasInk(t0?.dailyYields) ? (
                                <Line
                                  data={{
                                    labels: formatLabels(t0?.dailyDates || []),
                                    datasets: [{
                                      label: 'Daily yield (USD)',
                                      data: t0.dailyYields,
                                      borderColor: projectColors[meta.key],
                                      borderWidth: 2,
                                      tension: 0.3,
                                      pointRadius: 0,
                                    }],
                                  }}
                                  options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }}
                                />
                              ) : (
                                <EmptyChart>No daily yield recorded for this seat</EmptyChart>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </ShareSection>
      )}

      {activeTab === 'historical' && (
      <ShareSection id="historical" className="space-y-4">
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
          T0 CoC over time. One sparkline per project, on its own scale — overlaying them hid every tape except the largest.
        </p>
        <SparkGrid
          overlay={hist}
          hrefFor={hrefFor('historical')}
          tick={(v) => `${compactTick(v)}%`}
          formatValue={(ds) => {
            const v = lastInk(ds.data);
            return v == null ? '—' : `${v.toFixed(1)}%`;
          }}
        />
      </ShareSection>
      )}

      {activeTab === 'revenue' && (
      <ShareSection id="revenue" className="space-y-4">
        <Card
          eyebrow={`${period} protocol revenue`}
          sub="Fees the protocol charged or kept in this window. Stonk dwarfs the rest in dollars, so the mix is a share bar — daily shape is each project’s own sparkline."
        >
          <FigureStrip total={revTotal} leader={revRows[0]} />
          <div className="mt-5">
            <ShareBar parts={revRows} />
          </div>
        </Card>
        <Card eyebrow="Ranked" sub={`${period} totals, same unit (USD).`}>
          <RankBar rows={revRows} />
        </Card>
        <SparkGrid
          overlay={revOverlay}
          hrefFor={(ds) => projectPath(ds.key, ds.key === 'nightshades' ? 'night' : 'revenue')}
          tick={compactUsdTick}
          formatValue={(ds) => compactUsd(sumInk(ds.data))}
          noteFor={() => `${period} in view`}
        />
      </ShareSection>
      )}

      {activeTab === 'burn' && (
      <ShareSection id="burn" className="space-y-4">
        <Card
          eyebrow="Share of own supply burnt"
          sub="Normalized to each token’s cap, so a 3k collection is comparable to a million-supply ERC-20. Raw token counts are not."
        >
          <RankBar rows={burnRows} format={(v) => `${Number(v).toFixed(2)}%`} />
        </Card>
        <SparkGrid
          overlay={tokenBurn}
          hrefFor={(ds) => ds.key === 'interns' ? projectPath(ds.key, 'activation') : projectPath(ds.key, 'burn')}
          tick={(v) => `${compactTick(v)}%`}
          formatValue={(ds) => {
            const v = lastInk(ds.data);
            return v == null ? '—' : `${v.toFixed(2)}%`;
          }}
        />
        {nftBurn.datasets.length ? (
          <>
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
              Equivalent NFT supply removed — percent of that collection, not stacked units.
            </p>
            <SparkGrid
              overlay={nftBurn}
              hrefFor={hrefFor('burn')}
              tick={(v) => `${compactTick(v)}%`}
              formatValue={(ds) => {
                const v = lastInk(ds.data);
                return v == null ? '—' : `${v.toFixed(2)}%`;
              }}
            />
          </>
        ) : null}
      </ShareSection>
      )}

      {activeTab === 'activation' && (
      <ShareSection id="activation" className="space-y-4">
        <Card
          eyebrow="% of own collection earning"
          sub="A doughnut of raw active units called Stonk ‘dominant’ because the collection is larger. The fair rank is percent activated on each supply."
        >
          <RankBar rows={actRows} format={(v) => `${Number(v).toFixed(1)}%`} />
        </Card>
        <SparkGrid
          overlay={actOverlay}
          hrefFor={hrefFor('activation')}
          formatValue={(ds) => compactNum(lastInk(ds.data) || 0)}
          noteFor={() => 'Net active · own scale'}
        />
      </ShareSection>
      )}

      {activeTab === 'ownership' && (
      <ShareSection id="ownership" className="space-y-4">
        <Card
          eyebrow="Concentration"
          sub="Unique NFT wallets ÷ circulating supply. Holder headcount is not comparable across collections of different size, so it sits as a note, not the axis."
        >
          <RankBar rows={ownRows} format={(v) => `${Number(v).toFixed(2)}%`} />
        </Card>
        <SparkGrid
          overlay={concOverlay.datasets.length ? concOverlay : nftHolders}
          hrefFor={hrefFor('ownership')}
          tick={concOverlay.datasets.length ? (v) => `${compactTick(v)}%` : compactTick}
          formatValue={(ds) => {
            const v = lastInk(ds.data);
            if (v == null) return '—';
            return concOverlay.datasets.length ? `${v.toFixed(2)}%` : compactNum(v);
          }}
        />
      </ShareSection>
      )}

      {activeTab === 'rankings' && (
      <ShareSection id="rankings">
        <OverviewView data={data} pending={pending} compact />
      </ShareSection>
      )}

      <MethodologyCard>
        <p><strong className="text-white">What this board is for:</strong> Compare projects. It does not add them into one protocol. Each series is fetched on its own contracts. Overlaying raw units or dollars on one axis hid every tape except the largest, so ranks use a shared unit (CoC %, burn % of own cap, % activated) and history is a sparkline per project on its own scale.</p>
        <p><strong className="text-white">Revenue:</strong> Protocol-kept fees only. StonkBrokers StonkBooster is the mix on that project page. Nightshades Night vault WETH is not copied here. Bonding volume is notional.</p>
        <p><strong className="text-white">All tiers:</strong> Cost repriced on each load. Yield is the same trailing sample as the project ROI tab. Cross-project APY is not comparable 1:1 because cost basis and payout mechanics differ.</p>
      </MethodologyCard>
    </div>
  );
}

function FigureStrip({ total, leader }) {
  const share = total > 0 && leader ? (leader.value / total) * 100 : 0;
  return (
    <KpiStrip>
      <Stat label="Window total" value={compactUsd(total)} />
      <Stat label="Leader" value={leader?.name || '—'} note={leader ? compactUsd(leader.value) : null} />
      <Stat label="Leader share" value={total > 0 ? `${share.toFixed(0)}%` : '—'} />
    </KpiStrip>
  );
}
