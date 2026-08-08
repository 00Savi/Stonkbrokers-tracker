const { ethers } = require("ethers");
const fs = require("fs");

const BLOCKSCOUT_API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW"; 
const BLOCKSCOUT_BASE_URL = "https://robinhoodchain.blockscout.com/api";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let globalMarketParams = { ethPriceUsd: 1900.00, tokenPriceUsd: 0.02278, nftFloorEth: 7.661 };

// Verified Benchmark TBAs
let tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 3032, tbaAddress: "0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 1199, tbaAddress: "0xc2614c45c68f14a6c21881290c62d84b5f718831", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 2372, tbaAddress: "0xa72288ba58858c04b058ffc22ad345687924bcd0", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 666666, benchmarkId: 1533, tbaAddress: "0x468a5a2402fa721f056b22e0c48d7010016135d8", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1258, tbaAddress: "0xe7207caa913b54aa4411e847a3a49eee0568cccf", trackedAnnualYieldUsd: 0 }
];

// OFFICIAL PROTOCOL SENDER WHITELIST (Live + Legacy Boosters)
const PROTOCOL_SOURCES = [
    "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9", // Clock In V2 (Directed Booster) - LIVE
    "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c", // Safety Deposit Clock In (Fee Router) - LIVE
    "0x038a7f4e4e89448ad74e044337c9ac25c11e726b", // Stock Booster V1 - RETIRED
    "0xf9ca5f6d8622c82758914681a12674e2d489259a"  // Overtime Booster - RETIRED
].map(a => a.toLowerCase());

// STANDARD TOKEN PRICE MAP (With fallback auto-fetch for unmapped tokens)
const KNOWN_PRICES = {
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73": 1900.00, // WETH
    "0xe934e36a439c94017b64a3fece66af12099abf50": 0.02278,  // STONKBROKER
    "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": 225.00,   // AAPL
    "0x12f190a9f9d7d37a250758b26824b97ce941bf54": 185.00,   // AMZN
    "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": 120.00,   // NVDA
    "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f": 28.00,    // SLV
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": 1.00,     // USDG
    "0x1383b43aed527485f191b60060f5b5471f71b1ca": 1.00      // USDG V2
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

async function fetchTokenPriceUsd(contractAddress) {
    const addrLower = contractAddress.toLowerCase();
    if (KNOWN_PRICES[addrLower]) return KNOWN_PRICES[addrLower];

    try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) {
            const bestPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            const price = parseFloat(bestPair.priceUsd);
            if (!isNaN(price) && price > 0) {
                KNOWN_PRICES[addrLower] = price;
                return price;
            }
        }
    } catch (e) {
        console.log(`DexScreener lookup failed for ${contractAddress}`);
    }
    return 0; // Default to 0 if price cannot be determined
}

async function run() {
    console.log("Starting protocol-source filtered sync (Clock In V2 + Safety Deposit Router)...");
    
    // 1. Fetch Spot Prices
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        const ethData = await ethRes.json();
        globalMarketParams.ethPriceUsd = parseFloat(ethData.price);
        KNOWN_PRICES["0x0bd7d308f8e1639fab988df18a8011f41eacad73"] = globalMarketParams.ethPriceUsd;
    } catch(e) { console.log("ETH Price fetch failed, using fallback."); }

    try {
        const stonkAddr = "0xe934e36a439c94017b64a3fece66af12099abf50";
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${stonkAddr}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) {
            const bestPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            globalMarketParams.tokenPriceUsd = parseFloat(bestPair.priceUsd);
            KNOWN_PRICES[stonkAddr] = globalMarketParams.tokenPriceUsd;
        }
    } catch(e) { console.log("STONK Price fetch failed, using fallback."); }

    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));
    
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    // 2. Scan TBA Transferred Native ETH & Tokens
    for (let bm of tierBenchmarks) {
        const tbaAddress = bm.tbaAddress.toLowerCase();
        console.log(`\nProcessing Tier ${bm.tier} (Broker #${bm.benchmarkId} -> TBA: ${tbaAddress})...`);
        
        let totalTierYieldUsd = 0;
        const actions = ["txlistinternal", "txlist", "tokentx"];

        for (let action of actions) {
            console.log(`-> Fetching ${action}...`);
            const url = `${BLOCKSCOUT_BASE_URL}?module=account&action=${action}&address=${tbaAddress}&page=1&offset=2000&sort=desc&apikey=${BLOCKSCOUT_API_KEY}`;
            const data = await secureFetch(url);

            if (data && (data.status === "1" || Array.isArray(data.result))) {
                const txList = Array.isArray(data.result) ? data.result : [];
                
                for (const tx of txList) {
                    const txTimestamp = parseInt(tx.timeStamp, 10);
                    
                    // Basic transfer validation
                    if (txTimestamp >= sevenDaysAgo && tx.to && tx.to.toLowerCase() === tbaAddress && (!tx.isError || tx.isError === "0" || tx.errCode === "")) {
                        
                        const sender = (tx.from || "").toLowerCase();
                        
                        // STRICT SOURCE CHECK: Must originate from an official protocol contract
                        if (!PROTOCOL_SOURCES.includes(sender)) {
                            continue; // Skip personal owner deposits and external transfers
                        }

                        let valueStr = tx.value || "0";
                        
                        if (action === "txlistinternal" || action === "txlist") {
                            // Native ETH Drops from Protocol
                            const ethAmount = parseFloat(ethers.formatEther(valueStr));
                            if (ethAmount > 0) {
                                const usdVal = ethAmount * globalMarketParams.ethPriceUsd;
                                totalTierYieldUsd += usdVal;
                                console.log(`   + Native ETH Drop: ${ethAmount.toFixed(6)} ETH ($${usdVal.toFixed(2)})`);
                            }
                        } else if (action === "tokentx") {
                            // Token Drops from Protocol Router
                            const contractAddr = (tx.contractAddress || "").toLowerCase();
                            const decimals = tx.tokenDecimal ? parseInt(tx.tokenDecimal, 10) : 18;
                            const tokenAmount = parseFloat(ethers.formatUnits(valueStr, decimals));

                            if (tokenAmount > 0) {
                                const priceUsd = await fetchTokenPriceUsd(contractAddr);
                                const usdVal = tokenAmount * priceUsd;
                                totalTierYieldUsd += usdVal;
                                console.log(`   + Token Drop (${tx.tokenSymbol || 'ERC20'}): ${tokenAmount.toFixed(4)} ($${usdVal.toFixed(2)})`);
                            }
                        }
                    }
                }
            }
            await sleep(10000); 
        }

        // Annualize 7-day yield
        const annualizedYield = totalTierYieldUsd * 52.14;
        bm.trackedAnnualYieldUsd = annualizedYield;
        console.log(`✓ Tier ${bm.tier} Complete. 7-Day Total: $${totalTierYieldUsd.toFixed(2)} | Annualized: $${annualizedYield.toFixed(2)}`);
    }

    // 3. Write Output
    const finalData = {
        market: globalMarketParams,
        tiers: tierBenchmarks,
        lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
    console.log("\nSuccess: Protocol drop data cleanly written to data.json");
}

run();
