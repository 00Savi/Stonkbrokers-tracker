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
