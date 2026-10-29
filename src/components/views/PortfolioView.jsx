import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { SAVI_X } from '../Shell';
import { NfaNote } from '../Disclaimer';
import { copyElement, copyPortfolioSnapshot } from '../../lib/share';
import { CsvButton } from '../CsvButton';
import { CopyControl } from '../CopyControl';
import { PAIR_COLORS, STREAM_COLORS } from '../../lib/charts';
import { SliceChart } from '../SliceChart';
import { PROJECTS } from '../../lib/routes';
import { navNftScanTargets, navTokenScanTargets, portfolioProjectLabel } from '../../lib/portfolioScan';
import { formatMoney, moneyTick, readDisplay, useDisplayCurrency } from '../../lib/money';
import { formatLabels } from '../../lib/dates';
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  aggregateTbaHoldings,
  buildPriceIndex,
  explorerAddressUrl,
  fetchAllTbaInventories,
  resolveTbaAddress,
  tbaRegistry,
} from '../../lib/tba';
import { fetchWalletBrokers } from '../../lib/coattail';
import {
  earningStartTs,
  earnedUsdForNft,
  earnedUsdForTokenPosition,
  fetchMachineMeta,
  fetchNftImage,
  normalizeNftImageUrl,
  fetchNftTransferLog,
  fetchIndexedNftHolds,
  fetchOwnedNftIdsV2,
  enumerateOwnedIds,
  fetchTokenHoldStartTs,
  attachSaleCosts,
  formatDate,
  machineAnnualForWeight,
  mapLimited,
  walletDailyDrops,
  bucketDropSeries,
  portfolioCashMarkSeries,
  portfolioValueSeries,
  nftEntryCostUsd,
  nftAcquireCostUsd,
  paybackMonths,
  formatPaybackMonths,
  activationTokenCostUsd,
  floorUsdOn,
  tokenPriceAtTs,
} from '../../lib/portfolioHistory';

const FORECAST_YEARS = [1, 3, 5, 10];
const GRAINS = [
  { id: 'd', label: 'D', title: 'Daily' },
  { id: 'w', label: 'W', title: 'Weekly' },
  { id: 'm', label: 'M', title: 'Monthly' },
  { id: 'a', label: 'A', title: 'Annual' },
];
const PIE_COLORS = PAIR_COLORS;

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

function GrainBar({ value, onChange }) {
  return (
    <div className="flex bg-[#0e1013] rounded-lg p-0.5 border border-[#1e2228]">
      {GRAINS.map((g) => (
        <button
          key={g.id}
          type="button"
          title={g.title}
          onClick={() => onChange(g.id)}
          className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${
            value === g.id ? 'bg-[#1e2228] text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

const projectName = (key, ticker) => portfolioProjectLabel(key, ticker);

const formatAmount = (val) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: val >= 1 ? 2 : 4 }).format(val || 0);

/** Header art is Savi's own NFTs, not project marks. Never use these as thumbs. */
const HEADER_NFT_ART = new Set(['Stonkbroker.png', 'Intern.svg', 'logo.png', 'Yardkeepers.png', 'wall.png']);

function officialLogoSrc(asset) {
  const raw = String(asset.projectKey || '').replace(/:token$/, '');
  const metaKey = raw.startsWith('nightshades:') ? 'nightshades' : raw;
  const meta = PROJECTS.find((p) => p.key === metaKey);
  const file = meta?.logo || asset.logo;
  if (!file || HEADER_NFT_ART.has(file)) return '';
  return `/${file}`;
}

function pickOwnedNft(nfts, tokenId) {
  if (!nfts?.length) return null;
  if (tokenId != null) {
    return nfts.find((n) => String(n.tokenId) === String(tokenId)) || nfts[0];
  }
  return nfts[Math.floor(Math.random() * nfts.length)];
}

async function resolveThumb(asset, existing) {
  if (existing?.src) return existing;
  const pick = pickOwnedNft(asset.nfts, existing?.tokenId);
  let src = normalizeNftImageUrl(pick?.imageUrl || '');
  if (!src && pick?.nftCa && pick?.tokenId != null) {
    try {
      src = await fetchNftImage(pick.nftCa, pick.tokenId) || '';
    } catch {
      src = '';
    }
  }
  if (!src) src = officialLogoSrc(asset);
  return { src, tokenId: pick?.tokenId ?? existing?.tokenId };
}

function HoldingRows({ tokens, priceIndex, formatCurrency }) {
  if (!tokens.length) {
    return <p className="text-xs text-slate-500">No tokens or NFTs in this tokenbound wallet.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {tokens.map((tok) => {
        const usd = tok.nft ? 0 : (priceIndex[tok.contract] || 0) * tok.amount;
        return (
          <li key={tok.contract} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-300 truncate">
              <span className="font-semibold text-white">{tok.symbol}</span>
              {tok.nft ? (
                <span className="text-slate-500"> · {formatAmount(tok.amount)} NFT</span>
              ) : (
                <span className="text-slate-500"> · {formatAmount(tok.amount)}</span>
              )}
            </span>
            <span className="text-slate-400 shrink-0">{usd > 0 ? formatCurrency(usd) : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function holdingName(asset) {
  return String(asset.project || asset.ticker || 'Holding').replace(/ token$/, '');
}

function byFloor(a, b) {
  return (Number(b.floorValue) || 0) - (Number(a.floorValue) || 0);
}

function moneyRatio(numer, denom) {
  if (!(Number(denom) > 0.01)) return null;
  return (Number(numer) / Number(denom)) * 100;
}

function seatEconomics(nft) {
  const paid = nftAcquireCostUsd(nft);
  const activation = Number(nft?.activationCostUsd) || 0;
  const earned = Number(nft?.earnedValue) || 0;
  const floor = Number(nft?.floorValue) || 0;
  const invested = paid == null ? null : paid + activation;
  const pnl = invested == null ? null : floor + earned - invested;
  return {
    paid,
    activation,
    invested,
    earned,
    floor,
    pnl,
    cashRoi: invested == null ? null : moneyRatio(earned, invested),
    roe: invested == null ? null : moneyRatio(pnl, invested),
  };
}

function seatBookRows(assets) {
  return (assets || []).map((asset) => {
    const parts = (asset.nfts || []).map(seatEconomics);
    const missing = parts.some((part) => part.paid == null);
    const paid = missing ? null : parts.reduce((sum, part) => sum + part.paid, 0);
    const activation = parts.reduce((sum, part) => sum + part.activation, 0);
    const earned = Number(asset.earnedValue) || 0;
    const floor = Number(asset.floorValue) || 0;
    const invested = paid == null ? null : paid + activation;
    const pnl = invested == null ? null : floor + earned - invested;
    return {
      key: asset.projectKey,
      name: holdingName(asset),
      count: parts.length || Number(asset.balance) || 0,
      paid,
      activation,
      invested,
      earned,
      floor,
      pnl,
      cashRoi: invested == null ? null : moneyRatio(earned, invested),
      roe: invested == null ? null : moneyRatio(pnl, invested),
    };
  });
}

function tokenBookRows(assets) {
  return (assets || []).map((asset) => {
    const spot = Number(asset.floorValue) || 0;
    const cost = Number(asset.entryValueUsd) || 0;
    const earned = Number(asset.earnedValue) || 0;
    return {
      key: asset.projectKey,
      name: holdingName(asset),
      amount: `${formatAmount(asset.balance)} ${asset.ticker || ''}`.trim(),
      spot,
      cost,
      pnl: cost > 0 ? spot - cost + earned : null,
    };
  });
}

function cents(formatCurrency, n) {
  return Math.abs(Number(n) || 0) < 0.01 ? formatCurrency(1).replace('1', '0') : formatCurrency(n);
}

function DetailTable({ columns, rows }) {
  if (!rows.length) {
    return <p className="text-xs text-slate-500">Nothing in this book.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
            {columns.map((col) => (
              <th key={col.key} className={`py-1.5 pr-3 font-medium ${col.align || ''}`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[#1e2228]">
              {columns.map((col) => (
                <td key={col.key} className={`py-2 pr-3 whitespace-nowrap ${col.align || ''} ${col.tone ? col.tone(row) : 'text-slate-200'}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatStrip({ rows }) {
  return (
    <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">{row.label}</dt>
          <dd className={`mt-1 text-base font-extrabold ${row.tone || 'text-white'}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ValueDetail({ series, formatPnl, formatCurrency }) {
  if (!series?.labels?.length) {
    return <p className="text-xs text-slate-500">Not enough daily closes to compare yet.</p>;
  }
  const start = series.total[0];
  const now = series.total[series.total.length - 1];
  const move = now - start;
  const pct = start > 0 ? (move / start) * 100 : null;
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Mark from {series.labels[0]} to {series.labels[series.labels.length - 1]}. First close is only what was already held that day, so the change includes positions added later. Cash already paid out is not in the line.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">First close</p>
          <p className="text-sm font-bold text-white">{formatCurrency(start)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Latest</p>
          <p className="text-sm font-bold text-white">{formatCurrency(now)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Change</p>
          <p className={`text-sm font-bold ${move < -0.01 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {formatPnl(move)}{pct == null ? '' : ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`}
          </p>
        </div>
      </div>
    </div>
  );
}

function SeatDetail({ assets, sort, formatCurrency, formatPnl, formatRoi, pnlTone }) {
  const rows = seatBookRows(assets).sort((a, b) => (sort === 'pnl' ? b.pnl - a.pnl : b.floor - a.floor));
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        NFT cost is the ETH paid in the transfer that delivered the seat, priced at that minute. A transfer with no payment is left blank. Activation is the tokens this wallet paid after receiving it, priced that day. ROI is that cashflow divided by the investment. P&amp;L is today&apos;s floor plus that cashflow, minus the investment.
      </p>
      <DetailTable
        rows={rows}
        columns={[
          { key: 'name', label: 'Seats', render: (row) => row.name },
          { key: 'count', label: 'Count', align: 'text-right', render: (row) => row.count },
          { key: 'paid', label: 'NFT', align: 'text-right', render: (row) => (row.paid == null ? '—' : cents(formatCurrency, row.paid)) },
          { key: 'activation', label: 'Activation', align: 'text-right', render: (row) => cents(formatCurrency, row.activation) },
          { key: 'invested', label: 'Invested', align: 'text-right', render: (row) => (row.invested == null ? '—' : cents(formatCurrency, row.invested)) },
          { key: 'earned', label: 'Earned', align: 'text-right', render: (row) => cents(formatCurrency, row.earned) },
          { key: 'cashRoi', label: 'ROI', align: 'text-right', tone: (row) => pnlTone(row.cashRoi), render: (row) => formatRoi(row.cashRoi, 1) },
          { key: 'floor', label: 'Floor', align: 'text-right', render: (row) => formatCurrency(row.floor) },
          { key: 'pnl', label: 'P&L', align: 'text-right', tone: (row) => pnlTone(row.pnl), render: (row) => (row.pnl == null ? '—' : formatPnl(row.pnl)) },
          { key: 'roe', label: 'ROE', align: 'text-right', tone: (row) => pnlTone(row.roe), render: (row) => formatRoi(row.roe, 1) },
        ]}
      />
    </div>
  );
}

function TokenDetail({ assets, sort, formatCurrency, formatPnl, pnlTone }) {
  const rows = tokenBookRows(assets).sort((a, b) => {
    if (sort === 'pnl') return (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity);
    return b.spot - a.spot;
  });
  return (
    <DetailTable
      rows={rows}
      columns={[
        { key: 'name', label: 'Token', render: (row) => row.name },
        { key: 'amount', label: 'Amount', align: 'text-right', render: (row) => row.amount },
        { key: 'cost', label: 'Cost', align: 'text-right', render: (row) => (row.cost > 0 ? cents(formatCurrency, row.cost) : '—') },
        { key: 'spot', label: 'Spot', align: 'text-right', render: (row) => formatCurrency(row.spot) },
        { key: 'pnl', label: 'P&L', align: 'text-right', tone: (row) => pnlTone(row.pnl), render: (row) => formatPnl(row.pnl) },
      ]}
    />
  );
}

function returnRows(seatAssets, tokenAssets) {
  const seats = (seatAssets || []).map((asset) => {
    const costs = (asset.nfts || []).map((nft) => nftAcquireCostUsd(nft));
    const activation = (asset.nfts || []).reduce((sum, nft) => sum + (Number(nft.activationCostUsd) || 0), 0);
    const nft = costs.some((cost) => cost == null) ? null : costs.reduce((sum, cost) => sum + cost, 0);
    const cost = nft == null ? null : nft + activation;
    const mark = Number(asset.floorValue) || 0;
    const earned = Number(asset.earnedValue) || 0;
    const gain = cost == null ? null : mark + earned - cost;
    return {
      key: asset.projectKey,
      name: holdingName(asset),
      cost,
      mark,
      earned,
      gain,
      yieldAnnual: Number(asset.yieldValue) || 0,
      roi: cost > 0.01 ? (gain / cost) * 100 : null,
    };
  });
  const tokens = (tokenAssets || []).map((asset) => {
    const cost = Number(asset.entryValueUsd) || 0;
    const known = cost > 0;
    const mark = Number(asset.floorValue) || 0;
    const earned = Number(asset.earnedValue) || 0;
    const gain = known ? mark + earned - cost : null;
    return {
      key: asset.projectKey,
      name: asset.ticker || holdingName(asset),
      cost: known ? cost : null,
      mark,
      earned,
      gain,
      yieldAnnual: Number(asset.yieldValue) || 0,
      roi: known && cost > 0.01 ? (gain / cost) * 100 : null,
    };
  });
  return [...seats, ...tokens];
}

function EarnedDetail({ rows, formatCurrency }) {
  const ordered = [...rows].sort((a, b) => b.earned - a.earned);
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Cash credited after each seat or token position opened. This is money already paid out, not the forecast.
      </p>
      <DetailTable
        rows={ordered}
        columns={[
          { key: 'name', label: 'Holding', render: (row) => row.name },
          { key: 'earned', label: 'Earned', align: 'text-right', render: (row) => cents(formatCurrency, row.earned) },
        ]}
      />
    </div>
  );
}

function ForecastDetail({ rows, years, formatCurrency }) {
  const ordered = [...rows].sort((a, b) => (b.yieldAnnual * years) - (a.yieldAnnual * years));
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Current annual yield times {years} {years === 1 ? 'year' : 'years'}. Not compounded. Earned cash is the other card and does not change with this window.
      </p>
      <DetailTable
        rows={ordered}
        columns={[
          { key: 'name', label: 'Holding', render: (row) => row.name },
          { key: 'annual', label: 'Annual', align: 'text-right', render: (row) => cents(formatCurrency, row.yieldAnnual) },
          { key: 'window', label: `${years}y`, align: 'text-right', render: (row) => cents(formatCurrency, row.yieldAnnual * years) },
        ]}
      />
    </div>
  );
}

function RoiDetail({ rows, formatCurrency, formatRoi, pnlTone }) {
  const ordered = [...rows].sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Today&apos;s mark plus cash already earned, divided by what was paid. A seat&apos;s cost is the NFT price plus activation tokens. A position with no cost, and a token with no open price, stay out of this return.
      </p>
      <DetailTable
        rows={ordered}
        columns={[
          { key: 'name', label: 'Holding', render: (row) => row.name },
          { key: 'cost', label: 'Cost', align: 'text-right', render: (row) => (row.cost > 0 ? cents(formatCurrency, row.cost) : '—') },
          { key: 'mark', label: 'Mark', align: 'text-right', render: (row) => formatCurrency(row.mark) },
          { key: 'earned', label: 'Earned', align: 'text-right', render: (row) => cents(formatCurrency, row.earned) },
          { key: 'roi', label: 'ROI', align: 'text-right', tone: (row) => pnlTone(row.roi), render: (row) => formatRoi(row.roi, 1) },
        ]}
      />
    </div>
  );
}

function groupByProject(ownedAssets) {
  const map = new Map();
  for (const a of ownedAssets) {
    const prev = map.get(a.projectKey);
    if (!prev) {
      map.set(a.projectKey, {
        ...a,
        nfts: [...(a.nfts || [])],
        wallets: [a.wallet],
      });
      continue;
    }
    prev.balance += a.balance;
    prev.floorValue += a.floorValue;
    prev.yieldValue += a.yieldValue;
    prev.earnedValue += a.earnedValue || 0;
    prev.basisUsd = (prev.basisUsd || 0) + (a.basisUsd || 0);
    prev.activationCostUsd = (prev.activationCostUsd || 0) + (a.activationCostUsd || 0);
    prev.entryFloorUsd = (prev.entryFloorUsd || 0) + (a.entryFloorUsd || 0);
    prev.entryCostUsd = (prev.entryCostUsd || 0) + (a.entryCostUsd || 0);
    prev.entryValueUsd = (prev.entryValueUsd || 0) + (a.entryValueUsd || 0);
    prev.basisKnown = (prev.basisKnown || 0) + (a.basisKnown || 0);
    prev.idsPartial = prev.idsPartial || a.idsPartial;
    prev.idsFound = (prev.idsFound || 0) + (a.idsFound || 0);
    prev.nfts.push(...(a.nfts || []));
    if (!prev.wallets.includes(a.wallet)) prev.wallets.push(a.wallet);
  }
  return [...map.values()];
}

/** Cost at entry: ETH paid for the NFT when we know it, otherwise the floor that day, plus activation tokens. */
function assetEntryCostUsd(asset) {
  if (asset?.tokenPosition) return Number(asset.floorValue) || 0;
  if (asset?.nfts?.length) return Number(asset.entryCostUsd) || 0;
  if (Number(asset.entryCostUsd) > 0) return Number(asset.entryCostUsd);
  return (Number(asset.entryFloorUsd) || 0) + (Number(asset.activationCostUsd) || 0) + (Number(asset.basisUsd) || 0);
}

function Copyable({ id, className = '', children }) {
  const ref = useRef(null);
  return (
    <div ref={ref} id={id} className={`relative scroll-mt-36 ${className}`}>
      <CopyControl
        overlay
        tight
        idleLabel="Copy"
        title="Copy this piece for X"
        onCopy={() => copyElement(ref.current, { filename: `savi-portfolio-${id}.png`, maxW: 1080 })}
      />
      {children}
    </div>
  );
}

function portfolioCsvRows(grouped) {
  const rows = [[
    'project', 'token_id', 'tier', 'wallet', 'opened',
    'entry_cost_usd', 'floor_today_usd', 'earned_usd', 'annual_yield_usd', 'payback_months',
  ]];
  for (const asset of grouped || []) {
    if (asset.tokenPosition) {
      rows.push([
        asset.project,
        formatAmount(asset.balance),
        'token',
        asset.wallet || '',
        asset.holdStartTs ? formatDate(asset.holdStartTs) : '',
        '',
        Number(asset.floorValue || 0).toFixed(2),
        Number(asset.earnedValue || 0).toFixed(2),
        Number(asset.yieldValue || 0).toFixed(2),
        '',
      ]);
      continue;
    }
    for (const nft of asset.nfts || []) {
      const entry = nftEntryCostUsd(nft);
      const months = paybackMonths(entry, nft.yieldValue);
      rows.push([
        asset.project,
        nft.tokenId,
        nft.tierName || nft.tierId || '',
        nft.wallet || '',
        formatDate(nft.lastTransferTs || nft.activationTs),
        entry.toFixed(2),
        Number(nft.floorValue || 0).toFixed(2),
        Number(nft.earnedValue || 0).toFixed(2),
        Number(nft.yieldValue || 0).toFixed(2),
        months == null ? '' : months.toFixed(1),
      ]);
    }
  }
  return rows;
}

function sumNftCosts(nfts) {
  let basisUsd = 0;
  let activationCostUsd = 0;
  let basisKnown = 0;
  let entryFloorUsd = 0;
  let entryCostUsd = 0;
  for (const nft of nfts || []) {
    const act = Number(nft.activationCostUsd) || 0;
    const floorThen = Number(nft.entryFloorUsd) || 0;
    const paid = nftAcquireCostUsd(nft);
    if (nft.basisKnown) {
      basisUsd += Number(nft.basisUsd) || 0;
      basisKnown += 1;
    }
    activationCostUsd += act;
    entryFloorUsd += floorThen;
    if (paid == null) entryCostUsd = null;
    else if (entryCostUsd != null) entryCostUsd += paid + act;
  }
  return { basisUsd, activationCostUsd, basisKnown, entryFloorUsd, entryCostUsd };
}

export default function PortfolioView({ data }) {
  const [searchParams] = useSearchParams();
  const urlWallets = searchParams.get('w') || '';
  const autoScan = useRef(false);
  const [inputVal, setInputVal] = useState(urlWallets);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [results, setResults] = useState({
    floorUsd: 0,
    yieldUsd: 0,
    earnedUsd: 0,
    totalUnits: 0,
    hasErrors: false,
    ownedAssets: [],
  });
  const [inventories, setInventories] = useState({});
  const [expandedNft, setExpandedNft] = useState(null);
  const [openProjects, setOpenProjects] = useState({});
  const [enriched, setEnriched] = useState({});
  const [aggregateOpen, setAggregateOpen] = useState(false);
  const [forecastYears, setForecastYears] = useState(1);
  const [historyGrain, setHistoryGrain] = useState('d');
  const [copyState, setCopyState] = useState('idle');
  const [scanProgress, setScanProgress] = useState('');
  const [thumbs, setThumbs] = useState({});
  const pickedThumb = useRef({});

  const priceIndex = buildPriceIndex(data);
  const [ccy] = useDisplayCurrency();
  const display = readDisplay();
  const ethUsd = data?.projects?.stonk?.market?.ethPriceUsd || display.ethUsd || 0;
  const rates = { ethUsd, eurPerUsd: display.eurPerUsd };
  const formatCurrency = (usd) => formatMoney(usd, ccy, rates);
  const formatPnl = (n) => {
    if (n == null || !Number.isFinite(n)) return '—';
    if (Math.abs(n) < 0.01) return formatCurrency(1).replace('1', '0');
    return n > 0 ? `+${formatCurrency(n)}` : formatCurrency(n);
  };
  const pnlTone = (n) => (n == null || !Number.isFinite(n) ? 'text-white' : n < -0.01 ? 'text-rose-400' : 'text-emerald-400');
  const quietCash = (n) => (Math.abs(Number(n) || 0) < 0.01 ? formatCurrency(1).replace('1', '0') : formatCurrency(n));
  const tickMoney = moneyTick(ccy, rates);
  const valueChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10 } } },
    scales: {
      x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#1e2228' } },
      y: { ticks: { color: '#94a3b8', callback: moneyTick(ccy, rates) }, grid: { color: '#1e2228' }, unit: ccy },
    },
  }), [ccy, rates]);

  const loadInventories = (nfts) => {
    const tbas = [...new Set(nfts.map((n) => n.tba).filter(Boolean))];
    if (!tbas.length) return;
    setInventories(Object.fromEntries(tbas.map((tba) => [tba, { status: 'loading', tokens: [] }])));
    fetchAllTbaInventories(tbas, data)
      .then((map) => {
        setInventories(
          Object.fromEntries(tbas.map((tba) => [tba, { status: 'ok', tokens: map[tba] || [] }]))
        );
      })
      .catch(() => {
        setInventories(
          Object.fromEntries(tbas.map((tba) => [tba, { status: 'error', tokens: [] }]))
        );
      });
  };

  const handleScan = async () => {
    if (!inputVal.trim()) return;
    const wallets = inputVal.split(',').map((w) => w.trim()).filter((w) => ethers.isAddress(w));
    if (wallets.length === 0) {
      alert('Please enter at least one valid EVM wallet address.');
      return;
    }

    setIsScanning(true);
    setScanComplete(false);
    setScanProgress('Connecting to Robinhood Chain…');
    setInventories({});
    setExpandedNft(null);
    setOpenProjects({});
    setEnriched({});
    setAggregateOpen(false);
    setThumbs({});
    pickedThumb.current = {};

    let totalFloorUsd = 0;
    let totalYieldUsd = 0;
    let totalEarnedUsd = 0;
    let totalUnits = 0;
    let portfolioHasErrors = false;
    let ownedAssets = [];

    try {
      const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
      const erc721Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
      ];
      const erc20Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const nftJobs = [];
      for (const target of navNftScanTargets(data)) {
        for (const wallet of wallets) nftJobs.push({ ...target, wallet });
      }

      const nftChunks = await mapLimited(nftJobs, 1, async ({ pKey, pData, wallet }) => {
          const nftContract = new ethers.Contract(pData.config.nftCa, erc721Abi, provider);
          const floorUsd = (pData.market?.nftFloorEth || 0) * (pData.market?.ethPriceUsd || 0);
          const displayName = projectName(pKey, pData.config.ticker);
          const isMachine = pData.config?.kind === 'machines';
          const isBroker = pData.config?.kind === 'brokers';
          try {
            const bal = Number(await nftContract.balanceOf(wallet));
            if (!(bal > 0)) return null;
            setScanProgress(`Reading ${displayName} (${bal} NFTs)…`);
            let ownedTokenIds = new Set();
            let inbound = new Map();
            let idsPartial = false;
            let indexed = null;
            try {
              indexed = await fetchIndexedNftHolds(pData.config.nftCa, wallet);
            } catch {
              indexed = null;
            }
            if (indexed && indexed.ownedIds.size === bal) {
              ownedTokenIds = indexed.ownedIds;
              inbound = indexed.inbound;
            } else {
              try {
                const log = await fetchNftTransferLog(pData.config.nftCa, wallet);
                inbound = log.inbound;
                ownedTokenIds = log.ownedIds;
              } catch {
                /* explorer rate-limit — try other ID sources */
              }
              if (indexed) {
                for (const [id, row] of indexed.inbound) {
                  ownedTokenIds.add(id);
                  const prev = inbound.get(id);
                  if (!prev?.ts && row.ts) inbound.set(id, { ...(prev || {}), ...row, hash: prev?.hash || '' });
                }
              }
            }
            if (ownedTokenIds.size !== bal) {
              try {
                const v2 = await fetchOwnedNftIdsV2(pData.config.nftCa, wallet);
                for (const id of v2) ownedTokenIds.add(id);
              } catch {
                /* */
              }
            }
            if (ownedTokenIds.size !== bal) {
              try {
                const enumerated = await enumerateOwnedIds(nftContract, wallet, bal);
                ownedTokenIds = enumerated.size >= ownedTokenIds.size ? enumerated : new Set([...ownedTokenIds, ...enumerated]);
              } catch {
                /* */
              }
            }
            if (ownedTokenIds.size !== bal) idsPartial = true;

            let brokerById = new Map();
            if (isBroker) {
              const list = await fetchWalletBrokers(wallet);
              for (const b of list) brokerById.set(Number(b.id), b);
            }

            let exactYieldUsd = 0;
            let earnedForProject = 0;
            const nfts = [];
            const activeMap = pData.activation?.activeTokenTiers || {};
            const ids = [...ownedTokenIds].sort((a, b) => a - b);
            const machineMeta = new Map();
            if (isMachine && ids.length) {
              setScanProgress(`Reading ${displayName} machine metadata (${ids.length})…`);
              await mapLimited(ids, 4, async (tokenId) => {
                machineMeta.set(tokenId, await fetchMachineMeta(pData.config.nftCa, tokenId));
              });
            }
            for (const tokenId of ids) {
              const tokenData = activeMap[tokenId];
              const machine = machineMeta.get(tokenId);
              const broker = brokerById.get(Number(tokenId));
              const earning = isBroker ? !!broker?.active : isMachine ? !!machine?.inked : !!tokenData;
              const tierId = tokenData?.t || 'T0';
              const tierObj = pData.tiers.find((t) => t.tier === tierId) || pData.tiers[0];
              const yieldValue = isMachine
                ? (earning ? machineAnnualForWeight(pData, machine?.weight || 100) : 0)
                : earning
                  ? (tierObj?.trackedAnnualYieldUsd || 0)
                  : 0;
              exactYieldUsd += yieldValue;
              const lastIn = inbound.get(tokenId);
              const startTs = earningStartTs({
                lastTransferTs: lastIn?.ts,
                activationTs: tokenData?.ts,
                isActive: earning,
              });
              const earnedValue = isMachine
                ? earning && startTs
                  ? (yieldValue / 365) * Math.max(0, (Date.now() / 1000 - startTs) / 86400)
                  : 0
                : earning
                  ? earnedUsdForNft(pData, tierId, startTs)
                  : 0;
              earnedForProject += earnedValue;
              const actTs = Number(tokenData?.ts) || 0;
              const act = earning
                ? activationTokenCostUsd(pData, {
                    tierId,
                    ts: actTs || lastIn?.ts,
                    tokenAmount: isMachine ? machine?.ink : undefined,
                    data,
                  })
                : { usd: 0, tokens: 0, tokenPriceUsd: 0 };
              nfts.push({
                id: `${pKey}-${wallet}-${tokenId}`,
                projectKey: pKey,
                nftCa: pData.config.nftCa,
                tokenId,
                ticker: pData.config.ticker,
                tierId,
                tierName: isMachine
                  ? (earning
                    ? `Awake · ${Number(machine?.multiplier || machine?.weight / 100 || 1).toFixed(1)}×`
                    : 'Dormant')
                  : isBroker
                    ? (earning ? 'Active Broker' : 'Inactive (shell)')
                  : earning
                    ? (tierObj?.name || tierId)
                    : 'Inactive',
                yieldValue,
                earnedValue,
                floorValue: floorUsd,
                tba: broker?.wallet || null,
                wallet,
                lastTransferTs: lastIn?.ts || 0,
                lastTransferHash: lastIn?.hash || null,
                minted: !!lastIn?.mint,
                activationTs: actTs,
                isActive: earning,
                alwaysOn: false,
                machineWeight: machine?.weight || 0,
                machineInk: machine?.ink || 0,
                imageUrl: machine?.imageUrl || null,
                purchaseEth: 0,
                basisUsd: 0,
                basisKnown: false,
                entryFloorUsd: floorUsdOn(pData, lastIn?.ts || actTs),
                activationCostUsd: act.usd,
                actTokens: act.tokens,
                actTokenPriceUsd: act.tokenPriceUsd,
              });
            }
            return {
              error: false,
              units: bal,
              floor: bal * floorUsd,
              yield: exactYieldUsd,
              earned: earnedForProject,
              asset: {
                projectKey: pKey,
                project: displayName,
                ticker: pData.config.ticker,
                logo: pData.config.logo || 'Stonkbroker.png',
                wallet,
                balance: bal,
                floorValue: bal * floorUsd,
                yieldValue: exactYieldUsd,
                earnedValue: earnedForProject,
                hasError: false,
                idsPartial,
                idsFound: ids.length,
                nfts,
                ...sumNftCosts(nfts),
              },
            };
          } catch (e) {
            console.error('Wallet read error', e);
            return null;
          }
      });

      for (const row of nftChunks) {
        if (!row) continue;
        totalUnits += row.asset.balance;
        totalFloorUsd += row.asset.floorValue;
        totalYieldUsd += row.asset.yieldValue;
        totalEarnedUsd += row.asset.earnedValue;
        if (row.error) portfolioHasErrors = true;
        ownedAssets.push(row.asset);
      }

      setScanProgress('Reading project token balances…');

      const tokenJobs = [];
      for (const target of navTokenScanTargets(data)) {
        for (const wallet of wallets) tokenJobs.push({ ...target, wallet });
      }

      const tokenChunks = await mapLimited(tokenJobs, 4, async ({ pKey, pData, wallet, ca }) => {
          const token = new ethers.Contract(ca, erc20Abi, provider);
          let decimals = 18;
          try {
            decimals = Number(await token.decimals());
          } catch {
            /* 18 */
          }
          try {
            const raw = await token.balanceOf(wallet);
            const amount = Number(ethers.formatUnits(raw, decimals));
            if (!(amount > 0)) return null;
            const circulating = pData.ownership?.circulatingSupply || 0;
            const annual = pData.cashflow?.holdersAnnualized || pData.cashflow?.revenueAnnualized || 0;
            const price = pData.market?.tokenPriceUsd || 0;
            const value = amount * price;
            const share = circulating > 0 ? amount / circulating : 0;
            const yieldValue = annual * share;
            let holdStart = 0;
            try {
              holdStart = await fetchTokenHoldStartTs(ca, wallet);
            } catch {
              holdStart = 0;
            }
            const earnedValue = earnedUsdForTokenPosition(pData, amount, holdStart);
            const entryPx = holdStart > 0 ? tokenPriceAtTs(pData, holdStart, { allowLive: false }) : 0;
            const entryValueUsd = entryPx > 0 ? amount * entryPx : 0;
            const tokenKey = `${pKey}:token`;
            return {
              floor: value,
              yield: yieldValue,
              earned: earnedValue,
              asset: {
                projectKey: tokenKey,
                project: projectName(tokenKey, pData.config.ticker),
                ticker: pData.config.ticker,
                logo: pData.config.logo || 'Stonkbroker.png',
                wallet,
                balance: amount,
                floorValue: value,
                entryValueUsd,
                yieldValue,
                earnedValue,
                hasError: false,
                nfts: [],
                tokenPosition: true,
                holdStartTs: holdStart,
              },
            };
          } catch (e) {
            console.error('Token read error', e);
            return null;
          }
      });

      for (const row of tokenChunks) {
        if (!row) continue;
        totalFloorUsd += row.floor;
        totalYieldUsd += row.yield;
        totalEarnedUsd += row.earned;
        ownedAssets.push(row.asset);
      }

      const allNfts = ownedAssets.flatMap((a) => a.nfts || []);
      if (allNfts.length) {
        setScanProgress('Reading what each seat was bought for…');
        await attachSaleCosts(provider, allNfts, data);
        totalEarnedUsd = 0;
        totalYieldUsd = 0;
        for (const asset of ownedAssets) {
          if (asset.tokenPosition) {
            totalEarnedUsd += Number(asset.earnedValue) || 0;
            totalYieldUsd += Number(asset.yieldValue) || 0;
            continue;
          }
          asset.earnedValue = (asset.nfts || []).reduce((sum, nft) => sum + (Number(nft.earnedValue) || 0), 0);
          asset.yieldValue = (asset.nfts || []).reduce((sum, nft) => sum + (Number(nft.yieldValue) || 0), 0);
          totalEarnedUsd += asset.earnedValue;
          totalYieldUsd += asset.yieldValue;
          Object.assign(asset, sumNftCosts(asset.nfts));
        }
      }

      setResults({
        floorUsd: totalFloorUsd,
        yieldUsd: totalYieldUsd,
        earnedUsd: totalEarnedUsd,
        totalUnits,
        hasErrors: portfolioHasErrors,
        ownedAssets,
      });
    } catch (err) {
      console.error(err);
      alert('Error connecting to the blockchain RPC. Please try again.');
    }

    setIsScanning(false);
    setScanProgress('');
    setScanComplete(true);
  };

  useEffect(() => {
    if (autoScan.current || !data || !urlWallets.trim()) return;
    autoScan.current = true;
    handleScan();
  }, [data, urlWallets]);

  const enrichProject = async (projectKey) => {
    if (enriched[projectKey]) return;
    setEnriched((e) => ({ ...e, [projectKey]: 'loading' }));
    const nfts = results.ownedAssets.flatMap((a) => (a.projectKey === projectKey ? a.nfts || [] : []));
    if (!nfts.length) {
      setEnriched((e) => ({ ...e, [projectKey]: 'done' }));
      return;
    }
    await mapLimited(nfts, 6, async (nft) => {
      nft.imageUrl = await fetchNftImage(nft.nftCa, nft.tokenId);
    });
    setResults((r) => ({
      ...r,
      ownedAssets: r.ownedAssets.map((a) => (
        a.projectKey === projectKey ? { ...a, ...sumNftCosts(a.nfts) } : a
      )),
    }));
    try {
      const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
      const cfg = data?.projects?.[projectKey]?.config || {};
      const registry = tbaRegistry(provider, {
        tbaRegistry: cfg.tbaRegistry,
      });
      await mapLimited(nfts, 8, async (nft) => {
        if (nft.tba) return;
        try {
          nft.tba = await resolveTbaAddress(registry, nft.nftCa, nft.tokenId, {
            tbaImplementation: cfg.tbaImplementation,
            tbaChainId: cfg.tbaChainId,
            tbaSalt: cfg.tbaSalt,
          });
        } catch (e) {
          console.error('TBA resolve failed', e);
        }
      });
      loadInventories(nfts.filter((n) => n.tba));
    } catch (e) {
      console.error(e);
    }
    setResults((r) => ({ ...r, ownedAssets: [...r.ownedAssets] }));
    setEnriched((e) => ({ ...e, [projectKey]: 'done' }));
  };

  const toggleProject = (projectKey) => {
    setOpenProjects((prev) => {
      const next = { ...prev, [projectKey]: !prev[projectKey] };
      if (next[projectKey]) enrichProject(projectKey);
      return next;
    });
  };

  const allNfts = results.ownedAssets.flatMap((a) => a.nfts || []);
  const aggregate = aggregateTbaHoldings(allNfts, inventories, priceIndex);
  const inventoriesPending = allNfts.some((n) => n.tba && inventories[n.tba]?.status === 'loading');
  const grouped = useMemo(() => groupByProject(results.ownedAssets), [results.ownedAssets]);
  const seatAssets = useMemo(() => grouped.filter((a) => !a.tokenPosition).sort(byFloor), [grouped]);
  const tokenAssets = useMemo(() => grouped.filter((a) => a.tokenPosition).sort(byFloor), [grouped]);
  const seatFloor = seatAssets.reduce((sum, a) => sum + (Number(a.floorValue) || 0), 0);
  const tokenSpot = tokenAssets.reduce((sum, a) => sum + (Number(a.floorValue) || 0), 0);
  const costTotals = useMemo(() => {
    let basisUsd = 0;
    let activationCostUsd = 0;
    let entryCostUsd = 0;
    let basisKnown = 0;
    let nftCount = 0;
    for (const g of grouped) {
      if (g.tokenPosition) continue;
      basisUsd += Number(g.basisUsd) || 0;
      activationCostUsd += Number(g.activationCostUsd) || 0;
      entryCostUsd += assetEntryCostUsd(g);
      basisKnown += Number(g.basisKnown) || 0;
      nftCount += (g.nfts || []).length;
    }
    return { basisUsd, activationCostUsd, entryCostUsd, basisKnown, nftCount, total: entryCostUsd };
  }, [grouped]);

  const tokenEarned = tokenAssets.reduce((sum, a) => sum + (Number(a.earnedValue) || 0), 0);
  const nftPaid = (() => {
    let sum = 0;
    let priced = 0;
    for (const asset of seatAssets) {
      for (const nft of asset.nfts || []) {
        const paid = nftAcquireCostUsd(nft);
        if (paid == null) continue;
        sum += paid;
        priced += 1;
      }
    }
    return priced ? sum : null;
  })();
  const nftActivation = seatAssets.reduce((sum, asset) => (
    sum + (asset.nfts || []).reduce((inner, nft) => inner + (Number(nft.activationCostUsd) || 0), 0)
  ), 0);
  const nftEarned = seatAssets.reduce((sum, asset) => sum + (Number(asset.earnedValue) || 0), 0);
  const nftPnl = nftPaid == null ? null : seatFloor + nftEarned - nftPaid - nftActivation;
  let tokenCost = 0;
  let tokenMarked = 0;
  let tokenPriced = 0;
  for (const asset of tokenAssets) {
    const entry = Number(asset.entryValueUsd) || 0;
    if (!(entry > 0)) continue;
    tokenPriced += 1;
    tokenCost += entry;
    tokenMarked += Number(asset.floorValue) || 0;
  }
  const tokenPnl = tokenPriced > 0 ? tokenMarked - tokenCost + tokenEarned : null;
  const tokenRoi = tokenCost > 0.01 && tokenPnl != null ? (tokenPnl / tokenCost) * 100 : null;
  const nftInvested = nftPaid == null ? null : nftPaid + nftActivation;
  const nftCashRoi = nftInvested != null && nftInvested > 0.01 ? (nftEarned / nftInvested) * 100 : null;
  const nftRoe = nftPnl != null && nftInvested > 0.01 ? (nftPnl / nftInvested) * 100 : null;
  const tokenForecast = tokenAssets.reduce((sum, asset) => sum + (Number(asset.yieldValue) || 0), 0) * forecastYears;
  const nftForecast = seatAssets.reduce((sum, asset) => sum + (Number(asset.yieldValue) || 0), 0) * forecastYears;
  const bookRows = returnRows(seatAssets, tokenAssets);
  const earnedTotal = bookRows.reduce((sum, row) => sum + row.earned, 0);
  const roiCapital = bookRows.reduce((sum, row) => sum + (row.cost > 0 ? row.cost : 0), 0);
  const roiGain = bookRows.reduce((sum, row) => sum + (row.cost > 0.01 && row.gain != null ? row.gain : 0), 0);
  const totalRoi = roiCapital > 0.01 ? (roiGain / roiCapital) * 100 : null;

  useEffect(() => {
    if (!grouped.length) return;
    let cancelled = false;
    grouped.forEach(async (asset) => {
      const prev = pickedThumb.current[asset.projectKey];
      if (prev?.src) return;
      if (!prev && (asset.nfts || []).length) {
        const pick = pickOwnedNft(asset.nfts);
        pickedThumb.current[asset.projectKey] = { tokenId: pick?.tokenId };
      } else if (!prev) {
        pickedThumb.current[asset.projectKey] = { tokenId: null };
      }
      const thumb = await resolveThumb(asset, pickedThumb.current[asset.projectKey]);
      pickedThumb.current[asset.projectKey] = thumb;
      if (!cancelled) {
        setThumbs((cur) => ({ ...cur, [asset.projectKey]: thumb }));
      }
    });
    return () => { cancelled = true; };
  }, [grouped]);
  const hasHoldings = results.ownedAssets.length > 0;
  const formatRoi = (pct, digits = 2) => (pct == null ? '—' : `${pct.toFixed(digits)}%`);
  const forecastUsd = bookRows.reduce((sum, row) => sum + row.yieldAnnual, 0) * forecastYears;
  const dropSeries = useMemo(
    () => walletDailyDrops(results.ownedAssets, data),
    [results.ownedAssets, data],
  );
  const historyChart = useMemo(
    () => bucketDropSeries(dropSeries.labels, dropSeries.data, historyGrain),
    [dropSeries, historyGrain],
  );
  const cashMark = useMemo(
    () => portfolioCashMarkSeries(results.ownedAssets, data),
    [results.ownedAssets, data],
  );
  const valueSeries = useMemo(
    () => portfolioValueSeries(results.ownedAssets, data),
    [results.ownedAssets, data],
  );
  const copyLabel =
    copyState === 'busy' ? 'Copying…' :
    copyState === 'copied' ? 'Copied — paste into X' :
    copyState === 'saved' ? 'PNG saved' :
    copyState === 'fail' ? 'Copy failed' :
    'Copy';

  const copyOk = copyState === 'copied' || copyState === 'saved';

  const handleCopySnapshot = async () => {
    if (copyState === 'busy') return;
    setCopyState('busy');
    try {
      const resolved = {};
      await Promise.all(grouped.map(async (asset) => {
        const thumb = await resolveThumb(asset, thumbs[asset.projectKey] || pickedThumb.current[asset.projectKey]);
        pickedThumb.current[asset.projectKey] = thumb;
        resolved[asset.projectKey] = thumb;
      }));
      setThumbs((cur) => ({ ...cur, ...resolved }));
      const cardRow = (asset) => {
        const thumb = resolved[asset.projectKey] || {};
        const forecast = (Number(asset.yieldValue) || 0) * forecastYears;
        return {
          name: holdingName(asset),
          detail: asset.tokenPosition
            ? `${formatAmount(asset.balance)} ${asset.ticker || ''} · earned ${quietCash(asset.earnedValue || 0)}`.trim()
            : `${asset.balance} ${Number(asset.balance) === 1 ? 'seat' : 'seats'} · earned ${quietCash(asset.earnedValue || 0)} · ${forecastYears}y ${quietCash(forecast)}`,
          value: formatCurrency(asset.floorValue),
          thumb: thumb.src || officialLogoSrc(asset),
          mark: asset.ticker,
        };
      };
      const copied = await copyPortfolioSnapshot({
        horizon: forecastYears,
        value: formatCurrency(results.floorUsd),
        seatsValue: formatCurrency(seatFloor),
        tokensValue: formatCurrency(tokenSpot),
        seatUsd: seatFloor,
        tokenUsd: tokenSpot,
        basis: costTotals.nftCount > 0 ? formatCurrency(costTotals.total) : '',
        cashLabel: 'NFTs',
        cash: formatCurrency(seatFloor),
        roi: formatPnl(nftPnl),
        roiLabel: 'NFT P&L',
        units: formatCurrency(tokenSpot),
        tokenPnl: formatPnl(tokenPnl),
        nftPnlColor: nftPnl == null ? '#8b929b' : nftPnl < -0.01 ? '#fb7185' : '#00a804',
        tokenPnlColor: tokenPnl == null ? '#8b929b' : tokenPnl < -0.01 ? '#fb7185' : '#34d399',
        seats: seatAssets.map(cardRow),
        tokens: tokenAssets.map(cardRow),
      });
      setCopyState(copied ? 'copied' : 'saved');
    } catch (err) {
      console.error('portfolio copy failed', err);
      setCopyState('fail');
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl mt-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Portfolio tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Comma-separated wallets. NFTs use current yield. Dashboard project tokens (STONK, MANCER,
            and the rest) are marked at spot. History counts drops after you received the NFT (and
            after activation). Basis is the inbound mint or purchase ETH; activation tokens are priced
            from the daily close nearest that date.
          </p>
        </div>
      </div>

      <div data-share-omit className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Paste Wallet Address (e.g. 0x123..., 0x456...)"
          className="bg-[#08090b] border border-[#1e2228] text-white px-4 py-2.5 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleScan}
          disabled={isScanning}
          className={`${isScanning ? 'bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-bold px-6 py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-md`}
        >
          {isScanning ? 'Scanning Ledger...' : 'Scan Portfolio'}
        </button>
        {scanComplete && hasHoldings && (
          <button
            type="button"
            data-share-omit
            onClick={handleCopySnapshot}
            disabled={copyState === 'busy'}
            title="Copy the whole portfolio for X"
            className={`sm:min-w-[11.5rem] inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-extrabold shadow-md transition disabled:opacity-60 ${
              copyOk
                ? 'bg-emerald-950 text-emerald-300 ring-2 ring-emerald-500/70'
                : copyState === 'fail'
                  ? 'bg-rose-950 text-rose-300 ring-2 ring-rose-500/60'
                  : 'bg-white text-[#08090b] hover:bg-emerald-200'
            }`}
          >
            {copyOk ? (
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                <path d="M16 6l-4-4-4 4" />
                <path d="M12 2v14" />
              </svg>
            )}
            {copyLabel}
          </button>
        )}
      </div>

      {!isScanning && !scanComplete && (
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Paste a wallet to load holdings. Or open{' '}
          <Link to="/ecosystem" className="text-slate-200 underline underline-offset-2 hover:text-white">
            Ecosystem
          </Link>
          {' / '}
          <Link to="/" className="text-slate-200 underline underline-offset-2 hover:text-white">
            a project
          </Link>{' '}
          to browse live stats first.
        </p>
      )}

      {isScanning && (
        <p className="text-xs text-slate-300 text-center mb-6">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-2 align-middle" />
          {scanProgress || 'Scanning owned Token IDs, last transfers, and activations…'}
          <span className="block text-slate-500 mt-1">Large wallets are read one collection at a time so the explorer does not drop the request.</span>
        </p>
      )}

      {scanComplete && (
        <div>
          <p className="text-sm text-slate-400 mb-5 leading-relaxed">
            This view stays public.{' '}
            <a
              href={SAVI_X}
              target="_blank"
              rel="noreferrer"
              className="text-slate-200 underline underline-offset-2 hover:text-white"
            >
              Follow @SaviCrypto
            </a>{' '}
            for new projects and daily changes.
          </p>
          <NfaNote
            className="mb-5"
            extra="The 1Y / 3Y / 5Y / 10Y figures multiply the current trailing run-rate. They are not a prediction that yield stays constant."
          />
          {hasHoldings && (
            <div data-share-omit className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-extrabold text-white">Share this wallet on X</p>
                <p className="text-[11px] text-emerald-200/80 mt-0.5">
                  Copies the whole portfolio for X. Seats and tokens stay in their own columns. Addresses stay off the image.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySnapshot}
                disabled={copyState === 'busy'}
                className={`shrink-0 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-extrabold shadow-lg shadow-emerald-500/20 transition disabled:opacity-60 ${
                  copyOk
                    ? 'bg-emerald-500 text-black'
                    : copyState === 'fail'
                      ? 'bg-rose-500 text-white'
                      : 'bg-emerald-400 text-black hover:bg-emerald-300'
                }`}
              >
                {copyOk ? (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                    <path d="M16 6l-4-4-4 4" />
                    <path d="M12 2v14" />
                  </svg>
                )}
                {copyLabel}
              </button>
            </div>
          )}
          {!hasHoldings ? (
            <p className="text-sm text-slate-400">No ecosystem NFTs or project tokens found in the provided wallet(s).</p>
          ) : (
            <>
          <Copyable id="portfolio-value" className="scroll-mt-36 bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Portfolio value</h3>
                <p className="mt-1 max-w-xl text-xs text-slate-500">
                  Seat floors plus token closes, from the day each position was received. Cash already paid out is not added back.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5 pr-10">
                {[
                  { label: 'Total value', value: formatCurrency(results.floorUsd) },
                  { label: 'Token value', value: formatCurrency(tokenSpot) },
                  { label: 'NFT value', value: formatCurrency(seatFloor) },
                ].map((view) => (
                  <div
                    key={view.label}
                    className="min-w-[7.5rem] rounded-lg border border-[#1e2228] px-3 py-1.5 text-right"
                  >
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">{view.label}</span>
                    <span className="block text-sm font-extrabold text-white">{view.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative h-56 w-full">
              {valueSeries.labels.length > 1 ? (
                <Line
                  data={{
                    labels: formatLabels(valueSeries.labels),
                    datasets: [
                      {
                        label: 'Total',
                        data: valueSeries.total,
                        borderColor: '#e7e9ec',
                        backgroundColor: 'transparent',
                        tension: 0.25,
                        pointRadius: 0,
                        borderWidth: 2,
                        spanGaps: true,
                      },
                      {
                        label: 'NFTs',
                        data: valueSeries.seats,
                        borderColor: '#f7931a',
                        backgroundColor: 'transparent',
                        tension: 0.25,
                        pointRadius: 0,
                        borderWidth: 1.5,
                        spanGaps: true,
                      },
                      {
                        label: 'Tokens',
                        data: valueSeries.tokens,
                        borderColor: '#34d399',
                        backgroundColor: 'transparent',
                        tension: 0.25,
                        pointRadius: 0,
                        borderWidth: 1.5,
                        spanGaps: true,
                      },
                    ],
                  }}
                  options={valueChartOptions}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
                  Not enough daily closes to draw the book yet
                </div>
              )}
            </div>
          </Copyable>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-faint">Forecast window</span>
            <div className="flex bg-[#08090b] rounded-lg p-1 border border-[#1e2228]">
              {FORECAST_YEARS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setForecastYears(y)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${
                    forecastYears === y ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {y}y
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">Moves the forecast on the summaries. Earned stays the cash already paid.</span>
          </div>

          <div className="mb-8 flex flex-col gap-4">
            <p className="text-[11px] text-slate-500">
              Together {quietCash(earnedTotal)} cashflow · ROI {formatRoi(totalRoi, 1)}. Cashflow is money already paid. ROI is mark plus that cash, over what was paid.
            </p>
            {tokenAssets.length > 0 && (
              <section className="rounded-xl border border-[#1e2228] bg-[#08090b] p-4 md:p-6">
                <h3 className="mb-4 text-sm font-bold text-emerald-300">Tokens</h3>
                <StatStrip
                  rows={[
                    { label: 'Value', value: formatCurrency(tokenSpot) },
                    { label: 'Cost', value: tokenCost > 0 ? quietCash(tokenCost) : '—' },
                    { label: 'Cashflow', value: quietCash(tokenEarned), tone: 'text-emerald-300' },
                    { label: 'P&L', value: formatPnl(tokenPnl), tone: pnlTone(tokenPnl) },
                    { label: `${forecastYears}y forecast`, value: quietCash(tokenForecast), tone: 'text-emerald-300' },
                    { label: 'ROI', value: formatRoi(tokenRoi, 1), tone: pnlTone(tokenRoi) },
                  ]}
                />
                <TokenDetail assets={tokenAssets} sort="spot" formatCurrency={formatCurrency} formatPnl={formatPnl} pnlTone={pnlTone} />
              </section>
            )}
            {seatAssets.length > 0 && (
              <section className="rounded-xl border border-[#1e2228] bg-[#08090b] p-4 md:p-6">
                <h3 className="mb-4 text-sm font-bold text-amber-300">NFTs</h3>
                <StatStrip
                  rows={[
                    { label: 'Value', value: formatCurrency(seatFloor) },
                    { label: 'NFT cost', value: nftPaid == null ? '—' : quietCash(nftPaid) },
                    { label: 'Activation', value: quietCash(nftActivation) },
                    { label: 'Invested', value: nftInvested == null ? '—' : quietCash(nftInvested) },
                    { label: 'Cashflow', value: quietCash(nftEarned), tone: 'text-emerald-300' },
                    { label: `${forecastYears}y forecast`, value: quietCash(nftForecast), tone: 'text-emerald-300' },
                    { label: 'ROI', value: formatRoi(nftCashRoi, 1), tone: pnlTone(nftCashRoi) },
                    { label: 'P&L', value: formatPnl(nftPnl), tone: pnlTone(nftPnl) },
                    { label: 'ROE', value: formatRoi(nftRoe, 1), tone: pnlTone(nftRoe) },
                  ]}
                />
                <SeatDetail assets={seatAssets} sort="floor" formatCurrency={formatCurrency} formatPnl={formatPnl} formatRoi={formatRoi} pnlTone={pnlTone} />
              </section>
            )}
          </div>

          {(seatAssets.some((g) => g.floorValue > 0) || tokenAssets.some((g) => g.floorValue > 0)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {seatAssets.some((g) => g.floorValue > 0) && (
                <Copyable id="floor" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                  <h3 className="text-sm font-bold text-white mb-4 pr-8">Seat floors</h3>
                  <SliceChart
                    noun="Seats"
                    format={formatCurrency}
                    slices={seatAssets.filter((g) => g.floorValue > 0).map((g, i) => ({
                      label: projectName(g.projectKey, g.ticker),
                      value: g.floorValue,
                      color: PIE_COLORS[i % PIE_COLORS.length],
                    }))}
                  />
                </Copyable>
              )}
              {tokenAssets.some((g) => g.floorValue > 0) && (
                <Copyable id="tokens" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                  <h3 className="text-sm font-bold text-white mb-4 pr-8">Token spot</h3>
                  <SliceChart
                    noun="Tokens"
                    format={formatCurrency}
                    slices={tokenAssets.filter((g) => g.floorValue > 0).map((g, i) => ({
                      label: g.ticker || projectName(g.projectKey, g.ticker),
                      value: g.floorValue,
                      color: PIE_COLORS[i % PIE_COLORS.length],
                    }))}
                  />
                </Copyable>
              )}
            </div>
          )}

          {seatAssets.length > 0 && (
            <Copyable id="portfolio-drops" className="scroll-mt-36 bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-8">
              <div className="flex items-center justify-between gap-2 mb-2 pr-8">
                <h3 className="text-sm font-bold text-white">Earned drops</h3>
                <div data-share-omit><GrainBar value={historyGrain} onChange={setHistoryGrain} /></div>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Cash credited after each seat opened. {GRAINS.find((g) => g.id === historyGrain)?.title} buckets. The forecast window does not change this chart.
              </p>
              <div className="relative h-44 w-full">
                {historyChart.labels.length ? (
                  <Bar
                    data={{
                      labels: historyGrain === 'd' ? formatLabels(historyChart.labels) : historyChart.labels,
                      datasets: [{
                        label: 'Drops',
                        data: historyChart.data,
                        backgroundColor: STREAM_COLORS.holdersRev,
                        borderRadius: 3,
                        maxBarThickness: 22,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#1e2228' } },
                        y: { ticks: { color: '#94a3b8', callback: tickMoney }, grid: { color: '#1e2228' }, beginAtZero: true, unit: ccy },
                      },
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-4">
                    No dated drops in this wallet yet
                  </div>
                )}
              </div>
            </Copyable>
          )}

          {cashMark.labels.length > 1 && (
            <Copyable id="cash-mark" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-8">
              <h3 className="text-sm font-bold text-white mb-1 pr-8">Cash vs mark</h3>
              <p className="text-xs text-slate-500 mb-3">
                Cash is what these seats were paid after they opened. Mark is the replacement cost that day, floor plus activation tokens, minus what the seat cost to open.
              </p>
              <div className="relative h-52 w-full">
                <Line
                  data={{
                    labels: formatLabels(cashMark.labels),
                    datasets: [
                      {
                        label: 'Cumulative cash',
                        data: cashMark.cash,
                        borderColor: '#00a804',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 0,
                        spanGaps: true,
                      },
                      {
                        label: 'Mark change',
                        data: cashMark.mark,
                        borderColor: '#94a3b8',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 0,
                        spanGaps: true,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10 } } },
                    scales: {
                      x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#1e2228' } },
                      y: { ticks: { color: '#94a3b8', callback: tickMoney }, grid: { color: '#1e2228' }, unit: ccy },
                    },
                  }}
                />
              </div>
            </Copyable>
          )}

          {(() => {
            const books = [
              seatAssets.length ? {
                id: 'portfolio-seats',
                title: 'Seats',
                note: `${results.totalUnits} ${results.totalUnits === 1 ? 'seat' : 'seats'} · floor ${formatCurrency(seatFloor)}`,
                assets: seatAssets,
              } : null,
              tokenAssets.length ? {
                id: 'portfolio-tokens',
                title: 'Tokens',
                note: `${tokenAssets.length} ${tokenAssets.length === 1 ? 'balance' : 'balances'} · spot ${formatCurrency(tokenSpot)}`,
                assets: tokenAssets,
              } : null,
            ].filter(Boolean);
            if (!books.length) return null;
            return books.map((book, bookIndex) => (
          <section key={book.id} id={book.id} className="scroll-mt-36 mb-8">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#1e2228] pb-2">
            <div>
              <h3 className="text-sm font-bold text-white">{book.title}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{book.note}</p>
            </div>
            {bookIndex === 0 && (
              <CsvButton filename="savi-portfolio.csv" rows={portfolioCsvRows(grouped)} />
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {book.assets.map((asset) => {
                const open = !!openProjects[asset.projectKey];
                const entryCost = assetEntryCostUsd(asset);
                const seatCosts = asset.tokenPosition ? [] : (asset.nfts || []).map((nft) => nftAcquireCostUsd(nft));
                const paid = asset.tokenPosition
                  ? 0
                  : (seatCosts.some((cost) => cost == null) ? null : seatCosts.reduce((sum, cost) => sum + cost, 0));
                const activation = asset.tokenPosition
                  ? 0
                  : (asset.nfts || []).reduce((sum, nft) => sum + (Number(nft.activationCostUsd) || 0), 0);
                const invested = paid == null ? null : paid + activation;
                const seatEarned = Number(asset.earnedValue) || 0;
                const markPnl = asset.tokenPosition
                  ? (Number(asset.entryValueUsd) > 0
                    ? asset.floorValue - asset.entryValueUsd + seatEarned
                    : null)
                  : (invested == null ? null : asset.floorValue + seatEarned - invested);
                const seatRoe = asset.tokenPosition || invested == null ? null : moneyRatio(markPnl, invested);
                const payback = asset.tokenPosition ? null : paybackMonths(entryCost, asset.yieldValue);
                const spotOnly = asset.tokenPosition && !(Number(asset.yieldValue) > 0);
                return (
                <Copyable key={asset.projectKey} id={`holding-${asset.projectKey}`} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <button
                    type="button"
                    onClick={() => toggleProject(asset.projectKey)}
                    className="w-full flex items-center justify-between gap-3 pr-8 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {thumbs[asset.projectKey]?.src || officialLogoSrc(asset) ? (
                        <img
                          src={thumbs[asset.projectKey]?.src || officialLogoSrc(asset)}
                          className="w-10 h-10 rounded-lg object-cover border border-[#1e2228] bg-[#0e1013]"
                          alt={thumbs[asset.projectKey]?.tokenId != null ? `#${thumbs[asset.projectKey].tokenId}` : asset.ticker}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-[#1e2228] bg-[#0e1013] flex items-center justify-center text-[10px] font-extrabold text-slate-400">
                          {(asset.ticker || '?').slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">
                          {holdingName(asset)}
                        </h4>
                        <p data-share-omit className="text-[10px] text-slate-400 font-mono">
                          {(asset.wallets || [asset.wallet]).map((w) => `${w.slice(0, 6)}...${w.slice(-4)}`).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">
                        {asset.hasError ? (
                          <span className="text-rose-400 border border-rose-500/50 bg-rose-900/20 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                            ID Sync Error
                          </span>
                        ) : (
                          <span className="text-white">{formatCurrency(asset.floorValue)}</span>
                        )}
                      </p>
                      {asset.idsPartial && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          Showing {asset.idsFound || (asset.nfts || []).length} of {asset.balance} IDs — yield is for listed NFTs only
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {asset.tokenPosition ? (
                          <>
                            {`${formatAmount(asset.balance)} ${asset.ticker || ''}`.trim()}
                            {Number(asset.entryValueUsd) > 0 ? ` · Cost ${quietCash(asset.entryValueUsd)}` : ' · Spot'}
                            {markPnl != null ? ` · ${formatPnl(markPnl)}` : ''}
                            {` · Earned ${quietCash(asset.earnedValue || 0)}`}
                            {Number(asset.yieldValue) > 0
                              ? ` · ${forecastYears}y ${quietCash((asset.yieldValue || 0) * forecastYears)}`
                              : ''}
                          </>
                        ) : (
                          <>
                            {`${asset.balance} ${Number(asset.balance) === 1 ? 'seat' : 'seats'}`}
                            {` · NFT ${paid == null ? '—' : quietCash(paid)} · Activation ${quietCash(activation)} · Invested ${invested == null ? '—' : quietCash(invested)} · Earned ${quietCash(seatEarned)} · ${formatPnl(markPnl)}`}
                            {seatRoe != null ? ` · ROE ${formatRoi(seatRoe, 1)}` : ''}
                            {` · ${forecastYears}y ${quietCash((asset.yieldValue || 0) * forecastYears)}`}
                            {payback != null ? ` · Payback ${formatPaybackMonths(payback)}` : ''}
                          </>
                        )}
                      </p>
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {open && asset.tokenPosition && (
                    <p className="text-[11px] text-slate-500 mt-3 border-t border-[#1e2228] pt-3">
                      {spotOnly
                        ? 'Wallet balance of the project token, marked at the dashboard price. Seat yield stays on the NFTs.'
                        : (
                          <>
                            Token position. History counts this wallet&apos;s share of protocol cash-flow after the
                            current hold started
                            {asset.holdStartTs ? ` (${formatDate(asset.holdStartTs)})` : ''}.
                          </>
                        )}
                    </p>
                  )}

                  {open && asset.nfts?.length > 0 && (
                    <div className="overflow-x-auto border-t border-[#1e2228] mt-3">
                      {enriched[asset.projectKey] === 'loading' && (
                        <p className="text-[11px] text-slate-500 animate-pulse py-2">Loading NFT details…</p>
                      )}
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                            <th className="py-2 pr-2 font-medium">NFT</th>
                            <th className="py-2 px-2 font-medium">NFT price</th>
                            <th className="py-2 px-2 font-medium">Activation</th>
                            <th className="py-2 pl-2 font-medium text-right">Return</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e2228]/80">
                          {asset.nfts.map((nft) => {
                            const open = expandedNft === nft.id;
                            const inv = nft.tba ? inventories[nft.tba] : null;
                            const basisUsd = Number(nft.basisUsd) || 0;
                            const actUsd = Number(nft.activationCostUsd) || 0;
                            const actTokens = Number(nft.actTokens) || Number(nft.machineInk) || 0;
                            const econ = seatEconomics(nft);
                            return (
                              <React.Fragment key={nft.id}>
                                <tr
                                  className="cursor-pointer hover:bg-[#1e2228]/30"
                                  onClick={() => setExpandedNft(open ? null : nft.id)}
                                >
                                  <td className="py-2 pr-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {nft.imageUrl ? (
                                        <img
                                          src={nft.imageUrl}
                                          alt={`#${nft.tokenId}`}
                                          className="h-10 w-10 rounded-md object-cover border border-[#1e2228] bg-[#0e1013]"
                                        />
                                      ) : (
                                        <div className="h-10 w-10 rounded-md border border-[#1e2228] bg-[#0e1013]" />
                                      )}
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">
                                          #{nft.tokenId} · {nft.tierName}
                                        </p>
                                        <p className="text-[10px] text-slate-500">Floor {formatCurrency(nft.floorValue)}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-300 whitespace-nowrap">
                                    <div className="text-white">
                                      {nft.basisKnown
                                        ? (basisUsd > 0 ? formatCurrency(basisUsd) : nft.minted ? 'Free' : '—')
                                        : nft.minted
                                          ? 'Free'
                                          : '—'}
                                    </div>
                                    <div className="text-slate-500">
                                      {formatDate(nft.lastTransferTs)}
                                      {' · '}
                                      {nft.basisKnown ? (nft.minted ? 'Mint' : 'Buy') : (nft.minted ? 'Mint' : 'No sale payment')}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-300 whitespace-nowrap">
                                    {nft.machineInk > 0 || nft.machineWeight > 0 ? (
                                      <>
                                        <div className="text-white">{actUsd > 0 ? formatCurrency(actUsd) : '—'}</div>
                                        <div className="text-slate-500">
                                          {nft.isActive ? 'Inked' : 'Dormant'}
                                          {nft.machineInk ? ` · ${nft.machineInk.toLocaleString()} ink` : ''}
                                          {nft.machineWeight ? ` · wt ${nft.machineWeight}` : ''}
                                        </div>
                                      </>
                                    ) : nft.isActive ? (
                                      <>
                                        <div className="text-white">{actUsd > 0 ? formatCurrency(actUsd) : '—'}</div>
                                        <div className="text-slate-500">
                                          {formatDate(nft.activationTs)}
                                          {actTokens > 0
                                            ? ` · ${formatAmount(actTokens)} ${nft.ticker || ''}`.trim()
                                            : ''}
                                        </div>
                                      </>
                                    ) : (
                                      'Not active'
                                    )}
                                  </td>
                                  <td className="py-2 pl-2 text-right text-[11px] whitespace-nowrap">
                                    <div className="text-slate-300">Invested {quietCash(econ.invested)}</div>
                                    <div className="text-slate-300">Earned {quietCash(econ.earned)} · ROI {formatRoi(econ.cashRoi, 1)}</div>
                                    <div className={`font-bold ${pnlTone(econ.pnl)}`}>P&amp;L {formatPnl(econ.pnl)} · ROE {formatRoi(econ.roe, 1)}</div>
                                    <div className="text-[10px] font-medium text-slate-400">
                                      {forecastYears}y {quietCash((nft.yieldValue || 0) * forecastYears)}
                                      {' · '}
                                      Payback {formatPaybackMonths(paybackMonths(nftEntryCostUsd(nft), nft.yieldValue))}
                                    </div>
                                  </td>
                                </tr>
                                {open && (
                                  <tr>
                                    <td colSpan="4" className="pb-3 pt-1">
                                      {enriched[asset.projectKey] === 'loading' && !nft.tba ? (
                                        <p className="text-xs text-slate-500 animate-pulse">Resolving tokenbound wallet...</p>
                                      ) : nft.tba ? (
                                        <p data-share-omit className="text-[10px] text-slate-500 font-mono mb-2">
                                          TBA{' '}
                                          <a
                                            href={explorerAddressUrl(nft.tba)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline underline-offset-2 hover:text-slate-300"
                                          >
                                            {nft.tba.slice(0, 6)}...{nft.tba.slice(-4)}
                                          </a>
                                        </p>
                                      ) : (
                                        <p className="text-xs text-rose-400 mb-2">Could not resolve the tokenbound wallet.</p>
                                      )}
                                      {inv?.status === 'loading' && (
                                        <p className="text-xs text-slate-500 animate-pulse">Reading tokenbound balances...</p>
                                      )}
                                      {inv?.status === 'error' && (
                                        <p className="text-xs text-rose-400">Could not load TBA inventory.</p>
                                      )}
                                      {inv?.status === 'ok' && (
                                        <HoldingRows
                                          tokens={inv.tokens}
                                          priceIndex={priceIndex}
                                          formatCurrency={formatCurrency}
                                        />
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Copyable>
              );
              })}
          </div>
          </section>
            ));
          })()}

          {allNfts.length > 0 && (
            <Copyable id="tokenbound" className="mt-6 bg-[#08090b] border border-[#1e2228] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setAggregateOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 pr-12 text-left hover:bg-[#1e2228]/30 transition"
              >
                <span className="text-sm font-bold text-white">All assets in tokenbound wallets</span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    {inventoriesPending ? 'loading…' : `${aggregate.length} asset${aggregate.length === 1 ? '' : 's'}`}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform ${aggregateOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {aggregateOpen && (
                <div className="px-4 pb-4 border-t border-[#1e2228] pt-3">
                  <p className="text-[10px] text-slate-500 mb-3">
                    Combined ERC-20 and NFT balances across every resolved TBA for supported collections in this scan.
                  </p>
                  {inventoriesPending && aggregate.length === 0 ? (
                    <p className="text-xs text-slate-500 animate-pulse">Reading tokenbound wallets...</p>
                  ) : (
                    <HoldingRows tokens={aggregate} priceIndex={priceIndex} formatCurrency={formatCurrency} />
                  )}
                </div>
              )}
            </Copyable>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
