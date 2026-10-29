import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NfaNote } from '../Disclaimer';
import { Card, Figure, KpiStrip, SkeletonCard, Stat, Tag, compactNum, compactUsd } from '../kit';
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
  if (!row.minted) return { label: 'Not minted', tone: 'plain' };
  if (row.dormant) return { label: 'Minted · dormant in this TBA', tone: 'warn' };
  return { label: 'Minted · released', tone: 'good' };
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

  const walletUsd = result ? result.wallet.reduce((sum, tok) => sum + (tok.nft ? 0 : Number(tok.usd) || 0), 0) : 0;
  const mintedCount = result ? result.interns.filter((row) => row.minted).length : 0;

  return (
    <div className="space-y-6 pt-4">
      <Card
        eyebrow="Broker scan"
        sub="Any StonkBroker ID. Shows the token-bound wallet and whether its two interns (V1 Sigma #N and V2 Divergent #N+4444) have been minted or released."
      >
        <form data-share-omit onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
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
            className="flex-1 rounded-xl border border-line bg-bg px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60 sm:shrink-0"
          >
            {busy ? 'Scanning…' : 'Scan broker'}
          </button>
        </form>
        {error ? (
          <p className="mt-3 font-mono text-[12px] text-danger">{error}</p>
        ) : (
          <p className="mt-3 font-mono text-[11px] text-faint">
            An intern id 4445–8888 also works — it resolves to the parent broker.
          </p>
        )}
      </Card>

      {busy && !result && <SkeletonCard rows={4} />}

      {result && (
        <div ref={resultRef} className="relative space-y-6">
          <Card
            eyebrow="StonkBroker"
            corner={(
              <div data-share-omit>
                <CopyControl
                  idleLabel="Copy"
                  title="Copy this broker scan for X"
                  className="bg-panel"
                  onCopy={() => copyElement(resultRef.current, { filename: `savi-broker-${result.brokerId}.png`, maxW: 1080 })}
                />
              </div>
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-line bg-bg">
                {result.imageUrl ? (
                  <img src={result.imageUrl} alt={`Broker #${result.brokerId}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-xs text-faint">#{result.brokerId}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Figure
                  value={`#${result.brokerId}`}
                  tone={result.activation.active ? 'accent' : 'ink'}
                  after={
                    result.activation.active
                      ? `Activated${result.activation.tier ? ` · ${result.activation.tier}` : ''}`
                      : 'Not activated'
                  }
                />
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <AddrRow label="Owner" addr={result.owner} />
                  <AddrRow label="TBA wallet" addr={result.tba} />
                </div>
              </div>
            </div>
            <KpiStrip className="mt-5 border-t border-line pt-4">
              <Stat
                label="Status"
                value={result.activation.active ? 'Activated' : 'Inactive'}
                tone={result.activation.active ? 'accent' : 'muted'}
                note={result.activation.tier || null}
              />
              <Stat label="Interns minted" value={`${mintedCount} / ${result.interns.length}`} />
              <Stat label="Wallet value" value={compactUsd(walletUsd)} note="priced tokens" />
              <Stat label="Assets" value={compactNum(result.wallet.length)} />
            </KpiStrip>
          </Card>

          <Card eyebrow="Interns" sub="Minted state is ownerOf on the intern collection.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {result.interns.map((row) => {
                const status = internStatus(row);
                return (
                  <div key={row.id} className="rounded-xl border border-line bg-panel-2 p-4">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-bg">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt={`${row.label} #${row.id}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center font-mono text-[10px] text-faint">#{row.id}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow text-faint">{row.label}</p>
                        <p className="num mt-1 text-[16px] text-ink">Intern #{row.id}</p>
                        <div className="mt-1.5">
                          <Tag tone={status.tone}>{status.label}</Tag>
                        </div>
                        {row.owner && (
                          <a
                            href={explorerAddressUrl(row.owner)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-block font-mono text-[11px] text-muted hover:text-ink"
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
          </Card>

          <Card flush eyebrow="Wallet contents" sub="Tracked tokens and collections held by the TBA.">
            {result.wallet.length === 0 ? (
              <p className="px-4 pb-5 text-[13px] text-muted sm:px-5">
                Nothing detected in this TBA among tracked tokens and collections.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead>
                    <tr className="eyebrow border-b border-line text-faint">
                      <th className="px-5 py-3 font-normal">Asset</th>
                      <th className="px-3 py-3 text-right font-normal">Amount</th>
                      <th className="px-5 py-3 text-right font-normal">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.wallet.map((tok) => (
                      <tr key={tok.contract} className="border-b border-line-soft">
                        <td className="px-5 py-3">
                          <div className="text-[13px] text-ink">{tok.symbol}</div>
                          <div className="font-mono text-[11px] text-faint">{tok.nft ? 'NFT' : tok.name}</div>
                        </td>
                        <td className="num px-3 py-3 text-right text-[13px] text-ink">
                          {tok.nft ? compactNum(tok.amount, 0) : compactNum(tok.amount, tok.amount >= 1 ? 2 : 4)}
                        </td>
                        <td className="num px-5 py-3 text-right text-[13px] text-ink">
                          {tok.nft ? '—' : compactUsd(tok.usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <NfaNote extra="Intern mint state is ownerOf on the intern collection: unminted, still sitting in the parent TBA (dormant), or released to another wallet." />
    </div>
  );
}

function AddrRow({ label, addr }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
      <p className="eyebrow text-faint">{label}</p>
      <a
        href={explorerAddressUrl(addr)}
        target="_blank"
        rel="noreferrer"
        className="num text-[12px] text-ink hover:text-accent"
      >
        {shortAddr(addr)}
      </a>
    </div>
  );
}
