const { ethers } = require("ethers");
const fs = require("fs");

const BLOCKSCOUT_API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW"; 
const BLOCKSCOUT_BASE_URL = "https://robinhoodchain.blockscout.com/api";
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let globalMarketParams = { ethPriceUsd: 1900.00, tokenPriceUsd: 0.02278, nftFloorEth: 7.661 };

let tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 3032, tbaAddress: "0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 1199, tbaAddress: "0xc2614c45c68f14a6c21881290c62d84b5f718831", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 2372, tbaAddress: "0xa72288ba58858c04b058ffc22ad345687924bcd0", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 666666, benchmarkId: 1533, tbaAddress: "0x468a5a2402fa721f056b22e0c48d7010016135d8", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1258, tbaAddress: "0xe7207caa913b54aa4411e847a3a49eee0568cccf", trackedAnnualYieldUsd: 0 }
];

// Verified Token Roster 
const KNOWN_TOKENS = [
    { symbol: "WETH", address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", priceUsd: 1900.00 },
    { symbol: "STONKBROKER", address: "0xe934e36a439c94017b64a3fece66af12099abf50", priceUsd: 0.02278 },
    { symbol: "AAPL", address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", priceUsd: 225.00 },
    { symbol: "AMZN", address: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", priceUsd: 185.00 },
    { symbol: "NVDA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", priceUsd: 120.00 },
    { symbol: "SLV", address: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", priceUsd: 28.00 },
    { symbol: "MSFT", address: "0xe93237c50d904957cf27e7b1133b510c669c2e74", priceUsd: 430.00 },
    { symbol: "COST", address: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", priceUsd: 820.00 }, 
    { symbol: "USAR", address: "0xd917b029c761d264c6a312bbbcda868658ef86a6", priceUsd: 50.00 },  
    { symbol: "SPCX", address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", priceUsd: 25.00 },  
    { symbol: "GOOGL", address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", priceUsd: 175.00 }, 
    { symbol: "RDDT", address: "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c", priceUsd: 65.00 },
    { symbol: "GME", address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e", priceUsd: 22.00 },
    { symbol: "USO", address: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344", priceUsd: 119.32 },
    { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", priceUsd: 1.00 },
    { symbol: "USDG_V2", address: "0x1383b43aed527485f191b60060f5b5471f71b1ca", priceUsd: 1.00 }
];

async function secureFetch(url) {
    let retries = 0;
    while (retries < 3) {
        try {
            const res = await fetch(url, { headers: { "Accept": "application/json" } });
            const data = await res.json();
            return data;
        } catch (err) {
            retries++;
            await sleep(5000);
        }
    }
    return { result: [] };
}

async function run() {
    console.log("Starting Hybrid RPC Data Sync (Bypassing Blockscout for Tokens)...");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // 1. Fetch Market Prices
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        const ethData = await ethRes.json();
        globalMarketParams.ethPriceUsd = parseFloat(ethData.price);
        KNOWN_TOKENS.find(t => t.symbol === "WETH").priceUsd = globalMarketParams.ethPriceUsd;
    } catch(e) {}

    try {
        const stonkAddr = KNOWN_TOKENS.find(t => t.symbol === "STONKBROKER").address;
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${stonkAddr}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) {
            const bestPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            globalMarketParams.tokenPriceUsd = parseFloat(bestPair.priceUsd);
            KNOWN_TOKENS.find(t => t.symbol === "STONKBROKER").priceUsd = globalMarketParams.tokenPriceUsd;
        }
    } catch(e) {}

    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));
    
    // 2. Determine EXACT Start Block (7 Days Ago)
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    let startBlock = 0;
    try {
        const blockUrl = `${BLOCKSCOUT_BASE_URL}?module=block&action=getblocknobytime&timestamp=${sevenDaysAgo}&closest=after&apikey=${BLOCKSCOUT_API_KEY}`;
        const blockData = await secureFetch(blockUrl);
        if (blockData.status === "1") startBlock = parseInt(blockData.result);
    } catch(e) {}
    
    if (!startBlock) {
        const currentBlock = await provider.getBlockNumber();
        startBlock = Math.max(0, currentBlock - 302400); // Fallback: ~7 days at 2s blocks
    }
    console.log(`Scanning 7-day range starting at Block: ${startBlock}`);

    const transferTopic = ethers.id("Transfer(address,address,uint256)");

    // 3. Process Tiers
    for (let bm of tierBenchmarks) {
        const tbaAddress = bm.tbaAddress.toLowerCase();
        console.log(`\nProcessing Tier ${bm.tier} (TBA: ${tbaAddress})...`);
        
        let totalTierYieldUsd = 0;
        
        // A. Fetch Tokens DIRECTLY from RPC Logs (Bypasses blockscout completely)
        const tbaPadded = ethers.zeroPadValue(tbaAddress, 32);
        
        for (let token of KNOWN_TOKENS) {
            try {
                const logs = await provider.getLogs({
                    address: token.address,
                    topics: [transferTopic, null, tbaPadded],
                    fromBlock: startBlock,
                    toBlock: "latest"
                });
                
                for (let log of logs) {
                    const amount = parseFloat(ethers.formatUnits(log.data, 18));
                    if (amount > 0) {
                        const usdVal = amount * token.priceUsd;
                        totalTierYieldUsd += usdVal;
                        console.log(`   + RPC Event: ${token.symbol} Drop ($${usdVal.toFixed(2)})`);
                    }
                }
            } catch(e) { } // Ignore if RPC fails on a specific token
        }

        // B. Fetch Native ETH via Blockscout (Fallback)
        for (let action of ["txlist", "txlistinternal"]) {
            const url = `${BLOCKSCOUT_BASE_URL}?module=account&action=${action}&address=${tbaAddress}&startblock=${startBlock}&sort=desc&apikey=${BLOCKSCOUT_API_KEY}`;
            const data = await secureFetch(url);

            if (data && data.status === "1" && Array.isArray(data.result)) {
                for (const tx of data.result) {
                    if (tx.to && tx.to.toLowerCase() === tbaAddress && (!tx.isError || tx.isError === "0" || tx.errCode === "")) {
                        const ethAmount = parseFloat(ethers.formatEther(tx.value || "0"));
                        if (ethAmount > 0) {
                            const usdVal = ethAmount * globalMarketParams.ethPriceUsd;
                            totalTierYieldUsd += usdVal;
                            console.log(`   + Native ETH Drop ($${usdVal.toFixed(2)})`);
                        }
                    }
                }
            }
            await sleep(5000); 
        }

        // Annualize the 7-day yield
        const annualizedYield = totalTierYieldUsd * 52.14;
        bm.trackedAnnualYieldUsd = annualizedYield;
        console.log(`✓ Tier ${bm.tier} Complete. 7-Day Net: $${totalTierYieldUsd.toFixed(2)} | Annualized: $${annualizedYield.toFixed(2)}`);
    }

    // 4. Output Data
    const finalData = {
        market: globalMarketParams,
        tiers: tierBenchmarks,
        lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
    console.log("\nSuccess: Hybrid RPC Data written to data.json");
}

run();
