import React, { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ProjectDetailView({ projectKey, data, activeTab }) {
  const [expandedTier, setExpandedTier] = useState(null);
  const [histTimeframe, setHistTimeframe] = useState('all');
  const [burnTimeframe, setBurnTimeframe] = useState('all');
  const [lpTableOpen, setLpTableOpen] = useState(true);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');

  const project = data?.projects?.[projectKey];

  if (!project) {
    return (
      <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-12 text-center text-slate-400">
        <h3 className="text-lg font-bold text-white mb-2">Project Data Loading...</h3>
        <p className="text-sm">Please ensure '{projectKey}' exists in data.json.</p>
      </div>
    );
  }

  const config = project.config || {};
  const market = project.market || {};
  const tiers = project.tiers || [];
  const activation = project.activation || {};
  const ownership = project.ownership || {};
  const revenue = project.revenue || {};
  const lockedLp = project.lockedLp || null;

  const formatCurrency = (val) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  const formatNumber = (val, decimals = 0) => 
    new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val || 0);

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#cbd5e1' } },
      tooltip: { callbacks: { label: (ctx) => ctx.raw + (activeTab === 'historical' ? '%' : '') } }
    },
    scales: {
      y: { ticks: { color: '#cbd5e1' }, grid: { color: '#334155' } },
      x: { ticks: { color: '#cbd5e1' }, grid: { color: '#334155' } },
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#cbd5e1' } }
    }
  };

  return (
    <div className="space-y-6">
      {/* --- TAB 1: ROI BENCHMARKS --- */}
      {activeTab === 'roi' && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📊</span> {config.name || projectKey} Tier ROI Benchmarks
            </h3>
            <div className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-1.5 text-xs text-slate-300">
              Floor Entry Cost: <span className="text-white font-bold">{formatCurrency(floorCostUsd)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
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
                {tiers.map((t) => {
                  const actCost = t.reqTokens * market.tokenPriceUsd;
                  const totalCost = floorCostUsd + actCost;
                  const roi = totalCost > 0 ? (t.trackedAnnualYieldUsd / totalCost) * 100 : 0;
                  const isExpanded = expandedTier === t.tier;

                  const realDates = t.dailyDates || ['8/15', '8/16', '8/17', '8/18', '8/19', '8/20', '8/21'];
                  const realYields = t.dailyYields || [50, 20, 130, 45, 120, 115, 20];

                  const tierChartData = {
                    labels: realDates,
                    datasets: [{
                      label: 'Daily Yield (USD)',
                      data: realYields,
                      borderColor: '#3b82f6',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      borderWidth: 2,
                      fill: true,
                      tension: 0.4,
                      pointRadius: 4,
                      pointBackgroundColor: '#3b82f6'
                    }]
                  };

                  return (
                    <React.Fragment key={t.tier}>
                      <tr 
                        onClick={() => setExpandedTier(isExpanded ? null : t.tier)}
                        className="hover:bg-[#334155]/20 transition cursor-pointer group"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#0f172a] border border-[#334155] text-blue-400 px-2.5 py-1 rounded text-xs font-bold shadow-inner">{t.tier}</span>
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="text-xs text-slate-500">Weight: <span className="text-yellow-500 font-semibold">{t.weight}x</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-semibold text-white">{formatNumber(t.reqTokens)} ${config.ticker}</td>
                        <td className="py-4 px-4">
                          <div className="font-bold text-white">{formatCurrency(totalCost)}</div>
                          <div className="text-xs text-slate-500">Floor + {formatCurrency(actCost)} Act.</div>
                        </td>
                        <td className="py-4 px-4 font-bold text-white">
                          {formatCurrency(t.trackedAnnualYieldUsd)} <span className="text-slate-500 font-normal">/yr</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-3 pr-2">
                            <span className="px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-bold inline-block">
                              {roi.toFixed(2)}%
                            </span>
                            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#0f172a]/40 border-b border-[#334155]/50">
                          <td colSpan="5" className="p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">Trailing 7-Day Realized Yield ({t.name})</h4>
                              <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                            </div>
                            <div className="relative h-48 w-full">
                              <Line data={tierChartData} options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                  legend: { display: false },
                                  tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } }
                                },
                                scales: {
                                  x: { grid: { color: '#334155', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } },
                                  y: { grid: { color: '#334155', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: (v) => '$' + v } }
                                }
                              }} />
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
      )}

      {/* --- TAB 2: HISTORICAL YIELD --- */}
      {activeTab === 'historical' && (
        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">{config.name || projectKey} Historical ROI Tracking (%)</h2>
              <p className="text-slate-400 text-xs mt-1">Track capital recovery timelines and ROI trajectory over time.</p>
            </div>
            <div className="flex bg-[#0f172a] rounded-lg p-1 border border-[#334155]">
              <button onClick={() => setHistTimeframe('7d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${histTimeframe === '7d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>7D</button>
              <button onClick={() => setHistTimeframe('30d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${histTimeframe === '30d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>30D</button>
              <button onClick={() => setHistTimeframe('all')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${histTimeframe === 'all' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>ALL</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiers.map((t) => {
              const actCost = t.reqTokens * market.tokenPriceUsd;
              const totalCost = floorCostUsd + actCost;
              const years = t.trackedAnnualYieldUsd > 0 ? (totalCost / t.trackedAnnualYieldUsd).toFixed(1) + ' Years' : 'N/A';
              return (
                <div key={t.tier} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 shadow-inner">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{t.tier} Payback</p>
                  <p className="text-xl font-extrabold text-blue-400">{years}</p>
                </div>
              );
            })}
          </div>

          <div className="h-[380px] w-full relative bg-[#0f172a] border border-[#334155] rounded-xl p-4">
            <Line 
              data={{
                labels: ['Jul 20', 'Jul 25', 'Aug 01', 'Aug 08', 'Aug 15', 'Aug 20'],
                datasets: tiers.map((t, i) => ({
                  label: `${t.tier} ROI %`,
                  data: [0, 40, 110, 180, 230, t.trackedAnnualYieldUsd > 0 ? ((t.trackedAnnualYieldUsd / (floorCostUsd + (t.reqTokens * market.tokenPriceUsd))) * 100) : 100],
                  borderColor: ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa'][i % 5],
                  borderWidth: 2,
                  tension: 0.3,
                  pointRadius: 2
                }))
              }} 
              options={chartOptions} 
            />
          </div>
        </div>
      )}

      {/* --- TAB 3: REVENUE & LPS --- */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">AMM & SWAP PROTOCOL FEES (7D)</h3>
              <p className="text-3xl font-bold text-emerald-400">{formatCurrency(revenue.ammFeesUsd || 592320.83)}</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">CLOCK-IN SECURITY BOX (7D)</h3>
              <p className="text-3xl font-bold text-blue-400">{formatCurrency(revenue.securityBoxUsd || 8458.86)}</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">SAFE LAUNCHPAD DEPLOYMENTS (7D)</h3>
              <p className="text-3xl font-bold text-purple-400">{formatCurrency(revenue.launchpadUsd || 269813.18)}</p>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-xl">
            <h3 className="text-lg font-bold text-white mb-6">Daily Revenue Inflows by Stream (USD)</h3>
            <div className="h-[350px] w-full relative">
              <Bar 
                data={{
                  labels: ['8/15', '8/16', '8/17', '8/18', '8/19', '8/20', '8/21'],
                  datasets: [
                    { label: 'AMM & Swaps', data: [50000, 20000, 150000, 60000, 140000, 140000, 25000], backgroundColor: '#34d399', borderRadius: 4 },
                    { label: 'Clock-In Box', data: [2000, 1000, 3000, 1500, 4000, 3000, 1000], backgroundColor: '#60a5fa', borderRadius: 4 },
                    { label: 'Safe Launchpad', data: [5000, 2000, 75000, 28000, 110000, 44000, 8000], backgroundColor: '#a78bfa', borderRadius: 4 }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: { stacked: true, grid: { color: '#334155', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } },
                    y: { stacked: true, grid: { color: '#334155', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: v => '$' + v } }
                  },
                  plugins: { legend: { display: true, position: 'top', labels: { color: '#cbd5e1' } } }
                }}
              />
            </div>
          </div>

          {projectKey === 'stonk' && lockedLp && (
            <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
                    "Black Hole" Liquidity: Tokens Locked in Pools
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Scanned from active partner and meme trading pairs.</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold text-orange-400">{formatNumber(lockedLp.totalStonkLocked || 189783686)} {config.ticker}</p>
                  <button onClick={() => setLpTableOpen(!lpTableOpen)} className="mt-1 text-[10px] bg-[#0f172a] border border-[#334155] text-slate-300 px-3 py-1 rounded hover:text-white transition">
                    {lpTableOpen ? 'Hide Pools ▲' : 'Show Pools ▼'}
                  </button>
                </div>
              </div>
              {lpTableOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-400 border-b border-[#334155]">
                        <th className="pb-2 pl-2">Trading Pair</th>
                        <th className="pb-2">DEX Venue</th>
                        <th className="pb-2 text-right">Tokens Locked</th>
                        <th className="pb-2 text-right pr-2">Total Pool Liquidity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155]/40 text-slate-200">
                      {(lockedLp.pools || [
                        { pairName: 'STONKBROKER/ETH', dex: 'uniswap', stonkAmount: 106897058, liquidityUsd: 3277464 },
                        { pairName: 'STONKBROKER/YARD', dex: 'up', stonkAmount: 15367579, liquidityUsd: 471170 },
                        { pairName: 'STONKBROKER/WETH', dex: 'uniswap', stonkAmount: 11551475, liquidityUsd: 354168 }
                      ]).map((p, i) => (
                        <tr key={i} className="hover:bg-[#334155]/20">
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
            </div>
          )}
        </div>
      )}

      {/* --- TAB 4: BURN TRACKER --- */}
      {activeTab === 'burn' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Total ${config.ticker || 'TOKEN'} Burnt</h3>
              <p className="text-3xl font-extrabold text-orange-400">567,210,014 {config.ticker}</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Equivalent Units Removed</h3>
              <p className="text-3xl font-extrabold text-blue-400">850.82 Units</p>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Cumulative Token Burn Over Time</h3>
              <div className="flex bg-[#0f172a] rounded-lg p-1 border border-[#334155]">
                <button onClick={() => setBurnTimeframe('7d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${burnTimeframe === '7d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>7D</button>
                <button onClick={() => setBurnTimeframe('30d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${burnTimeframe === '30d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>30D</button>
                <button onClick={() => setBurnTimeframe('all')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${burnTimeframe === 'all' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>ALL TIME</button>
              </div>
            </div>
            <div className="h-[350px] w-full relative">
              <Line 
                data={{
                  labels: ['Jul 18', 'Jul 21', 'Jul 24', 'Jul 27', 'Jul 30', 'Aug 02', 'Aug 05', 'Aug 08', 'Aug 11', 'Aug 14', 'Aug 17', 'Aug 20'],
                  datasets: [{
                    label: 'Cumulative Burnt',
                    data: [280000000, 380000000, 430000000, 450000000, 470000000, 485000000, 495000000, 505000000, 520000000, 530000000, 550000000, 567210014],
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true,
                    tension: 0.3
                  }]}
                }
                options={chartOptions}
              />
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 5: ACTIVATION --- */}
      {activeTab === 'activation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Activated Supply Ratio</h3>
              <p className="text-3xl font-bold text-emerald-400">{(activation.percentActivated || 40.77).toFixed(2)}%</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
              <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Total Active Units</h3>
              <p className="text-3xl font-bold text-blue-400">{formatNumber(activation.activeCount || 1812)} Units</p>
            </div>
          </div>

          {/* --- NEW: TIER ACTIVATION FLOW (D/W/M/ALL) --- */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-4 mt-8">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tier Activation Flow</h3>
            <div className="flex bg-[#1e293b] rounded-lg p-1 border border-[#334155] w-full sm:w-auto">
              {[
                { id: '24h', label: 'D' },
                { id: '7d', label: 'W' },
                { id: '30d', label: 'M' },
                { id: 'allTime', label: 'ALL' }
              ].map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setTierTimeframe(tf.id)}
                  className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition ${
                    tierTimeframe === tf.id
                      ? 'bg-[#334155] text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            {['T0', 'T1', 'T2', 'T3', 'T4'].map((tierId, index) => {
              const tierInfo = tiers.find(t => t.tier === tierId) || { name: `Tier ${index}` };
              const tData = (activation.tierStats?.[tierId]?.[tierTimeframe]) || { act: 0, deact: 0 };
              const colors = ['bg-[#60a5fa]', 'bg-[#34d399]', 'bg-[#f472b6]', 'bg-[#fbbf24]', 'bg-[#a78bfa]'];

              return (
                <div key={tierId} className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2.5 h-2.5 rounded-sm ${colors[index]}`}></div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-300 font-bold truncate">
                      {tierId}: {tierInfo.name}
                    </p>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-lg font-bold text-emerald-400">{formatNumber(tData.act)}</p>
                      <p className="text-[9px] text-slate-500 uppercase">Act</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-rose-400">{formatNumber(tData.deact)}</p>
                      <p className="text-[9px] text-slate-500 uppercase">Deact</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* --- END TIER ACTIVATION FLOW --- */}

          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-xl">
            <h3 className="text-lg font-bold text-white mb-6">Active Units & Tier Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-[300px] relative">
                <Doughnut 
                  data={{
                    labels: tiers.map(t => t.name),
                    datasets: [{
                      data: tiers.map((_, i) => [1589, 201, 127, 70, 60][i] || 10),
                      backgroundColor: ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ef4444'],
                      borderWidth: 0
                    }]}
                  }
                  options={doughnutOptions}
                />
              </div>
              <div className="space-y-3">
                {tiers.map((t, idx) => {
                  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
                  const counts = [1589, 201, 127, 70, 60];
                  return (
                    <div key={t.tier} className="flex items-center justify-between bg-[#0f172a] border border-[#334155] px-4 py-3 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`}></div>
                        <span className="text-sm font-semibold text-white">{t.name}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-200">{formatNumber(counts[idx] || 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">Historical Activity (Net vs. Daily)</h3>
            <div className="h-[320px] w-full relative">
              <Line 
                data={{
                  labels: ['Aug 14', 'Aug 15', 'Aug 16', 'Aug 17', 'Aug 18', 'Aug 19', 'Aug 20'],
                  datasets: [{
                    label: 'Net Active Units',
                    data: [1750, 1770, 1785, 1795, 1802, 1808, 1812],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.3
                  }]}
                }
                options={chartOptions}
              />
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 6: OWNERSHIP --- */}
      {activeTab === 'ownership' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
              <p className="text-xs uppercase text-slate-400 mb-1">Current Max Supply</p>
              <p className="text-2xl font-extrabold text-white">{formatNumber(ownership.currentMaxSupply || 3594, 2)} Units</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
              <p className="text-xs uppercase text-slate-400 mb-1">Permanently Burnt</p>
              <p className="text-2xl font-extrabold text-orange-400">850.82 Units</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
              <p className="text-xs uppercase text-slate-400 mb-1">AMM Vault Inventory</p>
              <p className="text-2xl font-extrabold text-slate-300">2,201 Units</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg border-b-4 border-b-blue-500">
              <p className="text-xs uppercase text-slate-400 mb-1">True Circulating NFTs</p>
              <p className="text-2xl font-extrabold text-blue-400">1,393 Units</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
              <p className="text-xs uppercase text-slate-400 mb-1">Unique NFT Holders</p>
              <p className="text-2xl font-extrabold text-purple-400">642 Wallets</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
              <p className="text-xs uppercase text-slate-400 mb-1">Ownership Concentration</p>
              <p className="text-2xl font-extrabold text-emerald-400">46.09%</p>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
              <p className="text-xs uppercase text-slate-400 mb-1">Unique ${config.ticker} Holders</p>
              <p className="text-2xl font-extrabold text-purple-400">997 Wallets</p>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">True Active Token Holders Over Time</h3>
            <div className="h-[350px] w-full relative">
              <Line 
                data={{
                  labels: ['8/14', '8/15', '8/16', '8/17', '8/18', '8/19', '8/20'],
                  datasets: [{
                    label: 'Active Holders',
                    data: [920, 935, 950, 968, 980, 990, 997],
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    fill: true,
                    tension: 0.3
                  }]}
                }
                options={chartOptions}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}