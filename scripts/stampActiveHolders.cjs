/**
 * Unique wallets holding an open activation.
 * Stonk/Yard/Mancer: ownerOf on the NFT.
 * Card Wall: activations(id) on the vault (the wall holds the NFT).
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { Rpc, decodeAddr, encodeUint } = require("../lib/rpc.cjs");

const ZERO = "0x0000000000000000000000000000000000000000";
const OWNER_OF = ethers.id("ownerOf(uint256)").slice(0, 10);
const ACTIVATIONS = ethers.id("activations(uint256)").slice(0, 10);
const rpc = new Rpc();

async function uniqueFromCalls(calls) {
  const raw = await rpc.calls(calls);
  const owners = new Set();
  for (const word of raw) {
    const a = decodeAddr(word);
    if (a && a !== ZERO) owners.add(a);
  }
  return owners.size;
}

async function main() {
  const file = path.join(__dirname, "..", "public", "data.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const want = process.argv.slice(2);
  const targets = want.length ? want : ["stonk", "tickeryard", "cardwall", "mancer"];

  for (const key of targets) {
    const p = data.projects[key];
    if (!p) continue;
    const ids = Object.keys(p.activation?.activeTokenTiers || {});
    const nftCa = p.config?.nftCa;
    const vault = p.config?.nftCa && key === "cardwall"
      ? "0xb3f6f0fad13b0b60873ac2a90281ebe431fdb6ed"
      : null;
    if (!ids.length) {
      console.log(`${key}: skip`);
      continue;
    }
    let n;
    if (key === "cardwall") {
      n = await uniqueFromCalls(ids.map((id) => ({ to: vault, data: ACTIVATIONS + encodeUint(id) })));
    } else {
      n = await uniqueFromCalls(ids.map((id) => ({ to: nftCa, data: OWNER_OF + encodeUint(id) })));
    }
    p.activation.activeHolders = n;
    console.log(`${key}: ${ids.length} activated NFTs across ${n} wallets`);
  }

  const json = JSON.stringify(data);
  fs.writeFileSync(file, json);
  const docs = path.join(__dirname, "..", "docs", "data.json");
  if (fs.existsSync(docs)) fs.writeFileSync(docs, json);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
