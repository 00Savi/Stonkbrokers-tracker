const { ethers } = require("ethers");
const fs = require("fs");

const BLOCKSCOUT_API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW"; 
const BLOCKSCOUT_BASE_URL = "https://robinhoodchain.blockscout.com/api";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let globalMarketParams = { ethPriceUsd: 1900.00, tokenPriceUsd: 0.02278, nftFloorEth: 7.661 };

let tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 3032, tbaAddress: "0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 1199, tbaAddress: "0xc2614c45c68f14a6c21881290c62d84b5f718831", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 2372, tbaAddress: "0xa72288ba58858c04b058ffc22ad345687924bcd0", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 666666, benchmarkId: 1533, tbaAddress: "0x468a5a2402fa721f056b22e0c48d7010016135d8", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1258, tbaAddress: "0xe7207caa913b54aa4411e847a3a49eee0568cccf", trackedAnnualYieldUsd: 0 }
];

// Verified Token & Safety Deposit Box Pricing Map
const KNOWN_PRICES = {
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73": 1900.00, // WETH
    "0xe934e36a439c94017b64a3fece66af12099abf50": 0.02278,  // STONKBROKER
    "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": 225.00,   // AAPL
    "0x12f190a9f9d7d37a250758b26824b97ce941bf54": 185.00,   // AMZN
    "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": 120.00,   // NVDA
    "0x411efb0e7f985935daec3D4C3ebaEa0d0AD7D89f": 28.00,    // SLV
    "0xe93237c50d904957cf27e7b1133b510c669c2e74": 430.00,   // MSFT
    "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2": 820.00,   // COST
    "0xd917b029c761d264c6a312bbbcda868658ef86a6": 50.00,    // USAR
    "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea": 25.00,    // SPCX
    "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3": 175.00,   // GOOGL
    "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c": 65.00,    // RDDT
    "0x1b0e319c6a659f002271b69db8a7df2f911c153e": 22.00,    // GME
    "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344": 119.32,   // USO
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": 1.00,     // USDG
    "0x1383b43aed527485f191b60060f5b5471f71b1ca": 1.00,     // USDG V2
    // Safety Deposit Box Tokens (from CSV)
    "0x12df3d482c50bb0ca2d25763063af4892b6e42f4": 1.00,     // MANCER
    "0x7b513232d2aee37f8a60f22377bf9b7632ce67ff": 1.00,     // MANCER
    "0xebd86eb62b51119862651c847e9835f4811090e9": 1.00,     // MANCER
    "0x349d55e919e5883d55905bd5eaa044c6544bd832": 1.00,     // POD
    "0x6813830f1a0e072f87d5d7608d3b2374c7484ecb": 1.00      // MANCER
};

async function secureFetch(url) {
    let retries = 0;
    while (retries < 5) {
        try {
            const res = await fetch(url, { headers: { "Accept": "application/json" } });
            if (res.status === 429) throw new Error("Rate Limit HTTP");
            const data = await res.json();
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
    } catch (e) {}
    return 1.00; // Default fallback for unmapped protocol reward tokens
}

async function run() {
    console.log("Starting REST-based Blockscout sync with dynamic Start Block...");
    
    // 1. Fetch Spot Prices
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        const ethData = await ethRes.json();
        globalMarketParams.ethPriceUsd = parseFloat(ethData.price);
        KNOWN_PRICES["0x0bd7d308f8e1639fab988df18a8011f41eacad73"] = globalMarketParams.ethPriceUsd;
    } catch(e) {}

    try {
        const stonkAddr = "0xe934e36a439c94017b64a3fece66af12099abf50";
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${stonkAddr}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) {
            const bestPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            globalMarketParams.tokenPriceUsd = parseFloat(bestPair.priceUsd);
            KNOWN_PRICES[stonkAddr] = globalMarketParams.tokenPriceUsd;
        }
    } catch(e) {}

    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));
    
    // 2. Determine Exact Start Block (Bypasses Pagination Limits)
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    let currentBlock = 30000000;
    try {
        const blockRes = await secureFetch(`${BLOCKSCOUT_BASE_URL}?module=block&action=eth_block_number&apikey=${BLOCKSCOUT_API_KEY}`);
        if (blockRes && blockRes.result) {
            currentBlock = parseInt(blockRes.result, 16);
        }
    } catch(e) {}
    
    // Approximate blocks for 7 days (Robinhood Chain ~2s block time)
    const startBlock = Math.max(0, currentBlock - 302400); 
    console.log(`Filtering drops since Block: ${startBlock} (Unix: ${sevenDaysAgo})`);

    // 3. Scan Tiers via Blockscout REST APIs
    for (let bm of tierBenchmarks) {
        const tbaAddress = bm.tbaAddress.toLowerCase();
        console.log(`\nProcessing Tier ${bm.tier} (TBA: ${tbaAddress})...`);
        
        let totalTierYieldUsd = 0;
        const actions = ["txlistinternal", "txlist", "tokentx"];

        for (let action of actions) {
            console.log(`-> Fetching ${action}...`);
            // Added startblock to force API to search the exact 7-day window
            const url = `${BLOCKSCOUT_BASE_URL}?module=account&action=${action}&address=${tbaAddress}&startblock=${startBlock}&page=1&offset=10000&sort=desc&apikey=${BLOCKSCOUT_API_KEY}`;
            const data = await secureFetch(url);

            if (data && (data.status === "1" || Array.isArray(data.result))) {
                const txList = Array.isArray(data.result) ? data.result : [];
                
                for (const tx of txList) {
                    const txTimestamp = parseInt(tx.timeStamp, 10);
                    
                    // Filter strictly by trailing 7-day Unix timestamp & inbound status
                    if (txTimestamp >= sevenDaysAgo && tx.to && tx.to.toLowerCase() === tbaAddress && (!tx.isError || tx.isError === "0" || tx.errCode === "")) {
                        let valueStr = tx.value || "0";
                        
                        if (action === "txlistinternal" || action === "txlist") {
                            // Safely parse Native ETH Drops
                            const ethVal = parseFloat(ethers.formatEther(valueStr));
                            if (ethVal > 0) {
                                const usdVal = ethVal * globalMarketParams.ethPriceUsd;
                                totalTierYieldUsd += usdVal;
                                console.log(`   + Native ETH Drop: ${ethVal.toFixed(6)} ETH ($${usdVal.toFixed(2)})`);
                            }
                        } else if (action === "tokentx") {
                            // Safely parse Token Drops
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

    // 4. Write Output
    const finalData = {
        market: globalMarketParams,
        tiers: tierBenchmarks,
        lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
    console.log("\nSuccess: Clean Blockscout REST data written to data.json");
}

run();
