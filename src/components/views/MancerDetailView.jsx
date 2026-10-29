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
import {
  BOOKS_APP,
  formatBooksPhase,
  formatDuration,
  formatProgress,
  loadTraderBooks,
} from '../../lib/traderBooks';
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

export default function MancerDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(false);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [liveBooks, setLiveBooks] = useState(null);

  const project = data?.projects?.mancer;
  useEffect(() => {
    if (!project) return undefined;
    let live = true;
    const ac = new AbortController();
    loadTraderBooks({ signal: ac.signal })
      .then((next) => { if (live) setLiveBooks(next); })
      .catch(() => { /* keep snapshot */ });
    return () => { live = false; ac.abort(); };
  }, [project]);

  if (!project) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, lockedLp = null, dailySnapshots = [] } = project;
  const books = liveBooks || project.books || null;
  const booksFees = books?.fees || {};
  const booksBoard = books?.board || [];
  const booksPhases = books?.counts?.byPhase || {};

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
  const opts = (labs) => baseChartOptions(labs, interval);
  const onboardMancer = data?.onboarding?.byProject?.mancer || {};

  // ==========================================
  // BULLETPROOF CHART DATA FALLBACKS & FIXES
  // ==========================================

  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;

  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  // 2. Revenue Chart
  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const slicedRev = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe, interval);
  const byKey = Object.fromEntries((rawRev.cols || []).map((c) => [c.key, c]));
  const booksColLive = (() => {
    const base = byKey.books || { data: [], total: 0 };
    const shown = Number(booksFees.mancerUsd) || 0;
    if (shown > 0 && !(Number(base.total) > 0)) {
      return { ...base, total: shown, label: 'Books close fees', color: STREAM_COLORS.books };
    }
    return { ...base, label: 'Books close fees', color: STREAM_COLORS.books };
  })();
  const { labels: revDates, cols: revCols } = sliceCols(
    rawRev.labels,
    [
      { ...(byKey.dex || { data: [] }), label: 'DEX Swap Rev', color: STREAM_COLORS.dex },
      { ...(byKey.amm || { data: [] }), label: 'Vault Inflows', color: STREAM_COLORS.amm },
      { ...(byKey.box || { data: [] }), label: 'Order Layer', color: STREAM_COLORS.box },
      booksColLive,
    ],
    timeframe,
    interval
  );
  const revDataDex = revCols[0]?.data || [];
  const revDataAmm = revCols[1]?.data || [];
  const revDataSec = revCols[2]?.data || [];
  const volDates = revenue.historyDexVolume?.length ? (revenue.historyDates || []) : (revenue.dailyDates || []);
  const volSeries = revenue.historyDexVolume?.length ? revenue.historyDexVolume : (revenue.dailyDexVolume || []);
  const dexVolume = sliceCols(
    formatLabels(volDates),
    [{ key: 'dexVolume', data: volSeries }],
    timeframe,
    interval,
  ).cols[0]?.total || 0;

  // 3. Burn Tracker Data (Dynamic Dates to Current Day)
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
  const mancerHolders = Number(ownership.mancerHolders) || Number(ownership.tokenHolders) || Number(ownership.stonkHolders) || Number(ownership.erc20Holders) || 0;

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
              filename={`${config.ticker || 'mancer'}-seats.csv`}
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

      {/* ==================== TAB 3: REVENUE & LPS ==================== */}
      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow={`Protocol revenue · ${revPeriod}`}
          sub="Routing rev is the fee kept plus vault rewards paid in WETH or USDG. Swap volume is the notional through the router, and is not revenue."
        >
          <KpiStrip>
            <StreamStat
              color={STREAM_COLORS.dex}
              label="DEX swap volume"
              value={formatCurrency(dexVolume)}
              note="Router notional, not revenue"
            />
            <StreamStat
              color={STREAM_COLORS.dex}
              label="DEX routing rev"
              value={formatCurrency(revCols[0]?.total || 0)}
              note="Collector fees in WETH and USDG"
            />
            <StreamStat
              color={STREAM_COLORS.amm}
              label="Vault inflows"
              value={formatCurrency(revCols[1]?.total || 0)}
              note="Soft-staking vault RewardPaid"
            />
            <StreamStat
              color={STREAM_COLORS.box}
              label="Order layer"
              value={formatCurrency(revCols[2]?.total || 0)}
              note="Order execution layer"
            />
            <StreamStat
              color={STREAM_COLORS.books}
              label="Books close fees"
              value={formatCurrency(revCols[3]?.total || booksFees.mancerUsd || 0)}
              note={booksFees.estimated
                ? 'Est. 1% of open vault NAV (Mancer half of 2%)'
                : 'Accrued close + NFT market (Mancer share)'}
            />
          </KpiStrip>
        </Card>

        <ProtocolFeeVolumePanels
          labels={revDates}
          cols={revCols}
          kind={rawRev.kind}
          interval={interval}
          title="Vault and routing"
          note="DEX collector fees, SoftStakingVault RewardPaid, and Books close fees by day. Same cash as Paid to seats below, split by stream."
          holder={{
            labels: slicedHolder.labels,
            data: slicedHolder.cols[0]?.data,
            note: 'Per-NFT daily yield × active units at each tier. Same vault/DEX cash, reconstructed by Anvil tier.',
          }}
        />
      </ShareSection>

      <ShareSection id="books" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Books · Social Capital Markets"
          sub="Clutch contracts, hosted on Mancer. Traders raise on a bonding curve into an ERC-6551 vault, trade for an epoch, then settle. Close fee is 2% of vault NAV — half to Mancer, half to StonkBrokers."
        >
          <KpiStrip>
            <Stat
              label="Books"
              value={String(books?.counts?.total ?? booksBoard.length ?? '—')}
              note={[
                booksPhases.raising ? `${booksPhases.raising} raising` : null,
                booksPhases.trading ? `${booksPhases.trading} trading` : null,
                booksPhases.graduated ? `${booksPhases.graduated} graduated` : null,
              ].filter(Boolean).join(' · ') || 'Live board'}
            />
            <Stat
              label="Raised"
              value={formatCurrency(books?.raise?.raisedUsd || 0)}
              note={books?.raise?.buys ? `${compactNum(books.raise.buys)} buys` : 'Across open books'}
            />
            <StreamStat
              color={STREAM_COLORS.books}
              label="Mancer close fee"
              value={formatCurrency(booksFees.mancerUsd || 0)}
              note={booksFees.estimated ? 'Estimate until settlement' : 'Accrued'}
            />
            <StreamStat
              color={STREAM_COLORS.booster}
              label="Stonk share"
              value={formatCurrency(booksFees.protocolUsd || 0)}
              note="Protocol half of the 2% close"
            />
          </KpiStrip>
          <p className="mt-4 text-[13px] text-muted">
            Open a book or trade on{' '}
            <a href={BOOKS_APP} target="_blank" rel="noreferrer" className="text-ink underline decoration-line underline-offset-2">
              mancer.xyz/books
            </a>
            .
          </p>
        </Card>
        <Card flush eyebrow="Live board" sub="Raising, graduated, and trading books from the Mancer indexer. Progress is raise → graduation mcap.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Book</th>
                  <th className="px-3 py-3 font-normal">Phase</th>
                  <th className="px-3 py-3 font-normal">Quote</th>
                  <th className="px-3 py-3 font-normal">Raised</th>
                  <th className="px-3 py-3 font-normal">Progress</th>
                  <th className="px-3 py-3 font-normal">Close est.</th>
                  <th className="px-5 py-3 text-right font-normal">Left</th>
                </tr>
              </thead>
              <tbody>
                {booksBoard.length ? booksBoard.map((row) => (
                  <tr key={row.token || row.bookId} className="border-b border-line-soft">
                    <td className="px-5 py-3">
                      <a href={row.href} target="_blank" rel="noreferrer" className="text-[13px] text-ink hover:underline">
                        {row.name}
                      </a>
                      <div className="font-mono text-[11px] text-faint">{row.symbol}</div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink">{formatBooksPhase(row.phase)}</td>
                    <td className="px-3 py-3 font-mono text-[12px] text-muted">{row.quoteSymbol}</td>
                    <td className="num px-3 py-3 text-[13px] text-ink">
                      {row.raisedUsd > 0 ? formatCurrency(row.raisedUsd) : '—'}
                    </td>
                    <td className="num px-3 py-3 text-[13px] text-muted">{formatProgress(row.progressBps)}</td>
                    <td className="num px-3 py-3 text-[13px] text-ink">
                      {(row.closeFeeMancerUsd + row.closeFeeProtocolUsd) > 0
                        ? formatCurrency(row.closeFeeMancerUsd + row.closeFeeProtocolUsd)
                        : '—'}
                    </td>
                    <td className="num px-5 py-3 text-right text-[13px] text-muted">
                      {formatDuration(row.timeLeftSecs)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-[13px] text-muted">
                      {books ? 'No books in this window yet.' : 'Loading Books…'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
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
        <ChartPanel
          title="Active units vs daily flow"
          note="The line is currently-active NFTs at end of day (sales deactivate). Bars are new activations and exits, not upgrades."
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
            <Stat label="Token holders" value={formatNumber(mancerHolders)} />
            <Stat
              label="Chain onboard"
              value={formatNumber(Number(onboardMancer.wallets) || 0)}
              tone="accent"
              note={`First 10 txs · NFT ${formatNumber(onboardMancer.nft || 0)}${(Number(onboardMancer.token) || 0) ? ` · token ${formatNumber(onboardMancer.token)}` : ''}`}
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
          live={{ tokenHolders: mancerHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          onboard={{ data, projectKey: 'mancer', timeframe, interval, name: 'Mancer' }}
        />
        <UnderwaterCard ownership={ownership} />
      </ShareSection>

      <MethodologyCard>
          <p><strong className="text-ink">Yield &amp; ROI:</strong> Mancer is a SoftStakingVault, not the StonkBrokers T4 oracle. Cash-on-cash is annualized vault / protocol yield ÷ (NFT floor USD + activation tokens at DexScreener spot), split by Anvil tier weight (100 / 125 / 160 / 200 / 333). Live yield is a trailing sample, not a promised APY.</p>
          <p><strong className="text-ink">Activation:</strong> Total Active Units is the live set after replaying vault events plus NFT transfers. Mancer emits no Deactivated event — a sale clears the position. The contract&apos;s <code>activeCount()</code> is an upper bound and is not what this page shows. Tier flow cards are gross activate/exit events in the window, not the live mix (that is the doughnut).</p>
          <p><strong className="text-ink">Revenue:</strong> Dex collector fees in WETH and USDG, plus vault RewardPaid. RewardPaid in WETH or USDG is swap-sourced and is included in DEX routing rev. Swap volume is the router fill notional and is not added to that rev. 25% of the Mancer dex tax (collector fees only, not rewards and not volume) is also credited to StonkBrokers Partner Revenue Share. This page still shows Mancer&apos;s full collector — do not add the two protocol totals together.</p>
          <p><strong className="text-ink">Books:</strong> Social Capital Markets (Clutch contracts, Mancer host). Close fee is 2% of vault NAV at settlement, split evenly Mancer / StonkBrokers. Until a book settles the close fee on this page is an estimate from live NAV. Stonk&apos;s half lands on Partner Revenue Share when accrued. Raise tax remainder can also route to the stock booster on some books.</p>
          <p><strong className="text-ink">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-ink">Burn:</strong> Days before hourly snapshots are reconstructed from token burns to dead/zero, scaled to the first trusted supply read.</p>
          <p><strong className="text-ink">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Wallets per 100 NFTs is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number, times 100. Activated-wallet count is unique current owners of NFTs that still have an open activation. Chain onboard is unique EOAs whose first cluster buy or mint of this project was one of their first 10 txs.</p>
      </MethodologyCard>

    </div>
  );
}
