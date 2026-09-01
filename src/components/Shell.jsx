import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PROJECTS, TABS, BONUS_LIVE } from '../lib/routes';
import { Value, price, usd, eth, BetaTag } from './kit';

export const LAUNCHER_REF = 'https://stonkbrokers.wtf/?ref=savi';
export const SAVI_X = 'https://x.com/savicrypto';
const CLOCK_IN_CARD_REF = 'https://stonkbrokers.io/safe-launch?ref=SAVI';

export const NAV_GROUPS = [
  { id: 'tools', label: 'Tools' },
  { id: 'ecosystem', label: 'Stonkbrokers Ecosystem' },
  { id: 'yield-tokens', label: 'Yield Tokens' },
  { id: 'yield-nfts', label: 'Yield NFTs' },
  { id: 'chain', label: 'Robinhood Chain' },
];

export const NAV_ITEMS = [
  { to: '/portfolio', label: 'Portfolio Tracker', group: 'tools', dot: 'bg-accent' },
  { to: '/ecosystem', label: 'Ecosystem Overview', group: 'tools', dot: 'bg-muted' },
  { to: '/rankings', label: 'Rankings', group: 'tools', dot: 'bg-muted' },
  { to: '/stonkbrokers/roi', label: 'StonkBrokers', group: 'ecosystem', dot: 'bg-[#60a5fa]' },
  { to: '/mancer/roi', label: 'Mancer', group: 'ecosystem', dot: 'bg-[#a78bfa]' },
  { to: '/tickeryard/roi', label: 'TickerYard', group: 'ecosystem', dot: 'bg-[#22d3ee]' },
  { to: '/cardwall/roi', label: 'The Card Wall', group: 'ecosystem', dot: 'bg-[#fbbf24]' },
  { to: '/oakmont/roi', label: 'Oakmont Vault', group: 'ecosystem', dot: 'bg-[#a3e635]' },
  { to: '/index/roi', label: 'Index', group: 'yield-tokens', dot: 'bg-[#34d399]' },
  { to: '/bonus', label: '$Bonus', group: 'yield-tokens', dot: 'bg-[#e8c547]' },
  { to: '/rhmachines/roi', label: 'RH Machines', group: 'yield-nfts', dot: 'bg-[#fb923c]' },
  { to: '/tokens', label: 'Tokens', group: 'chain', dot: 'bg-accent' },
  { to: '/stocks', label: 'Stocks', group: 'chain', dot: 'bg-[#60a5fa]' },
].filter((item) => item.to !== '/bonus' || BONUS_LIVE);

function titleForPath(pathname) {
  const first = pathname.split('/').filter(Boolean)[0];
  if (first === 'ecosystem') return 'Full Ecosystem Overview';
  if (first === 'portfolio') return 'Portfolio Tracker';
  if (first === 'rankings') return 'Rankings';
  if (first === 'tokens') return 'Robinhood Tokens';
  if (first === 'stocks') return 'Robinhood Stock Tokens';
  const project = PROJECTS.find((p) => p.slug === first);
  if (project?.kind === 'token') return project.name;
  return project ? `${project.name} Tracker` : 'StonkBrokers Tracker';
}

function logoForPath(pathname, data) {
  const first = pathname.split('/').filter(Boolean)[0];
  const project = PROJECTS.find((p) => p.slug === first);
  if (project?.logo) return project.logo;
  if (project) return data?.projects?.[project.key]?.config?.logo || 'Stonkbroker.png';
  return 'Stonkbroker.png';
}

export function itemIsActive(pathname, to) {
  const dest = to.split('/')[1];
  const here = pathname.split('/').filter(Boolean)[0];
  if (!here) return dest === 'portfolio';
  return here === dest;
}

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

export function TopNav({ live, data, pending }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const logo = logoForPath(pathname, data);
  const title = titleForPath(pathname);
  const first = pathname.split('/').filter(Boolean)[0];
  const project = PROJECTS.find((p) => p.slug === first);
  const marketKey = project?.key || 'stonk';
  const market = data?.projects?.[marketKey]?.market || {};
  const ticker = project?.ticker || 'STONK';
  const ethUsd = data?.projects?.stonk?.market?.ethPriceUsd;

  useEffect(() => {
    function onPointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="sticky top-0 z-30 px-4 pt-4">
      <nav className="mx-auto flex max-w-[1500px] items-center gap-3 rounded-full border border-line bg-panel/95 px-3 py-2 backdrop-blur-xl sm:px-4 sm:py-2.5">
        <div className="relative min-w-0 flex-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex max-w-full items-center gap-3 rounded-full py-0.5 pr-2 text-left hover:bg-panel-2"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <img
              src={logo.startsWith('http') ? logo : `/${logo}`}
              alt=""
              className="h-9 w-9 shrink-0 rounded-xl border border-line object-cover sm:h-10 sm:w-10"
            />
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-semibold tracking-tight text-ink sm:text-[17px]">
                {title}
              </span>
              {project?.beta && <BetaTag />}
              <svg
                className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
          <p className="ml-12 hidden font-mono text-[11px] text-faint sm:block">
            Robinhood Chain ·{' '}
            <a
              href={SAVI_X}
              target="_blank"
              rel="noreferrer"
              className="text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              @savicrypto
            </a>
          </p>

          {open && (
            <div
              role="listbox"
              className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-[min(70vh,32rem)] w-72 overflow-y-auto rounded-xl border border-line bg-panel py-1 shadow-none"
            >
              {NAV_GROUPS.map((group, gi) => {
                const items = NAV_ITEMS.filter((item) => item.group === group.id);
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={group.id}>
                    {gi > 0 && <div className="my-1 border-t border-line" />}
                    <div className="px-4 pb-0.5 pt-2 text-[11px] font-bold tracking-tight text-ink">
                      {group.label}
                    </div>
                    {items.map((item) => {
                      const active = itemIsActive(pathname, item.to);
                      const slug = item.to.split('/')[1];
                      const beta = PROJECTS.find((p) => p.slug === slug)?.beta;
                      return (
                        <button
                          key={item.to}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => navigate(item.to)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-medium transition-colors hover:bg-panel-2 ${
                            active ? 'text-ink' : 'text-muted'
                          }`}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {beta && <BetaTag />}
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-3 font-mono text-[11px] sm:flex lg:gap-4">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-faint">ETH</div>
              <div className="text-[12px] text-ink">
                <Value pending={pending} ch={6}>
                  {usd(ethUsd, 0)}
                </Value>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-faint">${ticker}</div>
              <div className="text-[12px] text-ink">
                <Value pending={pending} ch={8}>
                  {price(market.tokenPriceUsd)}
                </Value>
              </div>
            </div>
            {project?.kind !== 'token' && project?.kind !== 'cashflow' && project?.kind !== 'vault' && (
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-faint">Floor</div>
                <div className="text-[12px] text-ink">
                  <Value pending={pending} ch={6}>
                    {eth(market.nftFloorEth, 3)} Ξ
                  </Value>
                </div>
              </div>
            )}
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-faint md:flex">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? 'live-dot bg-accent' : 'bg-faint'
              }`}
            />
            {live ? 'LIVE' : 'SYNCING'}
          </span>
          <a
            href={CLOCK_IN_CARD_REF}
            target="_blank"
            rel="noreferrer"
            title="Trade Safe Launch with Savi's Clock In Card"
            className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
          >
            Clock In Card ↗
          </a>
          <a
            href={LAUNCHER_REF}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
          >
            Stonklauncher ↗
          </a>
        </div>
      </nav>
    </div>
  );
}

/** Project tab bar. Every tab is a real link, so each is refresh-safe. */
export function TabBar() {
  const { project } = useParams();
  const meta = PROJECTS.find((p) => p.slug === project);
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line pb-3 pt-4">
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
      {meta?.beta && (
        <span className="ml-auto shrink-0 pl-2">
          <BetaTag />
        </span>
      )}
    </div>
  );
}

/**
 * Bottom chrome: the same destinations as the title dropdown, as one-tap
 * buttons. The dropdown is the map; this is the shortcut between projects
 * after you have scrolled the page.
 *
 * Brand orange is the top rule only -- chrome, not a data mark.
 */
export function SiteFooter() {
  const { pathname } = useLocation();

  return (
    <footer className="mt-auto border-t border-brand/50 bg-panel/95">
      <nav
        aria-label="Quick navigation"
        className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-center gap-1.5 px-4 py-3 sm:px-6"
      >
        {NAV_ITEMS.map((item) => {
          const active = itemIsActive(pathname, item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'border-line bg-panel-2 text-ink'
                  : 'border-line text-muted hover:bg-panel-2 hover:text-ink'
              }`}
            >
              {item.label}
              {PROJECTS.find((p) => p.slug === item.to.split('/')[1])?.beta ? ' · beta' : ''}
            </NavLink>
          );
        })}
      </nav>
    </footer>
  );
}
