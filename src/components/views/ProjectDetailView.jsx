import React, { useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatNumber, formatPercent, formatCompact } from '../../lib/format';
import * as M from '../../lib/metrics';
import { Card, StatCard, SectionHeader, Switcher, LegendRow, EmptyChart, UnderConstructionNotice, StaleBadge } from '../ui';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler
);

// Literal class names so Tailwind can see them at build time.
const STREAM_GRID = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

const axis = (tickFormat) => ({
  grid: { color: '#334155', borderDash: [4, 4] },
  ticks: { color: '#94a3b8', ...(tickFormat ? { callback: tickFormat } : {}) },
});

const baseOptions = (yTickFormat, tooltipFormat) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'top', labels: { color: '#cbd5e1', boxWidth: 12, padding: 16 } },
    tooltip: tooltipFormat
      ? { callbacks: { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label.split(' — ')[0] + ': ' : ''}${tooltipFormat(ctx.raw)}` } }
      : {},
  },
  scales: { x: axis(), y: axis(yTickFormat) },
});

export default function ProjectDetailView({ projectKey, data, activeTab }) {
  const [expandedTier, setExpandedTier] = useState(null);
  const [histTimeframe, setHistTimeframe] = useState('all');
  const [burnTimeframe, setBurnTimeframe] = useState('all');
  const [actTimeframe, setActTimeframe] = useState('all');
  const [tierWindow, setTierWindow] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(true);

  const project = data?.projects?.[projectKey];

  if (!project) {
    return (
      <Card className="text-center" padding="p-12">
        <h3 className="text-lg font-bold text-white mb-2">Project Data Loading...</h3>
        <p className="text-sm text-slate-400">Please ensure '{projectKey}' exists in data.json.</p>
      </Card>
    );
  }

  const meta = M.PROJECT_META[projectKey] || { name: projectKey, color: '#3b82f6' };
  const config = project.config || {};
  const ticker = config.ticker || 'TOKEN';
  const tiers = project.tiers || [];
  const activation = project.activation || {};
  const own = M.ownershipStats(project);
  const underConstruction = M.isUnderConstruction(project);
  const degraded = M.degradedFields(project);
  const floorCost = M.floorCostUsd(project);

  const usdTick = (v) => '$' + formatCompact(v);
  const pctTick = (v) => v + '%';

  // ---------------------------------------------------------------- ROI
  if (activeTab === 'roi') {
    return (
      <div className="space-y-6">
        {underConstruction && <UnderConstructionNotice name={meta.name} />}
        <StaleBadge fields={degraded} />
        <Card>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📊</span> {meta.name} Tier ROI Benchmarks
            </h3>
            <div className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-1.5 text-xs text-slate-300">
              Floor Entry Cost: <span className="text-white font-bold">{formatCurrency(floorCost)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-[#334155] text-slate-500 text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Tier</th>
                  <th className="py-3 px-4">Activation Req.</th>
                  <th className="py-3 px-4">Current Total Cost</th>
                  <th className="py-3 px-4">Expected Yield (Annualized)</th>
                  <th className="py-3 px-4 text-right pr-6">Est. ROI (CoC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#334155]/50 text-sm">
                {tiers.map((t, i) => {
                  const { activationUsd, totalUsd } = M.tierCost(project, t);
                  const roi = M.tierRoiPct(project, t);
                  const isExpanded = expandedTier === t.tier;
                  const dates = t.dailyDates || [];
                  const yields = t.dailyYields || [];
                  const hasDaily = dates.length > 0 && yields.some((v) => v > 0);

                  return (
                    <React.Fragment key={t.tier}>
                      <tr
                        onClick={() => setExpandedTier(isExpanded ? null : t.tier)}
                        className="hover:bg-[#334155]/20 transition cursor-pointer group"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#0f172a] border border-[#334155] px-2.5 py-1 rounded text-xs font-bold shadow-inner" style={{ color: M.TIER_COLORS[i % M.TIER_COLORS.length] }}>{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500">Weight: <span className="text-yellow-500 font-semibold">{t.weight}x</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-semibold text-white">{formatNumber(t.reqTokens)} ${ticker}</td>
                        <td className="py-4 px-4">
                          <div className="font-bold text-white">{formatCurrency(totalUsd)}</div>
                          <div className="text-xs text-slate-500">Floor + {formatCurrency(activationUsd)} Act.</div>
                        </td>
                        <td className="py-4 px-4 font-bold text-white">
                          {t.trackedAnnualYieldUsd > 0
                            ? <>{formatCurrency(t.trackedAnnualYieldUsd)} <span className="text-slate-500 font-normal">/yr</span></>
                            : <span className="text-slate-500 font-normal italic">Initializing…</span>}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-3 pr-2">
                            {t.trackedAnnualYieldUsd > 0 ? (
                              <span className="px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-bold inline-block">
                                {formatPercent(roi)}
                              </span>
                            ) : (
                              <span className="px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs font-bold inline-block">
                                TBD
                              </span>
                            )}
                            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#0f172a]/40 border-b border-[#334155]/50">
                          <td colSpan="5" className="p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">Trailing Realized Yield ({t.name})</h4>
                              <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                            </div>
                            <div className="relative h-48 w-full">
                              {hasDaily ? (
                                <Line
                                  data={{
                                    labels: dates,
                                    datasets: [{
                                      label: 'Daily Yield (USD)',
                                      data: yields,
                                      borderColor: meta.color,
                                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                      borderWidth: 2, fill: true, tension: 0.4,
                                      pointRadius: 4, pointBackgroundColor: meta.color,
                                    }],
                                  }}
                                  options={{
                                    ...baseOptions(usdTick, (v) => formatCurrency(v)),
                                    plugins: {
                                      legend: { display: false },
                                      tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
                                    },
                                  }}
                                />
                              ) : (
                                <EmptyChart message={`No distributions recorded for ${t.name} yet.`} />
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
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------- HISTORICAL
  if (activeTab === 'historical') {
    const history = M.tierRoiHistory(project);
    const sliced = M.sliceTimeframe(history.labels, history.series, histTimeframe);
    const hasHistory = sliced.labels.length > 0;

    return (
      <Card className="space-y-6">
        <SectionHeader
          title={`${meta.name} Historical ROI Tracking (%)`}
          subtitle="Track capital recovery timelines and ROI trajectory over time."
        >
          <Switcher options={M.TIMEFRAMES} value={histTimeframe} onChange={setHistTimeframe} />
        </SectionHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {tiers.map((t) => {
            const years = M.paybackYears(project, t);
            return (
              <div key={t.tier} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 shadow-inner">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{t.tier} Payback</p>
                <p className="text-xl font-extrabold text-blue-400">{years === null ? 'N/A' : `${years.toFixed(1)} Years`}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {t.trackedAnnualYieldUsd > 0 ? `${formatPercent(M.tierRoiPct(project, t))} CoC` : 'No tracked yield'}
                </p>
              </div>
            );
          })}
        </div>

        <div className="h-[380px] w-full relative bg-[#0f172a] border border-[#334155] rounded-xl p-4">
          {hasHistory ? (
            <Line
              data={{
                labels: sliced.labels,
                datasets: sliced.series.map((s, i) => ({
                  // Current value in the legend, per Savi: reading the latest
                  // number off the right edge of five overlapping lines is
                  // guesswork.
                  label: M.labelWithCurrent(`${s.tier} ROI %`, s.data, (v) => formatPercent(v)),
                  data: s.data,
                  borderColor: M.TIER_COLORS[i % M.TIER_COLORS.length],
                  backgroundColor: M.TIER_COLORS[i % M.TIER_COLORS.length],
                  borderWidth: 2, tension: 0.3, pointRadius: 3, spanGaps: true,
                })),
              }}
              options={baseOptions(pctTick, (v) => formatPercent(v))}
            />
          ) : (
            <EmptyChart message="ROI history starts accumulating once the tracker has recorded a full day of yield. Nothing to plot yet." />
          )}
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------ REVENUE
  if (activeTab === 'revenue') {
    const streams = M.revenueStreams(project);
    const dayCount = streams.reduce((max, s) => Math.max(max, s.daily.length), 0);
    const labels = (tiers[0]?.dailyDates || []).slice(-dayCount);
    const lockedLp = project.lockedLp;

    return (
      <div className="space-y-6">
        <StaleBadge fields={degraded} />

        <div className={`grid grid-cols-1 gap-4 ${STREAM_GRID[Math.min(streams.length, 4)] || 'md:grid-cols-3'}`}>
          {streams.length === 0 && (
            <Card><p className="text-sm text-slate-400">No revenue streams recorded for {meta.name} yet.</p></Card>
          )}
          {streams.map((s) => (
            <StatCard
              key={s.key}
              title={`${s.label} (7D)`}
              value={formatCurrency(s.totalUsd)}
              valueClass=""
              dotColor={s.color}
              sub={`${formatCurrency(s.totalUsd / 7)} / day avg`}
            />
          ))}
        </div>

        <Card>
          <h3 className="text-lg font-bold text-white mb-6">Daily Revenue Inflows by Stream (USD)</h3>
          <div className="h-[350px] w-full relative">
            {streams.length > 0 && labels.length > 0 ? (
              <Bar
                data={{
                  labels,
                  datasets: streams.map((s) => ({
                    label: M.labelWithCurrent(s.label, s.daily, (v) => formatCurrency(v)),
                    data: s.daily.slice(-labels.length),
                    backgroundColor: s.color,
                    borderRadius: 4,
                  })),
                }}
                options={{
                  ...baseOptions(usdTick, (v) => formatCurrency(v)),
                  scales: { x: { ...axis(), stacked: true }, y: { ...axis(usdTick), stacked: true } },
                }}
              />
            ) : (
              <EmptyChart message="No daily revenue breakdown available for this project yet." />
            )}
          </div>
        </Card>

        {lockedLp && (lockedLp.pools || []).length > 0 && (
          <Card>
            <div className="flex justify-between items-start mb-4 gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                  "Black Hole" Liquidity: Tokens Locked in Pools
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scanned from {lockedLp.pools.length} active partner and meme trading pairs.
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base font-extrabold text-orange-400">{formatCompact(lockedLp.totalStonkLocked)} {ticker}</p>
                <p className="text-[10px] text-slate-500">{formatCurrency(lockedLp.totalLpUsd)} total liquidity</p>
                <button
                  onClick={() => setLpTableOpen(!lpTableOpen)}
                  className="mt-1 text-[10px] bg-[#0f172a] border border-[#334155] text-slate-300 px-3 py-1 rounded hover:text-white transition"
                >
                  {lpTableOpen ? 'Hide Pools ▲' : 'Show Pools ▼'}
                </button>
              </div>
            </div>
            {lpTableOpen && (
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#1e293b]">
                    <tr className="text-slate-400 border-b border-[#334155]">
                      <th className="pb-2 pl-2">Trading Pair</th>
                      <th className="pb-2">DEX Venue</th>
                      <th className="pb-2 text-right">Tokens Locked</th>
                      <th className="pb-2 text-right pr-2">Total Pool Liquidity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#334155]/40 text-slate-200">
                    {[...lockedLp.pools].sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0)).map((p, i) => (
                      <tr key={`${p.pairName}-${i}`} className="hover:bg-[#334155]/20">
                        <td className="py-3 pl-2 font-bold text-white">{p.pairName}</td>
                        <td className="py-3 text-slate-400">{p.dex}</td>
                        <td className="py-3 text-right font-bold text-orange-400">{formatNumber(p.stonkAmount)}</td>
                        <td className="py-3 text-right pr-2">{formatCurrency(p.liquidityUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------- BURN
  if (activeTab === 'burn') {
    const dualBurn = activation.dualBurn || {};
    const burnHistory = M.burnPctHistory(project);
    const sliced = M.sliceTimeframe(burnHistory.labels, [{ name: 'burn', data: burnHistory.data }], burnTimeframe);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title={`Total $${ticker} Burnt`}
            value={`${formatCompact(dualBurn.totalBurnTokens)}`}
            valueClass="text-orange-400"
            sub={`${formatNumber(dualBurn.totalBurnTokens)} ${ticker}`}
          />
          <StatCard
            title="Equivalent Units Removed"
            value={`${formatNumber(dualBurn.equivalentBrokersBurnt, 2)} Units`}
            valueClass="text-blue-400"
            sub={`at ${formatNumber(config.unitValue)} ${ticker} per unit`}
          />
          <StatCard
            title="Supply Deflation"
            value={formatPercent(M.deflationPct(project))}
            valueClass="text-emerald-400"
            sub={`of ${formatCompact(M.maxSupplyTokens(project))} max supply`}
          />
        </div>

        <Card className="space-y-4">
          <SectionHeader title="Cumulative Supply Burnt Over Time (%)" subtitle="Permanent supply removal as a share of genesis max supply.">
            <Switcher options={M.TIMEFRAMES} value={burnTimeframe} onChange={setBurnTimeframe} />
          </SectionHeader>
          <div className="h-[350px] w-full relative">
            {sliced.labels.length > 0 ? (
              <Line
                data={{
                  labels: sliced.labels,
                  datasets: [{
                    label: M.labelWithCurrent(`$${ticker} Burnt (%)`, sliced.series[0].data, (v) => formatPercent(v)),
                    data: sliced.series[0].data,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true, tension: 0.3, pointRadius: 3,
                  }],
                }}
                options={baseOptions(pctTick, (v) => formatPercent(v))}
              />
            ) : (
              <EmptyChart message="Burn history builds from daily snapshots. Not enough clean snapshots recorded yet." />
            )}
          </div>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------- ACTIVATION
  if (activeTab === 'activation') {
    const breakdown = M.tierBreakdown(project);
    const flow = M.tierFlow(project, tierWindow);
    const history = M.activationHistory(project);
    const sliced = M.sliceTimeframe(history.labels, [
      { name: 'Net Active Units', data: history.net, color: meta.color },
      { name: 'Cumulative Activations', data: history.gross, color: '#94a3b8' },
    ], actTimeframe);
    const hasBreakdown = breakdown.some((b) => b.count > 0);

    return (
      <div className="space-y-6">
        {underConstruction && <UnderConstructionNotice name={meta.name} />}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            title="Activated Supply Ratio"
            value={formatPercent(activation.percentActivated)}
            valueClass="text-emerald-400"
            sub={`${formatNumber(activation.activeCount)} of ${formatNumber(activation.totalSupply)} units`}
          />
          <StatCard
            title="Total Active Units"
            value={`${formatNumber(activation.activeCount)} Units`}
            valueClass="text-blue-400"
            sub={`across ${breakdown.length} tiers`}
          />
        </div>

        {/* The activation boxes. activation.tierStats has carried this the whole
            time; the React port dropped the only thing that rendered it. */}
        <Card>
          <SectionHeader title="Tier Activation Flow" subtitle="Activations against deactivations, per tier, over the selected window.">
            <Switcher options={M.TIER_FLOW_WINDOWS} value={tierWindow} onChange={setTierWindow} />
          </SectionHeader>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {flow.map((t) => (
              <div key={t.tier} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <p className="text-[10px] uppercase tracking-wider text-slate-300 font-bold truncate" title={t.name}>{t.name}</p>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{formatNumber(t.act)}</p>
                    <p className="text-[9px] text-slate-500 uppercase">Act</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-rose-400">{formatNumber(t.deact)}</p>
                    <p className="text-[9px] text-slate-500 uppercase">Deact</p>
                  </div>
                </div>
                <p className={`text-[10px] mt-2 font-semibold ${t.net >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                  Net {t.net >= 0 ? '+' : ''}{formatNumber(t.net)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-white mb-6">Active Units & Tier Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="h-[300px] relative">
              {hasBreakdown ? (
                <Doughnut
                  data={{
                    labels: breakdown.map((b) => b.name),
                    datasets: [{
                      data: breakdown.map((b) => b.count),
                      backgroundColor: breakdown.map((b) => b.color),
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'right', labels: { color: '#cbd5e1', boxWidth: 12 } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const total = breakdown.reduce((a, b) => a + b.count, 0);
                            const pct = total > 0 ? (ctx.raw / total) * 100 : 0;
                            return `${ctx.label}: ${formatNumber(ctx.raw)} (${formatPercent(pct, 1)})`;
                          },
                        },
                      },
                    },
                  }}
                />
              ) : (
                <EmptyChart message="No units activated yet." />
              )}
            </div>
            <div className="space-y-3">
              {breakdown.map((b) => (
                <LegendRow key={b.tier} color={b.color} name={b.name} value={formatNumber(b.count)} />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Historical Activity (Net vs. Cumulative)" subtitle="Net active units after deactivations, against total activations ever recorded.">
            <Switcher options={M.TIMEFRAMES} value={actTimeframe} onChange={setActTimeframe} />
          </SectionHeader>
          <div className="h-[320px] w-full relative">
            {sliced.labels.length > 0 ? (
              <Line
                data={{
                  labels: sliced.labels,
                  datasets: sliced.series.map((s, i) => ({
                    label: M.labelWithCurrent(s.name, s.data, (v) => formatNumber(v)),
                    data: s.data,
                    borderColor: s.color,
                    backgroundColor: i === 0 ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    fill: i === 0, tension: 0.3, pointRadius: 2,
                    borderDash: i === 1 ? [5, 5] : undefined,
                  })),
                }}
                options={baseOptions(null, (v) => formatNumber(v))}
              />
            ) : (
              <EmptyChart message="No activation history recorded yet." />
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------- OWNERSHIP
  if (activeTab === 'ownership') {
    const holders = M.holderHistory(project);
    const concentrationSuspect = own.ownershipRatio > 100;

    return (
      <div className="space-y-6">
        <StaleBadge fields={degraded} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Current Max Supply" value={`${formatNumber(own.currentMaxSupply, 2)} Units`} />
          <StatCard title="Permanently Burnt" value={`${formatNumber(own.burntNfts, 2)} Units`} valueClass="text-orange-400" />
          <StatCard title="AMM Vault Inventory" value={`${formatNumber(own.ammVaultNfts)} Units`} valueClass="text-slate-300" />
          <StatCard title="True Circulating NFTs" value={`${formatNumber(own.circulatingNftSupply)} Units`} valueClass="text-blue-400" accent="#3b82f6" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Unique NFT Holders" value={`${formatNumber(own.nftHolders)} Wallets`} valueClass="text-purple-400" />
          <StatCard
            title="Ownership Concentration"
            value={formatPercent(own.ownershipRatio)}
            valueClass={concentrationSuspect ? 'text-amber-400' : 'text-emerald-400'}
            sub={concentrationSuspect ? 'Holders exceed circulating supply — under review' : 'Unique holders / true circulating supply'}
          />
          <StatCard title={`Unique $${ticker} Holders`} value={`${formatNumber(own.tokenHolders)} Wallets`} valueClass="text-purple-400" />
        </div>

        <Card>
          <h3 className="text-lg font-bold text-white mb-4">${ticker} Holders Over Time</h3>
          <div className="h-[350px] w-full relative">
            {holders.labels.length > 0 ? (
              <Line
                data={{
                  labels: holders.labels,
                  datasets: [{
                    label: M.labelWithCurrent('Token Holders', holders.data, (v) => formatNumber(v)),
                    data: holders.data,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    fill: true, tension: 0.3, pointRadius: 3,
                  }],
                }}
                options={baseOptions(null, (v) => `${formatNumber(v)} wallets`)}
              />
            ) : (
              <EmptyChart message="No holder history recorded yet." />
            )}
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
