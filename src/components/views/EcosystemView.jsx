import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { projectPath, PROJECTS, isProjectLive } from '../../lib/routes';
import { useSectionScrollSpy } from '../../lib/projectScroll';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import OverviewView from './OverviewView';
import { compactUsd, compactNum, WindowBar } from '../kit';
import { protocolRevenueChart, windowSnapshots, seriesHasInk } from '../../lib/yieldHistory';
import { useChartWindow } from '../../lib/chartWindow';
import { baseChartOptions, compactTick, compactUsdTick, PROJECT_COLORS } from '../../lib/charts';
import { EmptyChart } from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const ECO_TABS = [
  { id: 'roi', label: 'ROI Benchmarks' },
  { id: 'historical', label: 'Historical Yield' },
  { id: 'revenue', label: 'Revenue & LPs' },
  { id: 'burn', label: 'Burn Tracker' },
  { id: 'activation', label: 'Activation' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'rankings', label: 'Rankings' },
];

function lastFinite(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = Number(arr[i]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** One protocol, one Y-axis. Overlaying 8 series on a shared scale hides everyone except the outlier. */
function EcoMiniChart({ title, value, color, labels, data, kind = 'line', yTick, note, to }) {
  const has = seriesHasInk(data);
  const chartData = {
    labels: labels || [],
    datasets: [{
      label: title,
      data: data || [],
      borderColor: color,
      backgroundColor: kind === 'bar' ? color : `${color}22`,
      borderWidth: kind === 'bar' ? 0 : 2,
      fill: kind !== 'bar',
      tension: 0.3,
      pointRadius: 0,
      borderRadius: 3,
      spanGaps: true,
    }],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 5, maxRotation: 0 } },
      y: { min: 0, grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: yTick, maxTicksLimit: 4 } },
    },
  };

  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {title}
          </p>
          {note ? <p className="mt-0.5 text-[10px] text-slate-500">{note}</p> : null}
        </div>
        {value != null ? (
          <p className="shrink-0 text-sm font-extrabold" style={{ color }}>{value}</p>
        ) : null}
      </div>
      <div className="relative h-36 w-full sm:h-44">
        {!has ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">No series yet</div>
        ) : kind === 'bar' ? (
          <Bar data={chartData} options={options} />
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </>
  );

  const frame = 'bg-[#0e1013] border border-[#1e2228] rounded-xl p-4';
  if (!to) return <div className={frame}>{body}</div>;
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (e.target.closest('button')) e.preventDefault();
      }}
      className={`${frame} block cursor-pointer transition hover:border-slate-500 hover:bg-[#101318]`}
    >
      {body}
    </Link>
  );
}

export default function EcosystemView({ data, pending = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab = ECO_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'roi';
  const [expandedProject, setExpandedProject] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [timeframe, setTimeframe] = useChartWindow();

  const onActiveId = useCallback((id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'roi') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useSectionScrollSpy({
    sectionIds: ECO_TABS.map((t) => t.id),
    activeId: activeTab,
    onActiveId,
    ready: !!(data && data.projects),
  });

  const selectTab = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'roi') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  };

  if (!data || !data.projects) return <div className="text-center text-slate-400 p-12">Loading Ecosystem...</div>;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const hidden = new Set(PROJECTS.filter((p) => !isProjectLive(p)).map((p) => p.key));
  const order = ['stonk', 'mancer', 'tickeryard', 'cardwall', 'index', 'printer', 'oakmont', 'coattail'].filter(
    (k) => !hidden.has(k)
  );
  const activationOrder = order.filter((k) => {
    const kind = data.projects[k]?.config?.kind;
    return kind !== 'cashflow' && kind !== 'vault';
  });
  const projectNames = { stonk: 'StonkBrokers', mancer: 'Mancer', tickeryard: 'TickerYard', cardwall: 'The Card Wall', index: 'The Index', printer: 'RH Machines', oakmont: 'Oakmont', coattail: 'Coattail Brokers' };
  const projectColors = PROJECT_COLORS;
  const projectLogos = { stonk: 'Stonkbroker.png', mancer: 'logo.png', tickeryard: 'Yardkeepers.png', cardwall: 'wall.png', index: 'Index.png', printer: 'Printer.png', oakmont: 'Oakmont.png', coattail: 'Coattail.svg' };

  const scaleYield = (annual) => {
    if (yieldPeriod === 'D') return (annual || 0) / 365;
    if (yieldPeriod === 'M') return (annual || 0) / 12;
    return annual || 0;
  };
  const yieldPeriodLabel = yieldPeriod === 'D' ? 'Daily' : yieldPeriod === 'M' ? 'Monthly' : 'Annualized';
  const yieldSuffix = yieldPeriod === 'D' ? '/day' : yieldPeriod === 'M' ? '/mo' : '/yr';

  const chartOptions = baseChartOptions();

  const percentChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: { min: 0, ticks: { color: '#cbd5e1', callback: (v) => `${compactTick(v)}%` }, grid: { color: '#1e2228', borderDash: [4, 4] } }
    }
  };

  // =========================================================
  // UNIVERSAL DATA ARRAYS & SAFE-PADDING ENGINES
  // =========================================================
  const stonk = data.projects.stonk || {};
  const snapWin = (p) => windowSnapshots(p?.dailySnapshots, timeframe);

  const getSliceCount = (tf, totalLen) => {
    if (tf === '1d') return Math.min(1, totalLen);
    if (tf === '7d' || tf === '1w') return Math.min(7, totalLen);
    if (tf === '30d' || tf === '1m') return Math.min(30, totalLen);
    return totalLen;
  };

  const labelSortKey = (label) => {
    const m = String(label || '').match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) return 0;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = month >= 7 ? 2026 : 2026;
    return Date.UTC(year, month - 1, day);
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

  const cashflowRoiByDate = (p) => {
    const dates = p?.cashflow?.dailyDates || [];
    const revs = p?.cashflow?.dailyRevenue || [];
    const circ = Number(p?.ownership?.circulatingSupply) || 0;
    const price = Number(p?.market?.tokenPriceUsd) || 0;
    const req = Number(p?.tiers?.[0]?.reqTokens) || 0;
    const map = {};
    if (!dates.length || !(price > 0)) return map;
    dates.forEach((date, i) => {
      const day = Number(revs[i]) || 0;
      const cost = req > 0 ? req * price : circ * price;
      const annualForStake = circ > 0 && req > 0 ? day * (req / circ) * 365 : day * 365;
      map[date] = cost > 0 ? (annualForStake / cost) * 100 : null;
    });
    return map;
  };

  // =========================================================
  // REVENUE — per-project series (do not force everyone onto Stonk's dates)
  // =========================================================
  const projectRevenueSeries = (p) => {
    const chart = protocolRevenueChart(p);
    if (chart.labels?.length) {
      const data = chart.labels.map((_, i) =>
        (chart.cols || []).reduce((s, c) => s + (Number(c.data?.[i]) || 0), 0)
      );
      if (data.some((v) => v > 0)) return { labels: chart.labels, data, source: 'protocol' };
    }
    const snaps = Array.isArray(p?.dailySnapshots) ? p.dailySnapshots : [];
    if (snaps.some((s) => Number(s.annualYield) > 0)) {
      return {
        labels: snaps.map((s) => s.date),
        data: snaps.map((s) => Number(s.annualYield) / 365),
        source: 'snapshot-est',
      };
    }
    return { labels: [], data: [], source: null };
  };

  const getProjectRev = (projKey, timeframe) => {
    const p = data.projects[projKey];
    if (!p) return 0;
    const series = projectRevenueSeries(p);
    if (series.data.length) {
      const n = getSliceCount(timeframe, series.data.length);
      return series.data.slice(-n).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    const cf = p.cashflow || {};
    if (timeframe === '1d') return Number(cf.revenue24h || cf.fees24h) || 0;
    if (timeframe === '7d') return Number(cf.revenue7d || cf.holders7d || cf.fees7d) || 0;
    if (timeframe === '30d') return Number(cf.revenue30d || cf.holders30d || cf.fees30d) || 0;
    return Number(cf.revenueAllTime || cf.feesAllTime || cf.revenueAnnualized) || 0;
  };

  const getHistChartData = (timeframe) => {
    const labelSet = new Set();
    const roiMaps = {};
    for (const k of order) {
      const p = data.projects[k];
      const t0 = p?.tiers?.[0];
      const map = { ...cashflowRoiByDate(p) };
      for (const s of p?.dailySnapshots || []) {
        const row = s.tiers?.find((st) => st.tier === (t0?.tier || 'T0'));
        const roi = row?.roi != null ? Number(row.roi) : (s.roi != null ? Number(s.roi) : null);
        if (Number.isFinite(roi)) map[s.date] = roi;
      }
      roiMaps[k] = map;
      Object.keys(map).forEach((d) => labelSet.add(d));
    }
    const labels = [...labelSet]
      .sort((a, b) => labelSortKey(a) - labelSortKey(b));
    const sliceCount = getSliceCount(timeframe, labels.length);
    const slicedLabels = labels.slice(-sliceCount);

    const datasets = order.map((k) => {
      const raw = slicedLabels.map((d) => {
        const v = roiMaps[k][d];
        return Number.isFinite(v) ? v : null;
      });
      let started = false;
      let last = null;
      const dataPts = raw.map((v) => {
        if (!started) {
          if (v == null || v === 0) return null;
          started = true;
          last = v;
          return v;
        }
        if (v == null) return last;
        last = v;
        return v;
      });
      return {
        label: projectNames[k],
        data: dataPts,
        borderColor: projectColors[k],
        backgroundColor: `${projectColors[k]}10`,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 2,
        spanGaps: false,
      };
    });

    return { labels: slicedLabels, datasets };
  };

  return (
    <div className="space-y-6 pt-4 relative">
      
      {/* ECOSYSTEM TAB NAVIGATION */}
      <div className="sticky top-[4.25rem] z-20 -mx-1 mb-6 flex w-full items-center gap-2 overflow-x-auto bg-[#08090b]/90 px-1 py-2 backdrop-blur sm:top-[4.75rem]">
        <div className="flex min-w-0 flex-1 gap-2">
        {ECO_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={`shrink-0 px-3 py-2 rounded-lg font-semibold transition text-xs md:text-sm ${
              activeTab === tab.id
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-transparent border border-[#1e2228] hover:bg-[#0e1013] text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
        </div>
        <WindowBar compact value={timeframe} onChange={setTimeframe} />
      </div>

      {/* ========================================================= */}
      {/* TAB 1: ROI BENCHMARKS */}
      {/* ========================================================= */}
      <section id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"></path></svg>
                Global Yield ROI Benchmarks
              </h3>
              <p className="text-xs text-slate-400 mt-1">Last automated sync: Just now</p>
            </div>
          </div>

          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-4 font-medium pl-2">Project</th>
                  <th className="pb-4 font-medium">Base Tier (T0) Req.</th>
                  <th className="pb-4 font-medium">Total Entry Cost</th>
                  <th className="pb-4 font-medium">
                    <div className="flex items-center gap-2">
                      <span>Expected Yield <span className="normal-case">({yieldPeriodLabel})</span></span>
                      <div className="flex bg-[#08090b] rounded-md p-0.5 border border-[#1e2228] normal-case">
                        {['D', 'M', 'Y'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setYieldPeriod(p); }}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              yieldPeriod === p ? 'bg-[#1e2228] text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </th>
                  <th className="pb-4 font-medium text-right pr-4">Est. ROI (CoC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2228]/50 text-sm">
                {order.map(k => {
                  const p = data.projects[k];
                  if (!p) return null;
                  
                  const t0 = p.tiers?.[0];
                  const floorCost = (p.market?.nftFloorEth || 0) * (p.market?.ethPriceUsd || 0);
                  const actCost = (t0?.reqTokens || 0) * (p.market?.tokenPriceUsd || 0);
                  const totalCost = floorCost + actCost;
                  const roi = totalCost > 0 && t0 ? ((t0.trackedAnnualYieldUsd || 0) / totalCost) * 100 : 0;
                  const isExpanded = expandedProject === k;

                  return (
                    <React.Fragment key={k}>
                      <tr 
                        onClick={() => setExpandedProject(isExpanded ? null : k)}
                        className="hover:bg-[#1e2228]/20 transition cursor-pointer group"
                      >
                        <td className="py-5 pl-2">
                          <div className="flex items-center gap-3">
                            <Link
                              to={projectPath(k, 'roi')}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-3 rounded-md hover:opacity-90"
                            >
                              <img src={`/${projectLogos[k]}`} alt={projectNames[k]} className="w-8 h-8 rounded-md border border-[#1e2228] object-cover bg-[#08090b]" />
                              <span className="font-bold text-white underline-offset-2 hover:underline">{projectNames[k]}</span>
                            </Link>
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{t0?.name || 'TBD'}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{formatNumber(t0?.reqTokens || 0)} {p.config?.ticker}</div>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{formatCurrency(totalCost)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Floor + {formatCurrency(actCost)} Act.</div>
                        </td>
                        <td className="py-5">
                          {p.underConstruction ? (
                            <span className="text-slate-500 italic text-sm">Initializing...</span>
                          ) : (
                            <><span className="text-white font-bold text-base">{formatCurrency(scaleYield(t0?.trackedAnnualYieldUsd || 0))}</span> <span className="text-slate-500">{yieldSuffix}</span></>
                          )}
                        </td>
                        <td className="py-5 text-right pr-4">
                          <div className="flex items-center justify-end gap-3">
                            {p.underConstruction ? (
                              <span className="bg-amber-900/20 text-amber-400 border border-amber-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">TBD / BUILDING</span>
                            ) : (
                              <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">{roi.toFixed(2)}%</span>
                            )}
                            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && !p.underConstruction && (
                        <tr className="bg-[#08090b]/40 border-b border-[#1e2228]/50">
                          <td colSpan="5" className="p-4 md:p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">
                                {t0?.rainWeight
                                  ? 'VaultLedger rain (annualized)'
                                  : 'Trailing 7-day realized yield'} ({t0?.name})
                              </h4>
                              <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                            </div>
                            <div className="relative h-32 md:h-40 w-full">
                              {seriesHasInk(t0?.dailyYields) ? (
                                <Line 
                                  data={{ 
                                    labels: t0?.dailyDates?.length ? t0.dailyDates : masterRevLabels.slice(-7), 
                                    datasets: [{ 
                                      label: 'Daily Yield (USD)', 
                                      data: t0.dailyYields, 
                                      borderColor: projectColors[k], 
                                      backgroundColor: `${projectColors[k]}15`, 
                                      borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 
                                    }] 
                                  }} 
                                  options={chartOptions} 
                                />
                              ) : (
                                <EmptyChart>No daily yield recorded for this tier</EmptyChart>
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
        </div>
      </section>

      {/* ========================================================= */}
      {/* TAB 2: HISTORICAL YIELD (No more sea of zeros!) */}
      {/* ========================================================= */}
      <section id="historical" className="scroll-mt-32">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Historical protocol ROI</h3>
              <p className="text-xs text-slate-400 mt-1">
                Each project gets its own scale. Overlaying Coattail at 1,000%+ with Stonk at ~8% made everyone else look flat.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(() => {
              const hist = getHistChartData(timeframe);
              return hist.datasets.map((ds, i) => {
                const k = order[i];
                const latest = lastFinite(ds.data);
                return (
                  <EcoMiniChart
                    key={k}
                    title={ds.label}
                    color={projectColors[k]}
                    labels={hist.labels}
                    data={ds.data}
                    yTick={(v) => `${compactTick(v)}%`}
                    value={latest == null ? null : `${latest.toFixed(1)}%`}
                    to={projectPath(k, 'historical')}
                  />
                );
              });
            })()}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TAB 3: REVENUE & LPS */}
      {/* ========================================================= */}
      <section id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg md:text-xl font-bold text-white">Ecosystem Revenue Streams</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {order.map(k => (
              <Link
                key={k}
                to={projectPath(k, 'revenue')}
                className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm transition hover:border-slate-500 hover:bg-[#101318]"
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                  {projectNames[k]} Revenue
                </p>
                <p className="text-2xl font-extrabold" style={{color: projectColors[k]}}>
                  {formatCurrency(getProjectRev(k, timeframe))}
                </p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {order.map((k) => {
              const series = projectRevenueSeries(data.projects[k]);
              const n = getSliceCount(timeframe, series.data.length);
              const note = k === 'printer'
                ? (series.source === 'snapshot-est'
                  ? 'Volume-tax estimate (annual / 365). Stock gacha is not indexed yet.'
                  : 'Volume-tax estimate. Stock gacha is not indexed yet.')
                : null;
              return (
                <EcoMiniChart
                  key={k}
                  title={projectNames[k]}
                  color={projectColors[k]}
                  labels={series.labels.slice(-n)}
                  data={series.data.slice(-n)}
                  kind="bar"
                  yTick={compactUsdTick}
                  value={formatCurrency(getProjectRev(k, timeframe))}
                  note={note}
                  to={projectPath(k, 'revenue')}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TAB 4: BURN TRACKER (Calculated w/ dynamic max supply) */}
      {/* ========================================================= */}
      <section id="burn" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {order.map(k => {
              const p = data.projects[k];
              const { tokenPct, nftPct } = burnCaps(p);

              return (
                <Link
                  key={k}
                  to={projectPath(k, 'burn')}
                  className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm transition hover:border-slate-500 hover:bg-[#101318]"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                    {projectNames[k]} Deflation
                  </p>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-xs text-slate-400">Token Burn</span>
                    <span className="text-emerald-400 font-bold">{tokenPct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-xs text-slate-400">NFT Burn</span>
                    <span className="text-blue-400 font-bold">{nftPct == null ? '—' : `${nftPct.toFixed(2)}%`}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-1">Cumulative token supply burnt (%)</h3>
            <p className="text-xs text-slate-400 mb-4">From daily snapshots. No invented curves.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {order.map((k) => {
                const p = data.projects[k];
                const { maxToken } = burnCaps(p);
                const snaps = snapWin(p);
                const series = snaps.map((s) => {
                  const burn = Number(s.totalBurn) || 0;
                  return maxToken > 0 ? +Math.min(100, (burn / maxToken) * 100).toFixed(2) : 0;
                });
                const last = series.length ? series[series.length - 1] : null;
                return (
                  <EcoMiniChart
                    key={`burn-${k}`}
                    title={projectNames[k]}
                    color={projectColors[k]}
                    labels={snaps.map((s) => s.date)}
                    data={series}
                    yTick={(v) => `${compactTick(v)}%`}
                    value={last == null ? null : `${last.toFixed(2)}%`}
                    to={projectPath(k, 'burn')}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-1">Equivalent NFT supply removed (%)</h3>
            <p className="text-xs text-slate-400 mb-4">Units removed vs max NFT supply, from the same snapshots.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {order.filter((k) => burnCaps(data.projects[k]).nftPct != null).map((k) => {
                const p = data.projects[k];
                const maxNft = Number(p?.ownership?.currentMaxSupply || p?.config?.maxSupply || 0);
                const unit = Number(p?.config?.unitValue) || 0;
                const snaps = snapWin(p);
                const series = snaps.map((s) => {
                  if (!(maxNft > 0) || !(unit > 0)) return 0;
                  const units = (Number(s.totalBurn) || 0) / unit;
                  return +Math.min(100, (units / maxNft) * 100).toFixed(2);
                });
                const last = series.length ? series[series.length - 1] : null;
                return (
                  <EcoMiniChart
                    key={`nftburn-${k}`}
                    title={projectNames[k]}
                    color={projectColors[k]}
                    labels={snaps.map((s) => s.date)}
                    data={series}
                    yTick={(v) => `${compactTick(v)}%`}
                    value={last == null ? null : `${last.toFixed(2)}%`}
                    to={projectPath(k, 'burn')}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TAB 5: ACTIVATION (Restored to elegant 0-curve starts) */}
      {/* ========================================================= */}
      <section id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {activationOrder.map(k => {
              const p = data.projects[k];
              const actCount = p?.activation?.activeCount || 0;
              const pct = p?.activation?.percentActivated || 0;
              return (
                <Link
                  key={k}
                  to={projectPath(k, 'activation')}
                  className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm transition hover:border-slate-500 hover:bg-[#101318]"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                    {projectNames[k]} Active
                  </p>
                  <p className="text-2xl font-extrabold text-white">{formatNumber(actCount)}</p>
                  <p className="text-xs text-slate-500 mt-1">{pct.toFixed(1)}% of Supply</p>
                </Link>
              );
            })}
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-6">Ecosystem Dominance (Share of Total Active Units)</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
              <div className="relative h-64 md:h-72 w-full md:w-1/2 flex items-center justify-center">
                <Doughnut 
                  data={{ 
                    labels: activationOrder.map(k => projectNames[k]), 
                    datasets: [{ 
                      data: activationOrder.map(k => data.projects[k]?.activation?.activeCount || 0), 
                      backgroundColor: activationOrder.map(k => projectColors[k]), 
                      borderWidth: 0 
                    }] 
                  }} 
                  options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }} 
                />
              </div>
              <div className="w-full md:w-1/2 flex flex-col gap-3">
                {activationOrder.map(k => (
                  <Link
                    key={k}
                    to={projectPath(k, 'activation')}
                    className="flex justify-between items-center bg-[#08090b] p-3 rounded-lg border border-[#1e2228] transition hover:border-slate-500"
                  >
                    <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-md" style={{backgroundColor: projectColors[k]}}></div><span className="text-sm font-bold text-slate-300">{projectNames[k]}</span></div>
                    <span className="text-white font-bold tracking-wide">{formatNumber(data.projects[k]?.activation?.activeCount || 0)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-1">Net active units</h3>
            <p className="text-xs text-slate-400 mb-4">From each project’s recorded activation history. Missing history is a blank mini, not a made-up curve.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {activationOrder.map((k) => {
                const p = data.projects[k];
                const hist = p?.activation?.history || {};
                const labels = Array.isArray(hist.labels) ? hist.labels : [];
                const series = Array.isArray(hist.cumulative) ? hist.cumulative : [];
                const n = getSliceCount(timeframe, labels.length);
                const last = lastFinite(series);
                return (
                  <EcoMiniChart
                    key={`act-${k}`}
                    title={projectNames[k]}
                    color={projectColors[k]}
                    labels={labels.slice(-n)}
                    data={series.slice(-n)}
                    yTick={compactTick}
                    value={last == null ? null : formatNumber(last)}
                    to={projectPath(k, 'activation')}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TAB 6: OWNERSHIP (Anomaly filtered to prevent RPC crashes) */}
      {/* ========================================================= */}
      <section id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg md:text-xl font-bold text-white">Ecosystem Holder Distribution</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {order.map(k => {
              const p = data.projects[k];
              const nfts = Number(p?.ownership?.nftHolders) || 0;
              
              // Filter out 0 reads if RPC fails
              let tokens = Number(p?.ownership?.tokenHolders) || Number(p?.ownership?.stonkHolders) || Number(p?.ownership?.erc20Holders) || 0;

              return (
                <Link
                  key={k}
                  to={projectPath(k, 'ownership')}
                  className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm transition hover:border-slate-500 hover:bg-[#101318]"
                >
                  <div className="flex items-center gap-2 mb-3">
                     <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                     <span className="font-bold text-white text-sm">{projectNames[k]}</span>
                  </div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] text-slate-400 uppercase">NFT Holders</span>
                    <span className="text-white font-bold">{formatNumber(nfts)}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-slate-400 uppercase">Token Holders</span>
                    <span className="text-white font-bold">{formatNumber(tokens)}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-1">NFT holders</h3>
            <p className="text-xs text-slate-400 mb-4">Snapshot nftHolders when present; otherwise the live count as a single point.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {order.map((k) => {
                const p = data.projects[k];
                const snaps = snapWin(p);
                const series = snaps.map((s) => Number(s.nftHolders) || null);
                const live = Number(p?.ownership?.nftHolders) || 0;
                if (series.length && live > 0 && series[series.length - 1] == null) series[series.length - 1] = live;
                return (
                  <EcoMiniChart
                    key={`nft-h-${k}`}
                    title={projectNames[k]}
                    color={projectColors[k]}
                    labels={snaps.map((s) => s.date)}
                    data={series}
                    yTick={compactTick}
                    value={live > 0 ? formatNumber(live) : null}
                    to={projectPath(k, 'ownership')}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-1">Token holders</h3>
            <p className="text-xs text-slate-400 mb-4">hourly historicalGrowth when it exists; else snapshot tokenHolders.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {order.map((k) => {
                const p = data.projects[k];
                const hist = p?.ownership?.historicalGrowth || {};
                let labels = Array.isArray(hist.labels) ? hist.labels : [];
                let series = Array.isArray(hist.data) ? hist.data.map(Number) : [];
                if (!labels.length) {
                  const snaps = snapWin(p);
                  labels = snaps.map((s) => s.date);
                  series = snaps.map((s) => Number(s.tokenHolders) || null);
                }
                const n = getSliceCount(timeframe, labels.length);
                const live = Number(p?.ownership?.tokenHolders) || Number(p?.ownership?.stonkHolders) || 0;
                return (
                  <EcoMiniChart
                    key={`tok-h-${k}`}
                    title={projectNames[k]}
                    color={projectColors[k]}
                    labels={labels.slice(-n)}
                    data={series.slice(-n)}
                    yTick={compactTick}
                    value={live > 0 ? formatNumber(live) : null}
                    to={projectPath(k, 'ownership')}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="rankings" className="scroll-mt-32">
        <OverviewView data={data} pending={pending} compact />
      </section>

      {/* DYNAMIC DISCLAIMER */}
      <div className="bg-[#0e1013] rounded-xl p-5 md:p-6 border border-[#1e2228] shadow-lg mt-8">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
          <h3 className="text-base md:text-lg font-bold text-white">Methodology & Disclaimer</h3>
        </div>
        <div className="text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-4">
          <p><strong className="text-white">Global Ecosystem Analytics:</strong> Metrics shown aggregate live on-chain events across all registered Robinhood Network protocols.</p>
        </div>
        <p className="text-xs md:text-sm text-slate-400 italic leading-relaxed border-t border-[#1e2228] pt-5">
          <strong className="text-slate-300 not-italic">Disclaimer:</strong> Tracked yield values are calculated using Mark-to-Market spot pricing at the exact time of the dashboard's last automated sync. Yields fluctuate based on network activation weight, market token prices, and community protocol volume. This is a community-built tracking tool and does not guarantee future returns.
        </p>
      </div>

    </div>
  );
}