const { ethers } = require("ethers");
const fs = require("fs");

const BLOCKSCOUT_API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW"; 
const BLOCKSCOUT_BASE_URL = "https://robinhoodchain.blockscout.com/api";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let globalMarketParams = { ethPriceUsd: 1900.00, tokenPriceUsd: 0.02278, nftFloorEth: 7.661 };

// Hardcoded Exact TBA Addresses for Tiers 1-5
let tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 3032, tbaAddress: "0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 1199, tbaAddress: "0xc2614c45c68f14a6c21881290c62d84b5f718831", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 2372, tbaAddress: "0xa72288ba58858c04b058ffc22ad345687924bcd0", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 666666, benchmarkId: 1533, tbaAddress: "0x468a5a2402fa721f056b22e0c48d7010016135d8", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1258, tbaAddress: "0xe7207caa913b54aa4411e847a3a49eee0568cccf", trackedAnnualYieldUsd: 0 }
];

const WEB3_CONFIG = {
    TOKENS: [
        { symbol: "STONKBROKER", address: "0xe934e36a439c94017b64a3fece66af12099abf50", priceUsd: 0.02278 },
        { symbol: "AAPL", address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", priceUsd: 225.00 },
        { symbol: "AMZN", address: "0x12f190a9f9d7d37a250758b26824B97CE941bf54", priceUsd: 185.00 },
        { symbol: "NVDA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", priceUsd: 120.00 },
        { symbol: "SLV", address: "0x411efb0e7f985935daec3D4C3ebaea0d0ad7d89f", priceUsd: 28.00 },
        { symbol: "MSFT", address: "0xe93237cf50d904957cf27e7b1133b510c669c2e74", priceUsd: 430.00 },
        { symbol: "COST", address: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", priceUsd: 820.00 }, 
        { symbol: "USAR", address: "0xd917b029c761d264c6a312bbbcda868658ef86a6", priceUsd: 50.00 },  
        { symbol: "SPCX", address: "0x4a0e65a3eccec6dbe60ae065F2e7bb85fae35eea", priceUsd: 25.00 },  
        { symbol: "GOOGL", address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", priceUsd: 175.00 }, 
        { symbol: "RDDT", address: "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c", priceUsd: 65.00 },
        { symbol: "GME", address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e", priceUsd: 22.00 },
        { symbol: "USO", address: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344", priceUsd: 119.32 },
        { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", priceUsd: 1.00 },
        { symbol: "PLTR", address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", priceUsd: 30.00 },
        { symbol: "AMD", address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", priceUsd: 140.00 },
        { symbol: "TSLA", address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", priceUsd: 200.00 }
    ]
};

async function secureFetch(url) {
    let retries = 0;
    while (retries < 5) {
        try {
            const res = await fetch(url, { headers: { "Accept": "application/json" } });
            if (res.status === 429) throw new Error("Rate Limit HTTP");
            const data = await res.json();
            if (data.message && data.message.toLowerCase().includes("limit")) throw new Error("API Limit Payload");
            return data;
        } catch (err) {
            retries++;
            console.log(`Rate limit hit, resting for 20 seconds... (Attempt ${retries})`);
            await sleep(20000);
        }
    }
    return { result: [] };
}

async function run() {
    console.log("Starting protocol-focused drop sync (Native ETH + Verified Tokens)...");
    
    // 1. Fetch Spot Market Prices
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        const ethData = await ethRes.json();
        globalMarketParams.ethPriceUsd = parseFloat(ethData.price);
    } catch(e) { console.log("ETH Price fetch failed, using fallback."); }

    try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WEB3_CONFIG.TOKENS.find(t => t.symbol === "STONKBROKER").address}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) {
            const bestPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            globalMarketParams.tokenPriceUsd = parseFloat(bestPair.priceUsd);
            WEB3_CONFIG.TOKENS.find(t => t.symbol === "STONKBROKER").priceUsd = globalMarketParams.tokenPriceUsd;
        }
    } catch(e) { console.log("STONK Price fetch failed, using fallback."); }

    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));
    
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    // 2. Scan TBA Transferred Native ETH & Tokens
    for (let bm of tierBenchmarks) {
        const tbaAddress = bm.tbaAddress.toLowerCase();
        console.log(`\nProcessing Tier ${bm.tier} (Broker #${bm.benchmarkId} -> TBA: ${tbaAddress})...`);
        
        let aggregatedTransfers = {};
        const actions = ["txlistinternal", "txlist", "tokentx"];

        for (let action of actions) {
            console.log(`-> Fetching ${action}...`);
            const url = `${BLOCKSCOUT_BASE_URL}?module=account&action=${action}&address=${tbaAddress}&page=1&offset=2000&sort=desc&apikey=${BLOCKSCOUT_API_KEY}`;
            const data = await secureFetch(url);

            if (data && (data.status === "1" || Array.isArray(data.result))) {
                const txList = Array.isArray(data.result) ? data.result : [];
                
                for (const tx of txList) {
                    const txTimestamp = parseInt(tx.timeStamp, 10);
                    
                    // Filter for inbound transfers within the trailing 7 days
                    if (txTimestamp >= sevenDaysAgo && tx.to && tx.to.toLowerCase() === tbaAddress && (!tx.isError || tx.isError === "0" || tx.errCode === "")) {
                        let valueStr = tx.value || "0";
                        
                        if (action === "txlistinternal" || action === "txlist") {
                            // Gross Native ETH Drops
                            const ethAmount = parseFloat(ethers.formatEther(valueStr));
                            if (ethAmount > 0) {
                                if (!aggregatedTransfers["ETH"]) {
                                    aggregatedTransfers["ETH"] = { ticker: "ETH", rawAmount: 0, currentPriceUsd: globalMarketParams.ethPriceUsd };
                                }
                                aggregatedTransfers["ETH"].rawAmount += ethAmount;
                            }
                        } else if (action === "tokentx") {
                            // Official ERC-20 Drops
                            const contractAddr = (tx.contractAddress || "").toLowerCase();
                            const matchedToken = WEB3_CONFIG.TOKENS.find(t => t.address.toLowerCase() === contractAddr);
                            
                            if (!matchedToken) continue; // Ignore all unmapped/spam tokens

                            const decimals = tx.tokenDecimal ? parseInt(tx.tokenDecimal, 10) : 18;
                            const tokenAmount = parseFloat(ethers.formatUnits(valueStr, decimals));

                            if (tokenAmount > 0) {
                                if (!aggregatedTransfers[matchedToken.symbol]) {
                                    aggregatedTransfers[matchedToken.symbol] = { ticker: matchedToken.symbol, rawAmount: 0, currentPriceUsd: matchedToken.priceUsd };
                                }
                                aggregatedTransfers[matchedToken.symbol].rawAmount += tokenAmount;
                            }
                        }
                    }
                }
            }
            await sleep(10000); 
        }

        // Calculate annualized USD yield
        let totalYieldUsd = 0;
        bm.tbaBalances = Object.values(aggregatedTransfers).map(asset => {
            const annualizedAmount = asset.rawAmount * 52.14;
            const assetUsdValue = annualizedAmount * asset.currentPriceUsd;
            totalYieldUsd += assetUsdValue;
            
            return {
                ticker: asset.ticker,
                amount: annualizedAmount,
                currentPriceUsd: asset.currentPriceUsd
            };
        });
        
        bm.trackedAnnualYieldUsd = totalYieldUsd;
        console.log(`✓ Tier ${bm.tier} complete. Tracked Annual Yield: $${totalYieldUsd.toFixed(2)}`);
    }

    // 3. Write Output
    const finalData = {
        market: globalMarketParams,
        tiers: tierBenchmarks,
        lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
    console.log("\nSuccess: Protocol drop data written to data.json");
}

run();
