import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, KpiStrip, SkeletonCard, Stat, Tag, compactNum, compactUsd } from '../kit';
import { MethodologyCard, NfaNote } from '../Disclaimer';
import { explorerAddressUrl } from '../../lib/tba';
import { fetchNftImage } from '../../lib/portfolioHistory';
import {
  INTERN_FINDER_MAX,
  INTERN_FINDER_MIN,
  INTERN_FINDER_SORTS,
  findInterns,
  parseInternFinderLimit,
  rankInternRows,
} from '../../lib/internFinder';

function shortAddr(addr) {
  const a = String(addr || '');
  if (a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatDays(days) {
  if (days == null || !Number.isFinite(days)) return '—';
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${days.toFixed(0)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function holdingLine(row) {
  const top = (row.holdings || []).slice(0, 3);
  if (!top.length) return 'Empty TBA';
  return top.map((h) => {
    const amt = Number(h.amount) || 0;
    const shown = amt >= 1000 ? compactNum(amt) : amt >= 1 ? amt.toFixed(2) : amt.toFixed(4);
    return `${shown} ${h.symbol}`;
  }).join(' · ');
}

function Portrait({ row }) {
  const [url, setUrl] = useState(row.imageUrl || '');
  useEffect(() => {
    let live = true;
    if (row.imageUrl || !row.nftCa || !row.id) return undefined;
    fetchNftImage(row.nftCa, row.id).then((src) => {
      if (live && src) setUrl(src);
    }).catch(() => {});
    return () => { live = false; };
  }, [row.nftCa, row.id, row.imageUrl]);

  if (url) {
    return (
      <span className="inline-flex h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-bg">
        <img src={url} alt={`Intern #${row.id}`} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
      </span>
    );
  }
  return (
    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-panel-2 font-mono text-[11px] text-faint">
      #{row.id}
    </span>
  );
}

export default function InternFinderView({ data }) {
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [sort, setSort] = useState(params.get('sort') || 'opportunity');
  const [market, setMarket] = useState(params.get('market') || 'all');
  const [limit, setLimit] = useState(parseInternFinderLimit(params.get('n')));
  const [query, setQuery] = useState('');
  const runRef = useRef(0);

  const run = async () => {
    const id = ++runRef.current;
    setBusy(true);
    setError('');
    setProgress('Starting…');
    try {
      const next = await findInterns(data, {
        limit,
        includeOpenSea: market !== 'desk',
        includeDesk: market !== 'opensea',
        onProgress: (msg) => {
          if (runRef.current === id) setProgress(msg);
        },
        onPartial: (rows) => {
          if (runRef.current !== id) return;
          setResult({
            rows,
            openSeaCount: rows.length,
            deskCount: 0,
            fetchedAt: '',
            titleEngineLive: false,
            partial: true,
          });
        },
      });
      if (runRef.current !== id) return;
      setResult(next);
      setProgress('');
    } catch (err) {
      if (runRef.current !== id) return;
      setError(err?.message || 'Intern Finder failed.');
      setProgress('');
    }
    setBusy(false);
  };

  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('sort', sort);
    next.set('market', market);
    next.set('n', String(limit));
    setParams(next, { replace: true });
  }, [sort, market, limit]);

  const ranked = useMemo(() => {
    let rows = result?.rows || [];
    if (market === 'opensea') rows = rows.filter((r) => r.market === 'opensea');
    if (market === 'desk') rows = rows.filter((r) => r.market === 'desk');
    const q = query.trim().replace(/^#/, '');
    if (q) {
      rows = rows.filter((r) => (
        String(r.id).includes(q)
        || String(r.parentId || '').includes(q)
        || (r.label || '').toLowerCase().includes(q.toLowerCase())
      ));
    }
    return rankInternRows(rows, sort);
  }, [result, sort, market, query]);

  const kpis = useMemo(() => {
    const rows = ranked;
    if (!rows.length) return null;
    const best = rows[0];
    const below = rows.filter((r) => r.netCostUsd < 0).length;
    const withShare = rows.filter((r) => r.sharePct != null && r.sharePct > 0).length;
    const avgNet = rows.reduce((s, r) => s + (Number(r.netCostUsd) || 0), 0) / rows.length;
    return { best, below, withShare, avgNet, n: rows.length };
  }, [ranked]);

  return (
    <div className="space-y-6 pt-4">
      <Card
        eyebrow="Intern Finder"
        sub="OpenSea asks and Intern Exchange desks, ranked by cost versus opportunity. Each row shows the intern TBA, parent-broker tier and how long that parent has been activated, and the Clock In revenue share title when the title engine is live."
      >
        <form
          data-share-omit
          className="flex flex-col gap-3 lg:flex-row lg:items-end"
          onSubmit={(e) => { e.preventDefault(); run(); }}
        >
          <label className="block min-w-0 flex-1">
            <span className="eyebrow text-faint">Asks</span>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInternFinderLimit(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-[13px] text-ink"
            >
              {[10, 25, 50].filter((n) => n >= INTERN_FINDER_MIN && n <= INTERN_FINDER_MAX).map((n) => (
                <option key={n} value={n}>{n} cheapest OpenSea</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 flex-1">
            <span className="eyebrow text-faint">Market</span>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-[13px] text-ink"
            >
              <option value="all">OpenSea + desks</option>
              <option value="opensea">OpenSea only</option>
              <option value="desk">Desks only</option>
            </select>
          </label>
          <label className="block min-w-0 flex-1">
            <span className="eyebrow text-faint">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-[13px] text-ink"
            >
              {INTERN_FINDER_SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !data}
            className="rounded-lg border border-line bg-accent px-4 py-2 font-mono text-[12px] text-black disabled:opacity-50"
          >
            {busy ? 'Scanning…' : 'Find interns'}
          </button>
        </form>
        {progress ? <p className="mt-3 font-mono text-[12px] text-faint">{progress}</p> : null}
        {error ? <p className="mt-3 font-mono text-[12px] text-danger">{error}</p> : null}
      </Card>

      {busy && !result ? <SkeletonCard rows={6} /> : null}

      {kpis ? (
        <Card eyebrow="Board">
          <KpiStrip>
            <Stat label="Listed" value={String(kpis.n)} note={result?.partial ? 'OpenSea partial' : undefined} />
            <Stat
              label="Best net"
              value={compactUsd(kpis.best.netCostUsd)}
              tone={kpis.best.netCostUsd < 0 ? 'accent' : 'ink'}
              note={`#${kpis.best.id} · ${kpis.best.market}`}
            />
            <Stat label="Net &lt; 0" value={String(kpis.below)} note="TBA covers the ask" />
            <Stat
              label="Avg net"
              value={compactUsd(kpis.avgNet)}
              note={result?.titleEngineLive ? `${kpis.withShare} with share` : 'Title engine offline'}
            />
          </KpiStrip>
        </Card>
      ) : null}

      {result ? (
        <Card
          flush
          eyebrow="Results"
          sub="Opportunity blends TBA coverage, parent tier/age, and share % over net cost. Net cost is ask − TBA."
          corner={(
            <input
              data-share-omit
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter #id / parent"
              className="w-40 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-ink"
            />
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-4 py-3 font-normal">Intern</th>
                  <th className="px-3 py-3 font-normal">Market</th>
                  <th className="px-3 py-3 font-normal">Ask</th>
                  <th className="px-3 py-3 font-normal">TBA</th>
                  <th className="px-3 py-3 font-normal">Net</th>
                  <th className="px-3 py-3 font-normal">Share</th>
                  <th className="px-3 py-3 font-normal">Parent</th>
                  <th className="px-4 py-3 text-right font-normal">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => {
                  const osHref = row.market === 'opensea' && row.nftCa
                    ? `https://opensea.io/item/robinhood/${row.nftCa}/${row.id}`
                    : null;
                  return (
                    <tr key={`${row.market}-${row.id}`} className="border-b border-line-soft align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Portrait row={row} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="num text-[14px] text-ink">#{row.id}</span>
                              {row.label ? <Tag tone="plain">{row.label}</Tag> : null}
                              {row.selfActive ? <Tag tone="good">{row.selfTierName || 'Active'}</Tag> : null}
                            </div>
                            <p className="mt-1 truncate text-[11px] text-muted">{holdingLine(row)}</p>
                            {row.tba ? (
                              <a
                                href={explorerAddressUrl(row.tba)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-block font-mono text-[10px] text-faint hover:text-accent"
                              >
                                {shortAddr(row.tba)}
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Tag tone={row.market === 'desk' ? 'warn' : 'plain'}>
                          {row.market === 'desk' ? 'Desk' : 'OpenSea'}
                        </Tag>
                        {osHref ? (
                          <a href={osHref} target="_blank" rel="noreferrer" className="mt-2 block font-mono text-[10px] text-faint hover:text-accent">
                            OpenSea
                          </a>
                        ) : null}
                      </td>
                      <td className="num px-3 py-3 text-[13px] text-ink">
                        {compactUsd(row.askUsd)}
                        {row.ask > 0 && row.market === 'opensea' ? (
                          <span className="mt-1 block font-mono text-[10px] text-faint">{row.ask} {row.symbol}</span>
                        ) : null}
                      </td>
                      <td className="num px-3 py-3 text-[13px] text-ink">{compactUsd(row.tbaUsd)}</td>
                      <td className={`num px-3 py-3 text-[13px] ${row.netCostUsd < 0 ? 'text-accent' : 'text-ink'}`}>
                        {compactUsd(row.netCostUsd)}
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {row.sharePct != null ? (
                          <>
                            <span className="num text-ink">{row.sharePct}%</span>
                            {row.titleName ? <span className="mt-1 block text-[11px] text-muted">{row.titleName}</span> : null}
                          </>
                        ) : (
                          <span className="text-faint">{row.titleEngineLive ? '—' : 'Engine offline'}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {row.parentId ? (
                          <>
                            <Link to={`/broker?id=${row.parentId}`} className="num text-ink hover:text-accent">
                              #{row.parentId}
                            </Link>
                            <span className="mt-1 block text-[11px] text-muted">
                              {row.parentActive
                                ? `${row.parentTierName || row.parentTierId || 'Active'} · ${formatDays(row.parentDays)}`
                                : 'Parent off'}
                            </span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="num px-4 py-3 text-right text-[13px] text-ink">
                        {row.opportunity.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
                {!ranked.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-muted">
                      No interns match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <MethodologyCard>
        <p>
          <strong className="text-ink">Markets:</strong> OpenSea is the cheapest listed Interns asks (slug <code className="font-mono">interns</code>).
          Desks are NFTs sitting in the Intern Exchange / Anvil AMM — cost is the specific-buy quote (tokens + ETH fee), same as Anvil + Floor.
        </p>
        <p>
          <strong className="text-ink">TBA:</strong> Each intern’s token-bound wallet is priced with the same asset book as Anvil scan (ETH, protocol tokens, NFT floors).
          Net cost is ask − TBA. Negative net means the wallet already covers the ticket.
        </p>
        <p>
          <strong className="text-ink">Parent:</strong> Intern #N (Sigma) and #N+4444 (Divergent) attach to StonkBroker #N.
          Tier and active age come from the live activation manager plus the hourly snapshot timestamp.
        </p>
        <p>
          <strong className="text-ink">Share:</strong> Base pay titles are 0 / 0.5 / 1 / 2 / 2.5% of the parent broker’s Clock In (max 5% across both interns).
          The title engine CA is wired; when it has code the board reads title and share per intern. Until then share shows offline.
        </p>
        <p>
          <strong className="text-ink">Opportunity:</strong> Scores TBA coverage, parent tier weight, parent age (capped at a year), and share % over net cost.
          Re-sort by any single column metric from the control row.
        </p>
      </MethodologyCard>
      <NfaNote />
    </div>
  );
}
