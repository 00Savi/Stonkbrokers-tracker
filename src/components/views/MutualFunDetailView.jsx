import React from 'react';
import { BetaTag, Card, KpiStrip, Stat, compactNum, compactUsd } from '../kit';
import { ShareSection } from '../CopyControl';
import { explorerAddressUrl } from '../../lib/tba';

const CLASS_NOTE = {
  T0: '1.00×',
  T1: '1.50×',
  T2: '2.00×',
  T3: '2.50×',
  T4: '3.33×',
};

function formatEth(n) {
  const x = Number(n) || 0;
  if (x >= 1) return `${x.toFixed(3)} ETH`;
  if (x >= 0.01) return `${x.toFixed(4)} ETH`;
  return `${x.toFixed(6)} ETH`;
}

function tokens(n) {
  const x = Number(n) || 0;
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  return compactNum(x);
}

export default function MutualFunDetailView({ data }) {
  const project = data?.projects?.mutualfun;
  if (!project) return <div className="p-12 text-center text-slate-400">Mutual Fun data loading...</div>;

  const { config = {}, market = {}, tiers = [], activation = {}, ownership = {}, revenue = {}, funds = [], seats = {} } = project;
  const formatCurrency = compactUsd;
  const floorUsd = Number(market.nftFloorUsd) || (Number(market.nftFloorEth) || 0) * (Number(market.ethPriceUsd) || 0);
  const tokenPx = Number(market.tokenPriceUsd) || 0;
  const rate = Number(config.houseRate) || 401000;
  const randomUsd = tokenPx > 0 ? rate * 1.08 * tokenPx : 0;
  const specificUsd = tokenPx > 0 ? rate * 1.16 * tokenPx : 0;
  const handInUsd = tokenPx > 0 ? rate * 0.92 * tokenPx : 0;
  const minted = Number(seats.minted) || Number(activation.totalSupply) || 0;
  const enrolled = Number(activation.activeCount) || 0;
  const navUsd = funds.reduce((sum, fund) => sum + (Number(fund.navUsd) || 0), 0);

  return (
    <div className="space-y-10">
      <ShareSection id="roi" title="ROI" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="The Mutual Fun"
          corner={<BetaTag />}
          sub="A Seat earns only while it is enrolled in its fund. The figure next to a class is the one-time Front-End Load in $TMF. Half of that load is burned and half joins the fund. Weight is the share of dividends and votes."
        >
          <KpiStrip>
            <Stat label="Seats minted" value={`${compactNum(minted)} / ${compactNum(seats.max || config.maxSupply || 4001)}`} />
            <Stat label="Enrolled" value={compactNum(enrolled)} note={activation.percentActivated != null ? `${activation.percentActivated}% of minted` : null} />
            <Stat label="OpenSea floor" value={floorUsd > 0 ? formatCurrency(floorUsd) : '—'} note={market.nftFloorEth ? formatEth(market.nftFloorEth) : 'No ETH listing yet'} />
            <Stat label="$TMF" value={tokenPx > 0 ? formatCurrency(tokenPx) : '—'} note="Spot" />
          </KpiStrip>
          <div className="mt-4 divide-y divide-line">
            {tiers.map((tier) => {
              const loadUsd = tokenPx > 0 ? tier.reqTokens * tokenPx : 0;
              const active = activation.breakdown?.[tier.tier] ?? tier.active ?? 0;
              return (
                <div key={tier.tier} className="flex items-baseline justify-between gap-4 py-2.5">
                  <div>
                    <div className="text-[14px] text-ink">{tier.name}</div>
                    <div className="text-[12px] text-muted">
                      {compactNum(active)} enrolled · {CLASS_NOTE[tier.tier] || `${tier.weight / 100}×`} · load {tokens(tier.reqTokens)} TMF
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-medium text-ink">{loadUsd > 0 ? formatCurrency(loadUsd) : '—'}</div>
                    <div className="text-[12px] text-muted">plus the Seat</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </ShareSection>

      <ShareSection id="yield" title="Yield" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Five funds"
          sub="NAV is what the fund desk last marked, in ETH. A Seat's check is its weight over the fund's weight, paid in whatever the fund holds. Nothing is annualized until those checks have a history."
        >
          <KpiStrip>
            <Stat label="Books" value={formatCurrency(navUsd)} note="Five funds, marked in ETH" />
            <Stat label="Weight" value={compactNum(activation.weight || 0)} note={activation.cornerOffices ? `${compactNum(activation.cornerOffices)} corner offices` : 'Class weight, 100 = 1×'} />
          </KpiStrip>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {funds.map((fund) => (
              <div key={fund.name} className="rounded-xl border border-[#1e2228] bg-[#0e1013] p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{fund.name}</div>
                <div className="mt-2 text-lg font-bold text-emerald-400">{formatCurrency(fund.navUsd || 0)}</div>
                <div className="text-[12px] text-slate-500">{formatEth(fund.navEth)}</div>
                <div className="mt-2 text-[12px] text-ink">{compactNum(fund.enrolled || 0)} enrolled</div>
              </div>
            ))}
          </div>
        </Card>
      </ShareSection>

      <ShareSection id="revenue" title="Revenue" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Loads and dividends"
          sub="Every enrollment pays the class load in $TMF. Half is burned to the Chairman's Estate and half is booked to that Seat's fund. Dividends are posted separately, in whatever token the fund pays."
        >
          <KpiStrip>
            <Stat label="Load paid" value={tokenPx > 0 ? formatCurrency(revenue.loadUsd || 0) : tokens(revenue.loadTokens || 0)} note={`${tokens(revenue.loadTokens || 0)} TMF`} />
            <Stat label="Burned" value={tokenPx > 0 ? formatCurrency(revenue.burnedUsd || 0) : tokens(revenue.burnedTokens || 0)} note="Half of every load" />
            <Stat label="Booked to funds" value={tokens(revenue.bookTokens || 0)} note="The other half" />
          </KpiStrip>
          {(revenue.dividends || []).length ? (
            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Token</th>
                    <th className="px-3 py-3 text-right font-normal">Amount</th>
                    <th className="px-5 py-3 text-right font-normal">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.dividends.map((row) => (
                    <tr key={row.address} className="border-b border-line/70">
                      <td className="px-5 py-2.5 text-ink">
                        <a href={explorerAddressUrl(row.address)} target="_blank" rel="noreferrer" className="hover:text-accent">{row.symbol}</a>
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted">{tokens(row.amount)}</td>
                      <td className="px-5 py-2.5 text-right text-ink">{row.usd > 0 ? formatCurrency(row.usd) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-muted">No dividend has been posted yet.</p>
          )}
        </Card>
      </ShareSection>

      <ShareSection id="liquidity" title="Liquidity" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Open Market"
          sub="The house rate is 401,000 $TMF a Seat, both ways. A random Seat costs the rate plus 8%. A specific Seat costs the rate plus 16%. Handing a Seat in pays the rate less 8%. No ETH is charged."
        >
          <KpiStrip>
            <Stat label="Random Seat" value={randomUsd > 0 ? formatCurrency(randomUsd) : '—'} note="401,000 + 8%" />
            <Stat label="Specific Seat" value={specificUsd > 0 ? formatCurrency(specificUsd) : '—'} note="401,000 + 16%" />
            <Stat label="Hand in" value={handInUsd > 0 ? formatCurrency(handInUsd) : '—'} note="401,000 − 8%" />
            <Stat label="OpenSea" value={floorUsd > 0 ? formatCurrency(floorUsd) : '—'} note={market.nftFloorEth ? formatEth(market.nftFloorEth) : null} />
          </KpiStrip>
          <p className="mt-4 text-[13px] text-muted">
            Seat contract{' '}
            <a href={explorerAddressUrl(config.nftCa)} target="_blank" rel="noreferrer" className="text-accent hover:underline">{config.nftCa}</a>
            . Market{' '}
            <a href={explorerAddressUrl(config.ammCa)} target="_blank" rel="noreferrer" className="text-accent hover:underline">{config.ammCa}</a>
            .{config.site ? <> <a href={config.site} target="_blank" rel="noreferrer" className="text-accent hover:underline">themutual.fun</a></> : null}
          </p>
        </Card>
      </ShareSection>

      <ShareSection id="burn" title="Burn" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Burned load"
          sub="Half of every Front-End Load is sent to the Chairman's Estate. A merger retires one Seat. No new Seat can be minted to replace it, so the collection only shrinks."
        >
          <KpiStrip>
            <Stat label="$TMF burned" value={tokens(ownership.permanentlyBurntTokens || revenue.burnedTokens || 0)} note={tokenPx > 0 ? formatCurrency(revenue.burnedUsd || 0) : null} />
            <Stat label="Seats retired" value={compactNum(ownership.burntNfts || seats.retired || 0)} note="Mergers" />
            <Stat label="Still out" value={compactNum(Math.max(0, minted - (seats.retired || 0)))} note={`of ${compactNum(seats.max || 4001)}`} />
          </KpiStrip>
        </Card>
      </ShareSection>

      <ShareSection id="activation" title="Activation" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Enrollment"
          sub="Moving a Seat ends its enrollment. The next holder pays the load again. A corner office is a merged chair: one class higher, and a transfer strips the office."
        >
          <div className="overflow-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line text-faint">
                  <th className="px-5 py-3 font-normal">Fund</th>
                  {tiers.map((tier) => (
                    <th key={tier.tier} className="px-3 py-3 text-right font-normal">{tier.name}</th>
                  ))}
                  <th className="px-5 py-3 text-right font-normal">Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund) => (
                  <tr key={fund.name} className="border-b border-line/70">
                    <td className="px-5 py-2.5 text-ink">{fund.name}</td>
                    {tiers.map((tier) => (
                      <td key={tier.tier} className="px-3 py-2.5 text-right text-muted">{compactNum(fund.classes?.[tier.tier] || 0)}</td>
                    ))}
                    <td className="px-5 py-2.5 text-right text-ink">{compactNum(fund.enrolled || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </ShareSection>

      <ShareSection id="ownership" title="Ownership" className="scroll-mt-32 space-y-4">
        <Card
          eyebrow="Seats"
          sub="4,001 chairs, five funds of 800, plus Seat 0, the Chairman's, which is not for sale. Each Seat owns a Briefcase. Uncashed dividends sit in the Briefcase and go with the Seat."
        >
          <KpiStrip>
            <Stat label="Minted" value={compactNum(minted)} />
            <Stat label="Enrolled" value={compactNum(enrolled)} />
            <Stat label="Corner offices" value={compactNum(activation.cornerOffices || 0)} />
            <Stat label="Retired" value={compactNum(seats.retired || 0)} />
          </KpiStrip>
        </Card>
      </ShareSection>
    </div>
  );
}
