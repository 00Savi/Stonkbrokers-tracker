const { ethers } = require("ethers");
const fs = require("fs");

const WEB3_CONFIG = {
    STONKBROKER: "0xe934e36a439c94017b64a3fece66af12099abf50",
    TOKENS: [
        { symbol: "STONK", address: "0xe934e36a439c94017b64a3fece66af12099abf50", priceUsd: 0.01447 },
        { symbol: "AAPL", address: "0xf9bc0777c087af0fe7214de8a5360be6a71d0d44", priceUsd: 225.00 },
        { symbol: "AMZN", address: "0x2829b754784352dd2beffa5eb26d5b499315b715", priceUsd: 185.00 },
        { symbol: "NVDA", address: "0xc5e3e9c2a835ec9319fd8c1d516fd4323c5758a0", priceUsd: 120.00 },
        { symbol: "SLV", address: "0x9d2c3355502be065975ad47ef5a902f02c772504", priceUsd: 28.00 },
        { symbol: "MSFT", address: "0xfc253e0062eef614e20e0726e5f6ff7559c35402", priceUsd: 430.00 },
        { symbol: "COST", address: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", priceUsd: 820.00 }, 
        { symbol: "USAR", address: "0xd917b029c761d264c6a312bbbcda868658ef86a6", priceUsd: 50.00 },  
        { symbol: "SPCX", address: "0xf58979d35c3f0ff6a6f7edd909fe8a95a2894609", priceUsd: 25.00 },  
        { symbol: "GOOGL", address: "0xff20b4b8e08beaa4064e3ca4cc5a2e40acac072f", priceUsd: 175.00 }, 
        { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", priceUsd: 1.00 },
        { symbol: "PLTR", address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", priceUsd: 28.00 },
        { symbol: "TSLA", address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", priceUsd: 215.00 },
        { symbol: "AMD", address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", priceUsd: 145.00 },
        { symbol: "GME", address: "0x8f1836209c42d4f6b6caa782c055ee13f8ac95b0", priceUsd: 22.00 },
        { symbol: "USO", address: "0x5b1282b6ad40b3dc294404a2b33ff7657b66c33c", priceUsd: 75.00 }
    ]
};

const globalMarketParams = { ethPriceUsd: 1874.00, tokenPriceUsd: 0.01447, nftFloorEth: 0.15 };

const tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 1794, tbaAddress: "0x9c24b28c3146a1ca8095acd9611962f33faf068b", trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 2370, tbaAddress: "0x45f290f4e196c27abf738a32f5a97d47383cf0ba", trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 275, tbaAddress: "0x0c9aa82841a3a560a10e64e44f8c4687a1257e3e", trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 766666, benchmarkId: 1488, tbaAddress: "0xd5a17fac7942cbd597f3197d7d8f56ddf8d899f2", trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 47, tbaAddress: "0x0bf6bb4bf9236561884d5be086f6b540d1e77aff", trackedAnnualYieldUsd: 0 }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getTxTime(txTimeStamp) {
    if (!txTimeStamp) return 0;
    if (String(txTimeStamp).includes("-")) return Math.floor(new Date(txTimeStamp).getTime() / 1000);
    return parseInt(txTimeStamp);
}

async function run() {
    console.log("Fetching global prices...");
    try {
        const ethRes = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/ticker');
        if (ethRes.ok) globalMarketParams.ethPriceUsd = parseFloat((await ethRes.json()).price);
        
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WEB3_CONFIG.STONKBROKER}`);
        const dexData = await dexRes.json();
        if (dexData?.pairs?.length > 0) globalMarketParams.tokenPriceUsd = parseFloat(dexData.pairs[0].priceUsd);
    } catch (e) {
        console.warn("Failed to fetch live prices, using defaults.", e);
    }

    WEB3_CONFIG.TOKENS[0].priceUsd = globalMarketParams.tokenPriceUsd;
    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    for (let bm of tierBenchmarks) {
        console.log(`\nFetching data for Tier ${bm.tier} (Wallet: ${bm.tbaAddress})...`);
        await sleep(1500); 

        try {
            let totalYieldUsd = 0;
            const tbaAddress = bm.tbaAddress;

            // 1. NATIVE ETH YIELD TRACKING
            let ethYieldRaw = 0n;
            try {
                const normalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlist&address=${tbaAddress}&sort=desc`);
                const normalData = await normalRes.json();
                if (normalData.status === "1" && Array.isArray(normalData.result)) {
                    for (const tx of normalData.result) {
                        if (getTxTime(tx.timeStamp) < sevenDaysAgo) continue; 
                        if (tx.to && tx.to.toLowerCase() === tbaAddress.toLowerCase() && tx.isError === "0" && tx.value !== "0") {
                            ethYieldRaw += BigInt(tx.value);
                        }
                    }
                }

                await sleep(500);

                const internalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlistinternal&address=${tbaAddress}&sort=desc`);
                const internalData = await internalRes.json();
                if (internalData.status === "1" && Array.isArray(internalData.result)) {
                    for (const tx of internalData.result) {
                        if (getTxTime(tx.timeStamp) < sevenDaysAgo) continue; 
                        if (tx.to && tx.to.toLowerCase() === tbaAddress.toLowerCase() && tx.isError === "0" && tx.value !== "0") {
                            ethYieldRaw += BigInt(tx.value);
                        }
                    }
                }
            } catch (e) {
                console.warn(`Blockscout API fetch failed for ETH on NFT #${bm.benchmarkId}`, e.message);
            }
            
            if (ethYieldRaw > 0n) {
                const ethFormatted = parseFloat(ethers.formatEther(ethYieldRaw));
                totalYieldUsd += (ethFormatted * 52.14) * globalMarketParams.ethPriceUsd;
            }

            await sleep(500);

            // 2. ERC20 YIELD TRACKING
            try {
                const tokenRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=tokentx&address=${tbaAddress}&sort=desc`);
                const tokenData = await tokenRes.json();
                
                if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
                    for (const tx of tokenData.result) {
                        if (getTxTime(tx.timeStamp) < sevenDaysAgo) continue; 
                        
                        if (tx.to && tx.to.toLowerCase() === tbaAddress.toLowerCase()) {
                            const matchedToken = WEB3_CONFIG.TOKENS.find(t => t.address.toLowerCase() === tx.contractAddress.toLowerCase());
                            if (matchedToken) {
                                const decimals = parseInt(tx.tokenDecimal) || 18;
                                const amountFormatted = parseFloat(ethers.formatUnits(tx.value, decimals));
                                totalYieldUsd += (amountFormatted * 52.14) * matchedToken.priceUsd;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`Blockscout API fetch failed for Tokens on NFT #${bm.benchmarkId}`, e.message);
            }

            bm.trackedAnnualYieldUsd = totalYieldUsd;
            bm.error = false;
        } catch (err) {
            console.error(`ERROR on NFT #${bm.benchmarkId}:`, err.message);
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
