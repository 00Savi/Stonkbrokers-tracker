import React, { useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { burnSeries, burnRateSeries } from '../../lib/burn';
import { windowChart } from '../../lib/yieldHistory';
import { BetaTag, compactUsd, compactNum, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { seatCsvRows } from '../../lib/csv';
import { CsvButton } from '../CsvButton';
import { ShareSection } from '../CopyControl';
import { TierFlowSection } from '../TierFlowCards';
import { baseChartOptions, compactTick, cumulativeBurnDataset, TIER_COLORS } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { MethodologyCard } from '../Disclaimer';
import { explorerAddressUrl } from '../../lib/tba';
import {
  EmptyChart,
  YieldHistorySwitch,
  BurnHistorySwitch,
  ActivityChart,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';
import { SliceChart } from '../SliceChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

// Prospectus supply. 4,001 seats × 401,000 $TMF. The burn card's percent uses this cap.
const TMF_SUPPLY = 1_604_401_000;

function dayKey(daysBack) {
  return new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
}

function blankWindow() {
  return { act: 0, deact: 0, up: 0 };
}

// ALL is the live class mix. A shorter window gets that mix only when every
// recorded enrollment day still sits inside it. Per-class daily flow is not
// stamped yet, so an older day leaves the short window at zero.
function tierStatsFromBreakdown(breakdown, history) {
  const labels = (history?.labels || []).filter(Boolean);
  const fits = (days) => labels.length > 0 && labels.every((d) => d >= dayKey(days - 1));
  const stats = {};
  for (const id of ['T0', 'T1', 'T2', 'T3', 'T4']) {
    const live = { act: Number(breakdown?.[id]) || 0, deact: 0, up: 0 };
    stats[id] = {
      '24h': fits(1) ? { ...live } : blankWindow(),
      '7d': fits(7) ? { ...live } : blankWindow(),
      '30d': fits(30) ? { ...live } : blankWindow(),
      allTime: { ...live },
    };
  }
  return stats;
}

function countOrDash(value, formatNumber, suffix = '') {
  if (value == null || value === '') return '—';
  return `${formatNumber(value)}${suffix}`;
}

export default function MutualFunDetailView({ data }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);

  const project = data?.projects?.mutualfun;
  if (!project) return <div className="text-center text-slate-400 p-12">Mutual Fun data loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, funds = [], seats = {}, dailySnapshots = [] } = project;
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (Number(market.nftFloorEth) || 0) * (Number(market.ethPriceUsd) || 0);
  const tokenPx = Number(market.tokenPriceUsd) || 0;
  const rate = Number(config.houseRate) || 401000;
  const randomUsd = tokenPx > 0 ? rate * 1.08 * tokenPx : 0;
  const specificUsd = tokenPx > 0 ? rate * 1.16 * tokenPx : 0;
  const handInUsd = tokenPx > 0 ? rate * 0.92 * tokenPx : 0;

  const roiSnaps = [];
  const histLabels = [];
  const histDatasets = tiers.map((t, i) => ({
    label: `${t.tier} ROI`,
    data: [],
    borderColor: TIER_COLORS[i % TIER_COLORS.length],
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 2,
  }));

  const realBurntTokens = Math.max(Number(revenue.burnedTokens) || 0, Number(ownership.permanentlyBurntTokens) || 0);
  const burnPct = realBurntTokens > 0 ? (realBurntTokens / TMF_SUPPLY) * 100 : null;
  const realBurntUnits = Math.max(Number(ownership.burntNfts) || 0, Number(seats.retired) || 0);
  const burn = burnSeries(project, timeframe, interval);
  const flywheel = burnRateSeries(project, timeframe, interval);

  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actWin = windowChart(
    hasActHist ? actHistory.labels : [],
    [
      hasActHist ? actHistory.cumulative || [] : [],
      hasActHist ? actHistory.dailyActivations || [] : [],
      hasActHist ? actHistory.dailyDeactivations || [] : [],
    ],
    timeframe,
    interval,
    ['last', 'sum', 'sum'],
  );

  const breakdownArr = tiers.map((t) => (
    activation.breakdown && activation.breakdown[t.tier] != null ? activation.breakdown[t.tier] : 0
  ));
  const tierStats = activation.tierStats || tierStatsFromBreakdown(activation.breakdown, actHistory);

  const minted = Number(seats.minted) || Number(activation.totalSupply) || 0;
  const retired = Number(seats.retired) || Number(ownership.burntNfts) || 0;
  const circulatingNfts = ownership.circulatingNftSupply != null
    ? Number(ownership.circulatingNftSupply)
    : Math.max(0, minted - retired);
  const dividendUsd = (revenue.dividends || []).reduce((sum, row) => sum + (Number(row.usd) || 0), 0);

  return (
    <div className="space-y-6 relative">
      <ShareSection id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"></path><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"></path><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"></path></svg>
              The Mutual Fun Global Yield ROI Benchmarks
              <BetaTag />
            </h3>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-lg px-4 py-2.5 text-sm shadow-inner flex items-center">
              <span className="text-slate-400 mr-2">Floor Entry Cost:</span>
              <span className="text-white font-bold tracking-wide">{floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-4">A Seat earns only while it is enrolled. Cost is the OpenSea floor plus the Front-End Load. Nothing is annualized until a dividend has a history.</p>

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                &quot;What-If&quot; Volume Simulator
              </h3>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded border border-emerald-800/50">{parseFloat(volumeMultiplier).toFixed(1)}x Protocol Volume</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Slide to model future yield scenarios based on ecosystem trading volume expansion or contraction.</p>
            <input type="range" min="0.1" max="10" step="0.1" value={volumeMultiplier} onChange={(e) => setVolumeMultiplier(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
          </div>

          <div className="mb-2 flex justify-end">
            <CsvButton
              filename={`${config.ticker || 'TMF'}-seats.csv`}
              rows={seatCsvRows(project, { floorUsd: floorCostUsd, volume: volumeMultiplier })}
            />
          </div>
          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-4 font-medium pl-2">Tier</th>
                  <th className="pb-4 font-medium">Activation Req.</th>
                  <th className="pb-4 font-medium">Floor</th>
                  <th className="pb-4 font-medium">Act. cost</th>
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
                  const actCost = t.reqTokens * tokenPx;
                  const totalCost = floorCostUsd + actCost;
                  const simulatedYield = (Number(t.trackedAnnualYieldUsd) || 0) * volumeMultiplier;
                  const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
                  const isExpanded = expandedTier === t.tier;
                  return (
                    <React.Fragment key={t.tier}>
                      <tr onClick={() => setExpandedTier(isExpanded ? null : t.tier)} className="hover:bg-[#1e2228]/20 transition cursor-pointer group">
                        <td className="py-5 pl-2">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#08090b] border border-[#1e2228] text-emerald-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Weight: <span className="text-yellow-500 font-semibold">{t.weight}x</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-5"><span className="text-white font-bold">{formatNumber(t.reqTokens)}</span> ${config.ticker}</td>
                        <td className="py-5">
                          <div className="font-bold text-white">{floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'}</div>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{actCost > 0 ? formatCurrency(actCost) : '—'}</div>
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
                          <td colSpan="6" className="p-4 md:p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">Daily yield ({t.name})</h4>
                              <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                            </div>
                            <div className="relative h-32 md:h-40 w-full">
                              <EmptyChart>No daily yield recorded for this tier</EmptyChart>
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

      <ShareSection id="yield" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] p-4 md:p-6 rounded-2xl shadow-lg space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">Historical Yield & Payback Horizon</h2>
            <p className="text-xs md:text-sm text-slate-400 mt-1">Payback stays blank until a fund posts a dividend. The five books below are the fund desk's last ETH mark.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiers.map((t) => {
              const tc = floorCostUsd + (t.reqTokens * tokenPx);
              const years = t.trackedAnnualYieldUsd > 0 ? `${(tc / t.trackedAnnualYieldUsd).toFixed(1)} Years` : 'N/A';
              return (
                <div key={t.tier} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{t.tier} Payback Horizon</p>
                  <p className="text-xl font-extrabold text-emerald-400">{years}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {funds.map((fund) => (
              <div key={fund.name} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{fund.name}</p>
                <p className="text-xl font-extrabold text-emerald-400">{formatCurrency(fund.navUsd || 0)}</p>
                <p className="text-xs text-slate-500 mt-1">{formatNumber(fund.enrolled || 0)} enrolled</p>
              </div>
            ))}
          </div>

          <YieldHistorySwitch
            labels={histLabels}
            datasets={histDatasets}
            options={baseChartOptions(histLabels, interval, { yUnit: 'CoC %' })}
            snaps={roiSnaps}
            tiers={tiers}
            empty="No dividend history yet, so cash-on-cash stays blank"
          />
        </div>
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white">Protocol Revenue & Ecosystem Liquidity</h2>
            <p className="text-xs text-slate-400 mt-1">Every enrollment pays the class load in $TMF. Half is burned and half is booked to that Seat's fund. Dividends are posted separately.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Load paid</p>
              <p className="text-2xl font-extrabold text-emerald-400">{tokenPx > 0 ? formatCurrency(revenue.loadUsd || 0) : formatNumber(revenue.loadTokens || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">{formatNumber(revenue.loadTokens || 0)} {config.ticker}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Burned</p>
              <p className="text-2xl font-extrabold text-orange-400">{tokenPx > 0 ? formatCurrency(revenue.burnedUsd || 0) : formatNumber(revenue.burnedTokens || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">Half of every load</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Booked to funds</p>
              <p className="text-2xl font-extrabold text-blue-400">{formatNumber(revenue.bookTokens || 0)} {config.ticker}</p>
              <p className="text-xs text-slate-500 mt-1">The other half</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Dividends posted</p>
              <p className="text-2xl font-extrabold text-white">{dividendUsd > 0 ? formatCurrency(dividendUsd) : '—'}</p>
              <p className="text-xs text-slate-500 mt-1">{(revenue.dividends || []).length ? `${(revenue.dividends || []).length} tokens` : 'None yet'}</p>
            </div>
          </div>

          {(revenue.dividends || []).length ? (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <h3 className="text-sm font-bold text-white mb-4">Dividends posted</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-400 border-b border-[#1e2228]">
                      <th className="pb-2 pl-2">Token</th>
                      <th className="pb-2 text-right">Amount</th>
                      <th className="pb-2 text-right pr-2">USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2228]/40 text-slate-200">
                    {revenue.dividends.map((row) => (
                      <tr key={row.address}>
                        <td className="py-2.5 pl-2 font-bold text-white">
                          <a href={explorerAddressUrl(row.address)} target="_blank" rel="noreferrer" className="hover:text-emerald-400">{row.symbol}</a>
                        </td>
                        <td className="py-2.5 text-right">{formatNumber(row.amount)}</td>
                        <td className="py-2.5 text-right pr-2">{row.usd > 0 ? formatCurrency(row.usd) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Liquidity</h2>
          <p className="text-xs text-slate-400">The Open Market trades Seats for $TMF. The house rate is 401,000 $TMF a Seat, both ways. A random Seat is the rate plus 8%. A specific Seat is the rate plus 16%. Handing a Seat in pays the rate less 8%.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Random Seat</p>
              <p className="text-2xl font-extrabold text-emerald-400">{randomUsd > 0 ? formatCurrency(randomUsd) : '—'}</p>
              <p className="text-xs text-slate-500 mt-1">401,000 + 8%</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Specific Seat</p>
              <p className="text-2xl font-extrabold text-white">{specificUsd > 0 ? formatCurrency(specificUsd) : '—'}</p>
              <p className="text-xs text-slate-500 mt-1">401,000 + 16%</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Hand in</p>
              <p className="text-2xl font-extrabold text-blue-400">{handInUsd > 0 ? formatCurrency(handInUsd) : '—'}</p>
              <p className="text-xs text-slate-500 mt-1">401,000 − 8%</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">OpenSea floor</p>
              <p className="text-2xl font-extrabold text-orange-400">{floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'}</p>
              <p className="text-xs text-slate-500 mt-1">{market.nftFloorEth ? `${Number(market.nftFloorEth).toFixed(4)} ETH` : 'No ETH listing yet'}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Seat{' '}
            <a href={explorerAddressUrl(config.nftCa)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">{config.nftCa}</a>
            . Open Market{' '}
            <a href={explorerAddressUrl(config.ammCa)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">{config.ammCa}</a>
            .{config.site ? <> <a href={config.site} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">themutual.fun</a></> : null}
          </p>
        </div>
      </ShareSection>

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

          <BurnHistorySwitch
            cumulative={{
              title: 'Cumulative burn',
              note: 'From the first recorded day through today. Quiet days keep the last cumulative burn.',
              body: burn.data.length > 0 ? (
                <Line
                  key={`burn-${timeframe}`}
                  data={{ labels: burn.labels, datasets: [cumulativeBurnDataset(burn.data, '#fb923c')] }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, unit: 'Tokens', ticks: { color: '#94a3b8', callback: compactTick } } } }}
                />
              ) : (
                <EmptyChart>No burn history recorded yet</EmptyChart>
              ),
            }}
            flywheel={{
              labels: flywheel.labels,
              burn: flywheel.burn,
              prices: flywheel.prices,
              priceColor: '#34d399',
              burnColor: 'rgba(249, 115, 22, 0.8)',
              burnLabel: 'Daily Burn Velocity',
              leftMax: flywheel.burnAxisMax,
            }}
          />
        </div>
      </ShareSection>

      <ShareSection id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Ecosystem Activation Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Activated Supply Ratio</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{(activation.percentActivated || 0).toFixed(2)}%</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-blue-400">{formatNumber(activation.activeCount || 0)} Units</p></div>
          </div>

          <TierFlowSection
            tiers={tiers}
            tierStats={tierStats}
            timeframe={tierTimeframe}
            onTimeframe={setTierTimeframe}
            formatNumber={formatNumber}
            note="Act is an enrollment into that class, including a merge into it. Deact is an enrollment ending, or a seat retired by a merge. Up is the class a seat left when it became a corner office."
          />

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-6">
            <h3 className="text-sm font-bold text-white mb-6">Current Tier Mix (net of deactivations)</h3>
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

          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Enrolled by fund</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-[#1e2228]">
                    <th className="pb-2 pl-2">Fund</th>
                    {tiers.map((tier) => (
                      <th key={tier.tier} className="pb-2 text-right">{tier.name}</th>
                    ))}
                    <th className="pb-2 text-right pr-2">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2228]/40 text-slate-200">
                  {funds.map((fund) => (
                    <tr key={fund.name}>
                      <td className="py-2.5 pl-2 font-bold text-white">{fund.name}</td>
                      {tiers.map((tier) => (
                        <td key={tier.tier} className="py-2.5 text-right">{formatNumber(fund.classes?.[tier.tier] || 0)}</td>
                      ))}
                      <td className="py-2.5 text-right pr-2 font-bold text-white">{formatNumber(fund.enrolled || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ActivationStackPanel snaps={dailySnapshots} tiers={tiers} breakdown={activation.breakdown} />
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-1">Active units vs daily flow</h3>
            <p className="text-xs text-slate-400 mb-4">The line is enrolled Seats at end of day. A transfer ends enrollment. Bars are new enrollments and exits, not corner-office merges.</p>
            <div className="relative h-52 sm:h-64 md:h-80 w-full">
              {hasActHist ? (
                <ActivityChart
                  labels={actWin.labels}
                  net={actWin.cols[0]}
                  ins={actWin.cols[1]}
                  outs={actWin.cols[2]}
                  interval={interval}
                  lineColor="#34d399"
                  lineLabel="Active units"
                />
              ) : (
                <EmptyChart>No activation history recorded</EmptyChart>
              )}
            </div>
          </div>
        </div>
      </ShareSection>

      <ShareSection id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white mb-6">Protocol Ownership & Distribution</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Current Max Supply</p><p className="text-xl md:text-3xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || seats.max || config.maxSupply || 0, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Permanently Burnt</p><p className="text-xl md:text-3xl font-extrabold text-orange-400">{formatNumber(realBurntUnits, 2)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">AMM Vault Inventory</p><p className="text-xl md:text-3xl font-extrabold text-slate-300">{countOrDash(ownership.ammVaultNfts, formatNumber)}</p></div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner border-b-4 border-b-emerald-500"><p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">True Circulating NFTs</p><p className="text-xl md:text-3xl font-extrabold text-emerald-400">{formatNumber(circulatingNfts)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique NFT Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{countOrDash(ownership.nftHolders, formatNumber, ' Wallets')}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets with an activated Seat</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-300">{countOrDash(activation.activeHolders, formatNumber, ' Wallets')}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm ring-1 ring-emerald-500/20"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Wallets per 100 NFTs</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{ownership.ownershipRatio == null ? '—' : `${Number(ownership.ownershipRatio).toFixed(2)}%`}</p></div>
            <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm"><p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Unique ${config.ticker} Holders</p><p className="text-lg sm:text-2xl md:text-3xl font-extrabold leading-tight break-words text-emerald-400">{countOrDash(ownership.tokenHolders, formatNumber, ' Wallets')}</p></div>
          </div>

          <OwnershipHistoryPanels
            snaps={dailySnapshots}
            live={{ tokenHolders: ownership.tokenHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          />
        </div>
      </ShareSection>

      <MethodologyCard accent="text-emerald-400">
        <p><strong className="text-white">Yield &amp; ROI:</strong> Cost is the OpenSea floor plus the Front-End Load at the $TMF spot. Cash-on-cash stays at zero until a fund posts a dividend. Payback is N/A for the same reason. The five fund cards are the desk's last ETH mark, not a yield.</p>
        <p><strong className="text-white">Activation:</strong> Enrolled Seats are the live set. A transfer ends enrollment and the next holder pays the load again. A corner office is a merge into the next class. Act, Up, and Deact on the tier cards are those events, split by the day they were logged.</p>
        <p><strong className="text-white">Burn:</strong> Half of every Front-End Load is $TMF sent to the Chairman&apos;s Estate. The percent is that burn over the prospectus supply of 1,604,401,000. Equivalent units are Seats retired by a merger. The collection cannot mint a replacement. The burn line is that cumulative load, not unminted supply.</p>
        <p><strong className="text-white">Liquidity:</strong> The Open Market posts 401,000 $TMF a Seat. Random is +8%, specific is +16%, and a hand-in is −8%. No ETH is charged. Holder counts come from the wallet index once its fold covers this collection. Circulating seats are minted seats minus mergers minus seats sitting in the Open Market.</p>
      </MethodologyCard>
    </div>
  );
}
