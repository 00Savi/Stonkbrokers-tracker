import React from 'react';

/** Hidden until the hourly walk has reached chain head. */
export function UnderwaterCard({ ownership }) {
  const row = ownership?.underwater;
  if (!row?.caughtUp || !(row.wallets > 0)) return null;
  return (
    <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Holders underwater</p>
      <p className="text-2xl font-extrabold text-rose-400">{Number(row.pct).toFixed(1)}%</p>
      <p className="text-xs text-slate-500 mt-1">
        {row.underwater} of {row.wallets} wallets. NFT only {row.nftOnly} · token only {row.tokenOnly} · both {row.both}. Cost is the floor and the token price on the day the position opened. An activation this owner paid is included, and so is the revenue since.
      </p>
    </div>
  );
}
