import React, { useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { compactUsd } from './kit';
import { SliceChart } from './SliceChart';
import { formatLabels } from '../lib/dates';
import {
  barDatasets,
  mixPercentCols,
  protocolFeeCols,
  seriesHasInk,
  tierYieldUsdDatasets,
  tokenPriceDataset,
  smartLpHistory,
  lockedLpHistory,
  topPoolBars,
  pairTvlSlices,
  tvlByModeFromVaults,
  tierActiveDatasets,
  ownershipHistory,
  windowSeries,
} from '../lib/yieldHistory';
import {
  activityChartOptions,
  activityDatasets,
  baseChartOptions,
  barThickness,
  compactTick,
  compactUsdTick,
  dualAxisOptions,
  percentStackOptions,
  percentTick,
  usdStackOptions,
  PAIR_COLORS,
  STREAM_COLORS,
  PROJECT_COLORS,
  levelAxis,
} from '../lib/charts';

export function EmptyChart({ children = 'No series recorded yet' }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted text-center px-4">
      {children}
    </div>
  );
}

export function ChartPanel({ title, note, children, className = '', tall = false, corner = null, fit = false }) {
  return (
    <section className={`card ${className}`}>
      {(title || note || corner) ? (
        <header className={`flex items-start justify-between gap-3 pt-4 pl-4 sm:pl-5 ${corner ? 'pr-14' : 'pr-4 sm:pr-5'}`}>
          <div className="min-w-0">
            {title ? <h3 className="eyebrow text-muted">{title}</h3> : null}
            {note ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">{note}</p> : null}
          </div>
          {corner}
        </header>
      ) : null}
      <div className={`relative w-full px-4 pb-4 sm:px-5 sm:pb-5 ${fit ? '' : (tall ? 'h-72 sm:h-[28rem]' : 'h-52 sm:h-64 md:h-80')}`}>
        {children}
      </div>
    </section>
  );
}


export function YieldUsdPricePanel({ snaps, tiers, chartOptions }) {
  const yieldSets = tierYieldUsdDatasets(snaps, tiers);
  const price = tokenPriceDataset(snaps);
  const has = seriesHasInk(yieldSets.flatMap((d) => d.data)) || seriesHasInk(price.data);
  return (
    <ChartPanel
      title="Annualized yield (USD) vs token price"
      note="ROI % moves when the token price moves. This is the payout leg on the left, spot price on the right."
    >
      {has ? (
        <Line
          data={{ labels: formatLabels(snaps.map((s) => s.date)), datasets: [...yieldSets, price] }}
          options={dualAxisOptions({
            leftTick: compactUsdTick,
            rightTick: compactUsdTick,
            rightColor: '#94a3b8',
            labels: snaps.map((s) => s.date),
            leftKind: 'level',
            rightKind: 'level',
            leftValues: yieldSets.flatMap((d) => d.data),
            rightValues: price.data,
            leftUnit: 'USD / yr',
            rightUnit: 'USD',
          })}
        />
      ) : (
        <EmptyChart />
      )}
    </ChartPanel>
  );
}

export function HolderRevenuePanel({ labels, data, note, title, interval = 'daily' }) {
  const has = seriesHasInk(data);
  return (
    <ChartPanel
      title={title || 'Holder revenue (USD)'}
      note={note || 'What flowed to NFT / token holders that day. This is the payout leg, not protocol-kept revenue.'}
    >
      {has ? (
        <Bar
          data={{
            labels,
            datasets: [{
              label: 'Holder revenue',
              data,
              backgroundColor: STREAM_COLORS.holdersRev,
              borderRadius: 3,
              maxBarThickness: barThickness((data || []).length),
              skipNull: true,
            }],
          }}
          options={usdStackOptions(labels, interval)}
        />
      ) : (
        <EmptyChart>No holder-revenue days in this window</EmptyChart>
      )}
    </ChartPanel>
  );
}

function dailyTotals(cols) {
  const n = Math.max(0, ...(cols || []).map((c) => c.data?.length || 0));
  return Array.from({ length: n }, (_, i) => (cols || []).reduce((s, c) => s + (Number(c.data?.[i]) || 0), 0));
}

/** A line helps when no single stream owns the day's dollars, so the stack top is hard to follow. */
function totalNeedsLine(cols) {
  if ((cols || []).length < 3) return false;
  const n = cols[0]?.data?.length || 0;
  let mixed = 0;
  let seen = 0;
  for (let i = 0; i < n; i++) {
    let total = 0;
    let maxPart = 0;
    for (const c of cols) {
      const v = Number(c.data?.[i]) || 0;
      total += v;
      if (v > maxPart) maxPart = v;
    }
    if (!(total > 0)) continue;
    seen += 1;
    if (maxPart / total < 0.85) mixed += 1;
  }
  return seen >= 8 && mixed / seen > 0.4;
}

function MixToggle({ mix, onChange }) {
  const btn = (on, label) => (
    <button
      type="button"
      onClick={() => onChange(on)}
      className={`rounded-md px-2 py-1 font-mono text-[10px] ${on === mix ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex shrink-0 rounded-lg border border-line p-0.5">
      {btn(false, 'USD')}
      {btn(true, 'Mix')}
    </div>
  );
}

export function ProtocolFeeVolumePanels({ labels, cols, kind, holder, note, title, interval = 'daily' }) {
  const [mixOn, setMixOn] = useState(false);
  const holderInk = holder && seriesHasInk(holder.data);
  const holderPanel = holderInk ? (
    <HolderRevenuePanel labels={holder.labels || labels} data={holder.data} note={holder.note} title={holder.title} interval={interval} />
  ) : null;

  if (kind === 'ledger' || kind === 'cashflow') return holderPanel;

  const fees = protocolFeeCols(cols).filter((c) => seriesHasInk(c.data));
  const mix = mixPercentCols(fees).filter((c) => seriesHasInk(c.data));
  const showMix = mixOn && mix.length > 1;
  const totals = dailyTotals(fees);
  const withTotal = !showMix && totalNeedsLine(fees);
  const datasets = showMix
    ? barDatasets(mix, { stacked: true })
    : [
      ...barDatasets(fees, { stacked: true }),
      ...(withTotal ? [{
        type: 'line',
        label: 'Daily total',
        data: totals,
        borderColor: '#e7e9ec',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        order: 0,
        totalLine: true,
      }] : []),
    ];
  return (
    <>
      <ChartPanel
        tall
        title={title || 'Protocol revenue (USD)'}
        note={note || (showMix
          ? 'Share of protocol revenue that day. Days with no rev are blank.'
          : 'What the protocol charged or kept that day. The tooltip total is the stack.')}
        corner={mix.length > 1 ? <MixToggle mix={mixOn} onChange={setMixOn} /> : null}
      >
        {fees.length ? (
          <Bar
            data={{ labels, datasets }}
            options={showMix ? percentStackOptions(labels, interval) : usdStackOptions(labels, interval)}
          />
        ) : (
          <EmptyChart>No revenue days in this window</EmptyChart>
        )}
      </ChartPanel>
      {holderPanel}
    </>
  );
}

const MODE_FILL = {
  'Full Range': 'rgba(0,168,4,0.35)',
  'Balanced Band': 'rgba(251,191,36,0.35)',
  Ask: 'rgba(56,189,248,0.3)',
};

function sumSeries(data) {
  return (data || []).reduce((s, v) => s + (Number(v) || 0), 0);
}

export function ActivityChart({
  labels,
  net,
  ins,
  outs,
  interval = 'daily',
  lineColor = '#38bdf8',
  lineLabel = 'Net active',
  outColor = '#f43f5e',
}) {
  return (
    <Bar
      data={{
        labels,
        datasets: activityDatasets({
          net,
          ins,
          outs,
          lineColor,
          lineLabel,
          outColor,
          barSize: barThickness(labels?.length || 0),
        }),
      }}
      options={activityChartOptions(labels, net, ins, outs, interval)}
    />
  );
}

export function SmartLpChartPanels({ snaps, smartLp, vaults }) {
  const modes = tvlByModeFromVaults(vaults);
  const hist = smartLpHistory(snaps, { ...smartLp, ...modes });
  const slices = pairTvlSlices(vaults);
  const hasTvl = seriesHasInk(hist.tvl);
  const hasFees = seriesHasInk(hist.gross) || seriesHasInk(hist.skim);
  const modeSeries = [
    { label: 'Full Range', data: hist.fr, color: '#00a804' },
    { label: 'Balanced Band', data: hist.bb, color: '#fbbf24' },
    { label: 'Ask', data: hist.ask, color: '#38bdf8' },
  ].filter((m) => seriesHasInk(m.data)).sort((a, b) => sumSeries(b.data) - sumSeries(a.data));
  const hasMode = modeSeries.length > 0;
  if (!hasTvl && !hasFees && !slices.length && !hasMode) return null;
  const depositorNet = hist.gross.map((g, i) => {
    const skim = hist.skim[i];
    if (g == null && skim == null) return null;
    return Math.max(0, (Number(g) || 0) - (Number(skim) || 0));
  });
  return (
    <>
      {hasMode ? (
        <ChartPanel title="Smart LP TVL" note="Stacked by mode. The top edge is total vault TVL. A $0 hourly stamp is a missed read and is spanned.">
          <Line
            data={{
              labels: hist.labels,
              datasets: modeSeries.map((m) => ({
                label: m.label,
                data: m.data,
                borderColor: m.color,
                backgroundColor: MODE_FILL[m.label],
                fill: true,
                tension: 0.3,
                spanGaps: true,
                stack: 'tvl',
                pointRadius: 0,
              })),
            }}
            options={usdStackOptions(hist.labels)}
          />
        </ChartPanel>
      ) : hasTvl ? (
        <ChartPanel title="Smart LP TVL" note="Point-in-time vault TVL. A $0 hourly stamp is treated as a missed read and spanned, not a drained vault.">
          <Line
            data={{
              labels: hist.labels,
              datasets: [{
                label: 'Vault TVL (USD)',
                data: hist.tvl,
                borderColor: '#fbbf24',
                backgroundColor: 'rgba(251,191,36,0.12)',
                fill: false,
                tension: 0.3,
                spanGaps: true,
              }],
            }}
            options={dualAxisOptions({
              leftTick: compactUsdTick,
              labels: hist.labels,
              leftKind: 'level',
              leftValues: hist.tvl,
              leftUnit: 'USD',
            })}
          />
        </ChartPanel>
      ) : null}
      {hasFees ? (
        <ChartPanel title="Daily depositor fees vs Smart LP protocol rev" note="Depositor net under the protocol skim. The skim’s share of the bar is that day’s take rate.">
          <Bar
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'Depositor net', data: depositorNet, backgroundColor: '#fbbf24', maxBarThickness: barThickness(hist.labels.length), skipNull: true, stack: 'fees' },
                { label: 'Protocol skim', data: hist.skim, backgroundColor: '#38bdf8', maxBarThickness: barThickness(hist.labels.length), skipNull: true, stack: 'fees', shareIsTakeRate: true },
              ],
            }}
            options={usdStackOptions(hist.labels)}
          />
        </ChartPanel>
      ) : null}
      {slices.length ? (
        <ChartPanel fit title="TVL by pair" note="Live vault list. No extra fetch.">
          <SliceChart
            noun="TVL"
            format={compactUsd}
            slices={slices.map((s, i) => ({
              label: s.label,
              value: s.value,
              color: PAIR_COLORS[i % PAIR_COLORS.length],
            }))}
          />
        </ChartPanel>
      ) : null}
    </>
  );
}

export function BlackHoleChartPanels({ snaps, lockedLp, ticker = 'STONK' }) {
  const hist = lockedLpHistory(snaps, lockedLp || {});
  const top = topPoolBars(lockedLp?.pools);
  const hasLock = seriesHasInk(hist.stonk);
  if (!hasLock && !top.data.length) return null;
  return (
    <>
      {top.data.length ? (
        <ChartPanel title="Top locked pools (USD)" note="Largest Black Hole pairs by pool reserves right now.">
          <Bar
            data={{
              labels: top.labels,
              datasets: [{ label: 'Pool liquidity (USD)', data: top.data, backgroundColor: '#fb923c', borderRadius: 4 }],
            }}
            options={{
              ...usdStackOptions(),
              indexAxis: 'y',
              scales: {
                ...usdStackOptions().scales,
                x: { ...usdStackOptions().scales.y, stacked: false },
                y: { ticks: { color: '#94a3b8' }, grid: { display: false } },
              },
            }}
          />
        </ChartPanel>
      ) : null}
      <ChartPanel title={`${ticker} locked over time`} note="Tokens sitting in Uniswap v4 PoolManager and DexScreener pool contracts. History is reconstructed from Transfer folds; the latest point is live.">
        {hasLock ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [
                {
                  label: `${ticker} locked`,
                  data: hist.stonk,
                  borderColor: '#8b5cf6',
                  backgroundColor: 'rgba(139,92,246,0.12)',
                  fill: false,
                  tension: 0.3,
                  spanGaps: true,
                  yAxisID: 'y',
                },
                {
                  label: 'Pool reserves (USD)',
                  data: hist.usd,
                  borderColor: '#94a3b8',
                  borderDash: [4, 4],
                  tension: 0.3,
                  pointRadius: 0,
                  spanGaps: true,
                  yAxisID: 'y1',
                },
              ],
            }}
            options={dualAxisOptions({
              leftTick: compactTick,
              rightTick: compactUsdTick,
              rightColor: '#94a3b8',
              labels: hist.labels,
              leftKind: 'level',
              rightKind: 'level',
              leftValues: hist.stonk,
              rightValues: hist.usd,
              leftUnit: 'Tokens',
              rightUnit: 'USD',
            })}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartPanel>
    </>
  );
}

export function ActivationStackPanel({ snaps, tiers, breakdown }) {
  const sets = tierActiveDatasets(snaps, tiers, breakdown);
  const has = seriesHasInk(sets.flatMap((d) => d.data));
  const labels = formatLabels(snaps.map((s) => s.date));
  const thick = barThickness(labels.length);
  const base = baseChartOptions(labels, 'daily', { yUnit: 'Units' });
  const stacked = {
    ...base,
    scales: {
      ...base.scales,
      x: { ...base.scales.x, stacked: true },
      y: { ...base.scales.y, stacked: true, beginAtZero: true, unit: 'Units' },
    },
  };
  return (
    <ChartPanel title="Active units by tier" note="Stacked from daily snapshots. Older days stay empty until a run records the breakdown.">
      {has ? (
        <Bar
          data={{ labels, datasets: sets.map((d) => ({ ...d, maxBarThickness: thick })) }}
          options={stacked}
        />
      ) : (
        <EmptyChart>Tier mix history starts after the next snapshot write</EmptyChart>
      )}
    </ChartPanel>
  );
}

function seriesPeak(data) {
  let peak = 0;
  for (const v of data || []) {
    const n = Number(v);
    if (Number.isFinite(n) && n > peak) peak = n;
  }
  return peak;
}

export function OwnershipHistoryPanels({ snaps, live }) {
  const hist = ownershipHistory(snaps, live);
  const hasHolders = seriesHasInk(hist.token) || seriesHasInk(hist.nft);
  const hasConc = seriesHasInk(hist.concentration);
  const nftPeak = seriesPeak(hist.nft);
  const tokenPeak = seriesPeak(hist.token);
  const smaller = Math.min(nftPeak, tokenPeak);
  const larger = Math.max(nftPeak, tokenPeak);
  const sharedAxis = !(smaller > 0) || larger / smaller <= 3;
  const latestBreadth = [...(hist.concentration || [])].reverse().find((v) => Number.isFinite(Number(v)));
  const holderOptions = sharedAxis
    ? (() => {
      const base = baseChartOptions(hist.labels, 'daily', { yUnit: 'Wallets', yTick: compactTick });
      return {
        ...base,
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ...levelAxis(base.scales.y.ticks, [hist.nft, hist.token]),
            unit: 'Wallets',
            title: base.scales.y.title,
          },
        },
      };
    })()
    : dualAxisOptions({
      leftTick: compactTick,
      rightTick: compactTick,
      rightColor: '#00a804',
      labels: hist.labels,
      leftKind: 'level',
      rightKind: 'level',
      leftValues: hist.nft,
      rightValues: hist.token,
      leftUnit: 'Wallets',
      rightUnit: 'Wallets',
    });
  return (
    <>
      <ChartPanel title="NFT vs token holders" note="NFT wallets exclude the AMM vault. Token holders are addresses with at least one whole token. One axis when the two series are within 3×.">
        {hasHolders ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'NFT holders', data: hist.nft, borderColor: '#8b5cf6', tension: 0.3, spanGaps: true, yAxisID: 'y' },
                { label: 'Token holders', data: hist.token, borderColor: '#00a804', tension: 0.3, spanGaps: true, yAxisID: sharedAxis ? 'y' : 'y1' },
              ],
            }}
            options={holderOptions}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartPanel>
      <ChartPanel title="Holder breadth" note="Unique NFT wallets ÷ (collection size − AMM vault).">
        {hasConc ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [{
                label: 'Holder breadth',
                data: hist.concentration,
                borderColor: '#14b8a6',
                tension: 0.3,
                spanGaps: true,
                pointRadius: 0,
                labelEnd: true,
                endLabel: latestBreadth == null ? '' : `${Number(latestBreadth).toFixed(1)}%`,
              }],
            }}
            options={(() => {
              const conc = baseChartOptions(hist.labels, 'daily', { yUnit: '%', yTick: percentTick });
              return {
                ...conc,
                plugins: { ...conc.plugins, legend: { display: false } },
                scales: {
                  ...conc.scales,
                  y: {
                    ...conc.scales.y,
                    ...levelAxis({ color: '#94a3b8', callback: percentTick }, hist.concentration),
                    unit: '%',
                    title: conc.scales.y.title,
                  },
                },
              };
            })()}
          />
        ) : (
          <EmptyChart>Holder breadth starts after the next snapshot write</EmptyChart>
        )}
      </ChartPanel>
    </>
  );
}

const ONBOARD_PROJECTS = [
  { key: 'stonk', label: 'StonkBrokers' },
  { key: 'mancer', label: 'Mancer' },
  { key: 'cardwall', label: 'The Card Wall' },
  { key: 'tickeryard', label: 'TickerYard' },
  { key: 'interns', label: 'Interns' },
];

function trimOnboardLead(dates, vals) {
  const i = (vals || []).findIndex((v) => Number(v) > 0);
  if (i <= 0) return { dates: dates || [], vals: vals || [] };
  return { dates: dates.slice(i), vals: vals.slice(i) };
}

function onboardWindow(data, key, timeframe, interval, trim = false) {
  const row = data?.onboarding?.byProject?.[key];
  const dates = row?.daily?.dates || data?.onboarding?.daily?.dates || [];
  const vals = row?.daily?.wallets || [];
  const sliced = windowSeries(dates, vals, timeframe, interval, 'last');
  if (!trim) return sliced;
  const t = trimOnboardLead(sliced.labels, sliced.data);
  return { labels: t.dates, data: t.vals };
}

/** One project's cumulative onboard line. */
export function OnboardLinePanel({ data, projectKey, timeframe, interval, color, name }) {
  const sliced = onboardWindow(data, projectKey, timeframe, interval, true);
  const labels = formatLabels(sliced.labels);
  const opts = baseChartOptions(labels, interval, { yUnit: 'Wallets' });
  return (
    <ChartPanel
      title={`${name || 'Chain'} onboard`}
      note="Wallets whose first cluster buy or mint of this project was one of their first 10 txs on Robinhood Chain."
    >
      {seriesHasInk(sliced.data) ? (
        <Line
          data={{
            labels,
            datasets: [{
              label: 'Onboarded wallets',
              data: sliced.data,
              borderColor: color || PROJECT_COLORS[projectKey] || '#a78bfa',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
            }],
          }}
          options={{
            ...opts,
            plugins: { ...opts.plugins, legend: { display: false } },
            scales: {
              ...opts.scales,
              y: { ...opts.scales.y, ...levelAxis(opts.scales.y.ticks, sliced.data) },
            },
          }}
        />
      ) : (
        <EmptyChart>No onboard history yet</EmptyChart>
      )}
    </ChartPanel>
  );
}

function indexToStart(data) {
  let base = 0;
  for (const v of data || []) {
    const n = Number(v);
    if (n > 0) {
      base = n;
      break;
    }
  }
  if (!(base > 0)) return (data || []).map(() => null);
  return (data || []).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n / base : null;
  });
}

/** Ecosystem overlay. Shared wallets axis, unless All dwarfs the next project. */
export function OnboardClusterPanel({ data, timeframe, interval }) {
  const o = data?.onboarding || {};
  const total = windowSeries(o.daily?.dates || [], o.daily?.wallets || [], timeframe, interval, 'last');
  const labels = formatLabels(total.labels);
  const projects = ONBOARD_PROJECTS.map(({ key, label }) => {
    const sliced = onboardWindow(data, key, timeframe, interval, false);
    return { label, data: sliced.data, color: PROJECT_COLORS[key] };
  }).filter((ds) => seriesHasInk(ds.data));
  const allPeak = seriesPeak(total.data);
  const nextPeak = Math.max(0, ...projects.map((ds) => seriesPeak(ds.data)));
  const indexed = nextPeak > 0 && allPeak > nextPeak * 5;
  const mapSeries = (data) => (indexed ? indexToStart(data) : data);
  const plotted = [mapSeries(total.data), ...projects.map((ds) => mapSeries(ds.data))];
  const opts = baseChartOptions(labels, interval, { yUnit: indexed ? '× start' : 'Wallets' });
  const datasets = [
    {
      label: 'All',
      data: plotted[0],
      borderColor: '#e5e7eb',
      borderDash: [5, 4],
      borderWidth: 1.5,
      tension: 0.3,
      pointRadius: 0,
      spanGaps: true,
    },
    ...projects.map((ds, i) => ({
      label: ds.label,
      data: plotted[i + 1],
      borderColor: ds.color,
      tension: 0.3,
      pointRadius: 0,
      spanGaps: true,
    })),
  ];
  return (
    <ChartPanel
      title="Chain onboard over time"
      note={indexed
        ? 'All is more than 5× the next project, so each line is indexed to its first wallet in this window.'
        : 'Cumulative unique EOAs. All is the cluster total; each line is first-touch attributed to one project.'}
    >
      {seriesHasInk(total.data) ? (
        <Line
          data={{ labels, datasets }}
          options={{
            ...opts,
            plugins: { ...opts.plugins, legend: { display: true, labels: { color: '#94a3b8', boxWidth: 10 } } },
            scales: {
              ...opts.scales,
              y: { ...opts.scales.y, ...levelAxis(opts.scales.y.ticks, plotted) },
            },
          }}
        />
      ) : (
        <EmptyChart>No onboard history yet</EmptyChart>
      )}
    </ChartPanel>
  );
}
