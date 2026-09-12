import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnRateSeries } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, windowLen, seriesHasInk } from '../../lib/yieldHistory';
import { compactUsd, compactNum } from '../kit';
import { baseChartOptions, compactTick, compactUsdTick, dualAxisOptions, STREAM_COLORS } from '../../lib/charts';
import { useChartWindow } from '../../lib/chartWindow';
import { explorerAddressUrl } from '../../lib/tba';
import { holderSeries } from '../../lib/snapshots';
import {
  EmptyChart,
  YieldUsdPricePanel,
  PaybackPanel,
  ProtocolFeeVolumePanels,
  SmartLpChartPanels,
  BlackHoleChartPanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const MODE_ORDER = { 0: 0, 1: 1, 2: 2 };
const MODE_SHORT = { 0: 'FR', 1: 'BB', 2: 'ASK' };

function groupSmartLpMarkets(vaults) {
  const map = new Map();
  for (const v of vaults || []) {
    const key = v.market || v.symbol || v.ca;
    if (!map.has(key)) {
      map.set(key, { market: key, vaults: [], tvlUsd: 0, fees7dUsd: 0, protocolFees7dUsd: 0, modes: new Set() });
    }
    const g = map.get(key);
    g.vaults.push(v);
    g.tvlUsd += Number(v.tvlUsd) || 0;
    g.fees7dUsd += Number(v.fees7dUsd) || 0;
    g.protocolFees7dUsd += Number(v.protocolFees7dUsd) || 0;
    if (v.mode === 0 || v.mode === 1 || v.mode === 2) g.modes.add(v.mode);
  }
  for (const g of map.values()) {
    g.vaults.sort((a, b) => (MODE_ORDER[a.mode] ?? 9) - (MODE_ORDER[b.mode] ?? 9) || (b.tvlUsd || 0) - (a.tvlUsd || 0));
  }
  return [...map.values()].sort((a, b) => b.tvlUsd - a.tvlUsd || b.fees7dUsd - a.fees7dUsd);
}

function shortCa(ca) {
  const s = String(ca || '');
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function splitMarket(market) {
  const [base, quote] = String(market || '').split('/');
  return { base: base || market, quote: quote || '' };
}

function FeeStat({ label, value, tone = 'amber' }) {
  const color = tone === 'sky' ? 'text-sky-400' : 'text-amber-400';
  return (
    <div className="min-w-0 rounded-lg border border-[#1e2228] bg-[#08090b] px-2.5 py-2 sm:px-3 sm:py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 leading-snug sm:text-[11px]">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tabular-nums leading-none sm:text-xl ${color}`}>{value}</p>
    </div>
  );
}

export default function StonkDetailView({ data, activeTab }) {
  const [timeframe] = useChartWindow();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(true);
  const [smartLpOpen, setSmartLpOpen] = useState(true);
  const [smartLpMarket, setSmartLpMarket] = useState(null);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);

  const project = data?.projects?.stonk;
  if (!project) return <div className="text-center text-slate-400 p-12">StonkBrokers Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, lockedLp = null, dailySnapshots = [] } = project;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const chartOptions = baseChartOptions();

  // ==========================================
  // BULLETPROOF CHART DATA FALLBACKS & FIXES
  // ==========================================

  // 1. Historical Yield Chart — weekly / monthly / all usable snapshots.
  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;
  const roiSnaps = windowSnapshots(dailySnapshots, timeframe);
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  // 2. Revenue Chart — one grouped series per stream, colors locked to the boxes.
  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const slicedRev = sliceCols(rawRev.labels, rawRev.cols, timeframe);
  const byKey = Object.fromEntries((slicedRev.cols || []).map((c) => [c.key, c]));
  const { labels: revDates, cols: REV_STREAMS } = {
    labels: slicedRev.labels,
    cols: [
      { ...(byKey.amm || { data: [], total: 0 }), label: 'AMM & Swaps', color: STREAM_COLORS.amm },
      { ...(byKey.box || { data: [], total: 0 }), label: 'Clock-In Box', color: STREAM_COLORS.box },
      { ...(byKey.volume || { data: [], total: 0 }), label: 'Launch + Bonding volume', color: STREAM_COLORS.volume },
      { ...(byKey.tax || { data: [], total: 0 }), label: 'Curve tax', color: STREAM_COLORS.tax },
      { ...(byKey.smartLp || { data: [], total: 0 }), label: 'StonkBroker Fees', color: STREAM_COLORS.smartLp },
    ],
  };
  const smartLp = revenue.smartLp || {};
  const smartLpVaults = Array.isArray(smartLp.vaults) ? smartLp.vaults : [];
  const smartLpMarkets = useMemo(() => groupSmartLpMarkets(smartLpVaults), [smartLpVaults]);
  const smartLpCol = REV_STREAMS[4] || { total: 0, color: STREAM_COLORS.smartLp, data: [] };

  // 3. Burn Tracker Data
  const realBurntTokens = Math.max(
    Number(activation.dualBurn?.totalBurnTokens || 0),
    Number(ownership.permanentlyBurntTokens || 0)
  );
  const realBurntUnits = Math.max(
    Number(activation.dualBurn?.equivalentBrokersBurnt || 0),
    Number(ownership.permanentlyBurntUnits || 0),
    Number(ownership.burntNfts || 0)
  );
  
  const burn = burnSeries(dailySnapshots, timeframe);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;

  // 4. Flywheel Chart
  const flywheel = burnRateSeries(dailySnapshots, timeframe);
  const fwLabels = flywheel.labels;
  const fwPrices = flywheel.prices;
  const fwBurn = flywheel.burn;

  // 5. Activation Chart — no invented Aug 14–20 series
  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actLabels = hasActHist ? actHistory.labels : [];
  const actCum = hasActHist && actHistory.cumulative?.length ? actHistory.cumulative : [];
  const actDAct = hasActHist && actHistory.dailyActivations?.length ? actHistory.dailyActivations : [];
  const actDDeact = hasActHist && actHistory.dailyDeactivations?.length ? actHistory.dailyDeactivations : [];

  let breakdownArr = tiers.map((t) => {
    if (activation.breakdown && activation.breakdown[t.tier] != null) return activation.breakdown[t.tier];
    const s = activation.tierStats?.[t.tier]?.allTime || {};
    return Math.max(0, (s.act || 0) - (s.deact || 0));
  }); 

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const ownN = windowLen(timeframe, holdersFull.labels.length);
  const ownLabels = holdersFull.labels.slice(-ownN);
  const ownData = holdersFull.data.slice(-ownN);
  const stonkHolders = Number(ownership.stonkHolders) || Number(ownership.tokenHolders) || Number(ownership.erc20Holders) || 0;

  const actN = windowLen(timeframe, actLabels.length);
  const burntNfts = ownership.burntNfts || ownership.permanentlyBurntUnits || 0;

  return (
    <div className="space-y-6 relative">
      
      {/* ==================== TAB 1: ROI BENCHMARKS ==================== */}
      <section id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"></path><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"></path><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"></path></svg>
              StonkBrokers Global Yield ROI Benchmarks
            </h3>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-lg px-4 py-2.5 text-sm shadow-inner flex items-center">
              <span className="text-slate-400 mr-2">Floor Entry Cost:</span> 
              <span className="text-white font-bold tracking-wide">{formatCurrency(floorCostUsd)}</span>
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg> 
                "What-If" Volume Simulator
              </h3>
              <span className="text-xs font-bold text-purple-400 bg-purple-900/30 px-2 py-1 rounded border border-purple-800/50">{parseFloat(volumeMultiplier).toFixed(1)}x Protocol Volume</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Slide to model future yield scenarios based on ecosystem trading volume expansion or contraction.</p>
            <input type="range" min="0.1" max="10" step="0.1" value={volumeMultiplier} onChange={(e) => setVolumeMultiplier(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
          </div>

          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-4 font-medium pl-2">Tier</th>
                  <th className="pb-4 font-medium">Activation Req.</th>
                  <th className="pb-4 font-medium">Current Total Cost</th>
                  <th className="pb-4 font-medium">Expected Yield <span className="normal-case">(Annualized)</span></th>
                  <th className="pb-4 font-medium text-right pr-4">Est. ROI (CoC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2228]/50 text-sm">
                {tiers.map((t) => {
                  const actCost = t.reqTokens * market.tokenPriceUsd;
                  const totalCost = floorCostUsd + actCost;
                  const simulatedYield = t.trackedAnnualYieldUsd * volumeMultiplier;
                  const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
                  const isExpanded = expandedTier === t.tier;

                  return (
                    <React.Fragment key={t.tier}>
                      <tr onClick={() => setExpandedTier(isExpanded ? null : t.tier)} className="hover:bg-[#1e2228]/20 transition cursor-pointer group">
                        <td className="py-5 pl-2">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#08090b] border border-[#1e2228] text-blue-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Weight: <span className="text-yellow-500 font-semibold">{t.weight}x</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-5"><span className="text-white font-bold">{formatNumber(t.reqTokens)}</span> ${config.ticker}</td>
                        <td className="py-5">
                          <div className="font-bold text-white">{formatCurrency(totalCost)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Floor + {formatCurrency(actCost)} Act.</div>
                        </td>
                        <td className="py-5">
                          <span className="text-white font-bold text-base">{formatCurrency(simulatedYield)}</span> <span className="text-slate-500">/yr</span>
                        </td>
                        <td className="py-5 text-right pr-4">
                          <div className="flex items-center justify-end gap-3">
                            <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">{roi.toFixed(2)}%</span>
                            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#08090b]/40 border-b border-[#1e2228]/50">
                          <td colSpan="5" className="p-4 md:p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">Trailing 7-Day Realized Yield ({t.name})</h4>
                              <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                            </div>
                            <div className="relative h-32 md:h-40 w-full">
                              {seriesHasInk(t.dailyYields) ? (
                                <Line 
                                  data={{ 
                                    labels: t.dailyDates, 
                                    datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: '#00a804', backgroundColor: 'rgba(0, 168, 4, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] 
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

      {/* ==================== TAB 2: HISTORICAL YIELD ==================== */}
      <section id="yield" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] p-4 md:p-6 rounded-2xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">Historical Yield & Payback Horizon</h2>
              <p className="text-xs md:text-sm text-slate-400 mt-1">Daily CoC ROI from the hourly ledger. Range is the sticky Weekly / Monthly / All control.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiers.map((t) => {
              const tc = floorCostUsd + (t.reqTokens * market.tokenPriceUsd);
              const years = t.trackedAnnualYieldUsd > 0 ? (tc / t.trackedAnnualYieldUsd).toFixed(1) + ' Years' : 'N/A';
              return (
                <div key={t.tier} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{t.tier} Payback Horizon</p>
                  <p className="text-xl font-extrabold text-blue-400">{years}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mt-6">
            <h3 className="text-sm font-bold text-white mb-4">Tier ROI % Trajectory</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              <Line key={`yield-${timeframe}`} data={{ labels: histLabels, datasets: histDatasets }} options={chartOptions} />
            </div>
          </div>
          <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
          <PaybackPanel snaps={roiSnaps} tiers={tiers} floorCostUsd={floorCostUsd} tokenPriceUsd={market.tokenPriceUsd} />
        </div>
      </section>

      {/* ==================== TAB 3: REVENUE & LPS ==================== */}
      <section id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">Protocol Revenue & Ecosystem Liquidity</h2>
              <p className="text-xs text-slate-400 mt-1">AMM and Clock-In are protocol fees. StonkBroker Fees are the Smart LP skim. Launch + bonding volume sits beside the fee stack on the same chart — it is not a fee.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: REV_STREAMS[0].color }} />
                AMM & Swap Protocol Fees ({revPeriod})
              </p>
              <p className="text-2xl font-extrabold" style={{ color: REV_STREAMS[0].color }}>{formatCurrency(REV_STREAMS[0].total)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: REV_STREAMS[1].color }} />
                Clock-In Security Box ({revPeriod})
              </p>
              <p className="text-2xl font-extrabold" style={{ color: REV_STREAMS[1].color }}>{formatCurrency(REV_STREAMS[1].total)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: REV_STREAMS[2].color }} />
                Launch Fees + Bonding Volume ({revPeriod})
              </p>
              <p className="text-2xl font-extrabold" style={{ color: REV_STREAMS[2].color }}>{formatCurrency(REV_STREAMS[2].total)}</p>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Create {formatCurrency(revenue.launchCreateUsd || 0)}
                <span className="mx-1.5 text-slate-700">·</span>
                Volume {formatCurrency(revenue.bondingVolumeUsd || 0)}
                <span className="mx-1.5 text-slate-700">·</span>
                <span className="inline-block h-1.5 w-1.5 rounded-sm align-middle mr-1" style={{ backgroundColor: REV_STREAMS[3].color }} />
                Curve tax {formatCurrency(REV_STREAMS[3].total)}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: smartLpCol.color }} />
                StonkBroker Fees ({revPeriod})
              </p>
              <p className="text-2xl font-extrabold" style={{ color: smartLpCol.color }}>{formatCurrency(smartLpCol.total)}</p>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Depositor Fees Generated {formatCurrency(smartLp.fees7dUsd || 0)}
                <span className="mx-1.5 text-slate-700">·</span>
                {smartLp.perfFeeBps ? `${(smartLp.perfFeeBps / 100).toFixed(0)}% skim` : '10% skim'}
                <span className="mx-1.5 text-slate-700">·</span>
                50/50 buyback · booster
              </p>
            </div>
          </div>

          <ProtocolFeeVolumePanels labels={slicedRev.labels} cols={slicedRev.cols} kind={rawRev.kind} />
        </div>
      </section>

      <section id="liquidity" className="scroll-mt-32">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white">Liquidity & Smart LPs</h2>
            <p className="text-xs text-slate-400 mt-1">
              Depositor Fees Generated are Uniswap trading fees the vaults collected. StonkBroker Fees are the {smartLp.perfFeeBps ? `${(smartLp.perfFeeBps / 100).toFixed(0)}%` : '10%'} skim, split 50/50 buyback and StonkBooster.
            </p>
          </div>

          {smartLpVaults.length > 0 && (
            <>
            <SmartLpChartPanels snaps={roiSnaps} smartLp={smartLp} vaults={smartLpVaults} />
            <div className="bg-[#08090b] border border-[#1e2228] rounded-2xl p-3 sm:p-5 md:p-6">
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      Smart LP Volatility Farming
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {smartLpMarkets.length} pairs · {smartLpVaults.length} vaults. Tap a pair for Full Range, Balanced Band, and Ask.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSmartLpOpen(!smartLpOpen)}
                    className="text-xs bg-[#0e1013] border border-[#1e2228] text-slate-300 px-3 py-2.5 rounded-lg hover:text-white transition shadow-sm w-full sm:w-auto min-h-11"
                  >
                    {smartLpOpen ? 'Hide Markets ▲' : 'Show Markets ▼'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-xl border border-[#1e2228] bg-[#0e1013] px-3 py-3 sm:px-4 sm:py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Vault TVL</p>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-extrabold tabular-nums text-white leading-none">{formatCurrency(smartLp.totalTvlUsd || 0)}</p>
                  </div>
                  <div className="rounded-xl border border-amber-400/25 bg-[#0e1013] px-3 py-3 sm:px-4 sm:py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Depositor Fees Generated</p>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-extrabold tabular-nums text-amber-400 leading-none">{formatCurrency(smartLp.fees7dUsd || 0)}</p>
                  </div>
                  <div className="rounded-xl border border-sky-400/25 bg-[#0e1013] px-3 py-3 sm:px-4 sm:py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">StonkBroker Fees</p>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-extrabold tabular-nums text-sky-400 leading-none">{formatCurrency(smartLp.protocolFees7dUsd || smartLpCol.total || 0)}</p>
                  </div>
                </div>
              </div>
              {smartLpOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {smartLpMarkets.map((g) => {
                    const open = smartLpMarket === g.market;
                    const { base, quote } = splitMarket(g.market);
                    return (
                      <div
                        key={g.market}
                        className={`rounded-2xl border bg-[#0e1013] text-left transition ${
                          open ? 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]' : 'border-[#1e2228]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSmartLpMarket(open ? null : g.market)}
                          className="w-full p-3.5 sm:p-4 text-left min-h-11"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-base font-bold text-white tracking-tight truncate">
                              {base}
                              {quote ? <span className="text-slate-500 font-semibold"> / {quote}</span> : null}
                            </p>
                            <span className="shrink-0 text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">TVL {formatCurrency(g.tvlUsd)}</p>
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <FeeStat label="Depositor Fees" value={formatCurrency(g.fees7dUsd)} />
                            <FeeStat label="StonkBroker Fees" value={formatCurrency(g.protocolFees7dUsd)} tone="sky" />
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {[0, 1, 2].map((mode) => {
                              const live = g.modes.has(mode);
                              return (
                                <span
                                  key={mode}
                                  className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${
                                    live
                                      ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
                                      : 'border-[#1e2228] text-slate-600'
                                  }`}
                                >
                                  {MODE_SHORT[mode]}
                                </span>
                              );
                            })}
                          </div>
                        </button>
                        {open && (
                          <div className="border-t border-[#1e2228] px-3 pb-3 pt-2 space-y-2">
                            {g.vaults.map((v) => (
                              <div
                                key={v.ca}
                                className="rounded-xl border border-[#1e2228] bg-[#08090b] p-3"
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-sm font-bold text-white">{v.modeLabel || MODE_SHORT[v.mode] || 'Vault'}</p>
                                  <p className="text-[11px] text-slate-500 font-mono">{v.symbol}</p>
                                </div>
                                <p className="text-[11px] text-slate-500 mb-2">TVL {formatCurrency(v.tvlUsd || 0)}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <FeeStat label="Depositor Fees" value={formatCurrency(v.fees7dUsd || 0)} />
                                  <FeeStat label="StonkBroker Fees" value={formatCurrency(v.protocolFees7dUsd || 0)} tone="sky" />
                                </div>
                                <a
                                  href={explorerAddressUrl(v.ca)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-2 inline-block text-[11px] text-slate-400 hover:text-white font-mono py-1"
                                >
                                  {shortCa(v.ca)}
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
          )}

          {lockedLp && lockedLp.pools && lockedLp.pools.length > 0 && (
            <>
            <BlackHoleChartPanels snaps={roiSnaps} lockedLp={lockedLp} ticker={config.ticker} />
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> "Black Hole" Liquidity: Ecosystem Tokens Locked</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Scanned from all active partner, meme, and launchpad trading pairs.</p>
                </div>
                <div className="text-right flex flex-col items-end w-full md:w-auto">
                  <p className="text-base font-extrabold text-orange-400">{formatNumber(lockedLp.totalStonkLocked || 0)} {config.ticker}</p>
                  <p className="text-[10px] text-slate-400">{formatCurrency(lockedLp.totalLpUsd || 0)} Total Pool Reserves</p>
                  <button onClick={() => setLpTableOpen(!lpTableOpen)} className="mt-2 text-xs bg-[#0e1013] border border-[#1e2228] text-slate-300 px-3 py-2.5 rounded-lg hover:text-white transition shadow-sm w-full md:w-auto min-h-11">
                    {lpTableOpen ? 'Hide Pools ▲' : 'Show Pools ▼'}
                  </button>
                </div>
              </div>
              {lpTableOpen && (
                <div className="overflow-x-auto transition-all duration-300">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead><tr className="text-slate-400 border-b border-[#1e2228]"><th className="pb-2 pl-2">Trading Pair</th><th className="pb-2">DEX Venue</th><th className="pb-2 text-right">Tokens Locked</th><th className="pb-2 text-right pr-2">Total Pool Liquidity</th></tr></thead>
                    <tbody className="divide-y divide-[#1e2228]/40 text-slate-200">
                      {lockedLp.pools.map((p, i) => (
                        <tr key={i} className="hover:bg-[#1e2228]/20"><td className="py-2.5 pl-2 font-bold text-white">{p.pairName}</td><td className="py-2.5 text-slate-400">{p.dex}</td><td className="py-2.5 text-right font-bold text-orange-400">{formatNumber(p.stonkAmount)}</td><td className="py-2.5 text-right pr-2">{formatCurrency(p.liquidityUsd)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* TAB 4: BURN TRACKER */}
      {/* ========================================================================= */}
      <section id="burn" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Token Burn & Supply Deflation Tracker</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total StonkBrokers Burnt</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-orange-400">{formatNumber(realBurntTokens)} StonkBrokers</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Equivalent Units Removed</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-blue-400">{formatNumber(realBurntUnits, 2)} Units</p>
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <h3 className="text-sm font-bold text-white mb-4">Cumulative Token Burn Over Time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {slicedBurnData.length > 0 ? (
                <Line
                  key={`burn-${timeframe}`}
                  data={{ labels: slicedBurnLabels, datasets: [{ label: 'Cumulative Burnt', data: slicedBurnData, borderColor: '#fb923c', backgroundColor: 'rgba(251, 146, 60, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: compactTick } } } }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                  No burn history recorded yet
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-1">The Deflationary Flywheel</h3>
            <p className="text-xs text-slate-400 mb-4">Tracks the correlation between token spot price and daily burn rate.</p>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              <Bar 
                data={{
                  labels: fwLabels,
                  datasets: [
                    { type: 'line', label: 'Token Price ($)', data: fwPrices, borderColor: '#00a804', backgroundColor: '#00a804', borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
                    { type: 'bar', label: 'Daily Burn Velocity', data: fwBurn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }
                  ]
                }} 
                options={dualAxisOptions({ leftTick: compactTick, rightTick: compactUsdTick, rightColor: '#00a804' })} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* TAB 5: ACTIVATION */}
      {/* ========================================================================= */}
      <section id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Ecosystem Activation Metrics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Activated Supply Ratio</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(activation.percentActivated || 0).toFixed(2)}%</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-blue-400">{formatNumber(activation.activeCount || 0)} Units</p></div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-4 mt-8">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tier Activation Flow</h3>
            <div className="flex bg-[#0e1013] rounded-lg p-1 border border-[#1e2228] w-full sm:w-auto">
              {['24h', '7d', '30d', 'allTime'].map((tf) => (
                <button key={tf} onClick={() => setTierTimeframe(tf)} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition ${tierTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>{tf === 'allTime' ? 'ALL' : tf.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            {tiers.map((t, idx) => {
              const tData = activation.tierStats?.[t.tier]?.[tierTimeframe] || { act: 0, deact: 0 };
              const colors = ['bg-[#00a804]', 'bg-[#8b5cf6]', 'bg-[#38bdf8]', 'bg-[#f5b700]', 'bg-[#f472b6]'];
              return (
                <div key={t.tier} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3"><div className={`w-2.5 h-2.5 rounded-sm ${colors[idx % 5]}`}></div><p className="text-[10px] uppercase font-bold truncate">{t.tier}: {t.name}</p></div>
                  <div className="flex justify-between items-end">
                    <div><p className="text-lg font-bold text-emerald-400">{formatNumber(tData.act)}</p><p className="text-[9px] text-slate-500 uppercase">Act</p></div>
                    <div className="text-right"><p className="text-lg font-bold text-rose-400">{formatNumber(tData.deact)}</p><p className="text-[9px] text-slate-500 uppercase">Deact</p></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <h3 className="text-sm font-bold text-white mb-6">Current Tier Mix (net of deactivations)</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
              <div className="relative h-64 md:h-72 w-full md:w-1/2 flex items-center justify-center">
                <Doughnut data={{ labels: tiers.map(t => t.name), datasets: [{ data: breakdownArr, backgroundColor: ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'], borderWidth: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }} />
              </div>
              <div className="w-full md:w-1/2 flex flex-col gap-3">
                {tiers.map((t, idx) => (
                  <div key={t.tier} className="flex justify-between items-center bg-[#0e1013] p-3 rounded-lg border border-[#1e2228]">
                    <div className="flex items-center gap-3"><div className={`w-4 h-4 rounded-md ${['bg-[#00a804]', 'bg-[#8b5cf6]', 'bg-[#38bdf8]', 'bg-[#f5b700]', 'bg-[#f472b6]'][idx % 5]}`}></div><span className="text-sm font-bold text-slate-300">{t.tier}: {t.name}</span></div>
                    <span className="text-white font-bold tracking-wide">{formatNumber(breakdownArr[idx])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ActivationStackPanel snaps={roiSnaps} tiers={tiers} breakdown={activation.breakdown} />
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
             <h3 className="text-sm font-bold text-white mb-4">Historical Activity (Net vs. Daily)</h3>
             <div className="relative h-52 sm:h-64 md:h-80 w-full">
                {hasActHist ? (
                <Bar 
                  data={{
                    labels: actLabels.slice(-actN),
                    datasets: [
                      { type: 'line', label: 'Net Active Units', data: actCum.slice(-actN), borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.05)', borderWidth: 3, fill: true, tension: 0.3, yAxisID: 'y' },
                      { type: 'bar', label: 'Daily Activations', data: actDAct.slice(-actN), backgroundColor: '#00a804', borderRadius: 4, yAxisID: 'y1' },
                      { type: 'bar', label: 'Daily Deactivations', data: actDDeact.slice(-actN), backgroundColor: '#f43f5e', borderRadius: 4, yAxisID: 'y1' }
                    ]
                  }} 
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { type: 'linear', position: 'left', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, min: 0 } } }} 
                />
                ) : (
                  <EmptyChart>No activation history recorded</EmptyChart>
                )}
             </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* TAB 6: OWNERSHIP (Anomaly filtered + tension 0.3 curves) */}
      {/* ========================================================================= */}
      <section id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Protocol Ownership & Distribution</h2>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Current Max Supply</p><p className="text-xl md:text-3xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || 0, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Permanently Burnt</p><p className="text-xl md:text-3xl font-extrabold text-orange-400">{formatNumber(burntNfts, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">AMM Vault Inventory</p><p className="text-xl md:text-3xl font-extrabold text-slate-300">{formatNumber(ownership.ammVaultNfts || 2192)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner border-b-4 border-b-blue-500"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">True Circulating NFTs</p><p className="text-xl md:text-3xl font-extrabold text-blue-400">{formatNumber(ownership.circulatingNftSupply || 1400)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique NFT Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(ownership.nftHolders || 0)} Wallets</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets with an activated StonkBroker</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-300">{activation.activeHolders == null ? '—' : `${formatNumber(activation.activeHolders)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership Concentration</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(ownership.ownershipRatio || 0).toFixed(2)}%</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique $STONK Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(stonkHolders)} Wallets</p></div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">True Active Token Holders Over Time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(ownData) ? (
              <Line 
                data={{ labels: ownLabels, datasets: [{ label: 'Active Holders', data: ownData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }} 
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } } } }} 
              />
              ) : (
                <EmptyChart>No holder history recorded</EmptyChart>
              )}
            </div>
          </div>
          <OwnershipHistoryPanels
            snaps={roiSnaps}
            live={{
              tokenHolders: stonkHolders,
              nftHolders: ownership.nftHolders,
              ownershipRatio: ownership.ownershipRatio,
            }}
          />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* DYNAMIC DISCLAIMER FOOTER */}
      {/* ========================================================================= */}
      <div className="bg-[#0e1013] rounded-xl p-5 md:p-6 border border-[#1e2228] shadow-lg mt-8">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
          <h3 className="text-base md:text-lg font-bold text-white">Methodology & Disclaimer</h3>
        </div>
        <div className="text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-4">
          <p><strong className="text-white">Yield & ROI (Global Network Oracle) Methodology:</strong> Cash-on-Cash (CoC) returns are calculated dynamically based on the selected project's architecture and active network weight.</p>
          <p><strong className="text-white">Historical Yield & Payback Horizon Methodology:</strong> Capital recovery timelines are calculated by dividing the total entry cost by annualized trailing yield rates. ROI trajectories map historical performance over rolling epochs.</p>
          <p><strong className="text-white">Protocol Analytics:</strong> Metrics shown aggregate live on-chain events across registered smart contracts.</p>
          <p><strong className="text-white">Protocol Ownership & Distribution Methodology:</strong> Wallet concentration metrics evaluate unique human holders against true circulating supply, subtracting protocol treasury allocations. Activated-wallet count is unique current owners of NFTs that still have an open activation — a sale clears it.</p>
        </div>
        <p className="text-xs md:text-sm text-slate-400 italic leading-relaxed border-t border-[#1e2228] pt-5">
          <strong className="text-slate-300 not-italic">Disclaimer:</strong> Tracked yield values are calculated using Mark-to-Market spot pricing at the exact time of the dashboard's last automated sync, rather than the historical price at the time of the drop. Yields fluctuate based on network activation weight, market token prices, and community protocol volume. This is a community-built tracking tool and does not guarantee future returns.
        </p>
      </div>

    </div>
  );
}
