import React, { useState } from 'react';
import { ethers } from 'ethers';
import { SAVI_X } from '../Shell';
import { PROJECTS } from '../../lib/routes';
import {
  aggregateTbaHoldings,
  buildPriceIndex,
  explorerAddressUrl,
  fetchAllTbaInventories,
  resolveTbaAddress,
  tbaRegistry,
} from '../../lib/tba';

const projectName = (key, ticker) =>
  PROJECTS.find((p) => p.key === key)?.name || ticker;

const formatAmount = (val) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: val >= 1 ? 2 : 4 }).format(val || 0);

function HoldingRows({ tokens, priceIndex, formatCurrency }) {
  if (!tokens.length) {
    return <p className="text-xs text-slate-500">No tokens or NFTs in this tokenbound wallet.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {tokens.map((tok) => {
        const usd = tok.nft ? 0 : (priceIndex[tok.contract] || 0) * tok.amount;
        return (
          <li key={tok.contract} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-300 truncate">
              <span className="font-semibold text-white">{tok.symbol}</span>
              {tok.nft ? (
                <span className="text-slate-500"> · {formatAmount(tok.amount)} NFT</span>
              ) : (
                <span className="text-slate-500"> · {formatAmount(tok.amount)}</span>
              )}
            </span>
            <span className="text-slate-400 shrink-0">{usd > 0 ? formatCurrency(usd) : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function PortfolioView({ data }) {
  const [inputVal, setInputVal] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [results, setResults] = useState({ floorUsd: 0, yieldUsd: 0, totalUnits: 0, hasErrors: false, ownedAssets: [] });
  const [inventories, setInventories] = useState({});
  const [expandedNft, setExpandedNft] = useState(null);
  const [aggregateOpen, setAggregateOpen] = useState(false);

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  const priceIndex = buildPriceIndex(data);

  const loadInventories = (nfts) => {
    const tbas = [...new Set(nfts.map((n) => n.tba).filter(Boolean))];
    if (!tbas.length) return;
    setInventories(Object.fromEntries(tbas.map((tba) => [tba, { status: 'loading', tokens: [] }])));
    fetchAllTbaInventories(tbas, data)
      .then((map) => {
        setInventories(
          Object.fromEntries(tbas.map((tba) => [tba, { status: 'ok', tokens: map[tba] || [] }]))
        );
      })
      .catch(() => {
        setInventories(
          Object.fromEntries(tbas.map((tba) => [tba, { status: 'error', tokens: [] }]))
        );
      });
  };

  const handleScan = async () => {
    if (!inputVal.trim()) return;
    const wallets = inputVal.split(',').map((w) => w.trim()).filter((w) => ethers.isAddress(w));
    if (wallets.length === 0) { alert('Please enter at least one valid EVM wallet address.'); return; }

    setIsScanning(true);
    setScanComplete(false);
    setInventories({});
    setExpandedNft(null);
    setAggregateOpen(false);

    let totalFloorUsd = 0;
    let totalYieldUsd = 0;
    let totalUnits = 0;
    let portfolioHasErrors = false;
    let ownedAssets = [];
    const resolvedNfts = [];

    try {
      const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
      const erc721Abi = ['function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)'];
      const registry = tbaRegistry(provider);

      for (const [pKey, pData] of Object.entries(data.projects || {})) {
        if (!pData.config?.nftCa) continue;
        const nftContract = new ethers.Contract(pData.config.nftCa, erc721Abi, provider);
        const floorUsd = (pData.market?.nftFloorEth || 0) * (pData.market?.ethPriceUsd || 0);
        const displayName = projectName(pKey, pData.config.ticker);

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
                for (let i = 0; i < bal; i++) {
                  const tId = await nftContract.tokenOfOwnerByIndex(wallet, i);
                  ownedTokenIds.add(Number(tId));
                }
              } catch (rpcErr) {
                try {
                  let page = 1;
                  while (true) {
                    const url = `https://robinhoodchain.blockscout.com/api?module=account&action=tokennfttx&contractaddress=${pData.config.nftCa}&address=${wallet}&page=${page}&offset=1000&sort=asc`;
                    const res = await fetch(url);
                    const json = await res.json();

                    if (json.status === '1' && Array.isArray(json.result)) {
                      json.result.forEach((tx) => {
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

              const nfts = [];
              if (fetchError || ownedTokenIds.size !== bal) {
                portfolioHasErrors = true;
              } else {
                const activeMap = pData.activation?.activeTokenTiers || {};
                const ids = [...ownedTokenIds].sort((a, b) => a - b);
                for (const tokenId of ids) {
                  const tokenData = activeMap[tokenId];
                  const tierId = tokenData ? tokenData.t : 'T0';
                  const tierObj = pData.tiers.find((t) => t.tier === tierId) || pData.tiers[0];
                  const yieldValue = tierObj?.trackedAnnualYieldUsd || 0;
                  exactYieldUsd += yieldValue;
                  let tba = null;
                  try {
                    tba = await resolveTbaAddress(registry, pData.config.nftCa, tokenId);
                  } catch (e) {
                    console.error('TBA resolve failed', e);
                  }
                  const nft = {
                    id: `${pKey}-${wallet}-${tokenId}`,
                    projectKey: pKey,
                    tokenId,
                    tierId,
                    tierName: tierObj?.name || tierId,
                    yieldValue,
                    floorValue: floorUsd,
                    tba,
                    wallet,
                  };
                  nfts.push(nft);
                  if (tba) resolvedNfts.push(nft);
                }
                totalYieldUsd += exactYieldUsd;
              }

              ownedAssets.push({
                projectKey: pKey,
                project: displayName,
                ticker: pData.config.ticker,
                logo: pData.config.logo || 'Stonkbroker.png',
                wallet,
                balance: bal,
                floorValue: bal * floorUsd,
                yieldValue: exactYieldUsd,
                hasError: fetchError || ownedTokenIds.size !== bal,
                nfts,
              });
            }
          } catch (e) { console.error('Wallet read error', e); }
        }
      }

      const erc20Abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
      for (const [pKey, pData] of Object.entries(data.projects || {})) {
        const kind = pData.config?.kind;
        if (kind !== 'cashflow' && kind !== 'vault') continue;
        const ca = pData.config?.tokenCa;
        if (!ca) continue;
        const token = new ethers.Contract(ca, erc20Abi, provider);
        let decimals = 18;
        try { decimals = Number(await token.decimals()); } catch { /* 18 */ }
        const circulating = pData.ownership?.circulatingSupply || 0;
        const annual = pData.cashflow?.holdersAnnualized || pData.cashflow?.revenueAnnualized || 0;
        const price = pData.market?.tokenPriceUsd || 0;

        for (const wallet of wallets) {
          try {
            const raw = await token.balanceOf(wallet);
            const amount = Number(ethers.formatUnits(raw, decimals));
            if (!(amount > 0)) continue;
            const value = amount * price;
            const share = circulating > 0 ? amount / circulating : 0;
            const yieldValue = annual * share;
            totalFloorUsd += value;
            totalYieldUsd += yieldValue;
            ownedAssets.push({
              projectKey: pKey,
              project: projectName(pKey, pData.config.ticker),
              ticker: pData.config.ticker,
              logo: pData.config.logo || 'Stonkbroker.png',
              wallet,
              balance: amount,
              floorValue: value,
              yieldValue,
              hasError: false,
              nfts: [],
              tokenPosition: true,
            });
          } catch (e) { console.error('Token read error', e); }
        }
      }

      setResults({ floorUsd: totalFloorUsd, yieldUsd: totalYieldUsd, totalUnits, hasErrors: portfolioHasErrors, ownedAssets });
      loadInventories(resolvedNfts);
    } catch (err) {
      console.error(err);
      alert('Error connecting to the blockchain RPC. Please try again.');
    }

    setIsScanning(false);
    setScanComplete(true);
  };

  const allNfts = results.ownedAssets.flatMap((a) => a.nfts || []);
  const aggregate = aggregateTbaHoldings(allNfts, inventories, priceIndex);
  const inventoriesPending = allNfts.some((n) => n.tba && inventories[n.tba]?.status === 'loading');

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-6 shadow-xl mt-6">
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
          className="bg-[#08090b] border border-[#1e2228] text-white px-4 py-2.5 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleScan}
          disabled={isScanning}
          className={`${isScanning ? 'bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-bold px-6 py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-md`}
        >
          {isScanning ? 'Scanning Ledger...' : 'Scan Portfolio'}
        </button>
      </div>

      <div className="mb-8 max-w-2xl border-t border-[#1e2228] pt-5">
        <p className="text-sm text-slate-300 leading-relaxed">
          Welcome to Savi's Dashboard. Currently supported: StonkBrokers, Mancer, TickerYard, The Card Wall, The Index, RH Machines, Oakmont Vault, plus the token and stock lists.
        </p>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          We will continue to add more support for the growing ecosystem. Make sure to{' '}
          <a
            href={SAVI_X}
            target="_blank"
            rel="noreferrer"
            className="text-slate-200 underline underline-offset-2 hover:text-white"
          >
            follow @savicrypto on X
          </a>
          {' '}and let us know what you want added.
        </p>
      </div>

      {isScanning && <p className="text-xs text-slate-400 animate-pulse text-center mb-6">Scanning blockchain for owned Token IDs, active tiers, and tokenbound wallets...</p>}

      {scanComplete && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Floor Value</p>
              <p className="text-xl md:text-2xl font-extrabold text-white">{formatCurrency(results.floorUsd)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Forecasted Annual Cash-Flow</p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-emerald-400'}`}>
                {results.hasErrors ? 'ERROR' : `${formatCurrency(results.yieldUsd)} /yr`}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Combined Portfolio ROI</p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-blue-400'}`}>
                {results.hasErrors ? 'ERROR' : `${(results.floorUsd > 0 ? (results.yieldUsd / results.floorUsd) * 100 : 0).toFixed(2)}%`}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p>
              <p className="text-xl md:text-2xl font-extrabold text-purple-400">{results.totalUnits} Units</p>
            </div>
          </div>

          <h3 className="text-sm font-bold text-white mb-4 border-b border-[#1e2228] pb-2">Owned Asset Breakdown</h3>
          <div className="space-y-4">
            {results.ownedAssets.length === 0 ? (
              <p className="text-xs text-slate-400">No ecosystem NFTs found in the provided wallet(s).</p>
            ) : (
              results.ownedAssets.map((asset, idx) => (
                <div key={idx} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={`/${asset.logo}`} className="w-10 h-10 rounded-lg object-cover border border-[#1e2228] bg-[#0e1013]" alt={asset.ticker} />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white">{asset.project} ({asset.balance} owned)</h4>
                        <p className="text-[10px] text-slate-400 font-mono">{asset.wallet.slice(0, 6)}...{asset.wallet.slice(-4)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
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

                  {asset.nfts?.length > 0 && (
                    <div className="divide-y divide-[#1e2228]/80 border-t border-[#1e2228]">
                      {asset.nfts.map((nft) => {
                        const open = expandedNft === nft.id;
                        const inv = nft.tba ? inventories[nft.tba] : null;
                        return (
                          <div key={nft.id}>
                            <button
                              type="button"
                              onClick={() => setExpandedNft(open ? null : nft.id)}
                              className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-[#1e2228]/30 transition px-1"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">#{nft.tokenId} · {nft.tierName}</p>
                                <p className="text-[10px] text-slate-500">Floor {formatCurrency(nft.floorValue)}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-emerald-400">+ {formatCurrency(nft.yieldValue)} /yr</span>
                                <svg className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                              </div>
                            </button>
                            {open && (
                              <div className="pb-3 px-1">
                                {nft.tba ? (
                                  <p className="text-[10px] text-slate-500 font-mono mb-2">
                                    TBA{' '}
                                    <a href={explorerAddressUrl(nft.tba)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-300">
                                      {nft.tba.slice(0, 6)}...{nft.tba.slice(-4)}
                                    </a>
                                  </p>
                                ) : (
                                  <p className="text-xs text-rose-400 mb-2">Could not resolve the tokenbound wallet.</p>
                                )}
                                {inv?.status === 'loading' && <p className="text-xs text-slate-500 animate-pulse">Reading tokenbound balances...</p>}
                                {inv?.status === 'error' && <p className="text-xs text-rose-400">Could not load TBA inventory.</p>}
                                {inv?.status === 'ok' && (
                                  <HoldingRows tokens={inv.tokens} priceIndex={priceIndex} formatCurrency={formatCurrency} />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {allNfts.length > 0 && (
            <div className="mt-6 bg-[#08090b] border border-[#1e2228] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setAggregateOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1e2228]/30 transition"
              >
                <span className="text-sm font-bold text-white">All assets in tokenbound wallets</span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    {inventoriesPending ? 'loading…' : `${aggregate.length} asset${aggregate.length === 1 ? '' : 's'}`}
                  </span>
                  <svg className={`w-4 h-4 text-slate-500 transition-transform ${aggregateOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </span>
              </button>
              {aggregateOpen && (
                <div className="px-4 pb-4 border-t border-[#1e2228] pt-3">
                  <p className="text-[10px] text-slate-500 mb-3">
                    Combined ERC-20 and NFT balances across every resolved TBA for supported collections in this scan.
                  </p>
                  {inventoriesPending && aggregate.length === 0 ? (
                    <p className="text-xs text-slate-500 animate-pulse">Reading tokenbound wallets...</p>
                  ) : (
                    <HoldingRows tokens={aggregate} priceIndex={priceIndex} formatCurrency={formatCurrency} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
