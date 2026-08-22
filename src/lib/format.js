// Formatting helpers. These were duplicated (with drifting decimal handling)
// inside EcosystemView and ProjectDetailView; both now import from here.

export const formatCurrency = (val, decimals) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...(decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  }).format(val || 0);

export const formatNumber = (val, decimals = 0) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val || 0);

export const formatPercent = (val, decimals = 2) => `${(val || 0).toFixed(decimals)}%`;

// Large token counts. 567,210,014 STONK is noise at full precision in a stat
// tile; 567.21M carries the same information.
export const formatCompact = (val) => {
  const n = val || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return formatNumber(n);
};
