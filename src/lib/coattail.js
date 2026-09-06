export const COATTAIL_SITE = 'https://www.coattail.cash';
export const COATTAIL_ACTIVATE_BURN = 36750;
export const COATTAIL_SUPPLY = 1776;

export const COATTAIL_TBA = {
  chainId: 4663,
  registry: '0x000000006551c19487814612e58FE06813775758',
  implementation: '0x32A055D504840E69B7a0B2136264EEF643f6312C',
  salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

export async function fetchWalletBrokers(address) {
  if (!address) return [];
  try {
    const res = await fetch(`${COATTAIL_SITE}/api/wallet/${address}/brokers`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j?.brokers) ? j.brokers : [];
  } catch {
    return [];
  }
}
