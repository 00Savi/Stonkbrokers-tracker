import React from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatLabels } from '../lib/dates';
import {
  barDatasets,
  mixPercentCols,
  protocolFeeCols,
  volumeCols,
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
} from '../lib/yieldHistory';
import {
  baseChartOptions,
  compactTick,
  compactUsdTick,
  dualAxisOptions,
  percentStackOptions,
  usdStackOptions,
  PAIR_COLORS,
} from '../lib/charts';

export function EmptyChart({ children = 'No series recorded yet' }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-4">
      {children}
    </div>
  );
}

export function ChartPanel({ title, note, children, className = '' }) {
  return (
    <div className={`bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 ${className}`}>
      {title ? <h3 className="text-sm font-bold text-white mb-1">{title}</h3> : null}
      {note ? <p className="text-xs text-slate-400 mb-4">{note}</p> : null}
      <div className="relative h-52 sm:h-64 md:h-80 w-full">{children}</div>
    </div>
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
          options={dualAxisOptions({ leftTick: compactUsdTick, rightTick: compactUsdTick, rightColor: '#94a3b8' })}
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
        <Line data={{ labels: formatLabels(snaps.map((s) => s.date)), datasets: sets }} options={baseChartOptions()} />
      ) : (
        <EmptyChart />
      )}
    </ChartPanel>
  );
}

export function ProtocolFeeVolumePanels({ labels, cols, kind }) {
  if (kind === 'ledger' || kind === 'cashflow') return null;
  const fees = protocolFeeCols(cols).filter((c) => seriesHasInk(c.data));
  const vol = volumeCols(cols).filter((c) => seriesHasInk(c.data));
  const mix = mixPercentCols(fees).filter((c) => seriesHasInk(c.data));
  const combined = [
    ...barDatasets(fees, { stacked: true }),
    ...barDatasets(vol).map((d) => ({ ...d, stack: 'volume' })),
  ];
  return (
    <>
      <ChartPanel
        title="Protocol fees & launch volume (USD)"
        note="Stacked AMM, Clock-In, curve tax, and Smart LP skim. Purple is launch + bonding quote volume — not a fee, grouped beside the stack."
      >
        {fees.length || vol.length ? (
          <Bar data={{ labels, datasets: combined }} options={usdStackOptions()} />
        ) : (
          <EmptyChart>No fee days in this window</EmptyChart>
        )}
      </ChartPanel>
      {mix.length ? (
        <ChartPanel title="Fee mix (100%)" note="Share of protocol fees that day. Days with no fees are blank. Volume is excluded.">
          <Bar data={{ labels, datasets: barDatasets(mix, { stacked: true }) }} options={percentStackOptions()} />
        </ChartPanel>
      ) : null}
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
      <ChartPanel title="Smart LP TVL" note="Point-in-time vault TVL. History starts when snapshots record it; the latest point is live.">
        {hasTvl ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [{
                label: 'Vault TVL (USD)',
                data: hist.tvl,
                borderColor: '#fbbf24',
                backgroundColor: 'rgba(251,191,36,0.12)',
                fill: true,
                tension: 0.3,
                spanGaps: true,
              }],
            }}
            options={dualAxisOptions({ leftTick: compactUsdTick })}
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
                { label: 'Full Range', data: hist.fr, backgroundColor: '#00a804', stack: 'm', maxBarThickness: 28 },
                { label: 'Balanced Band', data: hist.bb, backgroundColor: '#fbbf24', stack: 'm', maxBarThickness: 28 },
                { label: 'Ask', data: hist.ask, backgroundColor: '#38bdf8', stack: 'm', maxBarThickness: 28 },
              ],
            }}
            options={usdStackOptions()}
          />
        </ChartPanel>
      ) : null}
      {hasFees ? (
        <ChartPanel title="Daily depositor fees vs StonkBroker skim" note="Gross Uniswap fees collected that day, and the protocol skim. Empty days mean no FeesCollected in the window.">
          <Bar
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'Depositor fees', data: hist.gross, backgroundColor: '#fbbf24', maxBarThickness: 22, skipNull: true },
                { label: 'StonkBroker Fees', data: hist.skim, backgroundColor: '#38bdf8', maxBarThickness: 22, skipNull: true },
              ],
            }}
            options={usdStackOptions()}
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
      <ChartPanel title={`${ticker} locked over time`} note="Tokens sitting in scanned LP. History starts when snapshots record it; the latest point is live.">
        {hasLock ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [
                {
                  label: `${ticker} locked`,
                  data: hist.stonk,
                  borderColor: '#fb923c',
                  backgroundColor: 'rgba(251,146,60,0.12)',
                  fill: true,
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
            options={dualAxisOptions({ leftTick: compactTick, rightTick: compactUsdTick, rightColor: '#94a3b8' })}
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
  return (
    <ChartPanel title="Active units by tier" note="Stacked from daily snapshots. Older days stay empty until a run records the breakdown.">
      {has ? (
        <Bar
          data={{ labels: formatLabels(snaps.map((s) => s.date)), datasets: sets }}
          options={{
            ...baseChartOptions(),
            scales: {
              ...baseChartOptions().scales,
              x: { ...baseChartOptions().scales.x, stacked: true },
              y: { ...baseChartOptions().scales.y, stacked: true, beginAtZero: true },
            },
          }}
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
      <ChartPanel title="NFT holders vs token holders" note="Two different crowds. History uses snapshot counts; the last point is live.">
        {hasHolders ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [
                { label: 'NFT holders', data: hist.nft, borderColor: '#8b5cf6', tension: 0.3, spanGaps: true, yAxisID: 'y' },
                { label: 'Token holders', data: hist.token, borderColor: '#00a804', tension: 0.3, spanGaps: true, yAxisID: 'y1' },
              ],
            }}
            options={dualAxisOptions({ leftTick: compactTick, rightTick: compactTick, rightColor: '#00a804' })}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartPanel>
      <ChartPanel title="Ownership concentration" note="Unique NFT holders ÷ circulating NFT supply.">
        {hasConc ? (
          <Line
            data={{
              labels: hist.labels,
              datasets: [{
                label: 'Concentration %',
                data: hist.concentration,
                borderColor: '#14b8a6',
                backgroundColor: 'rgba(20,184,166,0.1)',
                fill: true,
                tension: 0.3,
                spanGaps: true,
              }],
            }}
            options={{
              ...baseChartOptions(),
              scales: {
                ...baseChartOptions().scales,
                y: { ...baseChartOptions().scales.y, ticks: { color: '#94a3b8', callback: (v) => `${compactTick(v)}%` } },
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
