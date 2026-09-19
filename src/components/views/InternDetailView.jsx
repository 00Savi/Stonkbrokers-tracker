import React, { useState } from 'react';
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
  INTERNS_ETH_USD,
  INTERNS_OPENING_STONK,
  INTERNS_TITLES,
  INTERNS_MINT_RUNGS,
  internContractsReady,
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
  const [timeframe] = useChartWindow();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(true);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);

  const project = data?.projects?.interns;
  const stonk = data?.projects?.stonk;
  if (!project) return <div className="text-center text-slate-400 p-12">Interns Data Loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, lockedLp = null, dailySnapshots = [] } = project;
  const building = !!project.underConstruction || !internContractsReady(config);
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

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe);
  const histLabels = formatLabels(roiSnaps.map((s) => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: stonkPx,
  });

  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const slicedRev = sliceCols(rawRev.labels, rawRev.cols, timeframe);
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe);

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  const burn = burnSeries(project, timeframe);
  const flywheel = burnRateSeries(project, timeframe);

  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actLabels = hasActHist ? formatLabels(actHistory.labels) : [];
  const actCum = hasActHist && actHistory.cumulative?.length ? actHistory.cumulative : [];
  const actDAct = hasActHist && actHistory.dailyActivations?.length ? actHistory.dailyActivations : [];
  const actDDeact = hasActHist && actHistory.dailyDeactivations?.length ? actHistory.dailyDeactivations : [];
  const breakdownArr = tiers.map((t) => {
    if (activation.breakdown && activation.breakdown[t.tier] != null) return activation.breakdown[t.tier];
    const s = activation.tierStats?.[t.tier]?.allTime || {};
    return Math.max(0, (s.act || 0) - (s.deact || 0));
  });

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const ownN = windowLen(timeframe, holdersFull.labels.length);
  const ownLabels = formatLabels(holdersFull.labels.slice(-ownN));
  const ownData = holdersFull.data.slice(-ownN);
  const actN = windowLen(timeframe, actLabels.length);
  const openingUsd = INTERNS_ETH_USD + INTERNS_OPENING_STONK * stonkPx;

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

          {building ? (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              <strong className="text-amber-300">Awaiting contract addresses.</strong> Collection, Intern Clock In, Intern Exchange,
              and activation CAs drop at mint. Drop them in <code className="text-amber-200">fetcher.cjs</code> PROJECTS.interns
              to turn the live tiles and charts on. Until then this page is the mint desk: schedule, ladder, and activation cost at live $STONKBROKER.
            </div>
          ) : null}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Collection</p><p className="text-2xl font-extrabold text-white">{formatNumber(INTERNS_MAX_SUPPLY)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Per broker</p><p className="text-2xl font-extrabold text-amber-300">{INTERNS_PER_BROKER}</p><p className="text-[10px] text-slate-500 mt-1">Sigma + Divergent</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">One of ones</p><p className="text-2xl font-extrabold text-white">{INTERNS_ONE_OF_ONES}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Creator royalty</p><p className="text-2xl font-extrabold text-white">{(INTERNS_ROYALTY_BPS / 100).toFixed(2)}%</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 border-b-4 border-b-amber-500">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Opening mint</p>
              <p className="text-xl font-extrabold text-amber-300">${INTERNS_ETH_USD} ETH + {formatNumber(INTERNS_OPENING_STONK)} $STONKBROKER</p>
              <p className="text-xs text-slate-500 mt-1">{stonkPx > 0 ? `≈ ${formatCurrency(openingUsd)} at live $STONKBROKER` : 'ETH leg stays $20; $STONKBROKER leg is 999 for 24h'}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Live / dormant</p>
              <p className="text-xl font-extrabold text-white">{dash(building, liveInterns)} <span className="text-slate-500 text-sm font-medium">/ {dash(building, dormantInterns)}</span></p>
              <p className="text-xs text-slate-500 mt-1">Sweep mints all 8,888 dormant into parent TBAs. Paying the fee makes one live.</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Floor entry</p>
              <p className="text-xl font-extrabold text-white">{building || !(floorCostUsd > 0) ? '—' : formatCurrency(floorCostUsd)}</p>
              <p className="text-xs text-slate-500 mt-1">Intern Exchange / listing floor once the collection is live.</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Mint price per intern · $20 in ETH flat + $STONKBROKER leg by day</h4>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INTERNS_MINT_RUNGS.map((r) => (
                <div
                  key={r.day}
                  className={`rounded-xl px-3 py-3 text-center ${
                    r.cap
                      ? 'bg-emerald-950/40 border border-emerald-700/70'
                      : r.after
                        ? 'bg-[#08090b] border border-dashed border-[#334155]'
                        : 'bg-[#08090b] border border-[#1e2228]'
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{r.label}</p>
                  <p className="text-lg font-extrabold text-white mt-1">{formatNumber(r.stonk)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">$STONKBROKER per intern. Plus $20 in ETH on every mint. Ceiling 9,999 $STONKBROKER from day 10 onward.</p>
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

      <section id="liquidity" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Intern Exchange</h2>
          <p className="text-xs text-slate-400">Pooled intern / $STONKBROKER (or ETH) inventory with a step. AMM vault inventory is subtracted from circulating live interns the same way as brokers.</p>
          {lockedLp?.pools?.length ? (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <button type="button" onClick={() => setLpTableOpen((v) => !v)} className="text-sm font-bold text-white mb-3">{lpTableOpen ? 'Hide' : 'Show'} pools</button>
              {lpTableOpen ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead><tr className="text-slate-500 text-xs uppercase"><th className="pb-2">Pool</th><th className="pb-2">USD</th></tr></thead>
                    <tbody>
                      {lockedLp.pools.map((p) => (
                        <tr key={p.pair || p.pairName} className="border-t border-[#1e2228]"><td className="py-2 text-slate-200">{p.pairName || p.pair}</td><td className="py-2">{formatCurrency(p.liquidityUsd)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyChart>Intern Exchange pools appear once the exchange CA is set</EmptyChart>
          )}
        </div>
      </section>

      <section id="burn" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Activation burn</h2>
          <p className="text-xs text-slate-400">Half of every intern activation fee is burned $STONKBROKER. This is not intern NFT supply — the collection stays 8,888.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">$STONKBROKER burnt</p><p className="text-2xl font-extrabold text-orange-400">{dash(building, realBurntTokens)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Of intern T0 units</p><p className="text-2xl font-extrabold text-white">{dash(building, realBurntUnits)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Vs intern token supply</p><p className="text-2xl font-extrabold text-white">{building || !(burnPct > 0) ? '—' : `${burnPct.toFixed(2)}%`}</p></div>
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Cumulative $STONKBROKER burn</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {burn.data?.length ? (
                <Line data={{ labels: burn.labels, datasets: [{ label: 'Cumulative Burnt', data: burn.data, borderColor: '#fb923c', backgroundColor: 'rgba(251, 146, 60, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: compactTick } } } }} />
              ) : (
                <EmptyChart>Burn history starts after intern activations hit the chain</EmptyChart>
              )}
            </div>
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">$STONKBROKER price vs intern burn velocity</h3>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {seriesHasInk(flywheel.burn) ? (
                <Bar data={{ labels: flywheel.labels, datasets: [{ type: 'line', label: 'Token Price ($)', data: flywheel.prices, borderColor: ACCENT, backgroundColor: ACCENT, borderWidth: 2, tension: 0.3, pointRadius: 0, yAxisID: 'y1' }, { type: 'bar', label: 'Daily Burn Velocity', data: flywheel.burn, backgroundColor: 'rgba(249, 115, 22, 0.8)', borderRadius: 4, yAxisID: 'y' }] }} options={dualAxisOptions({ leftTick: compactTick, rightTick: compactUsdTick, rightColor: ACCENT })} />
              ) : (
                <EmptyChart>No intern burn velocity yet</EmptyChart>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Intern activation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Activated of collection</p><p className="text-2xl font-extrabold text-emerald-400">{building ? '—' : `${(activation.percentActivated || 0).toFixed(2)}%`}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Live activated units</p><p className="text-2xl font-extrabold text-amber-300">{dash(building, activation.activeCount)} Units</p></div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tier flow</h3>
            <div className="flex bg-[#0e1013] rounded-lg p-1 border border-[#1e2228] w-full sm:w-auto">
              {['24h', '7d', '30d', 'allTime'].map((tf) => (
                <button key={tf} type="button" onClick={() => setTierTimeframe(tf)} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition ${tierTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>{tf === 'allTime' ? 'ALL' : tf.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {tiers.map((t, idx) => {
              const tData = activation.tierStats?.[t.tier]?.[tierTimeframe] || { act: 0, deact: 0 };
              const colors = ['bg-[#00a804]', 'bg-[#8b5cf6]', 'bg-[#38bdf8]', 'bg-[#f5b700]', 'bg-[#f472b6]'];
              return (
                <div key={t.tier} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3"><div className={`w-2.5 h-2.5 rounded-sm ${colors[idx % 5]}`} /><p className="text-[10px] uppercase font-bold truncate">{t.tier}: {t.name}</p></div>
                  <div className="flex justify-between items-end">
                    <div><p className="text-lg font-bold text-emerald-400">{building ? '—' : formatNumber(tData.act)}</p><p className="text-[9px] text-slate-500 uppercase">Act</p></div>
                    <div className="text-right"><p className="text-lg font-bold text-rose-400">{building ? '—' : formatNumber(tData.deact)}</p><p className="text-[9px] text-slate-500 uppercase">Deact</p></div>
                  </div>
                </div>
              );
            })}
          </div>
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
                    <span className="text-white font-bold">{building ? '—' : formatNumber(breakdownArr[idx])}</span>
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
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Live released</p><p className="text-2xl font-extrabold text-amber-300">{dash(building, liveInterns)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Dormant in parent TBAs</p><p className="text-2xl font-extrabold text-slate-300">{dash(building, dormantInterns)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">AMM vault</p><p className="text-2xl font-extrabold text-slate-300">{dash(building, ownership.ammVaultNfts)}</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 border-b-4 border-b-amber-500"><p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Circulating live interns</p><p className="text-2xl font-extrabold text-amber-300">{dash(building, circ)}</p><p className="text-xs text-slate-500 mt-1">Live released minus Intern Exchange inventory. Dormant are not circulating.</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique intern wallets</p><p className="text-2xl font-extrabold text-purple-400">{building ? '—' : `${formatNumber(ownership.nftHolders || 0)} Wallets`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Ownership concentration</p><p className="text-2xl font-extrabold text-emerald-400">{building ? '—' : `${(ownership.ownershipRatio || 0).toFixed(2)}%`}</p></div>
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
        <p><strong className="text-white">Mint:</strong> Only an activated parent broker can release its intern(s). $20 in ETH (flat, Chainlink-priced) plus a $STONKBROKER leg that starts at 999 for 24 hours, then +999/day, hard-capped at 9,999 from day 10. 25% of the ETH leg funds Intern Clock In; 75% goes to treasury. The $STONKBROKER leg is treasury. A dormant sweep puts all 8,888 into parent TBAs on mint open; they cannot move until released.</p>
        <p><strong className="text-white">Yield &amp; ROI:</strong> Intern Clock In weight is job-title slice × intern activation tier (same 1.00 / 1.25 / 1.60 / 2.00 / 3.33 multipliers as brokers). CoC is that trailing intern yield ÷ (intern floor USD + activation $STONKBROKER at spot). Parent-broker Clock In that is delegated as base pay is a separate cashflow and is not added into intern CoC until we can split it onchain.</p>
        <p><strong className="text-white">Ownership:</strong> Circulating live interns are released supply minus Intern Exchange / AMM vault inventory. Dormant tokens in parent TBAs are not circulating. Concentration is unique intern wallets (vault and burn excluded) ÷ that circulating number.</p>
        <p><strong className="text-white">Turning the page on:</strong> Collection and activation CAs are live in fetcher.cjs. Intern Clock In, Intern Exchange, names, and lending stay blank until those desks deploy.</p>
      </MethodologyCard>
    </div>
  );
}
