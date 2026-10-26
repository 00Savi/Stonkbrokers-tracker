import React, { useState } from 'react';
import { Card, compactNum } from './kit';
import { explorerAddressUrl } from '../lib/tba';
import { seatPay } from '../lib/clockInSeats';

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

/**
 * Per-seat Clock In pay on the face of the card. Asset mix and round history
 * open when the card is clicked.
 */
export function ClockInDistributions({ book, tiers, activation, ethPriceUsd, formatCurrency }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(null);
  const assets = Array.isArray(book?.assets) ? book.assets : [];
  const recent = Array.isArray(book?.recent) ? book.recent : [];
  const ready = book && book.rounds > 0 && Number(book.ethPerEngineWeight) > 0;
  const counts = activation?.breakdown || {};
  const seats = (tiers || [])
    .filter((tier) => Number(tier.weight) > 0)
    .map((tier) => {
      const pay = seatPay({
        ethPerEngineWeight: book?.ethPerEngineWeight,
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

  return (
    <Card
      eyebrow="Clock In distributions"
      sub="Each figure is what one seat of that tier was credited across these rounds, priced at the current ETH spot. The count is how many seats are activated now. A broker with interns on payroll pays their slice out of this credit."
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

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] text-muted hover:text-ink"
          >
            {open ? 'Hide assets and rounds' : 'Assets and rounds'}
          </button>

          {open && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[13px] font-medium text-ink">By asset</h3>
                <p className="mt-1 text-[12px] text-muted">Lifetime ETH the rounds directed at each election. Share is that asset's cut of the ETH pot, not the token amount that landed.</p>
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

              <div>
                <h3 className="text-[13px] font-medium text-ink">Recent rounds</h3>
                <p className="mt-1 text-[12px] text-muted">
                  Open a round for the mix it paid. {book.site ? <a href={book.site} target="_blank" rel="noreferrer" className="text-accent hover:underline">How Clock In works</a> : null}
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
                      {recent.map((row) => {
                        const shown = round === row.round;
                        return (
                          <React.Fragment key={row.round}>
                            <tr
                              className="cursor-pointer border-b border-line/70 hover:bg-white/[0.03]"
                              onClick={() => setRound(shown ? null : row.round)}
                            >
                              <td className="px-5 py-2.5 text-ink">#{row.round}</td>
                              <td className="px-3 py-2.5 text-muted">{row.date || '—'}</td>
                              <td className="px-3 py-2.5 text-right text-muted">{formatEth(row.potEth)}</td>
                              <td className="px-3 py-2.5 text-right text-muted">{compactNum(row.recipients || 0)}</td>
                              <td className="px-5 py-2.5 text-right text-ink">{row.top || '—'}</td>
                            </tr>
                            {shown && (
                              <tr className="border-b border-line/70">
                                <td colSpan={5} className="px-5 py-3">
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                                    {(row.assets || []).map((asset) => (
                                      <span key={asset.symbol}>
                                        <span className="text-ink">{asset.symbol}</span> {pct(asset.share)} · {formatEth(asset.eth)}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
