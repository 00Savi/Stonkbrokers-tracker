import React, { useState } from 'react';
import { Card, compactNum } from './kit';
import { explorerAddressUrl } from '../lib/tba';
import { clockInWindow, seatPay } from '../lib/clockInSeats';
import { windowPeriodLabel } from '../lib/yieldHistory';

function formatEth(n) {
  const x = Number(n) || 0;
  if (x >= 100) return `${x.toFixed(1)} ETH`;
  if (x >= 1) return `${x.toFixed(3)} ETH`;
  if (x >= 0.01) return `${x.toFixed(4)} ETH`;
  return `${x.toFixed(6)} ETH`;
}

function pct(share) {
  const n = Number(share) || 0;
  return `${(n * 100).toFixed(n >= 0.1 ? 1 : 2)}%`;
}

function shortDate(iso) {
  const key = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key || '—';
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function roundTierPay(row, tiers, activation, ethPriceUsd) {
  const counts = activation?.breakdown || {};
  return (tiers || [])
    .filter((tier) => Number(tier.weight) > 0)
    .map((tier) => {
      const pay = seatPay({
        ethPerEngineWeight: row?.unit,
        weight: tier.weight,
        ethPriceUsd,
      });
      const active = Number(counts[tier.tier] ?? counts[tier.id]) || 0;
      return {
        id: tier.tier || tier.id || tier.name,
        name: tier.name,
        active,
        perSeatUsd: pay.usd,
        perSeatEth: pay.eth,
        tierUsd: pay.usd * active,
      };
    });
}

function windowAssets(rows, ethPriceUsd, known) {
  const addresses = new Map((known || []).map((row) => [row.symbol, row.address]));
  const bySymbol = new Map();
  let pot = 0;
  for (const row of rows) {
    pot += Number(row.potEth) || 0;
    for (const asset of row.assets || []) {
      const cur = bySymbol.get(asset.symbol) || { symbol: asset.symbol, address: asset.address || addresses.get(asset.symbol) || '', eth: 0 };
      cur.eth += Number(asset.eth) || 0;
      if (asset.address) cur.address = asset.address;
      bySymbol.set(asset.symbol, cur);
    }
  }
  const px = Number(ethPriceUsd) || 0;
  return [...bySymbol.values()]
    .map((row) => ({
      ...row,
      usd: px > 0 ? row.eth * px : 0,
      share: pot > 0 ? row.eth / pot : 0,
    }))
    .sort((a, b) => b.eth - a.eth);
}

/**
 * Per-seat Clock In pay for the chart range, plus one small card per round
 * paid to broker wallets. The round list opens on demand.
 */
export function ClockInDistributions({ book, tiers, activation, ethPriceUsd, formatCurrency, timeframe = '30d' }) {
  const [listOpen, setListOpen] = useState(false);
  const [round, setRound] = useState(null);
  const period = windowPeriodLabel(timeframe);
  const windowed = clockInWindow(book, timeframe);
  const rows = windowed.rows;
  const ready = book && book.rounds > 0 && (windowed.unit > 0 || Number(book.ethPerEngineWeight) > 0);
  const counts = activation?.breakdown || {};
  const px = Number(ethPriceUsd) || 0;
  const potUsd = windowed.potEth * px;
  const assets = windowAssets(rows, px, book?.assets);
  const seats = (tiers || [])
    .filter((tier) => Number(tier.weight) > 0)
    .map((tier) => {
      const pay = seatPay({
        ethPerEngineWeight: windowed.unit,
        weight: tier.weight,
        ethPriceUsd,
      });
      return {
        id: tier.tier || tier.id || tier.name,
        name: tier.name,
        active: Number(counts[tier.tier] ?? counts[tier.id]) || 0,
        usd: pay.usd,
        eth: pay.eth,
      };
    });
  const selected = rows.find((row) => row.round === round) || null;

  return (
    <Card
      eyebrow="Clock In distributions"
      sub="Each figure is what one seat of that tier was credited in this range, priced at the current ETH spot. The count is how many seats are activated now. A broker with interns on payroll pays their slice out of this credit."
      corner={ready ? (
        <div className="text-right">
          <div className="text-[18px] font-medium text-ink">{formatCurrency(potUsd)}</div>
          <div className="text-[12px] text-muted">{period} · {compactNum(rows.length)} rounds</div>
        </div>
      ) : null}
    >
      {!ready ? (
        <p className="text-[13px] text-muted">The round book is not in this ledger yet. The next sync reads it from Broker Clock In 3.0.</p>
      ) : (
        <div className="space-y-4">
          <div className="divide-y divide-line">
            {seats.map((seat) => (
              <div key={seat.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <div>
                  <div className="text-[14px] text-ink">{seat.name}</div>
                  <div className="text-[12px] text-muted">{compactNum(seat.active)} active · {formatEth(seat.eth)}</div>
                </div>
                <div className="text-[18px] font-medium text-ink">{formatCurrency(seat.usd)}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-medium text-ink">Paid to broker wallets</h3>
                <p className="mt-1 text-[12px] text-muted">Each card is one round. {period} follows the range control.</p>
              </div>
              <span className="shrink-0 rounded border border-line px-2 py-1 text-[11px] text-muted">{compactNum(rows.length)} shown</span>
            </div>
            {rows.length ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {rows.map((row) => {
                  const usd = (Number(row.potEth) || 0) * px;
                  const on = round === row.round;
                  return (
                    <button
                      key={row.round}
                      type="button"
                      onClick={() => setRound(on ? null : row.round)}
                      className={`flex w-36 shrink-0 flex-col rounded-xl border bg-panel p-2.5 text-left transition-all ${on ? 'border-accent/60' : 'border-line hover:border-accent/40'}`}
                    >
                      <div className="relative flex h-24 w-full flex-col items-center justify-center rounded-lg bg-bg">
                        <span className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[9px] font-black text-bg">{shortDate(row.date)}</span>
                        <span className="num text-lg text-accent">{formatCurrency(usd)}</span>
                        <span className="text-[10px] text-faint">{formatEth(row.potEth)}</span>
                      </div>
                      <p className="mt-2 min-h-8 text-xs font-bold text-ink">{`Round ${row.round}`}</p>
                      <p className="mt-1 truncate text-[10px] text-faint">{`${compactNum(row.recipients || 0)} brokers`}</p>
                      <div className="mt-2 flex w-full items-start justify-between gap-2 text-[10px]">
                        <span className="text-muted">Largest</span>
                        <span className="text-right font-bold text-mark-amber">{row.top || '—'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No finished rounds in the {period} range.</p>
            )}
          </div>

          {selected ? (
            <div className="rounded-xl border border-[#1e2228] bg-[#08090b] p-3">
              <p className="text-[13px] text-ink">Round {selected.round} · {shortDate(selected.date)} · {compactNum(selected.recipients || 0)} brokers · {formatCurrency((Number(selected.potEth) || 0) * px)}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                {(selected.assets || []).map((asset) => (
                  <span key={asset.symbol}>
                    <span className="text-ink">{asset.symbol}</span> {pct(asset.share)} · {formatEth(asset.eth)}
                  </span>
                ))}
              </div>
              {Number(selected.unit) > 0 ? (
                <div className="mt-3 overflow-auto">
                  <table className="w-full min-w-[420px] text-left">
                    <thead>
                      <tr className="eyebrow border-b border-line text-faint">
                        <th className="px-3 py-2 font-normal">Tier</th>
                        <th className="px-3 py-2 text-right font-normal">Per seat</th>
                        <th className="px-3 py-2 text-right font-normal">Active now</th>
                        <th className="px-3 py-2 text-right font-normal">Tier total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundTierPay(selected, tiers, activation, ethPriceUsd).map((seat) => (
                        <tr key={seat.id} className="border-b border-line/70">
                          <td className="px-3 py-2 text-[13px] text-ink">{seat.name}</td>
                          <td className="px-3 py-2 text-right text-[13px] text-ink">
                            {formatCurrency(seat.perSeatUsd)}
                            <div className="text-[11px] text-muted">{formatEth(seat.perSeatEth)}</div>
                          </td>
                          <td className="px-3 py-2 text-right text-[13px] text-muted">{compactNum(seat.active)}</td>
                          <td className="px-3 py-2 text-right text-[13px] text-ink">{formatCurrency(seat.tierUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-muted">Per seat is this round’s pot divided by engine weight, times the tier weight. Active is today’s roster, so the tier total is that credit times the seats activated now.</p>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-muted">This round has no per-weight credit, so a tier split is not in the ledger.</p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] text-muted hover:text-ink"
          >
            {listOpen ? 'Hide each distribution' : 'Each distribution'}
          </button>

          {listOpen && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[13px] font-medium text-ink">{period} total {formatCurrency(potUsd)}</h3>
                <p className="mt-1 text-[12px] text-muted">
                  ETH the rounds in this range directed at broker wallets. {book.site ? <a href={book.site} target="_blank" rel="noreferrer" className="text-accent hover:underline">How Clock In works</a> : null}
                </p>
                <div className="mt-3 overflow-auto">
                  <table className="w-full min-w-[520px] text-left">
                    <thead>
                      <tr className="eyebrow border-b border-line text-faint">
                        <th className="px-5 py-3 font-normal">Round</th>
                        <th className="px-3 py-3 font-normal">When</th>
                        <th className="px-3 py-3 text-right font-normal">Pot</th>
                        <th className="px-3 py-3 text-right font-normal">Brokers</th>
                        <th className="px-5 py-3 text-right font-normal">Largest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.round}
                          className="cursor-pointer border-b border-line/70 hover:bg-white/[0.03]"
                          onClick={() => setRound(round === row.round ? null : row.round)}
                        >
                          <td className="px-5 py-2.5 text-ink">#{row.round}</td>
                          <td className="px-3 py-2.5 text-muted">{row.date || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-ink">{formatCurrency((Number(row.potEth) || 0) * px)}</td>
                          <td className="px-3 py-2.5 text-right text-muted">{compactNum(row.recipients || 0)}</td>
                          <td className="px-5 py-2.5 text-right text-ink">{row.top || '—'}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-line">
                        <td className="px-5 py-2.5 text-ink" colSpan={2}>Total</td>
                        <td className="px-3 py-2.5 text-right text-ink">{formatCurrency(potUsd)}</td>
                        <td className="px-3 py-2.5 text-right text-muted">{compactNum(rows.length)}</td>
                        <td className="px-5 py-2.5" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {assets.length ? (
                <div>
                  <h3 className="text-[13px] font-medium text-ink">By asset</h3>
                  <p className="mt-1 text-[12px] text-muted">Share is that asset's cut of the ETH pot in this range, not the token amount that landed.</p>
                  <div className="mt-3 max-h-[28rem] overflow-auto">
                    <table className="w-full min-w-[520px] text-left">
                      <thead>
                        <tr className="eyebrow border-b border-line text-faint">
                          <th className="px-5 py-3 font-normal">Asset</th>
                          <th className="px-3 py-3 text-right font-normal">Share</th>
                          <th className="px-3 py-3 text-right font-normal">ETH</th>
                          <th className="px-5 py-3 text-right font-normal">USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assets.map((row) => (
                          <tr key={row.symbol} className="border-b border-line/70">
                            <td className="px-5 py-2.5 text-ink">
                              {row.address ? (
                                <a href={explorerAddressUrl(row.address)} target="_blank" rel="noreferrer" className="hover:text-accent">{row.symbol}</a>
                              ) : row.symbol}
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted">{pct(row.share)}</td>
                            <td className="px-3 py-2.5 text-right text-muted">{formatEth(row.eth)}</td>
                            <td className="px-5 py-2.5 text-right text-ink">{formatCurrency(row.usd || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
