import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECTS, projectPath } from '../../lib/routes';
import { parseBrokerId } from '../../lib/brokerScan';
import { NfaBanner } from '../Disclaimer';
import { NavIcon } from '../Shell';
import { BetaTag, compactUsd, pct } from '../kit';
import { listedSeat } from '../../lib/seats';

function parseWallets(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeAddress(s) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

const LIVE_PROJECTS = PROJECTS.filter((p) => p.live !== false);

const FALLBACK_LOGO = {
  stonk: 'Stonkbroker.png',
  interns: 'Intern.svg',
  mancer: 'logo.png',
  tickeryard: 'Yardkeepers.png',
  cardwall: 'wall.png',
  nightshades: 'Knight.png',
};

const TOOLS = [
  {
    to: '/portfolio',
    icon: 'chart',
    eyebrow: 'Portfolio',
    title: 'Your bags',
    text: 'Wallets, historic ROI, and forward cash-flow.',
    tone: 'text-accent',
  },
  {
    to: '/anvil?project=stonk',
    icon: 'anvil',
    eyebrow: 'Anvil + Floor',
    title: 'Cheapest way in',
    text: 'Listings and snipes, net of the wallet you receive.',
    tone: 'text-[#fbbf24]',
  },
  {
    to: '/broker',
    icon: 'search',
    eyebrow: 'Broker',
    title: 'One ID',
    text: 'The token-bound wallet, and whether its interns are minted.',
    tone: 'text-[#60a5fa]',
  },
  {
    to: '/ecosystem',
    icon: 'system',
    eyebrow: 'Ecosystem',
    title: 'The board',
    text: 'Which projects are earning, burning, and activating.',
    tone: 'text-mark-violet',
  },
];

function seatRows(data) {
  return LIVE_PROJECTS.map((meta) => {
    const project = data?.projects?.[meta.key];
    if (!project || project.underConstruction) return { meta, seat: null };
    return { meta, seat: listedSeat(meta, project) };
  });
}

function seatFigure(seat) {
  if (!seat) return { value: '—', label: '' };
  if (seat.roi > 0) return { value: pct(seat.roi), label: 'Cash-on-cash' };
  if (seat.listed > 0) return { value: compactUsd(seat.listed), label: 'Seat cost' };
  return { value: '—', label: '' };
}

export default function HomeView({ data }) {
  const navigate = useNavigate();
  const [lookup, setLookup] = useState('');
  const [error, setError] = useState('');

  const goLookup = (event) => {
    event.preventDefault();
    const parts = parseWallets(lookup);
    if (parts.length && parts.every(looksLikeAddress)) {
      setError('');
      navigate(`/portfolio?w=${encodeURIComponent(parts.join(','))}`);
      return;
    }
    const id = parts.length === 1 ? parseBrokerId(parts[0]) : null;
    if (id) {
      setError('');
      navigate(`/broker?id=${id}`);
      return;
    }
    setError('Paste a 0x wallet, or a broker ID from 1 to 4444.');
  };

  const rows = seatRows(data);
  const updated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    : null;

  return (
    <div className="pb-10 pt-10 sm:pt-14">
      <header className="mx-auto max-w-3xl text-center">
        <p className="eyebrow text-muted">Savi&apos;s public dashboard</p>
        <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[52px] md:text-[60px]">
          StonkBrokers Ecosystem Analytics
          <span className="mt-3 block text-[22px] font-medium leading-snug text-muted sm:text-[28px] md:text-[32px]">
            No trackers. No wallet connects. Just data.
          </span>
        </h1>
      </header>

      <form onSubmit={goLookup} className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="home-lookup">
          Wallet or broker ID
        </label>
        <input
          id="home-lookup"
          type="text"
          value={lookup}
          onChange={(e) => {
            setLookup(e.target.value);
            if (error) setError('');
          }}
          placeholder="Wallet or broker ID"
          autoComplete="off"
          spellCheck="false"
          className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 sm:shrink-0"
        >
          Look up
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-center font-mono text-[12px] text-danger">{error}</p>
      ) : (
        <p className="mt-2 text-center font-mono text-[11px] text-faint">
          A 0x wallet opens the portfolio. A number opens that broker.
          {updated ? ` Ledger ${updated}.` : ''}
        </p>
      )}

      <section className="mt-14" aria-label="Tools">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow text-muted">Tools</h2>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TOOLS.map((tool) => (
            <li key={tool.to}>
              <Link
                to={tool.to}
                className="card group relative flex h-full flex-col p-4 transition-colors hover:bg-panel-2 sm:p-5"
              >
                <span className={`absolute right-4 top-4 block h-5 w-5 sm:right-5 sm:top-5 ${tool.tone}`}>
                  <NavIcon name={tool.icon} />
                </span>
                <p className={`eyebrow pr-8 ${tool.tone}`}>{tool.eyebrow}</p>
                <h3 className="mt-2 text-[18px] font-semibold tracking-tight text-ink">{tool.title}</h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">{tool.text}</p>
                <span className="mt-4 text-[13px] font-medium text-ink">
                  Open <span className="text-muted transition-colors group-hover:text-ink">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-label="Projects">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow text-mark-sky">Projects</h2>
          <p className="text-[12px] text-faint">Listed seat, trailing yield</p>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map(({ meta, seat }) => {
            const logo = meta.logo || data?.projects?.[meta.key]?.config?.logo || FALLBACK_LOGO[meta.key];
            const figure = seatFigure(seat);
            return (
              <li key={meta.key}>
                <Link
                  to={projectPath(meta.key)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-3 transition-colors hover:border-[#2c323a] hover:bg-panel-2"
                >
                  {logo ? (
                    <img
                      src={logo.startsWith('http') ? logo : `/${logo}`}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
                      style={String(logo).endsWith('.png') && String(logo).includes('Mutual') ? { imageRendering: 'pixelated' } : undefined}
                    />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-lg border border-line bg-panel-2" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium text-ink">{meta.name}</span>
                      {meta.beta && <BetaTag />}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-faint">{meta.ticker}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[16px] leading-none text-ink">{figure.value}</span>
                    {figure.label ? (
                      <span className="mt-1 block text-[10px] uppercase tracking-wider text-faint">{figure.label}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <NfaBanner className="mt-10" />
    </div>
  );
}
