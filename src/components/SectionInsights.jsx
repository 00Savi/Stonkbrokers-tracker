import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend,
} from 'chart.js';
import { loadOverlap, loadProjectAnalysis } from '../lib/ggindex';
import { cashVsMarkSeries } from '../lib/yieldHistory';
import { formatLabels } from '../lib/dates';
import { baseChartOptions, barThickness, compactTick, compactUsdTick, STREAM_COLORS } from '../lib/charts';
import { explorerAddressUrl } from '../lib/tba';
import { compactNum, compactUsd, Card, KpiStrip, Stat } from './kit';
import { ChartPanel } from './HistoryCharts';

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

function CashVsMark({ project }) {
  const tier = project?.tiers?.[0];
  const series = cashVsMarkSeries(project?.dailySnapshots, tier);
  if (!series) return null;
  const labels = formatLabels(series.labels);
  return (
    <ChartPanel
      title={`Cash yield vs mark · ${series.tier}`}
      note="Cash is the annualized yield on each snapshot divided by 365, summed. Mark is how far the entry cost (floor plus this tier’s tokens) has moved since the first day in the window. Both are USD."
    >
      <Line
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

function StreamQuality({ revenue }) {
  const days = revenue?.daily || [];
  if (!days.length) return null;
  const labels = formatLabels(days.map((d) => d.date));
  const datasets = STREAMS.map((s) => ({
    label: s.label,
    data: days.map((d) => {
      const usd = Number(d.streams?.[s.key]?.usd);
      return Number.isFinite(usd) ? usd : 0;
    }),
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

function HolderLeg({ title, leg, noun }) {
  if (!leg || !(leg.wallets > 0)) return null;
  const labels = (leg.buckets || []).map((b) => b.label);
  return (
    <>
      <KpiStrip>
        <Stat label={`${title} wallets`} value={compactNum(leg.wallets)} />
        <Stat label="Top 10 share" value={pct(leg.top10_share)} note="Of this float" />
      </KpiStrip>
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
        <Card eyebrow={`${title} top holders`} sub="Share of the float after burn addresses and catalog contracts are removed.">
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
                {leg.top.map((row) => (
                  <tr key={row.holder} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <a className="font-mono text-ink hover:underline" href={explorerAddressUrl(row.holder)} target="_blank" rel="noreferrer">
                        {shortAddr(row.holder)}
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-right num text-muted">{compactNum(Number(row.balance))}</td>
                    <td className="py-2 text-right num text-ink">{pct(row.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function HolderStructure({ structure }) {
  if (!structure) return null;
  return (
    <>
      <HolderLeg title="Token" leg={structure.token} noun="token" />
      <HolderLeg title="NFT" leg={structure.nft} noun="NFT" />
    </>
  );
}

function FlowChart({ title, note, daily, field }) {
  const rows = (daily || []).filter((d) => d.entries || d.exits || (field && d[field]));
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
  const lastMoved = [...(nft?.daily || [])].reverse().find((d) => d.ids_moved > 0);
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
  if (!weeks?.length) return null;
  const labels = formatLabels(weeks.map((w) => w.week));
  return (
    <ChartPanel title={title} note={note}>
      <Bar
        data={{
          labels,
          datasets: [{
            label: noun,
            data: weeks.map((w) => w.wallets),
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
      <KpiStrip>
        <Stat label="Counted active" value={compactNum(effective.counted)} />
        <Stat label="Still with activator" value={compactNum(still)} />
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
      note="NFT holders with at least one piece, excluding burn addresses and every contract in the catalog. The bar is shared wallets. Share of each side is in the row."
    >
      <Bar
        data={{
          labels,
          datasets: [{
            label: 'Shared wallets',
            data: shown.map((p) => p.shared),
            backgroundColor: '#818cf8',
            maxBarThickness: 28,
          }],
        }}
        options={{
          ...baseChartOptions(labels, 'daily', { yUnit: 'wallets', yTick: compactTick }),
          indexAxis: 'y',
        }}
      />
      <div className="mt-3 space-y-1">
        {shown.map((p) => (
          <p key={`${p.a}-${p.b}`} className="font-mono text-[11px] text-faint">
            {p.a} ∩ {p.b}: {compactNum(p.shared)} · {pct(p.share_of_a)} of {p.a} · {pct(p.share_of_b)} of {p.b}
          </p>
        ))}
      </div>
    </ChartPanel>
  );
}

export function SectionInsights({ sectionId }) {
  const ctx = useAnalysis();
  if (!ctx || !sectionId) return null;
  const { project, analysis, overlapSlugs } = ctx;

  if (sectionId === 'roi') return <CashVsMark project={project} />;
  if (sectionId === 'revenue' || sectionId === 'night') {
    return <StreamQuality revenue={analysis?.revenue} />;
  }
  if (sectionId === 'liquidity') return <FeeRates project={project} />;
  if (sectionId === 'activation') return <EffectiveActive effective={analysis?.effective} />;
  if (sectionId === 'ownership') {
    return (
      <div className="mt-4 space-y-4">
        <HolderStructure structure={analysis?.structure} />
        <ActivityPanels activity={analysis?.activity} project={project} />
        <Cohorts cohorts={analysis?.cohorts} />
        {overlapSlugs?.length ? <OverlapPanel slugs={overlapSlugs} /> : null}
      </div>
    );
  }
  return null;
}
