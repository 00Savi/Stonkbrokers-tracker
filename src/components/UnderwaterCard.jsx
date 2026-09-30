import React from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { baseChartOptions } from '../lib/charts';
import { compactUsd } from './kit';

function pctOptions(labels) {
  return baseChartOptions(labels, 'daily', {
    yUnit: '%',
    yTick: (v) => `${v}%`,
  });
}

function moneyOptions(labels) {
  return baseChartOptions(labels, 'daily', {
    yTick: (v) => compactUsd(v),
  });
}

/** Hidden until position folds have reached the backfill and a wallet was scored. */
export function UnderwaterCard({ ownership }) {
  const row = ownership?.underwater;
  if (!row?.caughtUp || !(row.wallets > 0)) return null;
  const weeks = Array.isArray(row.byWeek) ? row.byWeek : [];
  const payback = Array.isArray(row.payback) ? row.payback : [];
  const mix = Array.isArray(ownership.holderMix) ? ownership.holderMix : [];

  return (
    <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Holders underwater</p>
        <p className="text-2xl font-extrabold text-rose-400">{Number(row.pct).toFixed(1)}%</p>
        <p className="text-xs text-slate-500 mt-1">
          {row.underwater} of {row.wallets} wallets. NFT only {row.nftOnly} · token only {row.tokenOnly} · both {row.both}. Cost is the floor and the token price on the day the position opened. An activation this owner paid is included, and so is the revenue since.
        </p>
      </div>

      {weeks.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Underwater by the week the position opened</p>
          <div className="h-44">
            <Bar
              data={{
                labels: weeks.map((w) => String(w.week).slice(5)),
                datasets: [{
                  label: 'Underwater',
                  data: weeks.map((w) => w.pct),
                  backgroundColor: '#fb7185',
                  borderRadius: 3,
                }],
              }}
              options={pctOptions(weeks.map((w) => w.week))}
            />
          </div>
        </div>
      )}

      {payback.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Payback by tier</p>
          <p className="text-xs text-slate-500 mb-2">Cumulative yield against the tokens this owner locked to activate.</p>
          <div className="h-44">
            <Bar
              data={{
                labels: payback.map((p) => p.tier),
                datasets: [
                  { label: 'Locked', data: payback.map((p) => p.cost), backgroundColor: '#f5b700', borderRadius: 3 },
                  { label: 'Yield', data: payback.map((p) => p.yield), backgroundColor: '#00a804', borderRadius: 3 },
                ],
              }}
              options={moneyOptions(payback.map((p) => p.tier))}
            />
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Holder mix</p>
        {mix.length < 2 ? (
          <p className="text-xs text-slate-500">NFT only, token only, and both are saved each hour. The line starts once two hours are on record.</p>
        ) : (
          <div className="h-44">
            <Line
              data={{
                labels: mix.map((m) => String(m.date).slice(5)),
                datasets: [
                  { label: 'NFT only', data: mix.map((m) => m.nftOnly), borderColor: '#38bdf8', backgroundColor: '#38bdf8', tension: 0.3, pointRadius: 0 },
                  { label: 'Token only', data: mix.map((m) => m.tokenOnly), borderColor: '#f5b700', backgroundColor: '#f5b700', tension: 0.3, pointRadius: 0 },
                  { label: 'Both', data: mix.map((m) => m.both), borderColor: '#00a804', backgroundColor: '#00a804', tension: 0.3, pointRadius: 0 },
                ],
              }}
              options={baseChartOptions(mix.map((m) => m.date))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
