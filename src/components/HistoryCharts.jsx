import React from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatLabels } from '../lib/dates';
import {
  barDatasets,
  mixPercentCols,
  protocolFeeCols,
  seriesHasInk,
  tierYieldUsdDatasets,
  tokenPriceDataset,
  paybackYearDatasets,
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
  baseChartOptions,
  compactTick,
  compactUsdTick,
  dualAxisOptions,
  percentStackOptions,
  usdStackOptions,
  PAIR_COLORS,
  STREAM_COLORS,
  PROJECT_COLORS,
  barThickness,
  levelAxis,
} from '../lib/charts';

export function EmptyChart({ children = 'No series recorded yet' }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted text-center px-4">
      {children}
    </div>
  );
}

export function ChartPanel({ title, note, children, className = '', tall = false }) {
  return (
    <section className={`card ${className}`}>
      {(title || note) ? (
        <header className="px-4 pt-4 sm:px-5 sm:pt-5">
          {title ? <h3 className="eyebrow text-muted">{title}</h3> : null}
          {note ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">{note}</p> : null}
        </header>
      ) : null}
      <div className={`relative w-full px-4 pb-4 sm:px-5 sm:pb-5 ${tall ? 'h-72 sm:h-[28rem]' : 'h-52 sm:h-64 md:h-80'}`}>
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
          })}
        />
      ) : (
        <EmptyChart />
      )}
    </ChartPanel>
  );
}

export function PaybackPanel({ snaps, tiers, floorCostUsd, tokenPriceUsd }) {
  const sets = paybackYearDatasets(snaps, tiers, { floorCostUsd, tokenPriceUsd });
  const has = seriesHasInk(sets.flatMap((d) => d.data));
  return (
    <ChartPanel
      title="Payback horizon (years)"
      note="Entry cost ÷ annualized yield on each snapshot. Lower is faster."
    >
      {has ? (
        <Line data={{ labels: formatLabels(snaps.map((s) => s.date)), datasets: sets }} options={baseChartOptions(snaps.map((s) => s.date))} />
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

export function ProtocolFeeVolumePanels({ labels, cols, kind, holder, note, title, mixTitle, interval = 'daily' }) {
  const holderInk = holder && seriesHasInk(holder.data);
  const holderPanel = holderInk ? (
    <HolderRevenuePanel labels={holder.labels || labels} data={holder.data} note={holder.note} title={holder.title} interval={interval} />
  ) : null;

  if (kind === 'ledger' || kind === 'cashflow') return holderPanel;

  const fees = protocolFeeCols(cols).filter((c) => seriesHasInk(c.data));
  const mix = mixPercentCols(fees).filter((c) => seriesHasInk(c.data));
  return (
    <>
      <ChartPanel
        tall
        title={title || "Protocol revenue (USD)"}
        note={note || "Money the protocol charged or kept: AMM, Clock-In locker fees, V2 snipe / curve tax, Partner Revenue Share, and Smart LP skim. Clock-In bars are Safety Deposit locker fees (then 90% community / 10% protocol). Nightshades 99% anti-snipe stays in the curve and is not this stack. Bonding swap volume is not revenue and is not plotted here."}
      >
        {fees.length ? (
          <Bar data={{ labels, datasets: barDatasets(fees, { stacked: true }) }} options={usdStackOptions(labels, interval)} />
        ) : (
          <EmptyChart>No revenue days in this window</EmptyChart>
        )}
      </ChartPanel>
      {mix.length > 1 ? (
        <ChartPanel title={mixTitle || "Revenue mix (100%)"} note="Share of protocol revenue that day. Days with no rev are blank. Swap volume is excluded.">
          <Bar data={{ labels, datasets: barDatasets(mix, { stacked: true }) }} options={percentStackOptions(labels, interval)} />
        </ChartPanel>
      ) : null}
      {holderPanel}
    </>
  );
}

export function SmartLpChartPanels({ snaps, smartLp, vaults }) {
  const modes = tvlByModeFromVaults(vaults);
  const hist = smartLpHistory(snaps, { ...smartLp, ...modes });
  const slices = pairTvlSlices(vaults);
  const hasTvl = seriesHasInk(hist.tvl);
  const hasFees = seriesHasInk(hist.gross) || seriesHasInk(hist.skim);
  const hasMode = seriesHasInk(hist.fr) || seriesHasInk(hist.bb) || seriesHasInk(hist.ask);
  if (!hasTvl && !hasFees && !slices.length) return null;
  return (
    <>
      <ChartPanel title="Smart LP TVL" note="Point-in-time vault TVL. A $0 hourly stamp is treated as a missed read and spanned, not a drained vault.">
        {hasTvl ? (
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
            })}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartPanel>
      {hasMode ? (
        <ChartPanel title="TVL by mode" note="Full Range, Balanced Band, and Ask.">
          <Bar
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'Full Range', data: hist.fr, backgroundColor: '#00a804', stack: 'm', maxBarThickness: barThickness(hist.labels.length) },
                { label: 'Balanced Band', data: hist.bb, backgroundColor: '#fbbf24', stack: 'm', maxBarThickness: barThickness(hist.labels.length) },
                { label: 'Ask', data: hist.ask, backgroundColor: '#38bdf8', stack: 'm', maxBarThickness: barThickness(hist.labels.length) },
              ],
            }}
            options={usdStackOptions(hist.labels)}
          />
        </ChartPanel>
      ) : null}
      {hasFees ? (
        <ChartPanel title="Daily depositor fees vs Smart LP protocol rev" note="Gross Uniswap fees collected that day, and the protocol skim. Empty days mean no FeesCollected in the window.">
          <Bar
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'Depositor fees', data: hist.gross, backgroundColor: '#fbbf24', maxBarThickness: barThickness(hist.labels.length), skipNull: true },
                { label: 'Smart LP Protocol Revenue', data: hist.skim, backgroundColor: '#38bdf8', maxBarThickness: barThickness(hist.labels.length), skipNull: true },
              ],
            }}
            options={usdStackOptions(hist.labels)}
          />
        </ChartPanel>
      ) : null}
      {slices.length ? (
        <ChartPanel title="TVL by pair" note="Live vault list. No extra fetch.">
          <div className="h-full flex items-center justify-center">
            <Doughnut
              data={{
                labels: slices.map((s) => s.label),
                datasets: [{
                  data: slices.map((s) => s.value),
                  backgroundColor: slices.map((_, i) => PAIR_COLORS[i % PAIR_COLORS.length]),
                  borderWidth: 0,
                }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } } }}
            />
          </div>
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
  const stacked = {
    ...baseChartOptions(labels),
    scales: {
      ...baseChartOptions(labels).scales,
      x: { ...baseChartOptions(labels).scales.x, stacked: true },
      y: { ...baseChartOptions(labels).scales.y, stacked: true, beginAtZero: true },
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

export function OwnershipHistoryPanels({ snaps, live }) {
  const hist = ownershipHistory(snaps, live);
  const hasHolders = seriesHasInk(hist.token) || seriesHasInk(hist.nft);
  const hasConc = seriesHasInk(hist.concentration);
  return (
    <>
      <ChartPanel title="NFT holders vs token holders" note="NFT wallets exclude the AMM vault. Token holders are addresses with at least one whole token. Last point is live.">
        {hasHolders ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'NFT holders', data: hist.nft, borderColor: '#8b5cf6', tension: 0.3, spanGaps: true, yAxisID: 'y' },
                { label: 'Token holders', data: hist.token, borderColor: '#00a804', tension: 0.3, spanGaps: true, yAxisID: 'y1' },
              ],
            }}
            options={dualAxisOptions({
              leftTick: compactTick,
              rightTick: compactTick,
              rightColor: '#00a804',
              labels: hist.labels,
              leftKind: 'level',
              rightKind: 'level',
              leftValues: hist.nft,
              rightValues: hist.token,
            })}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartPanel>
      <ChartPanel title="Ownership concentration" note="Unique NFT wallets ÷ (collection size − AMM vault).">
        {hasConc ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [{
                label: 'Concentration %',
                data: hist.concentration,
                borderColor: '#14b8a6',
                backgroundColor: 'rgba(20,184,166,0.1)',
                fill: false,
                tension: 0.3,
                spanGaps: true,
              }],
            }}
            options={{
              ...baseChartOptions(hist.labels),
              scales: {
                ...baseChartOptions(hist.labels).scales,
                y: {
                  ...baseChartOptions(hist.labels).scales.y,
                  ...levelAxis(
                    { color: '#94a3b8', callback: (v) => `${compactTick(v)}%` },
                    hist.concentration,
                  ),
                },
              },
            }}
          />
        ) : (
          <EmptyChart>Concentration history starts after the next snapshot write</EmptyChart>
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
  const opts = baseChartOptions(labels, interval);
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

/** Ecosystem overlay: same unit (wallets), so sharing an axis is fair. */
export function OnboardClusterPanel({ data, timeframe, interval }) {
  const o = data?.onboarding || {};
  const total = windowSeries(o.daily?.dates || [], o.daily?.wallets || [], timeframe, interval, 'last');
  const labels = formatLabels(total.labels);
  const opts = baseChartOptions(labels, interval);
  const datasets = [
    {
      label: 'All',
      data: total.data,
      borderColor: '#e5e7eb',
      borderDash: [5, 4],
      borderWidth: 1.5,
      tension: 0.3,
      pointRadius: 0,
      spanGaps: true,
    },
    ...ONBOARD_PROJECTS.map(({ key, label }) => {
      const sliced = onboardWindow(data, key, timeframe, interval, false);
      return {
        label,
        data: sliced.data,
        borderColor: PROJECT_COLORS[key],
        tension: 0.3,
        pointRadius: 0,
        spanGaps: true,
      };
    }).filter((ds) => seriesHasInk(ds.data)),
  ];
  return (
    <ChartPanel
      title="Chain onboard over time"
      note="Cumulative unique EOAs. All is the cluster total; each line is first-touch attributed to one project."
    >
      {seriesHasInk(total.data) ? (
        <Line
          data={{ labels, datasets }}
          options={{
            ...opts,
            plugins: { ...opts.plugins, legend: { display: true, labels: { color: '#94a3b8', boxWidth: 10 } } },
            scales: {
              ...opts.scales,
              y: { ...opts.scales.y, ...levelAxis(opts.scales.y.ticks, total.data) },
            },
          }}
        />
      ) : (
        <EmptyChart>No onboard history yet</EmptyChart>
      )}
    </ChartPanel>
  );
}
