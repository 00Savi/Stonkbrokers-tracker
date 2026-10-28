import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NfaNote } from '../Disclaimer';
import { compactNum, compactUsd } from '../kit';
import { explorerAddressUrl } from '../../lib/tba';
import { fetchNftImage } from '../../lib/portfolioHistory';
import {
  FLOOR_MAX,
  FLOOR_MIN,
  STONK_COLLECTION,
  loadFloorListings,
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

export default function FloorCheckView({ data }) {
  const [params, setParams] = useSearchParams();
  const count = parseFloorCount(params.get('n'));
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState(null);
  const [images, setImages] = useState({});

  const run = async (nextCount) => {
    setError('');
    setBusy(true);
    setRows(null);
    try {
      const listings = await loadFloorListings(data, nextCount);
      if (!listings.length) throw new Error('No OpenSea listings in the ledger yet.');
      setRows(await scanFloorListings(listings, data));
    } catch (err) {
      setRows(null);
      setError(err?.message || 'Floor check failed.');
    }
    setBusy(false);
  };

  useEffect(() => {
    if (!data) return undefined;
    let cancel = false;
    (async () => {
      setError('');
      setBusy(true);
      setRows(null);
      try {
        const listings = await loadFloorListings(data, count);
        if (!listings.length) throw new Error('No OpenSea listings in the ledger yet.');
        const next = await scanFloorListings(listings, data);
        if (!cancel) setRows(next);
      } catch (err) {
        if (!cancel) {
          setRows(null);
          setError(err?.message || 'Floor check failed.');
        }
      }
      if (!cancel) setBusy(false);
    })();
    return () => {
      cancel = true;
    };
  }, [data, count]);

  useEffect(() => {
    if (!rows?.length) return undefined;
    let cancel = false;
    const nftCa = rows[0].nftCa;
    Promise.all(rows.map(async (row) => [row.id, await fetchNftImage(nftCa, row.id).catch(() => '')]))
      .then((pairs) => {
        if (cancel) return;
        setImages(Object.fromEntries(pairs.filter(([, url]) => url)));
      });
    return () => {
      cancel = true;
    };
  }, [rows]);

  const setCount = (event) => {
    const next = new URLSearchParams(params);
    next.set('n', event.target.value);
    setParams(next, { replace: true });
  };

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-white">Floor checker</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            The cheapest StonkBroker listings on OpenSea. Purchase cost is the ask minus
            what that broker&apos;s wallet already holds. Tokens are at spot. NFTs are at the collection floor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="font-mono text-[11px] text-slate-500" htmlFor="floor-count">
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

      <p className="mb-4 font-mono text-[11px] text-slate-600">
        Asks come from{' '}
        <a
          href={`https://opensea.io/collection/${STONK_COLLECTION}?search[sortBy]=PRICE&search[sortAscending]=true`}
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 underline-offset-2 hover:text-white hover:underline"
        >
          {STONK_COLLECTION}
        </a>
        . A negative purchase cost means the wallet is worth more than the ask.
      </p>

      {error && <p className="mb-4 font-mono text-[12px] text-rose-400">{error}</p>}

      {busy && !rows && (
        <p className="rounded-xl border border-[#1e2228] bg-[#08090b] px-4 py-6 text-sm text-slate-400">
          Reading the cheapest {count} listings and their wallets…
        </p>
      )}

      {rows && (
        <div className="space-y-4">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-[#1e2228] bg-[#08090b] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#1e2228] bg-[#0e1013]">
                    {images[row.id] ? (
                      <img src={images[row.id]} alt={`Broker #${row.id}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-[10px] text-slate-600">#{row.id}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">StonkBroker</p>
                    <p className="text-2xl font-extrabold text-white">#{row.id}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
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
                <dl className="grid grid-cols-3 gap-2 lg:w-[28rem]">
                  <Stat label="Ask" value={askLabel(row)} sub={compactUsd(row.usd)} />
                  <Stat label="Wallet" value={compactUsd(row.walletUsd)} sub="contents" />
                  <Stat
                    label="Purchase cost"
                    value={compactUsd(row.purchaseUsd)}
                    sub="ask − wallet"
                    tone={row.purchaseUsd < 0 ? 'text-emerald-300' : 'text-white'}
                  />
                </dl>
              </div>

              <div className="mt-4">
                {row.wallet.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing detected in this wallet among tracked tokens and collections.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">In the wallet</th>
                          <th className="py-1 pr-3 font-medium text-right">Amount</th>
                          <th className="py-1 font-medium text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.wallet.map((tok) => (
                          <tr key={tok.contract} className="border-t border-[#1e2228]">
                            <td className="py-2 pr-3">
                              <span className="font-semibold text-white">{tok.symbol}</span>
                              <span className="ml-2 text-[11px] text-slate-500">
                                {tok.nft ? (tok.atFloor ? 'NFT at floor' : 'NFT, no floor') : tok.name}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right font-mono text-slate-200">
                              {tok.nft ? compactNum(tok.amount, 0) : compactNum(tok.amount, tok.amount >= 1 ? 2 : 4)}
                            </td>
                            <td className="py-2 text-right font-mono text-slate-200">
                              {tok.nft && !tok.atFloor ? '—' : compactUsd(tok.usd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {row.unpricedNfts && (
                  <p className="mt-2 font-mono text-[11px] text-slate-500">
                    An NFT without a floor is shown and not counted in the wallet value.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <NfaNote
        className="mt-8"
        extra="The ask is the OpenSea listing. The wallet is that NFT's token-bound account, read live. Purchase cost = ask − wallet value."
      />
    </div>
  );
}

function Stat({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-[#1e2228] bg-[#0e1013] px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 font-mono text-[13px] font-semibold ${tone}`}>{value}</dd>
      {sub && <p className="font-mono text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}
