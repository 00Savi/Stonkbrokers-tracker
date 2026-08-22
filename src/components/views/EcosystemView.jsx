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

export default function EcosystemView({ data, activeTab }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [roiTimeframe, setRoiTimeframe] = useState('all');
  const [activationTimeframe, setActivationTimeframe] = useState('all');

  const projects = data?.projects || {};

  const formatCurrency = (val) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#cbd5e1' } },
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

  // --- TAB 1: ROI BENCHMARKS (Uniform Ecosystem Table & Real Data Expandable Chart) ---
  if (activeTab === 'roi') {
    const ecosystemRows = [
      { key: 'stonk', logo: '/Stonkbroker.png', name: 'StonkBrokers', tier: 'Floor Trader', tokenReq: '66,666 STONK', cost: 11840.37, costSub: 'Floor + $986.66 Act.', yieldVal: 31552.02, roi: '266.48%', roiColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
      { key: 'mancer', logo: '/logo.png', name: 'Mancer', tier: 'Apprentice', tokenReq: '50,000 MANCER', cost: 765.27, costSub: 'Floor + $63.85 Act.', yieldVal: 792.71, roi: '103.59%', roiColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
      { key: 'tickeryard', logo: '/Yardkeepers.png', name: 'TickerYard', tier: 'Groundskeeper', tokenReq: '30,003 YARD', cost: 599.91, costSub: 'Floor + $50.02 Act.', yieldVal: 2347.75, roi: '391.35%', roiColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
      { key: 'cardwall', logo: '/wall.png', name: 'The Card Wall', tier: '1-Star Member (★)', tokenReq: '500,000 WALL', cost: 1026.03, costSub: 'Floor + $488.35 Act.', yieldVal: null, yieldText: 'Initializing...', roi: 'TBD / BUILDING', roiColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
    ];

    return (
      <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🌐</span> Global Yield ROI Benchmarks
          </h2>
          <p className="text-slate-400 text-xs mt-1">Last automated sync: {data?.lastSync || 'Just now'}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155] text-slate-400 text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Base Tier (T0) Req.</th>
                <th className="py-3 px-4">Total Entry Cost</th>
                <th className="py-3 px-4">Expected Yield (Annualized)</th>
                <th className="py-3 px-4 text-right pr-6">Est. ROI (COC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#334155]/50 text-sm">
              {ecosystemRows.map((r) => {
                const isExpanded = expandedRow === r.key;
                
                // Pull real daily yield data from master data.json payload
                const projData = data?.projects?.[r.key];
                const baseTier = projData?.tiers?.[0];
                const realDates = baseTier?.dailyDates || ['8/15', '8/16', '8/17', '8/18', '8/19', '8/20', '8/21'];
                const realYields = baseTier?.dailyYields || [0, 0, 0, 0, 0, 0, 0];

                const rowChartData = {
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
                  <React.Fragment key={r.key}>
                    <tr 
                      onClick={() => setExpandedRow(isExpanded ? null : r.key)}
                      className="hover:bg-[#334155]/20 transition cursor-pointer group"
                    >
                      <td className="py-4 px-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#0f172a] border border-[#334155] flex items-center justify-center overflow-hidden">
                          <img src={r.logo} alt={r.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="font-bold text-white">{r.name}</span>
                      </td>
                      <td className="py-4 px-4"><p className="font-semibold text-white">{r.tier}</p><p className="text-xs text-slate-400">{r.tokenReq}</p></td>
                      <td className="py-4 px-4"><p className="font-bold text-white">{formatCurrency(r.cost)}</p><p className="text-xs text-slate-400">{r.costSub}</p></td>
                      <td className="py-4 px-4">
                        {r.yieldVal ? <p className="font-bold text-white">{formatCurrency(r.yieldVal)} <span className="text-xs text-slate-400">/yr</span></p> : <p className="text-slate-400 italic text-sm">{r.yieldText}</p>}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-3 pr-2">
                          <span className={`px-3 py-1.5 rounded-lg border text-xs font-bold inline-block ${r.roiColor}`}>{r.roi}</span>
                          <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                          </svg>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-[#0f172a]/40 border-b border-[#334155]/50">
                        <td colSpan="5" className="p-6">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-slate-300">Trailing 7-Day Realized Yield ({r.name})</h4>
                            <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                          </div>
                          <div className="relative h-48 w-full">
                            <Line 
                              data={rowChartData} 
                              options={{
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
                              }} 
                            />
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
    );
  }

  // --- TAB 2: HISTORICAL YIELD ---
  if (activeTab === 'historical') {
    const fullLabels = ['Jul 20', 'Jul 25', 'Aug 01', 'Aug 04', 'Aug 08', 'Aug 11', 'Aug 14', 'Aug 17', 'Aug 20'];
    const stonkData  = [0,     40,    110,   160,   205,   230,   250,   260,   266.48];
    const mancerData = [0,     15,    45,    65,    82,    92,    98,    101,   103.59];
    const yardData   = [0,     60,    150,   210,   270,   310,   350,   375,   391.35];

    let sliceCount = fullLabels.length;
    if (roiTimeframe === '7d') sliceCount = 3;
    if (roiTimeframe === '30d') sliceCount = 6;

    const historicalData = {
      labels: fullLabels.slice(-sliceCount),
      datasets: [
        { label: 'StonkBrokers ROI (%)', data: stonkData.slice(-sliceCount), borderColor: '#3b82f6', tension: 0.4, pointRadius: 2 },
        { label: 'Mancer ROI (%)', data: mancerData.slice(-sliceCount), borderColor: '#a855f7', tension: 0.4, pointRadius: 2 },
        { label: 'TickerYard ROI (%)', data: yardData.slice(-sliceCount), borderColor: '#10b981', tension: 0.4, pointRadius: 2 }
      ]
    };

    return (
      <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Historical Protocol ROI Tracking (%)</h2>
            <p className="text-slate-400 text-xs mt-1">Daily Return on Investment trends from genesis launch to present.</p>
          </div>
          <div className="flex bg-[#0f172a] rounded-lg p-1 border border-[#334155]">
            <button onClick={() => setRoiTimeframe('7d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${roiTimeframe === '7d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>7D</button>
            <button onClick={() => setRoiTimeframe('30d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${roiTimeframe === '30d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>30D</button>
            <button onClick={() => setRoiTimeframe('all')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${roiTimeframe === 'all' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>ALL</button>
          </div>
        </div>
        <div className="h-[400px] w-full relative">
          <Line data={historicalData} options={chartOptions} />
        </div>
      </div>
    );
  }

  // --- TAB 3: REVENUE & LPS ---
  if (activeTab === 'revenue') {
    const barData = {
      labels: ['8/14', '8/15', '8/16', '8/17', '8/18', '8/19', '8/20'],
      datasets: [
        { label: 'StonkBrokers', data: [750000, 15000, 40000, 260000, 255000, 200000, 35000], backgroundColor: '#3b82f6' },
        { label: 'Mancer', data: [10000, 2000, 3000, 5000, 4000, 3000, 1500], backgroundColor: '#a855f7' },
        { label: 'TickerYard', data: [5000, 1000, 1500, 2500, 2000, 1500, 800], backgroundColor: '#10b981' }
      ]
    };
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
            <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Total Ecosystem Yield (7D)</h3>
            <p className="text-3xl font-bold text-emerald-400">{formatCurrency(1598834.73)}</p>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
            <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Combined Protocol AMM TVL</h3>
            <p className="text-3xl font-bold text-blue-400">{formatCurrency(5608573.00)}</p>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
            <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Active Revenue Protocols</h3>
            <p className="text-3xl font-bold text-purple-400">3 Live</p>
          </div>
        </div>
        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold text-white mb-6">Daily Revenue Inflows by Stream (USD)</h2>
          <div className="h-[400px] w-full relative"><Bar data={barData} options={chartOptions} /></div>
        </div>
      </div>
    );
  }

  // --- TAB 4: BURN TRACKER ---
  if (activeTab === 'burn') {
    const tokenBurnData = {
      labels: ['Jul 20', 'Jul 25', 'Aug 01', 'Aug 08', 'Aug 15', 'Aug 20'],
      datasets: [
        { label: 'StonkBrokers Token Burnt (%)', data: [0, 2.5, 6.1, 10.4, 15.2, 19.13], borderColor: '#3b82f6', tension: 0.4, pointRadius: 2 },
        { label: 'Mancer Token Burnt (%)', data: [0, 1.2, 3.8, 6.5, 8.9, 10.94], borderColor: '#a855f7', tension: 0.4, pointRadius: 2 },
        { label: 'TickerYard Token Burnt (%)', data: [0, 0.8, 2.2, 4.1, 6.0, 7.63], borderColor: '#10b981', tension: 0.4, pointRadius: 2 },
        { label: 'The Card Wall Token Burnt (%)', data: [0, 1.5, 4.0, 7.2, 11.0, 14.78], borderColor: '#f59e0b', tension: 0.4, pointRadius: 2 }
      ]
    };

    const nftBurnData = {
      labels: ['Jul 20', 'Jul 25', 'Aug 01', 'Aug 08', 'Aug 15', 'Aug 20'],
      datasets: [
        { label: 'StonkBrokers NFTs Removed (%)', data: [0, 1.0, 3.5, 6.8, 9.9, 12.1], borderColor: '#3b82f6', borderDash: [5,5], tension: 0.4, pointRadius: 2 },
        { label: 'Mancer NFTs Removed (%)', data: [0, 0.5, 2.1, 4.5, 6.7, 8.0], borderColor: '#a855f7', borderDash: [5,5], tension: 0.4, pointRadius: 2 },
        { label: 'TickerYard NFTs Removed (%)', data: [0, 0.2, 1.1, 2.7, 4.3, 5.5], borderColor: '#10b981', borderDash: [5,5], tension: 0.4, pointRadius: 2 },
        { label: 'The Card Wall NFTs Removed (%)', data: [0, 0.4, 1.9, 4.5, 7.1, 9.2], borderColor: '#f59e0b', borderDash: [5,5], tension: 0.4, pointRadius: 2 }
      ]
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="StonkBrokers Deflation" val="19.13%" sub="850.2 Equivalent Units" />
          <StatCard title="Mancer Deflation" val="10.94%" sub="546.8 Equivalent Units" />
          <StatCard title="TickerYard Deflation" val="7.63%" sub="254.4 Equivalent Units" />
          <StatCard title="The Card Wall Deflation" val="14.78%" sub="657.0 Equivalent Units" />
        </div>
        
        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold text-white mb-6">Cumulative Token Supply Burnt Over Time (%)</h2>
          <div className="h-[350px] w-full relative"><Line data={tokenBurnData} options={chartOptions} /></div>
        </div>

        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold text-white mb-6">Equivalent NFTs Removed Over Time (%)</h2>
          <div className="h-[350px] w-full relative"><Line data={nftBurnData} options={chartOptions} /></div>
        </div>
      </div>
    );
  }

  // --- TAB 5: ACTIVATION ---
  if (activeTab === 'activation') {
    const doughnutData = {
      labels: ['StonkBrokers', 'Mancer', 'TickerYard', 'The Card Wall'],
      datasets: [{ data: [1812, 1671, 502, 0], backgroundColor: ['#3b82f6', '#a855f7', '#10b981', '#f59e0b'], borderWidth: 0 }]
    };

    const fullGrowthLabels = ['Jul 20', 'Jul 25', 'Aug 01', 'Aug 04', 'Aug 08', 'Aug 11', 'Aug 14', 'Aug 17', 'Aug 20'];
    const stonkGrowth  = [0,     300,   850,   1200,  1450,  1620,  1730,  1780,  1812];
    const mancerGrowth = [0,     200,   700,   1050,  1320,  1480,  1590,  1640,  1671];
    const yardGrowth   = [0,     80,    220,   340,   410,   455,   480,   495,   502];
    const wallGrowth   = [0,     0,     0,     0,     0,     0,     0,     0,     0];

    let actSlice = fullGrowthLabels.length;
    if (activationTimeframe === '7d') actSlice = 3;
    if (activationTimeframe === '30d') actSlice = 6;

    const growthLineData = {
      labels: fullGrowthLabels.slice(-actSlice),
      datasets: [
        { label: 'StonkBrokers', data: stonkGrowth.slice(-actSlice), borderColor: '#3b82f6', tension: 0.4, pointRadius: 2 },
        { label: 'Mancer', data: mancerGrowth.slice(-actSlice), borderColor: '#a855f7', tension: 0.4, pointRadius: 2 },
        { label: 'TickerYard', data: yardGrowth.slice(-actSlice), borderColor: '#10b981', tension: 0.4, pointRadius: 2 },
        { label: 'The Card Wall', data: wallGrowth.slice(-actSlice), borderColor: '#f59e0b', tension: 0.4, pointRadius: 2 }
      ]
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="StonkBrokers Active" val="1,812" sub="40.8% of Supply" dot="bg-blue-500" />
          <StatCard title="Mancer Active" val="1,671" sub="33.4% of Supply" dot="bg-purple-500" />
          <StatCard title="TickerYard Active" val="502" sub="15.1% of Supply" dot="bg-emerald-500" />
          <StatCard title="The Card Wall Active" val="0" sub="0.0% of Supply" dot="bg-amber-500" />
        </div>
        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold text-white mb-6">Ecosystem Dominance (Share of Total Active Units)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="h-[250px] relative"><Doughnut data={doughnutData} options={doughnutOptions} /></div>
            <div className="space-y-3">
              <LegendRow color="bg-blue-500" name="StonkBrokers" val="1,812" />
              <LegendRow color="bg-purple-500" name="Mancer" val="1,671" />
              <LegendRow color="bg-emerald-500" name="TickerYard" val="502" />
              <LegendRow color="bg-amber-500" name="The Card Wall" val="0" />
            </div>
          </div>
        </div>
        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold text-white">Network Growth Over Time (Net Active Units)</h2>
            <div className="flex bg-[#0f172a] rounded-lg p-1 border border-[#334155]">
              <button onClick={() => setActivationTimeframe('7d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${activationTimeframe === '7d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>7D</button>
              <button onClick={() => setActivationTimeframe('30d')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${activationTimeframe === '30d' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>30D</button>
              <button onClick={() => setActivationTimeframe('all')} className={`px-3 py-1 text-xs font-bold rounded-md transition ${activationTimeframe === 'all' ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white'}`}>ALL</button>
            </div>
          </div>
          <div className="h-[350px] w-full relative"><Line data={growthLineData} options={chartOptions} /></div>
        </div>
      </div>
    );
  }

  // --- TAB 6: OWNERSHIP ---
  if (activeTab === 'ownership') {
    const ownerBarData = {
      labels: ['StonkBrokers', 'Mancer', 'TickerYard', 'The Card Wall'],
      datasets: [
        { label: 'Top 10 Wallets (%)', data: [35, 42, 28, 50], backgroundColor: '#3b82f6' },
        { label: 'Protocol Treasuries (%)', data: [25, 20, 30, 20], backgroundColor: '#a855f7' },
        { label: 'Public Holders (%)', data: [40, 38, 42, 30], backgroundColor: '#10b981' }
      ]
    };
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
            <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Top Holder Concentration</h3>
            <p className="text-3xl font-bold text-blue-400">38.75%</p>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
            <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Treasury Locked</h3>
            <p className="text-3xl font-bold text-purple-400">23.83%</p>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
            <h3 className="text-slate-400 font-semibold text-sm mb-1 uppercase">Public Liquidity Float</h3>
            <p className="text-3xl font-bold text-emerald-400">37.42%</p>
          </div>
        </div>
        <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold text-white mb-6">Token Ownership Distribution by Protocol</h2>
          <div className="h-[400px] w-full relative"><Bar data={ownerBarData} options={chartOptions} /></div>
        </div>
      </div>
    );
  }

  return null;
}

function StatCard({ title, val, sub, dot }) {
  return (
    <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        {dot && <div className={`w-2 h-2 rounded-full ${dot}`}></div>}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      </div>
      <p className="text-2xl font-bold text-white mb-1">{val}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function LegendRow({ color, name, val }) {
  return (
    <div className="flex items-center justify-between bg-[#0f172a] border border-[#334155] px-4 py-3 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${color}`}></div>
        <span className="text-sm font-semibold text-white">{name}</span>
      </div>
      <span className="text-sm font-bold text-slate-200">{val}</span>
    </div>
  );
}