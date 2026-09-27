import React, { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, protocolRevenueChart, sliceCols, seriesHasInk, windowChart } from '../../lib/yieldHistory';
import { BetaTag, compactUsd, compactNum, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { CopyControl, ShareSection, copySectionEl } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, cumulativeBurnDataset, dualAxisOptions, TIER_COLORS, percentTick } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import {
  EmptyChart,
  YieldUsdPricePanel,
  ActivityChart,
  ActivationStackPanel,
  OwnershipHistoryPanels,
  HolderRevenuePanel,
  OnboardLinePanel,
} from '../HistoryCharts';
import { SliceChart } from '../SliceChart';
import { loadLiveDrops, mergeDrops } from '../../lib/cardwallDrops';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const PULL_SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'value', label: 'Value' },
  { id: 'paid', label: 'Paid' },
  { id: 'edge', label: 'Edge' },
  { id: 'name', label: 'Name' },
];

function sortPulls(list, sort) {
  const rows = [...list];
  const edge = (row) => (Number(row.value) || 0) - (Number(row.paid) || 0);
  rows.sort((a, b) => {
    if (sort === 'value') return (Number(b.value) || 0) - (Number(a.value) || 0) || String(b.at || '').localeCompare(String(a.at || ''));
    if (sort === 'paid') return (Number(b.paid) || 0) - (Number(a.paid) || 0) || String(b.at || '').localeCompare(String(a.at || ''));
    if (sort === 'edge') return edge(b) - edge(a) || String(b.at || '').localeCompare(String(a.at || ''));
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    return String(b.at || '').localeCompare(String(a.at || ''));
  });
  return rows;
}

function DropEdge({ paid, value, formatCurrency, className = '' }) {
  const edge = (Number(value) || 0) - (Number(paid) || 0);
  const tone = edge > 0 ? 'text-emerald-400' : edge < 0 ? 'text-red-400' : 'text-slate-500';
  return (
    <span className={`block font-bold ${tone} ${className}`}>
      {edge > 0 ? '+' : ''}{formatCurrency(edge)}
    </span>
  );
}

export default function CardWallDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [selectedSlab, setSelectedSlab] = useState(null);
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [liveDrops, setLiveDrops] = useState(null);
  const [machinePulls, setMachinePulls] = useState(undefined);
  const [openMachine, setOpenMachine] = useState(null);
  const [pullSort, setPullSort] = useState('recent');
  const dropsRef = useRef(null);
  const dropModalRef = useRef(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);
    loadLiveDrops(ac.signal)
      .then((drops) => {
        if (!ac.signal.aborted && drops) setLiveDrops(drops);
      })
      .catch(() => {});
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/gacha-pulls.json?v=${Date.now()}`, { signal: ac.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (ac.signal.aborted) return;
        setMachinePulls(Array.isArray(body?.pulls) ? body.pulls : null);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setMachinePulls(null);
      });
    return () => ac.abort();
  }, []);
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
  const gacha = project.gacha || null;
  const gachaWin = gacha?.historyDates?.length
    ? windowChart(gacha.historyDates, [gacha.historyAlley || [], gacha.historyClaw || []], timeframe, interval, ['sum', 'sum'])
    : null;
  const edgeWin = gacha?.historyValue?.length
    ? windowChart(gacha.historyDates, [gacha.historyUsd || [], gacha.historyValue || []], timeframe, interval, ['sum', 'sum'])
    : null;
  const edge = gacha?.edge || null;
  const drops = mergeDrops(gacha?.drops, liveDrops);
  const pullsByMachine = new Map();
  for (const pull of machinePulls || []) {
    if (!pull?.machineHash) continue;
    const list = pullsByMachine.get(pull.machineHash);
    if (list) list.push(pull);
    else pullsByMachine.set(pull.machineHash, [pull]);
  }
  const railLine = (rails) => {
    if (!rails) return '';
    const bits = [
      ['USDG', rails.usdg],
      ['$WALL', rails.wall],
      ['ETH', rails.eth],
      ['WETH', rails.weth],
    ].filter(([, n]) => Number(n) > 0);
    return bits.map(([name, n]) => `${name} ${formatCurrency(n)}`).join(' · ');
  };
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Staking to holders</p>
              <p className="text-xl font-extrabold text-emerald-400 mt-1">{formatCurrency(revenue.holderStaking30dUsd || 0)}</p>
              <p className="text-[11px] text-slate-500 mt-1">RewardPaid in $WALL over the last 30 days. This is the yield in the table, annualized.</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Slab rain to holders</p>
              <p className="text-xl font-extrabold text-amber-400 mt-1">{formatCurrency(revenue.holderRainUsd || ledger?.deliveredUsd || 0)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Landed cost of slabs delivered since the vault opened, split by wall level.</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Gacha charged</p>
              <p className="text-xl font-extrabold text-slate-300 mt-1">{formatCurrency(gacha?.usd || 0)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Pull receipts. They restock the vault. They are not added again on top of rain.</p>
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
                                  options={baseChartOptions(t.dailyDates, 'daily', { yUnit: 'USD', yTick: compactUsdTick })} 
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
                <Line data={{ labels: histLabels, datasets: histDatasets }} options={baseChartOptions(histLabels, interval, { yUnit: 'CoC %', yTick: percentTick })} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">No rain-backed ROI days recorded yet</div>
              )}
            </div>
          </div>
          <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
        </div>
      </ShareSection>

      {/* TAB 3: REVENUE */}
      <ShareSection id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">Gacha pull revenue</h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-3xl mt-1">
                The Alley and The Claw charge ETH, WETH, USDG, or $WALL for a slab. This is that charge, taken from each machine&apos;s pull event. Buyback credit spent on the claw is a recycled payout, so it is not counted again.
              </p>
            </div>
            {gacha ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
                    <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Pull revenue</p>
                    <p className="text-2xl font-extrabold text-emerald-400">{formatCurrency(gacha.usd || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatNumber(gacha.pulls || 0)} pulls</p>
                  </div>
                  <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
                    <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">The Alley</p>
                    <p className="text-2xl font-extrabold text-amber-400">{formatCurrency(gacha.alley?.usd || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatNumber(gacha.alley?.pulls || 0)} pulls{railLine(gacha.alley?.rails) ? ` · ${railLine(gacha.alley.rails)}` : ''}</p>
                  </div>
                  <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
                    <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">The Claw</p>
                    <p className="text-2xl font-extrabold text-violet-300">{formatCurrency(gacha.claw?.usd || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatNumber(gacha.claw?.pulls || 0)} pulls{gacha.claw?.creditPulls ? ` · ${formatNumber(gacha.claw.creditPulls)} on credit` : ''}{railLine(gacha.claw?.rails) ? ` · ${railLine(gacha.claw.rails)}` : ''}</p>
                  </div>
                </div>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                  <h3 className="text-sm font-bold text-white mb-1">Pulls by day</h3>
                  <p className="text-xs text-slate-500 mb-4">USD charged that day. The sticky range control slices this series. The Claw is the crane at thecardwall.com/crane.</p>
                  <div className="relative h-52 sm:h-64 md:h-80 w-full">
                    {gachaWin?.labels?.length ? (
                      <Bar
                        data={{
                          labels: gachaWin.labels,
                          datasets: [
                            { label: 'The Alley', data: gachaWin.cols[0] || [], backgroundColor: '#f5b700', borderRadius: 4 },
                            { label: 'The Claw', data: gachaWin.cols[1] || [], backgroundColor: '#a78bfa', borderRadius: 4 },
                          ],
                        }}
                        options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { color: '#1e2228', borderDash: [4, 4] } }, y: { stacked: true, unit: 'USD', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: compactUsdTick } } }, plugins: { legend: { labels: { color: '#cbd5e1' } } } }}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-slate-500">No pulls recorded yet</div>
                    )}
                  </div>
                </div>
                {gacha.machines?.length ? (
                  <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                    <h3 className="text-sm font-bold text-white mb-1">Alley machines</h3>
                    <p className="text-xs text-slate-500 mb-3">Open a machine for every slab it revealed. Sort by newest, value, what was paid, or the difference.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                            <th className="pb-2 font-medium">Machine</th>
                            <th className="pb-2 font-medium text-right">Pulls</th>
                            <th className="pb-2 font-medium text-right">Paid in</th>
                            <th className="pb-2 font-medium text-right">Card value</th>
                            <th className="pb-2 font-medium text-right">Spread</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gacha.machines.map((m) => {
                            const open = openMachine === m.id;
                            const rows = open ? sortPulls(pullsByMachine.get(m.id) || [], pullSort) : [];
                            return (
                              <React.Fragment key={m.id}>
                                <tr
                                  className={`border-t border-[#1e2228] cursor-pointer hover:bg-white/[0.03] ${open ? 'bg-white/[0.03]' : ''}`}
                                  onClick={() => setOpenMachine(open ? null : m.id)}
                                >
                                  <td className="py-2 text-slate-300">
                                    <span className="inline-flex items-center gap-2">
                                      <span className="text-[10px] text-slate-500 w-3" aria-hidden="true">{open ? '▾' : '▸'}</span>
                                      {m.label}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right text-slate-400">{formatNumber(m.pulls)}</td>
                                  <td className="py-2 text-right text-amber-400">{formatCurrency(m.paidIn ?? m.usd)}</td>
                                  <td className="py-2 text-right text-slate-300">{formatCurrency(m.valueOut || 0)}</td>
                                  <td className={`py-2 text-right font-semibold ${(m.spread || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(m.spread || 0)}</td>
                                </tr>
                                {open ? (
                                  <tr className="border-t border-[#1e2228]">
                                    <td colSpan={5} className="px-2 py-3" data-share-omit>
                                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                        {PULL_SORTS.map((sort) => (
                                          <button
                                            key={sort.id}
                                            type="button"
                                            onClick={() => setPullSort(sort.id)}
                                            className={`rounded-md border px-2 py-1 font-mono text-[10px] ${
                                              pullSort === sort.id
                                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                                : 'border-[#1e2228] text-slate-400 hover:text-white'
                                            }`}
                                          >
                                            {sort.label}
                                          </button>
                                        ))}
                                        <span className="ml-auto text-[10px] text-slate-500">{formatNumber(rows.length)} slabs</span>
                                      </div>
                                      {machinePulls === undefined ? (
                                        <p className="text-xs text-slate-500">Loading pulls…</p>
                                      ) : machinePulls === null ? (
                                        <p className="text-xs text-slate-500">The pull list lands with the next hourly index.</p>
                                      ) : rows.length ? (
                                        <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-[#1e2228]">
                                          {rows.map((pull) => (
                                            <button
                                              key={pull.id}
                                              type="button"
                                              onClick={() => setSelectedDrop({ ...pull, machine: pull.machine || m.label, game: pull.game || 'alley' })}
                                              className="flex w-full items-center gap-3 border-b border-[#1e2228] px-3 py-2 text-left last:border-b-0 hover:bg-white/[0.03]"
                                            >
                                              <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-[#08090b]">
                                                {pull.image ? (
                                                  <img src={pull.image} alt="" data-drop-id={pull.id} className="h-full w-full object-contain" />
                                                ) : null}
                                              </span>
                                              <span className="min-w-0 flex-1">
                                                <span className={`block truncate text-sm ${pull.pending ? 'text-slate-500' : 'text-white'}`}>{pull.name}</span>
                                                <span className="block truncate text-[10px] text-slate-500">
                                                  {[pull.grade, pull.at ? `${pull.at.replace('T', ' ').slice(0, 16)} UTC` : null].filter(Boolean).join(' · ')}
                                                </span>
                                              </span>
                                              <span className="shrink-0 text-right">
                                                <span className="block text-sm font-bold text-amber-400 leading-none">{formatCurrency(pull.value || 0)}</span>
                                                <span className="block text-[10px] text-slate-500 mt-1">paid {formatCurrency(pull.paid || 0)}</span>
                                                <DropEdge paid={pull.paid} value={pull.value} formatCurrency={formatCurrency} className="text-[10px]" />
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-slate-500">No revealed slabs for this machine.</p>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                {edge ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">Paid in vs card value out</h3>
                      <p className="text-sm text-slate-400 leading-relaxed max-w-3xl mt-1">
                        Each pull hands back a slab with a posted value: insured price on The Alley, fair-market value on The Claw. Spread is money in minus that posted value. It is the house result against the card the player was awarded, not what the protocol paid to acquire the slab. On The Alley, {formatNumber(edge.deliveredPulls || 0)} slabs actually left ({formatCurrency(edge.deliveredValue || 0)} posted). {formatNumber(edge.buybackPulls || 0)} were sold back for {formatCurrency(edge.buybackUsd || 0)}, and those cards stayed.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
                        <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Money in</p>
                        <p className="text-2xl font-extrabold text-emerald-400">{formatCurrency(edge.moneyIn || 0)}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatNumber(edge.awarded || 0)} cards revealed{edge.refunded ? ` · ${formatNumber(edge.refunded)} refunded` : ''}</p>
                      </div>
                      <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
                        <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Card value out</p>
                        <p className="text-2xl font-extrabold text-amber-400">{formatCurrency(edge.valueOut || 0)}</p>
                        <p className="text-xs text-slate-500 mt-1">Alley {formatCurrency(edge.alley?.valueOut || 0)} · Claw {formatCurrency(edge.claw?.valueOut || 0)}{edge.creditValue ? ` · ${formatCurrency(edge.creditValue)} on credit` : ''}</p>
                      </div>
                      <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
                        <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Spread</p>
                        <p className={`text-2xl font-extrabold ${(edge.spread || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(edge.spread || 0)}</p>
                        <p className="text-xs text-slate-500 mt-1">{edge.buybackPulls ? `${formatNumber(edge.buybackPulls)} alley slabs sold back for ${formatCurrency(edge.buybackUsd)}` : 'No alley buybacks recorded'}</p>
                      </div>
                    </div>
                    <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                      <h3 className="text-sm font-bold text-white mb-1">Money in and card value by day</h3>
                      <p className="text-xs text-slate-500 mb-4">Green is what players paid. Amber is the posted value of the slabs revealed that day. The sticky range control slices this series.</p>
                      <div className="relative h-52 sm:h-64 md:h-80 w-full">
                        {edgeWin?.labels?.length ? (
                          <Bar
                            data={{
                              labels: edgeWin.labels,
                              datasets: [
                                { label: 'Paid in', data: edgeWin.cols[0] || [], backgroundColor: '#00a804', borderRadius: 4 },
                                { label: 'Card value', data: edgeWin.cols[1] || [], backgroundColor: '#f5b700', borderRadius: 4 },
                              ],
                            }}
                            options={{ responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] } }, y: { unit: 'USD', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: compactUsdTick } } }, plugins: { legend: { labels: { color: '#cbd5e1' } } } }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-slate-500">No card values recorded yet</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                {drops.length ? (
                  <div ref={dropsRef} id="cardwall-drops" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                    <div className="flex justify-between items-end gap-3 mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-white">Latest drops</h3>
                        <p className="text-xs text-slate-500 mt-1">Newest slabs the machines revealed. A reload includes pulls the hourly index has not written yet. Paid is the pull. Value is the posted insured or fair-market price. Click a card for the full pull.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CopyControl
                          alwaysLabel
                          heading
                          idleLabel="Copy section"
                          title="Copy the latest drops for X"
                          className="bg-[#0e1013]"
                          onCopy={() => copySectionEl(dropsRef.current, 'cardwall-drops')}
                        />
                        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{drops.length} shown</span>
                      </div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {drops.map((drop) => (
                        <button
                          key={drop.id}
                          type="button"
                          onClick={() => setSelectedDrop(drop)}
                          className="shrink-0 w-36 bg-[#0e1013] border border-[#1e2228] rounded-xl p-2.5 flex flex-col text-left cursor-pointer hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all"
                        >
                          <div className="w-full h-40 bg-[#08090b] rounded-lg overflow-hidden flex items-center justify-center relative">
                            {drop.image ? (
                              <img src={drop.image} alt={drop.name} data-drop-id={drop.id} className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-[10px] text-slate-500">No photo</span>
                            )}
                            {drop.grade ? <span className="absolute top-1.5 right-1.5 bg-emerald-500/90 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded">{drop.grade}</span> : null}
                          </div>
                          <p className="mt-2 text-xs font-bold text-white line-clamp-2 min-h-8">{drop.name}</p>
                          <p className="text-[10px] text-slate-500 mt-1 truncate">{drop.game === 'claw' ? 'The Claw' : drop.machine}</p>
                          <div className="mt-2 flex justify-between items-start text-[10px] w-full gap-2">
                            <span className="text-slate-400">Paid {formatCurrency(drop.paid || 0)}</span>
                            <span className="text-right">
                              <span className="block font-bold text-amber-400">{formatCurrency(drop.value || 0)}</span>
                              <DropEdge paid={drop.paid} value={drop.value} formatCurrency={formatCurrency} />
                            </span>
                          </div>
                          {drop.buyback ? <p className="text-[10px] text-violet-300 mt-1">Sold back {formatCurrency(drop.buyback)}</p> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">Pull revenue has not been indexed yet.</p>
            )}
          </div>

          <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
            Below that is the slab vault, not AMM fees. Each card is a real grade 10 the protocol bought: <strong className="text-slate-300">total volume</strong> is landed cost of every slab ever recorded, <strong className="text-slate-300">on the wall</strong> is still in custody, and <strong className="text-slate-300">with members</strong> has already rained or sold. The chart is that landed cost by the day it was written to VaultLedger — green when it went to a member, amber when it was still sitting in the vault that day.
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
                options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { color: '#1e2228', borderDash: [4, 4] } }, y: { stacked: true, unit: 'USD', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: compactUsdTick } } }, plugins: { legend: { labels: { color: '#cbd5e1' } } } }} 
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
                  data={{ labels: slicedBurnLabels, datasets: [cumulativeBurnDataset(slicedBurnData, '#fb923c')] }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, unit: 'Tokens', ticks: { color: '#94a3b8', callback: compactTick } } } }}
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
                    { type: 'line', label: 'Token Price ($)', data: fwPrices, borderColor: '#f5b700', borderDash: [5, 4], borderWidth: 1.75, tension: 0, pointRadius: 0, yAxisID: 'y1' },
                    { type: 'bar', label: 'Daily Burn Velocity', data: fwBurn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }
                  ]
                }} 
                options={dualAxisOptions({
                  leftTick: compactTick,
                  rightTick: compactUsdTick,
                  rightColor: '#f5b700',
                  leftMax: flywheel.burnAxisMax,
                  leftUnit: 'Tokens / day',
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
            note="Act is an activation or an upgrade into this wall level. Deact is a void or a sale. Up is a move to a higher level, not an exit."
          />

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <h3 className="text-sm font-bold text-white mb-6">Who is staked, by wall level</h3>
            <SliceChart
              noun="Active"
              format={formatNumber}
              slices={tiers.map((t, idx) => ({
                label: `${t.tier}: ${t.name}`,
                value: breakdownArr[idx],
                color: TIER_COLORS[idx % TIER_COLORS.length],
              }))}
            />
          </div>

          <ActivationStackPanel snaps={roiSnaps} tiers={tiers} breakdown={activation.breakdown} />
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
             <h3 className="text-sm font-bold text-white mb-4">Historical Activity (Net vs. Daily)</h3>
             <div className="relative h-52 sm:h-64 md:h-80 w-full">
                {hasActHist ? (
                <ActivityChart
                  labels={actWin.labels}
                  net={actWin.cols[0]}
                  ins={actWin.cols[1]}
                  outs={actWin.cols[2]}
                  interval={interval}
                  lineColor="#f5b700"
                  lineLabel="Net Active Units"
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
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-violet-500/20">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Chain onboard</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-violet-300">{formatNumber(Number(data?.onboarding?.byProject?.cardwall?.wallets) || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">First 10 txs · NFT {formatNumber(data?.onboarding?.byProject?.cardwall?.nft || 0)}{(Number(data?.onboarding?.byProject?.cardwall?.token) || 0) ? ` · token ${formatNumber(data.onboarding.byProject.cardwall.token)}` : ''}</p>
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">True Active Token Holders Over Time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(ownData) ? (
              <Line 
                data={{ labels: ownLabels, datasets: [{ label: 'Active Holders', data: ownData, borderColor: '#f5b700', backgroundColor: 'rgba(245, 183, 0, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }} 
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, unit: 'Wallets', ticks: { color: '#94a3b8', callback: compactTick } } } }} 
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
          <OnboardLinePanel data={data} projectKey="cardwall" timeframe={timeframe} interval={interval} name="The Card Wall" />
        </div>
      </ShareSection>

      {/* SLAB DETAIL MODAL */}
      {selectedDrop && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={() => setSelectedDrop(null)}>
          <div ref={dropModalRef} id="cardwall-drop" className="bg-[#0e1013] border border-[#1e2228] rounded-2xl w-full max-w-xl max-h-[94vh] overflow-y-auto p-4 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3 shrink-0 mb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400">{selectedDrop.game === 'claw' ? 'The Claw' : selectedDrop.machine}</p>
                <h3 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2">{selectedDrop.name}</h3>
                {selectedDrop.at ? <p className="text-[10px] text-slate-500 mt-0.5">{selectedDrop.at.replace('T', ' ').slice(0, 16)} UTC</p> : null}
              </div>
              <div className="flex items-center gap-2 shrink-0" data-share-omit>
                <CopyControl
                  alwaysLabel
                  heading
                  idleLabel="Copy"
                  title="Copy this pull for X"
                  className="bg-[#08090b]"
                  onCopy={() => copySectionEl(dropModalRef.current, 'cardwall-drop')}
                />
                <button type="button" onClick={() => setSelectedDrop(null)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-[#08090b]">✕</button>
              </div>
            </div>
            <div className="h-[min(62vh,680px)] shrink-0 bg-[#08090b] rounded-xl flex items-center justify-center p-2 border border-[#1e2228]">
              {selectedDrop.image ? (
                <img src={selectedDrop.image} alt={selectedDrop.name} data-drop-id={selectedDrop.id} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-slate-500">No photo</span>
              )}
            </div>
            <div className="shrink-0 pt-3 space-y-2">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">Paid</p>
                  <p className="text-lg font-extrabold text-emerald-400 leading-none">{formatCurrency(selectedDrop.paid || 0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">{selectedDrop.game === 'claw' ? 'Fair market value' : 'Insured value'}</p>
                  <p className="text-lg font-extrabold text-amber-400 leading-none">{formatCurrency(selectedDrop.value || 0)}</p>
                  <DropEdge paid={selectedDrop.paid} value={selectedDrop.value} formatCurrency={formatCurrency} className="text-xs" />
                </div>
              </div>
              {[selectedDrop.grade, selectedDrop.rarity, selectedDrop.year, selectedDrop.number, selectedDrop.parallel].filter(Boolean).length ? (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {[selectedDrop.grade, selectedDrop.rarity, selectedDrop.year, selectedDrop.number, selectedDrop.parallel].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {selectedDrop.set ? <p className="text-xs text-slate-400">{selectedDrop.set}{selectedDrop.edition ? ` · ${selectedDrop.edition}` : ''}</p> : null}
              {selectedDrop.cert ? <p className="text-xs text-slate-400">Cert {selectedDrop.cert}</p> : null}
              {selectedDrop.buyback ? (
                <p className="text-xs font-semibold text-violet-300">Sold back {formatCurrency(selectedDrop.buyback)}{selectedDrop.payoutWall ? ` · ${formatNumber(selectedDrop.payoutWall)} $WALL` : ''}</p>
              ) : selectedDrop.delivered ? (
                <p className="text-xs font-semibold text-slate-300">Delivered to the player</p>
              ) : null}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" data-share-omit>
                {selectedDrop.tx ? <a href={`https://robin.etherscan.io/tx/${selectedDrop.tx}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">Payment</a> : null}
                {selectedDrop.payoutTx ? <a href={`https://robin.etherscan.io/tx/${selectedDrop.payoutTx}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">Buyback</a> : null}
                {selectedDrop.deliverTx ? <a href={`https://robin.etherscan.io/tx/${selectedDrop.deliverTx}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">Delivery</a> : null}
                {selectedDrop.cert && String(selectedDrop.grade || '').startsWith('PSA') ? <a href={`https://www.psacard.com/cert/${selectedDrop.cert}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">PSA cert</a> : null}
              </div>
            </div>
          </div>
        </div>
      )}

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
          <p><strong className="text-white">Yield &amp; ROI:</strong> Each row is a wall level, Foundation through Fortress. Cost is the membership floor plus the $WALL to reach that level. Expected yield is two holder streams: RewardPaid staking over the last 30 days, annualized and split by that level&apos;s weight, plus slab-rain landed cost since the vault opened, split by the level&apos;s rain points. Gacha pull receipts restock the vault and are not added on top of slabs already delivered. The early-build bonus and the extra rain points from star rarity are not in this table.</p>
          <p><strong className="text-white">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-white">Revenue:</strong> Gacha pull revenue is the USD price charged on The Alley till (0x6686…5676) and The Claw pool (0xC004…6b33, the crane). Alley USD is the quote&apos;s reference cents. Claw USD is the USDG received, plus $WALL at that day&apos;s close and WETH at the ETH price. Credit pulls are excluded from money in. Card value out is the insured price on The Alley and the fair-market value on The Claw, joined from each pull result. Spread is money in minus that posted value. It is not the protocol&apos;s purchase cost. Alley buyback cash is shown separately: those slabs were sold back and stayed with the house. The slab chart under it is VaultLedger landed cost (delivered vs still on the wall), not AMM swap fees. Activations are a live SoftStakingVault scan by rarityOf, not a log replay of Anvil Activated events.</p>
          <p><strong className="text-white">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Concentration is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number. Activated-wallet count is unique vault stakers, not the NFT contract (the wall holds the memberships). Chain onboard is unique EOAs whose first cluster buy or mint of this project was one of their first 10 txs.</p>
      </MethodologyCard>

    </div>
  );
}