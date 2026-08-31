/**
 * Collections the $BONUS airdrop tool can target.
 *
 * Each minted token id has a tokenbound account, including ids whose NFT was
 * later burned. `ownership.currentMaxSupply` is circulating leftover and must
 * not be used here.
 *
 * nftCa: ERC-721 collection.
 * TBA params default to the StonkBrokers / Anvil 6551 stack on chain 4663.
 */
export const AIRDROP_COMMUNITIES = [
  {
    id: 'stonkbrokers',
    key: 'stonk',
    name: 'StonkBrokers',
    ticker: 'STONK',
    mintedSupply: 4444,
    firstTokenId: 1,
    nftCa: '0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0',
  },
  {
    id: 'mancer',
    key: 'mancer',
    name: 'Mancer',
    ticker: 'MANCER',
    mintedSupply: 5000,
    firstTokenId: 1,
    nftCa: '0x797a2e030b7e49107c8f07bf0300ea9cae88ca57',
  },
  {
    id: 'tickeryard',
    key: 'tickeryard',
    name: 'TickerYard',
    ticker: 'YARD',
    mintedSupply: 3333,
    firstTokenId: 1,
    nftCa: '0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97',
  },
  {
    id: 'cardwall',
    key: 'cardwall',
    name: 'The Card Wall',
    ticker: 'WALL',
    mintedSupply: 4444,
    firstTokenId: 1,
    nftCa: '0x890215157dbec26d67605324271b34ba05ee9e58',
  },
];

export const DEFAULT_TBA = {
  chainId: 4663,
  registry: '0x28c154CbdeaeCbF5f72B6aE48535ab9A431a4161',
  implementation: '0xE946075125843aAdb5e40e59f513d929AF507C4B',
  salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

export function communityNftCount(_data, key) {
  const meta = AIRDROP_COMMUNITIES.find((c) => c.key === key);
  const n = Number(meta?.mintedSupply);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveCommunityNftCa(community, data) {
  const fromRow = community?.nftCa;
  const cfg = data?.projects?.[community?.key]?.config || {};
  const fromData = cfg.nftCa || cfg.collection || cfg.nft || cfg.tokenCa;
  const raw = fromRow || fromData;
  return raw || null;
}