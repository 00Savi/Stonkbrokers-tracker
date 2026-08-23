import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function PortfolioView({ data }) {
  const [inputVal, setInputVal] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [results, setResults] = useState({ floorUsd: 0, yieldUsd: 0, totalUnits: 0, hasErrors: false, ownedAssets: [] });

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  const handleScan = async () => {
    if (!inputVal.trim()) return;
    const wallets = inputVal.split(',').map(w => w.trim()).filter(w => ethers.isAddress(w));
    if (wallets.length === 0) { alert('Please enter at least one valid EVM wallet address.'); return; }

    setIsScanning(true);
    setScanComplete(false);
    
    let totalFloorUsd = 0;
    let totalYieldUsd = 0;
    let totalUnits = 0;
    let portfolioHasErrors = false;
    let ownedAssets = [];

    try {
      const provider = new ethers.JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com");
      const erc721Abi = ["function balanceOf(address) view returns (uint256)", "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)"];

      for (const [pKey, pData] of Object.entries(data.projects || {})) {
        if (!pData.config?.nftCa) continue;
        const nftContract = new ethers.Contract(pData.config.nftCa, erc721Abi, provider);
        const floorUsd = (pData.market?.nftFloorEth || 0) * (pData.market?.ethPriceUsd || 0);

        for (const wallet of wallets) {
          try {
            const bal = Number(await nftContract.balanceOf(wallet));
            if (bal > 0) {
              totalUnits += bal;
              totalFloorUsd += (bal * floorUsd);
              
              let exactYieldUsd = 0;
              let ownedTokenIds = new Set();
              let fetchError = false;

              try {
                // Try to read directly from the contract first
                for (let i = 0; i < bal; i++) {
                  const tId = await nftContract.tokenOfOwnerByIndex(wallet, i);
                  ownedTokenIds.add(Number(tId));
                }
              } catch (rpcErr) {
                // Fallback to Blockscout API if RPC rate-limits or fails the mapping
                try {
                  let page = 1;
                  while(true) {
                    const url = `https://robinhoodchain.blockscout.com/api?module=account&action=tokennfttx&contractaddress=${pData.config.nftCa}&address=${wallet}&page=${page}&offset=1000&sort=asc`;
                    const res = await fetch(url);
                    const json = await res.json();
                    
                    if (json.status === "1" && Array.isArray(json.result)) {
                      json.result.forEach(tx => {
                        if (tx.to && tx.to.toLowerCase() === wallet.toLowerCase()) ownedTokenIds.add(Number(tx.tokenID));
                        if (tx.from && tx.from.toLowerCase() === wallet.toLowerCase()) ownedTokenIds.delete(Number(tx.tokenID));
                      });
                      if (json.result.length < 1000) break;
                      page++;
                    } else {
                      fetchError = true;
                      break;
                    }
                  }
                } catch (apiErr) {
                  fetchError = true;
                }
              }

              if (fetchError || ownedTokenIds.size !== bal) {
                portfolioHasErrors = true;
              } else {
                // Calculate exact yield based on the active tiers of the tokens owned
                const activeMap = pData.activation?.activeTokenTiers || {};
                ownedTokenIds.forEach(tokenId => {
                  const tokenData = activeMap[tokenId];
                  const tierId = tokenData ? tokenData.t : 'T0'; 
                  const tierObj = pData.tiers.find(t => t.tier === tierId) || pData.tiers[0];
                  exactYieldUsd += (tierObj?.trackedAnnualYieldUsd || 0);
                });
                totalYieldUsd += exactYieldUsd;
              }

              ownedAssets.push({
                project: pData.config.name,
                ticker: pData.config.ticker,
                logo: pData.config.logo || 'Stonkbroker.png',
                wallet: wallet,
                balance: bal,
                floorValue: bal * floorUsd,
                yieldValue: exactYieldUsd,
                hasError: fetchError || ownedTokenIds.size !== bal
              });
            }
          } catch (e) { console.error("Wallet read error", e); }
        }
      }

      setResults({ floorUsd: totalFloorUsd, yieldUsd: totalYieldUsd, totalUnits, hasErrors: portfolioHasErrors, ownedAssets });
    } catch (err) {
      console.error(err);
      alert("Error connecting to the blockchain RPC. Please try again.");
    }
    
    setIsScanning(false);
    setScanComplete(true);
  };

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 shadow-xl mt-6">
      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
          Multi-Wallet Ecosystem Portfolio Tracker
        </h2>
        <p className="text-xs text-slate-400 mt-1">Scan single or multiple comma-separated wallet addresses to track total active NFTs, net asset value, and combined annual cash-flow.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input 
          type="text" 
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Paste Wallet Address (e.g. 0x123..., 0x456...)" 
          className="bg-[#0f172a] border border-[#334155] text-white px-4 py-2.5 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
        />
        <button 
          onClick={handleScan}
          disabled={isScanning}
          className={`${isScanning ? 'bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-bold px-6 py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-md`}
        >
          {isScanning ? 'Scanning Ledger...' : 'Scan Portfolio'}
        </button>
      </div>

      {isScanning && <p className="text-xs text-slate-400 animate-pulse text-center mb-6">Scanning blockchain for exact owned Token IDs & Active Tiers...</p>}

      {scanComplete && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Floor Value</p>
              <p className="text-xl md:text-2xl font-extrabold text-white">{formatCurrency(results.floorUsd)}</p>
            </div>
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Forecasted Annual Cash-Flow</p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-emerald-400'}`}>
                {results.hasErrors ? 'ERROR' : `${formatCurrency(results.yieldUsd)} /yr`}
              </p>
            </div>
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Combined Portfolio ROI</p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-blue-400'}`}>
                {results.hasErrors ? 'ERROR' : `${(results.floorUsd > 0 ? (results.yieldUsd / results.floorUsd) * 100 : 0).toFixed(2)}%`}
              </p>
            </div>
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p>
              <p className="text-xl md:text-2xl font-extrabold text-purple-400">{results.totalUnits} Units</p>
            </div>
          </div>

          <h3 className="text-sm font-bold text-white mb-4 border-b border-[#334155] pb-2">Owned Asset Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.ownedAssets.length === 0 ? (
              <p className="text-xs text-slate-400">No ecosystem NFTs found in the provided wallet(s).</p>
            ) : (
              results.ownedAssets.map((asset, idx) => (
                <div key={idx} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 flex items-center justify-between shadow-inner hover:border-slate-500 transition">
                  <div className="flex items-center gap-3">
                    <img src={`/${asset.logo}`} className="w-10 h-10 rounded-lg object-cover border border-[#334155] bg-[#1e293b]" alt={asset.ticker} />
                    <div>
                      <h4 className="text-sm font-bold text-white">{asset.ticker} Units ({asset.balance} Owned)</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{asset.wallet.slice(0,6)}...{asset.wallet.slice(-4)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {asset.hasError ? (
                        <span className="text-rose-400 border border-rose-500/50 bg-rose-900/20 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">ID Sync Error</span>
                      ) : (
                        <span className="text-emerald-400">+ {formatCurrency(asset.yieldValue)} /yr</span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Floor: {formatCurrency(asset.floorValue)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}