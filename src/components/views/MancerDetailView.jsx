import React, { useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, seriesHasInk, holderRevenueCol, windowChart } from '../../lib/yieldHistory';
import { compactUsd, compactNum, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { ShareSection } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, dualAxisOptions, STREAM_COLORS, activityChartOptions } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import {
  EmptyChart,
  YieldUsdPricePanel,
  PaybackPanel,
  ProtocolFeeVolumePanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
  BlackHoleChartPanels,
  OnboardLinePanel,
} from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function MancerDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(false);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [yieldPeriod, setYieldPeriod] = useState('Y');

  const project = data?.projects?.mancer;
  if (!project) return <div className="text-center text-slate-400 p-12">Mancer Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, lockedLp = null, dailySnapshots = [] } = project;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const chartOptions = baseChartOptions();

  // ==========================================
  // BULLETPROOF CHART DATA FALLBACKS & FIXES
  // ==========================================

  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  // 2. Revenue Chart
  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const slicedRev = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe, interval);
  const byKey = Object.fromEntries((rawRev.cols || []).map((c) => [c.key, c]));
  const { labels: revDates, cols: revCols } = sliceCols(
    rawRev.labels,
    [
      { ...(byKey.dex || { data: [] }), label: 'DEX Swap Rev', color: STREAM_COLORS.dex },
      { ...(byKey.amm || { data: [] }), label: 'Vault Inflows', color: STREAM_COLORS.amm },
      { ...(byKey.box || { data: [] }), label: 'Order Layer', color: STREAM_COLORS.box },
    ],
    timeframe,
    interval
  );
  const revDataDex = revCols[0]?.data || [];
  const revDataAmm = revCols[1]?.data || [];
  const revDataSec = revCols[2]?.data || [];

  // 3. Burn Tracker Data (Dynamic Dates to Current Day)
  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  
  const burn = burnSeries(project, timeframe, interval);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;

  // 4. Flywheel Chart
  const flywheel = burnRateSeries(project, timeframe, interval);
  const fwPrices = flywheel.prices;
  const fwBurn = flywheel.burn;

  // 5. Activation Chart
  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actLabels = hasActHist ? actHistory.labels : [];
  const actCum = hasActHist && actHistory.cumulative?.length ? actHistory.cumulative : [];
  const actDAct = hasActHist && actHistory.dailyActivations?.length ? actHistory.dailyActivations : [];
  const actDDeact = hasActHist && actHistory.dailyDeactivations?.length ? actHistory.dailyDeactivations : [];

  let breakdownArr = tiers.map((t) => {
    if (activation.breakdown && activation.breakdown[t.tier] != null) return activation.breakdown[t.tier];
    const s = activation.tierStats?.[t.tier]?.allTime || {};
    return netTierCount(s);
  }); 

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const holdersWin = windowChart(holdersFull.labels, [holdersFull.data], timeframe, interval, ['last']);
  const ownLabels = holdersWin.labels;
  const ownData = holdersWin.cols[0] || [];
  const mancerHolders = Number(ownership.mancerHolders) || Number(ownership.tokenHolders) || Number(ownership.stonkHolders) || Number(ownership.erc20Holders) || 0;

  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);

  return (
    <div className="space-y-6 relative">
      
      {/* ==================== TAB 1: ROI BENCHMARKS ==================== */}
      <ShareSection id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔮</span> Mancer Global Yield ROI Benchmarks
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
                  <th className="pb-4 font-medium">
                    <div className="flex items-center gap-2">
                      <span>Expected Yield</span>
                      <YieldPeriodToggle value={yieldPeriod} onChange={setYieldPeriod} />
                    </div>
                  </th>
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
                            <span className="bg-[#08090b] border border-[#1e2228] text-purple-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
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
                          <span className="text-white font-bold text-base">{formatCurrency(scaleAnnualYield(simulatedYield, yieldPeriod))}</span> <span className="text-slate-500">{yieldSuffix(yieldPeriod)}</span>
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
                                  datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] 
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
      </ShareSection>

      {/* ==================== TAB 2: HISTORICAL YIELD ==================== */}
      <ShareSection id="yield" className="scroll-mt-32">
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
              <Line data={{ labels: histLabels, datasets: histDatasets }} options={chartOptions} />
            </div>
          </div>
          <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
          <PaybackPanel snaps={roiSnaps} tiers={tiers} floorCostUsd={floorCostUsd} tokenPriceUsd={market.tokenPriceUsd} />
        </div>
      </ShareSection>

      {/* ==================== TAB 3: REVENUE & LPS ==================== */}
      <ShareSection id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">Protocol Revenue & Ecosystem Liquidity</h2>
              <p className="text-xs text-slate-400 mt-1">Protocol-kept revenue only. Swap volume is not included.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">DEX Swap Routing Rev ({revPeriod})</p>
              <p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.dex }}>{formatCurrency(revCols[0]?.total || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Soft-Staking Vault Inflows ({revPeriod})</p>
              <p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.amm }}>{formatCurrency(revCols[1]?.total || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Order Execution Layer ({revPeriod})</p>
              <p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.box }}>{formatCurrency(revCols[2]?.total || 0)}</p>
            </div>
          </div>

          <ProtocolFeeVolumePanels
            labels={slicedRev.labels}
            cols={slicedRev.cols}
            kind={rawRev.kind}
            holder={{
              labels: slicedHolder.labels,
              data: slicedHolder.cols[0]?.data,
              note: 'Per-NFT daily yield × active units at each tier. The payout that reached holders, not protocol-kept revenue.',
            }}
          />
        </div>
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Liquidity</h2>
          <p className="text-xs text-slate-400">Locked pool reserves scanned from partner, meme, and launchpad pairs.</p>
          {/* Locked LPs Added to Bottom of Revenue Tab */}
          {lockedLp && lockedLp.pools && lockedLp.pools.length > 0 ? (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> "Black Hole" Liquidity: Ecosystem Tokens Locked</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Scanned from all active partner, meme, and launchpad trading pairs.</p>
                </div>
                <div className="text-right flex flex-col items-end w-full md:w-auto">
                  <p className="text-base font-extrabold text-orange-400">{formatNumber(lockedLp.totalStonkLocked || 0)} {config.ticker}</p>
                  <p className="text-[10px] text-slate-400">{formatCurrency(lockedLp.totalLpUsd || 0)} Total Pool Reserves</p>
                  <button onClick={() => setLpTableOpen(!lpTableOpen)} className="mt-2 text-[10px] bg-[#0e1013] border border-[#1e2228] text-slate-300 px-3 py-1 rounded hover:text-white transition shadow-sm w-full md:w-auto">
                    {lpTableOpen ? 'Hide Pools ▲' : 'Show Pools ▼'}
                  </button>
                </div>
              </div>
              <BlackHoleChartPanels snaps={roiSnaps} lockedLp={lockedLp} ticker={config.ticker} />
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
          ) : (
            <p className="text-sm text-slate-500">No locked LP scanned for this project yet.</p>
          )}
        </div>
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 4: BURN TRACKER (Dynamic Dates & Real Data) */}
      {/* ========================================================================= */}
      <ShareSection id="burn" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Token Burn & Supply Deflation Tracker</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total ${config.ticker} Burnt</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-orange-400">{formatNumber(realBurntTokens)} {config.ticker}</p>
              {burnPct != null && (
                <p className="text-xs text-slate-400 mt-1">{burnPct.toFixed(2)}% of total supply</p>
              )}
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Equivalent Units Removed</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-blue-400">{formatNumber(realBurntUnits, 2)} Units</p>
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <h3 className="text-sm font-bold text-white mb-1">Cumulative Token Burn Over Time</h3>
            <p className="text-xs text-slate-500 mb-4">First mint through today. Days before hourly snapshots are reconstructed from token burns to dead/zero, scaled to the first trusted supply read.</p>
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
                key={`flywheel-${timeframe}`}
                data={{
                  labels: flywheel.labels,
                  datasets: [
                    { type: 'line', label: 'Token Price ($)', data: fwPrices, borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
                    { type: 'bar', label: 'Daily Burn Velocity', data: fwBurn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }
                  ]
                }} 
                options={dualAxisOptions({
                  leftTick: compactTick,
                  rightTick: compactUsdTick,
                  rightColor: '#8b5cf6',
                  leftMax: flywheel.burnAxisMax,
                  leftValues: flywheel.burn,
                  rightValues: flywheel.prices,
                })} 
              />
            </div>
          </div>
        </div>
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 5: ACTIVATION */}
      {/* ========================================================================= */}
      <ShareSection id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Ecosystem Activation Metrics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Activated Supply Ratio</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(activation.percentActivated || 0).toFixed(2)}%</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-blue-400">{formatNumber(activation.activeCount || 0)} Units</p></div>
          </div>

          <TierFlowSection
            tiers={tiers}
            tierStats={activation.tierStats}
            timeframe={tierTimeframe}
            onTimeframe={setTierTimeframe}
            formatNumber={formatNumber}
          />

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
             <h3 className="text-sm font-bold text-white mb-1">Active units vs daily flow</h3>
             <p className="text-xs text-slate-400 mb-4">The line is currently-active NFTs at end of day (sales deactivate). Bars are new activations and exits, not upgrades.</p>
             <div className="relative h-52 sm:h-64 md:h-80 w-full">
                {hasActHist ? (
                <Bar 
                  data={{
                    labels: actWin.labels,
                    datasets: [
                      { type: 'line', label: 'Active units', data: actWin.cols[0], borderColor: '#8b5cf6', tension: 0.3, yAxisID: 'y' },
                      { type: 'bar', label: 'Daily Activations', data: actWin.cols[1], backgroundColor: '#00a804', borderRadius: 4, yAxisID: 'y1' },
                      { type: 'bar', label: 'Daily Deactivations', data: actWin.cols[2], backgroundColor: '#f43f5e', borderRadius: 4, yAxisID: 'y1' }
                    ]
                  }} 
                  options={activityChartOptions(actWin.labels, actWin.cols[0], actWin.cols[1], actWin.cols[2])} 
                />
                ) : (
                  <EmptyChart>No activation history recorded</EmptyChart>
                )}
             </div>
          </div>
        </div>
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 6: OWNERSHIP (Smoothed and Anomaly Filtered) */}
      {/* ========================================================================= */}
      <ShareSection id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Protocol Ownership & Distribution</h2>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Current Max Supply</p><p className="text-xl md:text-3xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || 0, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Permanently Burnt</p><p className="text-xl md:text-3xl font-extrabold text-orange-400">{formatNumber(realBurntUnits, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">AMM Vault Inventory</p><p className="text-xl md:text-3xl font-extrabold text-slate-300">{formatNumber(ownership.ammVaultNfts || 0)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner border-b-4 border-b-purple-500"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">True Circulating NFTs</p><p className="text-xl md:text-3xl font-extrabold text-purple-400">{formatNumber(ownership.circulatingNftSupply || 0)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique NFT Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(ownership.nftHolders || 0)} Wallets</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-purple-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets with an activated Mancer</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-300">{activation.activeHolders == null ? '—' : `${formatNumber(activation.activeHolders)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership Concentration</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(ownership.ownershipRatio || 0).toFixed(2)}%</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique ${config.ticker} Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(mancerHolders)} Wallets</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-violet-500/20">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Chain onboard</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-violet-300">{formatNumber(Number(data?.onboarding?.byProject?.mancer?.wallets) || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">First 10 txs · NFT {formatNumber(data?.onboarding?.byProject?.mancer?.nft || 0)}{(Number(data?.onboarding?.byProject?.mancer?.token) || 0) ? ` · token ${formatNumber(data.onboarding.byProject.mancer.token)}` : ''}</p>
            </div>
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
            live={{ tokenHolders: mancerHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          />
          <OnboardLinePanel data={data} projectKey="mancer" timeframe={timeframe} interval={interval} name="Mancer" />
        </div>
      </ShareSection>

      <MethodologyCard accent="text-purple-500">
          <p><strong className="text-white">Yield &amp; ROI:</strong> Mancer is a SoftStakingVault, not the StonkBrokers T4 oracle. Cash-on-cash is annualized vault / protocol yield ÷ (NFT floor USD + activation tokens at DexScreener spot), split by Anvil tier weight (100 / 125 / 160 / 200 / 333). Live yield is a trailing sample, not a promised APY.</p>
          <p><strong className="text-white">Activation:</strong> Total Active Units is the live set after replaying vault events plus NFT transfers. Mancer emits no Deactivated event — a sale clears the position. The contract&apos;s <code>activeCount()</code> is an upper bound and is not what this page shows. Tier flow cards are gross activate/exit events in the window, not the live mix (that is the doughnut).</p>
          <p><strong className="text-white">Revenue:</strong> Dex collector plus vault RewardPaid. 25% of Mancer dex tax is also credited to StonkBrokers Partner Revenue Share. This page still shows Mancer&apos;s full collector — do not add the two protocol totals together.</p>
          <p><strong className="text-white">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-white">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Concentration is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number. Activated-wallet count is unique current owners of NFTs that still have an open activation. Chain onboard is unique EOAs whose first cluster buy or mint of this project was one of their first 10 txs.</p>
      </MethodologyCard>

    </div>
  );
}