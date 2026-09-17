import React, { useState } from 'react';
import { Line, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnOfSupplyPct } from '../../lib/burn';
import { dateKey, formatLabels } from '../../lib/dates';
import { protocolFeeCols, protocolRevenueChart, seriesHasInk, windowPeriodLabel } from '../../lib/yieldHistory';
import { compactUsd, compactNum } from '../kit';
import { baseChartOptions, compactTick, compactUsdTick } from '../../lib/charts';
import { useChartWindow } from '../../lib/chartWindow';
import {
    NIGHTSHADES_FACTION_META,
    FACTION_COLORS,
    overlayFactionMaps,
    seriesToDateMap,
    factionDailyRevenue,
    factionLabel,
    factionList,
    formatNightClock,
    nightPhaseLabel,
    nightMagnitudePct,
    factionNightRecord,
    nightLpPoints,
} from '../../lib/nightshades';
import { ChartPanel, EmptyChart } from '../HistoryCharts';
import { explorerTxUrl, explorerAddressUrl } from '../../lib/tba';

function formatPrice(val) {
  const n = Number(val);
  if (!(n > 0)) return '—';
  if (n < 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(n);
  }
  return compactUsd(n);
}

function Together({ title, note, labels, datasets, options }) {
  const ink = (datasets || []).filter((d) => seriesHasInk(d.data));
  return (
    <ChartPanel title={title} note={note}>
      {ink.length ? (
        <Line data={{ labels, datasets: ink }} options={options} />
      ) : (
        <EmptyChart />
      )}
    </ChartPanel>
  );
}

function TeamPills({ ids, empty = '—' }) {
  if (!ids?.length) return <span className="text-slate-500">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="px-2 py-0.5 rounded-md text-[11px] font-bold"
          style={{ backgroundColor: `${FACTION_COLORS[id] || '#818cf8'}22`, color: FACTION_COLORS[id] || '#818cf8' }}
        >
          {factionLabel(id)}
        </span>
      ))}
    </span>
  );
}

function fmtEth(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtEthRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
  if (Math.abs(a - b) < 0.05) return a.toFixed(2);
  return `${Math.min(a, b).toFixed(2)}–${Math.max(a, b).toFixed(2)}`;
}

function EthStat({ label, eth, usd, note, range }) {
  return (
    <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="text-white font-bold">
        {range || fmtEth(eth)}
        <span className="ml-1 text-sm font-semibold text-slate-400">ETH</span>
      </p>
      {Number(usd) > 0 ? <p className="text-xs text-slate-400">{compactUsd(usd)}</p> : null}
      {note ? <p className="text-[11px] text-slate-500 mt-1">{note}</p> : null}
    </div>
  );
}

function NightCard({ night }) {
  if (!night?.nightId) {
    return (
      <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">The Night</p>
        <p className="text-sm text-slate-400">Daily VRF strike is live on-chain. Waiting for the next snapshot to land the first cycle here.</p>
      </div>
    );
  }
  const magPct = nightMagnitudePct(night.magnitudeBps);
  const weth = Number(night.vaultWeth);
  const wethUsd = Number(night.vaultWethUsd);
  const movePct = (Number(night.moveBps) / 100).toFixed(0);
  const sunrisePct = (Number(night.sunriseBps) / 100).toFixed(0);
  return (
    <div className="bg-[#0e1013] border border-[#818cf8]/30 rounded-2xl p-4 md:p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-indigo-300 mb-1">The Night</p>
          <h3 className="text-lg font-bold text-white">
            Night #{night.nightId}
            <span className="ml-2 text-sm font-semibold text-slate-400">{nightPhaseLabel(night.phase)}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {formatNightClock(night.startedAt)} → {formatNightClock(night.endsAt)}
            {night.nextStartsAt ? ` · next ${formatNightClock(night.nextStartsAt)}` : ''}
            {night.lastStrikeTx ? (
              <>
                {' · '}
                <a href={explorerTxUrl(night.lastStrikeTx)} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-white">
                  strike tx
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 mb-4">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">This window</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TeamPills ids={night.favored} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/80">favored</span>
          <span className="text-slate-600">vs</span>
          <TeamPills ids={night.struck} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400/80">struck</span>
          <span className="text-slate-500">·</span>
          <span className="text-white font-bold">{magPct}</span>
          <span className="text-[11px] text-slate-500">magnitude</span>
        </div>
        <p className="text-[12px] text-slate-400 mt-3 leading-relaxed">
          Favored factions keep their pools. The Night can pull {movePct}% of WETH from the <strong className="text-white">struck</strong> pair
          ({factionList(night.struck)}) and sell those tokens into the vault. Sunrise tax is {sunrisePct}%.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm mb-4">
        <EthStat
          label="Night vault"
          eth={weth}
          usd={wethUsd}
          note={night.vault ? (
            <a href={explorerAddressUrl(night.vault)} target="_blank" rel="noreferrer" className="hover:text-indigo-300">Vault contract</a>
          ) : 'WETH sitting in the vault'}
        />
        <EthStat
          label="Pool liquidity"
          eth={night.poolsWeth}
          usd={night.poolsWethUsd}
          note="WETH in all four faction pools — system health"
        />
        <EthStat
          label="Sunrise fees"
          eth={night.sunriseWeth}
          usd={night.sunriseWethUsd}
          note="Swap fees accrued since last sunrise"
        />
        <EthStat
          label="LP Night can move"
          range={fmtEthRange(night.moveWethMin, night.moveWethMax)}
          usd={night.moveWethMaxUsd}
          note={`${movePct}% of a two-faction pair (thinnest–fattest)`}
        />
      </div>

      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Pool WETH by faction</p>
        <p className="text-[11px] text-slate-500 mb-2">Uniswap v4 WETH on each token pair. After a night, struck pools should dip then stick — not drain to zero.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {NIGHTSHADES_FACTION_META.map((f) => {
            const pool = night.pools?.[f.id];
            const poolWeth = Number(pool?.weth);
            const hit = (night.struck || []).includes(f.id);
            return (
              <div key={f.id} className={`bg-[#08090b] border rounded-lg px-3 py-2 ${hit ? 'border-rose-500/40' : 'border-[#1e2228]'}`}>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: FACTION_COLORS[f.id] }}>
                  {f.label}{hit ? ' · struck' : ''}
                </p>
                <p className="text-sm font-bold text-white">{poolWeth > 0 ? `${poolWeth.toFixed(2)} ETH` : '—'}</p>
                {Number(pool?.usd) > 0 ? <p className="text-[11px] text-slate-500">{compactUsd(pool.usd)}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Vault token inventory</p>
        <p className="text-[11px] text-slate-500 mb-2">
          Faction tokens the Night vault is holding — loot from past strikes, not “how hard they were hit.”
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {NIGHTSHADES_FACTION_META.map((f) => {
            const amt = Number(night.vaultTokens?.[f.id]);
            return (
              <div key={f.id} className="bg-[#08090b] border border-[#1e2228] rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: FACTION_COLORS[f.id] }}>{f.ticker}</p>
                <p className="text-sm font-bold text-white">{amt > 0 ? compactNum(amt) : '—'}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function lpEthAxis() {
  const base = baseChartOptions();
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        beginAtZero: true,
        ticks: { ...base.scales.y.ticks, callback: (v) => `${compactTick(v)} ETH` },
      },
    },
  };
}

function lpSlice(night, timeframe) {
  const points = nightLpPoints(night);
  const n = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : points.length;
  const sliced = points.slice(-Math.max(1, n));
  return {
    labels: formatLabels(sliced.map((r) => r.date)),
    sliced,
  };
}

function NightLiquidity({ night, timeframe, faction }) {
  const { labels, sliced } = lpSlice(night, timeframe);
  const ethAxis = lpEthAxis();
  const dots = sliced.length < 8 ? 3 : 0;
  const meta = NIGHTSHADES_FACTION_META.find((f) => f.id === faction);

  if (meta) {
    return (
      <Together
        title={`${meta.label} pool liquidity`}
        note={`${meta.label} WETH in its Uniswap v4 pair. After that faction is struck, this line should dip and then stick — a slide toward zero is LP leaving.`}
        labels={labels}
        datasets={[{
          label: `${meta.label} pool`,
          data: sliced.map((r) => Number(r.pools?.[meta.id]?.weth) || 0),
          borderColor: FACTION_COLORS[meta.id],
          backgroundColor: `${FACTION_COLORS[meta.id]}15`,
          borderWidth: 3,
          tension: 0.3,
          pointRadius: dots,
          spanGaps: true,
          fill: true,
        }]}
        options={ethAxis}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Together
        title="Pool liquidity by faction"
        note="Each Anvil pair on its own line. Not stacked — Ghosts is not added into Knights here."
        labels={labels}
        datasets={NIGHTSHADES_FACTION_META.map((f) => ({
          label: `${f.label} pool`,
          data: sliced.map((r) => Number(r.pools?.[f.id]?.weth) || 0),
          borderColor: FACTION_COLORS[f.id],
          borderWidth: 2,
          tension: 0.3,
          pointRadius: dots,
          spanGaps: true,
        }))}
        options={ethAxis}
      />
      <Together
        title="Total Nightshades pool liquidity"
        note="All four faction pools added together. This is system health: after a night, total WETH should dip on the struck side and then stick."
        labels={labels}
        datasets={[{
          label: 'All four pools',
          data: sliced.map((r) => Number(r.totalWeth) || 0),
          borderColor: '#818cf8',
          backgroundColor: '#818cf815',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: dots,
          spanGaps: true,
          fill: true,
        }]}
        options={ethAxis}
      />
    </div>
  );
}

function NightHistory({ night }) {
  const rows = [...(night?.history || [])].sort((a, b) => (b.nightId || 0) - (a.nightId || 0));
  if (!rows.length) return null;
  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white">Night history</h3>
        <p className="text-xs text-slate-400 mt-1">One row per VRF strike. Favored vs struck is the matchup. Pool WETH is the four-faction total when we had a stamp for that night.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {NIGHTSHADES_FACTION_META.map((f) => {
          const rec = factionNightRecord(rows, f.id);
          return (
            <div key={f.id} className="bg-[#08090b] border border-[#1e2228] rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: FACTION_COLORS[f.id] }}>{f.label}</p>
              <p className="text-sm text-white font-bold">{rec.favored} favored</p>
              <p className="text-[11px] text-slate-500">{rec.struck} struck</p>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto -mx-1 sm:mx-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase tracking-wider">
              <th className="pb-3 font-medium pl-2">Night</th>
              <th className="pb-3 font-medium">Window</th>
              <th className="pb-3 font-medium">Favored</th>
              <th className="pb-3 font-medium">Struck</th>
              <th className="pb-3 font-medium">Magnitude</th>
              <th className="pb-3 font-medium text-right">Pools</th>
              <th className="pb-3 font-medium text-right pr-2">Strike</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2228]/50 text-sm">
            {rows.map((row) => (
              <tr key={row.nightId}>
                <td className="py-3 pl-2 font-bold text-white">#{row.nightId}</td>
                <td className="py-3 text-slate-400 whitespace-nowrap">
                  {formatNightClock(row.startedAt)}
                  {row.endsAt ? ` → ${formatNightClock(row.endsAt)}` : ''}
                </td>
                <td className="py-3"><TeamPills ids={row.favored} /></td>
                <td className="py-3"><TeamPills ids={row.struck} /></td>
                <td className="py-3 text-white font-semibold">{nightMagnitudePct(row.magnitudeBps)}</td>
                <td className="py-3 text-right text-slate-300">
                  {Number(row.poolsWeth) > 0 ? `${Number(row.poolsWeth).toFixed(1)} ETH` : '—'}
                </td>
                <td className="py-3 text-right pr-2">
                  {row.tx ? (
                    <a
                      href={explorerTxUrl(row.tx)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 hover:text-white text-xs font-bold"
                    >
                      tx
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Incubator-wide Night card + history. Lives on the Night tab for All and each faction. */
export function NightshadesNightSection({ night, faction }) {
  const [timeframe] = useChartWindow();
  return (
    <section id="night" className="scroll-mt-32 space-y-6">
      <NightCard night={night} />
      <NightLiquidity night={night} timeframe={timeframe} faction={faction} />
      <NightHistory night={night} />
    </section>
  );
}

function t0RoiMap(slice) {
  const map = {};
  const t0 = slice?.tiers?.[0];
  for (const s of slice?.dailySnapshots || []) {
    const row = s.tiers?.find((st) => st.tier === (t0?.tier || 'T0'));
    const roi = row?.roi != null ? Number(row.roi) : (s.roi != null ? Number(s.roi) : null);
    if (Number.isFinite(roi)) map[dateKey(s.date)] = roi;
  }
  return map;
}

export default function NightshadesAllView({ project, setFaction }) {
  const [timeframe] = useChartWindow();
  const [expanded, setExpanded] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;
  const revPeriod = windowPeriodLabel(timeframe);
  const chartOptions = baseChartOptions();
  const percentChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: { min: 0, ticks: { color: '#cbd5e1', callback: (v) => `${compactTick(v)}%` }, grid: { color: '#1e2228', borderDash: [4, 4] } },
    },
  };
  const usdChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        beginAtZero: true,
        ticks: { ...chartOptions.scales.y.ticks, callback: compactUsdTick },
      },
    },
  };
  const countChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        beginAtZero: true,
        ticks: { ...chartOptions.scales.y.ticks, callback: compactTick },
      },
    },
  };

  const scaleYield = (annual) => {
    if (yieldPeriod === 'D') return (annual || 0) / 365;
    if (yieldPeriod === 'M') return (annual || 0) / 12;
    return annual || 0;
  };
  const yieldPeriodLabel = yieldPeriod === 'D' ? 'Daily' : yieldPeriod === 'M' ? 'Monthly' : 'Annualized';
  const yieldSuffix = yieldPeriod === 'D' ? '/day' : yieldPeriod === 'M' ? '/mo' : '/yr';

  const slices = NIGHTSHADES_FACTION_META.map((f) => ({
    ...f,
    color: FACTION_COLORS[f.id],
    slice: project?.factions?.[f.id] || {},
  }));
  const night = project?.night;

  const windowRev = (slice) => {
    const chart = protocolRevenueChart(slice);
    const fees = protocolFeeCols(chart.cols).filter((c) => c.key === 'amm' || c.key === 'dex');
    const n = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : (chart.labels || []).length;
    return fees.reduce((sum, c) => {
      const data = (c.data || []).slice(-n);
      return sum + data.reduce((s, v) => s + (Number(v) || 0), 0);
    }, 0);
  };

  const roiOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => [f.id, t0RoiMap(f.slice)])),
    { timeframe, fill: true },
  );

  const revOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const series = factionDailyRevenue(f.slice);
      return [f.id, seriesToDateMap(series.labels, series.data)];
    })),
    { timeframe },
  );

  const burnOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const series = burnSeries(f.slice, timeframe);
      const days = series.rawLabels || [];
      return [f.id, seriesToDateMap(days, series.data)];
    })),
    { timeframe, fill: true },
  );

  const burnPctOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const p = f.slice;
      const unit = Number(p?.config?.unitValue) || 1_000_000;
      const maxNft = Number(p?.ownership?.currentMaxSupply || p?.config?.maxSupply) || 3000;
      const maxToken = maxNft * unit;
      const series = burnSeries(p, timeframe);
      const days = series.rawLabels || [];
      const pct = (series.data || []).map((burn) => (
        maxToken > 0 ? +Math.min(100, ((Number(burn) || 0) / maxToken) * 100).toFixed(2) : null
      ));
      return [f.id, seriesToDateMap(days, pct)];
    })),
    { timeframe, fill: true },
  );

  const actOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const hist = f.slice?.activation?.history || {};
      return [f.id, seriesToDateMap(hist.labels, hist.cumulative)];
    })),
    { timeframe },
  );

  const nftOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const p = f.slice;
      const snaps = p?.dailySnapshots || [];
      const nft = snaps.map((s) => (s.nftHolders == null ? null : Number(s.nftHolders)));
      const liveNft = Number(p?.ownership?.nftHolders) || 0;
      if (nft.length && liveNft > 0 && nft[nft.length - 1] == null) nft[nft.length - 1] = liveNft;
      return [f.id, seriesToDateMap(snaps.map((s) => s.date), nft)];
    })),
    { timeframe },
  );

  const tokOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const p = f.slice;
      const hist = p?.ownership?.historicalGrowth || {};
      if (Array.isArray(hist.labels) && hist.labels.length) {
        return [f.id, seriesToDateMap(hist.labels, hist.data)];
      }
      const snaps = p?.dailySnapshots || [];
      return [f.id, seriesToDateMap(
        snaps.map((s) => s.date),
        snaps.map((s) => (s.tokenHolders == null ? null : Number(s.tokenHolders))),
      )];
    })),
    { timeframe },
  );

  return (
    <div className="space-y-6 relative">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {slices.map((f) => {
          const fm = f.slice.market || {};
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFaction(f.id)}
              className="text-left bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 hover:border-[#818cf8]/50 transition"
            >
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                {f.label}
              </p>
              <p className="text-lg font-extrabold text-white">{formatPrice(fm.tokenPriceUsd)}</p>
              <p className="text-xs mt-1" style={{ color: f.color }}>
                {fm.nftFloorEth > 0 ? `${fm.nftFloorEth} ETH floor` : 'Floor pending'}
              </p>
            </button>
          );
        })}
      </div>

      <section id="roi" className="scroll-mt-32">
        <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">Nightshades faction ROI</h3>
              <p className="text-xs text-slate-400 mt-1">
                Cash-on-cash for a T0 Shade: annualized vault yield ÷ (NFT floor USD + activation tokens at spot). Yield is the 7-day RewardPaid sample, split by tier weight. Open a faction for the full table and volume slider.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e2228] text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-4 font-medium pl-2">Faction</th>
                  <th className="pb-4 font-medium">Base Tier (T0)</th>
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
                {slices.map((f) => {
                  const p = f.slice;
                  const t0 = p.tiers?.[0];
                  const floorCost = (p.market?.nftFloorEth || 0) * (p.market?.ethPriceUsd || 0);
                  const actCost = (t0?.reqTokens || 0) * (p.market?.tokenPriceUsd || 0);
                  const totalCost = floorCost + actCost;
                  const roi = totalCost > 0 && t0 ? ((t0.trackedAnnualYieldUsd || 0) / totalCost) * 100 : 0;
                  const isExpanded = expanded === f.id;
                  return (
                    <React.Fragment key={f.id}>
                      <tr
                        onClick={() => setExpanded(isExpanded ? null : f.id)}
                        className="hover:bg-[#1e2228]/20 transition cursor-pointer group"
                      >
                        <td className="py-5 pl-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFaction(f.id); }}
                            className="flex items-center gap-3 rounded-md hover:opacity-90"
                          >
                            <span className="w-3 h-3 rounded-md" style={{ backgroundColor: f.color }} />
                            <span className="font-bold text-white underline-offset-2 hover:underline">{f.label}</span>
                          </button>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{t0?.name || 'Shade'}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{formatNumber(t0?.reqTokens || 0)} {p.config?.ticker || f.ticker}</div>
                        </td>
                        <td className="py-5">
                          <div className="font-bold text-white">{formatCurrency(totalCost)}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Floor + {formatCurrency(actCost)} Act.</div>
                        </td>
                        <td className="py-5">
                          <span className="text-white font-bold text-base">{formatCurrency(scaleYield(t0?.trackedAnnualYieldUsd || 0))}</span>
                          {' '}
                          <span className="text-slate-500">{yieldSuffix}</span>
                        </td>
                        <td className="py-5 text-right pr-4">
                          <div className="flex items-center justify-end gap-3">
                            <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded text-sm font-bold shadow-sm">{roi.toFixed(2)}%</span>
                            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#08090b]/40 border-b border-[#1e2228]/50">
                          <td colSpan="5" className="p-4 md:p-6">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-bold text-slate-300">Trailing 7-day realized yield ({t0?.name})</h4>
                            </div>
                            <div className="relative h-32 md:h-40 w-full">
                              {seriesHasInk(t0?.dailyYields) ? (
                                <Line
                                  data={{
                                    labels: t0.dailyDates,
                                    datasets: [{
                                      label: 'Daily Yield (USD)',
                                      data: t0.dailyYields,
                                      borderColor: f.color,
                                      backgroundColor: `${f.color}15`,
                                      borderWidth: 2,
                                      fill: true,
                                      tension: 0.4,
                                      pointRadius: 0,
                                    }],
                                  }}
                                  options={chartOptions}
                                />
                              ) : (
                                <EmptyChart>No daily yield recorded for this tier</EmptyChart>
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
      </section>

      <section id="yield" className="scroll-mt-32">
        <Together
          title="T0 CoC ROI by faction"
          note="Shade-tier cash-on-cash from each market’s snapshots. Lines are separate — All does not average or sum ROI."
          labels={roiOverlay.labels}
          datasets={roiOverlay.datasets}
          options={percentChartOptions}
        />
        <div className="space-y-6 mt-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Faction protocol revenue</h2>
          <p className="text-xs text-slate-400 -mt-4">Vault RewardPaid and Anvil AMM fees kept by each market. Civ-pad tax stays on StonkBrokers.</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {slices.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFaction(f.id)}
                className="text-left bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm transition hover:border-slate-500"
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                  {f.label} · {revPeriod}
                </p>
                <p className="text-2xl font-extrabold" style={{ color: f.color }}>{formatCurrency(windowRev(f.slice))}</p>
              </button>
            ))}
          </div>
          <Together
            title="Daily protocol revenue"
            note="One series per faction. Not stacked — Ghosts is not added into Knights."
            labels={revOverlay.labels}
            datasets={revOverlay.datasets}
            options={usdChartOptions}
          />
        </div>
      </section>

      <NightshadesNightSection night={night} />

      <section id="burn" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Token burn by faction</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {slices.map((f) => {
              const p = f.slice;
              const burnt = Math.max(
                Number(p.activation?.dualBurn?.totalBurnTokens || 0),
                Number(p.ownership?.permanentlyBurntTokens || 0),
              );
              const pct = burnOfSupplyPct(p, burnt);
              const units = Math.max(
                Number(p.activation?.dualBurn?.equivalentBrokersBurnt || 0),
                Number(p.ownership?.permanentlyBurntUnits || 0),
                Number(p.ownership?.burntNfts || 0),
              );
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFaction(f.id)}
                  className="text-left bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm transition hover:border-slate-500"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                    {f.label}
                  </p>
                  <p className="text-xl font-extrabold text-orange-400">{formatNumber(burnt)}</p>
                  <p className="text-xs text-slate-400 mt-1">{pct == null ? '—' : `${pct.toFixed(2)}%`} of supply · {formatNumber(units, 2)} units</p>
                </button>
              );
            })}
          </div>
          <Together
            title="Cumulative tokens burnt"
            note="Each faction’s own token. Quiet days carry the last cumulative — a burn cannot reset."
            labels={burnOverlay.labels}
            datasets={burnOverlay.datasets}
            options={countChartOptions}
          />
          <Together
            title="Share of each faction’s token supply burnt (%)"
            note="Percent of that market’s cap, so a 3,000-NFT collection is comparable to the others."
            labels={burnPctOverlay.labels}
            datasets={burnPctOverlay.datasets}
            options={percentChartOptions}
          />
        </div>
      </section>

      <section id="activation" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Activation by faction</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {slices.map((f) => {
              const act = f.slice.activation || {};
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFaction(f.id)}
                  className="text-left bg-[#0e1013] border border-[#1e2228] rounded-xl p-5 shadow-sm transition hover:border-slate-500"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                    {f.label} Active
                  </p>
                  <p className="text-2xl font-extrabold text-white">{formatNumber(act.activeCount || 0)}</p>
                  <p className="text-xs text-slate-500 mt-1">{(act.percentActivated || 0).toFixed(1)}% of 3,000</p>
                </button>
              );
            })}
          </div>
          <div className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-bold text-white mb-6">Share of Nightshades active units</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
              <div className="relative h-64 md:h-72 w-full md:w-1/2 flex items-center justify-center">
                <Doughnut
                  data={{
                    labels: slices.map((f) => f.label),
                    datasets: [{
                      data: slices.map((f) => f.slice.activation?.activeCount || 0),
                      backgroundColor: slices.map((f) => f.color),
                      borderWidth: 0,
                    }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }}
                />
              </div>
              <div className="w-full md:w-1/2 flex flex-col gap-3">
                {slices.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFaction(f.id)}
                    className="flex justify-between items-center bg-[#08090b] p-3 rounded-lg border border-[#1e2228] transition hover:border-slate-500"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-md" style={{ backgroundColor: f.color }} />
                      <span className="text-sm font-bold text-slate-300">{f.label}</span>
                    </div>
                    <span className="text-white font-bold tracking-wide">{formatNumber(f.slice.activation?.activeCount || 0)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Together
            title="Net active units"
            note="From each vault’s activation history. Missing days stay blank."
            labels={actOverlay.labels}
            datasets={actOverlay.datasets}
            options={countChartOptions}
          />
        </div>
      </section>

      <section id="ownership" className="scroll-mt-32">
        <div className="space-y-6">
          <h2 className="text-lg md:text-xl font-bold text-white">Holders by faction</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {slices.map((f) => {
              const o = f.slice.ownership || {};
              const tokens = Number(o.tokenHolders) || Number(o.stonkHolders) || 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFaction(f.id)}
                  className="text-left bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm transition hover:border-slate-500"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                    <span className="font-bold text-white text-sm">{f.label}</span>
                  </div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] text-slate-400 uppercase">NFT Holders</span>
                    <span className="text-white font-bold">{formatNumber(o.nftHolders || 0)}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-slate-400 uppercase">Token Holders</span>
                    <span className="text-white font-bold">{formatNumber(tokens)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <Together
            title="NFT holders"
            note="Snapshot nftHolders when present; otherwise the live count as the latest point."
            labels={nftOverlay.labels}
            datasets={nftOverlay.datasets}
            options={countChartOptions}
          />
          <Together
            title="Token holders"
            note="hourly historicalGrowth when it exists; else snapshot tokenHolders."
            labels={tokOverlay.labels}
            datasets={tokOverlay.datasets}
            options={countChartOptions}
          />
        </div>
      </section>

      <div className="bg-[#0e1013] rounded-xl p-5 md:p-6 border border-[#1e2228] shadow-lg mt-8">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          <h3 className="text-base md:text-lg font-bold text-white">Methodology & Disclaimer</h3>
        </div>
        <div className="text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-4">
          <p><strong className="text-white">All is a comparison, not a rollup:</strong> Ghosts, Zombies, Knights, and Watchers stay four series on one axis. Totals are not added together. Open a faction for that market’s tiers, simulator, and vault detail.</p>
          <p><strong className="text-white">Revenue:</strong> Faction AMM / vault RewardPaid only. The Nightshades civ-pad launch tax is counted on StonkBrokers.</p>
          <p><strong className="text-white">The Night</strong> is the daily VRF strike. Favored factions keep their pools; struck factions can lose 20% of that pair’s WETH to the vault (tokens sold for WETH). The unlabeled millions were vault token inventory — loot the vault is holding, not strike size. Pool WETH over time is the health chart: after each night, liquidity should dip on the struck side and then stick.</p>
        </div>
        <p className="text-xs md:text-sm text-slate-400 italic leading-relaxed border-t border-[#1e2228] pt-5">
          <strong className="text-slate-300 not-italic">Disclaimer:</strong> Tracked yield values use mark-to-market spot pricing at the last sync. This is a community-built tracking tool and does not guarantee future returns.
        </p>
      </div>
    </div>
  );
}
