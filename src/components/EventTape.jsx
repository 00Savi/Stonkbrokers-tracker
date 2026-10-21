import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agoLabel, chainHead, eventAgeSeconds, loadEventTape } from '../lib/eventTape';
import { fetchNftImage } from '../lib/portfolioHistory';
import { explorerTxUrl } from '../lib/tba';

const FILTERS = [
  ['all', 'All'],
  ['swap', 'Swaps'],
  ['activation', 'Activations'],
  ['deactivation', 'Deactivations'],
];

const LABEL = {
  'sold-in': 'Sold in',
  'bought-out': 'Bought out',
  activation: 'Activated',
  deactivation: 'Deactivated',
};

const BADGE = {
  'sold-in': 'bg-emerald-500/90 text-slate-950',
  'bought-out': 'bg-amber-400/90 text-slate-950',
  activation: 'bg-indigo-400/90 text-slate-950',
  deactivation: 'bg-rose-400/90 text-slate-950',
};

function matches(row, filter) {
  if (filter === 'swap') return row.kind === 'sold-in' || row.kind === 'bought-out';
  if (filter === 'activation' || filter === 'deactivation') return row.kind === filter;
  return true;
}

export function EventTape({ books }) {
  const key = (books || []).map((b) => b.slug).join(',');
  const booksRef = useRef(books);
  booksRef.current = books;
  const [rows, setRows] = useState([]);
  const [head, setHead] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [images, setImages] = useState({});

  useEffect(() => {
    const current = booksRef.current;
    if (!current?.length) return undefined;
    let stop = false;
    const ac = new AbortController();
    setRows([]);
    setLoaded(false);
    setImages({});

    async function run() {
      try {
        const [next, block] = await Promise.all([
          loadEventTape(booksRef.current, ac.signal),
          chainHead(ac.signal).catch(() => null),
        ]);
        if (stop) return;
        setRows(next);
        if (block) setHead(block);
      } catch (e) {
        if (ac.signal.aborted || stop) return;
      } finally {
        if (!stop) setLoaded(true);
      }
    }

    run();
    const timer = setInterval(run, 45_000);
    return () => {
      stop = true;
      ac.abort();
      clearInterval(timer);
    };
  }, [key]);

  useEffect(() => {
    if (!rows.length) return undefined;
    let stop = false;
    (async () => {
      for (let i = 0; i < rows.length; i += 4) {
        if (stop) return;
        const chunk = rows.slice(i, i + 4);
        const pics = await Promise.all(chunk.map((row) => (
          row.tokenId == null ? '' : fetchNftImage(row.nftCa, row.tokenId).catch(() => '')
        )));
        if (stop) return;
        setImages((prev) => {
          const next = { ...prev };
          chunk.forEach((row, j) => {
            if (pics[j]) next[row.imageKey] = pics[j];
          });
          return next;
        });
      }
    })();
    return () => {
      stop = true;
    };
  }, [rows]);

  const shown = useMemo(() => rows.filter((row) => matches(row, filter)), [rows, filter]);
  const many = (books || []).length > 1;

  if (!books?.length) return null;

  return (
    <div className="mb-6 bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6" data-share-omit>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">Latest moves</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Newest indexed events. Sold in and bought out are NFTs moving through the AMM vault. Activated and deactivated are the seat events. Times are read off the block. The row refreshes while this page is open.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
                filter === id
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-[#1e2228] text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!loaded ? (
        <p className="text-xs text-slate-500">Loading the latest moves…</p>
      ) : shown.length ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {shown.map((row) => {
            const age = agoLabel(eventAgeSeconds(row.block, head));
            const image = images[row.imageKey];
            return (
              <a
                key={row.id}
                href={explorerTxUrl(row.tx)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 w-36 bg-[#0e1013] border border-[#1e2228] rounded-xl p-2.5 flex flex-col text-left hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all"
              >
                <div className="w-full h-40 bg-[#08090b] rounded-lg overflow-hidden flex items-center justify-center relative">
                  {image ? (
                    <img src={image} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-500">#{row.tokenId}</span>
                  )}
                  <span className={`absolute top-1.5 right-1.5 font-black text-[9px] px-1.5 py-0.5 rounded ${BADGE[row.kind]}`}>
                    {LABEL[row.kind]}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold text-white">#{row.tokenId}</p>
                <p className="text-[10px] text-slate-500 mt-1 truncate">
                  {[many ? row.label : null, row.wallet || null, row.amount ? `${row.amount} tokens` : null].filter(Boolean).join(' · ') || LABEL[row.kind]}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">{age}</p>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No recent moves in this view.</p>
      )}
    </div>
  );
}
