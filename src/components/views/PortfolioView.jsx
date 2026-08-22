import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function PortfolioView({ data }) {
  const [walletInput, setWalletInput] = useState('');
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const formatCurrency = (val) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val || 0);

  const scanWallets = async () => {
    const input = walletInput.trim();
    if (!input) return;
    
    const wallets = input.split(',').map(w => w.trim()).filter(w => ethers.isAddress(w));
    if (wallets.length === 0) {
      setError('Please enter at least one valid EVM wallet address.');
      return;
    }
    if (wallets.length > 5) {
      setError('Please enter a maximum of 5 wallet addresses at a time.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const provider = new ethers.JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com");
      const erc721Abi = [
        "function balanceOf(address) view returns (uint256)", 
        "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)"
      ];

      let totalFloorUsd = 0;
      let totalYieldUsd = 0;
      let totalHistoricalEarnedUsd = 0;
      let totalUnits = 0;
      let ownedItems = [];

      const projects = data?.projects || {};

      for (const [pKey, pData] of Object.entries(projects)) {
        if (!pData.config?.nftCa) continue;
        const nftContract = new ethers.Contract(pData.config.nftCa, erc721Abi, provider);
        const floorUsd = (pData.market?.nftFloorEth || 0) * (pData.market?.ethPriceUsd || 0);
        const topTier = pData.tiers?.[pData.tiers.length - 1] || pData.tiers?.[0];

        for (const wallet of wallets) {
          try {
            const bal = Number(await nftContract.balanceOf(wallet));
            if (bal > 0) {
              totalUnits += bal;
              totalFloorUsd += (bal * floorUsd);
              
              let exactYieldUsd = 0;
              let walletHistoricalEarned = 0;
              const activeMap = pData.activation?.activeTokenTiers || {};
              const snapshots = pData.dailySnapshots || [];

              for (let i = 0; i < bal; i++) {
                try {
                  const tId = await nftContract.tokenOfOwnerByIndex(wallet, i);
                  const numId = Number(tId);
                  const tokenData = activeMap[numId] || activeMap[String(numId)];
                  
                  const tierObj = tokenData ? (pData.tiers?.find(t => t.tier === tokenData.t) || topTier) : topTier;
                  const annualYield = (tierObj?.trackedAnnualYieldUsd || 0);
                  exactYieldUsd += annualYield;

                  // Fetch exact transfer date into this wallet via Blockscout API
                  let entryTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000); // Default to 7 days if lookup fails
                  try {
                    const txRes = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${pData.config.nftCa}/instances/${numId}/transfers`);
                    const txJson = await txRes.json();
                    const transfers = txJson.items || [];
                    
                    // Find the last transfer where 'to' matches the current wallet
                    const incomingTx = transfers.find(tx => tx.to?.hash?.toLowerCase() === wallet.toLowerCase());
                    if (incomingTx && incomingTx.timestamp) {
                      entryTimestamp = new Date(incomingTx.timestamp).getTime();
                    }
                  } catch (apiErr) {}

                  // Calculate exact historical earnings from snapshots starting strictly from the entry date onwards
                  snapshots.forEach(snap => {
                    const snapDateMs = new Date(snap.date).getTime();
                    if (!isNaN(snapDateMs) && snapDateMs >= entryTimestamp) {
                      const dailyTierYield = (tierObj?.trackedAnnualYieldUsd || 0) / 365;
                      walletHistoricalEarned += dailyTierYield;
                    }
                  });

                } catch (e) {
                  const annualYield = (topTier?.trackedAnnualYieldUsd || 0);
                  exactYieldUsd += annualYield;
                  walletHistoricalEarned += ((annualYield / 365) * 7);
                }
              }

              totalYieldUsd += exactYieldUsd;
              totalHistoricalEarnedUsd += walletHistoricalEarned;

              ownedItems.push({
                ticker: pData.config.ticker,
                name: pData.config.name,
                logo: pData.config.logo || '/Stonkbroker.png',
                balance: bal,
                wallet: wallet,
                floorValueUsd: bal * floorUsd,
                annualYieldUsd: exactYieldUsd,
                historicalEarnedUsd: walletHistoricalEarned
              });
            }
          } catch (e) {}
        }
      }

      const combinedRoi = totalFloorUsd > 0 ? (totalYieldUsd / totalFloorUsd) * 100 : 0;

      setResults({
        totalFloorUsd,
        totalYieldUsd,
        totalHistoricalEarnedUsd,
        combinedRoi,
        totalUnits,
        items: ownedItems
      });
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Error scanning wallets via RPC. Please verify addresses and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 md:p-8 shadow-xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span>💼</span> Multi-Wallet Ecosystem Portfolio Tracker
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Scan up to 5 comma-separated wallet addresses to track total active NFTs, net asset value, and forecasted annual cash-flow.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <input 
          type="text" 
          value={walletInput}
          onChange={(e) => setWalletInput(e.target.value)}
          placeholder="Paste up to 5 Wallet Addresses (e.g. 0x123..., 0x456...)" 
          className="bg-[#0f172a] border border-[#334155] text-white px-4 py-2.5 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
        />
        <button 
          onClick={scanWallets}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
        >
          {loading ? 'Scanning Chain...' : 'Scan Portfolio'}
        </button>
      </div>

      {/* Historical Toggle Switch */}
      <div className="flex items-center justify-between bg-[#0f172a] border border-[#334155] px-4 py-3 rounded-xl">
        <div>
          <p className="text-sm font-bold text-white">Include Historical Lifetime Earnings</p>
          <p className="text-xs text-slate-400">Aggregate past drops and rewards earned strictly since entering the wallet.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={includeHistorical} 
            onChange={(e) => setIncludeHistorical(e.target.checked)} 
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>

      {error && <p className="text-xs text-rose-400 font-semibold">{error}</p>}

      {results && (
        <div className="space-y-6 animate-fadeIn">
          <div className={`grid grid-cols-2 ${includeHistorical ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Floor Value</p>
              <p className="text-xl md:text-2xl font-extrabold text-white">{formatCurrency(results.totalFloorUsd)}</p>
            </div>
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Forecasted Annual Cash-Flow</p>
              <p className="text-xl md:text-2xl font-extrabold text-emerald-400">{formatCurrency(results.totalYieldUsd)} /yr</p>
            </div>
            {includeHistorical && (
              <div className="bg-[#0f172a] border border-amber-500/30 rounded-xl p-5 shadow-inner bg-amber-500/5">
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-amber-400 mb-1">Lifetime Earned (Past)</p>
                <p className="text-xl md:text-2xl font-extrabold text-amber-300">{formatCurrency(results.totalHistoricalEarnedUsd)}</p>
              </div>
            )}
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Combined Portfolio ROI</p>
              <p className="text-xl md:text-2xl font-extrabold text-blue-400">{results.combinedRoi.toFixed(2)}%</p>
            </div>
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p>
              <p className="text-xl md:text-2xl font-extrabold text-purple-400">{formatNumber(results.totalUnits)} Units</p>
            </div>
          </div>

          <h3 className="text-sm font-bold text-white mb-4">Owned Asset Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 flex items-center justify-between shadow-inner">
              {results.items.length > 0 ? (
                results.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <img src={item.logo} alt={item.ticker} className="w-10 h-10 rounded-lg object-cover border border-[#334155]" />
                      <div>
                        <h4 className="text-sm font-bold text-white">{item.ticker} Units ({item.balance} Owned)</h4>
                        <p className="text-[10px] text-slate-400">{item.wallet.slice(0,6)}...{item.wallet.slice(-4)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">+ {formatCurrency(item.annualYieldUsd)} /yr</p>
                      {includeHistorical && (
                        <p className="text-xs font-bold text-amber-400 mt-0.5">Past Earned: {formatCurrency(item.historicalEarnedUsd)}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">Floor: {formatCurrency(item.floorValueUsd)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 col-span-2">No ecosystem NFTs found in the provided wallet(s).</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}