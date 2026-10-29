import React, { useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { burnSeries, burnRateSeries } from '../../lib/burn';
import { windowChart } from '../../lib/yieldHistory';
import { BetaTag, Card, Figure, Stat, KpiStrip, Tag, SkeletonCard, YieldPeriodToggle, scaleAnnualYield, yieldSuffix, compactUsd, compactNum } from '../kit';
import { seatCsvRows } from '../../lib/csv';
import { CsvButton } from '../CsvButton';
import { ShareSection } from '../CopyControl';
import { TierFlowSection } from '../TierFlowCards';
import { baseChartOptions, compactTick, cumulativeBurnDataset, TIER_COLORS } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { MethodologyCard } from '../Disclaimer';
import { explorerAddressUrl } from '../../lib/tba';
import {
  EmptyChart,
  ChartPanel,
  YieldHistorySwitch,
  BurnHistorySwitch,
  ActivityChart,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';
import { SliceChart } from '../SliceChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const ACCENT = '#00a804';
const BURN = '#8b5cf6';

// Prospectus supply. 4,001 seats × 401,000 $TMF. The burn card's percent uses this cap.
const TMF_SUPPLY = 1_604_401_000;

function dayKey(daysBack) {
  return new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
}

function blankWindow() {
  return { act: 0, deact: 0, up: 0 };
}

// ALL is the live class mix. A shorter window gets that mix only when every
// recorded enrollment day still sits inside it. Per-class daily flow is not
// stamped yet, so an older day leaves the short window at zero.
function tierStatsFromBreakdown(breakdown, history) {
  const labels = (history?.labels || []).filter(Boolean);
  const fits = (days) => labels.length > 0 && labels.every((d) => d >= dayKey(days - 1));
  const stats = {};
  for (const id of ['T0', 'T1', 'T2', 'T3', 'T4']) {
    const live = { act: Number(breakdown?.[id]) || 0, deact: 0, up: 0 };
    stats[id] = {
      '24h': fits(1) ? { ...live } : blankWindow(),
      '7d': fits(7) ? { ...live } : blankWindow(),
      '30d': fits(30) ? { ...live } : blankWindow(),
      allTime: { ...live },
    };
  }
  return stats;
}

function countOrDash(value, formatNumber, suffix = '') {
  if (value == null || value === '') return '—';
  return `${formatNumber(value)}${suffix}`;
}

export default function MutualFunDetailView({ data }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const project = data?.projects?.mutualfun;
  if (!project) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, funds = [], seats = {}, dailySnapshots = [] } = project;
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (Number(market.nftFloorEth) || 0) * (Number(market.ethPriceUsd) || 0);
  const tokenPx = Number(market.tokenPriceUsd) || 0;
  const rate = Number(config.houseRate) || 401000;
  const randomUsd = tokenPx > 0 ? rate * 1.08 * tokenPx : 0;
  const specificUsd = tokenPx > 0 ? rate * 1.16 * tokenPx : 0;
  const handInUsd = tokenPx > 0 ? rate * 0.92 * tokenPx : 0;

  const roiSnaps = [];
  const histLabels = [];
  const histDatasets = tiers.map((t, i) => ({
    label: `${t.tier} ROI`,
    data: [],
    borderColor: TIER_COLORS[i % TIER_COLORS.length],
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 2,
  }));

  const realBurntTokens = Math.max(Number(revenue.burnedTokens) || 0, Number(ownership.permanentlyBurntTokens) || 0);
  const burnPct = realBurntTokens > 0 ? (realBurntTokens / TMF_SUPPLY) * 100 : null;
  const realBurntUnits = Math.max(Number(ownership.burntNfts) || 0, Number(seats.retired) || 0);
  const burn = burnSeries(project, timeframe, interval);
  const flywheel = burnRateSeries(project, timeframe, interval);

  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actWin = windowChart(
    hasActHist ? actHistory.labels : [],
    [
      hasActHist ? actHistory.cumulative || [] : [],
      hasActHist ? actHistory.dailyActivations || [] : [],
      hasActHist ? actHistory.dailyDeactivations || [] : [],
    ],
    timeframe,
    interval,
    ['last', 'sum', 'sum'],
  );

  const breakdownArr = tiers.map((t) => (
    activation.breakdown && activation.breakdown[t.tier] != null ? activation.breakdown[t.tier] : 0
  ));
  const tierStats = activation.tierStats || tierStatsFromBreakdown(activation.breakdown, actHistory);

  const minted = Number(seats.minted) || Number(activation.totalSupply) || 0;
  const retired = Number(seats.retired) || Number(ownership.burntNfts) || 0;
  const circulatingNfts = ownership.circulatingNftSupply != null
    ? Number(ownership.circulatingNftSupply)
    : Math.max(0, minted - retired);
  const dividendUsd = (revenue.dividends || []).reduce((sum, row) => sum + (Number(row.usd) || 0), 0);

  const roiRows = tiers.map((t) => {
    const actCost = t.reqTokens * tokenPx;
    const totalCost = floorCostUsd + actCost;
    const simulatedYield = (Number(t.trackedAnnualYieldUsd) || 0) * volumeMultiplier;
    const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
    const payback = t.trackedAnnualYieldUsd > 0 ? `${(totalCost / t.trackedAnnualYieldUsd).toFixed(1)}y` : '—';
    return { t, actCost, totalCost, simulatedYield, roi, payback };
  });
  const bestRoiRow = roiRows.reduce((a, b) => ((b.roi || 0) > (a.roi || 0) ? b : a), roiRows[0] || { roi: 0 });

  return (
    <div className="space-y-6 relative">
      <ShareSection id="roi" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="The Mutual Fun"
          sub="A Seat earns only while it is enrolled. Cost is the OpenSea floor plus the Front-End Load. Nothing is annualized until a dividend has a history."
          corner={<BetaTag />}
        >
          <KpiStrip>
            <Stat label="Floor" value={floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'} />
            <Stat
              label="Best CoC"
              value={bestRoiRow?.roi != null ? `${bestRoiRow.roi.toFixed(1)}%` : '—'}
              tone="accent"
              note={bestRoiRow?.t?.name}
            />
            <Stat label="Best yield" value={formatCurrency(scaleAnnualYield(bestRoiRow?.simulatedYield, yieldPeriod))} note={yieldSuffix(yieldPeriod)} />
            <Stat label="Payback" value={bestRoiRow?.payback || '—'} note={bestRoiRow?.t?.name} />
          </KpiStrip>
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => setSimulatorOpen(!simulatorOpen)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={simulatorOpen}
          >
            <div>
              <h3 className="eyebrow text-muted">Volume simulator</h3>
              <p className="mt-1 font-mono text-[11px] text-faint">Scale trailing yield by protocol volume.</p>
            </div>
            <span className="font-mono text-[11px] text-faint">
              {parseFloat(volumeMultiplier).toFixed(1)}x · {simulatorOpen ? 'Hide' : 'Show'}
            </span>
          </button>
          {simulatorOpen && (
            <div className="mt-4">
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={volumeMultiplier}
                onChange={(e) => setVolumeMultiplier(e.target.value)}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-panel-2 accent-[var(--color-accent)]"
              />
            </div>
          )}
        </Card>

        <Card
          flush
          eyebrow="Tiers"
          corner={(
            <CsvButton
              filename={`${config.ticker || 'TMF'}-seats.csv`}
              rows={seatCsvRows(project, { floorUsd: floorCostUsd, volume: volumeMultiplier })}
            />
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Tier</th>
                  <th className="px-3 py-3 font-normal">Activation</th>
                  <th className="px-3 py-3 font-normal">Floor</th>
                  <th className="px-3 py-3 font-normal">Act. cost</th>
                  <th className="px-3 py-3 font-normal">
                    <div className="flex items-center gap-2">
                      <span>Yield</span>
                      <YieldPeriodToggle value={yieldPeriod} onChange={setYieldPeriod} />
                    </div>
                  </th>
                  <th className="px-5 py-3 text-right font-normal">CoC</th>
                </tr>
              </thead>
              <tbody>
                {roiRows.map(({ t, actCost, simulatedYield, roi }) => {
                  const isExpanded = expandedTier === t.tier;
                  const leader = bestRoiRow?.t?.tier === t.tier && roi > 0;
                  return (
                    <React.Fragment key={t.tier}>
                      <tr
                        onClick={() => setExpandedTier(isExpanded ? null : t.tier)}
                        className="cursor-pointer border-b border-line-soft transition-colors hover:bg-panel-2"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-faint">{t.tier}</span>
                            <span className="text-[13px] text-ink">{t.name}</span>
                            <span className="font-mono text-[11px] text-faint">{t.weight}x</span>
                            {leader && <Tag tone="good">best</Tag>}
                          </div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {formatNumber(t.reqTokens)} <span className="text-muted">${config.ticker}</span>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{actCost > 0 ? formatCurrency(actCost) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{formatCurrency(scaleAnnualYield(simulatedYield, yieldPeriod))}</td>
                        <td className="px-5 py-3 text-right">
                          <Tag tone="good">{roi.toFixed(2)}%</Tag>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-line-soft bg-panel-2/40">
                          <td colSpan="6" className="px-5 py-4">
                            <p className="eyebrow mb-3 text-faint">Daily yield · {t.name}</p>
                            <div className="relative h-32 w-full md:h-40">
                              <EmptyChart>No daily yield recorded for this tier</EmptyChart>
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

      <ShareSection id="yield" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Yield" sub="Payback stays blank until a fund posts a dividend.">
          <KpiStrip>
            {roiRows.map(({ t, payback }) => (
              <Stat key={t.tier} label={`${t.tier} payback`} value={payback} />
            ))}
          </KpiStrip>
        </Card>

        <Card eyebrow="Funds" sub="The five books are the fund desk's last ETH mark.">
          <KpiStrip>
            {funds.map((fund) => (
              <Stat
                key={fund.name}
                label={fund.name}
                value={formatCurrency(fund.navUsd || 0)}
                note={`${formatNumber(fund.enrolled || 0)} enrolled`}
              />
            ))}
          </KpiStrip>
        </Card>

        <YieldHistorySwitch
          labels={histLabels}
          datasets={histDatasets}
          options={baseChartOptions(histLabels, interval, { yUnit: 'CoC %' })}
          snaps={roiSnaps}
          tiers={tiers}
          empty="No dividend history yet, so cash-on-cash stays blank"
        />
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Revenue"
          sub="Every enrollment pays the class load in $TMF. Half is burned and half is booked to that Seat's fund. Dividends are posted separately."
        >
          <KpiStrip>
            <Stat
              label="Load paid"
              value={tokenPx > 0 ? formatCurrency(revenue.loadUsd || 0) : formatNumber(revenue.loadTokens || 0)}
              tone="accent"
              note={`${formatNumber(revenue.loadTokens || 0)} ${config.ticker}`}
            />
            <Stat
              label="Burned"
              value={tokenPx > 0 ? formatCurrency(revenue.burnedUsd || 0) : formatNumber(revenue.burnedTokens || 0)}
              note="Half of every load"
            />
            <Stat
              label="Booked to funds"
              value={`${formatNumber(revenue.bookTokens || 0)} ${config.ticker}`}
              note="The other half"
            />
            <Stat
              label="Dividends posted"
              value={dividendUsd > 0 ? formatCurrency(dividendUsd) : '—'}
              note={(revenue.dividends || []).length ? `${(revenue.dividends || []).length} tokens` : 'None yet'}
            />
          </KpiStrip>
        </Card>

        {(revenue.dividends || []).length ? (
          <Card flush eyebrow="Dividends posted">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Token</th>
                    <th className="px-3 py-3 text-right font-normal">Amount</th>
                    <th className="px-5 py-3 text-right font-normal">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.dividends.map((row) => (
                    <tr key={row.address} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">
                        <a href={explorerAddressUrl(row.address)} target="_blank" rel="noreferrer" className="hover:underline">{row.symbol}</a>
                      </td>
                      <td className="num px-3 py-3 text-right text-[13px] text-ink">{formatNumber(row.amount)}</td>
                      <td className="num px-5 py-3 text-right text-[13px] text-ink">{row.usd > 0 ? formatCurrency(row.usd) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Liquidity"
          sub="The Open Market trades Seats for $TMF. The house rate is 401,000 $TMF a Seat, both ways. A random Seat is the rate plus 8%. A specific Seat is the rate plus 16%. Handing a Seat in pays the rate less 8%."
        >
          <KpiStrip>
            <Stat label="Random Seat" value={randomUsd > 0 ? formatCurrency(randomUsd) : '—'} tone="accent" note="401,000 + 8%" />
            <Stat label="Specific Seat" value={specificUsd > 0 ? formatCurrency(specificUsd) : '—'} note="401,000 + 16%" />
            <Stat label="Hand in" value={handInUsd > 0 ? formatCurrency(handInUsd) : '—'} note="401,000 − 8%" />
            <Stat
              label="OpenSea floor"
              value={floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'}
              note={market.nftFloorEth ? `${Number(market.nftFloorEth).toFixed(4)} ETH` : 'No ETH listing yet'}
            />
          </KpiStrip>
          <p className="mt-5 break-all font-mono text-[11px] leading-relaxed text-muted">
            Seat{' '}
            <a href={explorerAddressUrl(config.nftCa)} target="_blank" rel="noreferrer" className="text-ink hover:underline">{config.nftCa}</a>
            . Open Market{' '}
            <a href={explorerAddressUrl(config.ammCa)} target="_blank" rel="noreferrer" className="text-ink hover:underline">{config.ammCa}</a>
            .{config.site ? <> <a href={config.site} target="_blank" rel="noreferrer" className="text-ink hover:underline">themutual.fun</a></> : null}
          </p>
        </Card>
      </ShareSection>

      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Burn" sub={`$${config.ticker} sent to the Chairman's Estate with every Front-End Load.`}>
          <Figure
            value={formatNumber(realBurntTokens)}
            unit={config.ticker}
            after={burnPct != null ? `${burnPct.toFixed(2)}% of supply` : null}
          />
          <KpiStrip className="mt-6">
            <Stat label="Units removed" value={formatNumber(realBurntUnits, 2)} />
            <Stat label="Of supply" value={burnPct != null ? `${burnPct.toFixed(2)}%` : '—'} />
          </KpiStrip>
        </Card>

        <BurnHistorySwitch
          cumulative={{
            title: 'Cumulative burn',
            note: 'From the first recorded day through today. Quiet days keep the last cumulative burn.',
            body: burn.data.length > 0 ? (
              <Line
                key={`burn-${timeframe}`}
                data={{ labels: burn.labels, datasets: [cumulativeBurnDataset(burn.data, BURN)] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#94a3b8' } }, y: { grid: { color: '#1e2228', borderDash: [4, 4] }, unit: 'Tokens', ticks: { color: '#94a3b8', callback: compactTick } } } }}
              />
            ) : (
              <EmptyChart>No burn history recorded yet</EmptyChart>
            ),
          }}
          flywheel={{
            labels: flywheel.labels,
            burn: flywheel.burn,
            prices: flywheel.prices,
            priceColor: ACCENT,
            burnColor: BURN,
            burnLabel: 'Daily Burn Velocity',
            leftMax: flywheel.burnAxisMax,
          }}
        />
      </ShareSection>

      <ShareSection id="activation" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Activation">
          <KpiStrip>
            <Stat label="Activated" value={`${(activation.percentActivated || 0).toFixed(2)}%`} tone="accent" />
            <Stat label="Active units" value={formatNumber(activation.activeCount || 0)} />
            <Stat label="Active wallets" value={countOrDash(activation.activeHolders, formatNumber)} />
            <Stat label="Tiers" value={String(tiers.length)} />
          </KpiStrip>
        </Card>

        <TierFlowSection
          tiers={tiers}
          tierStats={tierStats}
          timeframe={tierTimeframe}
          onTimeframe={setTierTimeframe}
          formatNumber={formatNumber}
          note="Act is an enrollment into that class, including a merge into it. Deact is an enrollment ending, or a seat retired by a merge. Up is the class a seat left when it became a corner office."
        />

        <Card eyebrow="Tier mix" sub="Net of deactivations">
          <SliceChart
            noun="Active"
            format={formatNumber}
            slices={tiers.map((t, idx) => ({
              label: `${t.tier}: ${t.name}`,
              value: breakdownArr[idx],
              color: TIER_COLORS[idx % TIER_COLORS.length],
            }))}
          />
        </Card>

        <Card flush eyebrow="Enrolled by fund">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Fund</th>
                  {tiers.map((tier) => (
                    <th key={tier.tier} className="px-3 py-3 text-right font-normal">{tier.name}</th>
                  ))}
                  <th className="px-5 py-3 text-right font-normal">Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund) => (
                  <tr key={fund.name} className="border-b border-line-soft">
                    <td className="px-5 py-3 text-[13px] text-ink">{fund.name}</td>
                    {tiers.map((tier) => (
                      <td key={tier.tier} className="num px-3 py-3 text-right text-[13px] text-ink">{formatNumber(fund.classes?.[tier.tier] || 0)}</td>
                    ))}
                    <td className="num px-5 py-3 text-right text-[13px] text-ink">{formatNumber(fund.enrolled || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <ActivationStackPanel snaps={dailySnapshots} tiers={tiers} breakdown={activation.breakdown} />
        <ChartPanel
          title="Activity"
          note="The line is enrolled Seats at end of day. A transfer ends enrollment. Bars are new enrollments and exits, not corner-office merges."
        >
          {hasActHist ? (
            <ActivityChart
              labels={actWin.labels}
              net={actWin.cols[0]}
              ins={actWin.cols[1]}
              outs={actWin.cols[2]}
              interval={interval}
              lineColor={ACCENT}
              lineLabel="Active units"
            />
          ) : (
            <EmptyChart>No activation history recorded</EmptyChart>
          )}
        </ChartPanel>
      </ShareSection>

      <ShareSection id="ownership" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Ownership">
          <KpiStrip>
            <Stat label="Circulating" value={formatNumber(circulatingNfts)} />
            <Stat label="NFT holders" value={countOrDash(ownership.nftHolders, formatNumber)} />
            <Stat
              label="Wallets per 100 NFTs"
              value={ownership.ownershipRatio == null ? '—' : `${Number(ownership.ownershipRatio).toFixed(2)}%`}
              tone="accent"
            />
            <Stat label={`$${config.ticker} holders`} value={countOrDash(ownership.tokenHolders, formatNumber)} />
          </KpiStrip>
          <KpiStrip className="mt-6">
            <Stat label="Max supply" value={formatNumber(ownership.currentMaxSupply || seats.max || config.maxSupply || 0, 2)} />
            <Stat label="Burnt NFTs" value={formatNumber(realBurntUnits, 2)} />
            <Stat label="AMM vault" value={countOrDash(ownership.ammVaultNfts, formatNumber)} />
            <Stat label="Activated wallets" value={countOrDash(activation.activeHolders, formatNumber)} />
          </KpiStrip>
        </Card>

        <OwnershipHistoryPanels
          snaps={dailySnapshots}
          live={{ tokenHolders: ownership.tokenHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
        />
      </ShareSection>

      <MethodologyCard>
        <p><strong className="text-ink">Yield &amp; ROI:</strong> Cost is the OpenSea floor plus the Front-End Load at the $TMF spot. Cash-on-cash stays at zero until a fund posts a dividend. Payback is N/A for the same reason. The five fund cards are the desk's last ETH mark, not a yield.</p>
        <p><strong className="text-ink">Activation:</strong> Enrolled Seats are the live set. A transfer ends enrollment and the next holder pays the load again. A corner office is a merge into the next class. Act, Up, and Deact on the tier cards are those events, split by the day they were logged.</p>
        <p><strong className="text-ink">Burn:</strong> Half of every Front-End Load is $TMF sent to the Chairman&apos;s Estate. The percent is that burn over the prospectus supply of 1,604,401,000. Equivalent units are Seats retired by a merger. The collection cannot mint a replacement. The burn line is that cumulative load, not unminted supply.</p>
        <p><strong className="text-ink">Liquidity:</strong> The Open Market posts 401,000 $TMF a Seat. Random is +8%, specific is +16%, and a hand-in is −8%. No ETH is charged. Holder counts come from the wallet index once its fold covers this collection. Circulating seats are minted seats minus mergers minus seats sitting in the Open Market.</p>
      </MethodologyCard>
    </div>
  );
}
