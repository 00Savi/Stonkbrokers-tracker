import React from 'react';
import { Link } from 'react-router-dom';
import { NFT_PROJECTS } from '../../lib/routes';
import { Card, Figure, Stat, SplitBar, Tag, Value, Skeleton, usd, num, pct } from '../kit';

/**
 * The front page.
 *
 * Built around the question the dashboard exists to answer: of everything on
 * the board, what is worth buying right now? Clockwork opens on the snipe
 * premium for the same reason -- one number that decides the trade, then the
 * evidence for it underneath.
 *
 * Every tier across every project is put on one ranked table, because a tier's
 * yield is only meaningful against what the others pay. Four separate project
 * pages cannot answer "which of these twenty is best", which is the actual
 * question.
 */

/**
 * Cost to enter a tier: one NFT at floor, plus the tokens it must hold.
 *
 * Both legs matter and the second is the one that moves -- a tier requiring
 * 666,666 tokens costs a different amount every time the token price ticks,
 * so a yield quoted against the NFT floor alone drifts away from reality.
 */
function tierRows(data) {
  const rows = [];
  for (const meta of NFT_PROJECTS) {
    const p = data?.projects?.[meta.key];
    if (!p) continue;
    const floorUsd = (p.market?.nftFloorEth || 0) * (p.market?.ethPriceUsd || 0);
    const tokenUsd = p.market?.tokenPriceUsd || 0;

    for (const t of p.tiers || []) {
      const cost = floorUsd + (t.reqTokens || 0) * tokenUsd;
      const annual = t.trackedAnnualYieldUsd || 0;
      rows.push({
        key: `${meta.key}-${t.tier}`,
        project: meta,
        tier: t.tier,
        name: t.name,
        reqTokens: t.reqTokens,
        cost,
        annual,
        roi: cost > 0 ? (annual / cost) * 100 : null,
        payback: annual > 0 ? cost / annual : null,
        underConstruction: !!p.underConstruction,
      });
    }
  }
  return rows.sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1));
}

function RankTable({ rows, pending }) {
  if (pending) {
    return (
      <div className="space-y-2 px-5 pb-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} ch={40} height="20px" className="!w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="px-6 py-14 text-center font-mono text-[12px] text-faint">
        No tiers loaded.
      </div>
    );
  }

  const best = rows[0]?.roi ?? 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="eyebrow border-b border-line text-left text-faint">
            <th className="px-5 py-3 font-normal">Project · tier</th>
            <th className="px-3 py-3 text-right font-normal">Annual ROI</th>
            <th className="px-3 py-3 text-right font-normal">Cost to enter</th>
            <th className="px-3 py-3 text-right font-normal">Annual yield</th>
            <th className="px-3 py-3 text-right font-normal">Payback</th>
            <th className="px-5 py-3 font-normal">Requires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const leader = r.roi != null && r.roi >= best && best > 0;
            return (
              <tr key={r.key} className="border-b border-line-soft transition-colors hover:bg-panel-2">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/${r.project.slug}/roi`}
                      className="text-[13px] text-ink underline-offset-2 hover:text-accent hover:underline"
                    >
                      {r.project.name}
                    </Link>
                    <span className="font-mono text-[11px] text-faint">{r.name}</span>
                    {leader && <Tag tone="good">best</Tag>}
                    {r.underConstruction && (
                      <Tag tone="warn" title="Project has not started distributing yet">
                        pre-launch
                      </Tag>
                    )}
                  </div>
                </td>
                <td
                  className={`num px-3 py-2.5 text-right text-[13px] ${
                    leader ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {r.roi == null ? '—' : pct(r.roi, 2)}
                </td>
                <td className="num px-3 py-2.5 text-right text-[12px] text-muted">{usd(r.cost)}</td>
                <td className="num px-3 py-2.5 text-right text-[12px] text-muted">
                  {usd(r.annual)}
                </td>
                <td className="num px-3 py-2.5 text-right text-[12px] text-muted">
                  {r.payback == null ? '—' : `${r.payback.toFixed(1)}y`}
                </td>
                <td className="num px-5 py-2.5 text-[12px] text-faint">
                  1 NFT + {num(r.reqTokens)} ${r.project.ticker}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewView({ data, pending }) {
  const rows = tierRows(data);
  const top = rows[0];

  // Ecosystem totals. Every project contributes what it has; a project missing
  // a field contributes nothing rather than a zero that would drag an average.
  const projects = NFT_PROJECTS.map((m) => data?.projects?.[m.key]).filter(Boolean);

  const revenue = projects.reduce(
    (acc, p) => {
      const r = p.revenue || {};
      acc.amm += r.ammFeesUsd || 0;
      acc.other += (r.securityBoxUsd || 0) + (r.launchpadUsd || 0) + (r.dexFeesUsd || 0);
      return acc;
    },
    { amm: 0, other: 0 }
  );
  const totalRevenue = revenue.amm + revenue.other;

  const activation = projects.reduce(
    (acc, p) => {
      const a = p.activation || {};
      acc.active += a.activeCount || 0;
      acc.supply += a.totalSupply || 0;
      return acc;
    },
    { active: 0, supply: 0 }
  );
  const idle = Math.max(0, activation.supply - activation.active);

  const lpUsd = projects.reduce((s, p) => s + (p.lockedLp?.totalLpUsd || 0), 0);
  const holders = projects.reduce(
    (s, p) => s + (p.ownership?.tokenHolders ?? p.ownership?.[`${'stonk'}Holders`] ?? 0),
    0
  );

  return (
    <div className="space-y-4 pb-16">
      <header className="pb-2 pt-6">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink md:text-[32px]">
          What is worth buying
        </h1>
        <p className="mt-1.5 max-w-2xl font-mono text-[11px] leading-relaxed text-faint">
          Every tier across every project, ranked by what it actually returns against what it
          actually costs. Cost is one NFT at floor plus the tokens the tier requires — both legs,
          repriced live.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* The single hero: the best return available anywhere on the board. */}
        <Card
          eyebrow="Best annual return · every tier compared"
          sub="Yield over the full cost of entry, not over the NFT alone"
          corner={
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-faint">
              {rows.length || '—'} tiers
            </span>
          }
        >
          <Figure
            value={top?.roi != null ? pct(top.roi, 1) : '—'}
            after={top ? `on ${top.project.name} · ${top.name}` : undefined}
            tone="accent"
            size="text-[52px]"
            pending={pending}
          />
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line-soft pt-3">
            <Stat label="Cost to enter" value={usd(top?.cost)} pending={pending} ch={8} />
            <Stat label="Annual yield" value={usd(top?.annual)} pending={pending} ch={7} />
            <Stat
              label="Payback"
              value={top?.payback == null ? '—' : `${top.payback.toFixed(1)}y`}
              pending={pending}
              ch={5}
            />
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
            Yields are annualised from a trailing sample, so they describe what the last week paid
            rather than what the next year will.
          </p>
        </Card>

        {/* Where the money comes from -- one split, two named sources. */}
        <Card eyebrow="Protocol revenue · all sources" sub="Cumulative, across all four projects">
          <Figure value={usd(totalRevenue)} pending={pending} />
          <div className="mt-5">
            <SplitBar
              a={revenue.amm}
              b={revenue.other}
              labelA="AMM fees"
              labelB="Other streams"
              valueA={usd(revenue.amm)}
              valueB={usd(revenue.other)}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line-soft pt-3">
            <Stat label="Locked in LP" value={usd(lpUsd)} pending={pending} ch={9} />
            <Stat label="Token holders" value={num(holders)} pending={pending} ch={7} />
          </div>
        </Card>

        {/* Activation: the share of supply actually earning. */}
        <Card
          eyebrow="Supply activated"
          sub="An NFT only earns while it is activated — the rest is idle inventory"
        >
          <Figure
            value={activation.supply > 0 ? pct((activation.active / activation.supply) * 100) : '—'}
            after={`${num(activation.active)} of ${num(activation.supply)} earning`}
            pending={pending}
          />
          <div className="mt-5">
            <SplitBar
              a={activation.active}
              b={idle}
              labelA="Activated"
              labelB="Idle"
              valueA={num(activation.active)}
              valueB={num(idle)}
            />
          </div>
        </Card>

        {/* Per-project jump-off, and a place the tier count is visible. */}
        <Card eyebrow="Projects" sub="Open any project for its ROI, yield, revenue and burn">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {NFT_PROJECTS.map((m) => {
              const p = data?.projects?.[m.key];
              const bestForProject = rows.find((r) => r.project.key === m.key);
              return (
                <Link
                  key={m.key}
                  to={`/${m.slug}/roi`}
                  className="flex items-center justify-between rounded-xl border border-line bg-panel-2 px-4 py-3 transition-colors hover:border-accent/40"
                >
                  <div>
                    <div className="text-[13px] text-ink">{m.name}</div>
                    <div className="num mt-0.5 text-[11px] text-faint">${m.ticker}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[14px] text-accent">
                      <Value pending={pending} ch={6}>
                        {bestForProject?.roi != null ? pct(bestForProject.roi, 1) : '—'}
                      </Value>
                    </div>
                    <div className="num mt-0.5 text-[10px] text-faint">
                      {p?.underConstruction ? 'pre-launch' : 'best tier'}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        eyebrow="Every tier · ranked by annual return"
        sub="Cost repriced on each load; yield annualised from the trailing sample"
        flush
        corner={
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-faint">
            {rows.length} rows
          </span>
        }
      >
        <RankTable rows={rows} pending={pending} />
      </Card>

      <p className="px-1 font-mono text-[10px] leading-relaxed text-faint">
        Holder and activation counts come from{' '}
        <span className="text-muted">gg-index</span>, which folds Transfer events into balances and
        reconciles against <span className="text-muted">totalSupply()</span>. Prices are read from
        the pools directly. Yields are a trailing sample annualised — past distributions, not a
        forecast. Not financial advice.
      </p>
    </div>
  );
}
