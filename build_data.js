const { ethers } = require("ethers");
const fs = require("fs");

const BLOCKSCOUT_API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW"; 
const BLOCKSCOUT_BASE_URL = "https://robinhoodchain.blockscout.com/api";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let globalMarketParams = { ethPriceUsd: 1900.00, tokenPriceUsd: 0.02278, nftFloorEth: 7.661 };

let tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 1794, tbaAddress: "0x9c24b28c3146a1ca8095acd9611962f33faf068b", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 2370, tbaAddress: "0x45f290f4e196c27abf738a32f5a97d47383cf0ba", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 275, tbaAddress: "0x0c9aa82841a3a560a10e64e44f8c4687a1257e3e", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 666666, benchmarkId: 1491, tbaAddress: "0x9978cb6b8581d2a95e9b8d683bf2b8120dc0a0ee", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1400, tbaAddress: "0x2052a6201600b879ad3a96e6e71148e55053c924", trackedAnnualYieldUsd: 0 }
];

const WEB3_CONFIG = {
    CHAIN_ID: 4663, 
    RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
    TOKENS: [
        { symbol: "STONKBROKER", address: "0xe934e36A439C94017B64a3FecE66AF12099aBF50", priceUsd: 0.02278 },
        { symbol: "AAPL", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", priceUsd: 225.00 },
        { symbol: "AMZN", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", priceUsd: 185.00 },
        { symbol: "NVDA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", priceUsd: 120.00 },
        { symbol: "SLV", address: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f", priceUsd: 28.00 },
        { symbol: "MSFT", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", priceUsd: 430.00 },
        { symbol: "COST", address: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2", priceUsd: 820.00 }, 
        { symbol: "USAR", address: "0xd917B029C761D264c6A312BBbcDA868658eF86a6", priceUsd: 50.00 },  
        { symbol: "SPCX", address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", priceUsd: 25.00 },  
        { symbol: "GOOGL", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", priceUsd: 175.00 }, 
        { symbol: "RDDT", address: "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C", priceUsd: 65.00 },
        { symbol: "GME", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", priceUsd: 22.00 },
        { symbol: "USO", address: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344", priceUsd: 119.32 },
        { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", priceUsd: 1.00 },
        { symbol: "PLTR", address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", priceUsd: 30.00 },
        { symbol: "AMD", address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", priceUsd: 140.00 },
        { symbol: "TSLA", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", priceUsd: 200.00 }
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
    console.log("Starting secure data sync...");
    
    // 1. Fetch current spot prices
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        const ethData = await ethRes.json();
        globalMarketParams.ethPriceUsd = parseFloat(ethData.price);
    } catch(e) { console.log("ETH Price fetch failed, using fallback."); }

    try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WEB3_CONFIG.TOKENS[0].address}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) {
            const bestPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            globalMarketParams.tokenPriceUsd = parseFloat(bestPair.priceUsd);
            WEB3_CONFIG.TOKENS[0].priceUsd = globalMarketParams.tokenPriceUsd;
        }
    } catch(e) { console.log("STONK Price fetch failed, using fallback."); }

    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));
    
    // 2. Determine Block Range
    const provider = new ethers.JsonRpcProvider(WEB3_CONFIG.RPC_URL);
    let currentBlock = 30000000;
    try { currentBlock = await provider.getBlockNumber(); } catch(e) {}
    
    // 6,048,000 blocks covers exactly 7 days on an L2 with 0.1s block times.
    const startBlock = Math.max(0, currentBlock - 6048000);
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    // 3. Process Tiers
    for (let bm of tierBenchmarks) {
        console.log(`\nProcessing Tier ${bm.tier} (TBA: ${bm.tbaAddress})...`);
        let aggregatedTransfers = {};
        
        // Fetching Token Transfers AND Native/Internal ETH Transfers
        const actions = ["tokentx", "txlist", "txlistinternal"];

        for (let action of actions) {
            console.log(`-> Fetching ${action}...`);
            const url = `${BLOCKSCOUT_BASE_URL}?module=account&action=${action}&address=${bm.tbaAddress}&startblock=${startBlock}&page=1&offset=10000&sort=desc&apikey=${BLOCKSCOUT_API_KEY}`;
            const data = await secureFetch(url);

            if (data && data.status === "1" && Array.isArray(data.result)) {
                for (const tx of data.result) {
                    
                    // STRICT INBOUND FILTER & TIMESTAMP CHECK
                    if (parseInt(tx.timeStamp, 10) >= sevenDaysAgo && tx.to && tx.to.toLowerCase() === bm.tbaAddress.toLowerCase() && (!tx.isError || tx.isError === "0")) {
                        let valueStr = tx.value || "0";
                        
                        if (action !== "tokentx") {
                            // Gross ETH Inflow Tracking
                            const ethAmount = parseFloat(ethers.formatEther(valueStr));
                            if (ethAmount > 0) {
                                if (!aggregatedTransfers["ETH"]) {
                                    aggregatedTransfers["ETH"] = { ticker: "ETH", rawAmount: 0, currentPriceUsd: globalMarketParams.ethPriceUsd };
                                }
                                aggregatedTransfers["ETH"].rawAmount += ethAmount;
                            }
                        } else {
                            // Token Tracking
                            const contractAddr = (tx.contractAddress || "").toLowerCase();
                            const matchedToken = WEB3_CONFIG.TOKENS.find(t => t.address.toLowerCase() === contractAddr);
                            
                            if (!matchedToken) continue; // Ignore untracked/scam tokens

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
            // IRON-CLAD PACING: 10 full seconds between requests to guarantee we never hit 10 req/min
            await sleep(10000); 
        }

        // Calculate final annualized USD value for the tier
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

    // 4. Save to disk
    const finalData = {
        market: globalMarketParams,
        tiers: tierBenchmarks,
        lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
    console.log("\nSuccess: Data cleanly written to data.json");
}

run();
