import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { burnSeries, burnRateSeries, burnOfSupplyPct } from '../../lib/burn';
import { holderSeries } from '../../lib/snapshots';
import { formatLabels } from '../../lib/dates';
import { windowSnapshots, protocolRevenueChart, sliceCols, windowPeriodLabel, windowChart } from '../../lib/yieldHistory';
import { PROJECTS } from '../../lib/routes';
import { BetaTag, Card, KpiStrip, SkeletonCard, Stat, Tag, compactUsd, compactNum, YieldPeriodToggle, scaleAnnualYield, yieldSuffix } from '../kit';
import { yieldBasisText } from '../../lib/yieldSample';
import { ShareSection } from '../CopyControl';
import {
  OAKMONT_ACTIONS, OAKMONT_BASKET, OAKMONT_DOCS, OAKMONT_DAPP, OAKMONT_SITE, OAKMONT_FEES,
  fetchGeckoTokenHolders,
} from '../../lib/oakmont';
import { baseChartOptions, compactTick, compactUsdTick, cumulativeBurnDataset, percentTick, STREAM_COLORS } from '../../lib/charts';
import { useChartView } from '../../lib/chartWindow';
import { YieldHistorySwitch, ChartStack, ChartPanel, BurnHistorySwitch, EmptyChart } from '../HistoryCharts';
import { MethodologyCard } from '../Disclaimer';
import { tokenValuation } from '../../lib/valuation';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const MARK = { green: '#00a804', violet: '#8b5cf6', sky: '#38bdf8', amber: '#f5b700', pink: '#f472b6', lime: '#e879f9' };

export default function SpecialDetailView({ data, projectKey, activeTab }) {
  const { range: timeframe, interval } = useChartView();
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const meta = PROJECTS.find((p) => p.key === projectKey);
  const project = data?.projects?.[projectKey];
  if (!project) {
    return (
      <div className="space-y-4 pt-4">
        <SkeletonCard rows={4} />
        <p className="text-center font-mono text-[11px] text-faint">{meta?.name || projectKey} data loading…</p>
      </div>
    );
  }

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, cashflow = {}, lockedLp = null, dailySnapshots = [], vault = null } = project;
  const kind = config.kind || meta?.kind;
  const ticker = config.ticker || meta?.ticker;
  const fmt = compactUsd;
  const num = compactNum;

  const floorUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
  const tokenUsd = market.tokenPriceUsd || 0;
  const circulating = ownership.circulatingSupply || 0;
  const seat0 = Number(tiers[0]?.trackedAnnualYieldUsd) || 0;
  const req0 = Number(tiers[0]?.reqTokens) || 0;
  const publishedPool = cashflow.holdersAnnualized || cashflow.revenueAnnualized || 0;
  let annual = publishedPool;
  if (project.yieldSample?.applied && kind === 'cashflow' && req0 > 0 && circulating > 0 && seat0 > 0) {
    annual = seat0 * (circulating / req0);
  } else if (project.yieldSample?.applied && kind === 'brokers' && seat0 > 0) {
    const earning = Number(activation.activeCount) || 0;
    if (earning > 0) annual = seat0 * earning;
  }
  const perToken = circulating > 0 ? annual / circulating : 0;
  const cap = Number(config.maxSupply) > 0 ? Number(config.maxSupply) : (Number(meta?.maxSupply) > 0 ? Number(meta.maxSupply) : 0);
  const { marketCapUsd: marketCap, fdvUsd: fdv } = tokenValuation(circulating, tokenUsd, cap);
  const tokenRoi = tokenUsd > 0 ? (perToken / tokenUsd) * 100 : 0;
  const brokerCost = kind === 'brokers' ? (tiers[0]?.entryUsd || 0) : 0;
  const brokerYield = kind === 'brokers' ? (tiers[0]?.trackedAnnualYieldUsd || 0) : 0;
  const roi = kind === 'brokers' && brokerCost > 0 ? (brokerYield / brokerCost) * 100 : tokenRoi;
  const payback = kind === 'brokers'
    ? (brokerYield > 0 ? brokerCost / brokerYield : null)
    : (perToken > 0 ? tokenUsd / perToken : null);

  const snaps = windowSnapshots(dailySnapshots, timeframe, interval);
  const histLabels = formatLabels(snaps.length ? snaps.map((s) => s.date) : (cashflow.dailyDates || []));
  const histRoi = snaps.length
    ? snaps.map((s) => s.roi || s.tiers?.[0]?.roi || 0)
    : [];

  const chartOpts = baseChartOptions();
  const burn = burnSeries(project, timeframe, interval);
  const flywheel = burnRateSeries(project, timeframe, interval);
  const holdersFull = holderSeries(ownership, dailySnapshots);
  const holdersWin = windowChart(holdersFull.labels, [holdersFull.data], timeframe, interval, ['last']);
  const holders = { labels: holdersWin.labels, data: holdersWin.cols[0] || [] };

  const burnTokens = activation.dualBurn?.totalBurnTokens || ownership.permanentlyBurntTokens || 0;
  const burnPct = burnOfSupplyPct(project, burnTokens);
  const wrapPct = market.wrappedPct ?? (circulating > 0 ? (market.reserveSupply || 0) / circulating : 0);
  const poolVol = market.poolVolume24h || (lockedLp?.pools || []).reduce((s, p) => s + (p.volume24h || 0), 0);

  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart(project);
  const { labels: revDates, cols: revCols } = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);

  if (kind === 'vault') {
    return (
      <VaultView
        meta={meta}
        market={market}
        ownership={ownership}
        activation={activation}
        lockedLp={lockedLp}
        snaps={snaps}
        histLabels={formatLabels(snaps.map((s) => s.date))}
        chartOpts={chartOpts}
        activeTab={activeTab}
        fmt={fmt}
        num={num}
        tokenUsd={tokenUsd}
        marketCap={marketCap}
        fdv={fdv}
        circulating={circulating}
        burnTokens={burnTokens}
        burnPct={burnPct}
        wrapPct={wrapPct}
        poolVol={poolVol}
        cashflow={cashflow}
        tiers={tiers}
        vault={vault}
        config={config}
      />
    );
  }

  return (
    <div className="space-y-6 relative">
      <ShareSection id="roi" className="scroll-mt-32">
        <div className="space-y-4">
          <Card
            eyebrow={`${meta?.name || ''} cash-on-cash`}
            corner={meta?.beta ? <BetaTag /> : null}
            sub={
              (kind === 'cashflow' && `Holders revenue against circulating $INDEX, for wallets with at least 10,000 INDEX. ${yieldBasisText(project)}`)
              || (kind === 'machines' && 'Only awake (inked) Machines earn. Base ink is 4,250 $PRINTER to wake at 1× weight; more ink or a Proton fuse raises weight. The pot (fees → daily USDG+WETH during the test, else weekly stock) is split by weight across the awake fleet. See rhmachines.com/dashboard.')
              || (kind === 'brokers' && `One active Broker earns one equal share of Booster stock buys. Cost is NFT floor plus 36,750 $COAT burned on activate(). Transfer turns the Broker off; the buyer must burn again. ${yieldBasisText(project)} Unclaimed salary stays in the Booster by token id.`)
              || undefined
            }
          >
            <KpiStrip>
              <Stat label={`$${ticker} price`} value={fmt(tokenUsd)} />
              <Stat label="Annual cash-flow" value={fmt(annual)} tone="accent" />
              <Stat label="CoC ROI" value={`${roi.toFixed(2)}%`} tone="accent" />
              <Stat label="Payback" value={payback == null ? '—' : `${payback.toFixed(1)}y`} />
            </KpiStrip>
          </Card>

          <Card flush eyebrow="Units">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Unit</th>
                    <th className="px-3 py-3 font-normal">Floor</th>
                    <th className="px-3 py-3 font-normal">Act. cost</th>
                    <th className="px-3 py-3 font-normal">
                      <div className="flex items-center gap-2">
                        <span>Expected yield</span>
                        <YieldPeriodToggle value={yieldPeriod} onChange={setYieldPeriod} />
                      </div>
                    </th>
                    <th className="px-5 py-3 text-right font-normal">Est. ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => {
                    const floorPart = kind === 'machines' || kind === 'brokers' ? floorUsd : 0;
                    const actPart = kind === 'machines'
                      ? (t.reqTokens || 0) * tokenUsd * 1.15
                      : (t.reqTokens || 0) * tokenUsd;
                    const cost = t.entryUsd || floorPart + actPart;
                    const y = t.trackedAnnualYieldUsd || 0;
                    const r = cost > 0 ? (y / cost) * 100 : 0;
                    return (
                      <tr key={t.tier} className="border-b border-line-soft">
                        <td className="px-5 py-3">
                          <div className="text-[13px] text-ink">{t.name}</div>
                          <div className="font-mono text-[11px] text-faint">{num(t.reqTokens)} ${ticker}</div>
                        </td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{floorPart > 0 ? fmt(floorPart) : '—'}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{actPart > 0 ? fmt(actPart) : (cost > 0 && !(floorPart > 0) ? fmt(cost) : '—')}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{y > 0 ? `${fmt(scaleAnnualYield(y, yieldPeriod))} ${yieldSuffix(yieldPeriod)}` : '—'}</td>
                        <td className="px-5 py-3 text-right">
                          {y > 0 ? <Tag tone="good">{`${r.toFixed(2)}%`}</Tag> : <span className="num text-[13px] text-faint">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </ShareSection>

      <ShareSection id="yield" className="scroll-mt-32">
        <Card eyebrow="Historical yield & payback">
          <YieldHistorySwitch
            labels={histLabels}
            datasets={histRoi.length
              ? [{ label: 'CoC ROI %', data: histRoi, borderColor: MARK.green, tension: 0.3, borderWidth: 2 }]
              : [{ label: 'Holders revenue (USD)', data: cashflow.dailyRevenue, borderColor: MARK.green, tension: 0.3, borderWidth: 2 }]}
            options={histRoi.length
              ? baseChartOptions(histLabels, interval, { yUnit: 'CoC %', yTick: percentTick })
              : baseChartOptions(histLabels, interval, { yUnit: 'USD', yTick: compactUsdTick })}
            snaps={snaps}
            tiers={tiers}
            showUsd={snaps.length > 0}
            cocLabel={histRoi.length ? 'CoC %' : 'Holders'}
            cocTitle={histRoi.length ? 'ROI trajectory' : 'Holders revenue'}
            cocNote={histRoi.length
              ? 'Cash-on-cash over the selected window.'
              : 'Revenue that reached holders. Protocol-kept fees are on the Revenue tab.'}
            empty="Snapshots start after the first hourly run."
          />
        </Card>
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32">
        <div className="space-y-4">
          <Card eyebrow="Protocol revenue">
            <KpiStrip>
              <Stat label={`Protocol Rev (${revPeriod})`} value={fmt(revCols[0]?.total || 0)} tone="accent" />
              <Stat label={`Holders / revenue (${revPeriod})`} value={fmt(revCols[1]?.total || 0)} />
              <Stat label="Annualized" value={fmt(annual)} />
            </KpiStrip>
          </Card>
          <ChartStack
            label="In revenue"
            views={[
              {
                id: 'special-rev-kept',
                jump: 'Protocol kept',
                title: 'Protocol kept',
                note: 'Protocol-kept fees beside what reached holders.',
                body: revDates.length ? (
                  <Bar
                    data={{
                      labels: revDates,
                      datasets: (revCols || []).map((c) => ({
                        label: c.label,
                        data: c.data,
                        backgroundColor: c.color,
                      })),
                    }}
                    options={{ ...chartOpts, scales: { ...chartOpts.scales, x: { ...chartOpts.scales.x, stacked: false }, y: { ...chartOpts.scales.y, stacked: false, unit: 'USD', ticks: { ...chartOpts.scales.y.ticks, callback: compactUsdTick } } } }}
                  />
                ) : (
                  <EmptyChart>
                    {kind === 'machines' ? `24h stock-pot estimate ${fmt(cashflow.revenue24h)}. Daily series starts after Llama or on-chain drops are wired.` : kind === 'brokers' ? 'Purchase series from coattail.cash/api/stats (CDN, up to 1h).' : 'No daily series yet.'}
                  </EmptyChart>
                ),
              },
              {
                id: 'special-rev-seats',
                jump: 'Paid to seats',
                title: 'Paid to seats',
                note: 'Revenue that reached token / NFT holders.',
                body: (
                  <Bar
                    data={{
                      labels: revDates,
                      datasets: [{
                        label: 'Holder revenue',
                        data: revCols[1]?.data || [],
                        backgroundColor: STREAM_COLORS.holdersRev,
                        borderRadius: 3,
                      }],
                    }}
                    options={{ ...chartOpts, scales: { ...chartOpts.scales, x: { ...chartOpts.scales.x, stacked: false }, y: { ...chartOpts.scales.y, stacked: false, unit: 'USD', ticks: { ...chartOpts.scales.y.ticks, callback: compactUsdTick } } } }}
                  />
                ),
              },
            ]}
          />
        </div>
      </ShareSection>

      <ShareSection id="liquidity" className="scroll-mt-32">
        {lockedLp?.pools?.length > 0 ? (
          <Card flush eyebrow={`Liquidity pools · ${fmt(lockedLp.totalLpUsd)}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Pair</th>
                    <th className="px-3 py-3 font-normal">DEX</th>
                    <th className="px-5 py-3 text-right font-normal">Liquidity</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedLp.pools.map((p, i) => (
                    <tr key={i} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">{p.pairName}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-muted">{p.dex}</td>
                      <td className="num px-5 py-3 text-right text-[13px] text-ink">{fmt(p.liquidityUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card eyebrow="Liquidity pools">
            <p className="text-[13px] text-muted">No tracked pools for this project yet.</p>
          </Card>
        )}
      </ShareSection>

      <ShareSection id="burn" className="scroll-mt-32">
        <div className="space-y-4">
          <Card eyebrow="Supply deflation">
            <KpiStrip>
              <Stat
                label="Tokens burnt / missing"
                value={<span className="text-mark-violet">{num(burnTokens)} {ticker}</span>}
                note={burnPct != null ? `${burnPct.toFixed(2)}% of supply` : null}
                ch={10}
              />
              <Stat label="Circulating" value={`${num(circulating)} ${ticker}`} ch={10} />
            </KpiStrip>
          </Card>

          <BurnHistorySwitch
            cumulative={{
              title: 'Cumulative token burn',
              note: 'From the first recorded day through today. Quiet days keep the last cumulative burn.',
              body: burn.data.length > 0 ? (
                <Line
                  data={{
                    labels: burn.labels,
                    datasets: [cumulativeBurnDataset(burn.data, MARK.violet)],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#8b929b' } },
                      y: { unit: 'Tokens', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#8b929b', callback: compactTick } },
                    },
                  }}
                />
              ) : (
                <EmptyChart>No burn history recorded yet</EmptyChart>
              ),
            }}
            flywheel={{
              title: 'Deflationary flywheel',
              labels: flywheel.labels,
              burn: flywheel.burn,
              prices: flywheel.prices,
              priceColor: '#00a804',
              burnColor: MARK.violet,
              leftMax: flywheel.burnAxisMax,
            }}
          />
        </div>
      </ShareSection>

      <ShareSection id="activation" className="scroll-mt-32">
        <Card
          eyebrow={kind === 'cashflow' ? 'Eligible wallets' : kind === 'brokers' ? 'Active Brokers' : 'Inked machines'}
          sub={
            (kind === 'machines' && `Awake count uses the live fleet figure from the RH Machines dashboard (${num(activation.activeCount || 7458)} earning) until the Mine/ink controller is indexed. Payouts are weight-weighted, not 1-per-NFT.`)
            || (kind === 'brokers' && `${num(activation.percentActivated || 0)}% of 1,776 Brokers are ON. A transfer deactivates that token; unclaimed Booster claims and TBA holdings follow the NFT. Equal share per active Broker — no tiers.`)
            || undefined
          }
        >
          <KpiStrip>
            <Stat
              label={kind === 'cashflow' ? `Wallets ≥ ${num(activation.eligibleMin || 10000)} INDEX` : kind === 'brokers' ? 'Active & earning' : 'Awake machines'}
              value={num(activation.activeCount ?? activation.eligibleWallets)}
              tone="accent"
            />
            <Stat
              label={kind === 'cashflow' ? 'Token holders' : kind === 'brokers' ? 'Collection' : 'Collection / holders'}
              value={num(activation.totalSupply ?? ownership.tokenHolders)}
            />
          </KpiStrip>
        </Card>
      </ShareSection>

      <ShareSection id="ownership" className="scroll-mt-32">
        <div className="space-y-4">
          <Card eyebrow="Ownership">
            <KpiStrip>
              <Stat label={`$${ticker} holders`} value={num(ownership.tokenHolders)} />
              {kind === 'machines' && <Stat label="Machine holders" value={num(ownership.nftHolders)} />}
              {kind === 'brokers' && <Stat label="Broker holders" value={num(ownership.nftHolders)} />}
              <Stat label="Market cap" value={fmt(marketCap)} />
              <Stat label="FDV" value={fmt(fdv)} />
            </KpiStrip>
          </Card>

          <ChartPanel
            title={`$${ticker} holders over time`}
            empty={holders.data.length > 0 ? null : 'Holder history starts after the next hourly run.'}
          >
            <Line
              data={{
                labels: holders.labels,
                datasets: [{
                  label: `$${ticker} holders`,
                  data: holders.data,
                  borderColor: MARK.violet,
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  borderWidth: 3,
                  fill: true,
                  tension: 0.3,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#8b929b' } },
                  y: { unit: 'Wallets', grid: { color: '#1e2228', borderDash: [4, 4] }, ticks: { color: '#8b929b', callback: compactTick } },
                },
              }}
            />
          </ChartPanel>
        </div>
      </ShareSection>

      <MethodologyCard>
        <p>
          {kind === 'cashflow' && 'Fees and holders revenue are DefiLlama The Index (original INDEX swap tax settled into tokenized stocks). CoC is annualized holders revenue ÷ circulating supply ÷ token price. That is cash-flow against INDEX cost basis, not a points program.'}
          {kind === 'machines' && 'PRINTER burn is max supply minus live totalSupply plus dead/zero balances. Yield is the fee pot split across awake Machines by on-chain weight (ink + Proton fuses). Floor uses 4,250 ink × 1.10. Dormant (un-inked) Machines do not earn.'}
          {kind === 'brokers' && 'Stock buys are from coattail.cash/api/stats (Booster purchases, CDN-cached up to 1h). Annual yield is all-time USD spent on the Congress basket annualized by days live, split equally across active Brokers. Cost is OpenSea floor plus 36,750 $COAT. Activate burns and v4 buy-side burns both shrink $COAT; they are not the same number. Rewards are trading-volume funded and never guaranteed.'}
        </p>
        {config.site && (
          <p>
            Source:{' '}
            <a className="text-ink underline hover:text-accent" href={config.site} target="_blank" rel="noreferrer">{config.site}</a>
          </p>
        )}
      </MethodologyCard>
    </div>
  );
}

/** One labelled figure in a KpiStrip. `tone="accent"` is for the headline positive. */
function Panel({ label, value, tone = 'ink' }) {
  return <Stat label={label} value={value} tone={tone} ch={8} />;
}

function VaultView({
  meta, market, ownership, activation, lockedLp, snaps, histLabels, chartOpts,
  activeTab, fmt, num, tokenUsd, marketCap, fdv, circulating, burnTokens, burnPct, wrapPct, poolVol,
  cashflow, tiers, vault, config,
}) {
  const { range: timeframe, interval } = useChartView();
  const [yieldPeriod, setYieldPeriod] = useState('Y');
  const revPeriod = windowPeriodLabel(timeframe);
  const rawRev = protocolRevenueChart({ cashflow });
  const { labels: revDates, cols: revCols } = sliceCols(rawRev.labels, rawRev.cols, timeframe, interval);
  const wrapHist = snaps.map((s) => s.wrapRatio || 0);
  const covHist = snaps.map((s) => (s.navCoverage || 0) * 100);
  const strikeHist = snaps.map((s) => s.tokenPriceUsd || 0);
  const reserveHist = snaps.map((s) => s.reservePriceUsd || 0);
  const hasWrapSeries = wrapHist.some((v) => v > 0);
  const strikeLockedEst = market.reserveSupply || 0;
  const lastNavSnap = [...snaps].reverse().find((s) => Number(s.vaultNavUsdg) > 0);
  const lastApySnap = [...snaps].reverse().find((s) => Number(s.claimApyPct) > 0);
  const liveNav = Number(market.vaultNavUsdg) > 0 ? market.vaultNavUsdg : (lastNavSnap?.vaultNavUsdg || 0);
  const claimApy = market.claimApyPct != null && Number(market.claimApyPct) > 0
    ? market.claimApyPct
    : (lastApySnap?.claimApyPct ?? null);
  const feeAnnual = cashflow?.feesAnnualized || 0;
  const rateHist = (vault?.history || []).filter((r) => r.exchangeRate > 0);
  const navHist = (vault?.history || []).filter((r) => r.nav > 0);
  const [liveHolders, setLiveHolders] = useState({ strike: null, reserve: null });

  useEffect(() => {
    let gone = false;
    (async () => {
      const [strike, reserve] = await Promise.all([
        fetchGeckoTokenHolders(config?.tokenCa),
        fetchGeckoTokenHolders(config?.reserveCa),
      ]);
      if (!gone) setLiveHolders({ strike, reserve });
    })();
    return () => { gone = true; };
  }, [config?.tokenCa, config?.reserveCa]);

  const strikeHolders = liveHolders.strike || market.strikeHolders || ownership.tokenHolders || 0;
  const reserveHolders = liveHolders.reserve || market.reserveHolders || 0;

  return (
    <div className="space-y-6 relative">
      <ShareSection id="roi" title="Protocol" className="scroll-mt-32">
        <div className="space-y-4">
          <Card
            eyebrow={meta?.name}
            corner={meta?.beta ? <BetaTag /> : null}
            sub={(
              <>
                Two tokens by design: <strong className="text-ink">$STRIKE</strong> is the fixed-supply float.
                {' '}<strong className="text-ink">$RESERVE</strong> is the vault receipt. Fees buy the basket (NAV) and burn a slice of $RESERVE (claim quality).
                Those are separate: do not add claim APY to fee CoC.
              </>
            )}
          >
            <KpiStrip>
              <Panel label="Reserve holder APY" value={claimApy == null ? '—' : `${claimApy.toFixed(2)}%`} tone="accent" />
              <Panel label={market.vaultNavKind === 'wrapped-strike' ? 'Wrapped $STRIKE (on-chain)' : 'Vault NAV (USDG)'} value={fmt(liveNav)} />
              <Panel label="STRIKE per $RESERVE" value={market.protocolExchangeRate > 0 ? market.protocolExchangeRate.toFixed(4) : '—'} />
              <Panel label="ETH fees → vault /yr" value={fmt(feeAnnual)} />
            </KpiStrip>
            <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
              Claim APY matches Oakmont: annualized growth of the protocol STRIKE:RESERVE rate above 1.0.
              {market.vaultSource === 'onchain-erc4626'
                ? ' The dapp indexer is down, so the rate is read on-chain from $RESERVE.convertToAssets and NAV is escrowed $STRIKE × DexScreener spot — not the basket appraisal.'
                : ' Fee CoC is annualized ETH fee revenue (2% wrap/unwrap leg, plus other ETH fees) ÷ spot cost. Indexer NAV is USDG; USDG is treated as $1.'}
            </p>
          </Card>

          <Card flush eyebrow="Holders">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Holder</th>
                    <th className="px-3 py-3 font-normal">Spot</th>
                    <th className="px-3 py-3 font-normal">
                      <div className="flex items-center gap-2">
                        <span>Fee accretion / token</span>
                        <YieldPeriodToggle value={yieldPeriod} onChange={setYieldPeriod} />
                      </div>
                    </th>
                    <th className="px-3 py-3 text-right font-normal">Fee CoC</th>
                    <th className="px-5 py-3 text-right font-normal">Claim APY</th>
                  </tr>
                </thead>
                <tbody>
                  {(tiers || []).map((t) => {
                    const cost = t.entryUsd || 0;
                    const y = t.trackedAnnualYieldUsd || 0;
                    const r = cost > 0 ? (y / cost) * 100 : 0;
                    return (
                      <tr key={t.tier} className="border-b border-line-soft">
                        <td className="px-5 py-3 text-[13px] text-ink">{t.name}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{fmt(cost)}</td>
                        <td className="num px-3 py-3 text-[13px] text-ink">{y > 0 ? `${fmt(scaleAnnualYield(y, yieldPeriod))} ${yieldSuffix(yieldPeriod)}` : '—'}</td>
                        <td className="px-3 py-3 text-right">
                          {y > 0 ? <Tag tone="good">{`${r.toFixed(2)}%`}</Tag> : <span className="num text-[13px] text-faint">—</span>}
                        </td>
                        <td className="num px-5 py-3 text-right text-[13px] text-muted">
                          {t.claimApyPct != null ? `${Number(t.claimApyPct).toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card flush eyebrow="Actions">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Action</th>
                    <th className="px-3 py-3 font-normal">Fee / LTV</th>
                    <th className="px-5 py-3 font-normal">What you get</th>
                  </tr>
                </thead>
                <tbody>
                  {OAKMONT_ACTIONS.map((row) => (
                    <tr key={row.name} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">{row.name}</td>
                      <td className="num whitespace-nowrap px-3 py-3 text-[13px] text-ink">{row.cost}</td>
                      <td className="px-5 py-3 text-[12px] leading-relaxed text-muted">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            eyebrow="Vault basket (new revenue split)"
            sub="All protocol fees buy this basket (dapp target weights). Weights are for new deposits only — the index does not rebalance, so winners keep weight."
          >
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {OAKMONT_BASKET.map((b) => (
                <div key={b.asset} className="rounded-lg border border-line bg-panel-2 p-3">
                  <p className="eyebrow text-[10px] text-faint">{b.asset}</p>
                  <p className="num mt-1 text-[15px] text-ink">{b.share}%</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </ShareSection>

      <ShareSection id="yield" title="Markets" className="scroll-mt-32">
        <div className="space-y-4">
          <Card
            eyebrow="Markets"
            sub="$STRIKE and $RESERVE should stay linked by wrap/unwrap (2.5% each way) and by the ~7.5% wrap-and-redeem floor versus Reserve Price. Spreads persist when volume is thin."
          >
            <KpiStrip>
              <Panel label="$STRIKE" value={fmt(tokenUsd)} />
              <Panel label="$RESERVE" value={fmt(market.reservePriceUsd)} />
              <Panel label="STRIKE per $RESERVE" value={market.protocolExchangeRate > 0 ? market.protocolExchangeRate.toFixed(4) : '—'} />
              <Panel label="Claim APY" value={claimApy == null ? '—' : `${claimApy.toFixed(2)}%`} tone="accent" />
            </KpiStrip>
          </Card>
          {rateHist.length > 1 && (
            <ChartPanel title="STRIKE per $RESERVE (claim rate)">
            <Line
              data={{
                labels: rateHist.map((r) => r.date || r.ts),
                datasets: [
                  { label: 'STRIKE / RESERVE', data: rateHist.map((r) => r.exchangeRate), borderColor: MARK.lime, tension: 0.2, borderWidth: 2 },
                  ...(navHist.length > 1 ? [{ label: 'Vault NAV (USDG)', data: (vault?.history || []).map((r) => r.nav), borderColor: MARK.sky, tension: 0.2, borderWidth: 2, yAxisID: 'y1' }] : []),
                ],
              }}
              options={{
                ...chartOpts,
                scales: {
                  ...chartOpts.scales,
                  y: { ...chartOpts.scales.y, position: 'left', unit: 'STRIKE / RESERVE' },
                  y1: { ticks: { color: '#8b929b', callback: compactUsdTick }, grid: { drawOnChartArea: false }, position: 'right', unit: 'USDG' },
                },
              }}
            />
            </ChartPanel>
          )}
          <ChartPanel
            title="Wrap ratio & liquid-claim coverage"
            empty={(histLabels.length && hasWrapSeries) || (histLabels.length && strikeHist.some((v) => v > 0)) ? null : 'Hourly snapshots will fill wrap ratio and coverage.'}
          >
          {histLabels.length && hasWrapSeries ? (
            <Line
              data={{
                labels: histLabels,
                datasets: [
                  { label: 'Wrap ratio', data: wrapHist, borderColor: MARK.green, tension: 0.3, borderWidth: 2, yAxisID: 'y' },
                  { label: 'RESERVE mcap / STRIKE FDV %', data: covHist, borderColor: MARK.sky, tension: 0.3, borderWidth: 2, yAxisID: 'y1' },
                ],
              }}
              options={{
                ...chartOpts,
                scales: {
                  ...chartOpts.scales,
                  y: { ...chartOpts.scales.y, position: 'left', unit: 'Wrap ratio' },
                  y1: { ticks: { color: '#8b929b', callback: percentTick }, grid: { drawOnChartArea: false }, position: 'right', unit: '%' },
                },
              }}
            />
          ) : histLabels.length && strikeHist.some((v) => v > 0) ? (
            <Line
              data={{
                labels: histLabels,
                datasets: [
                  { label: '$STRIKE', data: strikeHist, borderColor: MARK.green, tension: 0.3, borderWidth: 2 },
                  ...(reserveHist.some((v) => v > 0) ? [{ label: '$RESERVE', data: reserveHist, borderColor: MARK.lime, tension: 0.3, borderWidth: 2 }] : []),
                ],
              }}
              options={baseChartOptions(histLabels, interval, { yUnit: 'USD', yTick: compactUsdTick })}
            />
          ) : null}
          </ChartPanel>
        </div>
      </ShareSection>

      <ShareSection id="revenue" className="scroll-mt-32">
        <div className="space-y-4">
          <Card
            eyebrow="Fees & liquidity"
            sub="Vault growth is wrap, unwrap, origination, interest, liquidations, redemptions, and arb. ETH fee revenue is what the indexer reports as going into the vault. Pool volume is the arb surface, not wrap notional."
          >
            <KpiStrip>
              <Panel label={`ETH fees (${revPeriod})`} value={fmt(revCols[0]?.total || 0)} tone="accent" />
              <Panel label="Tracked LP" value={fmt(lockedLp?.totalLpUsd)} />
              <Panel label="24h wraps / unwraps" value={`${num(market.wraps24h)} / ${num(market.unwraps24h)}`} />
            </KpiStrip>
          </Card>
          <ChartStack
            label="In fees"
            views={[
              {
                id: 'oak-rev-kept',
                jump: 'Vault fees',
                title: 'ETH protocol rev into the vault',
                note: 'Oakmont’s indexer publishes monthly totals, not daily. Aug and Sep are the full series they expose.',
                body: revDates.length ? (
                  <Bar
                    data={{
                      labels: revDates,
                      datasets: (revCols || []).slice(0, 1).map((c) => ({
                        label: c.label,
                        data: c.data,
                        backgroundColor: c.color,
                      })),
                    }}
                    options={{ ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, unit: 'USD', ticks: { ...chartOpts.scales.y.ticks, callback: compactUsdTick } } } }}
                  />
                ) : (
                  <EmptyChart>No monthly fee series yet</EmptyChart>
                ),
              },
              {
                id: 'oak-rev-seats',
                jump: 'Paid to seats',
                title: 'Paid to seats',
                note: 'Holder / wrap-side cash-flow from the same Oakmont series. Monthly buckets, not daily.',
                body: (
                  <Bar
                    data={{
                      labels: revDates,
                      datasets: [{
                        label: 'Holder revenue',
                        data: revCols[1]?.data || [],
                        backgroundColor: STREAM_COLORS.holdersRev,
                        borderRadius: 3,
                      }],
                    }}
                    options={{ ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, unit: 'USD', ticks: { ...chartOpts.scales.y.ticks, callback: compactUsdTick } } } }}
                  />
                ),
              },
            ]}
          />
          <Card flush eyebrow="Fee schedule">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Fee</th>
                    <th className="px-3 py-3 font-normal">Rate</th>
                    <th className="px-5 py-3 font-normal">Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {OAKMONT_FEES.map((row) => (
                    <tr key={row.fee} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">{row.fee}</td>
                      <td className="num whitespace-nowrap px-3 py-3 text-[13px] text-ink">{row.rate}</td>
                      <td className="px-5 py-3 text-[12px] text-muted">{row.dest}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </ShareSection>

      <ShareSection id="liquidity" title="LP" className="scroll-mt-32">
        {lockedLp?.pools?.length > 0 ? (
          <Card flush eyebrow={`Pools · ${fmt(lockedLp.totalLpUsd)}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Pair</th>
                    <th className="px-3 py-3 font-normal">DEX</th>
                    <th className="px-3 py-3 text-right font-normal">Liquidity</th>
                    <th className="px-5 py-3 text-right font-normal">24h vol</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedLp.pools.map((p, i) => (
                    <tr key={i} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">{p.pairName}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-muted">{p.dex}</td>
                      <td className="num px-3 py-3 text-right text-[13px] text-ink">{fmt(p.liquidityUsd)}</td>
                      <td className="num px-5 py-3 text-right text-[13px] text-ink">{fmt(p.volume24h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card eyebrow="Pools">
            <p className="text-[13px] text-muted">No tracked pools for this vault yet.</p>
          </Card>
        )}
      </ShareSection>

      <ShareSection id="burn" title="Supply" className="scroll-mt-32">
        <Card
          eyebrow="Supply"
          sub="$STRIKE has a fixed supply and no mint after deploy. Wrapping does not burn it — tokens sit in the wrapper as backing. $RESERVE supply is flexible. Burns on wrap, unwrap, and the full 5% redemption fee raise each remaining $RESERVE’s claim on trapped $STRIKE, so the exchange rate is structurally biased up."
        >
          <KpiStrip>
            <Panel label="$STRIKE circulating (fixed cap 100M)" value={num(circulating, 0)} />
            <Stat
              label="$STRIKE independently burned / missing"
              value={<span className="text-mark-violet">{`${num(burnTokens)} STRIKE`}</span>}
              note={burnPct != null ? `${burnPct.toFixed(2)}% of supply` : null}
              ch={10}
            />
            <Panel label="$RESERVE outstanding" value={num(market.reserveSupply, 0)} />
            <Panel label="$RESERVE mcap" value={fmt(market.reserveMcapUsd ?? market.reserveFdvUsd)} />
          </KpiStrip>
        </Card>
      </ShareSection>

      <ShareSection id="activation" title="Wrap" className="scroll-mt-32">
        <Card
          eyebrow="Wrap"
          sub="Outstanding $RESERVE is the live wrap proxy. Locked $STRIKE is at least this high (1:1 escrow minus $RESERVE-only burns). $RESERVE in a loan is staked and cannot be sold until repaid or liquidated."
        >
          <KpiStrip>
            <Panel label="$RESERVE outstanding" value={num(activation.activeCount || strikeLockedEst, 0)} tone="accent" />
            <Panel label="$STRIKE circulating" value={num(activation.totalSupply || circulating, 0)} />
            <Panel label="Wrap proxy" value={`${(wrapPct * 100).toFixed(1)}%`} />
          </KpiStrip>
        </Card>
      </ShareSection>

      <ShareSection id="ownership" title="Holders" className="scroll-mt-32">
        <div className="space-y-4">
          <Card eyebrow="Holders">
            <KpiStrip>
              <Panel label="$STRIKE holders" value={strikeHolders ? num(strikeHolders) : '—'} />
              <Panel label="$RESERVE holders" value={reserveHolders ? num(reserveHolders) : '—'} />
              <Panel label="$STRIKE market cap" value={fmt(marketCap)} />
              <Panel label="$STRIKE FDV" value={fmt(fdv)} />
              <Panel label="$RESERVE mcap" value={fmt(market.reserveMcapUsd ?? market.reserveFdvUsd)} />
              <Panel label="Max LTV vs $RESERVE" value="75%" />
              <Panel label="Floor path" value="~7.5%" />
            </KpiStrip>
          </Card>
          {rateHist.length > 1 && (
            <ChartPanel title="Claim rate & vault NAV">
              <Line
                data={{
                  labels: rateHist.map((r) => r.date || r.ts),
                  datasets: [
                    { label: 'STRIKE / RESERVE', data: rateHist.map((r) => r.exchangeRate), borderColor: MARK.lime, tension: 0.2, borderWidth: 2 },
                    ...(navHist.length > 1 ? [{ label: 'Vault NAV (USDG)', data: (vault?.history || []).map((r) => r.nav), borderColor: MARK.sky, tension: 0.2, borderWidth: 2, yAxisID: 'y1' }] : []),
                  ],
                }}
                options={{
                  ...chartOpts,
                  scales: {
                    ...chartOpts.scales,
                    y: { ...chartOpts.scales.y, position: 'left', unit: 'STRIKE / RESERVE' },
                    y1: { ticks: { color: '#8b929b', callback: compactUsdTick }, grid: { drawOnChartArea: false }, position: 'right', unit: 'USDG' },
                  },
                }}
              />
            </ChartPanel>
          )}
        </div>
      </ShareSection>

      <MethodologyCard>
        <p>
          Mechanics follow the Oakmont docs. Live wrap math is on-chain ERC-4626 ($RESERVE.convertToAssets / totalAssets).
          The public indexer (api.oakmontvault.xyz) is currently undeployed, so basket NAV and ETH-fee history are unavailable until it returns.
          Reserve holder APY is annualized (STRIKE-per-RESERVE − 1) from wrap inception, same formula as the dapp.
          Fee CoC is ETH fee revenue when the indexer publishes it. Wrapped-$STRIKE NAV is escrow value, not a full index mark-to-market.
          Claim APY and fee CoC are not additive.
        </p>
        <p>
          Docs:{' '}
          <a className="text-ink underline hover:text-accent" href={OAKMONT_SITE} target="_blank" rel="noreferrer">{OAKMONT_SITE}</a>
          {' · '}
          <a className="text-ink underline hover:text-accent" href={OAKMONT_DOCS} target="_blank" rel="noreferrer">docs</a>
          {' · '}
          <a className="text-ink underline hover:text-accent" href={OAKMONT_DAPP} target="_blank" rel="noreferrer">dapp</a>
        </p>
      </MethodologyCard>
    </div>
  );
}
