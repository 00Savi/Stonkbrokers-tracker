const { ethers } = require("ethers");
const fs = require("fs");

const WEB3_CONFIG = {
    STONKBROKER: "0xe934e36a439c94017b64a3fece66af12099abf50",
    NFT_CONTRACT: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0",
    REGISTRY_CONTRACT: "0x000000006551c19487814612e58FE06813775758",
    IMPLEMENTATION_CONTRACT: "0x55266d75D1a14E4572138116aF39863Ed6593eCE",
    CHAIN_ID: 4663, 
    RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
    // IMPORTANT: Replace the "0x..." placeholders with the full 42-character contract addresses
    TOKENS: [
        { symbol: "STONK", address: "0xe934e36a439c94017b64a3fece66af12099abf50", priceUsd: 0.01447 },
        { symbol: "AAPL", address: "0xf9bc0777c087af0fe7214de8a5360be6a71d0d44", priceUsd: 225.00 },
        { symbol: "AMZN", address: "0x2829b754784352dd2beffa5eb26d5b499315b715", priceUsd: 185.00 },
        { symbol: "NVDA", address: "0xc5e3e9c2a835ec9319fd8c1d516fd4323c5758a0", priceUsd: 120.00 },
        { symbol: "SLV", address: "0x9d2c3355502be065975ad47ef5a902f02c772504", priceUsd: 28.00 },
        { symbol: "MSFT", address: "0xfc253e0062eef614e20e0726e5f6ff7559c35402", priceUsd: 430.00 },
        { symbol: "COST", address: "0x...", priceUsd: 820.00 }, 
        { symbol: "USAR", address: "0x...", priceUsd: 50.00 },  
        { symbol: "SPCX", address: "0xf58979d35c3f0ff6a6f7edd909fe8a95a2894609", priceUsd: 25.00 },  
        { symbol: "GOOGL", address: "0xff20b4b8e08beaa4064e3ca4cc5a2e40acac072f", priceUsd: 175.00 }, 
        { symbol: "USDG", address: "0x...", priceUsd: 1.00 },
        { symbol: "PLTR", address: "0x...", priceUsd: 28.00 },
        { symbol: "TSLA", address: "0x...", priceUsd: 215.00 },
        { symbol: "AMD", address: "0x...", priceUsd: 145.00 },
        { symbol: "GME", address: "0x8f1836209c42d4f6b6caa782c055ee13f8ac95b0", priceUsd: 22.00 }
    ]
};

const provider = new ethers.JsonRpcProvider(WEB3_CONFIG.RPC_URL);
const registryAbi = ["function account(address implementation, uint256 chainId, address tokenContract, uint256 tokenId, uint256 salt) view returns (address)"];
const erc20Abi = ["event Transfer(address indexed from, address indexed to, uint256 value)", "function decimals() view returns (uint8)"];

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

    // Update dynamic prices in token config if available
    WEB3_CONFIG.TOKENS[0].priceUsd = globalMarketParams.tokenPriceUsd;

    globalMarketParams.nftFloorEth = parseFloat(((666666 * globalMarketParams.tokenPriceUsd) / globalMarketParams.ethPriceUsd).toFixed(3));

    const registryContract = new ethers.Contract(WEB3_CONFIG.REGISTRY_CONTRACT, registryAbi, provider);
    const currentBlock = await provider.getBlockNumber();
    const blocksPerWeek = 302400; 
    const startBlock = currentBlock - blocksPerWeek;
    const maxChunk = 5000; 

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

            // NATIVE ETH YIELD TRACKING (Via Blockscout API for inbound transactions)
            let ethYieldRaw = 0n;
            try {
                // 1. Normal Transactions (Wallet to Wallet)
                const normalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlist&address=${tbaAddress}&startblock=${startBlock}&endblock=${currentBlock}&sort=asc`);
                const normalData = await normalRes.json();
                if (normalData.status === "1" && Array.isArray(normalData.result)) {
                    for (const tx of normalData.result) {
                        if (tx.to.toLowerCase() === tbaAddress.toLowerCase() && tx.isError === "0" && tx.value !== "0") {
                            ethYieldRaw += BigInt(tx.value);
                        }
                    }
                }

                // 2. Internal Transactions (Smart Contract Distributions)
                const internalRes = await fetch(`https://robinhoodchain.blockscout.com/api?module=account&action=txlistinternal&address=${tbaAddress}&startblock=${startBlock}&endblock=${currentBlock}&sort=asc`);
                const internalData = await internalRes.json();
                if (internalData.status === "1" && Array.isArray(internalData.result)) {
                    for (const tx of internalData.result) {
                        if (tx.to.toLowerCase() === tbaAddress.toLowerCase() && tx.isError === "0" && tx.value !== "0") {
                            ethYieldRaw += BigInt(tx.value);
                        }
                    }
                }
            } catch (e) {
                console.warn(`Blockscout API fetch failed for ETH on NFT #${bm.benchmarkId}`, e);
            }
            
            if (ethYieldRaw > 0n) {
                const ethFormatted = parseFloat(ethers.formatEther(ethYieldRaw));
                totalYieldUsd += (ethFormatted * 52.14) * globalMarketParams.ethPriceUsd;
            }

            // ERC20 YIELD TRACKING
            for (const token of WEB3_CONFIG.TOKENS) {
                if(token.address.startsWith("0x...")) continue; // Skip unconfigured tokens

                const tokenContract = new ethers.Contract(token.address, erc20Abi, provider);
                const filter = tokenContract.filters.Transfer(null, tbaAddress);
                
                let totalAmountRaw = 0n;
                for (let i = startBlock; i < currentBlock; i += maxChunk) {
                    const endBlock = Math.min(i + maxChunk - 1, currentBlock);
                    const logs = await tokenContract.queryFilter(filter, i, endBlock);
                    for (let log of logs) {
                        totalAmountRaw += log.args[2];
                    }
                }
                
                if (totalAmountRaw > 0n) {
                    const decimals = await tokenContract.decimals();
                    const amountFormatted = parseFloat(ethers.formatUnits(totalAmountRaw, decimals));
                    totalYieldUsd += (amountFormatted * 52.14) * token.priceUsd;
                }
            }
            bm.trackedAnnualYieldUsd = totalYieldUsd;
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
