import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { trailingSnapshots } from '../../lib/snapshots';
import { PROJECTS } from '../../lib/routes';
import { BetaTag } from '../kit';
import {
  OAKMONT_ACTIONS, OAKMONT_BASKET, OAKMONT_DOCS, OAKMONT_DAPP, OAKMONT_FEES,
  fetchGeckoTokenHolders,
} from '../../lib/oakmont';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const MARK = { green: '#00a804', violet: '#8b5cf6', sky: '#38bdf8', amber: '#f5b700', pink: '#f472b6', lime: '#a3e635' };

export default function SpecialDetailView({ data, projectKey, activeTab }) {
  const meta = PROJECTS.find((p) => p.key === projectKey);
  const project = data?.projects?.[projectKey];
  if (!project) {
    return <div className="text-center text-slate-400 p-12">{meta?.name || projectKey} data loading...</div>;
  }

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, cashflow = {}, lockedLp = null, dailySnapshots = [], vault = null } = project;
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
  const wrapPct = market.wrappedPct ?? (circulating > 0 ? (market.reserveSupply || 0) / circulating : 0);
  const poolVol = market.poolVolume24h || (lockedLp?.pools || []).reduce((s, p) => s + (p.volume24h || 0), 0);

  if (kind === 'vault') {
    return (
      <VaultView
        meta={meta}
        market={market}
        ownership={ownership}
        activation={activation}
        lockedLp={lockedLp}
        snaps={snaps}
        histLabels={histLabels}
        chartOpts={chartOpts}
        activeTab={activeTab}
        fmt={fmt}
        num={num}
        tokenUsd={tokenUsd}
        fdv={fdv}
        circulating={circulating}
        burnTokens={burnTokens}
        wrapPct={wrapPct}
        poolVol={poolVol}
        cashflow={cashflow}
        tiers={tiers}
        vault={vault}
        config={config}
      />
    );
  }

  return (
    <div className="space-y-6 relative">
      {activeTab === 'roi' && (
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-6 shadow-xl">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
            {meta?.name} cash-on-cash
            {meta?.beta && <BetaTag />}
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            {kind === 'cashflow' && 'DefiLlama holders revenue annualized against circulating $INDEX. Eligible wallets hold at least 10,000 INDEX.'}
            {kind === 'machines' && 'Only awake (inked) Machines earn. Base ink is 4,250 $PRINTER to wake at 1× weight; more ink or a Proton fuse raises weight. The pot (fees → daily USDG+WETH during the test, else weekly stock) is split by weight across the awake fleet. See rhmachines.com/dashboard.'}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <p className="text-[10px] uppercase text-slate-400 mb-1">${ticker} price</p>
              <p className="text-xl font-extrabold text-white">{fmt(tokenUsd)}</p>
            </div>
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
            {kind === 'cashflow' ? 'Eligible wallets' : 'Inked machines'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">
                {kind === 'cashflow' ? `Wallets ≥ ${num(activation.eligibleMin || 10000)} INDEX` : 'Awake machines'}
              </p>
              <p className="text-2xl font-extrabold text-emerald-400">{num(activation.activeCount || activation.eligibleWallets || 0)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
              <p className="text-xs uppercase text-slate-400 mb-1">{kind === 'cashflow' ? 'Token holders' : 'Collection / holders'}</p>
              <p className="text-2xl font-extrabold text-blue-400">{num(activation.totalSupply || ownership.tokenHolders || 0)}</p>
            </div>
          </div>
          {kind === 'machines' && (
            <p className="text-xs text-slate-500">
              Awake count uses the live fleet figure from the RH Machines dashboard ({num(activation.activeCount || 7458)} earning)
              until the Mine/ink controller is indexed. Payouts are weight-weighted, not 1-per-NFT.
            </p>
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
          {kind === 'machines' && 'PRINTER burn is max supply minus live totalSupply plus dead/zero balances. Yield is the fee pot split across awake Machines by on-chain weight (ink + Proton fuses). Floor uses 4,250 ink × 1.10. Dormant (un-inked) Machines do not earn.'}
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

function Panel({ label, value, color }) {
  return (
    <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
      <p className="text-[10px] uppercase text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-extrabold" style={{ color: color || '#fff' }}>{value}</p>
    </div>
  );
}

function VaultView({
  meta, market, ownership, activation, lockedLp, snaps, histLabels, chartOpts,
  activeTab, fmt, num, tokenUsd, fdv, circulating, burnTokens, wrapPct, poolVol,
  cashflow, tiers, vault, config,
}) {
  const wrapHist = snaps.map((s) => s.wrapRatio || 0);
  const covHist = snaps.map((s) => (s.navCoverage || 0) * 100);
  const strikeHist = snaps.map((s) => s.tokenPriceUsd || 0);
  const reserveHist = snaps.map((s) => s.reservePriceUsd || 0);
  const hasWrapSeries = wrapHist.some((v) => v > 0);
  const strikeLockedEst = market.reserveSupply || 0;
  const claimApy = market.claimApyPct;
  const feeAnnual = cashflow?.feesAnnualized || 0;
  const rateHist = (vault?.history || []).filter((r) => r.exchangeRate > 0);
  const navHist = (vault?.history || []).filter((r) => r.nav > 0);
  const [liveHolders, setLiveHolders] = useState({ strike: null, reserve: null });

  useEffect(() => {
    let gone = false;
    (async () => {
      const [strike, reserve] = await Promise.all([
        fetchGeckoTokenHolders(config?.tokenCa),
        fetchGeckoTokenHolders(config?.reserveCa),
      ]);
      if (!gone) setLiveHolders({ strike, reserve });
    })();
    return () => { gone = true; };
  }, [config?.tokenCa, config?.reserveCa]);

  const strikeHolders = liveHolders.strike || market.strikeHolders || ownership.tokenHolders || 0;
  const reserveHolders = liveHolders.reserve || market.reserveHolders || 0;

  return (
    <div className="space-y-6 relative">
      {activeTab === 'roi' && (
        <div className="space-y-6">
          <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-6 shadow-xl">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              {meta?.name}
              {meta?.beta && <BetaTag />}
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Two tokens by design: <strong className="text-slate-300">$STRIKE</strong> is the fixed-supply float.
              {' '}<strong className="text-slate-300">$RESERVE</strong> is the vault receipt. Fees buy the basket (NAV) and burn a slice of $RESERVE (claim quality).
              Those are separate: do not add claim APY to fee CoC.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Panel label="Reserve holder APY" value={claimApy == null ? '—' : `${claimApy.toFixed(2)}%`} color={MARK.lime} />
              <Panel label="Vault NAV (USDG)" value={fmt(market.vaultNavUsdg)} color={MARK.green} />
              <Panel label="STRIKE per $RESERVE" value={(market.protocolExchangeRate || 0).toFixed(4)} color={MARK.sky} />
              <Panel label="ETH fees → vault /yr" value={fmt(feeAnnual)} color={MARK.amber} />
            </div>
            <p className="text-[11px] text-slate-500 mb-4">
              Claim APY matches Oakmont: annualized growth of the protocol STRIKE:RESERVE rate above 1.0.
              Fee CoC is annualized ETH fee revenue (2% wrap/unwrap leg, plus other ETH fees) ÷ spot cost. Indexer NAV is USDG; USDG is treated as $1.
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase">
                    <th className="pb-3">Holder</th>
                    <th className="pb-3">Spot</th>
                    <th className="pb-3">Fee accretion / token /yr</th>
                    <th className="pb-3 text-right">Fee CoC</th>
                    <th className="pb-3 text-right">Claim APY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2228]/50">
                  {(tiers || []).map((t) => {
                    const cost = t.entryUsd || 0;
                    const y = t.trackedAnnualYieldUsd || 0;
                    const r = cost > 0 ? (y / cost) * 100 : 0;
                    return (
                      <tr key={t.tier}>
                        <td className="py-3 font-bold text-white">{t.name}</td>
                        <td className="py-3 text-white font-bold">{fmt(cost)}</td>
                        <td className="py-3 text-white font-bold">{y > 0 ? `${fmt(y)}` : '—'}</td>
                        <td className="py-3 text-right">
                          <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold">
                            {y > 0 ? `${r.toFixed(2)}%` : '—'}
                          </span>
                        </td>
                        <td className="py-3 text-right text-slate-400 text-sm">
                          {t.claimApyPct != null ? `${Number(t.claimApyPct).toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase">
                    <th className="pb-3">Action</th>
                    <th className="pb-3">Fee / LTV</th>
                    <th className="pb-3">What you get</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2228]/50">
                  {OAKMONT_ACTIONS.map((row) => (
                    <tr key={row.name}>
                      <td className="py-3 font-bold text-white">{row.name}</td>
                      <td className="py-3 text-[#a3e635] font-bold whitespace-nowrap">{row.cost}</td>
                      <td className="py-3 text-slate-400 text-xs leading-relaxed">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-2">Vault basket (new revenue split)</h3>
            <p className="text-xs text-slate-500 mb-4">
              All protocol fees buy this basket. Weights are for new deposits only — the index does not rebalance, so winners keep weight.
            </p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {OAKMONT_BASKET.map((b) => (
                <div key={b.asset} className="bg-[#0e1013] border border-[#1e2228] rounded-lg p-3">
                  <p className="text-[10px] text-slate-500 uppercase">{b.asset}</p>
                  <p className="text-sm font-bold text-white">{b.share}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'historical' && (
        <div className="bg-[#0e1013] border border-[#1e2228] p-6 rounded-2xl space-y-6">
          <h2 className="text-xl font-bold text-white">Markets</h2>
          <p className="text-xs text-slate-400">
            $STRIKE and $RESERVE should stay linked by wrap/unwrap (2.5% each way) and by the ~7.5% wrap-and-redeem floor versus Reserve Price. Spreads persist when volume is thin.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Panel label="$STRIKE" value={fmt(tokenUsd)} />
            <Panel label="$RESERVE" value={fmt(market.reservePriceUsd)} color={MARK.lime} />
            <Panel label="STRIKE per $RESERVE" value={(market.protocolExchangeRate || 0).toFixed(4)} color={MARK.green} />
            <Panel label="Claim APY" value={claimApy == null ? '—' : `${claimApy.toFixed(2)}%`} color={MARK.lime} />
          </div>
          {rateHist.length > 1 && (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <h3 className="text-sm font-bold text-white mb-4">STRIKE per $RESERVE (claim rate)</h3>
              <div className="relative h-72 w-full">
                <Line
                  data={{
                    labels: rateHist.map((r) => r.date || r.ts),
                    datasets: [
                      { label: 'STRIKE / RESERVE', data: rateHist.map((r) => r.exchangeRate), borderColor: MARK.lime, tension: 0.2, borderWidth: 2 },
                      ...(navHist.length > 1 ? [{ label: 'Vault NAV (USDG)', data: (vault?.history || []).map((r) => r.nav), borderColor: MARK.sky, tension: 0.2, borderWidth: 2, yAxisID: 'y1' }] : []),
                    ],
                  }}
                  options={{
                    ...chartOpts,
                    scales: {
                      ...chartOpts.scales,
                      y: { ...chartOpts.scales.y, position: 'left' },
                      y1: { ticks: { color: '#94a3b8' }, grid: { drawOnChartArea: false }, position: 'right' },
                    },
                  }}
                />
              </div>
            </div>
          )}
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-4">Wrap ratio & liquid-claim coverage</h3>
            <div className="relative h-72 w-full">
              {histLabels.length && hasWrapSeries ? (
                <Line
                  data={{
                    labels: histLabels,
                    datasets: [
                      { label: 'Wrap ratio', data: wrapHist, borderColor: MARK.green, tension: 0.3, borderWidth: 2, yAxisID: 'y' },
                      { label: 'RESERVE mcap / STRIKE FDV %', data: covHist, borderColor: MARK.sky, tension: 0.3, borderWidth: 2, yAxisID: 'y1' },
                    ],
                  }}
                  options={{
                    ...chartOpts,
                    scales: {
                      ...chartOpts.scales,
                      y: { ...chartOpts.scales.y, position: 'left' },
                      y1: { ticks: { color: '#94a3b8' }, grid: { drawOnChartArea: false }, position: 'right' },
                    },
                  }}
                />
              ) : histLabels.length && strikeHist.some((v) => v > 0) ? (
                <Line
                  data={{
                    labels: histLabels,
                    datasets: [
                      { label: '$STRIKE', data: strikeHist, borderColor: MARK.green, tension: 0.3, borderWidth: 2 },
                      ...(reserveHist.some((v) => v > 0) ? [{ label: '$RESERVE', data: reserveHist, borderColor: MARK.lime, tension: 0.3, borderWidth: 2 }] : []),
                    ],
                  }}
                  options={chartOpts}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">Hourly snapshots will fill wrap ratio and coverage.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Fees & liquidity</h2>
          <p className="text-xs text-slate-400">
            Vault growth is wrap, unwrap, origination, interest, liquidations, redemptions, and arb.
            ETH fee revenue is what the indexer reports as going into the vault. Pool volume is the arb surface, not wrap notional.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel label="ETH fees → vault /yr" value={fmt(feeAnnual)} color={MARK.green} />
            <Panel label="Tracked LP" value={fmt(lockedLp?.totalLpUsd)} color={MARK.sky} />
            <Panel label="24h wraps / unwraps" value={`${num(market.wraps24h)} / ${num(market.unwraps24h)}`} color={MARK.amber} />
          </div>
          <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 overflow-x-auto">
            <h3 className="text-sm font-bold text-white mb-3">Fee schedule</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-[#1e2228]">
                  <th className="pb-2 text-left">Fee</th>
                  <th className="pb-2">Rate</th>
                  <th className="pb-2 text-left">Destination</th>
                </tr>
              </thead>
              <tbody>
                {OAKMONT_FEES.map((row) => (
                  <tr key={row.fee} className="border-b border-[#1e2228]/40">
                    <td className="py-2 text-white font-bold">{row.fee}</td>
                    <td className="py-2 text-[#a3e635] font-bold whitespace-nowrap">{row.rate}</td>
                    <td className="py-2 text-slate-400">{row.dest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lockedLp?.pools?.length > 0 && (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-2">Pools · {fmt(lockedLp.totalLpUsd)}</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-[#1e2228]">
                    <th className="pb-2 text-left">Pair</th>
                    <th className="pb-2">DEX</th>
                    <th className="pb-2 text-right">Liquidity</th>
                    <th className="pb-2 text-right">24h vol</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedLp.pools.map((p, i) => (
                    <tr key={i} className="border-b border-[#1e2228]/40">
                      <td className="py-2 text-white font-bold">{p.pairName}</td>
                      <td className="py-2 text-slate-400">{p.dex}</td>
                      <td className="py-2 text-right">{fmt(p.liquidityUsd)}</td>
                      <td className="py-2 text-right">{fmt(p.volume24h)}</td>
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
          <h2 className="text-xl font-bold text-white">Supply</h2>
          <p className="text-xs text-slate-400">
            $STRIKE has a fixed supply and no mint after deploy. Wrapping does not burn it — tokens sit in the wrapper as backing.
            $RESERVE supply is flexible. Burns on wrap, unwrap, and the full 5% redemption fee raise each remaining $RESERVE’s claim on trapped $STRIKE, so the exchange rate is structurally biased up.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel label="$STRIKE circulating (fixed cap 100M)" value={num(circulating, 0)} color={MARK.sky} />
            <Panel label="$STRIKE independently burned / missing" value={`${num(burnTokens)} STRIKE`} color="#fb923c" />
            <Panel label="$RESERVE outstanding" value={num(market.reserveSupply, 0)} color={MARK.lime} />
            <Panel label="$RESERVE FDV" value={fmt(market.reserveFdvUsd)} />
          </div>
        </div>
      )}

      {activeTab === 'activation' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Wrap</h2>
          <p className="text-xs text-slate-400">
            Outstanding $RESERVE is the live wrap proxy. Locked $STRIKE is at least this high (1:1 escrow minus $RESERVE-only burns).
            $RESERVE in a loan is staked and cannot be sold until repaid or liquidated.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel label="$RESERVE outstanding" value={num(activation.activeCount || strikeLockedEst, 0)} color={MARK.green} />
            <Panel label="$STRIKE circulating" value={num(activation.totalSupply || circulating, 0)} color={MARK.sky} />
            <Panel label="Wrap proxy" value={`${(wrapPct * 100).toFixed(1)}%`} color={MARK.violet} />
          </div>
        </div>
      )}

      {activeTab === 'ownership' && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Holders</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Panel label="$STRIKE holders" value={strikeHolders ? num(strikeHolders) : '—'} color={MARK.violet} />
            <Panel label="$RESERVE holders" value={reserveHolders ? num(reserveHolders) : '—'} color={MARK.lime} />
            <Panel label="$STRIKE FDV" value={fmt(fdv)} />
            <Panel label="$RESERVE mcap" value={fmt(market.reserveFdvUsd)} />
            <Panel label="Max LTV vs $RESERVE" value="75%" />
            <Panel label="Floor path" value="~7.5%" color={MARK.amber} />
          </div>
          {rateHist.length > 1 && (
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
              <h3 className="text-sm font-bold text-white mb-4">Claim rate & vault NAV</h3>
              <div className="relative h-72 w-full">
                <Line
                  data={{
                    labels: rateHist.map((r) => r.date || r.ts),
                    datasets: [
                      { label: 'STRIKE / RESERVE', data: rateHist.map((r) => r.exchangeRate), borderColor: MARK.lime, tension: 0.2, borderWidth: 2 },
                      ...(navHist.length > 1 ? [{ label: 'Vault NAV (USDG)', data: (vault?.history || []).map((r) => r.nav), borderColor: MARK.sky, tension: 0.2, borderWidth: 2, yAxisID: 'y1' }] : []),
                    ],
                  }}
                  options={{
                    ...chartOpts,
                    scales: {
                      ...chartOpts.scales,
                      y: { ...chartOpts.scales.y, position: 'left' },
                      y1: { ticks: { color: '#94a3b8' }, grid: { drawOnChartArea: false }, position: 'right' },
                    },
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-[#0e1013] rounded-xl p-5 border border-[#1e2228] mt-8">
        <h3 className="text-base font-bold text-white mb-3">Methodology</h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Mechanics follow the Oakmont docs and the live indexer (api.oakmontvault.xyz).
          Reserve holder APY is annualized (STRIKE-per-RESERVE − 1) from the first history sample, same formula as the dapp.
          Fee CoC is ETH fee revenue annualized at the live ETH price, then split per $STRIKE or per $RESERVE against DexScreener spot.
          Vault NAV is the indexer's USDG total (USDG ≈ $1 here). It can lag on-chain holdings. Claim APY and fee CoC are not additive.
        </p>
        <p className="text-xs text-slate-500 mt-3">
          Docs:{' '}
          <a className="text-slate-300 underline" href={OAKMONT_DOCS} target="_blank" rel="noreferrer">{OAKMONT_DOCS}</a>
          {' · '}
          <a className="text-slate-300 underline" href={OAKMONT_DAPP} target="_blank" rel="noreferrer">dapp</a>
        </p>
      </div>
    </div>
  );
}
