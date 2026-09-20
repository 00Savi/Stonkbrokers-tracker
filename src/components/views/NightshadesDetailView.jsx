import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, windowLen, seriesHasInk } from '../../lib/yieldHistory';
import { compactUsd, compactNum } from '../kit';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, dualAxisOptions } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { NIGHTSHADES_FACTION_META } from '../../lib/nightshades';
import NightshadesAllView, { NightshadesNightSection } from './NightshadesAllView';
import { MethodologyCard } from '../Disclaimer';
import {
  EmptyChart,
  YieldUsdPricePanel,
  PaybackPanel,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const ACCENT = '#818cf8';
const FACTION_TABS = [{ id: 'all', label: 'All' }, ...NIGHTSHADES_FACTION_META];

export function useNightshadesFaction() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get('faction') || 'all').toLowerCase();
  const faction = FACTION_TABS.some((f) => f.id === raw) ? raw : 'all';
  const setFaction = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('faction');
    else next.set('faction', id);
    setParams(next, { replace: true });
  };
  return { faction, setFaction };
}

/** Lives in the project chrome so it sticks with the tab bar, not under it. */
export function NightshadesFactionBar() {
  const { faction, setFaction } = useNightshadesFaction();
  return (
    <div className="flex flex-wrap gap-1 border-b border-line pb-3">
      {FACTION_TABS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setFaction(f.id)}
          className={`flex-1 min-w-[4.5rem] px-3 py-2 text-xs font-bold rounded-lg transition ${
            faction === f.id
              ? 'bg-[#818cf8] text-[#08090b] shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-[#1e2228]'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function NightshadesDetailView({ data, activeTab }) {
  const { faction, setFaction } = useNightshadesFaction();
  const project = data?.projects?.nightshades;
  if (!project) return <div className="text-center text-slate-400 p-12">Nightshades Data Loading...</div>;
  if (faction === 'all') return <NightshadesAllView project={project} setFaction={setFaction} />;
  return (
    <NightshadesFactionDetail
      activeTab={activeTab}
      faction={faction}
      project={project}
    />
  );
}

function NightshadesFactionDetail({ activeTab, faction, project }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);

  const slice = project.factions?.[faction];
  if (!slice) return <div className="text-center text-slate-400 p-12">Nightshades Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, dailySnapshots = [] } = slice;
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;
  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
  const chartOptions = baseChartOptions();
  const factionLabel = FACTION_TABS.find((f) => f.id === faction)?.label || faction;
  const tokenLabel = `$${config.ticker || 'TOKEN'}`;
  const yieldTitle = `Nightshades ${factionLabel}`;

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map((s) => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(slice, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  const burn = burnSeries(slice, timeframe, interval);
  const flywheel = burnRateSeries(slice, timeframe, interval);

  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actLabels = hasActHist ? formatLabels(actHistory.labels) : [];
  const actCum = hasActHist && actHistory.cumulative?.length ? actHistory.cumulative : [];
  const actDAct = hasActHist && actHistory.dailyActivations?.length ? actHistory.dailyActivations : [];
  const actDDeact = hasActHist && actHistory.dailyDeactivations?.length ? actHistory.dailyDeactivations : [];

  const breakdownArr = tiers.map((t) => {
    if (activation.breakdown && activation.breakdown[t.tier] != null) return activation.breakdown[t.tier];
    const s = activation.tierStats?.[t.tier]?.allTime || {};
    return netTierCount(s);
  });

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const ownN = windowLen(timeframe, holdersFull.labels.length);
  const ownLabels = formatLabels(holdersFull.labels.slice(-ownN));
  const ownData = holdersFull.data.slice(-ownN);
  const tokenHolders = Number(ownership.tokenHolders) || Number(ownership.stonkHolders) || Number(ownership.erc20Holders) || 0;
  const actN = windowLen(timeframe, actLabels.length);

  void activeTab;

  return (
    <div className="space-y-6 relative">
      <section id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🌙</span> {yieldTitle} Yield ROI Benchmarks
            </h3>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-lg px-4 py-2.5 text-sm shadow-inner flex items-center">
              <span className="text-slate-400 mr-2">Floor Entry Cost:</span>
              <span className="text-white font-bold tracking-wide">{formatCurrency(floorCostUsd)}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Est. ROI is cash-on-cash: annualized vault yield ÷ (this floor + activation tokens at spot). Yield is the trailing 7-day RewardPaid sample, allocated by tier weight. The slider only scales the yield leg.
          </p>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                &quot;What-If&quot; Volume Simulator
              </h3>
              <span className="text-xs font-bold text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded border border-indigo-800/50">{parseFloat(volumeMultiplier).toFixed(1)}x Protocol Volume</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Slide to model future yield scenarios based on ecosystem trading volume expansion or contraction.
            </p>
            <input type="range" min="0.1" max="10" step="0.1" value={volumeMultiplier} onChange={(e) => setVolumeMultiplier(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400" />
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
                  const actCost = t.reqTokens * (market.tokenPriceUsd || 0);
                  const totalCost = floorCostUsd + actCost;
                  const simulatedYield = (t.trackedAnnualYieldUsd || 0) * volumeMultiplier;
                  const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
                  const isExpanded = expandedTier === t.tier;

                  return (
                    <React.Fragment key={t.tier}>
                      <tr onClick={() => setExpandedTier(isExpanded ? null : t.tier)} className="hover:bg-[#1e2228]/20 transition cursor-pointer group">
                        <td className="py-5 pl-2">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#08090b] border border-[#1e2228] text-indigo-300 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Weight: <span className="text-yellow-500 font-semibold">{t.weight}x</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-5"><span className="text-white font-bold">{formatNumber(t.reqTokens)}</span> {tokenLabel}</td>
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
                                  datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: ACCENT, backgroundColor: 'rgba(129, 140, 248, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }]
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

      <section id="yield" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] p-4 md:p-6 rounded-2xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">Historical Yield & Payback Horizon</h2>
              <p className="text-xs text-slate-400 mt-1">Cash-on-cash: (annualized vault RewardPaid) ÷ (NFT floor + activation tokens at spot). The 7-day sample is split by tier weight. The slider scales yield only — cost stays at live floor and token price.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiers.map((t) => {
              const tc = floorCostUsd + (t.reqTokens * (market.tokenPriceUsd || 0));
              const years = t.trackedAnnualYieldUsd > 0 ? (tc / t.trackedAnnualYieldUsd).toFixed(1) + ' Years' : 'N/A';
              return (
                <div key={t.tier} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{t.tier} Payback Horizon</p>
                  <p className="text-xl font-extrabold text-indigo-300">{years}</p>
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

      <NightshadesNightSection night={project.night} faction={faction} />

      <section id="burn" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Token Burn & Supply Deflation Tracker</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                {`Total $${config.ticker} Burnt`}
              </p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-orange-400">{formatNumber(realBurntTokens)} {config.ticker}</p>
              {burnPct != null && (
                <p className="text-xs text-slate-400 mt-1">{burnPct.toFixed(2)}% of total supply</p>
              )}
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Equivalent Units Removed</p>
              <p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-indigo-300">{formatNumber(realBurntUnits, 2)} Units</p>
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <h3 className="text-sm font-bold text-white mb-1">Cumulative Token Burn Over Time</h3>
            <p className="text-xs text-slate-500 mb-4">First mint through today. Days before hourly snapshots are reconstructed from token burns to dead/zero, scaled to the first trusted supply read.</p>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {burn.data.length > 0 ? (
                <Line
                  key={`burn-${timeframe}-${faction}`}
                  data={{ labels: burn.labels, datasets: [{ label: 'Cumulative Burnt', data: burn.data, borderColor: '#fb923c', backgroundColor: 'rgba(251, 146, 60, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }}
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
                    { type: 'line', label: 'Token Price ($)', data: flywheel.prices, borderColor: ACCENT, backgroundColor: ACCENT, borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
                    { type: 'bar', label: 'Daily Burn Velocity', data: flywheel.burn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }
                  ]
                }}
                options={dualAxisOptions({ leftTick: compactTick, rightTick: compactUsdTick, rightColor: ACCENT, leftMax: flywheel.burnAxisMax })}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Ecosystem Activation Metrics</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Activated Supply Ratio</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(activation.percentActivated || 0).toFixed(2)}%</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-indigo-300">{formatNumber(activation.activeCount || 0)} Units</p></div>
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
                <Doughnut data={{ labels: tiers.map((t) => t.name), datasets: [{ data: breakdownArr, backgroundColor: ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'], borderWidth: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }} />
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
                    labels: actLabels.slice(-actN),
                    datasets: [
                      { type: 'line', label: 'Active units', data: actCum.slice(-actN), borderColor: ACCENT, backgroundColor: 'rgba(129, 140, 248, 0.05)', borderWidth: 3, fill: true, tension: 0.3, yAxisID: 'y' },
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

      <section id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Protocol Ownership & Distribution</h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Current Max Supply</p><p className="text-xl md:text-3xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || 0, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Permanently Burnt</p><p className="text-xl md:text-3xl font-extrabold text-orange-400">{formatNumber(realBurntUnits, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">AMM Vault Inventory</p><p className="text-xl md:text-3xl font-extrabold text-slate-300">{formatNumber(ownership.ammVaultNfts || 0)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner border-b-4 border-b-indigo-500"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">True Circulating NFTs</p><p className="text-xl md:text-3xl font-extrabold text-indigo-300">{formatNumber(ownership.circulatingNftSupply || 0)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique NFT Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-indigo-300">{formatNumber(ownership.nftHolders || 0)} Wallets</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-indigo-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets with an activated NFT</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-indigo-200">{activation.activeHolders == null ? '—' : `${formatNumber(activation.activeHolders)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership Concentration</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(ownership.ownershipRatio || 0).toFixed(2)}%</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">{`Unique $${config.ticker} Holders`}</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-indigo-300">{formatNumber(tokenHolders)} Wallets</p></div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">True Active Token Holders Over Time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(ownData) ? (
              <Line
                data={{ labels: ownLabels, datasets: [{ label: 'Active Holders', data: ownData, borderColor: ACCENT, backgroundColor: 'rgba(129, 140, 248, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } } } }}
              />
              ) : (
                <EmptyChart>No holder history recorded</EmptyChart>
              )}
            </div>
          </div>
          <OwnershipHistoryPanels
            snaps={roiSnaps}
            live={{ tokenHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          />
        </div>
      </section>

      <MethodologyCard accent="text-indigo-400">
          <p><strong className="text-white">Four Anvil markets, one incubator:</strong> Ghosts, Zombies, Knights, and Watchers each have 3,000 NFTs, one faction token, and a SoftStakingVault. The All tab compares the four on one axis. This page is one market.</p>
          <p><strong className="text-white">Yield &amp; ROI:</strong> Cash-on-cash is annualized vault RewardPaid ÷ (this floor + activation tokens at spot). The 7-day sample is split by tier weight. The volume slider scales yield only — cost stays at live floor and token price. Night vault WETH is The Night inventory, not StonkBooster.</p>
          <p><strong className="text-white">Activation:</strong> Same mechanic as Mancer/Yard. The vault emits no Deactivated event — a sale clears the position. <code>activeCount()</code> is an upper bound; this page replays Activated plus NFT transfers.</p>
          <p><strong className="text-white">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Concentration is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number.</p>
          <p><strong className="text-white">The Night</strong> is incubator-wide (one VRF over all four factions). Live strike, history, sunrise fees, and usable v4 LP sit on the Night tab.</p>
      </MethodologyCard>
    </div>
  );
}
