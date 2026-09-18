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
import { CopyPageButton } from '../CopyControl';
import { copyShareCard } from '../../lib/share';
import { buildEcosystemShareCard } from '../../lib/projectShare';
import { dateKey, formatLabels } from '../../lib/dates';
import { burnSeries } from '../../lib/burn';
import { cashflowRoiByDate, protocolFeeCols, protocolRevenueChart, seriesHasInk } from '../../lib/yieldHistory';
import { useChartWindow } from '../../lib/chartWindow';
import { baseChartOptions, compactTick, compactUsdTick, PROJECT_COLORS } from '../../lib/charts';
import { ChartPanel, EmptyChart } from '../HistoryCharts';
import { MethodologyCard } from '../Disclaimer';

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

function EcoTogether({ title, note, labels, datasets, options, kind = 'line' }) {
  const ink = (datasets || []).filter((d) => seriesHasInk(d.data));
  return (
    <ChartPanel title={title} note={note}>
      {ink.length ? (
        kind === 'bar' ? (
          <Bar data={{ labels, datasets: ink }} options={options} />
        ) : (
          <Line data={{ labels, datasets: ink }} options={options} />
        )
      ) : (
        <EmptyChart />
      )}
    </ChartPanel>
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
  const order = ['stonk', 'interns', 'mancer', 'tickeryard', 'cardwall', 'index', 'printer', 'oakmont', 'coattail', 'nightshades'].filter(
    (k) => !hidden.has(k)
  );
  const activationOrder = order.filter((k) => {
    const kind = data.projects[k]?.config?.kind;
    return kind !== 'cashflow' && kind !== 'vault';
  });
  const projectNames = { stonk: 'StonkBrokers', interns: 'Interns', mancer: 'Mancer', tickeryard: 'TickerYard', cardwall: 'The Card Wall', index: 'The Index', printer: 'RH Machines', oakmont: 'Oakmont', coattail: 'Coattail Brokers', nightshades: 'Nightshades' };
  const projectColors = PROJECT_COLORS;
  const projectLogos = { stonk: 'Stonkbroker.png', interns: 'Interns.svg', mancer: 'logo.png', tickeryard: 'Yardkeepers.png', cardwall: 'wall.png', index: 'Index.png', printer: 'Printer.png', oakmont: 'Oakmont.png', coattail: 'Coattail.svg', nightshades: 'Knight.png' };

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

  const usdChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        beginAtZero: true,
        ticks: { ...chartOptions.scales.y.ticks, callback: compactUsdTick },
      },
    },
  };

  const countChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        beginAtZero: true,
        ticks: { ...chartOptions.scales.y.ticks, callback: compactTick },
      },
    },
  };

  // =========================================================
  // UNIVERSAL DATA ARRAYS & SAFE-PADDING ENGINES
  // =========================================================
  const getSliceCount = (tf, totalLen) => {
    if (tf === '1d') return Math.min(1, totalLen);
    if (tf === '7d' || tf === '1w') return Math.min(7, totalLen);
    if (tf === '30d' || tf === '1m') return Math.min(30, totalLen);
    return totalLen;
  };

  const overlayFromMaps = (maps, { keys = order, fill = false } = {}) => {
    const labelSet = new Set();
    for (const map of Object.values(maps)) {
      Object.keys(map || {}).forEach((d) => labelSet.add(dateKey(d)));
    }
    const raw = [...labelSet].filter(Boolean).sort();
    const sliced = raw.slice(-getSliceCount(timeframe, raw.length));
    const datasets = keys.map((k) => {
      const map = maps[k] || {};
      let started = false;
      let last = null;
      const dataPts = sliced.map((d) => {
        const n = Number(map[d]);
        const val = Number.isFinite(n) ? n : null;
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
        label: projectNames[k],
        data: dataPts,
        borderColor: projectColors[k],
        backgroundColor: `${projectColors[k]}12`,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        spanGaps: true,
        fill: false,
      };
    }).filter((ds) => seriesHasInk(ds.data));
    return { labels: formatLabels(sliced), datasets };
  };

  const seriesToMap = (labels, data) => {
    const map = {};
    (labels || []).forEach((lab, i) => {
      map[dateKey(lab)] = data?.[i];
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

  // =========================================================
  // REVENUE — per-project series (do not force everyone onto Stonk's dates)
  // =========================================================
  const projectRevenueSeries = (p) => {
    const chart = protocolRevenueChart(p);
    if (chart.labels?.length) {
      const fees = protocolFeeCols(chart.cols);
      const data = chart.labels.map((_, i) =>
        fees.reduce((s, c) => s + (Number(c.data?.[i]) || 0), 0)
      );
      if (data.some((v) => v > 0)) return { labels: chart.labels, data, source: 'protocol' };
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

  const getHistChartData = () => {
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
    return overlayFromMaps(roiMaps, { fill: true });
  };

  return (
    <div className="space-y-6 pt-4 relative">
      
      {/* ECOSYSTEM TAB NAVIGATION */}
      <div className="sticky top-[4.25rem] z-20 -mx-1 mb-6 flex w-full items-center gap-2 overflow-x-auto bg-[#08090b]/90 px-1 py-2 backdrop-blur sm:top-[4.75rem]" data-share-omit>
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
        <CopyPageButton
          idleLabel="Copy for X"
          title="Copy a compact 16:9 image for X"
          onCopy={() => copyShareCard(buildEcosystemShareCard(data, { timeframe }))}
        />
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
                                    labels: formatLabels(t0?.dailyDates || []), 
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
          {(() => {
            const hist = getHistChartData();
            return (
              <EcoTogether
                title="Historical protocol ROI"
                note="Live projects on one axis. T0 CoC from snapshots. Daily cash-flow projects can backfill from holders rev; Oakmont’s indexer is monthly, so those buckets stay off this chart."
                labels={hist.labels}
                datasets={hist.datasets}
                options={percentChartOptions}
              />
            );
          })()}
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
                to={projectPath(k, k === 'nightshades' ? 'night' : 'revenue')}
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

          {(() => {
            const maps = {};
            for (const k of order) {
              const series = projectRevenueSeries(data.projects[k]);
              maps[k] = seriesToMap(series.labels, series.data);
            }
            const overlay = overlayFromMaps(maps);
            return (
              <EcoTogether
                title="Daily protocol revenue"
                note="Protocol-charged or kept rev only — AMM, Clock-In locker fees, snipe / curve tax, Smart LP skim. Bonding swap volume is excluded."
                labels={overlay.labels}
                datasets={overlay.datasets}
                options={usdChartOptions}
              />
            );
          })()}
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

          {(() => {
            const tokenMaps = {};
            const nftMaps = {};
            const nftKeys = [];
            for (const k of order) {
              const p = data.projects[k];
              const { maxToken } = burnCaps(p);
              const series = burnSeries(p, timeframe);
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
            const token = overlayFromMaps(tokenMaps, { fill: true });
            const nft = overlayFromMaps(nftMaps, { keys: nftKeys, fill: true });
            return (
              <>
                <EcoTogether
                  title="Cumulative token supply burnt (%)"
                  note="From each token’s first mint, folded from Transfer history. Quiet days carry the last cumulative burn — a burn cannot reset."
                  labels={token.labels}
                  datasets={token.datasets}
                  options={percentChartOptions}
                />
                <EcoTogether
                  title="Equivalent NFT supply removed (%)"
                  note="Units removed vs max NFT supply, same full-life series as the token burn chart."
                  labels={nft.labels}
                  datasets={nft.datasets}
                  options={percentChartOptions}
                />
              </>
            );
          })()}
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

          {(() => {
            const maps = {};
            for (const k of activationOrder) {
              const hist = data.projects[k]?.activation?.history || {};
              maps[k] = seriesToMap(hist.labels, hist.cumulative);
            }
            const overlay = overlayFromMaps(maps, { keys: activationOrder });
            return (
              <EcoTogether
                title="Net active units"
                note="From each project’s recorded activation history. Missing days stay blank."
                labels={overlay.labels}
                datasets={overlay.datasets}
                options={countChartOptions}
              />
            );
          })()}
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

          {(() => {
            const nftMaps = {};
            const tokMaps = {};
            for (const k of order) {
              const p = data.projects[k];
              const snaps = p?.dailySnapshots || [];
              const nft = snaps.map((s) => (s.nftHolders == null ? null : Number(s.nftHolders)));
              const liveNft = Number(p?.ownership?.nftHolders) || 0;
              if (nft.length && liveNft > 0 && nft[nft.length - 1] == null) nft[nft.length - 1] = liveNft;
              nftMaps[k] = seriesToMap(snaps.map((s) => s.date), nft);

              const hist = p?.ownership?.historicalGrowth || {};
              if (Array.isArray(hist.labels) && hist.labels.length) {
                tokMaps[k] = seriesToMap(hist.labels, hist.data);
              } else {
                tokMaps[k] = seriesToMap(
                  snaps.map((s) => s.date),
                  snaps.map((s) => (s.tokenHolders == null ? null : Number(s.tokenHolders))),
                );
              }
            }
            const nft = overlayFromMaps(nftMaps);
            const tok = overlayFromMaps(tokMaps);
            return (
              <>
                <EcoTogether
                  title="NFT holders"
                  note="Snapshot nftHolders when present; otherwise the live count as the latest point."
                  labels={nft.labels}
                  datasets={nft.datasets}
                  options={countChartOptions}
                />
                <EcoTogether
                  title="Token holders"
                  note="hourly historicalGrowth when it exists; else snapshot tokenHolders."
                  labels={tok.labels}
                  datasets={tok.datasets}
                  options={countChartOptions}
                />
              </>
            );
          })()}
        </div>
      </section>

      <section id="rankings" className="scroll-mt-32">
        <OverviewView data={data} pending={pending} compact />
      </section>

      <MethodologyCard>
          <p><strong className="text-white">What this board aggregates:</strong> Each project is fetched on its own contracts. Holder and activation counts come from gg-index (Transfer folds vs totalSupply). Prices are DexScreener Robinhood-chain pools. Yields are trailing samples annualized — not one shared oracle and not a forecast.</p>
          <p><strong className="text-white">Revenue:</strong> Protocol-kept fees only. StonkBrokers StonkBooster is the mix on that project page (Clock In, AMM, Partner Revenue Share, Smart LP). Nightshades Night vault WETH is not copied here. Bonding volume is notional.</p>
          <p><strong className="text-white">Rankings:</strong> Cost repriced on each load. Yield is the same trailing sample as the project ROI tab. Cross-project APY is not comparable 1:1 because cost basis and payout mechanics differ.</p>
      </MethodologyCard>

    </div>
  );
}