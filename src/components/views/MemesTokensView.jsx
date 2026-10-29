import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { Card, KpiStrip, SkeletonCard, Stat, Tag, compactNum, compactUsd } from '../kit';
import { NfaNote } from '../Disclaimer';

const MANCER_ORIGIN = 'https://mancer.xyz';
const MANCER_SCRIPT = `${MANCER_ORIGIN}/embed.js`;
const SWAP_HEIGHT = 480;
const CHART_HEIGHT = 420;

let embedLoader;

function loadMancerEmbed() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.MancerEmbed) return Promise.resolve(window.MancerEmbed);
  if (embedLoader) return embedLoader;
  embedLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MANCER_SCRIPT;
    s.async = true;
    s.onload = () => {
      if (window.MancerEmbed) resolve(window.MancerEmbed);
      else reject(new Error('MancerEmbed missing after load'));
    };
    s.onerror = () => {
      embedLoader = null;
      reject(new Error('failed to load mancer embed.js'));
    };
    document.head.appendChild(s);
  });
  return embedLoader;
}

function mancerEmbedUrl(buy) {
  const q = new URLSearchParams({ spend: 'ETH', buy });
  return `${MANCER_ORIGIN}/embed?${q}`;
}

function MancerTradeCard({ buy, height, onHeight }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !buy) return undefined;

    let destroyed = false;
    let handle;

    loadMancerEmbed()
      .then((api) => {
        if (destroyed || !hostRef.current) return;
        handle = api.mount(hostRef.current, {
          spend: 'ETH',
          buy,
          height: SWAP_HEIGHT,
          onResize: (next) => {
            if (typeof onHeight === 'function') onHeight(next);
          },
        });
      })
      .catch(() => {
        if (destroyed || !hostRef.current) return;
        const iframe = document.createElement('iframe');
        iframe.src = mancerEmbedUrl(buy);
        iframe.title = 'Mancer swap';
        iframe.allow = 'clipboard-read; clipboard-write';
        iframe.style.cssText = `display:block;width:100%;border:0;height:${SWAP_HEIGHT}px;color-scheme:dark`;
        hostRef.current.appendChild(iframe);
      });

    return () => {
      destroyed = true;
      if (handle) handle.destroy();
      else if (host) host.replaceChildren();
    };
  }, [buy, onHeight]);

  return <div ref={hostRef} className="w-full" style={{ minHeight: height || SWAP_HEIGHT }} />;
}

function rowKey(token, i) {
  return token.ca || `name:${token.name || i}`;
}

function SwapDock({ token, stocks, sticky, onDockHeight }) {
  const [paneH, setPaneH] = useState(SWAP_HEIGHT);
  const dockRef = useRef(null);
  const name = token?.name || 'token';

  useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (typeof onDockHeight === 'function') onDockHeight(el.offsetHeight);
    });
    ro.observe(el);
    if (typeof onDockHeight === 'function') onDockHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [onDockHeight, token?.ca, stocks]);

  return (
    <aside className={`w-full max-w-[400px] mx-auto lg:max-w-none lg:w-full lg:self-start ${sticky ? 'lg:sticky lg:top-20' : ''}`}>
      <div ref={dockRef} className="rounded-xl border border-accent/40 bg-bg overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-panel">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black">
              Swap
            </span>
            <p className="text-xs text-ink font-medium truncate">
              ETH <span className="text-faint font-normal">→</span> {name}
            </p>
          </div>
        </div>
        {stocks && (
          <p className="px-3 py-2 text-[11px] leading-snug text-warn border-b border-line">
            US / restricted regions cannot quote tokenized stocks.
          </p>
        )}
        {token?.ca ? (
          <MancerTradeCard buy={token.ca} height={paneH} onHeight={setPaneH} />
        ) : (
          <div className="flex items-center justify-center text-faint text-[13px]" style={{ height: SWAP_HEIGHT }}>
            Swap unavailable.
          </div>
        )}
      </div>
    </aside>
  );
}

function ChartPane({ token, height }) {
  const h = height || CHART_HEIGHT;
  return (
    <div className="rounded-xl overflow-hidden border border-line bg-bg">
      {token.ca ? (
        <iframe
          src={`https://dexscreener.com/robinhood/${token.ca}?embed=1&theme=dark&trades=0&info=0`}
          className="w-full border-0"
          style={{ height: h }}
          title={`${token.name} Chart`}
        />
      ) : (
        <div className="flex items-center justify-center text-faint text-[13px]" style={{ height: h }}>
          Chart unavailable (no contract address).
        </div>
      )}
    </div>
  );
}

function MarketsTabs({ stocks }) {
  const tab = 'flex-1 min-w-[6rem] px-3 py-2 text-xs font-semibold rounded-lg text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const on = 'bg-accent text-black';
  const off = 'text-muted hover:text-ink hover:bg-panel-2';
  return (
    <div className="flex flex-wrap gap-1 border-b border-line pb-3">
      <NavLink to="/tokens" className={`${tab} no-underline ${stocks ? off : on}`}>Tokens</NavLink>
      <NavLink to="/stocks" className={`${tab} no-underline ${stocks ? on : off}`}>Stocks</NavLink>
    </div>
  );
}

function UsStockWarning() {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 p-4">
      <p className="eyebrow text-warn">US / restricted-region warning</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Tokenized stocks on Mancer are <strong className="text-ink">not offered for trading in the United States</strong> and other restricted regions.
        Charts stay open everywhere. If you are in a restricted region the swap card will refuse stock-pair quotes — that is Mancer’s rule, not a chart outage.
      </p>
    </div>
  );
}

export default function MemesTokensView({ data, type }) {
  const { pathname } = useLocation();
  const isStocks = type === 'stocks' || (!type && pathname.startsWith('/stocks'));
  const tokensList = isStocks ? (data?.stocks || []) : (data?.memes || []);

  const [selectedCa, setSelectedCa] = useState(null);
  const [expandedCa, setExpandedCa] = useState(null);
  const [dockH, setDockH] = useState(SWAP_HEIGHT);
  const [sortCol, setSortCol] = useState('volume24h');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    setSelectedCa(null);
    setExpandedCa(null);
  }, [isStocks]);

  const formatCurrency = compactUsd;

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortedTokens = [...tokensList].sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (typeof valA === 'string') return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return sortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  const swapToken = sortedTokens.find((t) => t.ca && t.ca === selectedCa) || sortedTokens.find((t) => t.ca) || null;
  const expandedToken = sortedTokens.find((t, i) => rowKey(t, i) === expandedCa) || null;
  const displayTokens = expandedToken
    ? [expandedToken, ...sortedTokens.filter((t) => t !== expandedToken)]
    : sortedTokens;

  const totalVolume = tokensList.reduce((sum, t) => sum + (Number(t.volume24h) || 0), 0);
  const totalLiquidity = tokensList.reduce((sum, t) => sum + (Number(t.liquidity) || 0), 0);
  const th = 'pb-3 pt-1 font-normal cursor-pointer select-none hover:text-accent';

  return (
    <div className="space-y-6 pt-4">
      <Card
        eyebrow="Markets & Swap"
        sub="Open a token to pin it next to the swap. Close the row to restore the list order. The candle and the swap are live Mancer trading, not the tracker ledger."
      >
        <MarketsTabs stocks={isStocks} />
        <KpiStrip className="mt-4">
          <Stat label={isStocks ? 'Stocks' : 'Tokens'} value={compactNum(tokensList.length)} pending={!data} />
          <Stat label="Volume 24h" value={formatCurrency(totalVolume)} pending={!data} ch={7} />
          <Stat label="Liquidity" value={formatCurrency(totalLiquidity)} pending={!data} ch={7} />
        </KpiStrip>
        <NfaNote className="mt-4" />
      </Card>
      {isStocks && <UsStockWarning />}

      {!data ? (
        <SkeletonCard rows={5} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        <div className="min-w-0 order-2 lg:order-1 space-y-3">
          {expandedToken && <ChartPane token={expandedToken} height={dockH} />}
          <Card flush>
          <div className="overflow-x-auto pb-2">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className={`${th} pl-5`} onClick={() => handleSort('name')}>Token Name ↕</th>
                  <th className={th} onClick={() => handleSort('volume24h')}>Volume (24h) ↕</th>
                  <th className={th} onClick={() => handleSort('liquidity')}>Liquidity ↕</th>
                  <th className={th} onClick={() => handleSort('priceChange24h')}>24h % Change ↕</th>
                  <th className={th} onClick={() => handleSort('roi')}>ROI ↕</th>
                  <th className={th} onClick={() => handleSort('fdv')}>FDV ↕</th>
                  <th className={th} onClick={() => handleSort('marketCap')}>Market Cap ↕</th>
                  <th className={`${th} text-right pr-5`} onClick={() => handleSort('burnt')}>Burnt ↕</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {displayTokens.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-muted">
                      {isStocks ? 'No tokenized stocks tracked yet.' : 'No tokens tracked yet.'}
                    </td>
                  </tr>
                )}
                {displayTokens.map((token, index) => {
                  const roiColor = (token.priceChange24h || 0) >= 0 ? 'text-accent' : 'text-danger';
                  const roiSign = (token.priceChange24h || 0) >= 0 ? '+' : '';
                  const totalSupply = token.totalSupply || 1000000000;
                  const burntPct = token.burnt > 0 ? ((token.burnt / totalSupply) * 100).toFixed(2) + '%' : '0.00%';
                  const key = rowKey(token, index);
                  const isSelected = swapToken?.ca && token.ca === swapToken.ca;
                  const isExpanded = expandedCa === key || (!!token.ca && expandedCa === token.ca);

                  return (
                    <React.Fragment key={token.ca || key}>
                      <tr
                        onClick={() => {
                          if (token.ca) setSelectedCa(token.ca);
                          setExpandedCa(isExpanded ? null : (token.ca || key));
                        }}
                        className={`border-b border-line-soft transition-colors hover:bg-panel-2 cursor-pointer group ${
                          isSelected ? 'bg-accent/10' : isExpanded ? 'bg-panel-2' : ''
                        }`}
                      >
                        <td className="py-3.5 pl-5 text-ink">
                          <div className="flex items-center justify-between pr-4 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-mark-green'}`}></div>
                              <span className="truncate font-medium">{token.name}</span>
                              {isSelected && <Tag tone="good">swap</Tag>}
                            </div>
                            {token.ca ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(token.ca);
                                  alert(`Copied CA for ${token.name}:\n${token.ca}`);
                                }}
                                className="shrink-0 rounded border border-line bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                Copy CA
                              </button>
                            ) : (
                              <span className="shrink-0 font-mono text-[10px] text-faint">No CA</span>
                            )}
                          </div>
                        </td>
                        <td className="num py-3.5 text-ink">{formatCurrency(token.volume24h)}</td>
                        <td className="num py-3.5 text-ink">{formatCurrency(token.liquidity)}</td>
                        <td className={`num py-3.5 ${roiColor}`}>{roiSign}{(token.priceChange24h || 0).toFixed(2)}%</td>
                        <td className="num py-3.5 text-accent">{token.roi || '0.00%'}</td>
                        <td className="num py-3.5 text-ink">{formatCurrency(token.fdv)}</td>
                        <td className="num py-3.5 text-ink">{formatCurrency(token.marketCap)}</td>
                        <td className="num py-3.5 pr-5 text-right text-mark-violet">
                          <div className="flex items-center justify-end gap-2">
                            <span>{burntPct}</span>
                            <svg className={`w-4 h-4 text-faint transition-transform duration-200 group-hover:text-ink ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          </div>
                        </td>
                      </tr>

                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          <SwapDock token={swapToken} stocks={isStocks} sticky={!expandedToken} onDockHeight={setDockH} />
        </div>
      </div>
      )}
    </div>
  );
}
