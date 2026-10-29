import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { burnSeries, burnOfSupplyPct } from '../../lib/burn';
import { dateKey, formatLabels } from '../../lib/dates';
import { seriesHasInk, bucketKey } from '../../lib/yieldHistory';
import { Card, Stat, KpiStrip, Tag, YieldPeriodToggle, scaleAnnualYield, yieldSuffix, yieldPeriodLabel, compactUsd, compactNum } from '../kit';
import { yieldBasisText } from '../../lib/yieldSample';
import { ShareSection } from '../CopyControl';
import { axisTitle, baseChartOptions, compactTick, compactUsdTick, percentTick } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import {
    NIGHTSHADES_FACTION_META,
    FACTION_COLORS,
    overlayFactionMaps,
    seriesToDateMap,
    factionLabel,
    factionList,
    formatNightClock,
    nightPhaseLabel,
    nightMagnitudePct,
    factionNightRecord,
    nightLpPoints,
} from '../../lib/nightshades';
import { ChartPanel, ChartSwitch, ChartStack, EmptyChart } from '../HistoryCharts';
import { MethodologyCard } from '../Disclaimer';
import { SliceChart } from '../SliceChart';
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

function togetherBody({ labels, datasets, options }) {
  const ink = (datasets || []).filter((d) => seriesHasInk(d.data));
  return ink.length ? <Line data={{ labels, datasets: ink }} options={options} /> : <EmptyChart />;
}

function Together({ title, note, labels, datasets, options }) {
  return (
    <ChartPanel title={title} note={note}>
      {togetherBody({ labels, datasets, options })}
    </ChartPanel>
  );
}

function TeamPills({ ids, empty = '—' }) {
  if (!ids?.length) return <span className="text-faint">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{ backgroundColor: `${FACTION_COLORS[id] || '#00a804'}22`, color: FACTION_COLORS[id] || '#00a804' }}
        >
          {factionLabel(id)}
        </span>
      ))}
    </span>
  );
}

function FactionLabel({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {children}
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
    <div>
      <Stat label={label} value={`${range || fmtEth(eth)} ETH`} note={Number(usd) > 0 ? compactUsd(usd) : null} />
      {note ? <p className="mt-1 text-[11px] leading-snug text-faint">{note}</p> : null}
    </div>
  );
}

function NightCard({ night }) {
  if (!night?.nightId) {
    return (
      <Card
        eyebrow="The Night"
        sub="Daily VRF strike is live on-chain. Waiting for the next snapshot to land the first cycle here."
      />
    );
  }
  const magPct = nightMagnitudePct(night.magnitudeBps);
  const weth = Number(night.vaultWeth);
  const wethUsd = Number(night.vaultWethUsd);
  const movePct = (Number(night.moveBps) / 100).toFixed(0);
  const sunrisePct = (Number(night.sunriseBps) / 100).toFixed(0);
  return (
    <div className="space-y-4">
      <Card
        eyebrow={`The Night · #${night.nightId} · ${nightPhaseLabel(night.phase)}`}
        sub={(
          <>
            {formatNightClock(night.startedAt)} → {formatNightClock(night.endsAt)}
            {night.nextStartsAt ? ` · next ${formatNightClock(night.nextStartsAt)}` : ''}
            {night.lastStrikeTx ? (
              <>
                {' · '}
                <a href={explorerTxUrl(night.lastStrikeTx)} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                  strike tx
                </a>
              </>
            ) : null}
          </>
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <TeamPills ids={night.favored} />
          <Tag tone="good">favored</Tag>
          <span className="text-faint">vs</span>
          <TeamPills ids={night.struck} />
          <Tag tone="danger">struck</Tag>
          <span className="text-faint">·</span>
          <span className="num text-ink">{magPct}</span>
          <span className="font-mono text-[11px] text-faint">magnitude</span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Favored factions keep their pools. The Night can pull {movePct}% of WETH from the <strong className="text-ink">struck</strong> pair
          ({factionList(night.struck)}) and sell those tokens into the vault. Sunrise tax is {sunrisePct}%.
        </p>
      </Card>

      <Card eyebrow="Night vault" sub="WETH the Night holds, what sits in the pools, and what the next strike can move.">
        <KpiStrip>
          <EthStat
            label="Night vault"
            eth={weth}
            usd={wethUsd}
            note={night.vault ? (
              <a href={explorerAddressUrl(night.vault)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">Vault contract</a>
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
        </KpiStrip>
      </Card>

      <Card
        eyebrow="Pool WETH by faction"
        sub="Uniswap v4 WETH on each token pair. After a night, struck pools should dip then stick — not drain to zero."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {NIGHTSHADES_FACTION_META.map((f) => {
            const pool = night.pools?.[f.id];
            const poolWeth = Number(pool?.weth);
            const hit = (night.struck || []).includes(f.id);
            return (
              <div key={f.id} className={`rounded-xl border px-3 py-2.5 ${hit ? 'border-danger/40' : 'border-line'}`}>
                <Stat
                  label={<FactionLabel color={FACTION_COLORS[f.id]}>{f.label}{hit ? ' · struck' : ''}</FactionLabel>}
                  value={poolWeth > 0 ? `${poolWeth.toFixed(2)} ETH` : '—'}
                  note={Number(pool?.usd) > 0 ? compactUsd(pool.usd) : null}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        eyebrow="Vault token inventory"
        sub="Faction tokens the Night vault is holding — loot from past strikes, not “how hard they were hit.”"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {NIGHTSHADES_FACTION_META.map((f) => {
            const amt = Number(night.vaultTokens?.[f.id]);
            return (
              <div key={f.id} className="rounded-xl border border-line px-3 py-2.5">
                <Stat label={<FactionLabel color={FACTION_COLORS[f.id]}>{f.ticker}</FactionLabel>} value={amt > 0 ? compactNum(amt) : '—'} />
              </div>
            );
          })}
        </div>
      </Card>
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
        unit: 'WETH',
        title: axisTitle('WETH'),
        ticks: { ...base.scales.y.ticks, callback: (v) => `${compactTick(v)} ETH` },
      },
    },
  };
}

function lpSlice(night, timeframe, interval = 'daily') {
  const points = nightLpPoints(night);
  const n = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : points.length;
  const sliced = points.slice(-Math.max(1, n));
  if (!interval || interval === 'daily') {
    return {
      labels: formatLabels(sliced.map((r) => r.date)),
      sliced,
    };
  }
  const order = [];
  const buckets = new Map();
  for (const r of sliced) {
    const key = bucketKey(r.date, interval);
    if (!key) continue;
    if (!buckets.has(key)) order.push(key);
    buckets.set(key, r);
  }
  const bucketed = order.map((key) => ({ ...buckets.get(key), date: key }));
  return {
    labels: formatLabels(bucketed.map((r) => r.date)),
    sliced: bucketed,
  };
}

function NightLiquidity({ night, timeframe, interval, faction }) {
  const { labels, sliced } = lpSlice(night, timeframe, interval);
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
    <ChartStack
      label="In pools"
      views={[
        {
          id: 'ns-pools',
          jump: 'By faction',
          title: 'Pool liquidity by faction',
          note: 'Each Anvil pair on its own line. Not stacked — Ghosts is not added into Knights here.',
          body: togetherBody({
            labels,
            datasets: NIGHTSHADES_FACTION_META.map((f) => ({
              label: `${f.label} pool`,
              data: sliced.map((r) => Number(r.pools?.[f.id]?.weth) || 0),
              borderColor: FACTION_COLORS[f.id],
              borderWidth: 2,
              tension: 0.3,
              pointRadius: dots,
              spanGaps: true,
            })),
            options: ethAxis,
          }),
        },
        {
          id: 'ns-total',
          jump: 'Combined',
          title: 'Total Nightshades pool liquidity',
          note: 'All four faction pools added together. This is system health: after a night, total WETH should dip on the struck side and then stick.',
          body: togetherBody({
            labels,
            datasets: [{
              label: 'All four pools',
              data: sliced.map((r) => Number(r.totalWeth) || 0),
              borderColor: '#00a804',
              backgroundColor: '#00a80415',
              borderWidth: 3,
              tension: 0.3,
              pointRadius: dots,
              spanGaps: true,
              fill: true,
            }],
            options: ethAxis,
          }),
        },
      ]}
    />
  );
}

function NightHistory({ night }) {
  const rows = [...(night?.history || [])].sort((a, b) => (b.nightId || 0) - (a.nightId || 0));
  if (!rows.length) return null;
  return (
    <Card
      eyebrow="Night history"
      sub="One row per VRF strike. Favored vs struck is the matchup. Pool WETH is the four-faction total when we had a stamp for that night."
    >
      <KpiStrip>
        {NIGHTSHADES_FACTION_META.map((f) => {
          const rec = factionNightRecord(rows, f.id);
          return (
            <Stat
              key={f.id}
              label={<FactionLabel color={FACTION_COLORS[f.id]}>{f.label}</FactionLabel>}
              value={`${rec.favored} favored`}
              note={`${rec.struck} struck`}
            />
          );
        })}
      </KpiStrip>
      <div className="-mx-4 mt-5 overflow-x-auto border-t border-line sm:-mx-5">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="eyebrow border-b border-line text-faint">
              <th className="px-4 py-3 font-normal sm:px-5">Night</th>
              <th className="px-3 py-3 font-normal">Window</th>
              <th className="px-3 py-3 font-normal">Favored</th>
              <th className="px-3 py-3 font-normal">Struck</th>
              <th className="px-3 py-3 font-normal">Magnitude</th>
              <th className="px-3 py-3 text-right font-normal">Pools</th>
              <th className="px-4 py-3 text-right font-normal sm:px-5">Strike</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.nightId} className="border-b border-line-soft">
                <td className="num px-4 py-3 text-[13px] text-ink sm:px-5">#{row.nightId}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-muted">
                  {formatNightClock(row.startedAt)}
                  {row.endsAt ? ` → ${formatNightClock(row.endsAt)}` : ''}
                </td>
                <td className="px-3 py-3"><TeamPills ids={row.favored} /></td>
                <td className="px-3 py-3"><TeamPills ids={row.struck} /></td>
                <td className="num px-3 py-3 text-[13px] text-ink">{nightMagnitudePct(row.magnitudeBps)}</td>
                <td className="num px-3 py-3 text-right text-[13px] text-ink">
                  {Number(row.poolsWeth) > 0 ? `${Number(row.poolsWeth).toFixed(1)} ETH` : '—'}
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  {row.tx ? (
                    <a
                      href={explorerTxUrl(row.tx)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-muted hover:text-ink hover:underline"
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
    </Card>
  );
}

/** Incubator-wide Night card + history. Lives on the Night tab for All and each faction. */
export function NightshadesNightSection({ night, faction }) {
  const { range: timeframe, interval } = useChartView();
  return (
    <ShareSection id="night" className="scroll-mt-32 space-y-4">
      <NightCard night={night} />
      <NightLiquidity night={night} timeframe={timeframe} interval={interval} faction={faction} />
      <NightHistory night={night} />
    </ShareSection>
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
  const { range: timeframe, interval } = useChartView();
  const [expanded, setExpanded] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;
  const chartOptions = baseChartOptions();
  const percentChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: { min: 0, unit: '%', title: axisTitle('%'), ticks: { color: '#cbd5e1', callback: percentTick }, grid: { color: '#1e2228', borderDash: [4, 4] } },
    },
  };
  const countChartOptions = (unit) => ({
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        beginAtZero: false,
        grace: '18%',
        unit,
        title: axisTitle(unit),
        ticks: { ...chartOptions.scales.y.ticks, callback: compactTick },
      },
    },
  });

  const scaleYield = (annual) => scaleAnnualYield(annual, yieldPeriod);
  const yieldLabel = yieldPeriodLabel(yieldPeriod);
  const yieldUnit = yieldSuffix(yieldPeriod);

  const slices = NIGHTSHADES_FACTION_META.map((f) => ({
    ...f,
    color: FACTION_COLORS[f.id],
    slice: project?.factions?.[f.id] || {},
  }));
  const night = project?.night;

  const roiOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => [f.id, t0RoiMap(f.slice)])),
    { timeframe, interval, fill: true },
  );

  const burnOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const series = burnSeries(f.slice, timeframe, interval);
      const days = series.rawLabels || [];
      return [f.id, seriesToDateMap(days, series.data)];
    })),
    { timeframe, interval, fill: true },
  );

  const burnPctOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const p = f.slice;
      const unit = Number(p?.config?.unitValue) || 1_000_000;
      const fromOwn = Number(p?.ownership?.currentMaxSupply);
      const fromCfg = Number(p?.config?.maxSupply);
      const maxNft = fromOwn > 0 ? fromOwn : (fromCfg > 0 ? fromCfg : 0);
      const maxToken = maxNft * unit;
      const series = burnSeries(p, timeframe, interval);
      const days = series.rawLabels || [];
      const pct = (series.data || []).map((burn) => (
        maxToken > 0 ? +Math.min(100, ((Number(burn) || 0) / maxToken) * 100).toFixed(2) : null
      ));
      return [f.id, seriesToDateMap(days, pct)];
    })),
    { timeframe, interval, fill: true },
  );

  const actOverlay = overlayFactionMaps(
    Object.fromEntries(slices.map((f) => {
      const hist = f.slice?.activation?.history || {};
      return [f.id, seriesToDateMap(hist.labels, hist.cumulative)];
    })),
    { timeframe, interval },
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
    { timeframe, interval },
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
    { timeframe, interval },
  );

  const roiRows = slices.map((f) => {
    const p = f.slice;
    const t0 = p.tiers?.[0];
    const floorCost = (p.market?.nftFloorEth || 0) * (p.market?.ethPriceUsd || 0);
    const actCost = (t0?.reqTokens || 0) * (p.market?.tokenPriceUsd || 0);
    const totalCost = floorCost + actCost;
    const roi = totalCost > 0 && t0 ? ((t0.trackedAnnualYieldUsd || 0) / totalCost) * 100 : 0;
    return { f, p, t0, floorCost, actCost, totalCost, roi };
  });
  const bestRoiRow = roiRows.reduce((a, b) => (b.roi > a.roi ? b : a), roiRows[0] || { roi: 0 });
  const cheapestRow = roiRows.reduce((a, b) => {
    if (!(b.totalCost > 0)) return a;
    return !a || b.totalCost < a.totalCost ? b : a;
  }, null);

  return (
    <div className="space-y-6 relative">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {slices.map((f) => {
          const fm = f.slice.market || {};
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFaction(f.id)}
              className="card p-4 text-left transition-colors hover:border-muted"
            >
              <Stat label={<FactionLabel color={f.color}>{f.label}</FactionLabel>} value={formatPrice(fm.tokenPriceUsd)} />
              <p className="mt-1.5 font-mono text-[11px] text-muted">
                {fm.nftFloorEth > 0 ? `${fm.nftFloorEth} ETH floor` : 'Floor pending'}
              </p>
            </button>
          );
        })}
      </div>

      <ShareSection id="roi" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Faction ROI"
          sub={`Cash-on-cash for a T0 Shade: annualized vault yield ÷ (NFT floor USD + activation tokens at spot). ${yieldBasisText(project)} Open a faction for the full table and volume slider.`}
        >
          <KpiStrip>
            <Stat
              label="Best CoC"
              value={bestRoiRow?.roi != null ? `${bestRoiRow.roi.toFixed(1)}%` : '—'}
              tone="accent"
              note={bestRoiRow?.f?.label}
            />
            <Stat
              label="Best yield"
              value={formatCurrency(scaleYield(bestRoiRow?.t0?.trackedAnnualYieldUsd || 0))}
              note={yieldUnit}
            />
            <Stat
              label="Cheapest entry"
              value={cheapestRow ? formatCurrency(cheapestRow.totalCost) : '—'}
              note={cheapestRow?.f?.label}
            />
          </KpiStrip>
        </Card>

        <Card flush eyebrow="Factions">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Faction</th>
                  <th className="px-3 py-3 font-normal">Base tier (T0)</th>
                  <th className="px-3 py-3 font-normal">Floor</th>
                  <th className="px-3 py-3 font-normal">Act. cost</th>
                  <th className="px-3 py-3 font-normal">
                    <div className="flex items-center gap-2">
                      <span>Yield <span className="normal-case">({yieldLabel})</span></span>
                      <YieldPeriodToggle value={yieldPeriod} onChange={setYieldPeriod} />
                    </div>
                  </th>
                  <th className="px-5 py-3 text-right font-normal">CoC</th>
                </tr>
              </thead>
              <tbody>
                {roiRows.map(({ f, p, t0, floorCost, actCost, roi }) => {
                  const isExpanded = expanded === f.id;
                  const leader = bestRoiRow?.f?.id === f.id && roi > 0;
                  return (
                    <React.Fragment key={f.id}>
                      <tr
                        onClick={() => setExpanded(isExpanded ? null : f.id)}
                        className="cursor-pointer border-b border-line-soft transition-colors hover:bg-panel-2"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setFaction(f.id); }}
                              className="flex items-center gap-2 text-[13px] text-ink hover:underline"
                            >
                              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                              {f.label}
                            </button>
                            {leader && <Tag tone="good">best</Tag>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-[13px] text-ink">{t0?.name || 'Shade'}</div>
                          <div className="font-mono text-[11px] text-faint">{formatNumber(t0?.reqTokens || 0)} {p.config?.ticker || f.ticker}</div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{floorCost > 0 ? formatCurrency(floorCost) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{actCost > 0 ? formatCurrency(actCost) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {formatCurrency(scaleYield(t0?.trackedAnnualYieldUsd || 0))}
                          {' '}
                          <span className="text-muted">{yieldUnit}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Tag tone="good">{roi.toFixed(2)}%</Tag>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-line-soft bg-panel-2/40">
                          <td colSpan="6" className="px-5 py-4">
                            <p className="eyebrow mb-3 text-faint">Daily yield · {t0?.name}</p>
                            <div className="relative h-32 w-full md:h-40">
                              {seriesHasInk(t0?.dailyYields) ? (
                                <Line
                                  data={{
                                    labels: t0.dailyDates,
                                    datasets: [{
                                      label: 'Daily Yield (USD)',
                                      data: t0.dailyYields,
                                      borderColor: f.color,
                                      borderWidth: 1.75,
                                      tension: 0.3,
                                      pointRadius: 0,
                                    }],
                                  }}
                                  options={baseChartOptions(t0.dailyDates, 'daily', { yUnit: 'USD', yTick: compactUsdTick })}
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
        </Card>
      </ShareSection>

      <ShareSection id="yield" className="scroll-mt-32">
        <Together
          title="T0 CoC ROI by faction"
          note="Shade-tier cash-on-cash from each market’s snapshots. Lines are separate — All does not average or sum ROI."
          labels={roiOverlay.labels}
          datasets={roiOverlay.datasets}
          options={percentChartOptions}
        />
      </ShareSection>

      <NightshadesNightSection night={night} />

      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Burn" sub="Each faction burns its own token. Open one to see its cumulative burn and price.">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                  className="rounded-xl border border-line p-4 text-left transition-colors hover:border-muted"
                >
                  <Stat label={<FactionLabel color={f.color}>{f.label}</FactionLabel>} value={formatNumber(burnt)} />
                  <p className="mt-1.5 font-mono text-[11px] text-muted">
                    {pct == null ? '—' : `${pct.toFixed(2)}%`} of supply · {formatNumber(units, 2)} units
                  </p>
                </button>
              );
            })}
          </div>
        </Card>
        <ChartSwitch
          initial="tokens"
          views={[
            {
              id: 'tokens',
              label: 'Cumulative',
              title: 'Cumulative tokens burnt',
              note: 'Each faction’s own token. Quiet days carry the last cumulative — a burn cannot reset.',
              body: togetherBody({
                labels: burnOverlay.labels,
                datasets: burnOverlay.datasets,
                options: countChartOptions('Tokens'),
              }),
            },
            {
              id: 'share',
              label: 'Share',
              title: 'Share of each faction’s token supply burnt (%)',
              note: 'Percent of that market’s cap, so a 3,000-NFT collection is comparable to the others.',
              body: togetherBody({
                labels: burnPctOverlay.labels,
                datasets: burnPctOverlay.datasets,
                options: percentChartOptions,
              }),
            },
          ]}
        />
      </ShareSection>

      <ShareSection id="activation" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Activation" sub="Active units per faction vault. Open one for its tier flow.">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {slices.map((f) => {
              const act = f.slice.activation || {};
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFaction(f.id)}
                  className="rounded-xl border border-line p-4 text-left transition-colors hover:border-muted"
                >
                  <Stat label={<FactionLabel color={f.color}>{f.label} active</FactionLabel>} value={formatNumber(act.activeCount || 0)} />
                  <p className="mt-1.5 font-mono text-[11px] text-muted">{(act.percentActivated || 0).toFixed(1)}% of 3,000</p>
                </button>
              );
            })}
          </div>
        </Card>
        <Card eyebrow="Active share" sub="Share of Nightshades active units">
          <SliceChart
            noun="Active"
            format={formatNumber}
            slices={slices.map((f) => ({
              label: f.label,
              value: f.slice.activation?.activeCount || 0,
              color: f.color,
            }))}
          />
        </Card>
        <Together
          title="Net active units"
          note="From each vault’s activation history. Missing days stay blank."
          labels={actOverlay.labels}
          datasets={actOverlay.datasets}
          options={countChartOptions('Units')}
        />
      </ShareSection>

      <ShareSection id="ownership" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Holders" sub="NFT and token wallets per faction.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {slices.map((f) => {
              const o = f.slice.ownership || {};
              const tokens = Number(o.tokenHolders) || Number(o.stonkHolders) || 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFaction(f.id)}
                  className="rounded-xl border border-line p-4 text-left transition-colors hover:border-muted"
                >
                  <p className="eyebrow mb-3 text-muted"><FactionLabel color={f.color}>{f.label}</FactionLabel></p>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="NFT" value={formatNumber(o.nftHolders || 0)} />
                    <Stat label="Token" value={formatNumber(tokens)} />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
        <ChartStack
          label="In holders"
          views={[
            {
              id: 'ns-nft',
              jump: 'NFT holders',
              title: 'NFT holders',
              note: 'Snapshot nftHolders when present; otherwise the live count as the latest point.',
              body: togetherBody({
                labels: nftOverlay.labels,
                datasets: nftOverlay.datasets,
                options: countChartOptions('Wallets'),
              }),
            },
            {
              id: 'ns-token',
              jump: 'Token holders',
              title: 'Token holders',
              note: 'hourly historicalGrowth when it exists; else snapshot tokenHolders.',
              body: togetherBody({
                labels: tokOverlay.labels,
                datasets: tokOverlay.datasets,
                options: countChartOptions('Wallets'),
              }),
            },
          ]}
        />
      </ShareSection>

      <MethodologyCard>
        <p><strong className="text-ink">All is a comparison, not a rollup:</strong> Ghosts, Zombies, Knights, and Watchers stay four series on one axis. Totals are not added together except on the Night LP health chart&apos;s combined line. Open a faction for that market&apos;s tiers, simulator, and vault detail.</p>
        <p><strong className="text-ink">Yield &amp; ROI:</strong> Cash-on-cash for a Shade is annualized vault RewardPaid ÷ (NFT floor USD + activation tokens at spot), split by Anvil tier weight. {yieldBasisText(project)} Night vault WETH is loot for The Night and is never counted as StonkBrokers StonkBooster.</p>
        <p><strong className="text-ink">The Night</strong> is the daily VRF strike. Favored factions keep their pools; struck factions can lose 20% of that pair&apos;s WETH to the vault (tokens sold for WETH). Unlabeled millions under Struck are vault token inventory, not strike size. Pool WETH over time overwrites the same UTC day on each hourly run until the series grows.</p>
      </MethodologyCard>
    </div>
  );
}
