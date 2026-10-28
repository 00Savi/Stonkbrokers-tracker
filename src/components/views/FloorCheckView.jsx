import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NfaNote } from '../Disclaimer';
import { compactNum, compactUsd } from '../kit';
import { explorerAddressUrl } from '../../lib/tba';
import {
  FLOOR_MAX,
  FLOOR_MIN,
  STONK_COLLECTION,
  internStateLabel,
  loadFloorBook,
  parseFloorCount,
  scanFloorListings,
} from '../../lib/floorCheck';

function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function askLabel(row) {
  const n = Number(row.ask);
  if (!Number.isFinite(n)) return '—';
  const digits = n >= 1 ? 2 : 4;
  const text = n.toLocaleString('en-US', { maximumFractionDigits: digits });
  return row.symbol ? `${text} ${row.symbol}` : text;
}

function openseaUrl(row) {
  return `https://opensea.io/item/robinhood/${row.nftCa}/${row.id}`;
}

function sweepClock(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function FloorCheckView({ data }) {
  const [params, setParams] = useSearchParams();
  const count = parseFloorCount(params.get('n'));
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState(null);
  const [live, setLive] = useState(true);
  const [fetchedAt, setFetchedAt] = useState('');
  const [openWallets, setOpenWallets] = useState({});
  const dataRef = useRef(data);
  dataRef.current = data;
  const armed = !!data;

  const run = async (nextCount) => {
    const source = dataRef.current;
    if (!source) return;
    setError('');
    setBusy(true);
    try {
      const book = await loadFloorBook(source, nextCount);
      setLive(book.live);
      setFetchedAt(book.fetchedAt || '');
      setRows(await scanFloorListings(book.listings, source, book.floors));
      setOpenWallets({});
    } catch (err) {
      setError(err?.message || 'Floor check failed.');
    }
    setBusy(false);
  };

  useEffect(() => {
    const source = dataRef.current;
    if (!source) return undefined;
    let cancel = false;
    (async () => {
      setError('');
      setBusy(true);
      try {
        const book = await loadFloorBook(source, count);
        const next = await scanFloorListings(book.listings, source, book.floors);
        if (!cancel) {
          setLive(book.live);
          setFetchedAt(book.fetchedAt || '');
          setRows(next);
          setOpenWallets({});
        }
      } catch (err) {
        if (!cancel) setError(err?.message || 'Floor check failed.');
      }
      if (!cancel) setBusy(false);
    })();
    return () => {
      cancel = true;
    };
  }, [armed, count]);

  const setCount = (event) => {
    const next = new URLSearchParams(params);
    next.set('n', event.target.value);
    setParams(next, { replace: true });
  };

  const clock = sweepClock(fetchedAt);
  const openSeaBook = `https://opensea.io/collection/${STONK_COLLECTION}?search[sortBy]=PRICE&search[sortAscending]=true`;

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-lg md:text-xl font-bold text-white">Floor checker</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Cheapest listed StonkBrokers. Purchase cost is the floor minus the wallet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-mono text-[11px] uppercase tracking-wider text-slate-500" htmlFor="floor-count">
            Listings
          </label>
          <select
            id="floor-count"
            value={String(count)}
            onChange={setCount}
            className="rounded-xl border border-[#1e2228] bg-[#08090b] px-3 py-2 text-[13px] text-white focus:border-blue-500 focus:outline-none"
          >
            {Array.from({ length: FLOOR_MAX - FLOOR_MIN + 1 }, (_, i) => FLOOR_MIN + i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => run(count)}
            disabled={busy}
            className="rounded-xl bg-blue-500 px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Sweeping…' : 'Sweep again'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${live ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {live ? 'Live sweep' : 'Hourly ledger'}
          {clock ? ` · ${clock}` : ''}
        </span>
        <a href={openSeaBook} target="_blank" rel="noreferrer" className="rounded-full border border-[#1e2228] px-2.5 py-1 text-slate-400 hover:text-white">
          {STONK_COLLECTION}
        </a>
      </div>

      {error && <p className="mb-4 font-mono text-[12px] text-rose-400">{error}</p>}

      {busy && !rows && (
        <div className="space-y-3">
          {Array.from({ length: Math.min(count, 4) }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-[#1e2228] bg-[#08090b]" />
          ))}
        </div>
      )}

      {rows && (
        <div className={`space-y-3 ${busy ? 'opacity-60' : ''}`}>
          {rows.map((row) => {
            const open = !!openWallets[row.id];
            const cheap = row.purchaseUsd < 0;
            return (
              <article key={row.id} className="rounded-2xl border border-[#1e2228] bg-[#08090b] p-3 sm:p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                  <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                    <Portrait src={row.imageUrl} alt={`Broker #${row.id}`} label={`#${row.id}`} size="lg" />
                    <div className="min-w-0 pt-1">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">StonkBroker</p>
                      <p className="text-3xl font-extrabold leading-none tracking-tight text-white">#{row.id}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                        <Link to={`/broker?id=${row.id}`} className="text-slate-300 underline-offset-2 hover:text-white hover:underline">
                          Broker scan
                        </Link>
                        <a href={openseaUrl(row)} target="_blank" rel="noreferrer" className="text-slate-300 underline-offset-2 hover:text-white hover:underline">
                          OpenSea
                        </a>
                        {row.tba && (
                          <a href={explorerAddressUrl(row.tba)} target="_blank" rel="noreferrer" className="font-mono text-slate-500 hover:text-white">
                            {shortAddr(row.tba)}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="xl:w-[26rem]">
                    <div className={`rounded-2xl border px-4 py-3 text-right ${cheap ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#1e2228] bg-[#0e1013]'}`}>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Purchase cost</p>
                      <p className={`mt-1 font-mono text-2xl font-semibold tracking-tight ${cheap ? 'text-emerald-300' : 'text-white'}`}>
                        {compactUsd(row.purchaseUsd)}
                      </p>
                      <p className="font-mono text-[10px] text-slate-500">floor − wallet</p>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 overflow-hidden rounded-xl border border-[#1e2228] bg-[#1e2228]">
                      <Stat label="Floor" value={row.floorEth ? `${Number(row.floorEth).toFixed(3)} ETH` : '—'} sub={compactUsd(row.floorUsd)} />
                      <Stat label="Listing" value={askLabel(row)} sub={compactUsd(row.usd)} />
                      <Stat label="Wallet" value={compactUsd(row.walletUsd)} sub="contents" />
                    </dl>
                  </div>
                </div>

                {row.interns?.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {row.interns.map((intern) => (
                      <div key={intern.id} className="flex items-center gap-2.5 rounded-xl bg-[#0e1013] px-2.5 py-2">
                        <Portrait src={intern.imageUrl} alt={`${intern.label} #${intern.id}`} label={`#${intern.id}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {intern.label}
                            <span className="ml-1.5 font-mono text-[11px] font-normal text-slate-500">#{intern.id}</span>
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${internPill(intern.state)}`}>
                              {internStateLabel(intern.state)}
                            </span>
                            {intern.inWallet && <span className="text-[10px] text-slate-500">in this wallet</span>}
                          </p>
                        </div>
                        <p className="font-mono text-[13px] text-slate-200">{intern.inWallet ? compactUsd(intern.usd) : '—'}</p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenWallets((cur) => ({ ...cur, [row.id]: !cur[row.id] }))}
                  className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#1e2228] px-3 py-2 text-left text-[12px] text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
                >
                  <span>In the wallet</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider">{open ? 'Hide' : 'Show'}</span>
                </button>
                {open && row.wallet.length === 0 && !(row.interns || []).some((intern) => intern.inWallet) ? (
                  <p className="mt-2 text-sm text-slate-500">Nothing detected in this wallet among tracked tokens and collections.</p>
                ) : null}
                {open && (row.wallet.length > 0 || (row.interns || []).some((intern) => intern.inWallet)) ? (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-[#1e2228]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#0e1013] text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Asset</th>
                          <th className="px-3 py-2 font-medium text-right">Amount</th>
                          <th className="px-3 py-2 font-medium text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(row.interns || []).filter((intern) => intern.inWallet).map((intern) => (
                          <tr key={`intern-${intern.id}`} className="border-t border-[#1e2228]">
                            <td className="px-3 py-2">
                              <span className="font-semibold text-white">{intern.label}</span>
                              <span className="ml-2 text-[11px] text-slate-500">#{intern.id} · {internStateLabel(intern.state)}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-200">1</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-200">{compactUsd(intern.usd)}</td>
                          </tr>
                        ))}
                        {row.wallet.map((tok) => (
                          <tr key={tok.contract} className="border-t border-[#1e2228]">
                            <td className="px-3 py-2">
                              <span className="font-semibold text-white">{tok.symbol}</span>
                              <span className="ml-2 text-[11px] text-slate-500">
                                {tok.nft ? (tok.atFloor ? 'NFT at floor' : 'NFT, no floor') : tok.name}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-200">
                              {tok.nft ? compactNum(tok.amount, 0) : compactNum(tok.amount, tok.amount >= 1 ? 2 : 4)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-200">
                              {tok.nft && !tok.atFloor ? '—' : compactUsd(tok.usd)}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-[#1e2228] bg-[#0e1013]">
                          <td className="px-3 py-2 font-semibold text-white" colSpan={2}>Wallet total</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-white">{compactUsd(row.walletUsd)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {row.unpricedNfts && (
                      <p className="px-3 py-2 font-mono text-[11px] text-slate-500">
                        An NFT without a floor is shown and not counted in the wallet value.
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <NfaNote
        className="mt-8"
        extra="The floor is the cost of the StonkBroker NFT. The listing is the OpenSea ask. The wallet is that NFT's token-bound account, read on this sweep. Purchase cost = floor − wallet value."
      />
    </div>
  );
}

function internPill(state) {
  if (state === 'available') return 'bg-emerald-500/15 text-emerald-300';
  if (state === 'activated') return 'bg-sky-500/15 text-sky-300';
  if (state === 'dormant') return 'bg-amber-500/15 text-amber-300';
  return 'bg-white/5 text-slate-500';
}

function Portrait({ src, alt, label, size = 'sm' }) {
  const box = size === 'lg' ? 'h-24 w-24 sm:h-28 sm:w-28 rounded-2xl' : 'h-11 w-11 rounded-lg';
  return (
    <div className={`shrink-0 overflow-hidden border border-white/10 bg-[#0e1013] ${box}`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-[10px] text-slate-600">{label}</div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-[#0e1013] px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[13px] font-semibold text-white">{value}</dd>
      {sub && <p className="truncate font-mono text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}
