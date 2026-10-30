import React, { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, protocolRevenueChart, sliceCols, seriesHasInk, windowChart } from '../../lib/yieldHistory';
import { BetaTag, Card, Figure, Stat, KpiStrip, Tag, SkeletonCard, YieldPeriodToggle, scaleAnnualYield, yieldSuffix, compactUsd, compactNum } from '../kit';
import { yieldBasisText } from '../../lib/yieldSample';
import { seatCsvRows } from '../../lib/csv';
import { CsvButton } from '../CsvButton';
import { CopyControl, ShareSection, copySectionEl } from '../CopyControl';
import { TierFlowSection, netTierCount } from '../TierFlowCards';
import { baseChartOptions, compactTick, compactUsdTick, cumulativeBurnDataset, TIER_COLORS, percentTick } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { holderSeries } from '../../lib/snapshots';
import { MethodologyCard } from '../Disclaimer';
import { UnderwaterCard } from '../UnderwaterCard';
import {
  EmptyChart,
  ChartPanel,
  YieldHistorySwitch,
  BurnHistorySwitch,
  ChartStack,
  ActivityChart,
  ActivationStackPanel,
  OwnershipHistoryPanels,
} from '../HistoryCharts';
import { SliceChart } from '../SliceChart';
import { applyLiveMachines, dropsForMachine, freshAlleyDrops, loadLiveDrops, loadMachineCatalog, mergeMachineCatalog } from '../../lib/cardwallDrops';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const PULL_SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'value', label: 'Value' },
  { id: 'paid', label: 'Paid' },
  { id: 'edge', label: 'Edge' },
  { id: 'name', label: 'Name' },
];

function sortPulls(list, sort) {
  const rows = [...list];
  const edge = (row) => (Number(row.value) || 0) - (Number(row.paid) || 0);
  rows.sort((a, b) => {
    if (sort === 'value') return (Number(b.value) || 0) - (Number(a.value) || 0) || String(b.at || '').localeCompare(String(a.at || ''));
    if (sort === 'paid') return (Number(b.paid) || 0) - (Number(a.paid) || 0) || String(b.at || '').localeCompare(String(a.at || ''));
    if (sort === 'edge') return edge(b) - edge(a) || String(b.at || '').localeCompare(String(a.at || ''));
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    return String(b.at || '').localeCompare(String(a.at || ''));
  });
  return rows;
}

function DropEdge({ paid, value, formatCurrency, className = '' }) {
  const edge = (Number(value) || 0) - (Number(paid) || 0);
  const tone = edge > 0 ? 'text-accent' : edge < 0 ? 'text-danger' : 'text-faint';
  return (
    <span className={`block ${tone} ${className}`}>
      {edge > 0 ? '+' : ''}{formatCurrency(edge)}
    </span>
  );
}

export default function CardWallDetailView({ data, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [expandedTier, setExpandedTier] = useState(null);
  const [tierTimeframe, setTierTimeframe] = useState('allTime');
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [liveDrops, setLiveDrops] = useState(null);
  const [machineCatalog, setMachineCatalog] = useState([]);
  const [machinePulls, setMachinePulls] = useState(undefined);
  const [openMachine, setOpenMachine] = useState(null);
  const [pullSort, setPullSort] = useState('recent');
  const [dropMachine, setDropMachine] = useState('');
  const [rainFilter, setRainFilter] = useState('all');
  const [selectedRain, setSelectedRain] = useState(null);
  const dropsRef = useRef(null);
  const rainRef = useRef(null);
  const dropModalRef = useRef(null);

  useEffect(() => {
    const ac = new AbortController();
    loadMachineCatalog(ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted && rows.length) setMachineCatalog(rows);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);
    loadLiveDrops(ac.signal)
      .then((drops) => {
        if (!ac.signal.aborted && drops) setLiveDrops(drops);
      })
      .catch(() => {});
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/gacha-pulls.json?v=${Date.now()}`, { signal: ac.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (ac.signal.aborted) return;
        setMachinePulls(Array.isArray(body?.pulls) ? body.pulls : null);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setMachinePulls(null);
      });
    return () => ac.abort();
  }, []);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const project = data?.projects?.cardwall || data?.projects?.card;
  if (!project) return <SkeletonCard rows={4} />;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, dailySnapshots = [], ledger = null, rain = null } = project;
  const rainDrops = Array.isArray(rain?.drops) ? rain.drops : [];
  const rainStats = rain?.stats || {};
  const rainShown = rainFilter === 'all'
    ? rainDrops
    : rainDrops.filter((d) => d.kind === rainFilter);

  const formatCurrency = compactUsd;
  const formatNumber = compactNum;

  const floorCostUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);

  const tierFloorUsd = () => {
    const stars = (market.starFloorEth || []).map(Number).filter((n) => n > 0);
    const eth = stars.length ? Math.min(...stars) : (market.nftFloorEth || 0);
    return eth * (market.ethPriceUsd || 0);
  };

  const hasSnaps = Array.isArray(dailySnapshots) && dailySnapshots.length > 0 && dailySnapshots[0].date;
  const roiSnaps = windowSnapshots(dailySnapshots, timeframe, interval).filter((s) =>
    Array.isArray(s.tiers) && s.tiers.some((t) => (t.yieldUsd || 0) > 0 || (t.roi || 0) > 0)
  );
  const histLabels = formatLabels(roiSnaps.map(s => s.date));
  const histDatasets = tiers.map((t, i) => {
    const tc = tierFloorUsd(t, i) + (t.reqTokens * market.tokenPriceUsd);
    const currentRoi = tc > 0 ? ((t.trackedAnnualYieldUsd / tc) * 100).toFixed(2) : 0;
    return {
      label: `${t.tier} ROI (${currentRoi}%)`,
      data: roiSnaps.map(s => s.tiers?.find(st => st.tier === t.tier)?.roi || 0),
      borderColor: ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'][i % 5],
      tension: 0.3, borderWidth: 2, pointRadius: 2
    };
  });

  const zeros = [0, 0, 0, 0, 0, 0, 0];
  const gacha = project.gacha || null;
  const gachaWin = gacha?.historyDates?.length
    ? windowChart(gacha.historyDates, [gacha.historyAlley || [], gacha.historyClaw || []], timeframe, interval, ['sum', 'sum'])
    : null;
  const edgeWin = gacha?.historyValue?.length
    ? windowChart(gacha.historyDates, [gacha.historyUsd || [], gacha.historyValue || []], timeframe, interval, ['sum', 'sum'])
    : null;
  const edge = gacha?.edge || null;
  const freshMachines = freshAlleyDrops(gacha?.drops, liveDrops);
  const alleyMachines = mergeMachineCatalog(applyLiveMachines(gacha?.machines, freshMachines), machineCatalog);
  const machineNames = [];
  const seenNames = new Set();
  for (const row of alleyMachines) {
    if (!row.label || seenNames.has(row.label)) continue;
    seenNames.add(row.label);
    machineNames.push(row.label);
  }
  const clawSeen = (gacha?.drops || []).some((drop) => drop.game === 'claw')
    || (liveDrops || []).some((drop) => drop.game === 'claw');
  if (clawSeen) machineNames.push('The Claw');
  const activeMachine = machineNames.includes(dropMachine) ? dropMachine : '';
  const drops = dropsForMachine(gacha?.drops, liveDrops, machinePulls, activeMachine);
  const pullsByMachine = new Map();
  for (const pull of machinePulls || []) {
    if (!pull?.machineHash) continue;
    const list = pullsByMachine.get(pull.machineHash);
    if (list) list.push(pull);
    else pullsByMachine.set(pull.machineHash, [pull]);
  }
  const railLine = (rails) => {
    if (!rails) return '';
    const bits = [
      ['USDG', rails.usdg],
      ['$WALL', rails.wall],
      ['ETH', rails.eth],
      ['WETH', rails.weth],
    ].filter(([, n]) => Number(n) > 0);
    return bits.map(([name, n]) => `${name} ${formatCurrency(n)}`).join(' · ');
  };
  const rawRev = protocolRevenueChart(project);
  const { labels: revDates, cols: revCols } = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const revData1 = revCols[0]?.data || zeros;
  const revData2 = revCols[1]?.data || zeros;

  const stackedUsdOptions = (labels, stacked) => {
    const o = baseChartOptions(labels, interval, { yUnit: 'USD', yTick: compactUsdTick });
    return {
      ...o,
      scales: {
        x: { ...o.scales.x, stacked },
        y: { ...o.scales.y, stacked, beginAtZero: true },
      },
    };
  };

  const realBurntTokens = Math.max(Number(activation.dualBurn?.totalBurnTokens || 0), Number(ownership.permanentlyBurntTokens || 0));
  const burnPct = burnOfSupplyPct(project, realBurntTokens);
  const realBurntUnits = Math.max(Number(activation.dualBurn?.equivalentBrokersBurnt || 0), Number(ownership.permanentlyBurntUnits || 0), Number(ownership.burntNfts || 0));
  
  const burn = burnSeries(project, timeframe, interval);
  const slicedBurnLabels = burn.labels;
  const slicedBurnData = burn.data;

  const flywheel = burnRateSeries(project, timeframe, interval);

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
  const wallHolders = Number(ownership.wallHolders) || Number(ownership.tokenHolders) || Number(ownership.erc20Holders) || Number(ownership.stonkHolders) || 0;

  const actWin = windowChart(actLabels, [actCum, actDAct, actDDeact], timeframe, interval, ['last', 'sum', 'sum']);

  return (
    <div className="space-y-6 relative">

      {/* TAB 1: ROI BENCHMARKS */}
      <ShareSection id="roi" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="ROI"
          sub={`Cash-on-cash vs floor plus activation. ${yieldBasisText(project)}`}
          corner={(
            <div className="flex items-center gap-2">
              <BetaTag />
              <span className="font-mono text-[11px] text-muted">Floor {formatCurrency(floorCostUsd)}</span>
            </div>
          )}
        >
          <KpiStrip>
            <Stat label="Staking to holders" value={formatCurrency(revenue.holderStaking30dUsd || 0)} tone="accent" note="30d $WALL, annualized below" />
            <Stat label="Slab rain to holders" value={formatCurrency(revenue.holderRainUsd || ledger?.deliveredUsd || 0)} note="VaultLedger landed cost with members" />
            <Stat label="Gacha charged" value={formatCurrency(gacha?.usd || 0)} tone="muted" note="Restocks the vault, not added to rain" />
          </KpiStrip>
        </Card>

        {rainDrops.length ? (
          <div ref={rainRef} id="cardwall-rain">
            <Card
              eyebrow="Slab rain"
              sub={(
                <>
                  Graded slabs and Alley credit landing on activated memberships — the same feed as{' '}
                  <a href="https://thecardwall.com/rain" target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">thecardwall.com/rain</a>
                  . Not machine pulls; those live under Revenue.
                </>
              )}
              corner={(
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'slab', label: 'Slabs' },
                    { id: 'credit', label: 'Credit' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRainFilter(opt.id)}
                      data-share-omit
                      className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
                        rainFilter === opt.id ? 'border-line bg-panel-2 text-ink' : 'border-line text-faint hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <CopyControl
                    alwaysLabel
                    heading
                    idleLabel="Copy section"
                    title="Copy the rain feed for X"
                    className="bg-panel"
                    onCopy={() => copySectionEl(rainRef.current, 'cardwall-rain')}
                  />
                  <Tag tone="plain">
                    {rainStats.dropCount != null ? `${formatNumber(rainStats.dropCount)} paid` : `${rainShown.length} shown`}
                    {rainStats.paidOutUsd != null ? ` · ${formatCurrency(rainStats.paidOutUsd)}` : ''}
                  </Tag>
                </div>
              )}
            >
              {rainStats.vaultSlabs != null || rainStats.vaultCredits != null ? (
                <KpiStrip className="mb-4">
                  <Stat
                    label="In the vault"
                    value={`${formatNumber((rainStats.vaultSlabs || 0) + (rainStats.vaultCredits || 0))}`}
                    note={`${formatNumber(rainStats.vaultSlabs || 0)} slabs · ${formatNumber(rainStats.vaultCredits || 0)} credits`}
                  />
                  <Stat
                    label="In rotation"
                    value={rainStats.inRotation != null ? formatNumber(rainStats.inRotation) : '—'}
                    note="Activated memberships in the rain queue"
                  />
                  <Stat
                    label="Rain paid out"
                    value={formatCurrency(rainStats.paidOutUsd || 0)}
                    tone="accent"
                    note={rainStats.dropCount != null ? `${formatNumber(rainStats.dropCount)} drops to members` : 'From the public rain book'}
                  />
                </KpiStrip>
              ) : null}
              {rainShown.length ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {rainShown.map((drop) => (
                    <button
                      key={drop.id}
                      type="button"
                      onClick={() => setSelectedRain(drop)}
                      className="flex w-36 shrink-0 cursor-pointer flex-col rounded-xl border border-line bg-panel-2 p-2.5 text-left transition-colors hover:border-muted"
                    >
                      <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-panel">
                        {drop.kind === 'credit' ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
                            <span className="font-mono text-[22px] text-ink">$50</span>
                            <span className="font-mono text-[10px] uppercase tracking-wide text-faint">Alley credit</span>
                          </div>
                        ) : drop.image ? (
                          <img src={drop.image} alt={drop.name} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="font-mono text-[10px] text-faint">No photo</span>
                        )}
                        {drop.grade ? (
                          <span className="absolute right-1.5 top-1.5 rounded bg-mark-green px-1.5 py-0.5 font-mono text-[9px] font-medium text-black">{drop.grade}</span>
                        ) : drop.kind === 'credit' ? (
                          <span className="absolute right-1.5 top-1.5 rounded bg-mark-sky px-1.5 py-0.5 font-mono text-[9px] font-medium text-black">Credit</span>
                        ) : null}
                      </div>
                      <p className="mt-2 min-h-8 text-[12px] text-ink line-clamp-2">{drop.name}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-faint">
                        {drop.membershipId != null ? `Membership #${drop.membershipId}` : 'Member wall'}
                        {drop.dateLabel ? ` · ${drop.dateLabel}` : ''}
                      </p>
                      <p className="mt-2 font-mono text-[12px] text-ink">{formatCurrency(drop.landedCostUsd || 0)}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-[12px] text-faint">No {rainFilter === 'slab' ? 'slab' : 'credit'} drops in this window.</p>
              )}
            </Card>
          </div>
        ) : null}

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
          eyebrow="Wall levels"
          corner={(
            <CsvButton
              filename={`${config.ticker || 'wall'}-seats.csv`}
              rows={seatCsvRows(project, { floorUsd: tierFloorUsd(), volume: volumeMultiplier })}
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
                {tiers.map((t, i) => {
                  const actCost = t.reqTokens * market.tokenPriceUsd;
                  const rowFloor = tierFloorUsd(t, i);
                  const totalCost = rowFloor + actCost;
                  const simulatedYield = t.trackedAnnualYieldUsd * volumeMultiplier;
                  const roi = totalCost > 0 ? (simulatedYield / totalCost) * 100 : 0;
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
                            <span className="font-mono text-[11px] text-faint">{t.weight}x</span>
                          </div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {t.reqTokens > 0 ? (
                            <>{formatNumber(t.reqTokens)} <span className="text-muted">${config.ticker}</span></>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{rowFloor > 0 ? formatCurrency(rowFloor) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{actCost > 0 ? formatCurrency(actCost) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">
                          {formatCurrency(scaleAnnualYield(simulatedYield, yieldPeriod))} <span className="text-muted">{yieldSuffix(yieldPeriod)}</span>
                        </td>
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
                                    labels: t.dailyDates?.length ? t.dailyDates : revDates,
                                    datasets: [{ label: 'Daily Yield (USD)', data: t.dailyYields, borderColor: '#00a804', borderWidth: 1.75, tension: 0.3, pointRadius: 0 }],
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

      {/* TAB 2: HISTORICAL YIELD */}
      <ShareSection id="yield" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Yield" sub="Payback uses the live annualized rain rate. The ROI chart follows the sticky range control.">
          <KpiStrip>
            {tiers.map((t, i) => {
              const tc = tierFloorUsd(t, i) + (t.reqTokens * market.tokenPriceUsd);
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
          empty="No rain-backed ROI days recorded yet"
        />
      </ShareSection>

      {/* TAB 3: REVENUE */}
      <ShareSection id="revenue" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Gacha pull revenue"
          sub="The Alley and The Claw charge ETH, WETH, USDG, or $WALL for a slab. This is that charge, taken from each machine's pull event. Buyback credit spent on the claw is a recycled payout, so it is not counted again."
        >
          {gacha ? (
            <>
              <Figure value={formatCurrency(gacha.usd || 0)} after={`${formatNumber(gacha.pulls || 0)} pulls`} />
              <KpiStrip className="mt-6">
                <Stat
                  label="The Alley"
                  value={formatCurrency(gacha.alley?.usd || 0)}
                  note={`${formatNumber(gacha.alley?.pulls || 0)} pulls${railLine(gacha.alley?.rails) ? ` · ${railLine(gacha.alley.rails)}` : ''}`}
                />
                <Stat
                  label="The Claw"
                  value={formatCurrency(gacha.claw?.usd || 0)}
                  note={`${formatNumber(gacha.claw?.pulls || 0)} pulls${gacha.claw?.creditPulls ? ` · ${formatNumber(gacha.claw.creditPulls)} on credit` : ''}${railLine(gacha.claw?.rails) ? ` · ${railLine(gacha.claw.rails)}` : ''}`}
                />
              </KpiStrip>
            </>
          ) : (
            <p className="font-mono text-[12px] text-faint">Pull revenue has not been indexed yet.</p>
          )}
        </Card>

        {gacha ? (
          <>
            <ChartPanel
              title="Pulls by day"
              note="USD charged that day. The sticky range control slices this series. The Claw is the crane at thecardwall.com/crane."
            >
              {gachaWin?.labels?.length ? (
                <Bar
                  data={{
                    labels: gachaWin.labels,
                    datasets: [
                      { label: 'The Alley', data: gachaWin.cols[0] || [], backgroundColor: '#f5b700', borderRadius: 2 },
                      { label: 'The Claw', data: gachaWin.cols[1] || [], backgroundColor: '#38bdf8', borderRadius: 2 },
                    ],
                  }}
                  options={stackedUsdOptions(gachaWin.labels, true)}
                />
              ) : (
                <EmptyChart>No pulls recorded yet</EmptyChart>
              )}
            </ChartPanel>

            {alleyMachines.length ? (
              <Card
                eyebrow="Alley machines"
                sub="Every machine on the till. A reload adds spins the hourly index has not written yet. Open a machine for every slab it revealed."
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left">
                    <thead>
                      <tr className="eyebrow border-b border-line text-faint">
                        <th className="px-1 py-2 font-normal">Machine</th>
                        <th className="px-1 py-2 text-right font-normal">Pulls</th>
                        <th className="px-1 py-2 text-right font-normal">Paid in</th>
                        <th className="px-1 py-2 text-right font-normal">Card value</th>
                        <th className="px-1 py-2 text-right font-normal">Spread</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alleyMachines.map((m) => {
                        const open = openMachine === m.id;
                        const seen = new Set((pullsByMachine.get(m.id) || []).map((pull) => pull.id));
                        const extra = freshMachines.filter((drop) => drop.machine === m.label && !seen.has(drop.id));
                        const rows = open ? sortPulls([...(pullsByMachine.get(m.id) || []), ...extra], pullSort) : [];
                        return (
                          <React.Fragment key={m.id}>
                            <tr
                              className={`cursor-pointer border-b border-line-soft hover:bg-panel-2 ${open ? 'bg-panel-2' : ''}`}
                              onClick={() => setOpenMachine(open ? null : m.id)}
                            >
                              <td className="px-1 py-2 text-[13px] text-ink">
                                <span className="inline-flex items-center gap-2">
                                  <span className="w-3 text-[10px] text-faint" aria-hidden="true">{open ? '▾' : '▸'}</span>
                                  {m.label}
                                  {m.available === false ? <Tag tone="plain">restocking</Tag> : null}
                                </span>
                              </td>
                              <td className="num px-1 py-2 text-right text-[13px] text-muted">{formatNumber(m.pulls)}</td>
                              <td className="num px-1 py-2 text-right text-[13px] text-ink">{formatCurrency(m.paidIn ?? m.usd)}</td>
                              <td className="num px-1 py-2 text-right text-[13px] text-ink">{formatCurrency(m.valueOut || 0)}</td>
                              <td className={`num px-1 py-2 text-right text-[13px] ${(m.spread || 0) >= 0 ? 'text-accent' : 'text-danger'}`}>{formatCurrency(m.spread || 0)}</td>
                            </tr>
                            {open ? (
                              <tr className="border-b border-line-soft">
                                <td colSpan={5} className="px-2 py-3" data-share-omit>
                                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                                    {PULL_SORTS.map((sort) => (
                                      <button
                                        key={sort.id}
                                        type="button"
                                        onClick={() => setPullSort(sort.id)}
                                        className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
                                          pullSort === sort.id ? 'border-line bg-panel-2 text-ink' : 'border-line text-faint hover:text-ink'
                                        }`}
                                      >
                                        {sort.label}
                                      </button>
                                    ))}
                                    <span className="ml-auto font-mono text-[10px] text-faint">{formatNumber(rows.length)} slabs</span>
                                  </div>
                                  {machinePulls === undefined ? (
                                    <p className="font-mono text-[12px] text-faint">Loading pulls…</p>
                                  ) : machinePulls === null ? (
                                    <p className="font-mono text-[12px] text-faint">The pull list lands with the next hourly index.</p>
                                  ) : rows.length ? (
                                    <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-line">
                                      {rows.map((pull) => (
                                        <button
                                          key={pull.id}
                                          type="button"
                                          onClick={() => setSelectedDrop({ ...pull, machine: pull.machine || m.label, game: pull.game || 'alley' })}
                                          className="flex w-full items-center gap-3 border-b border-line-soft px-3 py-2 text-left last:border-b-0 hover:bg-panel-2"
                                        >
                                          <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-panel-2">
                                            {pull.image ? (
                                              <img src={pull.image} alt="" data-drop-id={pull.id} className="h-full w-full object-contain" />
                                            ) : null}
                                          </span>
                                          <span className="min-w-0 flex-1">
                                            <span className={`block truncate text-[13px] ${pull.pending ? 'text-faint' : 'text-ink'}`}>{pull.name}</span>
                                            <span className="block truncate font-mono text-[10px] text-faint">
                                              {[pull.grade, pull.at ? `${pull.at.replace('T', ' ').slice(0, 16)} UTC` : null].filter(Boolean).join(' · ')}
                                            </span>
                                          </span>
                                          <span className="shrink-0 text-right">
                                            <span className="num block text-[13px] leading-none text-ink">{formatCurrency(pull.value || 0)}</span>
                                            <span className="mt-1 block font-mono text-[10px] text-faint">paid {formatCurrency(pull.paid || 0)}</span>
                                            <DropEdge paid={pull.paid} value={pull.value} formatCurrency={formatCurrency} className="font-mono text-[10px]" />
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="font-mono text-[12px] text-faint">No revealed slabs for this machine.</p>
                                  )}
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            {edge ? (
              <>
                <Card
                  eyebrow="Paid in vs card value out"
                  sub={`Each pull hands back a slab with a posted value: insured price on The Alley, fair-market value on The Claw. Spread is money in minus that posted value. It is the house result against the card the player was awarded, not what the protocol paid to acquire the slab. On The Alley, ${formatNumber(edge.deliveredPulls || 0)} slabs actually left (${formatCurrency(edge.deliveredValue || 0)} posted). ${formatNumber(edge.buybackPulls || 0)} were sold back for ${formatCurrency(edge.buybackUsd || 0)}, and those cards stayed.`}
                >
                  <KpiStrip>
                    <Stat
                      label="Money in"
                      value={formatCurrency(edge.moneyIn || 0)}
                      tone="accent"
                      note={`${formatNumber(edge.awarded || 0)} cards revealed${edge.refunded ? ` · ${formatNumber(edge.refunded)} refunded` : ''}`}
                    />
                    <Stat
                      label="Card value out"
                      value={formatCurrency(edge.valueOut || 0)}
                      note={`Alley ${formatCurrency(edge.alley?.valueOut || 0)} · Claw ${formatCurrency(edge.claw?.valueOut || 0)}${edge.creditValue ? ` · ${formatCurrency(edge.creditValue)} on credit` : ''}`}
                    />
                    <Stat
                      label="Spread"
                      value={formatCurrency(edge.spread || 0)}
                      tone={(edge.spread || 0) >= 0 ? 'accent' : 'danger'}
                      note={edge.buybackPulls ? `${formatNumber(edge.buybackPulls)} alley slabs sold back for ${formatCurrency(edge.buybackUsd)}` : 'No alley buybacks recorded'}
                    />
                  </KpiStrip>
                </Card>
                <ChartPanel
                  title="Money in and card value by day"
                  note="Green is what players paid. Amber is the posted value of the slabs revealed that day. The sticky range control slices this series."
                >
                  {edgeWin?.labels?.length ? (
                    <Bar
                      data={{
                        labels: edgeWin.labels,
                        datasets: [
                          { label: 'Paid in', data: edgeWin.cols[0] || [], backgroundColor: '#00a804', borderRadius: 2 },
                          { label: 'Card value', data: edgeWin.cols[1] || [], backgroundColor: '#f5b700', borderRadius: 2 },
                        ],
                      }}
                      options={stackedUsdOptions(edgeWin.labels, false)}
                    />
                  ) : (
                    <EmptyChart>No card values recorded yet</EmptyChart>
                  )}
                </ChartPanel>
              </>
            ) : null}

            {drops.length || machineNames.length ? (
              <div ref={dropsRef} id="cardwall-drops">
                <Card
                  eyebrow="Machine pulls"
                  sub="Newest slabs The Alley and The Claw revealed to players. Separate from slab rain on ROI — rain is what lands on memberships. Paid is the pull. Value is the posted insured or fair-market price."
                  corner={(
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <label className="sr-only" htmlFor="cardwall-drop-machine">Machine</label>
                      <select
                        id="cardwall-drop-machine"
                        value={activeMachine}
                        onChange={(e) => setDropMachine(e.target.value)}
                        data-share-omit
                        className="max-w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-ink [color-scheme:dark] hover:border-muted focus:border-muted focus:outline-none"
                      >
                        <option value="">All machines</option>
                        {machineNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <CopyControl
                        alwaysLabel
                        heading
                        idleLabel="Copy section"
                        title="Copy the machine pulls for X"
                        className="bg-panel"
                        onCopy={() => copySectionEl(dropsRef.current, 'cardwall-drops')}
                      />
                      <Tag tone="plain">{drops.length} shown</Tag>
                    </div>
                  )}
                >
                  {drops.length ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {drops.map((drop) => (
                        <button
                          key={drop.id}
                          type="button"
                          onClick={() => setSelectedDrop(drop)}
                          className="flex w-36 shrink-0 cursor-pointer flex-col rounded-xl border border-line bg-panel-2 p-2.5 text-left transition-colors hover:border-muted"
                        >
                          <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-panel">
                            {drop.image ? (
                              <img src={drop.image} alt={drop.name} data-drop-id={drop.id} className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="font-mono text-[10px] text-faint">No photo</span>
                            )}
                            {drop.grade ? <span className="absolute right-1.5 top-1.5 rounded bg-mark-green px-1.5 py-0.5 font-mono text-[9px] font-medium text-black">{drop.grade}</span> : null}
                          </div>
                          <p className="mt-2 min-h-8 text-[12px] text-ink line-clamp-2">{drop.name}</p>
                          <p className="mt-1 truncate font-mono text-[10px] text-faint">{drop.game === 'claw' ? 'The Claw' : drop.machine}</p>
                          <div className="mt-2 flex w-full items-start justify-between gap-2 font-mono text-[10px]">
                            <span className="text-muted">Paid {formatCurrency(drop.paid || 0)}</span>
                            <span className="text-right">
                              <span className="block text-ink">{formatCurrency(drop.value || 0)}</span>
                              <DropEdge paid={drop.paid} value={drop.value} formatCurrency={formatCurrency} />
                            </span>
                          </div>
                          {drop.buyback ? <p className="mt-1 font-mono text-[10px] text-mark-sky">Sold back {formatCurrency(drop.buyback)}</p> : null}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="font-mono text-[12px] text-faint">{activeMachine ? 'No recent slabs for this machine.' : 'No recent slabs yet.'}</p>
                  )}
                </Card>
              </div>
            ) : null}
          </>
        ) : null}

        <Card
          eyebrow="Slab vault"
          sub={(
            <>
              The slab vault, not AMM fees. Each card is a real grade 10 the protocol bought: <strong className="font-normal text-ink">total volume</strong> is landed cost of every slab ever recorded, <strong className="font-normal text-ink">on the wall</strong> is still in custody, and <strong className="font-normal text-ink">with members</strong> has already rained or sold. Rain drops (slabs + Alley credit) are on the ROI tab. The chart is VaultLedger landed cost by day: green delivered, amber still vaulted.
            </>
          )}
        >
          <KpiStrip>
            <Stat label="Total volume (landed cost)" value={formatCurrency(ledger?.volumeUsd || 0)} tone="accent" />
            <Stat label="On the wall" value={formatCurrency(ledger?.vaultedUsd || 0)} note={rainStats.vaultSlabs != null ? `${formatNumber(rainStats.vaultSlabs)} slabs queued for rain` : undefined} />
            <Stat label="With members" value={formatCurrency(ledger?.deliveredUsd || 0)} note={ledger?.deliveredCount != null ? `${formatNumber(ledger.deliveredCount)} slabs delivered` : undefined} />
          </KpiStrip>
        </Card>

        <ChartStack
          label="In slabs"
          views={[
            {
              id: 'slab-landed',
              jump: 'Landed cost',
              title: 'Slab landed cost by day',
              note: 'From the first vault record through today. Quiet days are $0 so the range control still reaches now.',
              body: (
                <Bar
                  data={{
                    labels: revDates,
                    datasets: [
                      { label: 'Delivered to members', data: revData1, backgroundColor: '#00a804', borderRadius: 2 },
                      { label: 'Still on the wall', data: revData2, backgroundColor: '#f5b700', borderRadius: 2 },
                    ],
                  }}
                  options={stackedUsdOptions(revDates, true)}
                />
              ),
            },
            {
              id: 'slab-holders',
              jump: 'With members',
              title: 'Delivered to members',
              note: 'Landed cost delivered to members that day. This is holder revenue for the wall.',
              body: (
                <Bar
                  data={{
                    labels: revDates,
                    datasets: [{ label: 'Delivered to members', data: revData1, backgroundColor: '#00a804', borderRadius: 2 }],
                  }}
                  options={{ ...stackedUsdOptions(revDates, false), plugins: { ...baseChartOptions(revDates, interval).plugins, legend: { display: false } } }}
                />
              ),
            },
          ]}
        />
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Liquidity" sub="The wall itself is the inventory: slabs still in custody versus already rained to members.">
          <KpiStrip>
            <Stat label="On the wall" value={formatCurrency(ledger?.vaultedUsd || 0)} />
            <Stat label="With members" value={formatCurrency(ledger?.deliveredUsd || 0)} />
          </KpiStrip>
        </Card>
      </ShareSection>

      {/* TAB 4: BURN TRACKER */}
      <ShareSection id="burn" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Burn" sub={`Token-wide $${config.ticker} destroyed.`}>
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
            body: slicedBurnData.length > 0 ? (
              <Line
                key={`burn-${timeframe}`}
                data={{ labels: slicedBurnLabels, datasets: [cumulativeBurnDataset(slicedBurnData, '#8b5cf6')] }}
                options={{
                  ...baseChartOptions(slicedBurnLabels, interval, { yUnit: 'Tokens', yTick: compactTick }),
                  plugins: { ...baseChartOptions(slicedBurnLabels, interval).plugins, legend: { display: false } },
                }}
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

      {/* TAB 5: ACTIVATION */}
      <ShareSection id="activation" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Activation">
          <KpiStrip>
            <Stat label="Activated supply" value={`${(activation.percentActivated || 0).toFixed(2)}%`} tone="accent" />
            <Stat label="Active units" value={formatNumber(activation.activeCount || 0)} />
          </KpiStrip>
        </Card>

        <TierFlowSection
          tiers={tiers}
          tierStats={activation.tierStats}
          timeframe={tierTimeframe}
          onTimeframe={setTierTimeframe}
          formatNumber={formatNumber}
          note="Act is an activation or an upgrade into this wall level. Deact is a void or a sale. Up is a move to a higher level, not an exit."
        />

        <Card eyebrow="Tier mix" sub="Who is staked, by wall level. Net of deactivations.">
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
              lineLabel="Net active units"
              outColor="#ff3333"
            />
          ) : (
            <EmptyChart>No activation history recorded</EmptyChart>
          )}
        </ChartPanel>
      </ShareSection>

      {/* TAB 6: OWNERSHIP */}
      <ShareSection id="ownership" className="scroll-mt-32 space-y-4">
        <Card eyebrow="Ownership">
          <KpiStrip>
            <Stat label="Max supply" value={formatNumber(ownership.currentMaxSupply || 0, 2)} />
            <Stat label="Burnt" value={formatNumber(realBurntUnits, 2)} />
            <Stat label="AMM vault" value={formatNumber(ownership.ammVaultNfts || 0)} />
            <Stat label="Circulating NFTs" value={formatNumber(ownership.circulatingNftSupply || 0)} tone="accent" />
          </KpiStrip>
          <KpiStrip className="mt-6">
            <Stat label="NFT holders" value={formatNumber(ownership.nftHolders || 0)} />
            <Stat label="Activated wallets" value={activation.activeHolders == null ? '—' : formatNumber(activation.activeHolders)} />
            <Stat label="Wallets per 100 NFTs" value={`${(ownership.ownershipRatio || 0).toFixed(2)}%`} tone="accent" />
            <Stat label={`$${config.ticker} holders`} value={formatNumber(wallHolders)} />
            <Stat
              label="Chain onboard"
              value={formatNumber(Number(data?.onboarding?.byProject?.cardwall?.wallets) || 0)}
              tone="accent"
              note={`First 10 txs · NFT ${formatNumber(data?.onboarding?.byProject?.cardwall?.nft || 0)}${(Number(data?.onboarding?.byProject?.cardwall?.token) || 0) ? ` · token ${formatNumber(data.onboarding.byProject.cardwall.token)}` : ''}`}
            />
          </KpiStrip>
        </Card>

        <OwnershipHistoryPanels
          snaps={roiSnaps}
          live={{ tokenHolders: wallHolders, nftHolders: ownership.nftHolders, ownershipRatio: ownership.ownershipRatio }}
          onboard={{ data, projectKey: 'cardwall', timeframe, interval, name: 'The Card Wall' }}
        />
        <UnderwaterCard ownership={ownership} />
      </ShareSection>

      {/* SLAB DETAIL MODAL */}
      {selectedDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onClick={() => setSelectedDrop(null)}>
          <div
            ref={dropModalRef}
            id="cardwall-drop"
            className="max-h-[94vh] w-full max-w-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Card>
              <div className="flex flex-col">
                <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow text-muted">{selectedDrop.game === 'claw' ? 'The Claw' : selectedDrop.machine}</p>
                    <h3 className="mt-1 text-[14px] leading-snug text-ink line-clamp-2">{selectedDrop.name}</h3>
                    {selectedDrop.at ? <p className="mt-0.5 font-mono text-[10px] text-faint">{selectedDrop.at.replace('T', ' ').slice(0, 16)} UTC</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2" data-share-omit>
                    <CopyControl
                      alwaysLabel
                      heading
                      idleLabel="Copy"
                      title="Copy this pull for X"
                      className="bg-panel"
                      onCopy={() => copySectionEl(dropModalRef.current, 'cardwall-drop')}
                    />
                    <button type="button" onClick={() => setSelectedDrop(null)} className="rounded-lg border border-line bg-panel p-1 text-muted hover:text-ink">✕</button>
                  </div>
                </div>
                <div className="flex h-[min(62vh,680px)] shrink-0 items-center justify-center rounded-xl border border-line bg-panel-2 p-2">
                  {selectedDrop.image ? (
                    <img src={selectedDrop.image} alt={selectedDrop.name} data-drop-id={selectedDrop.id} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="font-mono text-[12px] text-faint">No photo</span>
                  )}
                </div>
                <div className="shrink-0 space-y-2 pt-3">
                  <div className="flex items-end justify-between gap-4">
                    <Stat label="Paid" value={formatCurrency(selectedDrop.paid || 0)} />
                    <div className="text-right">
                      <Stat label={selectedDrop.game === 'claw' ? 'Fair market value' : 'Insured value'} value={formatCurrency(selectedDrop.value || 0)} />
                      <DropEdge paid={selectedDrop.paid} value={selectedDrop.value} formatCurrency={formatCurrency} className="font-mono text-xs" />
                    </div>
                  </div>
                  {[selectedDrop.grade, selectedDrop.rarity, selectedDrop.year, selectedDrop.number, selectedDrop.parallel].filter(Boolean).length ? (
                    <p className="text-[12px] leading-relaxed text-ink">
                      {[selectedDrop.grade, selectedDrop.rarity, selectedDrop.year, selectedDrop.number, selectedDrop.parallel].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {selectedDrop.set ? <p className="text-[12px] text-muted">{selectedDrop.set}{selectedDrop.edition ? ` · ${selectedDrop.edition}` : ''}</p> : null}
                  {selectedDrop.cert ? <p className="text-[12px] text-muted">Cert {selectedDrop.cert}</p> : null}
                  {selectedDrop.buyback ? (
                    <p className="text-[12px] text-muted">Sold back {formatCurrency(selectedDrop.buyback)}{selectedDrop.payoutWall ? ` · ${formatNumber(selectedDrop.payoutWall)} $WALL` : ''}</p>
                  ) : selectedDrop.delivered ? (
                    <p className="text-[12px] text-muted">Delivered to the player</p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]" data-share-omit>
                    {selectedDrop.tx ? <a href={`https://robin.etherscan.io/tx/${selectedDrop.tx}`} target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">Payment</a> : null}
                    {selectedDrop.payoutTx ? <a href={`https://robin.etherscan.io/tx/${selectedDrop.payoutTx}`} target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">Buyback</a> : null}
                    {selectedDrop.deliverTx ? <a href={`https://robin.etherscan.io/tx/${selectedDrop.deliverTx}`} target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">Delivery</a> : null}
                    {selectedDrop.cert && String(selectedDrop.grade || '').startsWith('PSA') ? <a href={`https://www.psacard.com/cert/${selectedDrop.cert}`} target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">PSA cert</a> : null}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {selectedRain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setSelectedRain(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Card>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Tag tone="plain">{selectedRain.kind === 'credit' ? 'Alley credit rain' : 'Slab rain'}</Tag>
                    <h3 className="mt-2 text-[16px] text-ink">{selectedRain.name}</h3>
                    {selectedRain.membershipId != null ? (
                      <p className="mt-1 font-mono text-[12px] text-muted">Membership #{selectedRain.membershipId}{selectedRain.dateLabel ? ` · ${selectedRain.dateLabel}` : ''}</p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setSelectedRain(null)} className="rounded-lg border border-line bg-panel p-1 text-muted hover:text-ink">✕</button>
                </div>
                <div className="flex h-64 items-center justify-center rounded-xl border border-line bg-panel-2 p-3">
                  {selectedRain.kind === 'credit' ? (
                    <div className="text-center">
                      <p className="font-mono text-[36px] text-ink">$50</p>
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-faint">Spends at The Alley</p>
                    </div>
                  ) : selectedRain.image ? (
                    <img src={selectedRain.image} alt={selectedRain.name} className="max-h-full object-contain" />
                  ) : (
                    <span className="font-mono text-[12px] text-faint">No photo</span>
                  )}
                </div>
                <KpiStrip>
                  <Stat label="Landed value" value={formatCurrency(selectedRain.landedCostUsd || 0)} tone="accent" />
                  <Stat label={selectedRain.cert ? 'Cert #' : 'Kind'} value={selectedRain.cert || (selectedRain.kind === 'credit' ? 'Credit' : 'Slab')} />
                </KpiStrip>
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]" data-share-omit>
                  <a href={selectedRain.href || 'https://thecardwall.com/rain'} target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">Open on The Card Wall</a>
                  {selectedRain.cert && String(selectedRain.grade || '').toUpperCase().includes('PSA') ? (
                    <a href={`https://www.psacard.com/cert/${selectedRain.cert}`} target="_blank" rel="noreferrer" className="text-mark-sky hover:underline">PSA cert</a>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      <MethodologyCard>
          <p><strong className="text-ink">Yield &amp; ROI:</strong> Each row is a wall level, Foundation through Fortress. Cost is the membership floor plus the $WALL to reach that level. Expected yield is two holder streams: RewardPaid staking over the last 30 days, annualized and split by that level&apos;s weight, plus slab-rain landed cost since the vault opened, split by the level&apos;s rain points. The Slab rain strip is the public thecardwall.com/rain feed (graded slabs and Alley credit to memberships), snapshotted hourly. Gacha pull receipts restock the vault and are not added on top of slabs already delivered. The early-build bonus and the extra rain points from star rarity are not in this table.</p>
          <p><strong className="text-ink">Payback:</strong> Entry cost ÷ annualized trailing yield, repriced at the last sync.</p>
          <p><strong className="text-ink">Revenue:</strong> Gacha pull revenue is the USD price charged on The Alley till (0x6686…5676) and The Claw pool (0xC004…6b33, the crane). Alley USD is the quote&apos;s reference cents. Claw USD is the USDG received, plus $WALL at that day&apos;s close and WETH at the ETH price. Credit pulls are excluded from money in. Card value out is the insured price on The Alley and the fair-market value on The Claw, joined from each pull result. Spread is money in minus that posted value. It is not the protocol&apos;s purchase cost. Alley buyback cash is shown separately: those slabs were sold back and stayed with the house. Machine pulls are player reveals, not holder rain. The slab chart under it is VaultLedger landed cost (delivered vs still on the wall), not AMM swap fees. Activations are a live SoftStakingVault scan by rarityOf, not a log replay of Anvil Activated events.</p>
          <p><strong className="text-ink">Ownership:</strong> Circulating NFTs are collection size minus AMM vault inventory. Wallets per 100 NFTs is unique NFT wallets (vault and burn addresses excluded) divided by that circulating number, times 100. Activated-wallet count is unique vault stakers, not the NFT contract (the wall holds the memberships). Chain onboard is unique EOAs whose first cluster buy or mint of this project was one of their first 10 txs.</p>
      </MethodologyCard>

    </div>
  );
}
