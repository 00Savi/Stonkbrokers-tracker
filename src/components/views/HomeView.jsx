import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECTS, projectPath } from '../../lib/routes';
import { BetaTag } from '../kit';

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
  mancer: 'logo.png',
  tickeryard: 'Yardkeepers.png',
  cardwall: 'wall.png',
};

export default function HomeView({ data }) {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState('');
  const [error, setError] = useState('');

  const goScan = (event) => {
    event.preventDefault();
    const wallets = parseWallets(wallet).filter(looksLikeAddress);
    if (!wallets.length) {
      setError('Paste at least one 0x wallet.');
      return;
    }
    setError('');
    navigate(`/portfolio?w=${encodeURIComponent(wallets.join(','))}`);
  };

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
    <div className="pb-16 pt-8 sm:pt-10">
      <header className="max-w-3xl">
        <p className="eyebrow text-muted">Savi&apos;s Dashboard</p>
        <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-ink sm:text-[42px] md:text-[48px] leading-[1.05]">
          See what your NFTs actually earn.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-[16px]">
          Track floor, yield, burns, and activations across Robinhood Chain projects. Scan a wallet
          or open a collection.
        </p>

        <form onSubmit={goScan} className="mt-7 flex max-w-2xl flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="home-wallet">
            Wallet address
          </label>
          <input
            id="home-wallet"
            type="text"
            value={wallet}
            onChange={(e) => {
              setWallet(e.target.value);
              if (error) setError('');
            }}
            placeholder="Paste a wallet (0x…)"
            autoComplete="off"
            spellCheck="false"
            className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 sm:shrink-0"
          >
            Scan wallet
          </button>
        </form>
        {error ? (
          <p className="mt-2 font-mono text-[12px] text-danger">{error}</p>
        ) : (
          <p className="mt-2 font-mono text-[11px] text-faint">
            Comma-separated wallets are fine. You can also skip the scan and pick a card below.
          </p>
        )}
      </header>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          to="/portfolio"
          className="card group flex flex-col p-5 transition-colors hover:bg-panel-2 sm:p-6"
        >
          <p className="eyebrow text-accent">Portfolio</p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">
            Your bags, one screen.
          </h2>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
            Multi-wallet. Historic ROI. 1Y / 3Y / 5Y / 10Y cash-flow.
          </p>
          <span className="mt-5 text-[13px] font-medium text-ink">
            Open tracker <span className="text-muted transition-colors group-hover:text-ink">→</span>
          </span>
        </Link>

        <Link
          to="/ecosystem"
          className="card group flex flex-col p-5 transition-colors hover:bg-panel-2 sm:p-6"
        >
          <p className="eyebrow text-mark-violet">Ecosystem</p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">The whole board.</h2>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
            Which protocols are printing, burning, and getting activated right now.
          </p>
          <span className="mt-5 flex items-center justify-between gap-3 text-[13px] font-medium text-ink">
            <span>
              Open board <span className="text-muted transition-colors group-hover:text-ink">→</span>
            </span>
            {updated && (
              <span className="font-mono text-[10px] font-normal text-faint">Ledger {updated}</span>
            )}
          </span>
        </Link>

        <section className="card flex flex-col p-5 sm:p-6">
          <p className="eyebrow text-mark-sky">Projects</p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">
            One collection, full depth.
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Tiers, revenue, LP, ownership, unit-level ROI.
          </p>
          <ul className="mt-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            {LIVE_PROJECTS.map((p) => {
              const logo = p.logo || data?.projects?.[p.key]?.config?.logo || FALLBACK_LOGO[p.key];
              return (
                <li key={p.key}>
                  <Link
                    to={projectPath(p.key)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-panel-2"
                  >
                    {logo ? (
                      <img
                        src={logo.startsWith('http') ? logo : `/${logo}`}
                        alt=""
                        className="h-6 w-6 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <span className="h-6 w-6 rounded-md border border-line bg-panel-2" />
                    )}
                    <span className="min-w-0 truncate">{p.name}</span>
                    {p.beta && <BetaTag />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
