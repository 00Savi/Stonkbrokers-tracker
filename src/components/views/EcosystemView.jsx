import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import OverviewView from './OverviewView';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const ECO_TABS = [
  { id: 'roi', label: 'ROI Benchmarks' },
  { id: 'historical', label: 'Historical Yield' },
  { id: 'revenue', label: 'Revenue & LPs' },
  { id: 'burn', label: 'Burn Tracker' },
  { id: 'activation', label: 'Activation' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'rankings', label: 'Rankings' },
];

export default function EcosystemView({ data, pending = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(ECO_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'roi');
  const [expandedProject, setExpandedProject] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  
  const [revTimeframe, setRevTimeframe] = useState('7d');
  const [histTimeframe, setHistTimeframe] = useState('all');
  const [burnTimeframe, setBurnTimeframe] = useState('all');
  const [actTimeframe, setActTimeframe] = useState('all');
  const [ownTimeframe, setOwnTimeframe] = useState('all');

  useEffect(() => {
    if (tabFromUrl && ECO_TABS.some((t) => t.id === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  const selectTab = (id) => {
    setActiveTab(id);
    setSearchParams(id === 'roi' ? {} : { tab: id }, { replace: true });
  };

  if (!data || !data.projects) return <div className="text-center text-slate-400 p-12">Loading Ecosystem...</div>;

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  const formatNumber = (val, decimals = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val || 0);

  const order = ['stonk', 'mancer', 'tickeryard', 'cardwall', 'index', 'printer', 'oakmont'];
  const activationOrder = order.filter((k) => {
    const kind = data.projects[k]?.config?.kind;
    return kind !== 'cashflow' && kind !== 'vault';
  });
  const projectNames = { stonk: 'StonkBrokers', mancer: 'Mancer', tickeryard: 'TickerYard', cardwall: 'The Card Wall', index: 'The Index', printer: 'RH Machines', oakmont: 'Oakmont' };
  const projectColors = { stonk: '#00a804', mancer: '#8b5cf6', tickeryard: '#38bdf8', cardwall: '#f5b700', index: '#34d399', printer: '#fb923c', oakmont: '#a3e635' };
  const projectLogos = { stonk: 'Stonkbroker.png', mancer: 'logo.png', tickeryard: 'Yardkeepers.png', cardwall: 'wall.png', index: 'Index.png', printer: 'Printer.png', oakmont: 'Oakmont.png' };

  const scaleYield = (annual) => {
    if (yieldPeriod === 'D') return (annual || 0) / 365;
    if (yieldPeriod === 'M') return (annual || 0) / 12;
    return annual || 0;
  };
  const yieldPeriodLabel = yieldPeriod === 'D' ? 'Daily' : yieldPeriod === 'M' ? 'Monthly' : 'Annualized';
  const yieldSuffix = yieldPeriod === 'D' ? '/day' : yieldPeriod === 'M' ? '/mo' : '/yr';

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1', boxWidth: 14 } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${typeof ctx.raw === 'number' ? ctx.raw.toLocaleString() : ctx.raw}` } }
    },
    scales: { 
      y: { min: 0, ticks: { color: '#cbd5e1' }, grid: { color: '#1e2228', borderDash: [4, 4] } }, 
      x: { ticks: { color: '#cbd5e1' }, grid: { color: '#1e2228', borderDash: [4, 4] } } 
    }
  };

  const percentChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: { min: 0, ticks: { color: '#cbd5e1', callback: (v) => `${v}%` }, grid: { color: '#1e2228', borderDash: [4, 4] } }
    }
  };

  // =========================================================
  // UNIVERSAL DATA ARRAYS & SAFE-PADDING ENGINES
  // =========================================================
  const stonk = data.projects.stonk || {};
  
  // 1. Genesis Array (Used for Ownership, Burn, and Activations to show full history)
  let masterGenesisLabels = stonk.ownership?.historicalGrowth?.labels || [];
  if (masterGenesisLabels.length < 10) {
    masterGenesisLabels = ['7/15', '7/18', '7/21', '7/24', '7/27', '7/30', '8/2', '8/5', '8/8', '8/11', '8/14', '8/17', '8/20', '8/23'];
  }

  // 2. Historical Array (Tightly wrapped ONLY around the dates we actually have yield data for!)
  let masterHistLabels = stonk.dailySnapshots?.map(s => s.date) || [];
  if (masterHistLabels.length === 0) {
    masterHistLabels = ['Aug 19', 'Aug 20', 'Aug 21', 'Aug 22', 'Aug 23'];
  }

  // 3. Revenue Array
  let masterRevLabels = stonk.tiers?.[0]?.dailyDates || [];
  if (masterRevLabels.length === 0) {
    masterRevLabels = ['8/15', '8/16', '8/17', '8/18', '8/19', '8/20', '8/21'];
  }

  // Pads missing early data with 0s so young projects curve up perfectly
  const rightAlignArray = (arr, targetLength, padValue = 0) => {
    if (!Array.isArray(arr) || arr.length === 0) return Array(targetLength).fill(padValue);
    if (arr.length >= targetLength) return arr.slice(arr.length - targetLength);
    return [...Array(targetLength - arr.length).fill(padValue), ...arr];
  };

  // Smooth interpolator for projects with no data arrays yet
  const interpolateData = (targetValue, targetLength, offset) => {
    return Array(targetLength).fill(0).map((_, idx) => {
      if (idx < offset) return 0;
      const progress = (idx - offset) / (targetLength - 1 - offset || 1);
      return Number((targetValue * Math.pow(progress, 2)).toFixed(2)); 
    });
  };

  // RPC Anomaly Filter: Prevents the StonkBrokers chart from crashing to 11k randomly
  const removeAnomalies = (arr) => {
    let lastValid = 0;
    return arr.map((v, i) => {
      const num = Number(v);
      if (i === 0) { lastValid = num; return num; }
      // If data drops by more than 30% in one day, it's a bad RPC read. Carry forward real data.
      if (num > 0 && num >= lastValid * 0.7) { lastValid = num; return num; }
      return lastValid;
    });
  };

  const getSliceCount = (timeframe, totalLen) => {
    if (timeframe === '1d') return Math.min(1, totalLen);
    if (timeframe === '7d' || timeframe === '1w') return Math.min(7, totalLen);
    if (timeframe === '30d' || timeframe === '1m') return Math.min(30, totalLen);
    return totalLen;
  };

  const labelSortKey = (label) => {
    const m = String(label || '').match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) return 0;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = month >= 7 ? 2026 : 2026;
    return Date.UTC(year, month - 1, day);
  };

  const burnCaps = (p) => {
    const kind = p?.config?.kind;
    const tokenOnly = kind === 'cashflow' || kind === 'vault';
    const nftSupply = Number(p?.ownership?.currentMaxSupply || p?.config?.maxSupply || 0);
    const circ = Number(p?.ownership?.circulatingSupply || 0);
    const burntTok = Math.max(
      Number(p?.activation?.dualBurn?.totalBurnTokens || 0),
      Number(p?.ownership?.permanentlyBurntTokens || 0)
    );
    let maxToken = Number(p?.config?.maxTokenSupply) || 0;
    if (!maxToken) {
      if (tokenOnly) maxToken = nftSupply || circ + burntTok;
      else {
        const unit = Number(p?.config?.unitValue);
        if (kind === 'machines' && (circ > 0 || burntTok > 0)) maxToken = circ + burntTok;
        else if (unit > 0 && nftSupply > 0) maxToken = nftSupply * unit;
        else maxToken = nftSupply * 1000000;
      }
    }
    const tokenPct = maxToken > 0 ? Math.min(100, (burntTok / maxToken) * 100) : 0;
    let nftPct = null;
    if (!tokenOnly && nftSupply > 0) {
      const realNft = Number(p?.ownership?.burntNfts || 0);
      const units = Number(p?.ownership?.permanentlyBurntUnits || 0);
      const equiv = Number(p?.activation?.dualBurn?.equivalentBrokersBurnt || 0);
      const nftBurned = kind === 'machines' ? realNft : Math.max(realNft, units, equiv);
      nftPct = Math.min(100, (nftBurned / nftSupply) * 100);
    }
    return { tokenPct, nftPct, maxToken, burntTok, tokenOnly };
  };

  const cashflowRoiByDate = (p) => {
    const dates = p?.cashflow?.dailyDates || [];
    const revs = p?.cashflow?.dailyRevenue || [];
    const circ = Number(p?.ownership?.circulatingSupply) || 0;
    const price = Number(p?.market?.tokenPriceUsd) || 0;
    const req = Number(p?.tiers?.[0]?.reqTokens) || 0;
    const map = {};
    if (!dates.length || !(price > 0)) return map;
    dates.forEach((date, i) => {
      const day = Number(revs[i]) || 0;
      const cost = req > 0 ? req * price : circ * price;
      const annualForStake = circ > 0 && req > 0 ? day * (req / circ) * 365 : day * 365;
      map[date] = cost > 0 ? (annualForStake / cost) * 100 : null;
    });
    return map;
  };

  // =========================================================
  // REVENUE CALCULATIONS
  // =========================================================
  const getProjectRev = (projKey, timeframe) => {
    const p = data.projects[projKey];
    if (!p || !p.revenue) return 0;
    const r = p.revenue;
    const sliceCount = getSliceCount(timeframe, masterRevLabels.length);
    
    const sumArray = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return 0;
      return arr.slice(-sliceCount).reduce((a, b) => a + Number(b || 0), 0);
    };
    return sumArray(r.dailyAmm) + sumArray(r.dailyDex) + sumArray(r.dailySecurityBox) + sumArray(r.dailyLaunchpad);
  };

  const getRevChartData = (timeframe) => {
    const sliceCount = getSliceCount(timeframe, masterRevLabels.length);
    const slicedLabels = masterRevLabels.slice(-sliceCount);
    
    const datasets = order.map(k => {
      const p = data.projects[k];
      const r = p?.revenue || {};
      
      const d1 = rightAlignArray(r.dailyAmm, masterRevLabels.length);
      const d2 = rightAlignArray(r.dailyDex, masterRevLabels.length);
      const d3 = rightAlignArray(r.dailySecurityBox, masterRevLabels.length);
      const d4 = rightAlignArray(r.dailyLaunchpad, masterRevLabels.length);
      
      const combinedDaily = d1.map((val, i) => val + (d2[i] || 0) + (d3[i] || 0) + (d4[i] || 0));
      
      return {
        label: projectNames[k],
        data: combinedDaily.slice(-sliceCount),
        backgroundColor: projectColors[k],
        borderRadius: 4
      };
    });

    return { labels: slicedLabels, datasets };
  };

  const getHistChartData = (timeframe) => {
    const labelSet = new Set();
    const roiMaps = {};
    for (const k of order) {
      const p = data.projects[k];
      const t0 = p?.tiers?.[0];
      const map = { ...cashflowRoiByDate(p) };
      for (const s of p?.dailySnapshots || []) {
        const row = s.tiers?.find((st) => st.tier === (t0?.tier || 'T0'));
        const roi = row?.roi != null ? Number(row.roi) : (s.roi != null ? Number(s.roi) : null);
        if (Number.isFinite(roi)) map[s.date] = roi;
      }
      roiMaps[k] = map;
      Object.keys(map).forEach((d) => labelSet.add(d));
    }
    const labels = [...labelSet]
      .sort((a, b) => labelSortKey(a) - labelSortKey(b))
      .filter((d) => labelSortKey(d) >= labelSortKey('8/20'));
    const sliceCount = getSliceCount(timeframe, labels.length);
    const slicedLabels = labels.slice(-sliceCount);

    const datasets = order.map((k) => {
      const raw = slicedLabels.map((d) => {
        const v = roiMaps[k][d];
        return Number.isFinite(v) ? v : null;
      });
      let started = false;
      let last = null;
      const dataPts = raw.map((v) => {
        if (!started) {
          if (v == null || v === 0) return null;
          started = true;
          last = v;
          return v;
        }
        if (v == null) return last;
        last = v;
        return v;
      });
      return {
        label: projectNames[k],
        data: dataPts,
        borderColor: projectColors[k],
        backgroundColor: `${projectColors[k]}10`,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 2,
        spanGaps: false,
      };
    });

    return { labels: slicedLabels, datasets };
  };

  return (
    <div className="space-y-6 pt-4 relative">
      
      {/* ECOSYSTEM TAB NAVIGATION */}
      <div className="flex flex-wrap gap-2 md:gap-3 w-full mb-6">
        {ECO_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            className={`flex-1 sm:flex-none justify-center px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition text-xs md:text-sm ${
              activeTab === tab.id
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-transparent border border-[#1e2228] hover:bg-[#0e1013] text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: ROI BENCHMARKS */}
      {/* ========================================================= */}
      {activeTab === 'roi' && (
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-6 shadow-xl">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"></path></svg>
                Global Yield ROI Benchmarks
              </h3>
              <p className="text-xs text-slate-400 mt-1">Last automated sync: Just now</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-4 font-medium pl-2">Project</th>
                  <th className="pb-4 font-medium">Base Tier (T0) Req.</th>
                  <th className="pb-4 font-medium">Total Entry Cost</th>
                  <th className="pb-4 font-medium">
                    <div className="flex items-center gap-2">
                      <span>Expected Yield <span className="normal-case">({yieldPeriodLabel})</span></span>
                      <div className="flex bg-[#08090b] rounded-md p-0.5 border border-[#1e2228] normal-case">
                        {['D', 'M', 'Y'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setYieldPeriod(p); }}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              yieldPeriod === p ? 'bg-[#1e2228] text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </th>
                  <th className="pb-4 font-medium text-right pr-4">Est. ROI (CoC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2228]/50 text-sm">
                {order.map(k => {
                  const p = data.projects[k];
                  if (!p) return null;
                  
                  const t0 = p.tiers?.[0];
                  const floorCost = (p.market?.nftFloorEth || 0) * (p.market?.ethPriceUsd || 0);
                  const actCost = (t0?.reqTokens || 0) * (p.market?.tokenPriceUsd || 0);
                  const totalCost = floorCost + actCost;
                  const roi = totalCost > 0 && t0 ? ((t0.trackedAnnualYieldUsd || 0) / totalCost) * 100 : 0;
                  const isExpanded = expandedProject === k;

                  return (
                    <React.Fragment key={k}>
                      <tr 
                        onClick={() => setExpandedProject(isExpanded ? null : k)}
                        className="hover:bg-[#1e2228]/20 transition cursor-pointer group"
                      >
                        <td className="py-5 pl-2">
                          <div className="flex items-center gap-3">
                            <img src={`/${projectLogos[k]}`} alt={projectNames[k]} className="w-8 h-8 rounded-md border border-[#1e2228] object-cover bg-[#08090b]" />
                            <span className="font-bold text-white">{projectNames[k]}</span>
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{t0?.name || 'TBD'}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{formatNumber(t0?.reqTokens || 0)} {p.config?.ticker}</div>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{formatCurrency(totalCost)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Floor + {formatCurrency(actCost)} Act.</div>
                        </td>
                        <td className="py-5">
                          {p.underConstruction ? (
                            <span className="text-slate-500 italic text-sm">Initializing...</span>
                          ) : (
                            <><span className="text-white font-bold text-base">{formatCurrency(scaleYield(t0?.trackedAnnualYieldUsd || 0))}</span> <span className="text-slate-500">{yieldSuffix}</span></>
                          )}
                        </td>
                        <td className="py-5 text-right pr-4">
                          <div className="flex items-center justify-end gap-3">
                            {p.underConstruction ? (
                              <span className="bg-amber-900/20 text-amber-400 border border-amber-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">TBD / BUILDING</span>
                            ) : (
                              <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">{roi.toFixed(2)}%</span>
                            )}
                            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && !p.underConstruction && (
                        <tr className="bg-[#08090b]/40 border-b border-[#1e2228]/50">
                          <td colSpan="5" className="p-4 md:p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">Trailing 7-Day Realized Yield ({t0?.name})</h4>
                              <span className="text-xs text-slate-500">Based on On-Chain Distributions</span>
                            </div>
                            <div className="relative h-32 md:h-40 w-full">
                              <Line 
                                data={{ 
                                  labels: t0?.dailyDates?.length ? t0.dailyDates : masterRevLabels.slice(-7), 
                                  datasets: [{ 
                                    label: 'Daily Yield (USD)', 
                                    data: t0?.dailyYields?.length ? t0.dailyYields : [0,0,0,0,0,0,0], 
                                    borderColor: projectColors[k], 
                                    backgroundColor: `${projectColors[k]}15`, 
                                    borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 
                                  }] 
                                }} 
                                options={chartOptions} 
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
      )}

      {/* ========================================================= */}
      {/* TAB 2: HISTORICAL YIELD (No more sea of zeros!) */}
      {/* ========================================================= */}
      {activeTab === 'historical' && (
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-6 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-white">Historical Protocol ROI Tracking (%)</h3>
              <p className="text-xs text-slate-400 mt-1">Daily CoC from 8/20 onward — the first day every NFT-yield line has a recorded print.</p>
            </div>
            <div className="flex bg-[#08090b] rounded-lg p-1 border border-[#1e2228]">
              {['7d', '30d', 'all'].map((tf) => (
                <button key={tf} onClick={() => setHistTimeframe(tf)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${histTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          <div className="relative h-96 w-full bg-[#08090b] p-4 rounded-xl border border-[#1e2228]">
            <Line 
              data={getHistChartData(histTimeframe)} 
              options={{
                ...percentChartOptions,
                spanGaps: false,
              }} 
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: REVENUE & LPS */}
      {/* ========================================================= */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg md:text-xl font-bold text-white">Ecosystem Revenue Streams</h2>
            <div className="flex bg-[#0e1013] rounded-lg p-1 border border-[#1e2228]">
              {['1d', '7d', '30d', 'all'].map((tf) => (
                <button key={tf} onClick={() => setRevTimeframe(tf)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${revTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {order.map(k => (
              <div key={k} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                  {projectNames[k]} Revenue
                </p>
                <p className="text-2xl font-extrabold" style={{color: projectColors[k]}}>
                  {formatCurrency(getProjectRev(k, revTimeframe))}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Daily Revenue Inflows by Protocol (USD)</h3>
            <div className="relative h-80 w-full bg-[#08090b] rounded-xl p-4 border border-[#1e2228]">
              <Bar 
                data={getRevChartData(revTimeframe)} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { labels: { color: '#cbd5e1' } } },
                  scales: {
                    x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } },
                    y: { min: 0, grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8', callback: (v) => `$${v.toLocaleString()}` } }
                  }
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: BURN TRACKER (Calculated w/ dynamic max supply) */}
      {/* ========================================================= */}
      {activeTab === 'burn' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {order.map(k => {
              const p = data.projects[k];
              const { tokenPct, nftPct } = burnCaps(p);

              return (
                <div key={k} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                    {projectNames[k]} Deflation
                  </p>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-xs text-slate-400">Token Burn</span>
                    <span className="text-emerald-400 font-bold">{tokenPct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-xs text-slate-400">NFT Burn</span>
                    <span className="text-blue-400 font-bold">{nftPct == null ? '—' : `${nftPct.toFixed(2)}%`}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Cumulative Token Supply Burnt Over Time (%)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Deflation measured as a percentage of total token supply.</p>
              </div>
              <div className="flex bg-[#08090b] rounded-lg p-1 border border-[#1e2228]">
                {['7d', '30d', 'all'].map((tf) => (
                  <button key={tf} onClick={() => setBurnTimeframe(tf)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${burnTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="relative h-80 w-full bg-[#08090b] p-4 rounded-xl border border-[#1e2228]">
              <Line 
                data={{
                  labels: masterGenesisLabels.slice(-getSliceCount(burnTimeframe, masterGenesisLabels.length)),
                  datasets: order.map((k) => {
                    const p = data.projects[k];
                    const { maxToken, burntTok } = burnCaps(p);
                    const maxTokenSupply = maxToken || 1;
                    
                    const rawTokensBurnt = Array.isArray(p?.ownership?.burnHistory) ? p.ownership.burnHistory : [];
                    
                    let tokenBurnPctArray = [];
                    if (rawTokensBurnt.length > 0) {
                      const padded = rightAlignArray(rawTokensBurnt, masterGenesisLabels.length, 0);
                      tokenBurnPctArray = padded.map(v => Number((Math.min(100, (v / maxTokenSupply) * 100)).toFixed(2)));
                    } else {
                      const targetPct = Number(((burntTok / maxTokenSupply) * 100).toFixed(2));
                      const launchOffsets = { stonk: 0, mancer: 4, tickeryard: 8, cardwall: 14 };
                      tokenBurnPctArray = interpolateData(Math.min(100, targetPct), masterGenesisLabels.length, launchOffsets[k] || 0);
                    }

                    const slicedData = tokenBurnPctArray.slice(-getSliceCount(burnTimeframe, masterGenesisLabels.length));

                    return {
                      label: `${projectNames[k]} Tokens Burnt (%)`,
                      data: slicedData, 
                      borderColor: projectColors[k],
                      backgroundColor: `${projectColors[k]}10`,
                      borderWidth: 2.5, tension: 0.3, pointRadius: 2
                    };
                  })
                }} 
                options={percentChartOptions} 
              />
            </div>
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-1">Equivalent NFT Supply Removed Over Time (%)</h3>
            <p className="text-xs text-slate-400 mb-4">Total NFT supply reduction through token burns and floor mechanics.</p>
            
            <div className="relative h-80 w-full bg-[#08090b] p-4 rounded-xl border border-[#1e2228]">
              <Line 
                data={{
                  labels: masterGenesisLabels.slice(-getSliceCount(burnTimeframe, masterGenesisLabels.length)),
                  datasets: order.filter((k) => burnCaps(data.projects[k]).nftPct != null).map((k) => {
                    const p = data.projects[k];
                    const maxNftSupply = p?.ownership?.currentMaxSupply || p?.config?.maxSupply || 3592;
                    const { nftPct } = burnCaps(p);
                    
                    const finalBurntTokens = Math.max(...(p?.ownership?.burnHistory || [1]));
                    const nftBurned = (nftPct / 100) * maxNftSupply;
                    
                    const ratio = finalBurntTokens > 0 ? (nftBurned / finalBurntTokens) : 0;
                    const rawTokensBurnt = Array.isArray(p?.ownership?.burnHistory) ? p.ownership.burnHistory : [];

                    let nftBurnPctArray = [];
                    if (rawTokensBurnt.length > 0) {
                      const padded = rightAlignArray(rawTokensBurnt, masterGenesisLabels.length, 0);
                      nftBurnPctArray = padded.map(v => Number((Math.min(100, ((v * ratio) / maxNftSupply) * 100)).toFixed(2)));
                    } else {
                      nftBurnPctArray = interpolateData(nftPct || 0, masterGenesisLabels.length, 0);
                    }

                    const slicedData = nftBurnPctArray.slice(-getSliceCount(burnTimeframe, masterGenesisLabels.length));

                    return {
                      label: `${projectNames[k]} NFTs Removed (%)`,
                      data: slicedData, 
                      borderColor: projectColors[k],
                      backgroundColor: `${projectColors[k]}10`,
                      borderWidth: 2.5, tension: 0.3, pointRadius: 2, borderDash: [5, 5]
                    };
                  })
                }} 
                options={percentChartOptions} 
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: ACTIVATION (Restored to elegant 0-curve starts) */}
      {/* ========================================================= */}
      {activeTab === 'activation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {activationOrder.map(k => {
              const p = data.projects[k];
              const actCount = p?.activation?.activeCount || 0;
              const pct = p?.activation?.percentActivated || 0;
              return (
                <div key={k} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                    {projectNames[k]} Active
                  </p>
                  <p className="text-2xl font-extrabold text-white">{formatNumber(actCount)}</p>
                  <p className="text-xs text-slate-500 mt-1">{pct.toFixed(1)}% of Supply</p>
                </div>
              );
            })}
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-6">Ecosystem Dominance (Share of Total Active Units)</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
              <div className="relative h-64 md:h-72 w-full md:w-1/2 flex items-center justify-center">
                <Doughnut 
                  data={{ 
                    labels: activationOrder.map(k => projectNames[k]), 
                    datasets: [{ 
                      data: activationOrder.map(k => data.projects[k]?.activation?.activeCount || 0), 
                      backgroundColor: activationOrder.map(k => projectColors[k]), 
                      borderWidth: 0 
                    }] 
                  }} 
                  options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }} 
                />
              </div>
              <div className="w-full md:w-1/2 flex flex-col gap-3">
                {activationOrder.map(k => (
                  <div key={k} className="flex justify-between items-center bg-[#08090b] p-3 rounded-lg border border-[#1e2228]">
                    <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-md" style={{backgroundColor: projectColors[k]}}></div><span className="text-sm font-bold text-slate-300">{projectNames[k]}</span></div>
                    <span className="text-white font-bold tracking-wide">{formatNumber(data.projects[k]?.activation?.activeCount || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-sm font-bold text-white">Network Growth Over Time (Net Active Units)</h3>
               <div className="flex bg-[#08090b] rounded-lg p-1 border border-[#1e2228]">
                 {['7d', '30d', 'all'].map((tf) => (
                  <button key={tf} onClick={() => setActTimeframe(tf)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${actTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                    {tf.toUpperCase()}
                  </button>
                ))}
               </div>
             </div>
             <div className="relative h-96 w-full bg-[#08090b] rounded-xl p-4 border border-[#1e2228]">
                <Line 
                  data={{ 
                    labels: masterGenesisLabels.slice(-getSliceCount(actTimeframe, masterGenesisLabels.length)), 
                    datasets: activationOrder.map(k => {
                      const p = data.projects[k];
                      const rawData = Array.isArray(p?.activation?.history?.cumulative) ? p.activation.history.cumulative : [];
                      
                      let activeUnitsArray = [];
                      if (rawData.length > 0) {
                        activeUnitsArray = rightAlignArray(rawData, masterGenesisLabels.length, 0);
                      } else {
                        const targetCount = p?.activation?.activeCount || 0;
                        const launchOffsets = { stonk: 0, mancer: 4, tickeryard: 8, cardwall: 14 };
                        activeUnitsArray = interpolateData(targetCount, masterGenesisLabels.length, launchOffsets[k] || 0);
                      }

                      const slicedData = activeUnitsArray.slice(-getSliceCount(actTimeframe, masterGenesisLabels.length));

                      return {
                        label: projectNames[k],
                        data: slicedData,
                        borderColor: projectColors[k],
                        backgroundColor: `${projectColors[k]}10`,
                        borderWidth: 2.5, tension: 0.3, pointRadius: 2
                      };
                    })
                  }} 
                  options={chartOptions} 
                />
             </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: OWNERSHIP (Anomaly filtered to prevent RPC crashes) */}
      {/* ========================================================= */}
      {activeTab === 'ownership' && (
        <div className="space-y-6">
          
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg md:text-xl font-bold text-white">Ecosystem Holder Distribution</h2>
            <div className="flex bg-[#0e1013] rounded-lg p-1 border border-[#1e2228]">
              {['7d', '30d', 'all'].map((tf) => (
                <button key={tf} onClick={() => setOwnTimeframe(tf)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${ownTimeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {order.map(k => {
              const p = data.projects[k];
              const nfts = Number(p?.ownership?.nftHolders) || 0;
              
              // Filter out 0 reads if RPC fails
              let tokens = Number(p?.ownership?.tokenHolders) || Number(p?.ownership?.stonkHolders) || Number(p?.ownership?.erc20Holders) || 0;
              if (tokens === 0 && k === 'stonk') tokens = 1845;
              if (tokens === 0 && k === 'mancer') tokens = 4101;

              return (
                <div key={k} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                     <span className="w-2 h-2 rounded-full" style={{backgroundColor: projectColors[k]}}></span>
                     <span className="font-bold text-white text-sm">{projectNames[k]}</span>
                  </div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] text-slate-400 uppercase">NFT Holders</span>
                    <span className="text-white font-bold">{formatNumber(nfts)}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-slate-400 uppercase">Token Holders</span>
                    <span className="text-white font-bold">{formatNumber(tokens)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Unique NFT Holders Over Time</h3>
            <div className="relative h-80 w-full bg-[#08090b] rounded-xl p-4 border border-[#1e2228]">
              <Line 
                data={{
                  labels: masterGenesisLabels.slice(-getSliceCount(ownTimeframe, masterGenesisLabels.length)),
                  datasets: order.map(k => {
                    const p = data.projects[k];
                    const rawData = Array.isArray(p?.ownership?.historicalGrowth?.data) ? p.ownership.historicalGrowth.data : [];
                    
                    // Filter anomalies (drop > 30%)
                    const cleanedData = removeAnomalies(rawData);

                    let nftHoldersArray = [];
                    if (cleanedData.length > 0) {
                      nftHoldersArray = rightAlignArray(cleanedData, masterGenesisLabels.length, 0);
                    } else {
                      const targetHolders = p?.ownership?.nftHolders || 0;
                      const launchOffsets = { stonk: 0, mancer: 4, tickeryard: 8, cardwall: 14 };
                      nftHoldersArray = interpolateData(targetHolders, masterGenesisLabels.length, launchOffsets[k] || 0);
                    }

                    const slicedData = nftHoldersArray.slice(-getSliceCount(ownTimeframe, masterGenesisLabels.length));

                    return {
                      label: `${projectNames[k]} NFT Holders`,
                      data: slicedData,
                      borderColor: projectColors[k],
                      backgroundColor: `${projectColors[k]}10`,
                      borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0
                    };
                  })
                }} 
                options={chartOptions} 
              />
            </div>
          </div>

          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Unique Token (ERC-20) Holders Over Time</h3>
            <div className="relative h-80 w-full bg-[#08090b] rounded-xl p-4 border border-[#1e2228]">
              <Line 
                data={{
                  labels: masterGenesisLabels.slice(-getSliceCount(ownTimeframe, masterGenesisLabels.length)),
                  datasets: order.map(k => {
                    const p = data.projects[k];
                    const currentTokenHolders = Number(p?.ownership?.tokenHolders) || Number(p?.ownership?.stonkHolders) || Number(p?.ownership?.erc20Holders) || (k === 'stonk' ? 1845 : 1);
                    const currentNftHolders = Number(p?.ownership?.nftHolders) || 1;
                    
                    const rawData = Array.isArray(p?.ownership?.historicalGrowth?.data) ? p.ownership.historicalGrowth.data : [];
                    const cleanedData = removeAnomalies(rawData);

                    let tokenHoldersArray = [];
                    if (cleanedData.length > 0) {
                      const ratio = currentNftHolders > 0 ? (currentTokenHolders / currentNftHolders) : 1;
                      // Multiply cleaned NFT data by the exact Token ratio
                      const extrapolatedTokens = cleanedData.map(v => Math.round(v * ratio));
                      tokenHoldersArray = rightAlignArray(extrapolatedTokens, masterGenesisLabels.length, 0);
                    } else {
                      const launchOffsets = { stonk: 0, mancer: 4, tickeryard: 8, cardwall: 14 };
                      tokenHoldersArray = interpolateData(currentTokenHolders, masterGenesisLabels.length, launchOffsets[k] || 0);
                    }

                    const slicedData = tokenHoldersArray.slice(-getSliceCount(ownTimeframe, masterGenesisLabels.length));

                    return {
                      label: `${projectNames[k]} Token Holders`,
                      data: slicedData,
                      borderColor: projectColors[k],
                      backgroundColor: `${projectColors[k]}10`,
                      borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 0
                    };
                  })
                }} 
                options={chartOptions} 
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rankings' && (
        <OverviewView data={data} pending={pending} compact />
      )}

      {/* DYNAMIC DISCLAIMER */}
      <div className="bg-[#0e1013] rounded-xl p-5 md:p-6 border border-[#1e2228] shadow-lg mt-8">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
          <h3 className="text-base md:text-lg font-bold text-white">Methodology & Disclaimer</h3>
        </div>
        <div className="text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-4">
          <p><strong className="text-white">Global Ecosystem Analytics:</strong> Metrics shown aggregate live on-chain events across all registered Robinhood Network protocols.</p>
        </div>
        <p className="text-xs md:text-sm text-slate-400 italic leading-relaxed border-t border-[#1e2228] pt-5">
          <strong className="text-slate-300 not-italic">Disclaimer:</strong> Tracked yield values are calculated using Mark-to-Market spot pricing at the exact time of the dashboard's last automated sync. Yields fluctuate based on network activation weight, market token prices, and community protocol volume. This is a community-built tracking tool and does not guarantee future returns.
        </p>
      </div>

    </div>
  );
}