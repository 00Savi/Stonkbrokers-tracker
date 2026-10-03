/**
 * Contracts we can name. Everyone else stays an address.
 * PoolManager is the Uniswap v4 contract that holds the LP, not a person.
 */
const NAMED = {
  '0x799ae26fa515cef145e8bc8636f7fff87b05cf62': { name: 'TokenEscrowReserve' },
  '0x8366a39cc670b4001a1121b8f6a443a643e40951': { name: 'PoolManager', note: 'Uniswap v4 LP' },
  '0x999bf370f09fc776056a99bc532d0650517d8c72': { name: 'Night engine' },
  '0xfff716727d7e80e29eab5d3498b7f28431e65c58': { name: 'Night vault' },
  '0x06fc836cf9839b1cd891c440a0a45242da6ae1c9': { name: 'CCIP router' },
  '0xca9a3c0655a991f79050b769e1b8985f5b65c6d2': { name: 'Night bot' },
  '0x065388fa59505cef471529ffa08d7ecfab1faacc': { name: 'Night hook' },
  '0xf4129019d8838f2555bdc8ecb3024a02145dbc58': { name: 'Clock In' },
  '0x55642a3f10f1af5145d3d59021b1d6b03bb8692c': { name: 'Safety Deposit' },
  '0xe7207caa913b54aa4411e847a3a49eee0568cccf': { name: 'Partner oracle' },
  '0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664': { name: 'Stonk activation' },
  '0xe302733accf4800146e55fc45b46b4e4ffc032d2': { name: 'Stonk AMM' },
  '0xdea32d8aee85b41a0f320ff823e4625aab01f518': { name: 'Intern AMM' },
  '0x2554cad3d851381ec1a16b7bf7b4737ed46b40fe': { name: 'Mancer AMM' },
  '0xfe0b24a3b4052ad78f10fa75a27118c3e54a00e6': { name: 'Yard AMM' },
  '0xdd59536f394c4b589e695f5921723b89ea479379': { name: 'Wall AMM' },
};

export function walletName(addr) {
  return NAMED[String(addr || '').toLowerCase()] || null;
}
