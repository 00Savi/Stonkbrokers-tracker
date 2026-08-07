const { ethers } = require("ethers");
const fs = require("fs");

const BLOCKSCOUT_API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW"; 
const BLOCKSCOUT_BASE_URL = "https://robinhoodchain.blockscout.com/api";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let globalMarketParams = { ethPriceUsd: 1900.00, tokenPriceUsd: 0.02278, nftFloorEth: 7.661 };

// Verified Benchmark TBAs
let tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 3032, trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 1199, trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 2372, trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 666666, benchmarkId: 1533, trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1258, trackedAnnualYieldUsd: 0 }
];

const WEB3_CONFIG = {
    NFT_CONTRACT: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0",
    REGISTRY_CONTRACT: "0x000000006551c19487814612e58fe06813775758",
    IMPLEMENTATION_CONTRACT: "0x55266d75d1a14e4572138116af39863ed6593ece",
    CHAIN_ID: 4663, 
    RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
    TOKENS: [
        { symbol: "WETH", address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", priceUsd: 1900.00 }, // THE MISSING LINK
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

const registryAbi = ["function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)"];

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
    console.log("Starting secure data sync tracking WETH drops...");
    
    // 1. Fetch live market prices
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        const ethData = await ethRes.json();
        globalMarketParams.ethPriceUsd = parseFloat(ethData.price);
        // Peg WETH exact to ETH live price
        WEB3_CONFIG.TOKENS.find(t => t.symbol === "WETH").priceUsd = globalMarketParams.ethPriceUsd;
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
    
    // 2. Determine Block Range
    const provider = new ethers.JsonRpcProvider(WEB3_CONFIG.RPC_URL);
    const registryContract = new ethers.Contract(WEB3_CONFIG.REGISTRY_CONTRACT, registryAbi, provider);

    let currentBlock = 30000000;
    try { currentBlock = await provider.getBlockNumber(); } catch(e) {}
    
    const startBlock = Math.max(0, currentBlock - 6048000);
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    // 3. Process Tiers
    for (let bm of tierBenchmarks) {
        let tbaAddress = "";
        try {
            tbaAddress = await registryContract.account(
                WEB3_CONFIG.IMPLEMENTATION_CONTRACT,
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                WEB3_CONFIG.CHAIN_ID,
                WEB3_CONFIG.NFT_CONTRACT,
                bm.benchmarkId
            );
        } catch (err) {
            console.error(`Failed to resolve TBA for Broker #${bm.benchmarkId}`, err);
            continue;
        }

        bm.tbaAddress = tbaAddress.toLowerCase();
        console.log(`\nProcessing Tier ${bm.tier} (Broker #${bm.benchmarkId} -> TBA: ${bm.tbaAddress})...`);
        
        let aggregatedTransfers = {};
        const actions = ["tokentx", "txlist", "txlistinternal"];

        for (let action of actions) {
            const url = `${BLOCKSCOUT_BASE_URL}?module=account&action=${action}&address=${bm.tbaAddress}&startblock=${startBlock}&page=1&offset=10000&sort=desc&apikey=${BLOCKSCOUT_API_KEY}`;
            const data = await secureFetch(url);

            if (data && data.status === "1" && Array.isArray(data.result)) {
                for (const tx of data.result) {
                    
                    // Count all valid inbound transfers
                    if (parseInt(tx.timeStamp, 10) >= sevenDaysAgo && tx.to && tx.to.toLowerCase() === bm.tbaAddress && (!tx.isError || tx.isError === "0")) {
                        let valueStr = tx.value || "0";
                        
                        if (action !== "tokentx") {
                            const ethAmount = parseFloat(ethers.formatEther(valueStr));
                            if (ethAmount > 0) {
                                if (!aggregatedTransfers["ETH"]) {
                                    aggregatedTransfers["ETH"] = { ticker: "ETH", rawAmount: 0, currentPriceUsd: globalMarketParams.ethPriceUsd };
                                }
                                aggregatedTransfers["ETH"].rawAmount += ethAmount;
                            }
                        } else {
                            const contractAddr = (tx.contractAddress || "").toLowerCase();
                            const matchedToken = WEB3_CONFIG.TOKENS.find(t => t.address.toLowerCase() === contractAddr);
                            
                            if (!matchedToken) continue; 

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

    // 4. Output
    const finalData = {
        market: globalMarketParams,
        tiers: tierBenchmarks,
        lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
    console.log("\nSuccess: Clean benchmark data written to data.json");
}

run();
