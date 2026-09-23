import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct, attributedStonkBurn, dailyAttributedBurnSeries } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, tierRoiDatasets, protocolRevenueChart, sliceCols, windowPeriodLabel, seriesHasInk, holderRevenueCol, windowChart } from '../../lib/yieldHistory';
import { compactUsd, compactNum, Card, Figure, Stat, KpiStrip, Tag, SkeletonCard, SplitBar, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { ShareSection } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, dualAxisOptions, STREAM_COLORS, TIER_COLORS, barThickness, activityChartOptions, levelAxis } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { explorerAddressUrl } from '../../lib/tba';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import {
  EmptyChart,
  ChartPanel,
  YieldUsdPricePanel,
  PaybackPanel,
  ProtocolFeeVolumePanels,
  SmartLpChartPanels,
  BlackHoleChartPanels,
  ActivationStackPanel,
  OwnershipHistoryPanels,
  OnboardLinePanel,
} from '../HistoryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const MODE_ORDER = { 0: 0, 1: 1, 2: 2 };
const MODE_SHORT = { 0: 'FR', 1: 'BB', 2: 'ASK' };

const EMPTY_VAULTS = [];

function groupSmartLpMarkets(vaults) {
  const map = new Map();
  for (const v of vaults || []) {
    const key = v.market || v.symbol || v.ca;
    if (!map.has(key)) {
      map.set(key, { market: key, vaults: [], tvlUsd: 0, fees7dUsd: 0, protocolFees7dUsd: 0, modes: new Set() });
    }
    const g = map.get(key);
    g.vaults.push(v);
    g.tvlUsd += Number(v.tvlUsd) || 0;
    g.fees7dUsd += Number(v.fees7dUsd) || 0;
    g.protocolFees7dUsd += Number(v.protocolFees7dUsd) || 0;
    if (v.mode === 0 || v.mode === 1 || v.mode === 2) g.modes.add(v.mode);
  }
  for (const g of map.values()) {
    g.vaults.sort((a, b) => (MODE_ORDER[a.mode] ?? 9) - (MODE_ORDER[b.mode] ?? 9) || (b.tvlUsd || 0) - (a.tvlUsd || 0));
  }
  return [...map.values()].sort((a, b) => b.tvlUsd - a.tvlUsd || b.fees7dUsd - a.fees7dUsd);
}

function shortCa(ca) {
  const s = String(ca || '');
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function splitMarket(market) {
  const [base, quote] = String(market || '').split('/');
  return { base: base || market, quote: quote || '' };
}

function FeeStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
      <p className="eyebrow text-faint">{label}</p>
      <p className="num mt-1 text-[15px] text-ink">{value}</p>
    </div>
  );
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

export default function StonkDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [lpTableOpen, setLpTableOpen] = useState(false);
  const [smartLpOpen, setSmartLpOpen] = useState(false);
  const [smartLpMarket, setSmartLpMarket] = useState(null);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [yieldPeriod, setYieldPeriod] = useState('Y');

  const project = data?.projects?.stonk;
  const smartLpVaults = Array.isArray(project?.revenue?.smartLp?.vaults)
    ? project.revenue.smartLp.vaults
    : EMPTY_VAULTS;
  const smartLpMarkets = useMemo(() => groupSmartLpMarkets(smartLpVaults), [smartLpVaults]);
  if (!project) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, lockedLp = null, dailySnapshots = [] } = project;

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const chartOptions = baseChartOptions();
  const opts = (labs) => baseChartOptions(labs, interval);

  // ==========================================
  // BULLETPROOF CHART DATA FALLBACKS & FIXES
  // ==========================================

  // 1. Historical Yield Chart — weekly / monthly / all usable snapshots.
  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tierRoiDatasets(roiSnaps, tiers, {
    floorCostUsd,
    tokenPriceUsd: market.tokenPriceUsd,
  });

  // 2. Revenue Chart — one grouped series per stream, colors locked to the boxes.
  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const slicedRev = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const slicedHolder = sliceCols(rawRev.labels, [holderRevenueCol(project, rawRev.rawLabels || rawRev.labels)], timeframe, interval);
  const byKey = Object.fromEntries((slicedRev.cols || []).map((c) => [c.key, c]));
  const { labels: revDates, cols: REV_STREAMS } = {
    labels: slicedRev.labels,
    cols: [
      { ...(byKey.amm || { data: [], total: 0 }), label: 'AMM & Swap Rev', color: STREAM_COLORS.amm },
      { ...(byKey.box || { data: [], total: 0 }), label: 'Clock-In Box', color: STREAM_COLORS.box },
      { ...(byKey.tax || { data: [], total: 0 }), label: 'Snipe / curve tax', color: STREAM_COLORS.tax },
      { ...(byKey.booster || { data: [], total: 0 }), label: 'Partner Revenue Share', color: STREAM_COLORS.booster },
      { ...(byKey.smartLp || { data: [], total: 0 }), label: 'Smart LP Protocol Revenue', color: STREAM_COLORS.smartLp },
    ],
  };
  const smartLp = revenue.smartLp || {};
  const smartLpCol = (() => {
    const col = REV_STREAMS[4] || { total: 0, color: STREAM_COLORS.smartLp, data: [] };
    const live7d = Number(smartLp.protocolFees7dUsd);
    if (timeframe === '7d' && live7d > 0) return { ...col, total: live7d };
    return col;
  })();
  const stonkBoosterTotal =
    (Number(REV_STREAMS[0]?.total) || 0) +
    (Number(REV_STREAMS[1]?.total) || 0) +
    (Number(REV_STREAMS[2]?.total) || 0) +
    (Number(REV_STREAMS[3]?.total) || 0) +
    (Number(smartLpCol.total) || 0);

  // 3. Burn Tracker Data
  const realBurntTokens = Math.max(
    Number(activation.dualBurn?.totalBurnTokens || 0),
    Number(ownership.permanentlyBurntTokens || 0)
  );
  const realBurntUnits = Math.max(
    Number(activation.dualBurn?.equivalentBrokersBurnt || 0),
    Number(ownership.permanentlyBurntUnits || 0),
    Number(ownership.burntNfts || 0)
  );
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  
  const internProject = data?.projects?.interns;
  const burnSplit = attributedStonkBurn(project, internProject);
  const burn = burnSeries(project, timeframe, interval);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;
  const dailySplit = dailyAttributedBurnSeries(project, internProject, timeframe, interval);

  // 4. Flywheel Chart
  const flywheel = burnRateSeries(project, timeframe, interval);
  const fwLabels = flywheel.labels;
  const fwPrices = flywheel.prices;
  const fwBurn = flywheel.burn;

  // 5. Activation Chart — no invented Aug 14–20 series
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
  const stonkHolders = Number(ownership.stonkHolders) || Number(ownership.tokenHolders) || Number(ownership.erc20Holders) || 0;

  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);
  const burntNfts = ownership.burntNfts || ownership.permanentlyBurntUnits || 0;

  const roiRows = tiers.map((t) => {
    const actCost = t.reqTokens * market.tokenPriceUsd;
    const totalCost = floorCostUsd + actCost;
    const simulatedYield = t.trackedAnnualYieldUsd * Number(volumeMultiplier);
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
          sub="Cash-on-cash vs floor plus activation, at last sync."
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

        <Card flush eyebrow="Tiers">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Tier</th>
                  <th className="px-3 py-3 font-normal">Activation</th>
                  <th className="px-3 py-3 font-normal">Cost</th>
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
                {roiRows.map(({ t, actCost, totalCost, simulatedYield, roi }) => {
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
                        <td className="px-3 py-3">
                          <div className="num text-[13px] text-ink">{formatCurrency(totalCost)}</div>
                          <div className="font-mono text-[11px] text-faint">Floor + {formatCurrency(actCost)}</div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{formatCurrency(scaleAnnualYield(simulatedYield, yieldPeriod))}</td>
                        <td className="px-5 py-3 text-right">
                          <Tag tone="good">{roi.toFixed(2)}%</Tag>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-line-soft bg-panel-2/40">
                          <td colSpan="5" className="px-5 py-4">
                            <p className="eyebrow mb-3 text-faint">Trailing 7-day yield · {t.name}</p>
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
        </Card>
      </ShareSection>

      {/* ==================== TAB 2: HISTORICAL YIELD ==================== */}
      <ShareSection id="yield" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Yield" sub="Daily CoC from Aug 20 is the T4 oracle sample. Earlier days reconstruct Clock In pots.">
          <KpiStrip>
            {roiRows.map(({ t, payback }) => (
              <Stat key={t.tier} label={`${t.tier} payback`} value={payback} />
            ))}
          </KpiStrip>
        </Card>

        <ChartPanel title="Tier ROI" tall>
          <Line key={`yield-${timeframe}`} data={{ labels: histLabels, datasets: histDatasets }} options={opts(histLabels)} />
        </ChartPanel>
        <YieldUsdPricePanel snaps={roiSnaps} tiers={tiers} />
        <PaybackPanel snaps={roiSnaps} tiers={tiers} floorCostUsd={floorCostUsd} tokenPriceUsd={market.tokenPriceUsd} />
      </ShareSection>

      {/* ==================== TAB 3: REVENUE & LPS ==================== */}
      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow={`StonkBooster · ${revPeriod}`}
          sub="AMM, Clock-In locker fees, V2 snipe / curve tax, Partner Revenue Share, Smart LP skim. Bonding volume is notional and stays off this stack."
        >
          <Figure value={formatCurrency(stonkBoosterTotal)} />
          <KpiStrip className="mt-6">
            <StreamStat
              color={REV_STREAMS[0].color}
              label="AMM"
              value={formatCurrency(REV_STREAMS[0].total)}
            />
            <StreamStat
              color={REV_STREAMS[1].color}
              label="Clock-In box"
              value={formatCurrency(REV_STREAMS[1].total)}
              note="90% community / 10% protocol"
            />
            <StreamStat
              color={REV_STREAMS[2].color}
              label="Snipe / curve"
              value={formatCurrency(REV_STREAMS[2].total)}
              note={`Bonding ${formatCurrency(revenue.bondingVolumeUsd || 0)} not rev`}
            />
            <StreamStat
              color={REV_STREAMS[3].color}
              label="Partner share"
              value={formatCurrency(REV_STREAMS[3].total)}
              note="Nightshades 13.33% · Mancer 25%"
            />
            <StreamStat
              color={smartLpCol.color}
              label="Smart LP"
              value={formatCurrency(smartLpCol.total)}
              note={smartLp.perfFeeBps ? `${(smartLp.perfFeeBps / 100).toFixed(0)}% skim` : '10% skim'}
            />
          </KpiStrip>
        </Card>

        <ProtocolFeeVolumePanels
            labels={slicedRev.labels}
            cols={REV_STREAMS}
            kind={rawRev.kind}
            interval={interval}
            title="StonkBooster"
            mixTitle="Mix"
            note="Full protocol mix. Clock-In bars are Safety Deposit locker fees. Nightshades 99% anti-snipe stays in the curve. Bonding volume is not plotted."
            holder={{
              labels: slicedHolder.labels,
              data: slicedHolder.cols[0]?.data,
              note: 'From Aug 20: per-NFT daily yield × active units. Earlier bars are Clock In pot inflows.',
            }}
          />
      </ShareSection>

      <ShareSection id="liquidity" title="Smart LPs" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Liquidity"
          sub={`Depositor fees are Uniswap trading fees the vaults collected. Protocol revenue is the ${smartLp.perfFeeBps ? `${(smartLp.perfFeeBps / 100).toFixed(0)}%` : '10%'} skim, split 50/50 into buyback and the Clock In pot.`}
        >
          <KpiStrip>
            <Stat label="Vault TVL" value={formatCurrency(smartLp.totalTvlUsd || 0)} />
            <Stat label="Depositor fees" value={formatCurrency(smartLp.fees7dUsd || 0)} />
            <Stat label="Smart LP rev" value={formatCurrency(smartLp.protocolFees7dUsd || smartLpCol.total || 0)} />
            <Stat
              label="Locked"
              value={lockedLp ? formatNumber(lockedLp.totalStonkLocked || 0) : '—'}
              note={config.ticker}
            />
          </KpiStrip>
        </Card>

          {smartLpVaults.length > 0 && (
            <Card
              eyebrow="Smart LP"
              sub={`${smartLpMarkets.length} pairs, ${smartLpVaults.length} vaults. Full Range, Balanced Band, and Ask sit behind each pair.`}
              corner={
                <button
                  type="button"
                  onClick={() => setSmartLpOpen(!smartLpOpen)}
                  className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
                >
                  {smartLpOpen ? 'Hide' : `Show ${smartLpMarkets.length}`}
                </button>
              }
            >
              <div className="space-y-4">
            <SmartLpChartPanels snaps={roiSnaps} smartLp={smartLp} vaults={smartLpVaults} />
              {smartLpOpen && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {smartLpMarkets.map((g) => {
                    const open = smartLpMarket === g.market;
                    const { base, quote } = splitMarket(g.market);
                    return (
                      <div
                        key={g.market}
                        className={`rounded-xl border text-left ${open ? 'border-line bg-panel-2' : 'border-line'}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSmartLpMarket(open ? null : g.market)}
                          className="w-full p-3.5 text-left sm:p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] text-ink">
                              {base}
                              {quote ? <span className="text-muted"> / {quote}</span> : null}
                            </p>
                            <span className="shrink-0 font-mono text-[11px] text-faint">{open ? 'Hide' : 'Show'}</span>
                          </div>
                          <p className="mt-1 text-[12px] text-muted">TVL {formatCurrency(g.tvlUsd)}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <FeeStat label="Depositor fees" value={formatCurrency(g.fees7dUsd)} />
                            <FeeStat label="Protocol rev" value={formatCurrency(g.protocolFees7dUsd)} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {[0, 1, 2].map((mode) => {
                              const live = g.modes.has(mode);
                              return (
                                <span
                                  key={mode}
                                  className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
                                    live ? 'border-line bg-panel-2 text-ink' : 'border-line text-faint'
                                  }`}
                                >
                                  {MODE_SHORT[mode]}
                                </span>
                              );
                            })}
                          </div>
                        </button>
                        {open && (
                          <div className="space-y-2 border-t border-line px-3 pb-3 pt-2">
                            {g.vaults.map((v) => (
                              <div key={v.ca} className="rounded-lg border border-line bg-panel p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <p className="text-[13px] text-ink">{v.modeLabel || MODE_SHORT[v.mode] || 'Vault'}</p>
                                  <p className="font-mono text-[11px] text-faint">{v.symbol}</p>
                                </div>
                                <p className="mb-2 text-[12px] text-muted">TVL {formatCurrency(v.tvlUsd || 0)}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <FeeStat label="Depositor fees" value={formatCurrency(v.fees7dUsd || 0)} />
                                  <FeeStat label="Protocol rev" value={formatCurrency(v.protocolFees7dUsd || 0)} />
                                </div>
                                <a
                                  href={explorerAddressUrl(v.ca)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-2 inline-block py-1 font-mono text-[11px] text-muted hover:text-ink"
                                >
                                  {shortCa(v.ca)}
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </Card>
          )}

          {lockedLp && lockedLp.pools && lockedLp.pools.length > 0 && (
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
          )}
      </ShareSection>

      {/* ========================================================================= */}
      {/* TAB 4: BURN TRACKER */}
      {/* ========================================================================= */}
      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Burn" sub="Token-wide $STONKBROKER destroyed. Intern burn is half of intern activation fees.">
          <Figure
            value={formatNumber(realBurntTokens)}
            unit={config.ticker}
            after={burnPct != null ? `${burnPct.toFixed(2)}% of supply` : null}
          />
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
          <KpiStrip className="mt-6">
            <Stat label="StonkBrokers burnt" value={formatNumber(burnSplit.brokers)} note="minus intern fees" />
            <Stat label="Interns burnt" value={formatNumber(burnSplit.intern)} note="Separate manager" />
            <Stat label="Units removed" value={formatNumber(realBurntUnits, 2)} />
            <Stat label="Of supply" value={burnPct != null ? `${burnPct.toFixed(2)}%` : '—'} />
          </KpiStrip>
        </Card>

        <ChartPanel
          tall
          title="Cumulative burn"
          note="First mint through today. Pre-snapshot days reconstruct burns that lower totalSupply, plus dead, scaled to the first trusted supply read."
        >
          {slicedBurnData.length > 0 ? (
            <Line
              key={`burn-${timeframe}`}
              data={{
                labels: slicedBurnLabels,
                datasets: [{
                  label: 'Cumulative Burnt',
                  data: slicedBurnData,
                  borderColor: '#8b5cf6',
                  tension: 0.3,
                }],
              }}
              options={{ ...opts(slicedBurnLabels), plugins: { ...opts(slicedBurnLabels).plugins, legend: { display: false } }, scales: { ...opts(slicedBurnLabels).scales, y: { ...opts(slicedBurnLabels).scales.y, ticks: { ...opts(slicedBurnLabels).scales.y.ticks, callback: compactTick } } } }}
            />
          ) : (
            <EmptyChart>No burn history recorded yet</EmptyChart>
          )}
        </ChartPanel>

        <ChartPanel
          title="The Deflationary Flywheel"
          note={`Spot vs daily burn.${timeframe === 'all' ? ' Launch-week days above 10M are clipped so later burns stay readable.' : ''}`}
        >
          <Bar
            key={`flywheel-${timeframe}`}
            data={{
              labels: fwLabels,
              datasets: [
                    { type: 'line', label: 'Token Price ($)', data: fwPrices, borderColor: '#00a804', tension: 0.3, yAxisID: 'y1' },
                { type: 'bar', label: 'Daily burn', data: fwBurn, backgroundColor: '#8b5cf6', borderRadius: 2, maxBarThickness: barThickness(fwLabels.length), yAxisID: 'y' },
              ],
            }}
            options={dualAxisOptions({
              leftTick: compactTick,
              rightTick: compactUsdTick,
              rightColor: '#00a804',
              leftMax: flywheel.burnAxisMax,
              labels: fwLabels,
              leftValues: fwBurn,
              rightValues: fwPrices,
            })}
          />
        </ChartPanel>

        <ChartPanel
          title="Daily intern vs StonkBrokers burn"
          note={`From the first intern activation${dailySplit.startDay ? ` (${dailySplit.startDay})` : ''}. Separate managers, same token.`}
        >
          {dailySplit.rawLabels.length > 0 ? (
            <Bar
              key={`intern-broker-burn-${timeframe}`}
              data={{
                labels: dailySplit.labels,
                datasets: [
                { type: 'bar', label: 'Interns', data: dailySplit.intern, backgroundColor: '#8b5cf6', borderRadius: 2, maxBarThickness: barThickness(dailySplit.labels.length) },
                  { label: 'StonkBrokers', data: dailySplit.brokers, backgroundColor: '#00a804', borderRadius: 2, maxBarThickness: barThickness(dailySplit.labels.length) },
                ],
              }}
              options={{ ...opts(dailySplit.labels), scales: { ...opts(dailySplit.labels).scales, y: { ...opts(dailySplit.labels).scales.y, beginAtZero: true, ticks: { ...opts(dailySplit.labels).scales.y.ticks, callback: compactTick } } } }}
            />
          ) : (
            <EmptyChart>Daily intern vs broker burn starts on the first intern activation</EmptyChart>
          )}
        </ChartPanel>
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
            <div className="flex flex-col items-center justify-center gap-8 md:flex-row md:gap-16">
              <div className="relative flex h-56 w-full items-center justify-center md:h-64 md:w-1/2">
                <Doughnut data={{ labels: tiers.map((t) => t.name), datasets: [{ data: breakdownArr, backgroundColor: TIER_COLORS, borderWidth: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }} />
              </div>
              <div className="flex w-full flex-col gap-2 md:w-1/2">
                {tiers.map((t, idx) => (
                  <div key={t.tier} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: TIER_COLORS[idx % TIER_COLORS.length] }} />
                      <span className="text-[13px] text-ink">{t.tier}: {t.name}</span>
                    </div>
                    <span className="num text-[13px] text-ink">{formatNumber(breakdownArr[idx])}</span>
                  </div>
                ))}
              </div>
            </div>
        </Card>

          <ActivationStackPanel snaps={roiSnaps} tiers={tiers} breakdown={activation.breakdown} />
        <ChartPanel title="Activity">
                {hasActHist ? (
                <Bar
                  data={{
                    labels: actWin.labels,
                    datasets: [
                      { type: 'line', label: 'Net active', data: actWin.cols[0], borderColor: '#38bdf8', tension: 0.3, yAxisID: 'y' },
                      { type: 'bar', label: 'Daily activations', data: actWin.cols[1], backgroundColor: '#00a804', borderRadius: 2, maxBarThickness: barThickness(actWin.points), yAxisID: 'y1' },
                      { type: 'bar', label: 'Daily deactivations', data: actWin.cols[2], backgroundColor: '#ff3333', borderRadius: 2, maxBarThickness: barThickness(actWin.points), yAxisID: 'y1' }
                    ]
                  }}
                  options={activityChartOptions(actWin.labels, actWin.cols[0], actWin.cols[1], actWin.cols[2], interval)}
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
            <Stat label="Concentration" value={`${(ownership.ownershipRatio || 0).toFixed(2)}%`} tone="accent" />
            <Stat label="Token holders" value={formatNumber(stonkHolders)} />
            <Stat
              label="Chain onboard"
              value={formatNumber(Number(data?.onboarding?.byProject?.stonk?.wallets) || 0)}
              tone="accent"
              note="First 10 txs"
            />
          </KpiStrip>
          <KpiStrip className="mt-6">
            <Stat label="Max supply" value={formatNumber(ownership.currentMaxSupply || 0, 2)} />
            <Stat label="Burnt NFTs" value={formatNumber(burntNfts, 2)} />
            <Stat label="AMM vault" value={formatNumber(ownership.ammVaultNfts || 0)} />
            <Stat label="Activated wallets" value={activation.activeHolders == null ? '—' : formatNumber(activation.activeHolders)} />
          </KpiStrip>
        </Card>

        <ChartPanel title="Token holders">
              {seriesHasInk(ownData) ? (
              <Line
                data={{ labels: ownLabels, datasets: [{ label: 'Active Holders', data: ownData, borderColor: '#8b5cf6', tension: 0.3 }] }}
                options={{
                  ...opts(ownLabels),
                  plugins: { ...opts(ownLabels).plugins, legend: { display: false } },
                  scales: {
                    ...opts(ownLabels).scales,
                    y: { ...opts(ownLabels).scales.y, ...levelAxis(opts(ownLabels).scales.y.ticks, ownData) },
                  },
                }}
              />
              ) : (
                <EmptyChart>No holder history recorded</EmptyChart>
              )}
        </ChartPanel>
          <OwnershipHistoryPanels
            snaps={roiSnaps}
            live={{
              tokenHolders: stonkHolders,
              nftHolders: ownership.nftHolders,
              ownershipRatio: ownership.ownershipRatio,
            }}
          />
          <OnboardLinePanel
            data={data}
            projectKey="stonk"
            timeframe={timeframe}
            interval={interval}
            name="StonkBrokers"
          />
      </ShareSection>

      <MethodologyCard>
          <p><strong className="text-ink">Yield &amp; ROI:</strong> Live cash-on-cash is a trailing sample of the T4 Partner oracle wallet, scaled by total network weight / 333, annualized, then divided by (NFT floor USD + activation tokens at DexScreener spot). From 2026-08-20 that oracle is live. Earlier ROI days estimate the same CoC from Clock In v1, v2, and Overtime pot inflows ÷ reconstructed active weight, with cost basis frozen at the first oracle snapshot. Mid-August is a real FOMO / revenue spike (NFT trades printed around 12 ETH); the % uses the later ~4 ETH floor so it tracks that yield spike rather than repricing entry cost day by day. A one-day collapse between two hot UTC sessions is treated as a bucket hole, not a crash. Clock In 3.0 (0xf412…dbc58, 2026-09-21) is the live pot; v2 DirectedClockInBooster is retired.</p>
          <p><strong className="text-ink">Protocol revenue (StonkBooster mix):</strong> AMM collector, Clock In locker fees (v1 retired, v2 retired, v3 live, Overtime retired), launchpad tax, Partner Revenue Share (Nightshades 13.33% civ-pad + Mancer 25% dex), and Smart LP skim. Clock In is Safety Deposit lock/collect fees (90% community / 10% protocol), not a raffle. Nightshades Night vault WETH is The Night inventory and is never counted here. Bonding swap volume is notional and is not revenue.</p>
          <p><strong className="text-ink">Payback:</strong> Entry cost ÷ annualized trailing yield. Charts reprice cost at the last sync.</p>
          <p><strong className="text-ink">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Concentration is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number. Activated-wallet count is unique current owners of NFTs that still have an open activation — a sale clears it. Chain onboard is unique EOAs whose first cluster buy or mint of this project was one of their first 10 txs.</p>
          <p><strong className="text-ink">Burn:</strong> Token-wide $STONKBROKER destroyed (supply deflation + dead + tokens locked in the broker activation manager). The cumulative chart is that token total. Intern activations use a different manager and burn half of each intern fee into the same token; that intern total is subtracted out of the StonkBrokers tile. The daily intern vs StonkBrokers chart starts on the first intern activation and is the first difference of each series. Hourly snapshots stamp internBurnTokens going forward so the split persists on the parent series.</p>
      </MethodologyCard>

    </div>
  );
}
