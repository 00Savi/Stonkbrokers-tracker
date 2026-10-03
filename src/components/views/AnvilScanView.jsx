import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { compactNum, compactUsd } from '../kit';
import { explorerAddressUrl } from '../../lib/tba';
import { fetchNftImage } from '../../lib/portfolioHistory';
import { ANVIL_VAULTS, SCAN_INCLUDE, anvilVaultById, rankVaultRows, scanAnvilVault, snipeCostFor } from '../../lib/anvilScan';

const SCAN_PARTS = [
  { id: 'tokens', label: 'Anvil tokens' },
  { id: 'nfts', label: 'Anvil NFTs' },
  { id: 'stars', label: 'Wall stars' },
  { id: 'interns', label: 'Interns' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'memes', label: 'Memes' },
];

const INTERN_MARK = { sigma: 'Σ', divergent: 'Δ' };
const INTERN_LABEL = { canActivate: 'can activate', activated: 'activated', dormant: 'dormant' };

function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatAmount(holding) {
  const n = Number(holding.amount) || 0;
  if (holding.nft) return compactNum(n);
  if (n >= 1000) return compactNum(n);
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function starMarks(stars) {
  const n = Number(stars);
  if (!(n >= 1 && n <= 5)) return '';
  return '★'.repeat(n);
}

function holdingText(holding, compact) {
  const base = `${formatAmount(holding)} ${holding.symbol}`;
  if (!holding.pieces?.length) return base;
  const bits = holding.pieces.map((piece) => {
    const stars = starMarks(piece.stars);
    const priced = piece.floorEth > 0 ? ` ${Number(piece.floorEth).toFixed(3)}` : '';
    return compact ? `${stars}${priced}` : `#${piece.tokenId} ${stars}${priced}`;
  });
  const shown = compact ? bits.slice(0, 3) : bits;
  const extra = compact && bits.length > 3 ? ` +${bits.length - 3}` : '';
  return `${base} · ${shown.join(', ')}${extra}`;
}

function formatEth(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
  return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: digits })} ETH`;
}

function formatSnipe(cost, unit) {
  if (!cost) return '—';
  return unit === 'eth' ? formatEth(cost.eth) : compactUsd(cost.usd);
}

function formatNet(tbaUsd, cost, unit) {
  if (!cost) return '—';
  const netUsd = (Number(tbaUsd) || 0) - cost.usd;
  if (unit === 'eth') return formatEth(netUsd / cost.ethUsd);
  return compactUsd(netUsd);
}

function netTone(tbaUsd, cost) {
  if (!cost) return 'text-slate-500';
  const net = (Number(tbaUsd) || 0) - cost.usd;
  if (net > 0) return 'text-emerald-300';
  if (net < 0) return 'text-rose-300';
  return 'text-slate-300';
}

function costTitle(cost) {
  if (!cost) return '';
  return `${Math.round(cost.tokens).toLocaleString('en-US')} ${cost.ticker} + ${formatEth(cost.ethLeg)}`;
}

function holdingLine(row) {
  const top = (row.holdings || []).slice(0, 3);
  if (!top.length) return 'Empty';
  return top.map((h) => holdingText(h, true)).join(' · ');
}

export default function AnvilScanView({ data }) {
  const [params, setParams] = useSearchParams();
  const urlProject = params.get('project') || 'stonk';
  const initial = anvilVaultById(urlProject) ? urlProject : 'stonk';
  const [projectId, setProjectId] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [sort, setSort] = useState('value');
  const [fundedOnly, setFundedOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [steps, setSteps] = useState([]);
  const [include, setInclude] = useState(SCAN_INCLUDE);
  const [scannedInclude, setScannedInclude] = useState(SCAN_INCLUDE);
  const [costUnit, setCostUnit] = useState('usd');
  const runRef = useRef(0);

  const run = async (id, parts) => {
    const ticket = ++runRef.current;
    setError('');
    setBusy(true);
    setProgress('Connecting to Robinhood Chain…');
    setSteps([]);
    setScannedInclude(parts);
    setResult(null);
    setOpenId(null);
    const controller = new AbortController();
    runRef.controller?.abort();
    runRef.controller = controller;
    try {
      const next = await scanAnvilVault(id, data, {
        include: parts,
        signal: controller.signal,
        onProgress: ({ label }) => {
          if (ticket !== runRef.current) return;
          setProgress(label);
        },
        onPlan: (plan) => {
          if (ticket !== runRef.current) return;
          setSteps(plan.map((step) => ({ ...step, status: 'wait' })));
        },
        onStep: ({ id, status }) => {
          if (ticket !== runRef.current) return;
          setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, status } : step)));
        },
        onPartial: (rows, vaultBalance, snipe) => {
          if (ticket !== runRef.current) return;
          setResult({
            vault: anvilVaultById(id),
            vaultBalance,
            rows,
            snipe,
            partial: true,
          });
        },
      });
      if (ticket !== runRef.current) return;
      setResult({ ...next, partial: false });
      setProgress('Scan complete');
    } catch (err) {
      if (ticket !== runRef.current || err?.name === 'AbortError') return;
      setError(err?.shortMessage || err?.message || 'Scan failed.');
      setProgress('');
    }
    if (ticket === runRef.current) setBusy(false);
  };

  const submit = (event) => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    next.set('project', projectId);
    setParams(next, { replace: true });
    run(projectId, include);
  };

  const rows = useMemo(() => {
    const q = query.trim().replace(/^#/, '');
    let list = result?.rows || [];
    if (fundedOnly) {
      list = list.filter((row) => row.usd > 0 || row.nftCount > 0 || (row.interns || []).length > 0);
    }
    if (q) list = list.filter((row) => String(row.tokenId).includes(q));
    return rankVaultRows(list, sort);
  }, [result, fundedOnly, query, sort]);

  const showInterns = scannedInclude.interns && result?.vault?.id === 'stonk';
  const cost = useMemo(
    () => snipeCostFor(data, result?.vault, result?.snipe),
    [data, result],
  );
  const colSpan = (showInterns ? 5 : 4) + 2;

  const totals = useMemo(() => {
    const all = result?.rows || [];
    return {
      nfts: result?.vaultBalance ?? all.length,
      funded: all.filter((row) => row.usd > 0 || row.nftCount > 0 || (row.interns || []).length > 0).length,
      usd: all.reduce((sum, row) => sum + (row.usd || 0), 0),
    };
  }, [result]);

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl">
      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-bold text-white">Anvil scan</h2>
        <p className="text-xs text-slate-400 mt-1">
          NFTs sitting in a project&apos;s AMM vault, listed by the value in each token-bound wallet.
          The dollar figure is ETH, Anvil tokens, each Wall at its own star floor, then stocks, then memes.
          A dormant intern still in an activated broker&apos;s wallet is added at the Intern OpenSea floor.
          The picture is that vault NFT, so you can pick the one you want. It loads as the row scrolls into view.
          Uncheck stocks or memes when you want the vault pass to finish sooner.
        </p>
      </div>

      <form data-share-omit onSubmit={submit} className="flex flex-col sm:flex-row gap-3 mb-4">
        <label className="sr-only" htmlFor="anvil-project">Project</label>
        <select
          id="anvil-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="flex-1 rounded-xl border border-[#1e2228] bg-[#08090b] px-4 py-3 text-[14px] text-white focus:border-blue-500 focus:outline-none"
        >
          {ANVIL_VAULTS.map((vault) => (
            <option key={vault.id} value={vault.id}>{vault.name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !data}
          className="rounded-xl bg-blue-500 px-5 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:shrink-0"
        >
          {busy ? 'Scanning…' : 'Scan vault'}
        </button>
      </form>

      <fieldset data-share-omit className="mb-4">
        <legend className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Include in this scan</legend>
        <div className="flex flex-wrap gap-2">
          {SCAN_PARTS.map((part) => (
            <IncludeToggle
              key={part.id}
              checked={!!include[part.id]}
              onChange={() => setInclude((prev) => ({ ...prev, [part.id]: !prev[part.id] }))}
            >
              {part.label}
            </IncludeToggle>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Interns are the two companions of a StonkBroker. Uncheck Wall stars to price every Wall at the collection floor. Uncheck stocks to skip the long tail.
        </p>
      </fieldset>

      {steps.length > 0 && <ScanChecklist steps={steps} label={progress} />}
      {error ? (
        <p className="mb-4 font-mono text-[12px] text-rose-400">{error}</p>
      ) : steps.length === 0 ? (
        <p className="mb-4 font-mono text-[11px] text-slate-600">
          Pick a project and scan its AMM. Stocks are priced before memes, and each one checks off as it finishes.
        </p>
      ) : null}

      {result && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="NFTs in the vault" value={compactNum(totals.nfts)} />
            <Tile label="Wallets with a balance" value={compactNum(totals.funded)} />
            <Tile label="Priced TBA value" value={compactUsd(totals.usd)} />
          </div>

          <div data-share-omit className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by token id"
              className="rounded-xl border border-[#1e2228] bg-[#08090b] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none sm:w-48"
            />
            <div className="flex flex-wrap gap-2">
              <SortButton active={sort === 'value'} onClick={() => setSort('value')}>Value</SortButton>
              <SortButton active={sort === 'id'} onClick={() => setSort('id')}>Token id</SortButton>
              <SortButton active={fundedOnly} onClick={() => setFundedOnly((v) => !v)}>
                {fundedOnly ? 'With a balance' : 'Every NFT'}
              </SortButton>
              <SortButton active={costUnit === 'usd'} onClick={() => setCostUnit('usd')}>USD</SortButton>
              <SortButton active={costUnit === 'eth'} onClick={() => setCostUnit('eth')}>ETH</SortButton>
            </div>
            {result.partial && (
              <span className="font-mono text-[10px] text-slate-500">Still pricing</span>
            )}
          </div>
          {cost && (
            <p className="mb-3 text-[11px] text-slate-500">
              Snipe cost is {Math.round(cost.tokens).toLocaleString('en-US')} {cost.ticker} plus {cost.feeBps / 100}% in ETH.
              Net is the TBA value minus that cost.
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-[#1e2228]">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-[#12151a] text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">NFT</th>
                    <th className="px-3 py-2 font-medium">TBA value</th>
                    {showInterns && <th className="px-3 py-2 font-medium">Interns</th>}
                    <th className="px-3 py-2 font-medium">In the wallet</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-3 py-6 text-center text-slate-500">
                        {fundedOnly ? 'No vault NFT has a priced balance yet.' : 'This vault has no NFTs.'}
                      </td>
                    </tr>
                  ) : rows.map((row, i) => (
                    <React.Fragment key={row.tokenId}>
                      <tr
                        className="cursor-pointer border-t border-[#1e2228] hover:bg-[#12151a]"
                        onClick={() => setOpenId(openId === row.tokenId ? null : row.tokenId)}
                      >
                        <td className="px-3 py-2 font-mono text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <VaultThumb nftCa={result.vault?.nftCa} tokenId={row.tokenId} name={result.vault?.name} />
                            <span className="font-semibold text-white">#{row.tokenId}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-emerald-300">{row.usd > 0 ? compactUsd(row.usd) : '—'}</td>
                        {showInterns && (
                          <td className="px-3 py-2">
                            <InternCell interns={row.interns} />
                          </td>
                        )}
                        <td className="px-3 py-2 text-slate-300">
                          <span>{holdingLine(row)}</span>
                          <a
                            href={explorerAddressUrl(row.tba)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-2 font-mono text-[11px] text-slate-500 hover:text-white"
                          >
                            {shortAddr(row.tba)}
                          </a>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200" title={costTitle(cost)}>
                          {formatSnipe(cost, costUnit)}
                        </td>
                        <td className={`px-3 py-2 font-mono ${netTone(row.usd, cost)}`} title={costTitle(cost)}>
                          {formatNet(row.usd, cost, costUnit)}
                        </td>
                      </tr>
                      {openId === row.tokenId && (
                        <tr className="border-t border-[#1e2228] bg-[#08090b]">
                          <td colSpan={colSpan} className="px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row">
                            <VaultThumb nftCa={result.vault?.nftCa} tokenId={row.tokenId} name={result.vault?.name} size="lg" eager />
                            <div className="min-w-0 flex-1">
                            {showInterns && (row.interns || []).length > 0 && (
                              <ul className="mb-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                                {row.interns.map((intern) => (
                                  <li key={intern.id} className="flex items-baseline justify-between gap-3 text-xs">
                                    <span className={internTone(intern.state)}>
                                      {INTERN_MARK[intern.klass] || 'Intern'} #{intern.id} · {INTERN_LABEL[intern.state] || intern.state}
                                    </span>
                                    <span className="font-mono text-slate-500">{intern.usd > 0 ? compactUsd(intern.usd) : 'not in total'}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {row.holdings.length === 0 ? (
                              (row.interns || []).length > 0 ? null : (
                                <p className="text-xs text-slate-500">Nothing priced in this wallet.</p>
                              )
                            ) : (
                              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                {row.holdings.map((h) => (
                                  <li key={`${h.contract}-${h.symbol}`} className="flex items-baseline justify-between gap-3 text-xs">
                                    <span className="text-slate-300">{holdingText(h, false)}</span>
                                    <span className="font-mono text-slate-500">{h.usd > 0 ? compactUsd(h.usd) : 'unpriced'}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScanChecklist({ steps, label }) {
  const done = steps.filter((step) => step.status === 'done').length;
  const pct = steps.length ? (done / steps.length) * 100 : 0;
  const groups = [];
  for (const step of steps) {
    const name = step.group || 'Scan';
    let bucket = groups.find((group) => group.name === name);
    if (!bucket) {
      bucket = { name, steps: [] };
      groups.push(bucket);
    }
    bucket.steps.push(step);
  }

  return (
    <div className="mb-4 rounded-xl border border-[#1e2228] bg-[#08090b] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-slate-300">{label || 'Scanning'}</p>
        <p className="font-mono text-[11px] text-slate-400">{done} / {steps.length}</p>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#1e2228]">
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{group.name}</p>
            <div className="flex flex-wrap gap-1">
              {group.steps.map((step) => (
                <StepChip key={step.id} step={step} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepChip({ step }) {
  const done = step.status === 'done';
  const running = step.status === 'run';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${
        done
          ? 'border-emerald-700/60 text-emerald-300'
          : running
            ? 'border-blue-500/50 text-blue-200'
            : 'border-[#1e2228] text-slate-500'
      }`}
    >
      <span
        className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border text-[8px] ${
          done ? 'border-emerald-400 bg-emerald-400 text-[#04140c]' : 'border-current'
        }`}
        aria-hidden="true"
      >
        {done ? '✓' : ''}
      </span>
      {step.label}
    </span>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded-xl border border-[#1e2228] bg-[#08090b] px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-white">{value}</p>
    </div>
  );
}

const pictureCache = new Map();
const pictureWait = new Map();
const pictureQueue = [];
let pictureActive = 0;
const PICTURE_POOL = 4;
const pictureSeen = new WeakMap();
let pictureObserver = null;

function drainPictures() {
  while (pictureActive < PICTURE_POOL && pictureQueue.length) {
    const job = pictureQueue.shift();
    pictureActive += 1;
    Promise.resolve()
      .then(job)
      .finally(() => {
        pictureActive -= 1;
        drainPictures();
      });
  }
}

function loadVaultPicture(nftCa, tokenId) {
  const key = `${String(nftCa || '').toLowerCase()}:${tokenId}`;
  if (pictureCache.has(key)) return Promise.resolve(pictureCache.get(key));
  if (pictureWait.has(key)) return pictureWait.get(key);
  const pending = new Promise((resolve) => {
    pictureQueue.push(async () => {
      if (pictureCache.has(key)) {
        resolve(pictureCache.get(key));
        return;
      }
      const url = (await fetchNftImage(nftCa, tokenId)) || '';
      pictureCache.set(key, url);
      resolve(url);
    });
    drainPictures();
  }).finally(() => pictureWait.delete(key));
  pictureWait.set(key, pending);
  return pending;
}

function watchPicture(el, onVisible) {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => {};
  }
  if (!pictureObserver) {
    pictureObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const fn = pictureSeen.get(entry.target);
        pictureObserver.unobserve(entry.target);
        pictureSeen.delete(entry.target);
        fn?.();
      }
    }, { rootMargin: '160px' });
  }
  pictureSeen.set(el, onVisible);
  pictureObserver.observe(el);
  return () => {
    pictureObserver.unobserve(el);
    pictureSeen.delete(el);
  };
}

function VaultThumb({ nftCa, tokenId, name, size = 'sm', eager = false }) {
  const key = `${String(nftCa || '').toLowerCase()}:${tokenId}`;
  const cached = pictureCache.get(key);
  const [src, setSrc] = useState(cached || '');
  const [miss, setMiss] = useState(cached === '');
  const ref = useRef(null);

  useEffect(() => {
    if (!nftCa || tokenId == null) return undefined;
    const hit = pictureCache.get(key);
    if (hit) {
      setSrc(hit);
      setMiss(false);
      return undefined;
    }
    if (hit === '') {
      setSrc('');
      setMiss(true);
      return undefined;
    }
    let cancel = false;
    const apply = (url) => {
      if (cancel) return;
      setSrc(url || '');
      setMiss(!url);
    };
    if (eager) {
      loadVaultPicture(nftCa, tokenId).then(apply);
      return () => { cancel = true; };
    }
    const el = ref.current;
    if (!el) return undefined;
    const stop = watchPicture(el, () => {
      loadVaultPicture(nftCa, tokenId).then(apply);
    });
    return () => {
      cancel = true;
      stop();
    };
  }, [key, nftCa, tokenId, eager]);

  const box = size === 'lg' ? 'h-28 w-28 rounded-2xl' : 'h-12 w-12 rounded-lg';
  return (
    <span ref={ref} className={`inline-flex shrink-0 overflow-hidden border border-[#1e2228] bg-[#08090b] ${box}`}>
      {src ? (
        <img
          src={src}
          alt={`${name || 'NFT'} #${tokenId}`}
          className="h-full w-full object-cover"
          onError={() => {
            pictureCache.set(key, '');
            setSrc('');
            setMiss(true);
          }}
        />
      ) : miss ? (
        <span className="flex h-full w-full items-center justify-center px-1 text-center font-mono text-[9px] leading-tight text-slate-600">
          #{tokenId}
        </span>
      ) : null}
    </span>
  );
}

function InternCell({ interns }) {
  const shown = interns || [];
  if (!shown.length) return <span className="text-slate-600">—</span>;
  return (
    <span className="flex flex-col gap-0.5 text-[12px] leading-tight">
      {shown.map((intern) => (
        <span key={intern.id} className={internTone(intern.state)}>
          {INTERN_MARK[intern.klass] || 'Intern'} {INTERN_LABEL[intern.state] || intern.state}
        </span>
      ))}
    </span>
  );
}

function internTone(state) {
  if (state === 'canActivate') return 'text-emerald-300';
  if (state === 'activated') return 'text-sky-300';
  return 'text-amber-300';
}

function IncludeToggle({ checked, onChange, children }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold ${
        checked ? 'border-blue-500/50 text-white' : 'border-[#1e2228] text-slate-500'
      }`}
    >
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px] ${
          checked ? 'border-blue-400 bg-blue-500 text-white' : 'border-current'
        }`}
        aria-hidden="true"
      >
        {checked ? '✓' : ''}
      </span>
      {children}
    </button>
  );
}

function SortButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${
        active ? 'border-blue-500/50 text-white' : 'border-[#1e2228] text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}
