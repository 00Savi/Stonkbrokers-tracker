import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend,
} from 'chart.js';
import { loadOverlap, loadProjectAnalysis } from '../lib/ggindex';
import { seatCashByDate } from '../lib/yieldSample';
import { bookSlugOf } from '../lib/books';
import { cashVsMarkSeries } from '../lib/yieldHistory';
import { byDate, formatLabels } from '../lib/dates';
import { baseChartOptions, barThickness, categoryBarOptions, compactTick, compactUsdTick, STREAM_COLORS } from '../lib/charts';
import { explorerAddressUrl } from '../lib/tba';
import { walletName } from '../lib/wallets';
import { compactNum, compactUsd, Card, KpiStrip, Stat, SplitBar, SkeletonCard } from './kit';
import { ActivityChart, ChartPanel } from './HistoryCharts';
import { PayoutCalendar } from './PayoutCalendar';
import { useChartView } from '../lib/chartWindow';
import { windowChart } from '../lib/yieldHistory';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const AnalysisContext = createContext(null);

export function AnalysisProvider({ slug, project, overlapSlugs = null, children }) {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (!slug) {
      setAnalysis(null);
      return undefined;
    }
    let live = true;
    loadProjectAnalysis(slug).then((next) => {
      if (live) setAnalysis(next);
    });
    return () => {
      live = false;
    };
  }, [slug]);

  const value = useMemo(
    () => ({ slug, project, analysis, overlapSlugs }),
    [slug, project, analysis, overlapSlugs],
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

function useAnalysis() {
  return useContext(AnalysisContext);
}

function pct(share) {
  const n = Number(share);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function feeApr(fees7d, tvl) {
  const fees = Number(fees7d) || 0;
  const locked = Number(tvl) || 0;
  if (!(locked > 0) || !(fees > 0)) return null;
  return (fees * 52 / locked) * 100;
}

function aprText(n) {
  if (n == null) return '—';
  if (n >= 100) return `${n.toFixed(0)}%`;
  return `${n.toFixed(1)}%`;
}

const STREAMS = [
  { key: 'amm', label: 'AMM', color: STREAM_COLORS.amm },
  { key: 'box', label: 'Box', color: STREAM_COLORS.box },
  { key: 'tax', label: 'Tax', color: STREAM_COLORS.tax },
  { key: 'dex', label: 'DEX', color: STREAM_COLORS.dex },
  { key: 'smart_lp', label: 'Smart LP', color: STREAM_COLORS.smartLp },
];

function flowRows(project) {
  const own = project?.ammFlow?.dates?.length ? [project.ammFlow] : [];
  const kids = Object.values(project?.factions || {})
    .map((f) => f?.ammFlow)
    .filter((f) => f?.dates?.length);
  return own.length ? own : kids;
}

function combineFlow(project) {
  const rows = flowRows(project);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const map = new Map();
  for (const flow of rows) {
    flow.dates.forEach((day, i) => {
      const cur = map.get(day) || { entered: 0, left: 0, feeEth: 0 };
      cur.entered += Number(flow.entered?.[i]) || 0;
      cur.left += Number(flow.left?.[i]) || 0;
      cur.feeEth += Number(flow.feeEth?.[i]) || 0;
      map.set(day, cur);
    });
  }
  const dates = [...map.keys()].sort();
  return {
    dates,
    entered: dates.map((d) => map.get(d).entered),
    left: dates.map((d) => map.get(d).left),
    feeEth: dates.map((d) => map.get(d).feeEth),
  };
}

function AmmExchange({ project }) {
  const { range: timeframe, interval } = useChartView();
  const flow = combineFlow(project);
  if (!flow) return null;
  const win = windowChart(flow.dates, [flow.entered, flow.left, flow.feeEth], timeframe, interval, ['sum', 'sum', 'sum']);
  const entered = win.cols[0] || [];
  const left = win.cols[1] || [];
  const net = entered.map((v, i) => (Number(v) || 0) - (Number(left[i]) || 0));
  const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);
  const inn = sum(flow.entered);
  const out = sum(flow.left);
  const eth = sum(flow.feeEth);
  const ethUsd = Number(project?.market?.ethPriceUsd)
    || Number(Object.values(project?.factions || {}).find((f) => Number(f?.market?.ethPriceUsd) > 0)?.market?.ethPriceUsd)
    || 0;
  return (
    <Card
      eyebrow="AMM exchange"
      sub="Totals cover every day indexed. The chart follows Range. In is NFTs sold into the vault, out is NFTs bought back. Fees are the ETH the AMM charged on those trades, priced at the latest ETH."
    >
      <KpiStrip>
        <Stat label="In" value={compactNum(inn)} note="Sold into the vault" />
        <Stat label="Out" value={compactNum(out)} note="Bought out of the vault" />
        <Stat label="Net" value={`${sum(net) > 0 ? '+' : ''}${compactNum(sum(net))}`} note="In minus out" tone="accent" />
        <Stat label="Fees" value={ethUsd > 0 ? compactUsd(eth * ethUsd) : `${eth.toFixed(2)} ETH`} note={ethUsd > 0 ? `${eth.toFixed(2)} ETH charged` : 'ETH charged on the trades'} />
      </KpiStrip>
      <div className="mt-4">
        <ActivityChart
          labels={win.labels}
          ins={entered}
          outs={left}
          net={net}
          interval={interval}
          lineLabel="Net into vault"
          inLabel="Sold in"
          outLabel="Bought out"
          lineColor="#e7e9ec"
        />
      </div>
    </Card>
  );
}

function tierChipLabel(tier) {
  if (!tier) return '';
  return tier.name ? `${tier.tier}: ${tier.name}` : tier.tier;
}

function CashVsMark({ project }) {
  const tiers = (project?.tiers || []).filter((tier) => tier?.tier);
  const [tierId, setTierId] = useState(tiers[0]?.tier || '');
  const tier = tiers.find((row) => row.tier === tierId) || tiers[0];
  const series = cashVsMarkSeries(project?.dailySnapshots, tier, seatCashByDate(project, tier));
  if (!series) return null;
  const labels = formatLabels(series.labels);
  const toolbar = tiers.length > 1 ? (
    <div
      role="tablist"
      aria-label="Seat tier"
      className="mt-3 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tiers.map((row) => (
        <button
          key={row.tier}
          type="button"
          role="tab"
          aria-selected={row.tier === tier.tier}
          onClick={() => setTierId(row.tier)}
          className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium normal-case tracking-normal ${
            row.tier === tier.tier ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {tierChipLabel(row)}
        </button>
      ))}
    </div>
  ) : null;
  return (
    <ChartPanel
      title={`Cash yield vs mark · ${tierChipLabel(tier)}`}
      note="Cash is what that seat was paid on each day, summed. A day with no print adds nothing. Mark is how far the entry cost (floor plus this tier’s tokens) has moved since the first day in the window. Both are USD."
      toolbar={toolbar}
    >
      <Line
        key={tier?.tier || 'tier'}
        data={{
          labels,
          datasets: [
            {
              label: 'Cumulative cash (USD)',
              data: series.cash,
              borderColor: '#00a804',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
            },
            {
              label: 'Mark change (USD)',
              data: series.mark,
              borderColor: '#94a3b8',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
            },
          ],
        }}
        options={baseChartOptions(labels, 'daily', { yUnit: 'USD', yTick: compactUsdTick })}
      />
    </ChartPanel>
  );
}

function streamUsd(day, key) {
  const n = Number(day?.streams?.[key]?.usd);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function StreamQuality({ revenue }) {
  // A day row with every stream null still arrived from the index. Plotting it
  // as zero shoved 9/25 onto the axis after 9/8 and left a blank stretch.
  const days = byDate(revenue?.daily).filter((d) => STREAMS.some((s) => streamUsd(d, s.key) > 0));
  if (!days.length) return null;
  const labels = formatLabels(days.map((d) => d.date));
  const datasets = STREAMS.map((s) => ({
    label: s.label,
    data: days.map((d) => streamUsd(d, s.key)),
    backgroundColor: s.color,
    stack: 'streams',
    maxBarThickness: barThickness(labels.length),
  })).filter((ds) => ds.data.some((n) => n > 0));
  if (!datasets.length) return null;
  const incomplete = days.filter((d) =>
    STREAMS.some((s) => d.streams?.[s.key] && d.streams[s.key].complete === false),
  ).length;
  const options = baseChartOptions(labels, 'daily', { yUnit: 'USD', yTick: compactUsdTick });
  options.scales.x.stacked = true;
  options.scales.y.stacked = true;
  const volumeDays = days.filter((d) => Number(d.streams?.volume?.usd) > 0).length;
  const note = [
    incomplete
      ? `${incomplete} day${incomplete === 1 ? '' : 's'} in this window ${incomplete === 1 ? 'is' : 'are'} a lower bound — the native inflow missed a span.`
      : 'Each bar is that day’s protocol USD by stream.',
    'Missing days are left out, not drawn as zero.',
    volumeDays ? 'Bonding volume is notional and is left off this stack.' : '',
  ].filter(Boolean).join(' ');
  return (
    <ChartPanel title="Revenue by stream" note={note}>
      <Bar
        data={{ labels, datasets }}
        options={options}
      />
    </ChartPanel>
  );
}

function FeeRates({ project }) {
  const vaults = project?.revenue?.smartLp?.vaults;
  if (!Array.isArray(vaults) || !vaults.length) return null;
  const byMarket = new Map();
  for (const v of vaults) {
    const key = v.market || v.symbol || v.ca || 'Vault';
    const row = byMarket.get(key) || { market: key, tvl: 0, fees: 0, protocol: 0 };
    row.tvl += Number(v.tvlUsd) || 0;
    row.fees += Number(v.fees7dUsd) || 0;
    row.protocol += Number(v.protocolFees7dUsd) || 0;
    byMarket.set(key, row);
  }
  const rows = [...byMarket.values()]
    .map((r) => ({ ...r, apr: feeApr(r.fees, r.tvl), protocolApr: feeApr(r.protocol, r.tvl) }))
    .filter((r) => r.tvl > 0)
    .sort((a, b) => (b.apr || 0) - (a.apr || 0));
  if (!rows.length) return null;
  return (
    <Card eyebrow="Fee rate" sub="7-day depositor fees × 52, divided by TVL. A vault with no skim this week has no rate. Protocol is the skim, same window.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-faint">
              <th className="py-2 pr-3 font-medium">Market</th>
              <th className="py-2 pr-3 font-medium text-right">TVL</th>
              <th className="py-2 pr-3 font-medium text-right">Depositor APR</th>
              <th className="py-2 font-medium text-right">Protocol APR</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => (
              <tr key={r.market} className="border-t border-line">
                <td className="py-2 pr-3 text-ink">{r.market}</td>
                <td className="py-2 pr-3 text-right num text-muted">{compactUsd(r.tvl)}</td>
                <td className="py-2 pr-3 text-right num text-ink">{aprText(r.apr)}</td>
                <td className="py-2 text-right num text-muted">{aprText(r.protocolApr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConcentrationBars({ title, leg }) {
  const top = (leg?.top || []).slice(0, 10);
  if (!top.length) return null;
  const labels = top.map((row, i) => {
    const named = walletName(row.holder);
    return named?.name || shortAddr(row.holder) || `#${i + 1}`;
  });
  const shares = top.map((row) => (Number(row.share) || 0) * 100);
  return (
    <ChartPanel
      title={`${title} top-10 share`}
      note="Ranked share of the float after burn addresses and catalog contracts. Identity is in the table below — colour alone is not the signal."
      frameClass="h-64 sm:h-72"
    >
      <Bar
        data={{
          labels,
          datasets: [{
            label: 'Share %',
            data: shares,
            backgroundColor: '#8b5cf6',
            maxBarThickness: 22,
          }],
        }}
        options={categoryBarOptions(labels, { unit: '% of float', tick: (v) => `${compactTick(v)}%` })}
      />
    </ChartPanel>
  );
}

function HolderLeg({ title, leg, noun }) {
  if (!leg || !(leg.wallets > 0)) return null;
  const labels = (leg.buckets || []).map((b) => b.label);
  return (
    <>
      <Card eyebrow={`${title} ownership`} sub="Float after burn addresses and catalog contracts. Top-10 share is concentration of that float.">
        <KpiStrip>
          <Stat label={`${title} wallets`} value={compactNum(leg.wallets)} />
          <Stat label="Top 10 share" value={pct(leg.top10_share)} tone="accent" note="Of this float" />
          <Stat
            label="Largest bag"
            value={leg.top?.[0] ? pct(leg.top[0].share) : '—'}
            note={leg.top?.[0] ? shortAddr(leg.top[0].holder) : null}
          />
        </KpiStrip>
      </Card>
      <ConcentrationBars title={title} leg={leg} />
      {labels.length > 0 && (
        <ChartPanel
          title={`${title} wallets by size`}
          note={`Balances under one ${noun} are left out, and so are burn addresses and contracts in the catalog. The bar is wallets, not tokens.`}
        >
          <Bar
            data={{
              labels,
              datasets: [{
                label: 'Wallets',
                data: leg.buckets.map((b) => b.wallets),
                backgroundColor: '#38bdf8',
                maxBarThickness: 48,
              }],
            }}
            options={baseChartOptions(labels, 'daily', { yUnit: 'wallets', yTick: compactTick })}
          />
        </ChartPanel>
      )}
      {leg.top?.length > 0 && (
        <Card eyebrow={`${title} top holders`} sub="Share of the float after burn addresses and catalog contracts are removed. A named row is a contract we recognize.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-faint">
                  <th className="py-2 pr-3 font-medium">Wallet</th>
                  <th className="py-2 pr-3 font-medium text-right">Balance</th>
                  <th className="py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {leg.top.map((row) => {
                  const named = walletName(row.holder);
                  return (
                  <tr key={row.holder} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <a className="hover:underline" href={explorerAddressUrl(row.holder)} target="_blank" rel="noreferrer">
                        {named ? <span className="text-ink">{named.name}</span> : null}
                        <span className={named ? 'ml-2 font-mono text-faint' : 'font-mono text-ink'}>{shortAddr(row.holder)}</span>
                      </a>
                      {named?.note ? <div className="font-mono text-[11px] text-faint">{named.note}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-right num text-muted">{compactNum(Number(row.balance))}</td>
                    <td className="py-2 text-right num text-ink">{pct(row.share)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function HolderStructure({ structure, pending }) {
  if (pending && !structure) return <SkeletonCard rows={3} />;
  if (!structure) return null;
  return (
    <>
      <HolderLeg title="Token" leg={structure.token} noun="token" />
      <HolderLeg title="NFT" leg={structure.nft} noun="NFT" />
    </>
  );
}

function FlowChart({ title, note, daily, field }) {
  const rows = byDate(daily).filter((d) => d.entries || d.exits || (field && d[field]));
  if (rows.length < 2) return null;
  const labels = formatLabels(rows.map((d) => d.date));
  const incomplete = rows.some((d) => d.complete === false);
  return (
    <ChartPanel title={title} note={incomplete ? `${note} A day marked incomplete had a hole in the transfer log.` : note}>
      <Bar
        data={{
          labels,
          datasets: field
            ? [{
              label: 'NFT ids moved',
              data: rows.map((d) => d.ids_moved),
              backgroundColor: '#f5b700',
              maxBarThickness: barThickness(labels.length),
            }]
            : [
              {
                label: 'Entries',
                data: rows.map((d) => d.entries),
                backgroundColor: '#00a804',
                maxBarThickness: barThickness(labels.length),
              },
              {
                label: 'Exits',
                data: rows.map((d) => d.exits),
                backgroundColor: '#ff3333',
                maxBarThickness: barThickness(labels.length),
              },
            ],
        }}
        options={baseChartOptions(labels, 'daily', { yUnit: field ? 'NFTs' : 'wallets', yTick: compactTick })}
      />
    </ChartPanel>
  );
}

function ActivityPanels({ activity, project }) {
  if (!activity) return null;
  const token = activity.token;
  const nft = activity.nft;
  const waiting = (token && !token.built) || (nft && !nft.built);
  const circ = Number(project?.ownership?.circulatingNftSupply) || 0;
  const lastMoved = byDate(nft?.daily).reverse().find((d) => d.ids_moved > 0);
  const turn = circ > 0 && lastMoved ? (lastMoved.ids_moved / circ) * 100 : null;
  return (
    <>
      {token?.built && (
        <FlowChart
          title="Token holder flow"
          note="An entry crossed up through one whole token. An exit crossed back under it. Catalog contracts and burn addresses are not counted. A flat holder count can still be heavy churn."
          daily={token.daily}
        />
      )}
      {nft?.built && (
        <FlowChart
          title="NFT turnover"
          note={
            turn == null
              ? 'Distinct token ids whose owner changed that day.'
              : `Distinct token ids whose owner changed that day. The latest active day was ${turn.toFixed(1)}% of today’s circulating supply outside the AMM (${compactNum(circ)}).`
          }
          daily={nft.daily}
          field="ids_moved"
        />
      )}
      {waiting && !token?.built && !nft?.built ? (
        <p className="font-mono text-[11px] text-faint">
          Holder flow is folded from transfers into activity days. It shows up after that rebuild runs.
        </p>
      ) : null}
    </>
  );
}

function CohortChart({ title, note, weeks, noun }) {
  const ordered = byDate(weeks, 'week');
  if (!ordered.length) return null;
  const labels = formatLabels(ordered.map((w) => w.week));
  return (
    <ChartPanel title={title} note={note}>
      <Bar
        data={{
          labels,
          datasets: [{
            label: noun,
            data: ordered.map((w) => w.wallets),
            backgroundColor: '#8b5cf6',
            maxBarThickness: barThickness(labels.length),
          }],
        }}
        options={baseChartOptions(labels, 'weekly', { yUnit: noun, yTick: compactTick })}
      />
    </ChartPanel>
  );
}

function Cohorts({ cohorts }) {
  if (!cohorts) return null;
  const tokenReady = cohorts.token?.ready && cohorts.token.weeks?.length;
  const nftReady = cohorts.nft?.ready && cohorts.nft.weeks?.length;
  if (!tokenReady && !nftReady) {
    if (cohorts.token?.ready === false || cohorts.nft?.ready === false) {
      return (
        <p className="font-mono text-[11px] text-faint">
          Vintage weeks wait on the open-date fold. A partial fold would date old bags as if they opened later.
        </p>
      );
    }
    return null;
  }
  return (
    <>
      {tokenReady ? (
        <CohortChart
          title="Token vintages still open"
          note="Wallets still holding at least one whole token, by the week that bag last crossed that line. Selling under one token closes it; the next buy starts a new week."
          weeks={cohorts.token.weeks}
          noun="wallets"
        />
      ) : null}
      {nftReady ? (
        <CohortChart
          title="NFT vintages in the current wallet"
          note="Pieces still held, by the week the current owner received them. A transfer starts a new week for that id."
          weeks={cohorts.nft.weeks}
          noun="NFTs"
        />
      ) : null}
    </>
  );
}

function EffectiveActive({ effective }) {
  if (!effective?.holds_ready || !(effective.counted > 0)) return null;
  const still = Number(effective.still_with_activator) || 0;
  const moved = Number(effective.moved) || 0;
  const unknown = Number(effective.unknown) || 0;
  return (
    <Card
      eyebrow="Earning vs counted"
      sub="activeCount includes NFTs that were sold and stopped earning, because a sale does not emit a clear. Still held means the current owner is the address on the latest activation. Unknown means the NFT fold has no per-token owner — a range mint that never moved, not a sale."
    >
      <SplitBar
        a={still}
        b={moved}
        labelA="Still with activator"
        labelB="Moved since"
        valueA={compactNum(still)}
        valueB={compactNum(moved)}
      />
      <KpiStrip className="mt-5">
        <Stat label="Counted active" value={compactNum(effective.counted)} />
        <Stat label="Still with activator" value={compactNum(still)} tone="accent" />
        <Stat label="Moved since" value={compactNum(moved)} />
        <Stat label="Owner unknown" value={compactNum(unknown)} />
      </KpiStrip>
    </Card>
  );
}

export function OverlapPanel({ slugs }) {
  const [data, setData] = useState(null);
  const key = slugs?.length ? slugs.join(',') : '';

  useEffect(() => {
    let live = true;
    loadOverlap(slugs).then((next) => {
      if (live) setData(next);
    });
    return () => {
      live = false;
    };
  }, [key]);

  const pairs = data?.pairs || [];
  if (!pairs.length) return null;
  const shown = pairs.slice(0, 12);
  const labels = shown.map((p) => `${p.a} ∩ ${p.b}`);
  return (
    <ChartPanel
      title="Wallets in more than one collection"
      note="NFT holders with at least one piece, excluding burn addresses and every contract in the catalog. The bar is shared wallets. Share of each side is under the chart."
      frameClass="h-[28rem]"
      footer={(
        <div className="space-y-1">
          {shown.map((p) => (
            <p key={`${p.a}-${p.b}`} className="font-mono text-[11px] text-faint">
              {p.a} ∩ {p.b}: {compactNum(p.shared)} · {pct(p.share_of_a)} of {p.a} · {pct(p.share_of_b)} of {p.b}
            </p>
          ))}
        </div>
      )}
    >
      <Bar
        data={{
          labels,
          datasets: [{
            label: 'Shared wallets',
            data: shown.map((p) => p.shared),
            backgroundColor: '#818cf8',
            maxBarThickness: 22,
          }],
        }}
        options={categoryBarOptions(labels, { unit: 'wallets', tick: compactTick })}
      />
    </ChartPanel>
  );
}

export function SectionInsights({ sectionId }) {
  const ctx = useAnalysis();
  if (!ctx || !sectionId) return null;
  const { project, analysis, overlapSlugs } = ctx;

  if (sectionId === 'roi') {
    return (
      <>
        <CashVsMark project={project} />
        <PayoutCalendar project={project} />
      </>
    );
  }
  if (sectionId === 'revenue' || sectionId === 'night') {
    // The index stitch labeled holder payouts "AMM" and stopped in September.
    // Stonk draws its own mix. Mancer's ledger chart is the one that continues.
    const slug = bookSlugOf(project);
    if (slug === 'stonk' || slug === 'mancer') return null;
    return <StreamQuality revenue={analysis?.revenue} />;
  }
  if (sectionId === 'liquidity') return <FeeRates project={project} />;
  if (sectionId === 'activation') return <EffectiveActive effective={analysis?.effective} />;
  if (sectionId === 'ownership') {
    const waiting = ctx.slug && analysis == null;
    return (
      <div className="mt-4 space-y-4">
        <HolderStructure structure={analysis?.structure} pending={waiting} />
        <EffectiveActive effective={analysis?.effective} />
        <AmmExchange project={project} />
        <ActivityPanels activity={analysis?.activity} project={project} />
        <Cohorts cohorts={analysis?.cohorts} />
        {overlapSlugs?.length ? <OverlapPanel slugs={overlapSlugs} /> : null}
      </div>
    );
  }
  return null;
}
