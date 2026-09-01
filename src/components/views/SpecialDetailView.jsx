import React from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { trailingSnapshots } from '../../lib/snapshots';
import { PROJECTS } from '../../lib/routes';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const MARK = { green: '#00a804', violet: '#8b5cf6', sky: '#38bdf8', amber: '#f5b700', pink: '#f472b6' };

export default function SpecialDetailView({ data, projectKey, activeTab }) {
  const meta = PROJECTS.find((p) => p.key === projectKey);
  const project = data?.projects?.[projectKey];
  if (!project) {
    return <div className="text-center text-slate-400 p-12">{meta?.name || projectKey} data loading...</div>;
  }

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, cashflow = {}, lockedLp = null, dailySnapshots = [] } = project;
  const kind = config.kind || meta?.kind;
  const ticker = config.ticker || meta?.ticker;
  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);
  const num = (v, d = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v || 0);

  const floorUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
  const tokenUsd = market.tokenPriceUsd || 0;
  const circulating = ownership.circulatingSupply || 0;
  const annual = cashflow.holdersAnnualized || cashflow.revenueAnnualized || 0;
  const perToken = circulating > 0 ? annual / circulating : 0;
  const fdv = circulating * tokenUsd;
  const roi = tokenUsd > 0 ? (perToken / tokenUsd) * 100 : 0;
  const payback = perToken > 0 ? tokenUsd / perToken : null;

  const snaps = trailingSnapshots(dailySnapshots, 14);
  const histLabels = snaps.length ? snaps.map((s) => s.date) : (cashflow.dailyDates || []);
  const histRoi = snaps.length
    ? snaps.map((s) => s.roi || s.tiers?.[0]?.roi || 0)
    : [];

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#cbd5e1' } } },
    scales: {
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e2228', borderDash: [4, 4] } },
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e2228', borderDash: [4, 4] } },
    },
  };

  const burnTokens = activation.dualBurn?.totalBurnTokens || ownership.permanentlyBurntTokens || 0;

  return (
    <div className="space-y-6 relative">
      {activeTab === 'roi' && (
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-2">{meta?.name} cash-on-cash</h3>
          <p className="text-xs text-slate-400 mb-6">
            {kind === 'cashflow' && 'DefiLlama holders revenue annualized against circulating $INDEX. Eligible wallets hold at least 10,000 INDEX.'}
            {kind === 'machines' && 'Stock-pot estimate from the documented 5% PRINTER sell tax (80% to holders), split across the 10,000-machine fleet. Ink cost is 4,250 PRINTER plus the 15% ops fee. Floor is ink × 1.10.'}
            {kind === 'vault' && 'Liquid claim (RESERVE market) versus STRIKE FDV. Wrap yield from protocol activity is not yet indexed as an APY — coverage is the live benchmark.'}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase text-slate-400 mb-1">${ticker} price</p>
              <p className="text-xl font-extrabold text-white">{fmt(tokenUsd)}</p>
            </div>
            {kind === 'vault' ? (
              <>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">RESERVE price</p>
                  <p className="text-xl font-extrabold text-[#a3e635]">{fmt(market.reservePriceUsd)}</p>
                </div>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">Wrap ratio</p>
                  <p className="text-xl font-extrabold text-emerald-400">{(market.wrapRatio || 0).toFixed(4)}</p>
                </div>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">RESERVE / STRIKE FDV</p>
                  <p className="text-xl font-extrabold text-blue-400">{((market.navCoverage || 0) * 100).toFixed(1)}%</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">Annual cash-flow</p>
                  <p className="text-xl font-extrabold text-emerald-400">{fmt(annual)}</p>
                </div>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">CoC ROI</p>
                  <p className="text-xl font-extrabold text-blue-400">{roi.toFixed(2)}%</p>
                </div>
                <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">Payback</p>
                  <p className="text-xl font-extrabold text-purple-400">{payback == null ? '—' : `${payback.toFixed(1)}y`}</p>
                </div>
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase">
                  <th className="pb-3">Unit</th>
                  <th className="pb-3">Cost to enter</th>
                  <th className="pb-3">Expected yield</th>
                  <th className="pb-3 text-right">Est. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2228]/50">
                {tiers.map((t) => {
                  const cost = t.entryUsd || (kind === 'machines'
                    ? floorUsd + (t.reqTokens || 0) * tokenUsd * 1.15
                    : (t.reqTokens || 0) * tokenUsd);
                  const y = t.trackedAnnualYieldUsd || 0;
                  const r = cost > 0 ? (y / cost) * 100 : 0;
                  return (
                    <tr key={t.tier}>
                      <td className="py-4">
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-xs text-slate-500">{num(t.reqTokens)} ${ticker}</div>
                      </td>
                      <td className="py-4 text-white font-bold">{fmt(cost)}</td>
                      <td className="py-4 text-white font-bold">{y > 0 ? `${fmt(y)} /yr` : '—'}</td>
                      <td className="py-4 text-right">
                        <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold">
                          {y > 0 ? `${r.toFixed(2)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'historical' && (
        <div className="bg-[#0e1013] border border-[#1e2228] p-6 rounded-2xl space-y-6">
          <h2 className="text-xl font-bold text-white">Historical yield & payback</h2>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">ROI trajectory</h3>
            <div className="relative h-72 w-full">
              {histLabels.length && (histRoi.length || cashflow.dailyRevenue?.length) ? (
                <Line
                  data={{
                    labels: histLabels,
                    datasets: histRoi.length
                      ? [{ label: 'CoC ROI %', data: histRoi, borderColor: MARK.green, tension: 0.3, borderWidth: 2 }]
                      : [{ label: 'Holders revenue (USD)', data: cashflow.dailyRevenue, borderColor: MARK.green, tension: 0.3, borderWidth: 2 }],
                  }}
                  options={chartOpts}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">Snapshots start after the first hourly run.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Protocol revenue</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">Fees (24h)</p>
              <p className="text-2xl font-extrabold" style={{ color: MARK.green }}>{fmt(cashflow.fees24h)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">Holders / revenue (7D)</p>
              <p className="text-2xl font-extrabold" style={{ color: MARK.sky }}>{fmt(cashflow.holders7d || cashflow.revenue7d)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">Annualized</p>
              <p className="text-2xl font-extrabold" style={{ color: MARK.violet }}>{fmt(annual)}</p>
            </div>
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Daily fees vs holders revenue</h3>
            <div className="relative h-72 w-full">
              {(cashflow.dailyDates || []).length ? (
                <Bar
                  data={{
                    labels: cashflow.dailyDates,
                    datasets: [
                      { label: 'Fees', data: cashflow.dailyFees, backgroundColor: MARK.green },
                      { label: 'Holders revenue', data: cashflow.dailyRevenue, backgroundColor: MARK.violet },
                    ],
                  }}
                  options={{ ...chartOpts, scales: { ...chartOpts.scales, x: { ...chartOpts.scales.x, stacked: false }, y: { ...chartOpts.scales.y, stacked: false, ticks: { ...chartOpts.scales.y.ticks, callback: (v) => '$' + v } } } }}
                />
              ) : (
                <div className="h-72 flex items-center justify-center text-sm text-slate-500">
                  {kind === 'machines' ? `24h stock-pot estimate ${fmt(cashflow.revenue24h)}. Daily series starts after Llama or on-chain drops are wired.` : 'No daily series yet.'}
                </div>
              )}
            </div>
          </div>
          {lockedLp?.pools?.length > 0 && (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-2">Liquidity pools · {fmt(lockedLp.totalLpUsd)}</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 border-b border-[#1e2228]"><th className="pb-2 text-left">Pair</th><th className="pb-2">DEX</th><th className="pb-2 text-right">Liquidity</th></tr></thead>
                <tbody>
                  {lockedLp.pools.map((p, i) => (
                    <tr key={i} className="border-b border-[#1e2228]/40">
                      <td className="py-2 text-white font-bold">{p.pairName}</td>
                      <td className="py-2 text-slate-400">{p.dex}</td>
                      <td className="py-2 text-right">{fmt(p.liquidityUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'burn' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Supply deflation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">Tokens burnt / missing</p>
              <p className="text-2xl font-extrabold text-orange-400">{num(burnTokens)} {ticker}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">Circulating</p>
              <p className="text-2xl font-extrabold text-blue-400">{num(circulating)} {ticker}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activation' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">
            {kind === 'cashflow' ? 'Eligible wallets' : kind === 'machines' ? 'Inked machines' : 'Wrapped supply'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">
                {kind === 'cashflow' ? `Wallets ≥ ${num(activation.eligibleMin || 10000)} INDEX` : 'Active units'}
              </p>
              <p className="text-2xl font-extrabold text-emerald-400">{num(activation.activeCount || activation.eligibleWallets || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">{kind === 'cashflow' ? 'Token holders' : 'Collection / holders'}</p>
              <p className="text-2xl font-extrabold text-blue-400">{num(activation.totalSupply || ownership.tokenHolders || 0)}</p>
            </div>
          </div>
          {kind === 'machines' && (
            <p className="text-xs text-slate-500">Awake-machine count is not on the NFT contract. It lands here once gg-index lists the inking controller.</p>
          )}
        </div>
      )}

      {activeTab === 'ownership' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Ownership</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">${ticker} holders</p>
              <p className="text-2xl font-extrabold text-purple-400">{num(ownership.tokenHolders)}</p>
            </div>
            {kind === 'machines' && (
              <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
                <p className="text-xs uppercase text-slate-400 mb-1">Machine holders</p>
                <p className="text-2xl font-extrabold text-purple-400">{num(ownership.nftHolders)}</p>
              </div>
            )}
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">FDV</p>
              <p className="text-2xl font-extrabold text-white">{fmt(fdv)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#0e1013] rounded-xl p-5 border border-[#1e2228] mt-8">
        <h3 className="text-base font-bold text-white mb-3">Methodology</h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          {kind === 'cashflow' && 'Fees and holders revenue are DefiLlama The Index (original INDEX swap tax settled into tokenized stocks). CoC is annualized holders revenue ÷ circulating supply ÷ token price. That is cash-flow against INDEX cost basis, not a points program.'}
          {kind === 'machines' && 'PRINTER burn is max supply 200M minus live totalSupply plus dead/zero balances. Machine yield is an estimate from 24h DexScreener volume until epoch stock drops are indexed. Floor uses the documented 4,250 ink × 1.10, same Base+10% rule as the other NFT units.'}
          {kind === 'vault' && 'STRIKE is the liquid token; RESERVE is the vault receipt. Coverage is RESERVE market cap vs STRIKE FDV until vault-asset NAV can be summed on-chain. LP table is DexScreener STRIKE/USDG and RESERVE/STONKBROKER pools.'}
        </p>
        {config.site && (
          <p className="text-xs text-slate-500 mt-3">
            Source:{' '}
            <a className="text-slate-300 underline" href={config.site} target="_blank" rel="noreferrer">{config.site}</a>
          </p>
        )}
      </div>
    </div>
  );
}
