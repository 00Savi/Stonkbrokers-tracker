import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, windowLen, seriesHasInk, holderRevenueCol } from '../../lib/yieldHistory';
import { compactUsd, compactNum } from '../kit';
import { baseChartOptions, compactTick, compactUsdTick, dualAxisOptions, STREAM_COLORS } from '../../lib/charts';
import { useChartWindow } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import { YARD_WRAP, fetchYardWrap } from '../../lib/yardWrap';
import {
  EmptyChart,
  YieldUsdPricePanel,
  PaybackPanel,
  ProtocolFeeVolumePanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

function scanTokenLp(pairs, tokenCa, tokenPriceUsd) {
  const unique = new Map();
  let totalStonkLocked = 0;
  let totalLpUsd = 0;
  const addr = String(tokenCa || '').toLowerCase();
  for (const pair of pairs || []) {
    if (pair.chainId !== 'robinhood' && !(pair.url || '').includes('robinhood')) continue;
    const pairAddress = (pair.pairAddress || '').toLowerCase();
    if (!pairAddress || unique.has(pairAddress)) continue;
    const isBase = pair.baseToken?.address?.toLowerCase() === addr;
    const isQuote = pair.quoteToken?.address?.toLowerCase() === addr;
    if (!isBase && !isQuote) continue;
    const pairLiquidityUsd = pair.liquidity?.usd || 0;
    if (pairLiquidityUsd <= 0) continue;
    const stonkCount = tokenPriceUsd > 0 ? pairLiquidityUsd / 2 / tokenPriceUsd : 0;
    totalStonkLocked += stonkCount;
    totalLpUsd += pairLiquidityUsd;
    unique.set(pairAddress, {
      pairName: `${pair.baseToken?.symbol || '?'}/${pair.quoteToken?.symbol || '?'}`,
      dex: pair.dexId || 'DEX',
      liquidityUsd: Math.round(pairLiquidityUsd),
      stonkAmount: Math.round(stonkCount),
    });
  }
  return {
    totalStonkLocked: Math.round(totalStonkLocked),
    totalLpUsd: Math.round(totalLpUsd),
    pools: [...unique.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd),
  };
}

export default function YardDetailView({ data, activeTab }) {
  const [timeframe] = useChartWindow();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(true);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [liveLp, setLiveLp] = useState(null);
  const [wrap, setWrap] = useState(null);

  const project = data?.projects?.tickeryard || data?.projects?.yard;
  const lockedLpSnap = project?.lockedLp || null;
  const tokenCa = project?.config?.tokenCa;
  const tokenPx = project?.market?.tokenPriceUsd || 0;

  useEffect(() => {
    if (lockedLpSnap?.pools?.length || !tokenCa) return undefined;
    let gone = false;
    (async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCa}`);
        if (!res.ok) return;
        const j = await res.json();
        const scanned = scanTokenLp(j.pairs || [], tokenCa, tokenPx);
        if (!gone && scanned.pools.length) setLiveLp(scanned);
      } catch {
        /* DexScreener fills the LP table until the hourly job writes lockedLp. */
      }
    })();
    return () => { gone = true; };
  }, [tokenCa, lockedLpSnap, tokenPx]);

  useEffect(() => {
    let gone = false;
    fetchYardWrap().then((w) => { if (!gone) setWrap(w); }).catch(() => {});
    return () => { gone = true; };
  }, []);

  if (!project) return <div className="text-center text-slate-400 p-12">TickerYard Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, dailySnapshots = [] } = project;
  const lockedLp = lockedLpSnap?.pools?.length ? lockedLpSnap : liveLp;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const chartOptions = baseChartOptions();

  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe);
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const byKey = Object.fromEntries((rawRev.cols || []).map((c) => [c.key, c]));
  const slicedVault = sliceCols(
    rawRev.labels,
    [{ ...(byKey.amm || { data: [] }), label: 'Vault distributions', color: STREAM_COLORS.amm }],
    timeframe,
  );
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe);

  // 3. Burn Tracker Data (Cumulative Ratchet: prevents values from dropping)
  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  
  const burn = burnSeries(project, timeframe);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;

  // 4. Flywheel Chart
  const flywheel = burnRateSeries(project, timeframe);
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
    return Math.max(0, (s.act || 0) - (s.deact || 0));
  }); 

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const ownN = windowLen(timeframe, holdersFull.labels.length);
  const ownLabels = holdersFull.labels.slice(-ownN);
  const ownData = holdersFull.data.slice(-ownN);
  const yardHolders = Number(ownership.yardHolders) || Number(ownership.tokenHolders) || Number(ownership.stonkHolders) || Number(ownership.erc20Holders) || 0;

  const actN = windowLen(timeframe, actLabels.length);

  return (
    <div className="space-y-6 relative">
      
      {/* ==================== TAB 1: ROI BENCHMARKS ==================== */}
      <section id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🌿</span> TickerYard Global Yield ROI Benchmarks
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
                            <span className="bg-[#08090b] border border-[#1e2228] text-cyan-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Weight: <span className="text-yellow-500 font-semibold">{((t.weight || 100) / 100).toFixed(2)}x</span></div>
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
                                  datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] 
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
              <Line data={{ labels: histLabels, datasets: histDatasets }} options={chartOptions} />
            </div>
          </div>
          <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
          <PaybackPanel snaps={roiSnaps} tiers={tiers} floorCostUsd={floorCostUsd} tokenPriceUsd={market.tokenPriceUsd} />
        </div>
      </section>

      {/* ==================== TAB 3: VAULT DISTRIBUTIONS ==================== */}
      <section id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">Vault distributions</h2>
              <p className="text-xs text-slate-400 mt-1">SoftStakingVault RewardPaid is $YARD paid to activated Yardkeepers. The yBTC wrap is a separate 0.30% CCIP fee that still sits in the Arbitrum WBTC vault — it is not in the $YARD RewardPaid series.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Vault distributions ({revPeriod})</p>
              <p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.amm }}>{formatCurrency(slicedVault.cols[0]?.total || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Holder payout ({revPeriod})</p>
              <p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.holdersRev }}>{formatCurrency(slicedHolder.cols[0]?.total || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">yBTC wrap fee</p>
              <p className="text-2xl font-extrabold text-cyan-300">{((wrap?.wrapFeeBps || YARD_WRAP.wrapFeeBps) / 100).toFixed(2)}%</p>
              <p className="text-[11px] text-slate-500 mt-1">WBTC on Arbitrum → yBTC on Robinhood via Chainlink CCIP. Fee stays in the Arbitrum vault until a Yardkeeper sync.</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">yBTC receipts</p>
              <p className="text-2xl font-extrabold text-white">{wrap?.ybtcSupply > 0 ? `${wrap.ybtcSupply.toFixed(4)} BTC` : '—'}</p>
              <p className="text-[11px] text-slate-500 mt-1">{wrap?.ybtcUsd > 0 ? `${formatCurrency(wrap.ybtcUsd)} DexScreener` : 'Live supply from the YAssetReceipt'}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">yXAUT (Chainlink CCIP)</p>
              <p className="text-2xl font-extrabold text-slate-400">Not live</p>
              <p className="text-[11px] text-slate-500 mt-1">Same YAssetGateway. Tether Gold receipt is coded; no receipt token is installed yet.</p>
            </div>
          </div>

          <ProtocolFeeVolumePanels
            labels={slicedVault.labels}
            cols={slicedVault.cols}
            kind={rawRev.kind}
            title="Daily vault distributions (USD)"
            note="RewardPaid from the TickerYard SoftStakingVault. This is yield paid to activated Yardkeepers, not a StonkBrokers AMM / Clock-In / snipe mix."
            holder={{
              labels: slicedHolder.labels,
              data: slicedHolder.cols[0]?.data,
              title: 'Holder payout (USD)',
              note: 'Per-NFT daily yield × active Yardkeepers. Same RewardPaid, reconstructed by Anvil tier.',
            }}
          />
        </div>
      </section>

      <section id="liquidity" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Liquidity</h2>
          <p className="text-xs text-slate-400">Locked pool reserves scanned from partner, meme, and launchpad pairs.</p>
          {lockedLp && lockedLp.pools && lockedLp.pools.length > 0 ? (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> Ecosystem Tokens Locked</h3>
                </div>
                <div className="text-right flex flex-col items-end w-full md:w-auto">
                  <p className="text-base font-extrabold text-orange-400">{formatNumber(lockedLp.totalStonkLocked || 0)} {config.ticker}</p>
                  <p className="text-[10px] text-slate-400">{formatCurrency(lockedLp.totalLpUsd || 0)} Total Pool Reserves</p>
                  <button onClick={() => setLpTableOpen(!lpTableOpen)} className="mt-2 text-[10px] bg-[#0e1013] border border-[#1e2228] text-slate-300 px-3 py-1 rounded hover:text-white transition shadow-sm w-full md:w-auto">
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
          ) : (
            <p className="text-sm text-slate-500">No locked LP scanned for this project yet.</p>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* TAB 4: BURN TRACKER (Ratchet-secured cumulative burn chart) */}
      {/* ========================================================================= */}
      <section id="burn" className="scroll-mt-32">
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
                data={{
                  labels: flywheel.labels,
                  datasets: [
                    { type: 'line', label: 'Token Price ($)', data: fwPrices, borderColor: '#38bdf8', backgroundColor: '#38bdf8', borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
                    { type: 'bar', label: 'Daily Burn Velocity', data: fwBurn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }
                  ]
                }} 
                options={dualAxisOptions({ leftTick: compactTick, rightTick: compactUsdTick, rightColor: '#38bdf8', leftMax: flywheel.burnAxisMax })} 
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
      {/* TAB 6: OWNERSHIP */}
      {/* ========================================================================= */}
      <section id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Protocol Ownership & Distribution</h2>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Current Max Supply</p><p className="text-xl md:text-3xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || 0, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Permanently Burnt</p><p className="text-xl md:text-3xl font-extrabold text-orange-400">{formatNumber(realBurntUnits, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">AMM Vault Inventory</p><p className="text-xl md:text-3xl font-extrabold text-slate-300">{formatNumber(ownership.ammVaultNfts || 0)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner border-b-4 border-b-cyan-500"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">True Circulating NFTs</p><p className="text-xl md:text-3xl font-extrabold text-cyan-400">{formatNumber(ownership.circulatingNftSupply || 0)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique NFT Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(ownership.nftHolders || 0)} Wallets</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-cyan-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets with an activated Yard</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-cyan-300">{activation.activeHolders == null ? '—' : `${formatNumber(activation.activeHolders)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership Concentration</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(ownership.ownershipRatio || 0).toFixed(2)}%</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique ${config.ticker} Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-purple-400">{formatNumber(yardHolders)} Wallets</p></div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">True Active Token Holders Over Time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(ownData) ? (
              <Line 
                data={{ labels: ownLabels, datasets: [{ label: 'Active Holders', data: ownData, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }} 
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } } } }} 
              />
              ) : (
                <EmptyChart>No holder history recorded</EmptyChart>
              )}
            </div>
          </div>
          <OwnershipHistoryPanels
            snaps={roiSnaps}
            live={{ tokenHolders: yardHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          />
        </div>
      </section>

      <MethodologyCard accent="text-cyan-500">
          <p><strong className="text-white">Yield &amp; ROI:</strong> TickerYard is a SoftStakingVault, not the StonkBrokers T4 oracle. Cash-on-cash is annualized vault yield ÷ (NFT floor USD + activation tokens at DexScreener spot), split by Anvil tier weight (1.00×–3.33×). Live yield is a trailing sample, not a promised APY. Keeper jobs described in the TickerYard whitepaper are extra work for enrolled T4 operators and are not in these CoC numbers.</p>
          <p><strong className="text-white">Distributions:</strong> The $YARD series is SoftStakingVault RewardPaid. That is holder yield, not Anvil AMM fees or launchpad snipe tax.</p>
          <p><strong className="text-white">yBTC wrap:</strong> TickerYard&apos;s Bitcoin bridge is a Chainlink CCIP canonical wrap: WBTC locked on Arbitrum (<code>YAssetVault</code>) mints yBTC on Robinhood (<code>YAssetReceipt</code>). Wrap fee is 30 bps, taken on Arbitrum. Extra WBTC vs yBTC supply is un-synced protocol fee; <code>YardkeeperRewardsSynchronized</code> has not fired, so wrap fees are not in the $YARD RewardPaid chart. yXAUT (Tether Gold) is the next CCIP receipt in the same gateway and is not installed yet.</p>
          <p><strong className="text-white">Activation:</strong> Same reconstruction as Mancer. The vault emits no Deactivated event — a sale clears the position. <code>activeCount()</code> is an upper bound; this page replays Activated plus NFT transfers.</p>
          <p><strong className="text-white">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-white">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Concentration is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number. Activated-wallet count is unique current owners of NFTs that still have an open activation.</p>
      </MethodologyCard>

    </div>
  );
}