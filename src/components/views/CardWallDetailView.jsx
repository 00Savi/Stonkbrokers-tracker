import React, { useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, protocolRevenueChart, sliceCols, seriesHasInk, windowChart } from '../../lib/yieldHistory';
import { BetaTag, compactUsd, compactNum, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { ShareSection } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, dualAxisOptions, activityChartOptions } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import {
  EmptyChart,
  YieldUsdPricePanel,
  PaybackPanel,
  ActivationStackPanel,
  OwnershipHistoryPanels,
  HolderRevenuePanel,
} from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function CardWallDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [selectedSlab, setSelectedSlab] = useState(null);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [yieldPeriod, setYieldPeriod] = useState('Y');

  const project = data?.projects?.cardwall || data?.projects?.card;
  if (!project) return <div className="text-center text-slate-400 p-12">The Card Wall Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, dailySnapshots = [], ledger = null } = project;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const tierFloorUsd = (t, i) => {
    const eth = t.floorEth > 0 ? t.floorEth : (market.starFloorEth?.[i] > 0 ? market.starFloorEth[i] : market.nftFloorEth);
    return (eth || 0) * (market.ethPriceUsd || 0);
  };

  const chartOptions = baseChartOptions();

  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;
  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval).filter((s) =>
    Array.isArray(s.tiers) && s.tiers.some((t) => (t.yieldUsd || 0) > 0 || (t.roi || 0) > 0)
  );
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tiers.map((t, i) => {
    const tc = tierFloorUsd(t, i) + (t.reqTokens * market.tokenPriceUsd);
    const currentRoi = tc > 0 ? ((t.trackedAnnualYieldUsd / tc) * 100).toFixed(2) : 0;
    return {
      label: `${t.tier} ROI (${currentRoi}%)`,
      data: roiSnaps.map(s => s.tiers?.find(st => st.tier === t.tier)?.roi || 0),
      borderColor: ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'][i % 5],
      tension: 0.3, borderWidth: 2, pointRadius: 2
    };
  });

  const zeros = [0, 0, 0, 0, 0, 0, 0];
  const rawRev = protocolRevenueChart(project);
  const { labels: revDates, cols: revCols } = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const revData1 = revCols[0]?.data || zeros;
  const revData2 = revCols[1]?.data || zeros;

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  
  const burn = burnSeries(project, timeframe, interval);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;

  const flywheel = burnRateSeries(project, timeframe, interval);
  const fwPrices = flywheel.prices;
  const fwBurn = flywheel.burn;

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
  const wallHolders = Number(ownership.wallHolders) || Number(ownership.tokenHolders) || Number(ownership.erc20Holders) || Number(ownership.stonkHolders) || 0;

  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);

  return (
    <div className="space-y-6 relative">

      {/* TAB 1: ROI BENCHMARKS */}
      <ShareSection id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"></path><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"></path><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"></path></svg>
              The Card Wall Global Yield ROI Benchmarks
              <BetaTag />
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
                {tiers.map((t, i) => {
                  const actCost = t.reqTokens * market.tokenPriceUsd;
                  const rowFloor = tierFloorUsd(t, i);
                  const totalCost = rowFloor + actCost;
                  const simulatedYield = t.trackedAnnualYieldUsd * volumeMultiplier;
                  const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
                  const isExpanded = expandedTier === t.tier;

                  return (
                    <React.Fragment key={t.tier}>
                      <tr onClick={() => setExpandedTier(isExpanded ? null : t.tier)} className="hover:bg-[#1e2228]/20 transition cursor-pointer group">
                        <td className="py-5 pl-2">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#08090b] border border-[#1e2228] text-amber-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Weight: <span className="text-yellow-500 font-semibold">{t.weight}x</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-5">
                          {t.reqTokens > 0 ? (
                            <><span className="text-white font-bold">{formatNumber(t.reqTokens)}</span> ${config.ticker}</>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{formatCurrency(totalCost)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {t.reqTokens > 0 ? `Floor + ${formatCurrency(actCost)} Act.` : 'OpenSea rarity floor'}
                          </div>
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
                        <tr className="bg-[#08090b]/60 border-b border-[#1e2228]/50">
                          <td colSpan="5" className="p-6">
                            {t.recentDrops && t.recentDrops.length > 0 ? (
                              <div className="mb-6">
                                <div className="flex justify-between items-center mb-4">
                                  <div>
                                    <h4 className="text-sm font-bold text-slate-200">Trailing 7-Day Slab Rain ({t.name})</h4>
                                    <p className="text-xs text-slate-400">Delivered directly to member ERC-6551 token-bound wallets</p>
                                  </div>
                                  <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{t.recentDrops.length} Slabs Delivered</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                  {t.recentDrops.map((slab) => (
                                    <div key={slab.id} onClick={(e) => { e.stopPropagation(); setSelectedSlab(slab); }} className="group relative bg-[#0e1013] border border-[#1e2228] rounded-xl p-2.5 cursor-pointer hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all flex flex-col justify-between">
                                      <div className="w-full h-36 bg-[#08090b] rounded-lg overflow-hidden flex items-center justify-center p-1 relative">
                                        <img src={slab.imageUrl} alt={slab.cardName} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200" />
                                        <span className="absolute top-1.5 right-1.5 bg-emerald-500/90 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded">{slab.grade || 'PSA 10'}</span>
                                      </div>
                                      <div className="mt-2 text-left">
                                        <p className="text-xs font-bold text-white truncate group-hover:text-amber-400">{slab.cardName}</p>
                                        <div className="flex justify-between items-center text-[10px] mt-1 text-slate-400">
                                          <span>{slab.date}</span><span className="font-bold text-emerald-400">{formatCurrency(slab.landedCostUsd)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <h4 className="text-sm font-bold text-slate-300 mb-3">Trailing 7-Day Realized Yield ({t.name})</h4>
                            <div className="relative h-32 md:h-40 w-full">
                              {seriesHasInk(t.dailyYields) ? (
                                <Line 
                                  data={{ 
                                    labels: t.dailyDates?.length ? t.dailyDates : revDates, 
                                    datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: '#f5b700', backgroundColor: 'rgba(245, 183, 0, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] 
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

      {/* TAB 2: HISTORICAL YIELD */}
      <ShareSection id="yield" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] p-4 md:p-6 rounded-2xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">Historical Yield & Payback Horizon</h2>
              <p className="text-xs md:text-sm text-slate-400 mt-1">Payback uses the live annualized rain rate. The ROI chart follows the sticky Weekly / Monthly / All control.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiers.map((t, i) => {
              const tc = tierFloorUsd(t, i) + (t.reqTokens * market.tokenPriceUsd);
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
              {histLabels.length ? (
                <Line data={{ labels: histLabels, datasets: histDatasets }} options={chartOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">No rain-backed ROI days recorded yet</div>
              )}
            </div>
          </div>
          <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
          <PaybackPanel snaps={roiSnaps} tiers={tiers} floorCostUsd={floorCostUsd} tokenPriceUsd={market.tokenPriceUsd} />
        </div>
      </ShareSection>

      {/* TAB 3: REVENUE */}
      <ShareSection id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
            This page is the slab vault, not AMM fees. Each card is a real PSA 10 the protocol bought: <strong className="text-slate-300">total volume</strong> is landed cost of every slab ever recorded, <strong className="text-slate-300">on the wall</strong> is still in custody, and <strong className="text-slate-300">with members</strong> has already rained or sold. The chart is that landed cost by the day it was written to VaultLedger — green when it went to a member, amber when it was still sitting in the vault that day.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total volume (landed cost)</p>
              <p className="text-2xl font-extrabold text-emerald-400">{formatCurrency(ledger?.volumeUsd || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">On the wall</p>
              <p className="text-2xl font-extrabold text-amber-400">{formatCurrency(ledger?.vaultedUsd || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">With members</p>
              <p className="text-2xl font-extrabold text-purple-400">{formatCurrency(ledger?.deliveredUsd || 0)}</p>
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-1">
              <h3 className="text-sm font-bold text-white">Slab landed cost by day</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">From the first vault record through today. Quiet days are $0 so the range control still reaches now. The sticky range control slices this series.</p>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              <Bar 
                data={{
                  labels: revDates,
                  datasets: [
                    { label: "Delivered to members", data: revData1, backgroundColor: "#00a804", borderRadius: 4 },
                    { label: "Still on the wall", data: revData2, backgroundColor: "#f5b700", borderRadius: 4 }
                  ]
                }} 
                options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { color: '#1e2228', borderDash: [4, 4] } }, y: { stacked: true, grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: compactUsdTick } } }, plugins: { legend: { labels: { color: '#cbd5e1' } } } }} 
              />
            </div>
          </div>
          <HolderRevenuePanel
            labels={revDates}
            data={revData1}
            note="Landed cost delivered to members that day — holder revenue for the wall."
          />
        </div>
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Liquidity</h2>
          <p className="text-xs text-slate-400">The wall itself is the inventory: slabs still in custody versus already rained to members.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">On the wall</p>
              <p className="text-2xl font-extrabold text-amber-400">{formatCurrency(ledger?.vaultedUsd || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">With members</p>
              <p className="text-2xl font-extrabold text-purple-400">{formatCurrency(ledger?.deliveredUsd || 0)}</p>
            </div>
          </div>
        </div>
      </ShareSection>

      {/* TAB 4: BURN TRACKER */}
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
            <p className="text-xs text-slate-500 mb-4">From the first recorded day through today. Quiet days keep the last cumulative burn.</p>
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
                    { type: 'line', label: 'Token Price ($)', data: fwPrices, borderColor: '#f5b700', backgroundColor: '#f5b700', borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
                    { type: 'bar', label: 'Daily Burn Velocity', data: fwBurn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }
                  ]
                }} 
                options={dualAxisOptions({
                  leftTick: compactTick,
                  rightTick: compactUsdTick,
                  rightColor: '#f5b700',
                  leftMax: flywheel.burnAxisMax,
                  leftValues: flywheel.burn,
                  rightValues: flywheel.prices,
                })} 
              />
            </div>
          </div>
        </div>
      </ShareSection>

      {/* TAB 5: ACTIVATION */}
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
             <h3 className="text-sm font-bold text-white mb-4">Historical Activity (Net vs. Daily)</h3>
             <div className="relative h-52 sm:h-64 md:h-80 w-full">
                {hasActHist ? (
                <Bar 
                  data={{
                    labels: actWin.labels,
                    datasets: [
                      { type: 'line', label: 'Net Active Units', data: actWin.cols[0], borderColor: '#f5b700', tension: 0.3, yAxisID: 'y' },
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

      {/* TAB 6: OWNERSHIP */}
      <ShareSection id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Protocol Ownership & Distribution</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Current Max Supply</p><p className="text-xl md:text-3xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || 0, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Permanently Burnt</p><p className="text-xl md:text-3xl font-extrabold text-orange-400">{formatNumber(realBurntUnits, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">AMM Vault Inventory</p><p className="text-xl md:text-3xl font-extrabold text-slate-300">{formatNumber(ownership.ammVaultNfts || 0)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner border-b-4 border-b-amber-500"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">True Circulating NFTs</p><p className="text-xl md:text-3xl font-extrabold text-amber-400">{formatNumber(ownership.circulatingNftSupply || 0)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique NFT Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(ownership.nftHolders || 0)} Wallets</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-amber-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets with an activated Card Wall</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-amber-300">{activation.activeHolders == null ? '—' : `${formatNumber(activation.activeHolders)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership Concentration</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(ownership.ownershipRatio || 0).toFixed(2)}%</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique ${config.ticker} Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(wallHolders)} Wallets</p></div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">True Active Token Holders Over Time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(ownData) ? (
              <Line 
                data={{ labels: ownLabels, datasets: [{ label: 'Active Holders', data: ownData, borderColor: '#f5b700', backgroundColor: 'rgba(245, 183, 0, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }} 
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } } } }} 
              />
              ) : (
                <EmptyChart>No holder history recorded</EmptyChart>
              )}
            </div>
          </div>
          <OwnershipHistoryPanels
            snaps={roiSnaps}
            live={{ tokenHolders: wallHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          />
        </div>
      </ShareSection>

      {/* SLAB DETAIL MODAL */}
      {selectedSlab && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedSlab(null)}>
          <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase">Collector Crypt Verified</span>
                <h3 className="text-lg font-bold text-white mt-1">{selectedSlab.cardName}</h3>
              </div>
              <button onClick={() => setSelectedSlab(null)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-[#08090b]">✕</button>
            </div>
            <div className="h-64 bg-[#08090b] rounded-xl flex items-center justify-center p-3 border border-[#1e2228]">
              <img src={selectedSlab.imageUrl} alt={selectedSlab.cardName} className="max-h-full object-contain" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#08090b] p-3 rounded-xl border border-[#1e2228]"><p className="text-slate-400 uppercase text-[9px]">Landed Cost Basis</p><p className="text-base font-extrabold text-emerald-400">{formatCurrency(selectedSlab.landedCostUsd)}</p></div>
              <div className="bg-[#08090b] p-3 rounded-xl border border-[#1e2228]"><p className="text-slate-400 uppercase text-[9px]">PSA Cert #</p><p className="text-base font-extrabold text-white">{selectedSlab.certNumber}</p></div>
              <div className="bg-[#08090b] p-3 rounded-xl border border-[#1e2228] col-span-2"><p className="text-slate-400 uppercase text-[9px]">Delivered To TBA Wallet</p><p className="text-xs font-mono text-blue-400 truncate">{selectedSlab.recipientTba}</p></div>
            </div>
          </div>
        </div>
      )}

      <MethodologyCard accent="text-amber-500">
          <p><strong className="text-white">Yield &amp; ROI:</strong> Each rank is an OpenSea rarity (1-Star through 5-Star). Cost is that rarity&apos;s listing floor. Expected yield is annualized VaultLedger delivered landed-cost, split by rarity rain weight among currently vault-activated memberships. Wall-stage and the early-build bonus are not in this table.</p>
          <p><strong className="text-white">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-white">Revenue:</strong> VaultLedger landed cost (delivered vs still on the wall), not AMM swap fees. Activations are a live SoftStakingVault scan by rarityOf, not a log replay of Anvil Activated events.</p>
          <p><strong className="text-white">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Concentration is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number. Activated-wallet count is unique vault stakers, not the NFT contract (the wall holds the memberships).</p>
      </MethodologyCard>

    </div>
  );
}