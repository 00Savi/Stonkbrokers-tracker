import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECTS, projectPath } from '../../lib/routes';
import { parseBrokerId } from '../../lib/brokerScan';
import { SAVI_X } from '../../lib/share';
import { NfaBanner } from '../Disclaimer';
import { NavIcon } from '../Shell';
import { BetaTag, compactNum, compactUsd, MiniSpark } from '../kit';
import { boardUsd, protocolFeeSeries, revenueRows } from '../../lib/seats';
import { PROJECT_COLORS } from '../../lib/charts';

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

function projectFees30d(project) {
  if (!project || project.underConstruction) return 0;
  return boardUsd(revenueRows(project, '30d'));
}

function toolCards(data) {
  const stonk = data?.projects?.stonk;
  const floorEth = Number(stonk?.market?.nftFloorEth) || 0;
  const circulating = Number(stonk?.ownership?.circulatingSupply) || Number(stonk?.activation?.activeCount) || 0;
  const live = LIVE_PROJECTS.filter((meta) => {
    const p = data?.projects?.[meta.key];
    return p && !p.underConstruction;
  }).length;
  const fees30 = LIVE_PROJECTS.reduce((sum, meta) => sum + projectFees30d(data?.projects?.[meta.key]), 0);

  return [
    {
      to: '/portfolio',
      icon: 'chart',
      eyebrow: 'Portfolio',
      title: 'Your bags',
      text: 'Wallets, historic ROI, and forward cash-flow.',
      tone: 'text-accent',
      signal: live > 0 ? `${live} live books` : 'Paste a wallet',
    },
    {
      to: '/anvil?project=stonk',
      icon: 'anvil',
      eyebrow: 'Anvil + Floor',
      title: 'Cheapest way in',
      text: 'Listings and snipes, net of the wallet you receive.',
      tone: 'text-mark-amber',
      signal: floorEth > 0 ? `Floor ${floorEth.toFixed(2)} ETH` : 'Scan the vault',
    },
    {
      to: '/broker',
      icon: 'search',
      eyebrow: 'Broker',
      title: 'One ID',
      text: 'The token-bound wallet, and whether its interns are minted.',
      tone: 'text-mark-sky',
      signal: circulating > 0 ? `${compactNum(circulating)} circulating` : 'ID 1–4444',
    },
    {
      to: '/ecosystem',
      icon: 'system',
      eyebrow: 'Ecosystem',
      title: 'The board',
      text: 'Which projects are earning, burning, and activating.',
      tone: 'text-mark-violet',
      signal: fees30 > 0 ? `${compactUsd(fees30)} fees 30d` : 'Open the board',
    },
  ];
}

function projectRows(data) {
  return LIVE_PROJECTS.map((meta) => {
    const project = data?.projects?.[meta.key];
    const fees = projectFees30d(project);
    const series = protocolFeeSeries(project);
    const spark = (series.data || []).slice(-30);
    return {
      meta,
      project,
      fees,
      spark,
      under: !project || project.underConstruction,
    };
  }).sort((a, b) => {
    // Blank / soon books (Mutual Fun, Oakmont, …) sit under the earners.
    const aBlank = a.under || !(a.fees > 0);
    const bBlank = b.under || !(b.fees > 0);
    if (aBlank !== bBlank) return aBlank ? 1 : -1;
    return b.fees - a.fees;
  });
}

export default function HomeView({ data }) {
  const navigate = useNavigate();
  const [lookup, setLookup] = useState('');
  const [error, setError] = useState('');
  const [lookedUp, setLookedUp] = useState(false);

  const goLookup = (event) => {
    event.preventDefault();
    const parts = parseWallets(lookup);
    if (parts.length && parts.every(looksLikeAddress)) {
      setError('');
      setLookedUp(true);
      navigate(`/portfolio?w=${encodeURIComponent(parts.join(','))}`);
      return;
    }
    const id = parts.length === 1 ? parseBrokerId(parts[0]) : null;
    if (id) {
      setError('');
      setLookedUp(true);
      navigate(`/broker?id=${id}`);
      return;
    }
    setError('Paste a 0x wallet, or a broker ID from 1 to 4444.');
  };

  const tools = useMemo(() => toolCards(data), [data]);
  const rows = useMemo(() => projectRows(data), [data]);
  const leader = rows.find((r) => !r.under && r.fees > 0);
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
      <div className="home-hero-band mx-auto flex max-w-5xl items-center gap-3 px-1 sm:gap-5">
        <span className="home-hero-rail home-hero-rail-left hidden min-w-8 flex-1 sm:block" aria-hidden="true" />
        <header className="home-hero-copy min-w-0 max-w-3xl flex-none text-center sm:px-1">
          <p className="eyebrow text-muted">Savi&apos;s public dashboard</p>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[52px] md:text-[60px]">
            StonkBrokers Ecosystem Analytics
            <span className="mt-3 block text-[22px] font-medium leading-snug text-muted sm:text-[28px] md:text-[32px]">
              No trackers. No wallet connects. Just data.
            </span>
          </h1>
        </header>
        <span className="home-hero-rail home-hero-rail-right hidden min-w-8 flex-1 sm:block" aria-hidden="true" />
      </div>

      <form onSubmit={goLookup} className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch">
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
        <div className="flex gap-2 sm:shrink-0">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 sm:flex-none"
          >
            Look up
          </button>
          <a
            href={SAVI_X}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-[color:var(--color-brand)]/55 px-4 py-3 text-[13px] font-semibold text-[color:var(--color-brand)] transition-colors hover:border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand)]/10 sm:flex-none"
          >
            Follow @savicrypto
          </a>
        </div>
      </form>
      {error ? (
        <p className="mt-2 text-center font-mono text-[12px] text-danger">{error}</p>
      ) : (
        <p className="mt-2 text-center font-mono text-[11px] text-faint">
          <a
            href={SAVI_X}
            target="_blank"
            rel="noreferrer"
            className={lookedUp
              ? 'text-[color:var(--color-brand)] hover:underline'
              : 'text-muted hover:text-[color:var(--color-brand)] hover:underline'}
          >
            Follow for daily data &amp; updates
          </a>
          {' · '}
          A 0x wallet opens the portfolio. A number opens that broker.
          {updated ? ` Ledger ${updated}.` : ''}
        </p>
      )}

      <section className="mt-14" aria-label="Tools">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow text-muted">Tools</h2>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tools.map((tool) => (
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
                <span className="mt-4 flex items-end justify-between gap-3">
                  <span className="home-tool-signal font-mono text-[11px] text-faint">{tool.signal}</span>
                  <span className="text-[13px] font-medium text-ink">
                    Open <span className="text-muted transition-colors group-hover:text-ink">→</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-label="Projects">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow text-mark-sky">Projects</h2>
          <p className="text-[12px] text-faint">Trailing 30d protocol cash</p>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map(({ meta, fees, spark, under }, index) => {
            const logo = meta.logo || data?.projects?.[meta.key]?.config?.logo || FALLBACK_LOGO[meta.key];
            const lead = !under && index === 0 && fees > 0;
            const mark = PROJECT_COLORS[meta.key] || 'var(--color-mark-green)';
            return (
              <li key={meta.key}>
                <Link
                  to={projectPath(meta.key)}
                  className={`flex items-center gap-3 rounded-xl border bg-panel px-3 py-3 transition-colors hover:border-[#2c323a] hover:bg-panel-2 ${
                    lead ? 'home-project-lead border-[color:var(--color-brand)]/35' : 'border-line'
                  }`}
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
                  {!under && spark?.length > 1 ? (
                    <MiniSpark data={spark} color={mark} className="hidden sm:block" />
                  ) : null}
                  <span className="shrink-0 text-right">
                    <span className="num block text-[16px] leading-none text-ink">
                      {under || !(fees > 0) ? '—' : compactUsd(fees)}
                    </span>
                    <span className="mt-1 block text-[10px] uppercase tracking-wider text-faint">
                      {under ? 'Soon' : '30d cash'}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10" aria-label="Go deeper">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow text-muted">Go deeper</h2>
          {leader ? (
            <p className="text-[12px] text-faint">
              {leader.meta.name} leads at {compactUsd(leader.fees)}
            </p>
          ) : null}
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <li>
            <Link
              to="/portfolio"
              className="flex h-full flex-col rounded-xl border border-line bg-panel px-4 py-4 transition-colors hover:border-[#2c323a] hover:bg-panel-2"
            >
              <span className="eyebrow text-accent">Portfolio</span>
              <span className="mt-2 text-[15px] font-semibold text-ink">Paste a wallet</span>
              <span className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Historic ROI and forward cash-flow across every live book.
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/anvil?project=stonk"
              className="flex h-full flex-col rounded-xl border border-line bg-panel px-4 py-4 transition-colors hover:border-[#2c323a] hover:bg-panel-2"
            >
              <span className="eyebrow text-mark-amber">Anvil + Floor</span>
              <span className="mt-2 text-[15px] font-semibold text-ink">Cheapest way in</span>
              <span className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Rank listings and snipes net of the wallet you receive.
              </span>
            </Link>
          </li>
          <li>
            <Link
              to={leader ? projectPath(leader.meta.key) : '/ecosystem'}
              className="flex h-full flex-col rounded-xl border border-line bg-panel px-4 py-4 transition-colors hover:border-[#2c323a] hover:bg-panel-2"
            >
              <span className="eyebrow text-mark-violet">{leader ? leader.meta.name : 'Ecosystem'}</span>
              <span className="mt-2 text-[15px] font-semibold text-ink">
                {leader ? 'Open the leader' : 'Open the board'}
              </span>
              <span className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {leader
                  ? `Trailing 30d cash ${compactUsd(leader.fees)}. Charts, seats, and methodology.`
                  : 'Compare fees, seats, and holder breadth across the chain.'}
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <NfaBanner className="mt-10" />
    </div>
  );
}
