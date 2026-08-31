export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

export const BONUS_MAX_SUPPLY = 44_444_444;
export const BONUS_LP_SEED = 22_222_222;
export const BONUS_AIRDROP_SUPPLY = 22_222_222;
export const BONUS_GENESIS_BROKERS = 4_444;
export const BONUS_PER_TBA = 5_000;

export const ETH_FEE_PER_COLLECTION = 0.01;
export const BONUS_BURN_PER_COLLECTION = 10_000;

/** Must stay <= BonusAirdropRegistry.MAX_BATCH_SIZE (200). */
export const TBA_BATCH_SIZE = 200;

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';

export const AIRDROP_PHASE = {
  IDLE: 'IDLE',
  APPROVING_BONUS: 'APPROVING_BONUS',
  CREATING_CAMPAIGN: 'CREATING_CAMPAIGN',
  APPROVING_TOKEN: 'APPROVING_TOKEN',
  EXECUTING_BATCHES: 'EXECUTING_BATCHES',
  COMPLETE: 'COMPLETE',
};

export function ethFeeForCollections(n) {
  return ETH_FEE_PER_COLLECTION * (Number(n) || 0);
}

export function bonusBurnForCollections(n) {
  return BONUS_BURN_PER_COLLECTION * (Number(n) || 0);
}

export function tbaBatchCount(tbaCount) {
  const n = Number(tbaCount) || 0;
  if (n <= 0) return 0;
  return Math.ceil(n / TBA_BATCH_SIZE);
}