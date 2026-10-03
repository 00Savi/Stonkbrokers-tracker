import React from 'react';
import { Chart as ChartJS, ArcElement } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { baseChartOptions, percentTick } from '../lib/charts';
import { ChartSwitch, EmptyChart } from './HistoryCharts';
import { SliceChart } from './SliceChart';

ChartJS.register(ArcElement);

function finite(n) {
  return Number.isFinite(Number(n));
}

function historyPoints(ownership, row) {
  const stored = Array.isArray(ownership?.underwaterHistory) ? ownership.underwaterHistory : [];
  if (stored.length) return stored;
  return [{
    at: 'Now',
    pct: row.pct,
    nftPct: row.nftPct,
    tokenPct: row.tokenPct,
  }];
}

function pointLabel(at) {
  const s = String(at || '');
  if (s === 'Now') return s;
  return s.replace('T', ' ').slice(5, 16);
}

function percentOptions(labels) {
  const base = baseChartOptions(labels, 'daily', { yUnit: '%', yTick: percentTick });
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        min: 0,
        max: 100,
        unit: '%',
        title: base.scales.y.title,
      },
    },
  };
}

function stackedCountOptions(labels) {
  const base = baseChartOptions(labels, 'daily');
  return {
    ...base,
    scales: {
      ...base.scales,
      x: { ...base.scales.x, stacked: true },
      y: { ...base.scales.y, stacked: true },
    },
  };
}

function weekNote(weeks) {
  if (!weeks.length) return '';
  const latest = weeks[weeks.length - 1];
  const biggest = weeks.reduce((a, b) => (b.wallets > a.wallets ? b : a));
  const label = (w) => String(w.week).slice(5);
  return `Wallets that opened that week, scored at today's price. ${label(biggest)} is the largest cohort, ${biggest.underwater} of ${biggest.wallets} underwater. The latest week, ${label(latest)}, is ${latest.underwater} of ${latest.wallets}. A bar of all red can be a small cohort.`;
}

/** Hidden until position folds have reached the backfill and a wallet was scored.
 *  `tokenLeg` is the token bag. Interns are the NFT only; that bag is scored
 *  on StonkBrokers. */
export function UnderwaterCard({ ownership, tokenLeg = true }) {
  const row = ownership?.underwater;
  if (!row?.caughtUp || !(row.wallets > 0)) return null;
  const series = historyPoints(ownership, row);
  const labels = series.map((p) => pointLabel(p.at || p.date));
  const nftPcts = series.map((p) => (finite(p.nftPct) ? Number(p.nftPct) : null));
  const tokenPcts = series.map((p) => (finite(p.tokenPct) ? Number(p.tokenPct) : null));
  const combined = series.map((p) => (finite(p.pct) ? Number(p.pct) : null));
  const hasNftLine = nftPcts.some(finite);
  const hasTokenLine = tokenLeg && tokenPcts.some(finite);
  const weeks = Array.isArray(row.byWeek) ? row.byWeek : [];
  const mix = (Array.isArray(ownership.holderMix) ? ownership.holderMix : [])
    .filter((row) => Number(row?.minUsd) === 1);
  const lastMix = mix.length ? mix[mix.length - 1] : null;

  const lineSets = [];
  if (hasNftLine) {
    lineSets.push({
      label: 'NFT holders',
      data: nftPcts,
      borderColor: '#38bdf8',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: nftPcts.length < 8 ? 3 : 0,
      spanGaps: true,
    });
  }
  if (hasTokenLine) {
    lineSets.push({
      label: 'Token holders',
      data: tokenPcts,
      borderColor: '#f5b700',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: tokenPcts.length < 8 ? 3 : 0,
      spanGaps: true,
    });
  }
  if (!lineSets.length && combined.some(finite)) {
    lineSets.push({
      label: 'All holders',
      data: combined,
      borderColor: '#fb7185',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: combined.length < 8 ? 3 : 0,
      spanGaps: true,
    });
  }

  const splitNote = hasNftLine
    ? `${row.nftUnder ?? '—'} of ${row.nftWallets ?? '—'} NFT wallets (${Number(row.nftPct).toFixed(1)}%)`
      + (hasTokenLine
        ? ` and ${row.tokenUnder ?? '—'} of ${row.tokenWallets ?? '—'} token wallets holding at least $1 (${Number(row.tokenPct).toFixed(1)}%) are underwater. A wallet that holds both is counted on both lines. A leftover bag under $1 is not a token holder.`
        : ' are underwater.')
    : `${row.underwater} of ${row.wallets} wallets (${Number(row.pct).toFixed(1)}%) are underwater. NFT and token lines start on the next hourly score.`;

  const views = [
    {
      id: 'share',
      label: 'Share',
      title: 'Holders underwater',
      note: `${splitNote} Cost is the floor or the token price on the day the position opened. The lines are that share of today's holders, saved each hour.${tokenLeg ? '' : ' Token bags stay on StonkBrokers.'}`,
      body: lineSets.length ? (
        <Line data={{ labels, datasets: lineSets }} options={percentOptions(labels)} />
      ) : (
        <EmptyChart>Underwater history starts on the next hourly score</EmptyChart>
      ),
    },
  ];
  if (weeks.length > 0) {
    views.push({
      id: 'week',
      label: 'Week',
      title: 'Underwater by the week the position opened',
      note: weekNote(weeks),
      body: (
        <Bar
          data={{
            labels: weeks.map((w) => String(w.week).slice(5)),
            datasets: [
              {
                label: 'Underwater',
                data: weeks.map((w) => w.underwater),
                backgroundColor: '#fb7185',
                stack: 'week',
                borderRadius: 3,
              },
              {
                label: 'Above water',
                data: weeks.map((w) => Math.max(0, w.wallets - w.underwater)),
                backgroundColor: '#00a804',
                stack: 'week',
                borderRadius: 3,
              },
            ],
          }}
          options={stackedCountOptions(weeks.map((w) => w.week))}
        />
      ),
    });
  }
  if (tokenLeg) {
    views.push({
      id: 'mix',
      label: 'Mix',
      title: 'Holder mix',
      fit: true,
      note: lastMix
        ? 'Wallets holding at least $1 of the token, or an NFT. A smaller token bag is left out, so an NFT wallet with one counts as NFT only.'
        : 'NFT only, token only, and both. Token bags under $1 are left out.',
      body: lastMix ? (
        <SliceChart
          noun="Wallets"
          slices={[
            { label: 'Token only', value: lastMix.tokenOnly, color: '#f5b700' },
            { label: 'NFT only', value: lastMix.nftOnly, color: '#38bdf8' },
            { label: 'Both', value: lastMix.both, color: '#00a804' },
          ]}
        />
      ) : (
        <EmptyChart>Holder mix starts once a day is on record with the $1 token floor.</EmptyChart>
      ),
    });
  }
  return <ChartSwitch initial="share" views={views} />;
}
