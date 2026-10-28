import { scanAnvilVault } from '../src/lib/anvilScan.js';
import { anvilDayStamped, appendAnvilDay, normalizeAnvilValue } from '../src/lib/anvilValue.js';

/**
 * One StonkBrokers close. Same vault walk and prices as Anvil + Floor, so the
 * chart matches that page's priced TBA total. A day already on the series is
 * left as written. An incomplete scan throws and the caller keeps the old series.
 */
export async function snapshotStonkAnvil(data, { previous, signal, log } = {}) {
  const base = normalizeAnvilValue(previous || data?.projects?.stonk?.anvilValue);
  const today = new Date().toISOString().slice(0, 10);
  if (anvilDayStamped(base, today)) return base;

  const result = await scanAnvilVault('stonk', data, {
    signal,
    scanIdle: true,
    onProgress: ({ label, done, total }) => {
      log?.(total ? `${label} ${done}/${total}` : label);
    },
  });
  const rows = result?.rows || [];
  if (rows.length !== result?.vaultBalance || !(result.vaultBalance > 0)) {
    throw new Error('anvil value scan did not cover the vault');
  }
  const usd = rows.reduce((sum, row) => sum + (Number(row.usd) || 0), 0);
  if (!(usd > 0)) throw new Error('anvil value priced at zero');
  const stamped = appendAnvilDay(base, {
    date: today,
    usd: Math.round(usd * 100) / 100,
    nfts: result.vaultBalance,
  });
  log?.(`stamped ${today}`);
  return stamped;
}
