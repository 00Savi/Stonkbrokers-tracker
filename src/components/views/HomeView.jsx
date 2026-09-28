import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECTS, projectPath } from '../../lib/routes';
import { parseBrokerId } from '../../lib/brokerScan';
import { NfaBanner } from '../Disclaimer';
import { BetaTag, compactNum } from '../kit';

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

export default function HomeView({ data }) {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const [error, setError] = useState('');
  const [brokerError, setBrokerError] = useState('');

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

  const goBroker = (event) => {
    event.preventDefault();
    const id = parseBrokerId(brokerId);
    if (!id) {
      setBrokerError('Enter a broker ID from 1 to 4444.');
      return;
    }
    setBrokerError('');
    navigate(`/broker?id=${id}`);
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
    <div className="pb-10 pt-8 sm:pt-10">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8 xl:gap-10">
        <div className="min-w-0">
          <header>
            <p className="eyebrow text-muted">Savi&apos;s Dashboard</p>
            <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-ink sm:text-[42px] md:text-[48px] leading-[1.05]">
              See what your NFTs actually earn.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted sm:text-[16px]">
              Track floor, yield, burns, and activations across Robinhood Chain projects. Scan a wallet
              or open a collection.
            </p>
            <NfaBanner className="mt-6" />
          </header>

          <div className="mt-7">
            <form onSubmit={goScan} className="flex flex-col gap-3 sm:flex-row">
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

          <form onSubmit={goBroker} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="home-broker">
              Broker ID
            </label>
            <input
              id="home-broker"
              type="text"
              inputMode="numeric"
              value={brokerId}
              onChange={(e) => {
                setBrokerId(e.target.value);
                if (brokerError) setBrokerError('');
              }}
              placeholder="Broker ID (1–4444)"
              autoComplete="off"
              className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl border border-line px-5 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-panel-2 sm:shrink-0"
            >
              Scan broker
            </button>
          </form>
          {brokerError ? (
            <p className="mt-2 font-mono text-[12px] text-danger">{brokerError}</p>
          ) : (
            <p className="mt-2 font-mono text-[11px] text-faint">
              Looks up that broker&apos;s TBA wallet and whether its interns have been minted.
            </p>
          )}
        </div>
        </div>

        <section
          aria-label="Projects"
          className="card flex w-full flex-col p-4 sm:p-5 lg:h-full"
        >
          <div className="flex items-baseline justify-between gap-3 px-1">
            <p className="eyebrow text-mark-sky">Projects</p>
            <p className="text-[12px] text-faint">Open a collection</p>
          </div>
          <ul className="mt-3 grid flex-1 grid-cols-2 content-center gap-2 lg:gap-3">
            {LIVE_PROJECTS.map((p) => {
              const logo = p.logo || data?.projects?.[p.key]?.config?.logo || FALLBACK_LOGO[p.key];
              return (
                <li key={p.key} className="min-h-0">
                  <Link
                    to={projectPath(p.key)}
                    className="flex h-full items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-[#2c323a] hover:bg-panel-2 lg:flex-col lg:justify-center lg:gap-2 lg:px-3 lg:py-4 lg:text-center"
                  >
                    {logo ? (
                      <img
                        src={logo.startsWith('http') ? logo : `/${logo}`}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg border border-line object-cover lg:h-11 lg:w-11 lg:rounded-xl"
                      />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-lg border border-line bg-panel-2 lg:h-11 lg:w-11 lg:rounded-xl" />
                    )}
                    <span className="flex min-w-0 items-center gap-1.5 lg:flex-col lg:gap-1">
                      <span className="min-w-0 truncate lg:text-[12px]">{p.name}</span>
                      {p.beta && <BetaTag />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          to="/broker"
          className="card group flex flex-col p-5 transition-colors hover:bg-panel-2 sm:p-6"
        >
          <p className="eyebrow text-[#60a5fa]">Broker</p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">
            One ID, its wallet.
          </h2>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
            TBA holdings plus whether Sigma and Divergent interns are minted or still dormant.
          </p>
          <span className="mt-5 text-[13px] font-medium text-ink">
            Open broker scan <span className="text-muted transition-colors group-hover:text-ink">→</span>
          </span>
        </Link>
        <Link
          to="/anvil"
          className="card group flex flex-col p-5 transition-colors hover:bg-panel-2 sm:p-6"
        >
          <p className="eyebrow text-[#fbbf24]">Anvil</p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">
            Vault NFTs, by wallet.
          </h2>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
            Every supported AMM. Lists the NFTs in the vault by what each token-bound wallet holds.
          </p>
          <span className="mt-5 text-[13px] font-medium text-ink">
            Open Anvil scan <span className="text-muted transition-colors group-hover:text-ink">→</span>
          </span>
        </Link>
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
            {data?.onboarding?.wallets > 0
              ? ` ${compactNum(data.onboarding.wallets)} wallets bought a cluster NFT or token in their first 10 txs.`
              : ''}
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
      </div>
    </div>
  );
}
