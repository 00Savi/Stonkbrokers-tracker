import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, seriesHasInk, holderRevenueCol, windowChart } from '../../lib/yieldHistory';
import { compactUsd, compactNum, Card, Figure, Stat, KpiStrip, Tag, SkeletonCard, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { yieldBasisText } from '../../lib/yieldSample';
import { seatCsvRows } from '../../lib/csv';
import { CsvButton } from '../CsvButton';
import { ShareSection } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, cumulativeBurnDataset, STREAM_COLORS, TIER_COLORS, percentTick } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import { UnderwaterCard } from '../UnderwaterCard';
import { YARD_WRAP, fetchYardWrap } from '../../lib/yardWrap';
import {
  EmptyChart,
  ChartPanel,
  YieldHistorySwitch,
  BurnHistorySwitch,
  ActivityChart,
  ProtocolFeeVolumePanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
  BlackHoleChartPanels,
} from '../HistoryCharts';
import { SliceChart } from '../SliceChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

function scanTokenLp(pairs, tokenCa, tokenPriceUsd) {
  const unique = new Map();
  let totalStonkLocked = 0;
  let totalLpUsd = 0;
  const addr = String(tokenCa || '').toLowerCase();
  for (const pair of pairs || []) {
    if (pair.chainId !== 'robinhood' && !(pair.url || '').includes('robinhood')) continue;
    const pairAddress = (pair.pairAddress || '').toLowerCase();
    if (!pairAddress || unique.has(pairAddress)) continue;
    const isBase = pair.baseToken?.address?.toLowerCase() === addr;
    const isQuote = pair.quoteToken?.address?.toLowerCase() === addr;
    if (!isBase && !isQuote) continue;
    const pairLiquidityUsd = pair.liquidity?.usd || 0;
    if (pairLiquidityUsd <= 0) continue;
    const stonkCount = tokenPriceUsd > 0 ? pairLiquidityUsd / 2 / tokenPriceUsd : 0;
    totalStonkLocked += stonkCount;
    totalLpUsd += pairLiquidityUsd;
    unique.set(pairAddress, {
      pairName: `${pair.baseToken?.symbol || '?'}/${pair.quoteToken?.symbol || '?'}`,
      dex: pair.dexId || 'DEX',
      liquidityUsd: Math.round(pairLiquidityUsd),
      stonkAmount: Math.round(stonkCount),
    });
  }
  return {
    totalStonkLocked: Math.round(totalStonkLocked),
    totalLpUsd: Math.round(totalLpUsd),
    pools: [...unique.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd),
  };
}

function StreamStat({ color, label, value, note }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {color ? (
          <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
        ) : null}
        <div className="eyebrow text-faint">{label}</div>
      </div>
      <div className="num mt-1 text-[15px] leading-tight text-ink sm:text-[18px]">{value}</div>
      {note ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{note}</p> : null}
    </div>
  );
}

export default function YardDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(false);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [liveLp, setLiveLp] = useState(null);
  const [wrap, setWrap] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('Y');

  const project = data?.projects?.tickeryard || data?.projects?.yard;
  const lockedLpSnap = project?.lockedLp || null;
  const tokenCa = project?.config?.tokenCa;
  const tokenPx = project?.market?.tokenPriceUsd || 0;

  useEffect(() => {
    if (lockedLpSnap?.pools?.length || !tokenCa) return undefined;
    let gone = false;
    (async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCa}`);
        if (!res.ok) return;
        const j = await res.json();
        const scanned = scanTokenLp(j.pairs || [], tokenCa, tokenPx);
        if (!gone && scanned.pools.length) setLiveLp(scanned);
      } catch {
        /* DexScreener fills the LP table until the hourly job writes lockedLp. */
      }
    })();
    return () => { gone = true; };
  }, [tokenCa, lockedLpSnap, tokenPx]);

  useEffect(() => {
    let gone = false;
    fetchYardWrap().then((w) => { if (!gone) setWrap(w); }).catch(() => {});
    return () => { gone = true; };
  }, []);

  if (!project) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, dailySnapshots = [] } = project;
  const lockedLp = lockedLpSnap?.pools?.length ? lockedLpSnap : liveLp;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
  const opts = (labs) => baseChartOptions(labs, interval);
  const onboardYard = data?.onboarding?.byProject?.tickeryard || {};

  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const byKey = Object.fromEntries((rawRev.cols || []).map((c) => [c.key, c]));
  const slicedVault = sliceCols(
    rawRev.labels,
    [{ ...(byKey.amm || { data: [] }), label: 'Vault distributions', color: STREAM_COLORS.amm }],
    timeframe,
    interval,
  );
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe, interval);

  // 3. Burn Tracker Data (Cumulative Ratchet: prevents values from dropping)
  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  
  const burn = burnSeries(project, timeframe, interval);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;

  // 4. Flywheel Chart
  const flywheel = burnRateSeries(project, timeframe, interval);

  // 5. Activation Chart
  const actHistory = activation.history || {};
  const hasActHist = Array.isArray(actHistory.labels) && actHistory.labels.length > 0;
  const actLabels = hasActHist ? actHistory.labels : [];
  const actCum = hasActHist && actHistory.cumulative?.length ? actHistory.cumulative : [];
  const actDAct = hasActHist && actHistory.dailyActivations?.length ? actHistory.dailyActivations : [];
  const actDDeact = hasActHist && actHistory.dailyDeactivations?.length ? actHistory.dailyDeactivations : [];

  let breakdownArr = tiers.map((t) => {
    if (activation.breakdown && activation.breakdown[t.tier] != null) return activation.breakdown[t.tier];
    const s = activation.tierStats?.[t.tier]?.allTime || {};
    return netTierCount(s);
  }); 

  const holdersFull = holderSeries(ownership, dailySnapshots);
  const holdersWin = windowChart(holdersFull.labels, [holdersFull.data], timeframe, interval, ['last']);
  const ownLabels = holdersWin.labels;
  const ownData = holdersWin.cols[0] || [];
  const yardHolders = Number(ownership.yardHolders) || Number(ownership.tokenHolders) || Number(ownership.stonkHolders) || Number(ownership.erc20Holders) || 0;

  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);

  const roiRows = tiers.map((t) => {
    const actCost = t.reqTokens * market.tokenPriceUsd;
    const totalCost = floorCostUsd + actCost;
    const simulatedYield = t.trackedAnnualYieldUsd * volumeMultiplier;
    const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
    const payback =
      t.trackedAnnualYieldUsd > 0 ? `${(totalCost / t.trackedAnnualYieldUsd).toFixed(1)}y` : '—';
    return { t, actCost, totalCost, simulatedYield, roi, payback };
  });
  const bestRoiRow = roiRows.reduce((a, b) => ((b.roi || 0) > (a.roi || 0) ? b : a), roiRows[0] || { roi: 0 });

  return (
    <div className="space-y-6 relative">

      {/* ==================== TAB 1: ROI BENCHMARKS ==================== */}
      <ShareSection id="roi" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="ROI"
          sub={`Cash-on-cash vs floor plus activation. ${yieldBasisText(project)}`}
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
              {Number(volumeMultiplier).toFixed(1)}x · {simulatorOpen ? 'Hide' : 'Show'}
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
              filename={`${config.ticker || 'yard'}-seats.csv`}
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
                            <span className="font-mono text-[11px] text-faint">{((t.weight || 100) / 100).toFixed(2)}x</span>
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
                              {seriesHasInk(t.dailyYields) ? (
                                <Line
                                  data={{
                                    labels: t.dailyDates,
                                    datasets: [{
                                      label: 'Daily Yield (USD)',
                                      data: t.dailyYields,
                                      borderColor: '#00a804',
                                      borderWidth: 1.75,
                                      tension: 0.3,
                                    }],
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

      {/* ==================== TAB 2: HISTORICAL YIELD ==================== */}
      <ShareSection id="yield" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Yield" sub="Daily CoC from the hourly ledger. Range follows the Weekly / Monthly / All control.">
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

      {/* ==================== TAB 3: VAULT DISTRIBUTIONS ==================== */}
      <ShareSection id="revenue" title="Distributions" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow={`Vault distributions · ${revPeriod}`}
          sub="SoftStakingVault RewardPaid is $YARD paid to activated Yardkeepers. The yBTC wrap is a separate 0.30% CCIP fee that still sits in the Arbitrum WBTC vault — it is not in the $YARD RewardPaid series."
        >
          <KpiStrip>
            <StreamStat
              color={STREAM_COLORS.amm}
              label="Vault distributions"
              value={formatCurrency(slicedVault.cols[0]?.total || 0)}
              note="RewardPaid to Yardkeepers"
            />
            <StreamStat
              color={STREAM_COLORS.holdersRev}
              label="Holder payout"
              value={formatCurrency(slicedHolder.cols[0]?.total || 0)}
              note="Reconstructed by Anvil tier"
            />
          </KpiStrip>
        </Card>

        <Card eyebrow="yBTC wrap" sub="WBTC on Arbitrum becomes yBTC on Robinhood via Chainlink CCIP.">
          <KpiStrip>
            <StreamStat
              label="yBTC wrap fee"
              value={`${((wrap?.wrapFeeBps || YARD_WRAP.wrapFeeBps) / 100).toFixed(2)}%`}
              note="Fee stays in the Arbitrum vault until a Yardkeeper sync."
            />
            <StreamStat
              label="yBTC receipts"
              value={wrap?.ybtcSupply > 0 ? `${wrap.ybtcSupply.toFixed(4)} BTC` : '—'}
              note={wrap?.ybtcUsd > 0 ? `${formatCurrency(wrap.ybtcUsd)} DexScreener` : 'Live supply from the YAssetReceipt'}
            />
            <StreamStat
              label="yXAUT (CCIP)"
              value={<span className="text-muted">Not live</span>}
              note="Same YAssetGateway. Tether Gold receipt is coded; no receipt token is installed yet."
            />
          </KpiStrip>
        </Card>

        <ProtocolFeeVolumePanels
          labels={slicedVault.labels}
          cols={slicedVault.cols}
          kind={rawRev.kind}
          interval={interval}
          title="Daily vault distributions (USD)"
          note="RewardPaid from the TickerYard SoftStakingVault. This is yield paid to activated Yardkeepers, not a StonkBrokers AMM / Clock-In / snipe mix."
          holder={{
            labels: slicedHolder.labels,
            data: slicedHolder.cols[0]?.data,
            title: 'Holder payout (USD)',
            note: 'Per-NFT daily yield × active Yardkeepers. Same RewardPaid, reconstructed by Anvil tier.',
          }}
        />
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32 space-y-4">
        {lockedLp && lockedLp.pools && lockedLp.pools.length > 0 ? (
          <Card
            eyebrow="Locked LP"
            sub="Tokens sitting in partner, meme, and launchpad pairs."
            corner={
              <button
                type="button"
                onClick={() => setLpTableOpen(!lpTableOpen)}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
              >
                {lpTableOpen ? 'Hide' : `Show ${lockedLp.pools.length}`}
              </button>
            }
          >
            <KpiStrip className="mb-4">
              <Stat label="Tokens locked" value={formatNumber(lockedLp.totalStonkLocked || 0)} note={config.ticker} />
              <Stat label="Pool reserves" value={formatCurrency(lockedLp.totalLpUsd || 0)} />
            </KpiStrip>
            <div className="space-y-4">
              <BlackHoleChartPanels snaps={roiSnaps} lockedLp={lockedLp} ticker={config.ticker} />
              {lpTableOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left">
                    <thead>
                      <tr className="eyebrow border-b border-line text-faint">
                        <th className="px-1 py-2 font-normal">Pair</th>
                        <th className="px-1 py-2 font-normal">DEX</th>
                        <th className="px-1 py-2 text-right font-normal">Locked</th>
                        <th className="px-1 py-2 text-right font-normal">Liquidity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lockedLp.pools.map((p, i) => (
                        <tr key={i} className="border-b border-line-soft">
                          <td className="px-1 py-2 text-[13px] text-ink">{p.pairName}</td>
                          <td className="px-1 py-2 font-mono text-[11px] text-muted">{p.dex}</td>
                          <td className="num px-1 py-2 text-right text-[13px] text-ink">{formatNumber(p.stonkAmount)}</td>
                          <td className="num px-1 py-2 text-right text-[13px] text-ink">{formatCurrency(p.liquidityUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card eyebrow="Liquidity" sub="Locked pool reserves scanned from partner, meme, and launchpad pairs.">
            <p className="font-mono text-[12px] text-faint">No locked LP scanned for this project yet.</p>
          </Card>
        )}
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 4: BURN TRACKER */}
      {/* ========================================================================= */}
      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Burn" sub="Token-wide supply destroyed.">
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
            body: slicedBurnData.length > 0 ? (
              <Line
                key={`burn-${timeframe}`}
                data={{ labels: slicedBurnLabels, datasets: [cumulativeBurnDataset(slicedBurnData, '#8b5cf6')] }}
                options={{ ...opts(slicedBurnLabels), plugins: { ...opts(slicedBurnLabels).plugins, legend: { display: false } }, scales: { ...opts(slicedBurnLabels).scales, y: { ...opts(slicedBurnLabels).scales.y, unit: 'Tokens', ticks: { ...opts(slicedBurnLabels).scales.y.ticks, callback: compactTick } } } }}
              />
            ) : (
              <EmptyChart>No burn history recorded yet</EmptyChart>
            ),
          }}
          flywheel={{
            labels: flywheel.labels,
            burn: flywheel.burn,
            prices: flywheel.prices,
            priceColor: '#00a804',
            burnColor: '#8b5cf6',
            burnLabel: 'Daily Burn Velocity',
            leftMax: flywheel.burnAxisMax,
          }}
        />
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 5: ACTIVATION */}
      {/* ========================================================================= */}
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
        <ChartPanel title="Activity">
          {hasActHist ? (
            <ActivityChart
              labels={actWin.labels}
              net={actWin.cols[0]}
              ins={actWin.cols[1]}
              outs={actWin.cols[2]}
              interval={interval}
              lineColor="#38bdf8"
              lineLabel="Net Active Units"
              outColor="#ff3333"
            />
          ) : (
            <EmptyChart>No activation history recorded</EmptyChart>
          )}
        </ChartPanel>
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 6: OWNERSHIP */}
      {/* ========================================================================= */}
      <ShareSection id="ownership" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Ownership">
          <KpiStrip>
            <Stat label="Circulating" value={formatNumber(ownership.circulatingNftSupply || 0)} />
            <Stat label="NFT holders" value={formatNumber(ownership.nftHolders || 0)} />
            <Stat label="Wallets per 100 NFTs" value={`${(ownership.ownershipRatio || 0).toFixed(2)}`} tone="accent" />
            <Stat label="Token holders" value={formatNumber(yardHolders)} />
            <Stat
              label="Chain onboard"
              value={formatNumber(Number(onboardYard.wallets) || 0)}
              tone="accent"
              note={`First 10 txs · NFT ${formatNumber(onboardYard.nft || 0)}${(Number(onboardYard.token) || 0) ? ` · token ${formatNumber(onboardYard.token)}` : ''}`}
            />
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
          live={{ tokenHolders: yardHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          onboard={{ data, projectKey: 'tickeryard', timeframe, interval, name: 'TickerYard' }}
        />
        <UnderwaterCard ownership={ownership} />
      </ShareSection>

      <MethodologyCard>
          <p><strong className="text-ink">Yield &amp; ROI:</strong> TickerYard is a SoftStakingVault, not the StonkBrokers T4 oracle. Cash-on-cash is annualized vault yield ÷ (NFT floor USD + activation tokens at DexScreener spot), split by Anvil tier weight (1.00×–3.33×). Live yield is a trailing sample, not a promised APY. Keeper jobs described in the TickerYard whitepaper are extra work for enrolled T4 operators and are not in these CoC numbers.</p>
          <p><strong className="text-ink">Distributions:</strong> The $YARD series is SoftStakingVault RewardPaid. That is holder yield, not Anvil AMM fees or launchpad snipe tax.</p>
          <p><strong className="text-ink">yBTC wrap:</strong> TickerYard&apos;s Bitcoin bridge is a Chainlink CCIP canonical wrap: WBTC locked on Arbitrum (<code>YAssetVault</code>) mints yBTC on Robinhood (<code>YAssetReceipt</code>). Wrap fee is 30 bps, taken on Arbitrum. Extra WBTC vs yBTC supply is un-synced protocol fee; <code>YardkeeperRewardsSynchronized</code> has not fired, so wrap fees are not in the $YARD RewardPaid chart. yXAUT (Tether Gold) is the next CCIP receipt in the same gateway and is not installed yet.</p>
          <p><strong className="text-ink">Activation:</strong> Same reconstruction as Mancer. The vault emits no Deactivated event — a sale clears the position. <code>activeCount()</code> is an upper bound; this page replays Activated plus NFT transfers.</p>
          <p><strong className="text-ink">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-ink">Burn:</strong> Days before hourly snapshots are reconstructed from token burns to dead/zero, scaled to the first trusted supply read.</p>
          <p><strong className="text-ink">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Wallets per 100 NFTs is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number, times 100. Activated-wallet count is unique current owners of NFTs that still have an open activation. Chain onboard is unique EOAs whose first cluster buy or mint of this project was one of their first 10 txs.</p>
      </MethodologyCard>

    </div>
  );
}
