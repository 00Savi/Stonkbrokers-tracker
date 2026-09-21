import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NfaNote } from '../Disclaimer';
import { compactNum, compactUsd } from '../kit';
import { CopyControl } from '../CopyControl';
import { copyElement } from '../../lib/share';
import { explorerAddressUrl } from '../../lib/tba';
import { parseBrokerId, scanBroker } from '../../lib/brokerScan';

function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function internStatus(row) {
  if (!row.minted) return { label: 'Not minted', tone: 'text-slate-400 border-[#1e2228]' };
  if (row.dormant) return { label: 'Minted · dormant in this TBA', tone: 'text-amber-300 border-amber-700/40' };
  return { label: 'Minted · released', tone: 'text-emerald-300 border-emerald-700/40' };
}

export default function BrokerScanView({ data }) {
  const [params, setParams] = useSearchParams();
  const urlId = params.get('id') || '';
  const [draft, setDraft] = useState(urlId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const scanned = useRef('');

  const run = async (raw) => {
    const id = parseBrokerId(raw);
    if (!id) {
      setError('Enter a broker ID from 1 to 4444.');
      setResult(null);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const next = await scanBroker(id, data);
      setResult(next);
      scanned.current = String(id);
    } catch (err) {
      setResult(null);
      setError(err?.message || 'Scan failed.');
    }
    setBusy(false);
  };

  const submit = (event) => {
    event.preventDefault();
    const id = parseBrokerId(draft);
    const next = new URLSearchParams(params);
    if (id) next.set('id', String(id));
    else next.delete('id');
    setParams(next, { replace: true });
    run(draft);
  };

  useEffect(() => {
    if (!data || !urlId) return;
    if (scanned.current === String(parseBrokerId(urlId) || '')) return;
    setDraft(urlId);
    run(urlId);
  }, [data, urlId]);

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-bold text-white">Broker scan</h2>
        <p className="text-xs text-slate-400 mt-1">
          Any StonkBroker ID. Shows the token-bound wallet and whether its two interns
          (V1 Sigma #N and V2 Divergent #N+4444) have been minted or released.
        </p>
      </div>

      <form data-share-omit onSubmit={submit} className="flex flex-col sm:flex-row gap-3 mb-6">
        <label className="sr-only" htmlFor="broker-id">Broker ID</label>
        <input
          id="broker-id"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          placeholder="Broker ID — 1 to 4444"
          autoComplete="off"
          className="flex-1 rounded-xl border border-[#1e2228] bg-[#08090b] px-4 py-3 text-[14px] text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-blue-500 px-5 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:shrink-0"
        >
          {busy ? 'Scanning…' : 'Scan broker'}
        </button>
      </form>
      {error ? (
        <p className="mb-4 font-mono text-[12px] text-rose-400">{error}</p>
      ) : (
        <p className="mb-4 font-mono text-[11px] text-slate-600">
          An intern id 4445–8888 also works — it resolves to the parent broker.
        </p>
      )}

      {result && (
        <div ref={resultRef} className="relative space-y-5">
          <div className="flex justify-end" data-share-omit>
            <CopyControl
              idleLabel="Copy"
              title="Copy this broker scan for X"
              className="bg-[#08090b]"
              onCopy={() => copyElement(resultRef.current, { filename: `savi-broker-${result.brokerId}.png`, maxW: 1080 })}
            />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-[#1e2228] bg-[#08090b]">
              {result.imageUrl ? (
                <img src={result.imageUrl} alt={`Broker #${result.brokerId}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center font-mono text-xs text-slate-600">#{result.brokerId}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">StonkBroker</p>
              <p className="text-3xl font-extrabold text-white">#{result.brokerId}</p>
              <p className={`mt-1 text-sm font-semibold ${result.activation.active ? 'text-emerald-300' : 'text-slate-400'}`}>
                {result.activation.active
                  ? `Activated${result.activation.tier ? ` · ${result.activation.tier}` : ''}`
                  : 'Not activated'}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <AddrRow label="Owner" addr={result.owner} />
                <AddrRow label="TBA wallet" addr={result.tba} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-3">Interns</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {result.interns.map((row) => {
                const status = internStatus(row);
                return (
                  <div key={row.id} className={`rounded-xl border bg-[#08090b] p-4 ${status.tone}`}>
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#1e2228] bg-[#0e1013]">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt={`${row.label} #${row.id}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center font-mono text-[10px] text-slate-600">#{row.id}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">{row.label}</p>
                        <p className="text-lg font-extrabold text-white">Intern #{row.id}</p>
                        <p className={`mt-1 text-xs font-semibold ${status.tone.split(' ')[0]}`}>{status.label}</p>
                        {row.owner && (
                          <a
                            href={explorerAddressUrl(row.owner)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block font-mono text-[11px] text-slate-400 hover:text-white"
                          >
                            {shortAddr(row.owner)}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-3">Wallet contents</h3>
            {result.wallet.length === 0 ? (
              <p className="rounded-xl border border-[#1e2228] bg-[#08090b] px-4 py-6 text-sm text-slate-500">
                Nothing detected in this TBA among tracked tokens and collections.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#1e2228]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#08090b] text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Asset</th>
                      <th className="px-4 py-2 font-medium text-right">Amount</th>
                      <th className="px-4 py-2 font-medium text-right">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.wallet.map((tok) => (
                      <tr key={tok.contract} className="border-t border-[#1e2228]">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-white">{tok.symbol}</div>
                          <div className="text-[11px] text-slate-500">{tok.nft ? 'NFT' : tok.name}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-200">
                          {tok.nft ? compactNum(tok.amount, 0) : compactNum(tok.amount, tok.amount >= 1 ? 2 : 4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-200">
                          {tok.nft ? '—' : compactUsd(tok.usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <NfaNote className="mt-8" extra="Intern mint state is ownerOf on the intern collection: unminted, still sitting in the parent TBA (dormant), or released to another wallet." />
    </div>
  );
}

function AddrRow({ label, addr }) {
  return (
    <div className="rounded-lg border border-[#1e2228] bg-[#08090b] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <a
        href={explorerAddressUrl(addr)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[12px] text-slate-200 hover:text-white"
      >
        {shortAddr(addr)}
      </a>
    </div>
  );
}
