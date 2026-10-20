// One walk of NFT transfers through each Anvil vault, plus the ETH fee on
// the vault's trade logs. The hourly fetcher only refreshes the last two
// days; this fills the history those days sit on.

const fs = require('fs');
const { Rpc } = require('../lib/rpc.cjs');
const { BlockTime } = require('../lib/blocktime.cjs');
const { walkAmmFlow, mergeAmmFlow } = require('../lib/ammFlow.cjs');

const VAULTS = {
  stonk: ['0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0', '0xe302733accf4800146e55fc45b46b4e4ffc032d2'],
  mancer: ['0x797a2e030b7e49107c8f07bf0300ea9cae88ca57', '0x2554cad3d851381ec1a16b7bf7b4737ed46b40fe'],
  tickeryard: ['0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97', '0xfe0b24a3b4052ad78f10fa75a27118c3e54a00e6'],
  cardwall: ['0x890215157dbec26d67605324271b34ba05ee9e58', '0xdd59536f394c4b589e695f5921723b89ea479379'],
  interns: ['0xfc4b0c4f464dc3037cf013934648a8a726d565a5', '0xdea32d8aee85b41a0f320ff823e4625aab01f518'],
  ghosts: ['0x7cd6e36286f92f55cc8f498e36e10a975a332aac', '0x5c13f5f4bc85205e3aab278f7007b1c17bc958ea'],
  zombies: ['0xcc87ff3b3c08fc04c1f60f54989eb7dfab3e0b31', '0xf816103f6a9722b9256f3ede7d85d9495e46c32d'],
  knights: ['0x63a405ef2d9937675925ac8a99ce1694bcfd2922', '0xfd5888e566945d594596bfd6cd60cbbb924553a9'],
  watchers: ['0x291cbcd1e9f44724ed5acbdc6e1ddd72b28f7911', '0x51bc21f0965ed9344a16c62923af1c68deaf6fab'],
};

const args = process.argv.slice(2);
const fromFlag = args.find((a) => a.startsWith('--from='));
const fromIso = fromFlag ? fromFlag.slice('--from='.length) : '2026-07-15';
const want = (args.find((a) => !a.startsWith('--')) || 'stonk,mancer,tickeryard,cardwall,interns')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function sum(arr) {
  return (arr || []).reduce((s, n) => s + (Number(n) || 0), 0);
}

async function main() {
  const rpc = new Rpc();
  const blockTime = new BlockTime().load();
  const head = await rpc.blockNumber();
  const pinned = blockTime.anchors.length ? blockTime.anchors[blockTime.anchors.length - 1][0] : 1;
  await blockTime.ensureRange(rpc, Math.min(pinned, head), head);
  blockTime.save();
  const fromTs = Date.parse(`${fromIso}T00:00:00Z`) / 1000;
  const fromBlock = blockTime.blockAt(fromTs);
  console.log(`head ${head} from ${fromBlock}`);

  const data = JSON.parse(fs.readFileSync('public/data.json', 'utf8'));
  for (const key of want) {
    const pair = VAULTS[key];
    if (!pair) throw new Error(`unknown vault ${key}`);
    const [nft, amm] = pair;
    console.log(`\n${key}`);
    const flow = await walkAmmFlow({
      rpc,
      blockTime,
      nft,
      amm,
      fromBlock,
      toBlock: head,
      onProgress: (at, _end, n) => {
        if (at % 5_000_000 < 120_000) process.stdout.write(`  ${key} ${at} logs ${n}\n`);
      },
    });
    const i = flow.dates.indexOf('2026-10-18');
    console.log(
      `  days ${flow.dates[0]} → ${flow.dates.at(-1)}  in ${sum(flow.entered)}  out ${sum(flow.left)}  fee ${sum(flow.feeEth).toFixed(2)} ETH`,
    );
    if (i >= 0) console.log(`  2026-10-18 in ${flow.entered[i]} out ${flow.left[i]} fee ${flow.feeEth[i]}`);
    const target = VAULTS[key] && data.projects.nightshades?.factions?.[key]
      ? data.projects.nightshades.factions[key]
      : data.projects[key];
    if (!target) throw new Error(`no project ${key}`);
    target.ammFlow = mergeAmmFlow(target.ammFlow, flow);
    const tmp = 'public/data.json.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, 'public/data.json');
    console.log(`  wrote ${key}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
