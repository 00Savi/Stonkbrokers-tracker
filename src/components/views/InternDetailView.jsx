import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, seriesHasInk, holderRevenueCol, windowChart } from '../../lib/yieldHistory';
import { Card, Figure, Stat, KpiStrip, Tag, SkeletonCard, SplitBar, YieldPeriodToggle, scaleAnnualYield, yieldSuffix, compactUsd, compactNum } from '../kit';
import { yieldBasisText } from '../../lib/yieldSample';
import { seatCsvRows } from '../../lib/csv';
import { CsvButton } from '../CsvButton';
import { ShareSection } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, STREAM_COLORS, TIER_COLORS, percentTick } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import { UnderwaterCard } from '../UnderwaterCard';
import { projectPath } from '../../lib/routes';
import { attributedStonkBurn } from '../../lib/burn';
import {
  EmptyChart,
  ChartPanel,
  YieldHistorySwitch,
  ActivityChart,
  ProtocolFeeVolumePanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';
import { SliceChart } from '../SliceChart';
import {
  INTERNS_DOCS,
  INTERNS_MAX_SUPPLY,
  INTERNS_PER_BROKER,
  INTERNS_ONE_OF_ONES,
  INTERNS_ROYALTY_BPS,
  INTERNS_TITLES,
  internContractsReady,
  internDesksReady,
  internCirculating,
} from '../../lib/interns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

function dash(building, value, format = compactNum) {
  if (building) return '—';
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return format(value);
}

function StreamStat({ color, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {color ? <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} /> : null}
        <div className="eyebrow text-faint">{label}</div>
      </div>
      <div className="num mt-1 text-[15px] leading-tight text-ink sm:text-[18px]">{value}</div>
    </div>
  );
}

export default function InternDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const project = data?.projects?.interns;
  const stonk = data?.projects?.stonk;
  if (!project) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, dailySnapshots = [] } = project;
  const awaitingContracts = !internContractsReady(config);
  const desksPending = !internDesksReady(config);
  const building = awaitingContracts || desksPending;
  const stonkPx = Number(market.tokenPriceUsd) || Number(stonk?.market?.tokenPriceUsd) || 0;
  const ethUsd = Number(market.ethPriceUsd) || Number(stonk?.market?.ethPriceUsd) || 0;
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;
  const floorCostUsd = (market.nftFloorEth || 0) * ethUsd;
  const liveInterns = Number(ownership.liveInterns);
  const dormantInterns = Number.isFinite(liveInterns)
    ? Math.max(0, INTERNS_MAX_SUPPLY - liveInterns)
    : Number(ownership.dormantInterns);
  const circ = internCirculating(ownership);
  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map((s) => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: stonkPx,
  });

  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const byKey = Object.fromEntries((rawRev.cols || []).map((c) => [c.key, c]));
  const internCols = [
    { ...(byKey.amm || { data: [] }), label: 'Intern Clock In', color: STREAM_COLORS.amm },
    { ...(byKey.dex || { data: [] }), label: 'Intern Exchange', color: STREAM_COLORS.dex },
    { ...(byKey.box || { data: [] }), label: 'Names + V2 lending', color: STREAM_COLORS.box },
  ];
  const slicedRev = sliceCols(rawRev.labels, internCols, timeframe, interval);
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe, interval);

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnSplit = attributedStonkBurn(stonk, project);

  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actLabels = hasActHist ? actHistory.labels : [];
  const actCum = hasActHist && actHistory.cumulative?.length ? actHistory.cumulative : [];
  const actDAct = hasActHist && actHistory.dailyActivations?.length ? actHistory.dailyActivations : [];
  const actDDeact = hasActHist && actHistory.dailyDeactivations?.length ? actHistory.dailyDeactivations : [];
  const breakdownArr = tiers.map((t) => {
    if (activation.breakdown && activation.breakdown[t.tier] != null) return activation.breakdown[t.tier];
    const s = activation.tierStats?.[t.tier]?.allTime || {};
    return netTierCount(s);
  });

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const holdersWin = windowChart(holdersFull.labels, [holdersFull.data], timeframe, interval, ['last']);
  const ownLabels = holdersWin.labels;
  const ownData = holdersWin.cols[0] || [];
  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);

  return (
    <div className="space-y-6 relative">
      <ShareSection id="roi" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Companion collection"
          sub="8,888 pixel-art interns on Robinhood Chain, two per StonkBroker: V1 Sigma is token id N, V2 Divergent is N + 4,444. Each intern has a token-bound wallet. Base pay is a slice of the parent broker's Clock In. Mint is open, and only the parent activated broker can release its interns."
          corner={(
            <a
              href={INTERNS_DOCS}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
            >
              Whitepaper ↗
            </a>
          )}
        >
          {awaitingContracts ? (
            <div className="mb-5 flex flex-wrap items-start gap-2 text-[13px] leading-relaxed text-muted">
              <Tag tone="warn">awaiting contracts</Tag>
              <p className="min-w-0 flex-1">
                Collection and activation CAs drop at mint. Drop them in <code className="font-mono text-ink">fetcher.cjs</code> PROJECTS.interns to turn the live tiles on.
              </p>
            </div>
          ) : desksPending ? (
            <div className="mb-5 flex flex-wrap items-start gap-2 text-[13px] leading-relaxed text-muted">
              <Tag tone="warn">collection live</Tag>
              <p className="min-w-0 flex-1">
                Mint, live/dormant, and intern activation are on-chain. Intern Clock In, Intern Exchange, names, and lending are still empty. Yield tiles stay blank until those desks deploy.
              </p>
            </div>
          ) : (!config.namesCa && !config.lendingCa) ? (
            <div className="mb-5 flex flex-wrap items-start gap-2 text-[13px] leading-relaxed text-muted">
              <Tag tone="plain">desks live</Tag>
              <p className="min-w-0 flex-1">
                Intern Clock In 3.0 and Intern Exchange (desks) are live. Names and V2 lending stay empty until those desks deploy.
              </p>
            </div>
          ) : null}

          <KpiStrip>
            <Stat label="Collection" value={formatNumber(INTERNS_MAX_SUPPLY)} />
            <Stat label="Per broker" value={String(INTERNS_PER_BROKER)} tone="accent" note="Sigma + Divergent" />
            <Stat label="One of ones" value={String(INTERNS_ONE_OF_ONES)} />
            <Stat label="Creator royalty" value={`${(INTERNS_ROYALTY_BPS / 100).toFixed(2)}%`} />
          </KpiStrip>
        </Card>

        <Card
          eyebrow="Supply"
          sub="Sweep mints all 8,888 dormant into parent TBAs. Paying the fee makes one live. Floor entry is the Intern Exchange / listing floor once the collection is live."
        >
          <KpiStrip>
            <Stat label="Live" value={dash(awaitingContracts, liveInterns)} tone="accent" />
            <Stat label="Dormant" value={dash(awaitingContracts, dormantInterns)} />
            <Stat label="Floor entry" value={awaitingContracts || !(floorCostUsd > 0) ? '—' : formatCurrency(floorCostUsd)} />
          </KpiStrip>
        </Card>

        <Card
          eyebrow="Career ladder"
          sub="Base pay titles. The parent broker delegates 0 / 0.5 / 1 / 2 / 2.5% of its Clock In, at most 5% across both interns. Titles only move up. A furloughed intern sits under an un-activated parent."
        >
          <KpiStrip>
            {INTERNS_TITLES.map((t) => (
              <Stat key={t.id} label={`${t.sharePct}%`} value={t.name} />
            ))}
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
              <p className="mt-1 font-mono text-[11px] text-faint">Scale Intern Clock In yield by volume.</p>
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
          eyebrow="Activation CoC"
          sub={`Five school-year tiers in $STONKBROKER (Freshman 3,333 to Alumnus 83,333), same weights as brokers. Half of every activation fee is burned. Intern CoC is Intern Clock In, not parent-broker base pay. ${yieldBasisText(project)}`}
          corner={(
            <CsvButton
              filename={`${config.ticker || 'interns'}-seats.csv`}
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
                {tiers.map((t) => {
                  const actCost = (t.reqTokens || 0) * stonkPx;
                  const totalCost = floorCostUsd + actCost;
                  const simulatedYield = (t.trackedAnnualYieldUsd || 0) * volumeMultiplier;
                  const roi = totalCost > 0 && simulatedYield > 0 ? (simulatedYield / totalCost) * 100 : 0;
                  const isExpanded = expandedTier === t.tier;
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
                            <span className="font-mono text-[11px] text-faint">{((t.weight || 100) / 100).toFixed(2)}x</span>
                          </div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {formatNumber(t.reqTokens)} <span className="text-muted">$STONKBROKER</span>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{floorCostUsd > 0 ? formatCurrency(floorCostUsd) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{stonkPx > 0 && actCost > 0 ? formatCurrency(actCost) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {building || !(simulatedYield > 0) ? (
                            <span className="font-mono text-[11px] text-faint">TBD / building</span>
                          ) : (
                            <>{formatCurrency(scaleAnnualYield(simulatedYield, yieldPeriod))} <span className="text-muted">{yieldSuffix(yieldPeriod)}</span></>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {building || !(roi > 0) ? (
                            <Tag tone="warn">TBD</Tag>
                          ) : (
                            <Tag tone="good">{roi.toFixed(2)}%</Tag>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-line-soft bg-panel-2/40">
                          <td colSpan="6" className="px-5 py-4">
                            <p className="eyebrow mb-3 text-faint">Daily yield · {t.name}</p>
                            <div className="relative h-32 w-full md:h-40">
                              {seriesHasInk(t.dailyYields) ? (
                                <Line
                                  data={{
                                    labels: t.dailyDates,
                                    datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: '#00a804', borderWidth: 1.75, tension: 0.3, pointRadius: 0 }],
                                  }}
                                  options={baseChartOptions(t.dailyDates, 'daily', { yUnit: 'USD', yTick: compactUsdTick })}
                                />
                              ) : (
                                <EmptyChart>Intern Clock In has not written a daily yield yet</EmptyChart>
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

      <ShareSection id="yield" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Yield" sub="Intern Clock In 3.0 payouts. Base pay from the parent broker is a separate slice and is not this chart.">
          <KpiStrip>
            {tiers.map((t) => {
              const tc = floorCostUsd + (t.reqTokens || 0) * stonkPx;
              const years = t.trackedAnnualYieldUsd > 0 ? `${(tc / t.trackedAnnualYieldUsd).toFixed(1)}y` : '—';
              return <Stat key={t.tier} label={`${t.tier} payback`} value={years} />;
            })}
          </KpiStrip>
        </Card>
        <YieldHistorySwitch
          labels={histLabels}
          datasets={histDatasets}
          options={baseChartOptions(histLabels, interval, { yUnit: 'CoC %', yTick: percentTick })}
          snaps={roiSnaps}
          tiers={tiers}
          empty="Yield history starts after Intern Clock In writes a snapshot"
        />
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow={`Intern desks · ${revPeriod}`}
          sub="Intern Clock In is intern CoC (inflows to the intern pot). Intern Exchange is desks protocol fees (9.99% of curve); 25% of that fee is already in Clock In and is not added twice. Names and V2 lending stay empty."
        >
          <KpiStrip>
            <StreamStat color={internCols[0].color} label="Intern Clock In" value={dash(!config.clockInCa, slicedRev.cols?.[0]?.total, formatCurrency)} />
            <StreamStat color={internCols[1].color} label="Intern Exchange" value={dash(!(config.ammCa || config.internExchangeCa), slicedRev.cols?.[1]?.total, formatCurrency)} />
            <StreamStat color={internCols[2].color} label="Names + V2 lending" value={dash(!(config.namesCa || config.lendingCa), slicedRev.cols?.[2]?.total, formatCurrency)} />
          </KpiStrip>
        </Card>
        <ProtocolFeeVolumePanels
          labels={slicedRev.labels}
          cols={slicedRev.cols}
          kind={rawRev.kind}
          interval={interval}
          holder={{
            labels: slicedHolder.labels,
            data: slicedHolder.cols[0]?.data,
            note: 'Intern Clock In payout to intern TBAs. Not the parent broker slice.',
          }}
        />
      </ShareSection>

      <ShareSection id="activation" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Activation">
          <KpiStrip>
            <Stat label="Activated of collection" value={awaitingContracts ? '—' : `${(activation.percentActivated || 0).toFixed(2)}%`} tone="accent" />
            <Stat label="Live activated units" value={dash(awaitingContracts, activation.activeCount)} />
          </KpiStrip>
        </Card>

        <Card
          eyebrow="Burn"
          sub={(
            <>
              Half of each intern fee is burned by a separate activation manager. Token-supply charts live on the{' '}
              <Link to={projectPath('stonk', 'burn')} className="text-accent hover:underline">parent burn chart</Link>.
            </>
          )}
        >
          <Figure value={dash(awaitingContracts, realBurntTokens)} after="interns burnt" />
          {!awaitingContracts && (Number(burnSplit.brokers) || 0) + (Number(burnSplit.intern) || 0) > 0 ? (
            <div className="mt-6">
              <SplitBar
                a={burnSplit.brokers}
                b={burnSplit.intern}
                labelA="Brokers"
                labelB="Interns"
                valueA={formatNumber(burnSplit.brokers)}
                valueB={formatNumber(burnSplit.intern)}
              />
            </div>
          ) : null}
          <KpiStrip className="mt-6">
            <Stat label="StonkBrokers burnt" value={dash(awaitingContracts, burnSplit.brokers)} note="Outside intern activations" />
            <Stat label="Interns burnt" value={dash(awaitingContracts, burnSplit.intern)} note="Half of each fee" />
          </KpiStrip>
        </Card>

        <TierFlowSection
          title="Tier flow"
          tiers={tiers}
          tierStats={activation.tierStats}
          timeframe={tierTimeframe}
          onTimeframe={setTierTimeframe}
          formatNumber={formatNumber}
          pending={awaitingContracts}
        />

        <Card eyebrow="Tier mix" sub="Current active interns by tier">
          {breakdownArr.some((n) => n > 0) ? (
            <SliceChart
              noun="Active"
              format={formatNumber}
              slices={tiers.map((t, idx) => ({
                label: `${t.tier}: ${t.name}`,
                value: breakdownArr[idx],
                color: TIER_COLORS[idx % TIER_COLORS.length],
              }))}
            />
          ) : (
            <div className="h-24">
              <EmptyChart>No intern activations recorded</EmptyChart>
            </div>
          )}
        </Card>

        <ActivationStackPanel snaps={roiSnaps} tiers={tiers} breakdown={activation.breakdown} />
        <ChartPanel
          title="Activity"
          note="Active units vs daily flow. A sale clears intern activation the same way as a broker. Dormant interns cannot activate."
        >
          {hasActHist ? (
            <ActivityChart
              labels={actWin.labels}
              net={actWin.cols[0]}
              ins={actWin.cols[1]}
              outs={actWin.cols[2]}
              interval={interval}
              lineColor="#38bdf8"
              lineLabel="Active units"
              outColor="#ff3333"
            />
          ) : (
            <EmptyChart>No intern activation history recorded</EmptyChart>
          )}
        </ChartPanel>
      </ShareSection>

      <ShareSection id="ownership" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Ownership"
          sub="Circulating live interns are live released minus Intern Exchange inventory. Dormant are not circulating."
        >
          <KpiStrip>
            <Stat label="Collection" value={formatNumber(ownership.currentMaxSupply || INTERNS_MAX_SUPPLY)} />
            <Stat label="Live released" value={dash(awaitingContracts, liveInterns)} tone="accent" />
            <Stat label="Dormant in parent TBAs" value={dash(awaitingContracts, dormantInterns)} />
            <Stat label="AMM vault" value={dash(awaitingContracts, ownership.ammVaultNfts)} />
          </KpiStrip>
          <KpiStrip className="mt-6">
            <Stat label="Circulating live interns" value={dash(awaitingContracts, circ)} tone="accent" />
            <Stat label="Intern wallets" value={awaitingContracts ? '—' : formatNumber(ownership.nftHolders || 0)} />
            <Stat label="Wallets per 100 NFTs" value={awaitingContracts ? '—' : `${(ownership.ownershipRatio || 0).toFixed(2)}%`} tone="accent" />
            <Stat
              label="Chain onboard"
              value={formatNumber(Number(data?.onboarding?.byProject?.interns?.wallets) || 0)}
              tone="accent"
              note={`First 10 txs · NFT ${formatNumber(data?.onboarding?.byProject?.interns?.nft || 0)}`}
            />
          </KpiStrip>
        </Card>
        <OwnershipHistoryPanels
          snaps={roiSnaps}
          tokenLeg={false}
          live={{ nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          onboard={{ data, projectKey: 'interns', timeframe, interval, name: 'Interns' }}
        />
        <UnderwaterCard ownership={ownership} tokenLeg={false} />
      </ShareSection>

      <MethodologyCard>
        <p><strong className="text-ink">What this is:</strong> Interns by StonkBrokers is the companion NFT to StonkBrokers, not a second broker seat. Paper at <a className="text-mark-sky underline" href={INTERNS_DOCS} target="_blank" rel="noreferrer">stonkbrokers.cash/docs/interns</a>. Holding an intern is not equity and is not a guaranteed share of revenue.</p>
        <p><strong className="text-ink">Mint:</strong> Only an activated parent broker can release its intern(s). A dormant sweep puts all 8,888 into parent TBAs on mint open; they cannot move until released.</p>
        <p><strong className="text-ink">Yield &amp; ROI:</strong> Intern Clock In 3.0 (0xf90a…bc059) is the intern yield pot. Weight is job-title slice × intern activation tier (same 1.00 / 1.25 / 1.60 / 2.00 / 3.33 multipliers as brokers). CoC is intern Clock In ÷ (intern floor USD + activation $STONKBROKER at spot). {yieldBasisText(project)} Parent-broker Clock In that is delegated as base pay is a separate cashflow and is not added into intern CoC.</p>
        <p><strong className="text-ink">Intern desks:</strong> Intern Exchange (0xDea3…f518) is the intern AMM. A 9.99% protocol fee on the curve splits 66% desk / 25% Intern Clock In / 9% treasury. The Exchange tile is that gross fee; the 25% engine share is already in intern CoC via Clock In inflows and is not counted twice. Names and V2 lending stay blank until those desks deploy.</p>
        <p><strong className="text-ink">Ownership:</strong> Circulating live interns are released supply minus Intern Exchange / AMM vault inventory. Dormant tokens in parent TBAs are not circulating. Wallets per 100 NFTs is unique intern wallets (vault and burn excluded) divided by that circulating number, times 100. Chain onboard is unique EOAs whose first intern buy or mint was one of their first 10 txs ($STONKBROKER token buys stay on StonkBrokers).</p>
        <p><strong className="text-ink">Burn:</strong> Interns and StonkBrokers do not share an activation manager. Interns use 0x668e…4b37; brokers use 0xacd5…f664. Both burn the same $STONKBROKER token (0xe934…abf50). Half of each intern fee is destroyed; that intern total is a subset of token-wide supply burn. Token-supply charts stay on the parent StonkBrokers burn page. Interns are not a second ERC-20.</p>
        <p><strong className="text-ink">Turning the page on:</strong> Collection, activation, Intern Clock In 3.0, and Intern Exchange are live in fetcher.cjs. Names and lending stay blank until those desks deploy.</p>
      </MethodologyCard>
    </div>
  );
}
