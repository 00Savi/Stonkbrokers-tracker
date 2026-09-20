import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, windowLen, seriesHasInk, holderRevenueCol } from '../../lib/yieldHistory';
import { compactUsd, compactNum } from '../kit';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, STREAM_COLORS } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import { projectPath } from '../../lib/routes';
import { attributedStonkBurn } from '../../lib/burn';
import {
  EmptyChart,
  YieldUsdPricePanel,
  PaybackPanel,
  ProtocolFeeVolumePanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';
import {
  INTERNS_DOCS,
  INTERNS_MAX_SUPPLY,
  INTERNS_PER_BROKER,
  INTERNS_ONE_OF_ONES,
  INTERNS_ROYALTY_BPS,
  INTERNS_TITLES,
  internContractsReady,
  internDesksReady,
  internCirculating,
} from '../../lib/interns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const ACCENT = '#fbbf24';

function dash(building, value, format = compactNum) {
  if (building) return '—';
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return format(value);
}

export default function InternDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);

  const project = data?.projects?.interns;
  const stonk = data?.projects?.stonk;
  if (!project) return <div className="text-center text-slate-400 p-12">Interns Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, dailySnapshots = [] } = project;
  const awaitingContracts = !internContractsReady(config);
  const desksPending = !internDesksReady(config);
  const building = awaitingContracts || desksPending;
  const stonkPx = Number(market.tokenPriceUsd) || Number(stonk?.market?.tokenPriceUsd) || 0;
  const ethUsd = Number(market.ethPriceUsd) || Number(stonk?.market?.ethPriceUsd) || 0;
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;
  const floorCostUsd = (market.nftFloorEth || 0) * ethUsd;
  const liveInterns = Number(ownership.liveInterns);
  const dormantInterns = Number.isFinite(liveInterns)
    ? Math.max(0, INTERNS_MAX_SUPPLY - liveInterns)
    : Number(ownership.dormantInterns);
  const circ = internCirculating(ownership);
  const chartOptions = baseChartOptions();

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map((s) => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: stonkPx,
  });

  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const slicedRev = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe, interval);

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnSplit = attributedStonkBurn(stonk, project);

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
  const actN = windowLen(timeframe, actLabels.length);

  return (
    <div className="space-y-6 relative">
      <section id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Companion collection</p>
              <h3 className="text-lg font-bold text-white mt-1">Interns by StonkBrokers — the desk next to the broker</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-3xl leading-relaxed">
                8,888 pixel-art interns on Robinhood Chain, two per StonkBroker: V1 Sigma is token id N, V2 Divergent is N + 4,444.
                Each intern has a token-bound wallet. Base pay is a slice of the parent broker&apos;s Clock In. Mint is open —
                only the parent activated broker can release its interns.
              </p>
            </div>
            <a
              href={INTERNS_DOCS}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-bold text-amber-300 border border-amber-800/60 bg-amber-900/20 px-3 py-2 rounded-lg hover:bg-amber-900/40"
            >
              Whitepaper ↗
            </a>
          </div>

          {awaitingContracts ? (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              <strong className="text-amber-300">Awaiting contract addresses.</strong> Collection and activation CAs drop at mint.
              Drop them in <code className="text-amber-200">fetcher.cjs</code> PROJECTS.interns to turn the live tiles on.
            </div>
          ) : desksPending ? (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              <strong className="text-amber-300">Collection is live.</strong> Mint, live/dormant, and intern activation are on-chain.
              Intern Clock In, Intern Exchange, names, and lending are still empty — yield tiles stay blank until those desks deploy.
            </div>
          ) : null}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Collection</p><p className="text-2xl font-extrabold text-white">{formatNumber(INTERNS_MAX_SUPPLY)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Per broker</p><p className="text-2xl font-extrabold text-amber-300">{INTERNS_PER_BROKER}</p><p className="text-[10px] text-slate-500 mt-1">Sigma + Divergent</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">One of ones</p><p className="text-2xl font-extrabold text-white">{INTERNS_ONE_OF_ONES}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Creator royalty</p><p className="text-2xl font-extrabold text-white">{(INTERNS_ROYALTY_BPS / 100).toFixed(2)}%</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Live / dormant</p>
              <p className="text-xl font-extrabold text-white">{dash(awaitingContracts, liveInterns)} <span className="text-slate-500 text-sm font-medium">/ {dash(awaitingContracts, dormantInterns)}</span></p>
              <p className="text-xs text-slate-500 mt-1">Sweep mints all 8,888 dormant into parent TBAs. Paying the fee makes one live.</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Floor entry</p>
              <p className="text-xl font-extrabold text-white">{awaitingContracts || !(floorCostUsd > 0) ? '—' : formatCurrency(floorCostUsd)}</p>
              <p className="text-xs text-slate-500 mt-1">Intern Exchange / listing floor once the collection is live.</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-2">Career ladder — base pay titles</h4>
            <p className="text-xs text-slate-400 mb-3">The parent broker delegates 0 / 0.5 / 1 / 2 / 2.5% of its Clock In, at most 5% across both interns. Titles only move up. A furloughed intern sits under an un-activated parent.</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {INTERNS_TITLES.map((t) => (
                <div key={t.id} className="bg-[#08090b] border border-[#1e2228] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.sharePct}%</p>
                  <p className="text-sm font-bold text-white leading-tight">{t.name}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
              <h3 className="text-sm font-bold text-white">Activation CoC — intern ladder</h3>
              <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2 py-1 rounded border border-amber-800/50">{parseFloat(volumeMultiplier).toFixed(1)}x Intern Clock In volume</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Five school-year tiers in $STONKBROKER (Freshman 3,333 → Alumnus 83,333), same weights as brokers. Half of every activation fee is burned. Yield stays empty until Intern Clock In is live.</p>
            <input type="range" min="0.1" max="10" step="0.1" value={volumeMultiplier} onChange={(e) => setVolumeMultiplier(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 mb-6" />

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
                    const actCost = (t.reqTokens || 0) * stonkPx;
                    const totalCost = floorCostUsd + actCost;
                    const simulatedYield = (t.trackedAnnualYieldUsd || 0) * volumeMultiplier;
                    const roi = totalCost > 0 && simulatedYield > 0 ? (simulatedYield / totalCost) * 100 : 0;
                    const isExpanded = expandedTier === t.tier;
                    return (
                      <React.Fragment key={t.tier}>
                        <tr onClick={() => setExpandedTier(isExpanded ? null : t.tier)} className="hover:bg-[#1e2228]/20 transition cursor-pointer group">
                          <td className="py-5 pl-2">
                            <div className="flex items-center gap-3">
                              <span className="bg-[#08090b] border border-[#1e2228] text-amber-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                              <div>
                                <div className="font-bold text-white">{t.name}</div>
                                <div className="text-xs text-slate-500 mt-0.5">Weight: <span className="text-yellow-500 font-semibold">{((t.weight || 100) / 100).toFixed(2)}x</span></div>
                              </div>
                            </div>
                          </td>
                          <td className="py-5"><span className="text-white font-bold">{formatNumber(t.reqTokens)}</span> $STONKBROKER</td>
                          <td className="py-5">
                            <div className="font-bold text-white">{stonkPx > 0 ? formatCurrency(totalCost) : '—'}</div>
                            <div className="text-xs text-slate-500 mt-0.5">Floor + {stonkPx > 0 ? formatCurrency(actCost) : '—'} Act.</div>
                          </td>
                          <td className="py-5">
                            {building || !(simulatedYield > 0) ? (
                              <span className="text-slate-500 italic">TBD / BUILDING</span>
                            ) : (
                              <><span className="text-white font-bold text-base">{formatCurrency(simulatedYield)}</span> <span className="text-slate-500">/yr</span></>
                            )}
                          </td>
                          <td className="py-5 text-right pr-4">
                            <div className="flex items-center justify-end gap-3">
                              {building || !(roi > 0) ? (
                                <span className="bg-amber-900/20 text-amber-400 border border-amber-800/50 px-2.5 py-1 rounded text-sm font-bold">TBD</span>
                              ) : (
                                <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">{roi.toFixed(2)}%</span>
                              )}
                              <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[#08090b]/40 border-b border-[#1e2228]/50">
                            <td colSpan="5" className="p-4 md:p-6">
                              <div className="relative h-32 md:h-40 w-full">
                                {seriesHasInk(t.dailyYields) ? (
                                  <Line data={{ labels: t.dailyDates, datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: ACCENT, backgroundColor: 'rgba(251, 191, 36, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] }} options={chartOptions} />
                                ) : (
                                  <EmptyChart>Intern Clock In has not written a daily yield yet</EmptyChart>
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
        </div>
      </section>

      <section id="yield" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] p-4 md:p-6 rounded-2xl shadow-lg space-y-6">
          <h2 className="text-xl font-bold text-white">Historical Yield &amp; Payback Horizon</h2>
          <p className="text-xs md:text-sm text-slate-400">Intern Clock In payouts once the engine is live. Base pay from the parent broker is a separate slice and is not this chart.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiers.map((t) => {
              const tc = floorCostUsd + (t.reqTokens || 0) * stonkPx;
              const years = t.trackedAnnualYieldUsd > 0 ? `${(tc / t.trackedAnnualYieldUsd).toFixed(1)} Years` : '—';
              return (
                <div key={t.tier} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{t.tier} Payback</p>
                  <p className="text-xl font-extrabold text-amber-400">{years}</p>
                </div>
              );
            })}
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Tier ROI % Trajectory</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(histDatasets.flatMap((d) => d.data)) ? (
                <Line data={{ labels: histLabels, datasets: histDatasets }} options={chartOptions} />
              ) : (
                <EmptyChart>Yield history starts after Intern Clock In writes a snapshot</EmptyChart>
              )}
            </div>
          </div>
          <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
          <PaybackPanel snaps={roiSnaps} tiers={tiers} floorCostUsd={floorCostUsd} tokenPriceUsd={stonkPx} />
        </div>
      </section>

      <section id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Intern desks</h2>
          <p className="text-xs text-slate-400">Fees from desks the interns run land in Intern Clock In. Clock In, Exchange, names, and lending CAs are not deployed yet.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Intern Clock In ({revPeriod})</p><p className="text-2xl font-extrabold text-amber-300">{dash(building, slicedRev.cols?.[0]?.total, formatCurrency)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Intern Exchange ({revPeriod})</p><p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.amm }}>{dash(building, slicedRev.cols?.[1]?.total, formatCurrency)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Names + V2 lending ({revPeriod})</p><p className="text-2xl font-extrabold" style={{ color: STREAM_COLORS.box }}>{dash(building, slicedRev.cols?.[2]?.total, formatCurrency)}</p></div>
          </div>
          <ProtocolFeeVolumePanels
            labels={slicedRev.labels}
            cols={slicedRev.cols}
            kind={rawRev.kind}
            holder={{
              labels: slicedHolder.labels,
              data: slicedHolder.cols[0]?.data,
              note: 'Intern Clock In payout to intern TBAs. Not the parent broker slice.',
            }}
          />
        </div>
      </section>

      <section id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Intern activation</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Activated of collection</p><p className="text-2xl font-extrabold text-emerald-400">{awaitingContracts ? '—' : `${(activation.percentActivated || 0).toFixed(2)}%`}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Live activated units</p><p className="text-2xl font-extrabold text-amber-300">{dash(awaitingContracts, activation.activeCount)} Units</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Interns burnt</p>
              <p className="text-2xl font-extrabold text-amber-300">{dash(awaitingContracts, realBurntTokens)}</p>
              <p className="text-xs text-slate-500 mt-1">
                Half of each intern fee. Separate activation manager.{' '}
                <Link to={projectPath('stonk', 'burn')} className="text-amber-300 hover:underline">Parent burn chart</Link>
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">StonkBrokers burnt</p>
              <p className="text-2xl font-extrabold text-orange-400">{dash(awaitingContracts, burnSplit.brokers)}</p>
              <p className="text-xs text-slate-500 mt-1">Token supply destroyed outside intern activations</p>
            </div>
          </div>
          <TierFlowSection
            title="Tier flow"
            tiers={tiers}
            tierStats={activation.tierStats}
            timeframe={tierTimeframe}
            onTimeframe={setTierTimeframe}
            formatNumber={formatNumber}
            pending={awaitingContracts}
          />
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-6">Current tier mix</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              <div className="relative h-64 md:h-72 w-full md:w-1/2 flex items-center justify-center">
                {breakdownArr.some((n) => n > 0) ? (
                  <Doughnut data={{ labels: tiers.map((t) => t.name), datasets: [{ data: breakdownArr, backgroundColor: ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'], borderWidth: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }} />
                ) : (
                  <EmptyChart>No intern activations recorded</EmptyChart>
                )}
              </div>
              <div className="w-full md:w-1/2 flex flex-col gap-3">
                {tiers.map((t, idx) => (
                  <div key={t.tier} className="flex justify-between items-center bg-[#0e1013] p-3 rounded-lg border border-[#1e2228]">
                    <div className="flex items-center gap-3"><div className={`w-4 h-4 rounded-md ${['bg-[#00a804]', 'bg-[#8b5cf6]', 'bg-[#38bdf8]', 'bg-[#f5b700]', 'bg-[#f472b6]'][idx % 5]}`} /><span className="text-sm font-bold text-slate-300">{t.tier}: {t.name}</span></div>
                    <span className="text-white font-bold">{awaitingContracts ? '—' : formatNumber(breakdownArr[idx])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ActivationStackPanel snaps={roiSnaps} tiers={tiers} breakdown={activation.breakdown} />
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-1">Active units vs daily flow</h3>
            <p className="text-xs text-slate-400 mb-4">A sale clears intern activation the same way as a broker. Dormant interns cannot activate.</p>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {hasActHist ? (
                <Bar data={{ labels: actLabels.slice(-actN), datasets: [{ type: 'line', label: 'Active units', data: actCum.slice(-actN), borderColor: ACCENT, backgroundColor: 'rgba(251, 191, 36, 0.05)', borderWidth: 3, fill: true, tension: 0.3, yAxisID: 'y' }, { type: 'bar', label: 'Daily Activations', data: actDAct.slice(-actN), backgroundColor: '#00a804', borderRadius: 4, yAxisID: 'y1' }, { type: 'bar', label: 'Daily Deactivations', data: actDDeact.slice(-actN), backgroundColor: '#f43f5e', borderRadius: 4, yAxisID: 'y1' }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { type: 'linear', position: 'left', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, min: 0 } } }} />
              ) : (
                <EmptyChart>No intern activation history recorded</EmptyChart>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Intern ownership</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Collection</p><p className="text-2xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || INTERNS_MAX_SUPPLY)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Live released</p><p className="text-2xl font-extrabold text-amber-300">{dash(awaitingContracts, liveInterns)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Dormant in parent TBAs</p><p className="text-2xl font-extrabold text-slate-300">{dash(awaitingContracts, dormantInterns)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">AMM vault</p><p className="text-2xl font-extrabold text-slate-300">{dash(awaitingContracts, ownership.ammVaultNfts)}</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 border-b-4 border-b-amber-500"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Circulating live interns</p><p className="text-2xl font-extrabold text-amber-300">{dash(awaitingContracts, circ)}</p><p className="text-xs text-slate-500 mt-1">Live released minus Intern Exchange inventory. Dormant are not circulating.</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique intern wallets</p><p className="text-2xl font-extrabold text-purple-400">{awaitingContracts ? '—' : `${formatNumber(ownership.nftHolders || 0)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership concentration</p><p className="text-2xl font-extrabold text-emerald-400">{awaitingContracts ? '—' : `${(ownership.ownershipRatio || 0).toFixed(2)}%`}</p></div>
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Intern holders over time</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(ownData) ? (
                <Line data={{ labels: ownLabels, datasets: [{ label: 'NFT holders', data: ownData, borderColor: ACCENT, backgroundColor: 'rgba(251, 191, 36, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } } } }} />
              ) : (
                <EmptyChart>Holder history starts after the collection CA is indexed</EmptyChart>
              )}
            </div>
          </div>
          <OwnershipHistoryPanels
            snaps={roiSnaps}
            live={{ tokenHolders: 0, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          />
        </div>
      </section>

      <MethodologyCard accent="text-amber-400">
        <p><strong className="text-white">What this is:</strong> Interns by StonkBrokers is the companion NFT to StonkBrokers, not a second broker seat. Paper at <a className="text-amber-300 underline" href={INTERNS_DOCS} target="_blank" rel="noreferrer">stonkbrokers.cash/docs/interns</a>. Holding an intern is not equity and is not a guaranteed share of revenue.</p>
        <p><strong className="text-white">Mint:</strong> Only an activated parent broker can release its intern(s). A dormant sweep puts all 8,888 into parent TBAs on mint open; they cannot move until released.</p>
        <p><strong className="text-white">Yield &amp; ROI:</strong> Intern Clock In weight is job-title slice × intern activation tier (same 1.00 / 1.25 / 1.60 / 2.00 / 3.33 multipliers as brokers). CoC is that trailing intern yield ÷ (intern floor USD + activation $STONKBROKER at spot). Parent-broker Clock In that is delegated as base pay is a separate cashflow and is not added into intern CoC until we can split it onchain.</p>
        <p><strong className="text-white">Ownership:</strong> Circulating live interns are released supply minus Intern Exchange / AMM vault inventory. Dormant tokens in parent TBAs are not circulating. Concentration is unique intern wallets (vault and burn excluded) ÷ that circulating number.</p>
        <p><strong className="text-white">Burn:</strong> Interns and StonkBrokers do not share an activation manager. Interns use 0x668e…4b37; brokers use 0xacd5…f664. Both burn the same $STONKBROKER token (0xe934…abf50). Half of each intern fee is destroyed; that intern total is a subset of token-wide supply burn. Token-supply charts stay on the parent StonkBrokers burn page — interns are not a second ERC-20.</p>
        <p><strong className="text-white">Turning the page on:</strong> Collection and activation CAs are live in fetcher.cjs. Intern Clock In, Intern Exchange, names, and lending stay blank until those desks deploy.</p>
      </MethodologyCard>
    </div>
  );
}
