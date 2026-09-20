import React from 'react';

const TIER_DOT = ['bg-[#00a804]', 'bg-[#8b5cf6]', 'bg-[#38bdf8]', 'bg-[#f5b700]', 'bg-[#f472b6]'];

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
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-4 mt-8">
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Act is every time an NFT reached this tier, including upgrades. Deact is a sale or transfer.
            Up is a level increase — not a deactivation. Current mix = Act − Up − Deact.
          </p>
        </div>
        <div className="flex bg-[#0e1013] rounded-lg p-1 border border-[#1e2228] w-full sm:w-auto">
          {['24h', '7d', '30d', 'allTime'].map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframe(tf)}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition ${
                timeframe === tf ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tf === 'allTime' ? 'ALL' : tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        {tiers.map((t, idx) => {
          const tData = tierStats?.[t.tier]?.[timeframe] || { act: 0, deact: 0, up: 0 };
          return (
            <div key={t.tier} className="bg-[#0e1013] border border-[#1e2228] rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2.5 h-2.5 rounded-sm ${TIER_DOT[idx % 5]}`} />
                <p className="text-[10px] uppercase font-bold truncate">{t.tier}: {t.name}</p>
              </div>
              <div className="flex justify-between items-end gap-2">
                <div>
                  <p className="text-lg font-bold text-emerald-400">{pending ? '—' : formatNumber(tData.act)}</p>
                  <p className="text-[9px] text-slate-500 uppercase">Act</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-300">{pending ? '—' : formatNumber(tData.up || 0)}</p>
                  <p className="text-[9px] text-slate-500 uppercase">Up</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-rose-400">{pending ? '—' : formatNumber(tData.deact)}</p>
                  <p className="text-[9px] text-slate-500 uppercase">Deact</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
