import { paybackMonths } from './portfolioHistory';

function cell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadCsv(filename, rows) {
  const body = (rows || []).map((row) => row.map(cell).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** One row per tier on the seat board, at the run rate currently on screen. */
export function seatCsvRows(project, { floorUsd = 0, volume = 1 } = {}) {
  const px = Number(project?.market?.tokenPriceUsd) || 0;
  const floor = Number(floorUsd) || 0;
  const vol = Number(volume) || 1;
  const header = ['tier', 'name', 'activation_tokens', 'floor_usd', 'activation_usd', 'cost_usd', 'annual_yield_usd', 'coc_pct', 'payback_months'];
  const body = (project?.tiers || []).map((tier) => {
    const tokens = Number(tier.reqTokens) || 0;
    const activation = tokens * px;
    const cost = floor + activation;
    const annual = (Number(tier.trackedAnnualYieldUsd) || 0) * vol;
    const coc = cost > 0 ? (annual / cost) * 100 : 0;
    const months = paybackMonths(cost, annual);
    return [
      tier.tier,
      tier.name || '',
      tokens,
      floor.toFixed(2),
      activation.toFixed(2),
      cost.toFixed(2),
      annual.toFixed(2),
      coc.toFixed(2),
      months == null ? '' : months.toFixed(1),
    ];
  });
  return [header, ...body];
}
