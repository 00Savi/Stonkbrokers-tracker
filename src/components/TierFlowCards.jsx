import React from 'react';

const TIER_DOT = ['bg-mark-green', 'bg-mark-violet', 'bg-mark-sky', 'bg-mark-amber', 'bg-mark-pink'];

export function netTierCount(stats = {}) {
  return Math.max(0, (Number(stats.act) || 0) - (Number(stats.deact) || 0) - (Number(stats.up) || 0));
}

/**
 * ALL / 24h / 7d / 30d cards for how NFTs enter and leave each rung.
 * Act includes upgrades into the tier. Deact is a sale or transfer. Up is
 * leaving via a higher tier — not an exit.
 */
export function TierFlowSection({
  tiers = [],
  tierStats,
  timeframe,
  onTimeframe,
  formatNumber,
  pending = false,
  title = 'Tier Activation Flow',
  note = 'Act is every time an NFT reached this tier, including upgrades. Deact is a sale or transfer. Up is a level increase — not a deactivation. Current mix = Act − Up − Deact.',
}) {
  return (
    <>
      <div className="mb-4 mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h3 className="eyebrow text-muted">{title}</h3>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">{note}</p>
        </div>
        <div className="inline-flex w-full rounded-md border border-line bg-panel p-0.5 sm:w-auto">
          {['24h', '7d', '30d', 'allTime'].map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframe(tf)}
              className={`flex-1 rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide sm:flex-none ${
                timeframe === tf ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {tf === 'allTime' ? 'ALL' : tf}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiers.map((t, idx) => {
          const tData = tierStats?.[t.tier]?.[timeframe] || { act: 0, deact: 0, up: 0 };
          return (
            <div key={t.tier} className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-sm ${TIER_DOT[idx % 5]}`} />
                <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted">
                  {t.tier}: {t.name}
                </p>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="num text-lg text-mark-green">{pending ? '—' : formatNumber(tData.act)}</p>
                  <p className="eyebrow text-faint">Act</p>
                </div>
                <div className="text-center">
                  <p className="num text-lg text-mark-amber">{pending ? '—' : formatNumber(tData.up || 0)}</p>
                  <p className="eyebrow text-faint">Up</p>
                </div>
                <div className="text-right">
                  <p className="num text-lg text-danger">{pending ? '—' : formatNumber(tData.deact)}</p>
                  <p className="eyebrow text-faint">Deact</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
