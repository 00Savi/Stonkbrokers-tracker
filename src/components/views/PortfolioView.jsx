import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { SAVI_X } from '../Shell';
import { compactUsd } from '../kit';
import { PROJECTS } from '../../lib/routes';
import {
  aggregateTbaHoldings,
  buildPriceIndex,
  explorerAddressUrl,
  fetchAllTbaInventories,
  resolveTbaAddress,
  tbaRegistry,
} from '../../lib/tba';
import {
  earningStartTs,
  earnedUsdForNft,
  earnedUsdForTokenPosition,
  fetchMachineMeta,
  fetchNftImage,
  fetchNftTransferLog,
  fetchOwnedNftIdsV2,
  enumerateOwnedIds,
  fetchTokenHoldStartTs,
  fetchTxEthValue,
  formatDate,
  machineAnnualForWeight,
  mapLimited,
} from '../../lib/portfolioHistory';

const FORECAST_YEARS = [1, 3, 5, 10];

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

function groupByProject(ownedAssets) {
  const map = new Map();
  for (const a of ownedAssets) {
    const prev = map.get(a.projectKey);
    if (!prev) {
      map.set(a.projectKey, {
        ...a,
        nfts: [...(a.nfts || [])],
        wallets: [a.wallet],
      });
      continue;
    }
    prev.balance += a.balance;
    prev.floorValue += a.floorValue;
    prev.yieldValue += a.yieldValue;
    prev.earnedValue += a.earnedValue || 0;
    prev.idsPartial = prev.idsPartial || a.idsPartial;
    prev.idsFound = (prev.idsFound || 0) + (a.idsFound || 0);
    prev.nfts.push(...(a.nfts || []));
    if (!prev.wallets.includes(a.wallet)) prev.wallets.push(a.wallet);
  }
  return [...map.values()];
}

export default function PortfolioView({ data }) {
  const [inputVal, setInputVal] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [results, setResults] = useState({
    floorUsd: 0,
    yieldUsd: 0,
    earnedUsd: 0,
    totalUnits: 0,
    hasErrors: false,
    ownedAssets: [],
  });
  const [inventories, setInventories] = useState({});
  const [expandedNft, setExpandedNft] = useState(null);
  const [openProjects, setOpenProjects] = useState({});
  const [enriched, setEnriched] = useState({});
  const [aggregateOpen, setAggregateOpen] = useState(false);
  const [mode, setMode] = useState('forecast');
  const [forecastYears, setForecastYears] = useState(1);
  const [scanProgress, setScanProgress] = useState('');

  const formatCurrency = compactUsd;
  const priceIndex = buildPriceIndex(data);
  const ethUsd = data?.projects?.stonk?.market?.ethPriceUsd || 0;

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
    if (wallets.length === 0) {
      alert('Please enter at least one valid EVM wallet address.');
      return;
    }

    setIsScanning(true);
    setScanComplete(false);
    setScanProgress('Connecting to Robinhood Chain…');
    setInventories({});
    setExpandedNft(null);
    setOpenProjects({});
    setEnriched({});
    setAggregateOpen(false);

    let totalFloorUsd = 0;
    let totalYieldUsd = 0;
    let totalEarnedUsd = 0;
    let totalUnits = 0;
    let portfolioHasErrors = false;
    let ownedAssets = [];

    try {
      const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
      const erc721Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
      ];
      const erc20Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const nftJobs = [];
      for (const [pKey, pData] of Object.entries(data.projects || {})) {
        if (!pData.config?.nftCa) continue;
        for (const wallet of wallets) nftJobs.push({ pKey, pData, wallet });
      }

      const nftChunks = await mapLimited(nftJobs, 1, async ({ pKey, pData, wallet }) => {
          const nftContract = new ethers.Contract(pData.config.nftCa, erc721Abi, provider);
          const floorUsd = (pData.market?.nftFloorEth || 0) * (pData.market?.ethPriceUsd || 0);
          const displayName = projectName(pKey, pData.config.ticker);
          const isMachine = pData.config?.kind === 'machines';
          try {
            const bal = Number(await nftContract.balanceOf(wallet));
            if (!(bal > 0)) return null;
            setScanProgress(`Reading ${displayName} (${bal} NFTs)…`);
            let ownedTokenIds = new Set();
            let inbound = new Map();
            let idsPartial = false;
            try {
              const log = await fetchNftTransferLog(pData.config.nftCa, wallet);
              inbound = log.inbound;
              ownedTokenIds = log.ownedIds;
            } catch {
              /* explorer rate-limit — try other ID sources */
            }
            if (ownedTokenIds.size !== bal) {
              try {
                const v2 = await fetchOwnedNftIdsV2(pData.config.nftCa, wallet);
                for (const id of v2) ownedTokenIds.add(id);
              } catch {
                /* */
              }
            }
            if (ownedTokenIds.size !== bal) {
              try {
                const enumerated = await enumerateOwnedIds(nftContract, wallet, bal);
                ownedTokenIds = enumerated.size >= ownedTokenIds.size ? enumerated : new Set([...ownedTokenIds, ...enumerated]);
              } catch {
                /* */
              }
            }
            if (ownedTokenIds.size !== bal) idsPartial = true;

            let exactYieldUsd = 0;
            let earnedForProject = 0;
            const nfts = [];
            const activeMap = pData.activation?.activeTokenTiers || {};
            const ids = [...ownedTokenIds].sort((a, b) => a - b);
            const machineMeta = new Map();
            if (isMachine && ids.length) {
              setScanProgress(`Reading ${displayName} machine metadata (${ids.length})…`);
              await mapLimited(ids, 4, async (tokenId) => {
                machineMeta.set(tokenId, await fetchMachineMeta(pData.config.nftCa, tokenId));
              });
            }
            for (const tokenId of ids) {
              const tokenData = activeMap[tokenId];
              const machine = machineMeta.get(tokenId);
              const earning = isMachine ? !!machine?.inked : !!tokenData;
              const tierId = tokenData?.t || 'T0';
              const tierObj = pData.tiers.find((t) => t.tier === tierId) || pData.tiers[0];
              const yieldValue = isMachine
                ? (earning ? machineAnnualForWeight(pData, machine?.weight || 100) : 0)
                : earning
                  ? (tierObj?.trackedAnnualYieldUsd || 0)
                  : 0;
              exactYieldUsd += yieldValue;
              const lastIn = inbound.get(tokenId);
              const startTs = earningStartTs({
                lastTransferTs: lastIn?.ts,
                activationTs: tokenData?.ts,
                isActive: earning,
              });
              const earnedValue = isMachine
                ? earning && startTs
                  ? (yieldValue / 365) * Math.max(0, (Date.now() / 1000 - startTs) / 86400)
                  : 0
                : earning
                  ? earnedUsdForNft(pData, tierId, startTs)
                  : 0;
              earnedForProject += earnedValue;
              nfts.push({
                id: `${pKey}-${wallet}-${tokenId}`,
                projectKey: pKey,
                nftCa: pData.config.nftCa,
                tokenId,
                tierId,
                tierName: isMachine
                  ? (earning
                    ? `Awake · ${Number(machine?.multiplier || machine?.weight / 100 || 1).toFixed(1)}×`
                    : 'Dormant')
                  : earning
                    ? (tierObj?.name || tierId)
                    : 'Inactive',
                yieldValue,
                earnedValue,
                floorValue: floorUsd,
                tba: null,
                wallet,
                lastTransferTs: lastIn?.ts || 0,
                lastTransferHash: lastIn?.hash || null,
                minted: !!lastIn?.mint,
                activationTs: tokenData?.ts || 0,
                isActive: earning,
                alwaysOn: false,
                machineWeight: machine?.weight || 0,
                machineInk: machine?.ink || 0,
                imageUrl: machine?.imageUrl || null,
                purchaseEth: 0,
              });
            }
            return {
              error: false,
              units: bal,
              floor: bal * floorUsd,
              yield: exactYieldUsd,
              earned: earnedForProject,
              asset: {
                projectKey: pKey,
                project: displayName,
                ticker: pData.config.ticker,
                logo: pData.config.logo || 'Stonkbroker.png',
                wallet,
                balance: bal,
                floorValue: bal * floorUsd,
                yieldValue: exactYieldUsd,
                earnedValue: earnedForProject,
                hasError: false,
                idsPartial,
                idsFound: ids.length,
                nfts,
              },
            };
          } catch (e) {
            console.error('Wallet read error', e);
            return null;
          }
      });

      for (const row of nftChunks) {
        if (!row) continue;
        totalUnits += row.asset.balance;
        totalFloorUsd += row.asset.floorValue;
        totalYieldUsd += row.asset.yieldValue;
        totalEarnedUsd += row.asset.earnedValue;
        if (row.error) portfolioHasErrors = true;
        ownedAssets.push(row.asset);
      }

      setScanProgress('Reading token balances…');

      const tokenJobs = [];
      for (const [pKey, pData] of Object.entries(data.projects || {})) {
        const kind = pData.config?.kind;
        if (kind !== 'cashflow' && kind !== 'vault') continue;
        const ca = pData.config?.tokenCa;
        if (!ca) continue;
        for (const wallet of wallets) tokenJobs.push({ pKey, pData, wallet, ca });
      }

      const tokenChunks = await Promise.all(
        tokenJobs.map(async ({ pKey, pData, wallet, ca }) => {
          const token = new ethers.Contract(ca, erc20Abi, provider);
          let decimals = 18;
          try {
            decimals = Number(await token.decimals());
          } catch {
            /* 18 */
          }
          try {
            const raw = await token.balanceOf(wallet);
            const amount = Number(ethers.formatUnits(raw, decimals));
            if (!(amount > 0)) return null;
            const circulating = pData.ownership?.circulatingSupply || 0;
            const annual = pData.cashflow?.holdersAnnualized || pData.cashflow?.revenueAnnualized || 0;
            const price = pData.market?.tokenPriceUsd || 0;
            const value = amount * price;
            const share = circulating > 0 ? amount / circulating : 0;
            const yieldValue = annual * share;
            let holdStart = 0;
            try {
              holdStart = await fetchTokenHoldStartTs(ca, wallet);
            } catch {
              holdStart = 0;
            }
            const earnedValue = earnedUsdForTokenPosition(pData, amount, holdStart);
            return {
              floor: value,
              yield: yieldValue,
              earned: earnedValue,
              asset: {
                projectKey: pKey,
                project: projectName(pKey, pData.config.ticker),
                ticker: pData.config.ticker,
                logo: pData.config.logo || 'Stonkbroker.png',
                wallet,
                balance: amount,
                floorValue: value,
                yieldValue,
                earnedValue,
                hasError: false,
                nfts: [],
                tokenPosition: true,
                holdStartTs: holdStart,
              },
            };
          } catch (e) {
            console.error('Token read error', e);
            return null;
          }
        })
      );

      for (const row of tokenChunks) {
        if (!row) continue;
        totalFloorUsd += row.floor;
        totalYieldUsd += row.yield;
        totalEarnedUsd += row.earned;
        ownedAssets.push(row.asset);
      }

      setResults({
        floorUsd: totalFloorUsd,
        yieldUsd: totalYieldUsd,
        earnedUsd: totalEarnedUsd,
        totalUnits,
        hasErrors: portfolioHasErrors,
        ownedAssets,
      });
    } catch (err) {
      console.error(err);
      alert('Error connecting to the blockchain RPC. Please try again.');
    }

    setIsScanning(false);
    setScanProgress('');
    setScanComplete(true);
  };

  const enrichProject = async (projectKey) => {
    if (enriched[projectKey]) return;
    setEnriched((e) => ({ ...e, [projectKey]: 'loading' }));
    const nfts = results.ownedAssets.flatMap((a) => (a.projectKey === projectKey ? a.nfts || [] : []));
    if (!nfts.length) {
      setEnriched((e) => ({ ...e, [projectKey]: 'done' }));
      return;
    }
    const hashes = [...new Set(nfts.map((n) => n.lastTransferHash).filter(Boolean))];
    const ethByHash = {};
    await mapLimited(hashes, 4, async (hash) => {
      ethByHash[hash] = await fetchTxEthValue(hash);
    });
    await mapLimited(nfts, 6, async (nft) => {
      nft.imageUrl = await fetchNftImage(nft.nftCa, nft.tokenId);
      nft.purchaseEth = nft.lastTransferHash ? ethByHash[nft.lastTransferHash] || 0 : 0;
    });
    try {
      const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
      const registry = tbaRegistry(provider);
      await mapLimited(nfts, 8, async (nft) => {
        if (nft.tba) return;
        try {
          nft.tba = await resolveTbaAddress(registry, nft.nftCa, nft.tokenId);
        } catch (e) {
          console.error('TBA resolve failed', e);
        }
      });
      loadInventories(nfts.filter((n) => n.tba));
    } catch (e) {
      console.error(e);
    }
    setResults((r) => ({ ...r, ownedAssets: [...r.ownedAssets] }));
    setEnriched((e) => ({ ...e, [projectKey]: 'done' }));
  };

  const toggleProject = (projectKey) => {
    setOpenProjects((prev) => {
      const next = { ...prev, [projectKey]: !prev[projectKey] };
      if (next[projectKey]) enrichProject(projectKey);
      return next;
    });
  };

  const allNfts = results.ownedAssets.flatMap((a) => a.nfts || []);
  const aggregate = aggregateTbaHoldings(allNfts, inventories, priceIndex);
  const inventoriesPending = allNfts.some((n) => n.tba && inventories[n.tba]?.status === 'loading');
  const grouped = useMemo(() => groupByProject(results.ownedAssets), [results.ownedAssets]);
  const forecastUsd = results.yieldUsd * forecastYears;
  const cashLabel = mode === 'history' ? 'Earned in your ownership' : `Forecasted ${forecastYears}y cash-flow`;
  const cashValue = mode === 'history' ? results.earnedUsd : forecastUsd;
  const roiPct =
    results.floorUsd > 0 ? ((mode === 'history' ? results.earnedUsd : forecastUsd) / results.floorUsd) * 100 : 0;

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl mt-6">
      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          Multi-Wallet Ecosystem Portfolio Tracker
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Scan single or multiple comma-separated wallet addresses. Forecast uses current yield.
          History counts drops after you received the NFT (and after activation). RH Machines only
          pay awake/inked units, scaled by on-chain weight. TBA and images load when you expand a
          collection.
        </p>
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
          </a>{' '}
          and let us know what you want added.
        </p>
      </div>

      {isScanning && (
        <p className="text-xs text-slate-300 text-center mb-6">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-2 align-middle" />
          {scanProgress || 'Scanning owned Token IDs, last transfers, and activations…'}
          <span className="block text-slate-500 mt-1">Large wallets are read one collection at a time so the explorer does not drop the request.</span>
        </p>
      )}

      {scanComplete && (
        <div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
            <div className="flex bg-[#08090b] rounded-lg p-1 border border-[#1e2228]">
              {[
                { id: 'forecast', label: 'Annual forecast' },
                { id: 'history', label: 'Earned history' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${
                    mode === opt.id ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {mode === 'forecast' && (
              <div className="flex bg-[#08090b] rounded-lg p-1 border border-[#1e2228]">
                {FORECAST_YEARS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setForecastYears(y)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${
                      forecastYears === y ? 'bg-[#1e2228] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {y}y
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Floor Value</p>
              <p className="text-xl md:text-2xl font-extrabold text-white">{formatCurrency(results.floorUsd)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">{cashLabel}</p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-emerald-400'}`}>
                {results.hasErrors ? 'ERROR' : formatCurrency(cashValue)}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">
                {mode === 'history' ? 'Realized vs floor' : 'Combined Portfolio ROI'}
              </p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-blue-400'}`}>
                {results.hasErrors ? 'ERROR' : `${roiPct.toFixed(2)}%`}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p>
              <p className="text-xl md:text-2xl font-extrabold text-purple-400">{results.totalUnits} Units</p>
            </div>
          </div>

          <h3 className="text-sm font-bold text-white mb-4 border-b border-[#1e2228] pb-2">Owned Asset Breakdown</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {grouped.length === 0 ? (
              <p className="text-xs text-slate-400 lg:col-span-2">No ecosystem NFTs found in the provided wallet(s).</p>
            ) : (
              grouped.map((asset) => {
                const open = !!openProjects[asset.projectKey];
                const assetRoi =
                  asset.floorValue > 0
                    ? (((mode === 'history' ? asset.earnedValue : asset.yieldValue * forecastYears) /
                        asset.floorValue) *
                        100)
                    : 0;
                return (
                <div key={asset.projectKey} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <button
                    type="button"
                    onClick={() => toggleProject(asset.projectKey)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={`/${asset.logo}`}
                        className="w-10 h-10 rounded-lg object-cover border border-[#1e2228] bg-[#0e1013]"
                        alt={asset.ticker}
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white">
                          {asset.project} ({asset.tokenPosition ? formatAmount(asset.balance) : `${asset.balance} owned`})
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {(asset.wallets || [asset.wallet]).map((w) => `${w.slice(0, 6)}...${w.slice(-4)}`).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">
                        {asset.hasError ? (
                          <span className="text-rose-400 border border-rose-500/50 bg-rose-900/20 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                            ID Sync Error
                          </span>
                        ) : (
                          <span className="text-emerald-400">
                            {mode === 'history'
                              ? formatCurrency(asset.earnedValue || 0)
                              : `+ ${formatCurrency((asset.yieldValue || 0) * forecastYears)}`}
                          </span>
                        )}
                      </p>
                      {asset.idsPartial && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          Showing {asset.idsFound || (asset.nfts || []).length} of {asset.balance} IDs — yield is for listed NFTs only
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        Floor {formatCurrency(asset.floorValue)} · ROI {assetRoi.toFixed(1)}%
                      </p>
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {open && asset.tokenPosition && (
                    <p className="text-[11px] text-slate-500 mt-3 border-t border-[#1e2228] pt-3">
                      Token position. History counts this wallet&apos;s share of protocol cash-flow after the
                      current hold started
                      {asset.holdStartTs ? ` (${formatDate(asset.holdStartTs)})` : ''}.
                    </p>
                  )}

                  {open && asset.nfts?.length > 0 && (
                    <div className="overflow-x-auto border-t border-[#1e2228] mt-3">
                      {enriched[asset.projectKey] === 'loading' && (
                        <p className="text-[11px] text-slate-500 animate-pulse py-2">Loading NFT details…</p>
                      )}
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                            <th className="py-2 pr-2 font-medium">NFT</th>
                            <th className="py-2 px-2 font-medium">Purchased</th>
                            <th className="py-2 px-2 font-medium">Activated / ink</th>
                            <th className="py-2 pl-2 font-medium text-right">{mode === 'history' ? 'Earned' : 'Forecast'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e2228]/80">
                          {asset.nfts.map((nft) => {
                            const open = expandedNft === nft.id;
                            const inv = nft.tba ? inventories[nft.tba] : null;
                            const purchaseUsd = (nft.purchaseEth || 0) * ethUsd;
                            return (
                              <React.Fragment key={nft.id}>
                                <tr
                                  className="cursor-pointer hover:bg-[#1e2228]/30"
                                  onClick={() => setExpandedNft(open ? null : nft.id)}
                                >
                                  <td className="py-2 pr-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {nft.imageUrl ? (
                                        <img
                                          src={nft.imageUrl}
                                          alt={`#${nft.tokenId}`}
                                          className="h-10 w-10 rounded-md object-cover border border-[#1e2228] bg-[#0e1013]"
                                        />
                                      ) : (
                                        <div className="h-10 w-10 rounded-md border border-[#1e2228] bg-[#0e1013]" />
                                      )}
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">
                                          #{nft.tokenId} · {nft.tierName}
                                        </p>
                                        <p className="text-[10px] text-slate-500">Floor {formatCurrency(nft.floorValue)}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-300 whitespace-nowrap">
                                    <div>{formatDate(nft.lastTransferTs)}</div>
                                    <div className="text-slate-500">
                                      {nft.minted
                                        ? 'Mint'
                                        : purchaseUsd > 0
                                          ? formatCurrency(purchaseUsd)
                                          : '—'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-300 whitespace-nowrap">
                                    {nft.machineInk > 0 || nft.machineWeight > 0 ? (
                                      <>
                                        <div>{nft.isActive ? 'Inked' : 'Dormant'}</div>
                                        <div className="text-slate-500">
                                          {nft.machineInk ? `${nft.machineInk.toLocaleString()} ink` : ''}
                                          {nft.machineWeight ? ` · wt ${nft.machineWeight}` : ''}
                                        </div>
                                      </>
                                    ) : nft.isActive ? (
                                      formatDate(nft.activationTs)
                                    ) : (
                                      'Not active'
                                    )}
                                  </td>
                                  <td className="py-2 pl-2 text-right text-xs font-bold text-emerald-400 whitespace-nowrap">
                                    {mode === 'history'
                                      ? formatCurrency(nft.earnedValue || 0)
                                      : `+ ${formatCurrency(nft.yieldValue * forecastYears)}`}
                                  </td>
                                </tr>
                                {open && (
                                  <tr>
                                    <td colSpan="4" className="pb-3 pt-1">
                                      {enriched[asset.projectKey] === 'loading' && !nft.tba ? (
                                        <p className="text-xs text-slate-500 animate-pulse">Resolving tokenbound wallet...</p>
                                      ) : nft.tba ? (
                                        <p className="text-[10px] text-slate-500 font-mono mb-2">
                                          TBA{' '}
                                          <a
                                            href={explorerAddressUrl(nft.tba)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline underline-offset-2 hover:text-slate-300"
                                          >
                                            {nft.tba.slice(0, 6)}...{nft.tba.slice(-4)}
                                          </a>
                                        </p>
                                      ) : (
                                        <p className="text-xs text-rose-400 mb-2">Could not resolve the tokenbound wallet.</p>
                                      )}
                                      {inv?.status === 'loading' && (
                                        <p className="text-xs text-slate-500 animate-pulse">Reading tokenbound balances...</p>
                                      )}
                                      {inv?.status === 'error' && (
                                        <p className="text-xs text-rose-400">Could not load TBA inventory.</p>
                                      )}
                                      {inv?.status === 'ok' && (
                                        <HoldingRows
                                          tokens={inv.tokens}
                                          priceIndex={priceIndex}
                                          formatCurrency={formatCurrency}
                                        />
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                );
              })
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
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform ${aggregateOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
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
