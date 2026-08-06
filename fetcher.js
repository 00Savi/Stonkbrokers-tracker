const { ethers } = require("ethers");
const fs = require("fs");

const WEB3_CONFIG = {
    STONKBROKER: "0xe934e36a439c94017b64a3fece66af12099abf50",
    TOKENS: [
        { symbol: "STONKBROKER", address: "0xe934e36A439C94017B64a3FecE66AF12099aBF50", priceUsd: 0.0191 },
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
        { symbol: "GME", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", priceUsd: 22.00 }
    ],
    RPC_URL: "https://rpc.mainnet.chain.robinhood.com"
};

const globalMarketParams = { ethPriceUsd: 1894.08, tokenPriceUsd: 0.0191, nftFloorEth: 6.997 };

const tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 1794, tbaAddress: "0x9c24b28c3146a1ca8095acd9611962f33faf068b", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 2370, tbaAddress: "0x45f290f4e196c27abf738a32f5a97d47383cf0ba", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 275, tbaAddress: "0x0c9aa82841a3a560a10e64e44f8c4687a1257e3e", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 766666, benchmarkId: 1491, tbaAddress: "0x9978cb6b8581d2a95e9b8d683bf2b8120dc0a0ee", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 1400, tbaAddress: "0x2052a6201600b879ad3a96e6e71148e55053c924", trackedAnnualYieldUsd: 0 }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getTxTime(txTimeStamp) {
    if (!txTimeStamp) return 0;
    if (String(txTimeStamp).includes("-")) return Math.floor(new Date(txTimeStamp).getTime() / 1000);
    return parseInt(txTimeStamp, 10);
}

async function run() {
    console.log("Fetching global prices...");
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        if (ethRes.ok) globalMarketParams.ethPriceUsd = parseFloat((await ethRes.json()).price) || 1894.08;
        
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WEB3_CONFIG.STONKBROKER}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) globalMarketParams.tokenPriceUsd = parseFloat(dexData.pairs[0].priceUsd) || 0.0191;
    } catch (e) {
        console.warn("Failed to fetch live prices, using defaults.", e.message);
    }

    WEB3_CONFIG.TOKENS[0].priceUsd = globalMarketParams.tokenPriceUsd;
    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));

    const provider = new ethers.JsonRpcProvider(WEB3_CONFIG.RPC_URL);
    let currentBlock = 28200000;
    try {
        currentBlock = await provider.getBlockNumber();
    } catch (e) {
        console.warn("Failed to fetch current block, using fallback.");
    }
    // Robinhood block time is ~2s. 350,000 blocks is ~8 days of history.
    const startBlock = Math.max(0, currentBlock - 350000); 
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    for (let bm of tierBenchmarks) {
        console.log(`\nFetching data for Tier ${bm.tier} (Wallet: ${bm.tbaAddress})...`);
        await sleep(1000); 

        try {
            let weeklyYieldUsd = 0;
            const tbaAddress = bm.tbaAddress;
            const tokenPriceCache = {};

            // 1. NATIVE ETH YIELD TRACKING (Bypasses the 10,000 limit via startblock constraint)
            let ethYieldRaw = 0n;
            try {
                const normalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlist&address=${tbaAddress}&startblock=${startBlock}&sort=desc`);
                const normalData = await normalRes.json();
                if (normalData.status === "1" && Array.isArray(normalData.result)) {
                    for (const tx of normalData.result) {
                        if (getTxTime(tx.timeStamp) < sevenDaysAgo) continue; 
                        if (tx.to && tx.to.toLowerCase() === tbaAddress.toLowerCase() && (!tx.isError || tx.isError === "0")) {
                            let valStr = tx.value || "0";
                            if (valStr !== "") ethYieldRaw += BigInt(valStr);
                        }
                    }
                }

                await sleep(500);

                const internalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlistinternal&address=${tbaAddress}&startblock=${startBlock}&sort=desc`);
                const internalData = await internalRes.json();
                if (internalData.status === "1" && Array.isArray(internalData.result)) {
                    for (const tx of internalData.result) {
                        if (getTxTime(tx.timeStamp) < sevenDaysAgo) continue; 
                        if (tx.to && tx.to.toLowerCase() === tbaAddress.toLowerCase() && (!tx.isError || tx.isError === "0")) {
                            let valStr = tx.value || "0";
                            if (valStr !== "") ethYieldRaw += BigInt(valStr);
                        }
                    }
                }
            } catch (e) {
                console.warn(`ETH fetch failed on NFT #${bm.benchmarkId}:`, e.message);
            }
            
            if (ethYieldRaw > 0n) {
                weeklyYieldUsd += parseFloat(ethers.formatEther(ethYieldRaw)) * globalMarketParams.ethPriceUsd;
            }

            await sleep(500);

            // 2. ERC20 YIELD TRACKING (Bypasses the 10,000 limit via startblock constraint)
            try {
                const tokenRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=tokentx&address=${tbaAddress}&startblock=${startBlock}&sort=desc`);
                const tokenData = await tokenRes.json();
                
                if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
                    for (const tx of tokenData.result) {
                        if (getTxTime(tx.timeStamp) < sevenDaysAgo) continue; 
                        
                        if (tx.to && tx.to.toLowerCase() === tbaAddress.toLowerCase()) {
                            let tokenPriceUsd = 0;
                            const contractAddr = tx.contractAddress || "";
                            if (!contractAddr) continue;

                            const matchedToken = WEB3_CONFIG.TOKENS.find(t => t.address.toLowerCase() === contractAddr.toLowerCase());
                            if (matchedToken && matchedToken.priceUsd) {
                                tokenPriceUsd = matchedToken.priceUsd;
                            } else if (tokenPriceCache[contractAddr] !== undefined) {
                                tokenPriceUsd = tokenPriceCache[contractAddr];
                            } else {
                                try {
                                    const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddr}`);
                                    const dsData = await dsRes.json();
                                    if (dsData?.pairs?.length > 0) tokenPriceUsd = parseFloat(dsData.pairs[0].priceUsd) || 0;
                                } catch (err) {}
                                tokenPriceCache[contractAddr] = tokenPriceUsd;
                            }

                            const decimals = tx.tokenDecimal ? parseInt(tx.tokenDecimal, 10) : 18;
                            let valStr = tx.value || "0";
                            weeklyYieldUsd += parseFloat(ethers.formatUnits(valStr, decimals)) * tokenPriceUsd;
                        }
                    }
                }
            } catch (e) {
                console.warn(`Token fetch failed on NFT #${bm.benchmarkId}:`, e.message);
            }

            // Guaranteed stable 7-day conversion (365 / 7 = 52.14)
            bm.trackedAnnualYieldUsd = weeklyYieldUsd * 52.14;
            bm.error = false;
        } catch (err) {
            console.error(`CRITICAL ERROR on NFT #${bm.benchmarkId}:`, err.message);
            bm.error = true;
        }
    }

    const outputData = {
        lastUpdated: new Date().toISOString(),
        globalMarketParams,
        tierBenchmarks
    };

    fs.writeFileSync("data.json", JSON.stringify(outputData, null, 2));
    console.log("Successfully generated data.json");
}

run();
