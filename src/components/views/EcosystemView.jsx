import React, { useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatNumber, formatPercent, formatCompact } from '../../lib/format';
import * as M from '../../lib/metrics';
import { Card, StatCard, SectionHeader, Switcher, LegendRow, EmptyChart } from '../ui';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler
);

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

const pctTick = (v) => v + '%';
const usdTick = (v) => '$' + formatCompact(v);

export default function EcosystemView({ data, activeTab }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [burnTimeframe, setBurnTimeframe] = useState('all');
  const [activationTimeframe, setActivationTimeframe] = useState('all');

  const projects = M.listProjects(data);

  if (projects.length === 0) {
    return (
      <Card className="text-center" padding="p-12">
        <h3 className="text-lg font-bold text-white mb-2">Loading ecosystem data…</h3>
      </Card>
    );
  }

  // ---------------------------------------------------------------- ROI
  if (activeTab === 'roi') {
    const rows = M.ecosystemRoiRows(data);

    return (
      <Card>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🌐</span> Global Yield ROI Benchmarks
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Last automated sync: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'unknown'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-[#334155] text-slate-400 text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Base Tier (T0) Req.</th>
                <th className="py-3 px-4">Total Entry Cost</th>
                <th className="py-3 px-4">Expected Yield (Annualized)</th>
                <th className="py-3 px-4 text-right pr-6">Est. ROI (CoC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#334155]/50 text-sm">
              {rows.map((r) => {
                const isExpanded = expandedRow === r.key;
                const dates = r.tier?.dailyDates || [];
                const yields = r.tier?.dailyYields || [];
                const hasDaily = dates.length > 0 && yields.some((v) => v > 0);
                const live = r.annualYieldUsd > 0;

                return (
                  <React.Fragment key={r.key}>
                    <tr
                      onClick={() => setExpandedRow(isExpanded ? null : r.key)}
                      className="hover:bg-[#334155]/20 transition cursor-pointer group"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#0f172a] border border-[#334155] flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img src={r.logo} alt={r.name} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <span className="font-bold text-white">{r.name}</span>
                            {r.underConstruction && (
                              <span className="block text-[10px] text-amber-400 font-semibold">Under construction</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-semibold text-white">{r.tierName}</p>
                        <p className="text-xs text-slate-400">{formatNumber(r.reqTokens)} {r.ticker}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-bold text-white">{formatCurrency(r.totalUsd)}</p>
                        <p className="text-xs text-slate-400">Floor + {formatCurrency(r.activationUsd)} Act.</p>
                      </td>
                      <td className="py-4 px-4">
                        {live
                          ? <p className="font-bold text-white">{formatCurrency(r.annualYieldUsd)} <span className="text-xs text-slate-400">/yr</span></p>
                          : <p className="text-slate-400 italic text-sm">Initializing…</p>}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-3 pr-2">
                          <span className={`px-3 py-1.5 rounded-lg border text-xs font-bold inline-block ${
                            live
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          }`}>
                            {live ? formatPercent(r.roiPct) : 'TBD / BUILDING'}
                          </span>
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
                            <h4 className="text-sm font-bold text-slate-300">Trailing Realized Yield ({r.name})</h4>
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
                                    borderColor: r.color,
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    borderWidth: 2, fill: true, tension: 0.4,
                                    pointRadius: 4, pointBackgroundColor: r.color,
                                  }],
                                }}
                                options={{
                                  ...baseOptions(usdTick),
                                  plugins: {
                                    legend: { display: false },
                                    tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
                                  },
                                }}
                              />
                            ) : (
                              <EmptyChart message={`No distributions recorded for ${r.name} yet.`} />
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
    );
  }

  // --------------------------------------------------------- HISTORICAL
  if (activeTab === 'historical') {
    // Base-tier ROI per project, aligned onto one date axis.
    const aligned = M.alignSeries(projects.map(({ key, name, color, project }) => {
      const history = M.tierRoiHistory(project);
      const base = history.series[0];
      return { key, name, color, labels: history.labels, data: base ? base.data : [] };
    }).filter((s) => s.labels.length > 0));

    return (
      <Card className="space-y-6">
        <SectionHeader
          title="Historical Protocol ROI Tracking (%)"
          subtitle="Base-tier (T0) cash-on-cash return per protocol, from recorded daily snapshots."
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {M.ecosystemRoiRows(data).map((r) => (
            <StatCard
              key={r.key}
              title={`${r.name} T0 ROI`}
              value={r.annualYieldUsd > 0 ? formatPercent(r.roiPct) : 'TBD'}
              valueClass={r.annualYieldUsd > 0 ? 'text-emerald-400' : 'text-amber-400'}
              dotColor={r.color}
              sub={r.annualYieldUsd > 0 ? `${formatCurrency(r.annualYieldUsd)} /yr` : 'No tracked yield'}
            />
          ))}
        </div>

        <div className="h-[400px] w-full relative">
          {aligned.labels.length > 0 ? (
            <Line
              data={{
                labels: aligned.labels,
                datasets: aligned.series.map((s) => ({
                  label: M.labelWithCurrent(`${s.name} ROI`, s.data, (v) => formatPercent(v)),
                  data: s.data,
                  borderColor: s.color,
                  backgroundColor: s.color,
                  borderWidth: 2, tension: 0.3, pointRadius: 3, spanGaps: true,
                })),
              }}
              options={baseOptions(pctTick, (v) => formatPercent(v))}
            />
          ) : (
            <EmptyChart message="ROI history builds from daily snapshots, which only started accumulating recently. It will fill in as the tracker runs." />
          )}
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------ REVENUE
  if (activeTab === 'revenue') {
    const perProject = projects.map(({ key, name, color, project }) => ({
      key, name, color,
      totalUsd: M.totalRevenueUsd(project),
      streams: M.revenueStreams(project),
    }));
    const ecosystemTotal = perProject.reduce((sum, p) => sum + p.totalUsd, 0);
    const liveProtocols = perProject.filter((p) => p.totalUsd > 0).length;
    const combinedLp = projects.reduce((sum, { project }) => sum + (project.lockedLp?.totalLpUsd || 0), 0);

    // One bar per project per day, summed across that project's streams.
    const dayCount = Math.max(...projects.map(({ project }) =>
      Math.max(0, ...M.revenueStreams(project).map((s) => s.daily.length))
    ), 0);
    const labels = (projects[0]?.project?.tiers?.[0]?.dailyDates || []).slice(-dayCount);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Ecosystem Revenue (7D)" value={formatCurrency(ecosystemTotal)} valueClass="text-emerald-400" sub={`${formatCurrency(ecosystemTotal / 7)} / day avg`} />
          <StatCard title="Combined Locked Liquidity" value={formatCurrency(combinedLp)} valueClass="text-blue-400" sub="Across all tracked pools" />
          <StatCard title="Active Revenue Protocols" value={`${liveProtocols} Live`} valueClass="text-purple-400" sub={`of ${projects.length} tracked`} />
        </div>

        <Card>
          <h2 className="text-xl font-bold text-white mb-6">Daily Revenue Inflows by Protocol (USD)</h2>
          <div className="h-[400px] w-full relative">
            {labels.length > 0 ? (
              <Bar
                data={{
                  labels,
                  datasets: perProject.map((p) => {
                    const daily = labels.map((_, i) =>
                      p.streams.reduce((sum, s) => sum + (s.daily[s.daily.length - labels.length + i] || 0), 0)
                    );
                    return {
                      label: M.labelWithCurrent(p.name, daily, (v) => formatCurrency(v)),
                      data: daily,
                      backgroundColor: p.color,
                      borderRadius: 4,
                    };
                  }),
                }}
                options={{
                  ...baseOptions(usdTick, (v) => formatCurrency(v)),
                  scales: { x: { ...axis(), stacked: true }, y: { ...axis(usdTick), stacked: true } },
                }}
              />
            ) : (
              <EmptyChart message="No daily revenue breakdown available yet." />
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-white mb-4">Revenue by Stream</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[520px]">
              <thead>
                <tr className="text-slate-400 border-b border-[#334155] text-xs uppercase tracking-wider">
                  <th className="pb-3 pl-2">Protocol</th>
                  <th className="pb-3">Streams</th>
                  <th className="pb-3 text-right pr-2">7D Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#334155]/40">
                {perProject.map((p) => (
                  <tr key={p.key} className="hover:bg-[#334155]/20">
                    <td className="py-3 pl-2 font-bold text-white">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400 text-xs">
                      {p.streams.length > 0 ? p.streams.map((s) => s.label).join(' · ') : '—'}
                    </td>
                    <td className="py-3 text-right pr-2 font-bold text-emerald-400">{formatCurrency(p.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------------- BURN
  if (activeTab === 'burn') {
    const deflation = M.ecosystemDeflation(data);
    const aligned = M.alignSeries(projects.map(({ key, name, color, project }) => ({
      key, name, color, ...M.burnPctHistory(project),
    })));
    const sliced = M.sliceTimeframe(aligned.labels, aligned.series, burnTimeframe);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {deflation.map((p) => (
            <StatCard
              key={p.key}
              title={`${p.name} Deflation`}
              value={formatPercent(p.pct)}
              valueClass=""
              dotColor={p.color}
              sub={`${formatNumber(p.equivalentUnits, 1)} equivalent units · ${formatCompact(p.tokensBurnt)} tokens`}
            />
          ))}
        </div>

        <Card>
          <SectionHeader
            title="Cumulative Token Supply Burnt Over Time (%)"
            subtitle="Normalized comparison of permanent supply removal across all protocols."
          >
            <Switcher options={M.TIMEFRAMES} value={burnTimeframe} onChange={setBurnTimeframe} />
          </SectionHeader>
          <div className="h-[350px] w-full relative">
            {sliced.labels.length > 0 ? (
              <Line
                data={{
                  labels: sliced.labels,
                  datasets: sliced.series.map((s) => ({
                    // Savi's ask: the current % next to the project name, at the top.
                    label: M.labelWithCurrent(`${s.name} Burnt`, s.data, (v) => formatPercent(v)),
                    data: s.data,
                    borderColor: s.color,
                    backgroundColor: s.color,
                    borderWidth: 2, tension: 0.3, pointRadius: 3, spanGaps: true,
                  })),
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
    const rows = M.ecosystemActivation(data);
    const totalActive = rows.reduce((sum, r) => sum + r.activeCount, 0);
    const withUnits = rows.filter((r) => r.activeCount > 0);

    const aligned = M.alignSeries(projects.map(({ key, name, color, project }) => {
      const history = M.activationHistory(project);
      return { key, name, color, labels: history.labels, data: history.net };
    }));
    const sliced = M.sliceTimeframe(aligned.labels, aligned.series, activationTimeframe);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {rows.map((r) => (
            <StatCard
              key={r.key}
              title={`${r.name} Active`}
              value={formatNumber(r.activeCount)}
              dotColor={r.color}
              sub={r.underConstruction ? 'Under construction' : `${formatPercent(r.percentActivated)} of supply`}
            />
          ))}
        </div>

        <Card>
          <h2 className="text-xl font-bold text-white mb-6">Ecosystem Dominance (Share of Total Active Units)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="h-[250px] relative">
              {withUnits.length > 0 ? (
                <Doughnut
                  data={{
                    labels: withUnits.map((r) => r.name),
                    datasets: [{
                      data: withUnits.map((r) => r.activeCount),
                      backgroundColor: withUnits.map((r) => r.color),
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
                            const pct = totalActive > 0 ? (ctx.raw / totalActive) * 100 : 0;
                            return `${ctx.label}: ${formatNumber(ctx.raw)} (${formatPercent(pct, 1)})`;
                          },
                        },
                      },
                    },
                  }}
                />
              ) : (
                <EmptyChart message="No units activated across the ecosystem yet." />
              )}
            </div>
            <div className="space-y-3">
              {rows.map((r) => (
                <LegendRow
                  key={r.key}
                  color={r.color}
                  name={r.name}
                  value={`${formatNumber(r.activeCount)}${totalActive > 0 ? `  ·  ${formatPercent((r.activeCount / totalActive) * 100, 1)}` : ''}`}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Network Growth Over Time (Net Active Units)" subtitle="Net of deactivations, per protocol.">
            <Switcher options={M.TIMEFRAMES} value={activationTimeframe} onChange={setActivationTimeframe} />
          </SectionHeader>
          <div className="h-[350px] w-full relative">
            {sliced.labels.length > 0 ? (
              <Line
                data={{
                  labels: sliced.labels,
                  datasets: sliced.series.map((s) => ({
                    label: M.labelWithCurrent(s.name, s.data, (v) => formatNumber(v)),
                    data: s.data,
                    borderColor: s.color,
                    backgroundColor: s.color,
                    borderWidth: 2, tension: 0.3, pointRadius: 2, spanGaps: true,
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
    const rows = M.ecosystemOwnership(data);
    const totalNftHolders = rows.reduce((sum, r) => sum + r.nftHolders, 0);
    const totalTokenHolders = rows.reduce((sum, r) => sum + r.tokenHolders, 0);
    const totalCirculating = rows.reduce((sum, r) => sum + r.circulatingNftSupply, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Unique NFT Holders" value={formatNumber(totalNftHolders)} valueClass="text-purple-400" sub="Summed across protocols (wallets may overlap)" />
          <StatCard title="Total Unique Token Holders" value={formatNumber(totalTokenHolders)} valueClass="text-emerald-400" sub="Summed across protocols (wallets may overlap)" />
          <StatCard title="Total Circulating NFTs" value={formatNumber(totalCirculating)} valueClass="text-blue-400" sub="Excludes AMM vault inventory and burnt units" />
        </div>

        <Card>
          <h2 className="text-xl font-bold text-white mb-6">Holders vs. Circulating Supply by Protocol</h2>
          <div className="h-[400px] w-full relative">
            <Bar
              data={{
                labels: rows.map((r) => r.name),
                datasets: [
                  { label: 'Unique NFT Holders', data: rows.map((r) => r.nftHolders), backgroundColor: '#a855f7', borderRadius: 4 },
                  { label: 'Circulating NFTs', data: rows.map((r) => r.circulatingNftSupply), backgroundColor: '#3b82f6', borderRadius: 4 },
                  { label: 'AMM Vault Inventory', data: rows.map((r) => r.ammVaultNfts), backgroundColor: '#475569', borderRadius: 4 },
                ],
              }}
              options={baseOptions(null, (v) => `${formatNumber(v)} units`)}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-white mb-4">Ownership Detail</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="text-slate-400 border-b border-[#334155] text-xs uppercase tracking-wider">
                  <th className="pb-3 pl-2">Protocol</th>
                  <th className="pb-3 text-right">NFT Holders</th>
                  <th className="pb-3 text-right">Token Holders</th>
                  <th className="pb-3 text-right">Circulating</th>
                  <th className="pb-3 text-right pr-2">Concentration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#334155]/40 text-slate-200">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-[#334155]/20">
                    <td className="py-3 pl-2 font-bold text-white">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    </td>
                    <td className="py-3 text-right">{formatNumber(r.nftHolders)}</td>
                    <td className="py-3 text-right">{formatNumber(r.tokenHolders)}</td>
                    <td className="py-3 text-right">{formatNumber(r.circulatingNftSupply)}</td>
                    <td className={`py-3 text-right pr-2 font-bold ${r.ownershipRatio > 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {formatPercent(r.ownershipRatio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.some((r) => r.ownershipRatio > 100) && (
            <p className="text-xs text-amber-200/80 mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
              <span className="font-bold text-amber-300">⚠ Note:</span> a concentration above 100% means the
              indexed holder count exceeds circulating supply, which cannot be true. The two figures are
              derived from different sources — flagged rather than hidden.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return null;
}
