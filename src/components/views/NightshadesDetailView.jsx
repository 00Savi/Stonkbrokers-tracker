import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, seriesHasInk, windowChart } from '../../lib/yieldHistory';
import { Card, Figure, Stat, KpiStrip, Tag, SkeletonCard, YieldPeriodToggle, scaleAnnualYield, yieldSuffix, compactUsd, compactNum } from '../kit';
import { yieldBasisText } from '../../lib/yieldSample';
import { seatCsvRows } from '../../lib/csv';
import { CsvButton } from '../CsvButton';
import { ShareSection } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, cumulativeBurnDataset, TIER_COLORS, percentTick } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { NIGHTSHADES_FACTION_META } from '../../lib/nightshades';
import NightshadesAllView, { NightshadesNightSection } from './NightshadesAllView';
import { MethodologyCard } from '../Disclaimer';
import { UnderwaterCard } from '../UnderwaterCard';
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
const FACTION_TABS = [{ id: 'all', label: 'All' }, ...NIGHTSHADES_FACTION_META];

export function useNightshadesFaction() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get('faction') || 'all').toLowerCase();
  const faction = FACTION_TABS.some((f) => f.id === raw) ? raw : 'all';
  const setFaction = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('faction');
    else next.set('faction', id);
    setParams(next, { replace: true });
  };
  return { faction, setFaction };
}

/** Lives in the project chrome so it sticks with the tab bar, not under it. */
export function NightshadesFactionBar() {
  const { faction, setFaction } = useNightshadesFaction();
  return (
    <div className="flex flex-wrap gap-1 border-b border-line pb-3" role="tablist" aria-label="Nightshades faction">
      {FACTION_TABS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={faction === f.id}
          onClick={() => setFaction(f.id)}
          className={`min-w-[4.5rem] flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            faction === f.id
              ? 'bg-accent text-black'
              : 'text-muted hover:bg-panel-2 hover:text-ink'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function NightshadesDetailView({ data, activeTab }) {
  const { faction, setFaction } = useNightshadesFaction();
  const project = data?.projects?.nightshades;
  if (!project) return <SkeletonCard rows={4} />;
  if (faction === 'all') return <NightshadesAllView project={project} setFaction={setFaction} />;
  return (
    <NightshadesFactionDetail
      activeTab={activeTab}
      faction={faction}
      project={project}
    />
  );
}

function NightshadesFactionDetail({ activeTab, faction, project }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const slice = project.factions?.[faction];
  if (!slice) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, dailySnapshots = [] } = slice;
  const formatCurrency = compactUsd;
  const formatNumber = compactNum;
  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
  const tokenLabel = `$${config.ticker || 'TOKEN'}`;

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map((s) => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(slice, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  const burn = burnSeries(slice, timeframe, interval);
  const flywheel = burnRateSeries(slice, timeframe, interval);

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
  const tokenHolders = Number(ownership.tokenHolders) || Number(ownership.stonkHolders) || Number(ownership.erc20Holders) || 0;
  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);

  void activeTab;

  const roiRows = tiers.map((t) => {
    const actCost = t.reqTokens * (market.tokenPriceUsd || 0);
    const totalCost = floorCostUsd + actCost;
    const simulatedYield = (t.trackedAnnualYieldUsd || 0) * volumeMultiplier;
    const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
    const payback = t.trackedAnnualYieldUsd > 0 ? `${(totalCost / t.trackedAnnualYieldUsd).toFixed(1)}y` : '—';
    return { t, actCost, totalCost, simulatedYield, roi, payback };
  });
  const bestRoiRow = roiRows.reduce((a, b) => ((b.roi || 0) > (a.roi || 0) ? b : a), roiRows[0] || { roi: 0 });

  return (
    <div className="space-y-6 relative">
      <ShareSection id="roi" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="ROI"
          sub={`Cash-on-cash: annualized vault yield ÷ (this floor + activation tokens at spot). ${yieldBasisText(slice)} The slider only scales the yield leg.`}
          corner={<span className="font-mono text-[11px] text-muted">Floor {formatCurrency(floorCostUsd)}</span>}
        >
          <KpiStrip>
            <Stat label="Floor" value={formatCurrency(floorCostUsd)} />
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
              filename={`${config.ticker || faction}-seats.csv`}
              rows={seatCsvRows(slice, { floorUsd: floorCostUsd, volume: volumeMultiplier })}
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
                          {formatNumber(t.reqTokens)} <span className="text-muted">{tokenLabel}</span>
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
                              {seriesHasInk(t.dailyYields) ? (
                                <Line
                                  data={{
                                    labels: t.dailyDates,
                                    datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: ACCENT, borderWidth: 1.75, tension: 0.3, pointRadius: 0 }],
                                  }}
                                  options={baseChartOptions(t.dailyDates, 'daily', { yUnit: 'USD', yTick: compactUsdTick })}
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

      <ShareSection id="yield" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Yield"
          sub={`Cash-on-cash: annualized vault RewardPaid ÷ (NFT floor + activation tokens at spot). ${yieldBasisText(slice)} The slider scales yield only. Cost stays at the live floor and token price.`}
        >
          <KpiStrip>
            {roiRows.map(({ t, payback }) => (
              <Stat key={t.tier} label={`${t.tier} payback`} value={payback} />
            ))}
          </KpiStrip>
        </Card>

        <YieldHistorySwitch
          labels={histLabels}
          datasets={histDatasets}
          options={baseChartOptions(histLabels, interval, { yUnit: 'CoC %', yTick: percentTick })}
          snaps={roiSnaps}
          tiers={tiers}
        />
      </ShareSection>

      <NightshadesNightSection night={project.night} faction={faction} />

      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Burn" sub={`${tokenLabel} destroyed through activation and the dual burn.`}>
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
            note: 'Cumulative tokens burnt.',
            body: burn.data.length > 0 ? (
              <Line
                key={`burn-${timeframe}-${faction}`}
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
            <Stat label="Active wallets" value={activation.activeHolders == null ? '—' : formatNumber(activation.activeHolders)} />
            <Stat label="Tiers" value={String(tiers.length)} />
          </KpiStrip>
        </Card>

        <TierFlowSection
          tiers={tiers}
          tierStats={activation.tierStats}
          timeframe={tierTimeframe}
          onTimeframe={setTierTimeframe}
          formatNumber={formatNumber}
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

        <ActivationStackPanel snaps={roiSnaps} tiers={tiers} breakdown={activation.breakdown} />
        <ChartPanel
          title="Activity"
          note="The line is currently-active NFTs at end of day (sales deactivate). Bars are new activations and exits, not upgrades."
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
            <Stat label="Circulating" value={formatNumber(ownership.circulatingNftSupply || 0)} />
            <Stat label="NFT holders" value={formatNumber(ownership.nftHolders || 0)} />
            <Stat label="Wallets per 100 NFTs" value={(ownership.ownershipRatio || 0).toFixed(2)} tone="accent" />
            <Stat label={`${tokenLabel} holders`} value={formatNumber(tokenHolders)} />
          </KpiStrip>
          <KpiStrip className="mt-6">
            <Stat label="Max supply" value={formatNumber(ownership.currentMaxSupply || 0, 2)} />
            <Stat label="Burnt NFTs" value={formatNumber(realBurntUnits, 2)} />
            <Stat label="AMM vault" value={formatNumber(ownership.ammVaultNfts || 0)} />
            <Stat label="Activated wallets" value={activation.activeHolders == null ? '—' : formatNumber(activation.activeHolders)} />
          </KpiStrip>
        </Card>

        <OwnershipHistoryPanels
          snaps={roiSnaps}
          live={{ tokenHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
        />
        <UnderwaterCard ownership={ownership} />
      </ShareSection>

      <MethodologyCard>
        <p><strong className="text-ink">Four Anvil markets, one incubator:</strong> Ghosts, Zombies, Knights, and Watchers each have 3,000 NFTs, one faction token, and a SoftStakingVault. The All tab compares the four on one axis. This page is one market.</p>
        <p><strong className="text-ink">Yield &amp; ROI:</strong> Cash-on-cash is annualized vault RewardPaid ÷ (this floor + activation tokens at spot), split by tier weight. {yieldBasisText(slice)} The volume slider scales yield only. Cost stays at the live floor and token price. Night vault WETH is The Night inventory, not StonkBooster.</p>
        <p><strong className="text-ink">Activation:</strong> Same mechanic as Mancer/Yard. The vault emits no Deactivated event — a sale clears the position. <code>activeCount()</code> is an upper bound; this page replays Activated plus NFT transfers.</p>
        <p><strong className="text-ink">Burn:</strong> Days before hourly snapshots are reconstructed from token burns to dead/zero, scaled to the first trusted supply read.</p>
        <p><strong className="text-ink">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Wallets per 100 NFTs is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number, times 100.</p>
        <p><strong className="text-ink">The Night</strong> is incubator-wide (one VRF over all four factions). Live strike, history, sunrise fees, and usable v4 LP sit on the Night tab.</p>
      </MethodologyCard>
    </div>
  );
}
