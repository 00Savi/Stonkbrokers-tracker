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
    tokenCa: '0xe934e36a439c94017b64a3fece66af12099abf50',
  },
  {
    id: 'mancer',
    key: 'mancer',
    name: 'Mancer',
    ticker: 'MANCER',
    mintedSupply: 5000,
    firstTokenId: 1,
    nftCa: '0x797a2e030b7e49107c8f07bf0300ea9cae88ca57',
    tokenCa: '0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A',
  },
  {
    id: 'tickeryard',
    key: 'tickeryard',
    name: 'TickerYard',
    ticker: 'YARD',
    mintedSupply: 3333,
    firstTokenId: 1,
    nftCa: '0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97',
    tokenCa: '0xE3FA12dA7fa026B21817f16622E8AE48fA785166',
  },
  {
    id: 'cardwall',
    key: 'cardwall',
    name: 'The Card Wall',
    ticker: 'WALL',
    mintedSupply: 4444,
    firstTokenId: 1,
    nftCa: '0x890215157dbec26d67605324271b34ba05ee9e58',
    tokenCa: '0xb03058b8a39f3967df08d833682c1c99b29821b1',
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