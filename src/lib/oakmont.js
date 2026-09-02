/** Documented Oakmont mechanics from https://dapp.oakmontvault.xyz/docs */

export const OAKMONT_DOCS = 'https://dapp.oakmontvault.xyz/docs';
export const OAKMONT_DAPP = 'https://dapp.oakmontvault.xyz/';

export const OAKMONT_BASKET = [
  { asset: 'SPCX', share: 11.875 },
  { asset: 'NVDA', share: 11.875 },
  { asset: 'AAPL', share: 11.875 },
  { asset: 'QQQ', share: 11.875 },
  { asset: 'GME', share: 11.875 },
  { asset: 'OIL', share: 11.875 },
  { asset: 'TSLA', share: 11.875 },
  { asset: 'ETH', share: 11.875 },
  { asset: 'STONKBROKER', share: 5 },
];

export const OAKMONT_FEES = [
  { fee: 'Wrap ($STRIKE → $RESERVE)', rate: '2.5%', dest: '2% ETH → Vault; 0.5% $RESERVE burned' },
  { fee: 'Unwrap ($RESERVE → $STRIKE)', rate: '2.5%', dest: '2% ETH → Vault; 0.5% $RESERVE burned' },
  { fee: 'Redemption ($RESERVE → assets)', rate: '5%', dest: 'Fully burned as $RESERVE' },
  { fee: 'Loan origination', rate: '3%', dest: 'Borrowed index assets → Vault' },
  { fee: 'Loan interest', rate: '2% APY', dest: 'Vault' },
  { fee: 'Liquidation penalty', rate: '10% total', dest: '5% liquidator + 5% protocol' },
  { fee: 'ETH zap (loan repay)', rate: '0.5%', dest: 'Protocol / Vault' },
];

export const OAKMONT_ACTIONS = [
  {
    name: 'Hold $STRIKE',
    cost: 'Spot',
    note: 'Liquid, zero transfer tax, CEX-listable. Economic exposure only — vault claim is exercised through $RESERVE.',
  },
  {
    name: 'Wrap → $RESERVE',
    cost: '2.5%',
    note: '$STRIKE is escrowed in the wrapper (not burned). Minted $RESERVE is the vault receipt and loan collateral.',
  },
  {
    name: 'Borrow vs $RESERVE',
    cost: '3% + 2% APY',
    note: 'Up to 75% LTV, paid in the actual index assets (not USDG). Collateral is staked and illiquid for the loan.',
  },
  {
    name: 'Redeem assets',
    cost: '5%',
    note: 'Only $RESERVE redeems the basket. The 5% fee is fully burned, raising remaining $RESERVE claim quality.',
  },
  {
    name: 'Floor path',
    cost: '~7.5%',
    note: 'Wrap then redeem. $STRIKE cannot sustainably trade more than ~7.5% below Reserve Price (vault NAV ÷ $STRIKE supply).',
  },
];

export async function fetchGeckoTokenHolders(address) {
  if (!address) return null;
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${address}/info`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const n = (await res.json())?.data?.attributes?.holders?.count;
    return typeof n === 'number' && n > 0 ? n : null;
  } catch {
    return null;
  }
}
