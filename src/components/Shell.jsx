import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { PROJECTS, TABS, PROJECT_BY_SLUG } from '../lib/routes';
import { Value, price, usd, eth } from './kit';

/**
 * The chrome: nav bar, project tabs, market strip.
 *
 * This is the ONLY place brand orange appears. See the palette note in
 * index.css -- orange is indistinguishable from every usable red at normal
 * vision, so the two are kept apart structurally rather than by judgement:
 * the chrome carries the brand mark and no data values, the data surfaces
 * carry red and no brand mark. Nothing in this file renders a figure whose
 * sign matters.
 */

function BrandMark() {
  return (
    <NavLink to="/" className="flex shrink-0 items-center gap-2">
      <span className="text-[17px] leading-none text-brand">◆</span>
      <span className="hidden text-[15px] tracking-tight sm:inline">
        Stonk<em className="font-semibold not-italic">brokers</em>
      </span>
    </NavLink>
  );
}

const pill = (active) =>
  `rounded-full px-3 py-1.5 text-[13px] transition-colors ${
    active ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
  }`;

export function TopNav({ live }) {
  return (
    <div className="sticky top-0 z-30 px-4 pt-4">
      <nav className="mx-auto flex max-w-[1500px] items-center gap-3 rounded-full border border-line bg-panel/95 px-4 py-2.5 backdrop-blur-xl">
        <BrandMark />

        <div className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto">
          {PROJECTS.map((p) => (
            <NavLink
              key={p.slug}
              to={`/${p.slug}/roi`}
              className={({ isActive }) => `${pill(isActive)} whitespace-nowrap`}
            >
              {p.name}
            </NavLink>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-line" />
          <NavLink to="/ecosystem" className={({ isActive }) => `${pill(isActive)} whitespace-nowrap`}>
            Ecosystem
          </NavLink>
          <NavLink to="/portfolio" className={({ isActive }) => `${pill(isActive)} whitespace-nowrap`}>
            Portfolio
          </NavLink>
          <NavLink to="/tokens" className={({ isActive }) => `${pill(isActive)} whitespace-nowrap`}>
            Tokens
          </NavLink>
          <NavLink to="/stocks" className={({ isActive }) => `${pill(isActive)} whitespace-nowrap`}>
            Stocks
          </NavLink>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-faint md:flex">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? 'live-dot bg-accent' : 'bg-faint'
              }`}
            />
            {live ? 'LIVE' : 'SYNCING'}
          </span>
          <a
            href="https://www.stonkbrokers.cash/marketplace"
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
          >
            Marketplace ↗
          </a>
        </div>
      </nav>
    </div>
  );
}

/** Project tab bar. Every tab is a real link, so each is refresh-safe. */
export function TabBar() {
  const { project } = useParams();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line pb-3">
      {TABS.map((t) => (
        <NavLink
          key={t.slug}
          to={`/${project}/${t.slug}`}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              isActive ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

/** Title block + the three market figures, per project. */
export function PageHeader({ data, pending }) {
  const { project: slug } = useParams();
  const key = PROJECT_BY_SLUG[slug];
  const meta = PROJECTS.find((p) => p.key === key);
  const p = data?.projects?.[key];
  const market = p?.market || {};

  return (
    <header className="flex flex-col gap-4 pb-5 pt-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink md:text-[30px]">
          {meta?.name ?? 'Tracker'}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-faint">
          Robinhood Chain · built by{' '}
          <a
            href="https://x.com/savicrypto"
            target="_blank"
            rel="noreferrer"
            className="text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            @savicrypto
          </a>
        </p>
      </div>

      <div className="flex gap-6 rounded-xl border border-line bg-panel px-5 py-3">
        <div>
          <div className="eyebrow text-faint">ETH</div>
          <div className="num mt-0.5 text-[15px] text-ink">
            <Value pending={pending} ch={8}>
              {usd(data?.projects?.stonk?.market?.ethPriceUsd, 0)}
            </Value>
          </div>
        </div>
        <div>
          <div className="eyebrow text-faint">${meta?.ticker ?? '—'}</div>
          <div className="num mt-0.5 text-[15px] text-ink">
            <Value pending={pending} ch={9}>
              {price(market.tokenPriceUsd)}
            </Value>
          </div>
        </div>
        <div>
          <div className="eyebrow text-faint">Floor</div>
          <div className="num mt-0.5 text-[15px] text-ink">
            <Value pending={pending} ch={7}>
              {eth(market.nftFloorEth, 3)} Ξ
            </Value>
          </div>
        </div>
      </div>
    </header>
  );
}
