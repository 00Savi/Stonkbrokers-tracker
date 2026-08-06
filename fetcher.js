const { ethers } = require("ethers");
const fs = require("fs");

const WEB3_CONFIG = {
    STONKBROKER: "0xe934e36a439c94017b64a3fece66af12099abf50",
    NFT_CONTRACT: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0",
    REGISTRY_CONTRACT: "0x000000006551c19487814612e58FE06813775758",
    IMPLEMENTATION_CONTRACT: "0x55266d75D1a14E4572138116aF39863Ed6593eCE",
    CHAIN_ID: 4663, 
    RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
    TOKENS: [
        { symbol: "STONK", address: "0xe934e36a439c94017b64a3fece66af12099abf50", priceUsd: 0.01447 },
        { symbol: "AAPL", address: "0xf9bc0777c087af0fe7214de8a5360be6a71d0d44", priceUsd: 225.00 },
        { symbol: "AMZN", address: "0x2829b754784352dd2beffa5eb26d5b499315b715", priceUsd: 185.00 },
        { symbol: "NVDA", address: "0xc5e3e9c2a835ec9319fd8c1d516fd4323c5758a0", priceUsd: 120.00 },
        { symbol: "SLV", address: "0x9d2c3355502be065975ad47ef5a902f02c772504", priceUsd: 28.00 },
        { symbol: "MSFT", address: "0xfc253e0062eef614e20e0726e5f6ff7559c35402", priceUsd: 430.00 },
        { symbol: "COST", address: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2", priceUsd: 820.00 }, 
        { symbol: "USAR", address: "0xd917B029C761D264c6A312BBbcDA868658eF86a6", priceUsd: 50.00 },  
        { symbol: "SPCX", address: "0xf58979d35c3f0ff6a6f7edd909fe8a95a2894609", priceUsd: 25.00 },  
        { symbol: "GOOGL", address: "0xff20b4b8e08beaa4064e3ca4cc5a2e40acac072f", priceUsd: 175.00 }, 
        { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", priceUsd: 1.00 },
        { symbol: "PLTR", address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", priceUsd: 28.00 },
        { symbol: "TSLA", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", priceUsd: 215.00 },
        { symbol: "AMD", address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", priceUsd: 145.00 },
        { symbol: "GME", address: "0x8f1836209c42d4f6b6caa782c055ee13f8ac95b0", priceUsd: 22.00 },
        { symbol: "USO", address: "0x5b1282b6ad40b3dc294404a2b33ff7657b66c33c", priceUsd: 75.00 }
    ]
};

const provider = new ethers.JsonRpcProvider(WEB3_CONFIG.RPC_URL);
const registryAbi = ["function account(address implementation, uint256 chainId, address tokenContract, uint256 tokenId, uint256 salt) view returns (address)"];

const globalMarketParams = { ethPriceUsd: 1874.00, tokenPriceUsd: 0.01447, nftFloorEth: 0.15 };
const tierBenchmarks = [
    { tier: 1, reqTokens: 66666, benchmarkId: 1794, trackedAnnualYieldUsd: 0 },
    { tier: 2, reqTokens: 166666, benchmarkId: 2370, trackedAnnualYieldUsd: 0 },
    { tier: 3, reqTokens: 366666, benchmarkId: 275, trackedAnnualYieldUsd: 0 },
    { tier: 4, reqTokens: 766666, benchmarkId: 1488, trackedAnnualYieldUsd: 0 },
    { tier: 5, reqTokens: 1666666, benchmarkId: 47, trackedAnnualYieldUsd: 0 }
];

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

    const registryContract = new ethers.Contract(WEB3_CONFIG.REGISTRY_CONTRACT, registryAbi, provider);
    const currentBlock = await provider.getBlockNumber();
    const blocksPerWeek = 302400; 
    const startBlock = currentBlock - blocksPerWeek;

    for (let bm of tierBenchmarks) {
        console.log(`Fetching data for Tier ${bm.tier} (NFT #${bm.benchmarkId})...`);
        try {
            const tbaAddress = await registryContract.account(
                WEB3_CONFIG.IMPLEMENTATION_CONTRACT, 
                WEB3_CONFIG.CHAIN_ID, 
                WEB3_CONFIG.NFT_CONTRACT, 
                bm.benchmarkId, 
                0
            );

            let totalYieldUsd = 0;

            // 1. NATIVE ETH YIELD TRACKING (Via Blockscout API)
            let ethYieldRaw = 0n;
            try {
                const normalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlist&address=${tbaAddress}&startblock=${startBlock}&endblock=${currentBlock}&sort=asc`);
                const normalData = await normalRes.json();
                if (normalData.status === "1" && Array.isArray(normalData.result)) {
                    for (const tx of normalData.result) {
                        if (tx.to.toLowerCase() === tbaAddress.toLowerCase() && tx.isError === "0" && tx.value !== "0") ethYieldRaw += BigInt(tx.value);
                    }
                }

                const internalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlistinternal&address=${tbaAddress}&startblock=${startBlock}&endblock=${currentBlock}&sort=asc`);
                const internalData = await internalRes.json();
                if (internalData.status === "1" && Array.isArray(internalData.result)) {
                    for (const tx of internalData.result) {
                        if (tx.to.toLowerCase() === tbaAddress.toLowerCase() && tx.isError === "0" && tx.value !== "0") ethYieldRaw += BigInt(tx.value);
                    }
                }
            } catch (e) {
                console.warn(`Blockscout API fetch failed for ETH on NFT #${bm.benchmarkId}`, e);
            }
            
            if (ethYieldRaw > 0n) {
                const ethFormatted = parseFloat(ethers.formatEther(ethYieldRaw));
                totalYieldUsd += (ethFormatted * 52.14) * globalMarketParams.ethPriceUsd;
            }

            // 2. ERC20 YIELD TRACKING (Via Blockscout API)
            try {
                const tokenRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=tokentx&address=${tbaAddress}&startblock=${startBlock}&endblock=${currentBlock}&sort=asc`);
                const tokenData = await tokenRes.json();
                
                if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
                    for (const tx of tokenData.result) {
                        if (tx.to.toLowerCase() === tbaAddress.toLowerCase()) {
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
                console.warn(`Blockscout API fetch failed for Tokens on NFT #${bm.benchmarkId}`, e);
            }

            bm.trackedAnnualYieldUsd = totalYieldUsd;
            bm.error = false;
        } catch (err) {
            console.error(`Failed to fetch NFT #${bm.benchmarkId}`, err);
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
