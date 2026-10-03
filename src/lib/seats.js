import { NIGHTSHADES_FACTIONS, typicalNightshadesSeat } from './nightshades';
import { protocolFeeCols, protocolRevenueChart, windowLen } from './yieldHistory';

function coc(annual, cost) {
  return cost > 0 && annual > 0 ? (annual / cost) * 100 : 0;
}

function sumTail(values, n) {
  return (values || []).slice(-n).reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Cheapest listed Wall, in ETH. A star is the NFT, not the membership tier. */
export function cheapestWallEth(market) {
  const stars = (market?.starFloorEth || []).map(Number).filter((n) => n > 0);
  if (stars.length) return Math.min(...stars);
  return Number(market?.nftFloorEth) || 0;
}

export function starFloorNote(market) {
  return (market?.starFloorEth || [])
    .map((v, i) => (Number(v) > 0 ? `${i + 1}★ ${Number(v).toFixed(3)}` : null))
    .filter(Boolean)
    .join(' · ');
}

/**
 * What the cheapest live seat costs at last sync, and what it pays.
 * `listed` is the OpenSea floor plus the T0 token requirement.
 * A snipe replaces the floor with the AMM specific-buy quote; the token
 * requirement stays, because the quote is the price of the NFT.
 */
export function listedSeat(meta, project) {
  const night = meta?.key === 'nightshades' || project?.config?.kind === 'factions';
  if (night) {
    const seat = typicalNightshadesSeat(project?.factions);
    return {
      name: 'Typical Shade',
      annual: seat.annual,
      listed: seat.cost,
      roi: seat.roi,
      note: 'One faction, weighted by actives',
      floorEth: null,
      act: null,
    };
  }
  const t0 = project?.tiers?.[0];
  const annual = Number(t0?.trackedAnnualYieldUsd) || 0;
  const kind = project?.config?.kind;
  const tokenUsd = Number(project?.market?.tokenPriceUsd) || 0;
  const act = (Number(t0?.reqTokens) || 0) * tokenUsd;
  if (kind === 'cashflow' || kind === 'vault' || kind === 'token') {
    const listed = Number(t0?.entryUsd) > 0 ? Number(t0.entryUsd) : act;
    return {
      name: t0?.name || 'Seat',
      annual,
      listed,
      roi: coc(annual, listed),
      note: 'Token seat',
      floorEth: null,
      act,
    };
  }
  const eth = Number(project?.market?.ethPriceUsd) || 0;
  const floorEth = meta?.key === 'cardwall'
    ? cheapestWallEth(project?.market)
    : (Number(project?.market?.nftFloorEth) || 0);
  const listed = floorEth * eth + act;
  const stars = meta?.key === 'cardwall' ? starFloorNote(project?.market) : '';
  return {
    name: t0?.name || 'Seat',
    annual,
    listed,
    roi: coc(annual, listed),
    note: stars || 'Floor + activation',
    floorEth,
    act,
  };
}

/** AMM quote for the NFT, plus the same activation tokens the floor seat uses. */
export function snipeSeatUsd(quoteUsd, activationUsd) {
  if (!(Number(quoteUsd) > 0)) return null;
  return Number(quoteUsd) + (Number(activationUsd) || 0);
}

/**
 * Nightshades snipe, weighted the same way as the typical Shade.
 * Missing a faction quote means the average is not the seat.
 */
export function nightshadesSnipeUsd(factions, quoteUsdByFaction, tierId = 'T0') {
  let costW = 0;
  let w = 0;
  for (const id of NIGHTSHADES_FACTIONS) {
    const fp = factions?.[id];
    const quote = Number(quoteUsdByFaction?.[id]);
    if (!fp || !(quote > 0)) return null;
    const t = (fp.tiers || []).find((x) => x.tier === tierId) || fp.tiers?.[0];
    if (!t) return null;
    const active = Number(fp.activation?.activeCount);
    const weight = active > 0 ? active : 1;
    const act = (Number(t.reqTokens) || 0) * (Number(fp.market?.tokenPriceUsd) || 0);
    costW += (quote + act) * weight;
    w += weight;
  }
  return w > 0 ? costW / w : null;
}

function feeUsd(project, timeframe) {
  const chart = protocolRevenueChart(project, { skipLedger: true });
  if (chart.kind !== 'protocol' && chart.kind !== 'cashflow') return 0;
  const cols = chart.kind === 'cashflow'
    ? (chart.cols || []).filter((c) => c.key === 'fees')
    : protocolFeeCols(chart.cols);
  if (!cols.length) return 0;
  const n = windowLen(timeframe, cols[0].data?.length || 0);
  return cols.reduce((s, c) => s + sumTail(c.data, n), 0);
}

function seriesUsd(values, timeframe) {
  const n = windowLen(timeframe, (values || []).length);
  return sumTail(values, n);
}

/**
 * Trailing protocol-kept fees. Holder payouts, gacha pulls, and yield÷365
 * stay visible and out of the mix.
 */
export function revenueRows(project, timeframe = '30d') {
  const rows = [];
  const fees = feeUsd(project, timeframe);
  if (fees > 0) rows.push({ usd: fees, inMix: true, source: 'protocol', note: 'Fees kept' });
  const ledger = project?.ledger;
  if (ledger?.historyDelivered?.length) {
    const usd = seriesUsd(ledger.historyDelivered, timeframe);
    if (usd > 0) rows.push({ usd, inMix: false, source: 'holders', note: 'Paid to members' });
  }
  const gacha = project?.gacha?.historyUsd;
  if (gacha?.length) {
    const usd = seriesUsd(gacha, timeframe);
    if (usd > 0) rows.push({ usd, inMix: false, source: 'gacha', note: 'Pulls, not fees kept' });
  }
  if (!rows.some((r) => r.inMix)) {
    const snaps = project?.dailySnapshots || [];
    const usd = seriesUsd(snaps.map((s) => (Number(s.annualYield) || 0) / 365), timeframe);
    if (usd > 0) rows.push({ usd, inMix: false, source: 'estimate', note: 'Yield ÷ 365, not fees' });
  }
  return rows;
}

export function mixUsd(rows) {
  return (rows || []).reduce((s, r) => s + (r.inMix ? Number(r.usd) || 0 : 0), 0);
}

/** One number per day of protocol-kept fees. Empty when the project has none. */
export function protocolFeeSeries(project) {
  const chart = protocolRevenueChart(project, { skipLedger: true });
  if (chart.kind !== 'protocol' && chart.kind !== 'cashflow') return { labels: [], data: [] };
  const cols = chart.kind === 'cashflow'
    ? (chart.cols || []).filter((c) => c.key === 'fees')
    : protocolFeeCols(chart.cols);
  const data = (chart.rawLabels || chart.labels || []).map((_, i) => (
    cols.reduce((s, c) => s + (Number(c.data?.[i]) || 0), 0)
  ));
  if (!data.some((v) => v > 0)) return { labels: [], data: [] };
  return { labels: chart.labels, data };
}
