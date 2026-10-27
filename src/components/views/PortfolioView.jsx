import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { SAVI_X } from '../Shell';
import { NfaNote } from '../Disclaimer';
import { copyElement, copyPortfolioSnapshot } from '../../lib/share';
import { CsvButton } from '../CsvButton';
import { PAIR_COLORS, STREAM_COLORS } from '../../lib/charts';
import { SliceChart } from '../SliceChart';
import { PROJECTS } from '../../lib/routes';
import { navNftScanTargets, portfolioProjectLabel } from '../../lib/portfolioScan';
import { formatMoney, moneyTick, readDisplay, useDisplayCurrency } from '../../lib/money';
import { formatLabels } from '../../lib/dates';
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  aggregateTbaHoldings,
  buildPriceIndex,
  explorerAddressUrl,
  fetchAllTbaInventories,
  resolveTbaAddress,
  tbaRegistry,
} from '../../lib/tba';
import { fetchWalletBrokers } from '../../lib/coattail';
import {
  earningStartTs,
  earnedUsdForNft,
  earnedUsdForTokenPosition,
  fetchMachineMeta,
  fetchNftImage,
  normalizeNftImageUrl,
  fetchNftTransferLog,
  fetchIndexedNftHolds,
  fetchOwnedNftIdsV2,
  enumerateOwnedIds,
  fetchTokenHoldStartTs,
  fetchTxNftCost,
  formatDate,
  machineAnnualForWeight,
  mapLimited,
  walletDailyDrops,
  bucketDropSeries,
  portfolioCashMarkSeries,
  nftEntryCostUsd,
  paybackMonths,
  formatPaybackMonths,
  activationTokenCostUsd,
  ethUsdAtTs,
  floorUsdOn,
} from '../../lib/portfolioHistory';

const FORECAST_YEARS = [1, 3, 5, 10];
const GRAINS = [
  { id: 'd', label: 'D', title: 'Daily' },
  { id: 'w', label: 'W', title: 'Weekly' },
  { id: 'm', label: 'M', title: 'Monthly' },
  { id: 'a', label: 'A', title: 'Annual' },
];
const PIE_COLORS = PAIR_COLORS;

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

function GrainBar({ value, onChange }) {
  return (
    <div className="flex bg-[#0e1013] rounded-lg p-0.5 border border-[#1e2228]">
      {GRAINS.map((g) => (
        <button
          key={g.id}
          type="button"
          title={g.title}
          onClick={() => onChange(g.id)}
          className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${
            value === g.id ? 'bg-[#1e2228] text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

const projectName = (key, ticker) => portfolioProjectLabel(key, ticker);

const formatAmount = (val) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: val >= 1 ? 2 : 4 }).format(val || 0);

/** Header art is Savi's own NFTs, not project marks. Never use these as thumbs. */
const HEADER_NFT_ART = new Set(['Stonkbroker.png', 'Intern.svg', 'logo.png', 'Yardkeepers.png', 'wall.png']);

function officialLogoSrc(asset) {
  const meta = PROJECTS.find((p) => p.key === asset.projectKey);
  const file = meta?.logo || asset.logo;
  if (!file || HEADER_NFT_ART.has(file)) return '';
  return `/${file}`;
}

function pickOwnedNft(nfts, tokenId) {
  if (!nfts?.length) return null;
  if (tokenId != null) {
    return nfts.find((n) => String(n.tokenId) === String(tokenId)) || nfts[0];
  }
  return nfts[Math.floor(Math.random() * nfts.length)];
}

async function resolveThumb(asset, existing) {
  if (existing?.src) return existing;
  const pick = pickOwnedNft(asset.nfts, existing?.tokenId);
  let src = normalizeNftImageUrl(pick?.imageUrl || '');
  if (!src && pick?.nftCa && pick?.tokenId != null) {
    try {
      src = await fetchNftImage(pick.nftCa, pick.tokenId) || '';
    } catch {
      src = '';
    }
  }
  if (!src) src = officialLogoSrc(asset);
  return { src, tokenId: pick?.tokenId ?? existing?.tokenId };
}

function chartCanvas(ref) {
  const inst = ref?.current;
  return inst?.canvas || (inst instanceof HTMLCanvasElement ? inst : null);
}

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
    prev.basisUsd = (prev.basisUsd || 0) + (a.basisUsd || 0);
    prev.activationCostUsd = (prev.activationCostUsd || 0) + (a.activationCostUsd || 0);
    prev.entryFloorUsd = (prev.entryFloorUsd || 0) + (a.entryFloorUsd || 0);
    prev.entryCostUsd = (prev.entryCostUsd || 0) + (a.entryCostUsd || 0);
    prev.basisKnown = (prev.basisKnown || 0) + (a.basisKnown || 0);
    prev.idsPartial = prev.idsPartial || a.idsPartial;
    prev.idsFound = (prev.idsFound || 0) + (a.idsFound || 0);
    prev.nfts.push(...(a.nfts || []));
    if (!prev.wallets.includes(a.wallet)) prev.wallets.push(a.wallet);
  }
  return [...map.values()];
}

/** Cost at entry: ETH paid for the NFT when we know it, otherwise the floor that day, plus activation tokens. */
function assetEntryCostUsd(asset) {
  if (asset?.tokenPosition) return Number(asset.floorValue) || 0;
  if (Number(asset.entryCostUsd) > 0) return Number(asset.entryCostUsd);
  return (Number(asset.entryFloorUsd) || 0) + (Number(asset.activationCostUsd) || 0) + (Number(asset.basisUsd) || 0);
}

function Copyable({ id, className = '', children }) {
  const ref = useRef(null);
  return (
    <div ref={ref} id={id} className={`relative scroll-mt-36 ${className}`}>
      <CopyControl
        overlay
        tight
        idleLabel="Copy"
        title="Copy this piece for X"
        onCopy={() => copyElement(ref.current, { filename: `savi-portfolio-${id}.png`, maxW: 1080 })}
      />
      {children}
    </div>
  );
}

function portfolioCsvRows(grouped) {
  const rows = [[
    'project', 'token_id', 'tier', 'wallet', 'opened',
    'entry_cost_usd', 'floor_today_usd', 'earned_usd', 'annual_yield_usd', 'payback_months',
  ]];
  for (const asset of grouped || []) {
    if (asset.tokenPosition) {
      rows.push([
        asset.project,
        '',
        'token',
        asset.wallet || '',
        asset.holdStartTs ? formatDate(asset.holdStartTs) : '',
        '',
        Number(asset.floorValue || 0).toFixed(2),
        Number(asset.earnedValue || 0).toFixed(2),
        Number(asset.yieldValue || 0).toFixed(2),
        '',
      ]);
      continue;
    }
    for (const nft of asset.nfts || []) {
      const entry = nftEntryCostUsd(nft);
      const months = paybackMonths(entry, nft.yieldValue);
      rows.push([
        asset.project,
        nft.tokenId,
        nft.tierName || nft.tierId || '',
        nft.wallet || '',
        formatDate(nft.lastTransferTs || nft.activationTs),
        entry.toFixed(2),
        Number(nft.floorValue || 0).toFixed(2),
        Number(nft.earnedValue || 0).toFixed(2),
        Number(nft.yieldValue || 0).toFixed(2),
        months == null ? '' : months.toFixed(1),
      ]);
    }
  }
  return rows;
}

function roiAgainst(numer, denom) {
  if (!(denom > 0)) return null;
  return (Number(numer) / denom) * 100;
}

function sumNftCosts(nfts) {
  let basisUsd = 0;
  let activationCostUsd = 0;
  let basisKnown = 0;
  let entryFloorUsd = 0;
  let entryCostUsd = 0;
  for (const nft of nfts || []) {
    const act = Number(nft.activationCostUsd) || 0;
    const floorThen = Number(nft.entryFloorUsd) || 0;
    const paid = nft.basisKnown && Number(nft.basisUsd) > 0 ? Number(nft.basisUsd) : floorThen;
    if (nft.basisKnown) {
      basisUsd += Number(nft.basisUsd) || 0;
      basisKnown += 1;
    }
    activationCostUsd += act;
    entryFloorUsd += floorThen;
    entryCostUsd += paid + act;
  }
  return { basisUsd, activationCostUsd, basisKnown, entryFloorUsd, entryCostUsd };
}

async function applyPurchaseCosts(nfts, data, fallbackEthUsd) {
  const pending = (nfts || []).filter((n) => n.lastTransferHash && !n.basisKnown);
  if (!pending.length) return;
  const hashes = [...new Set(pending.map((n) => n.lastTransferHash))];
  const costByKey = {};
  await mapLimited(hashes, 4, async (hash) => {
    const cas = [...new Set(pending.filter((n) => n.lastTransferHash === hash).map((n) => n.nftCa))];
    for (const ca of cas) {
      costByKey[`${hash}:${ca}`] = await fetchTxNftCost(hash, ca);
    }
  });
  const ownedPerKey = {};
  for (const nft of pending) {
    const key = `${nft.lastTransferHash}:${nft.nftCa}`;
    ownedPerKey[key] = (ownedPerKey[key] || 0) + 1;
  }
  for (const nft of pending) {
    const key = `${nft.lastTransferHash}:${nft.nftCa}`;
    const cost = costByKey[key] || { eth: 0, nftCount: 0, perNftEth: 0 };
    const split = cost.nftCount > 0 ? cost.nftCount : (ownedPerKey[key] || 1);
    const perNftEth = split > 0 ? (cost.eth || 0) / split : 0;
    const pData = data?.projects?.[nft.projectKey];
    const ethPx = ethUsdAtTs(pData, nft.lastTransferTs, fallbackEthUsd);
    nft.purchaseEth = perNftEth;
    nft.basisUsd = perNftEth * ethPx;
    nft.basisKnown = true;
  }
}

export default function PortfolioView({ data }) {
  const [searchParams] = useSearchParams();
  const urlWallets = searchParams.get('w') || '';
  const autoScan = useRef(false);
  const [inputVal, setInputVal] = useState(urlWallets);
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
  const [forecastGrain, setForecastGrain] = useState('d');
  const [historyGrain, setHistoryGrain] = useState('d');
  const [copyState, setCopyState] = useState('idle');
  const [scanProgress, setScanProgress] = useState('');
  const [thumbs, setThumbs] = useState({});
  const pickedThumb = useRef({});
  const barRef = useRef(null);

  const priceIndex = buildPriceIndex(data);
  const [ccy] = useDisplayCurrency();
  const display = readDisplay();
  const ethUsd = data?.projects?.stonk?.market?.ethPriceUsd || display.ethUsd || 0;
  const rates = { ethUsd, eurPerUsd: display.eurPerUsd };
  const formatCurrency = (usd) => formatMoney(usd, ccy, rates);
  const tickMoney = moneyTick(ccy, rates);

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
    setThumbs({});
    pickedThumb.current = {};

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
      for (const target of navNftScanTargets(data)) {
        for (const wallet of wallets) nftJobs.push({ ...target, wallet });
      }

      const nftChunks = await mapLimited(nftJobs, 1, async ({ pKey, pData, wallet }) => {
          const nftContract = new ethers.Contract(pData.config.nftCa, erc721Abi, provider);
          const floorUsd = (pData.market?.nftFloorEth || 0) * (pData.market?.ethPriceUsd || 0);
          const displayName = projectName(pKey, pData.config.ticker);
          const isMachine = pData.config?.kind === 'machines';
          const isBroker = pData.config?.kind === 'brokers';
          try {
            const bal = Number(await nftContract.balanceOf(wallet));
            if (!(bal > 0)) return null;
            setScanProgress(`Reading ${displayName} (${bal} NFTs)…`);
            let ownedTokenIds = new Set();
            let inbound = new Map();
            let idsPartial = false;
            let indexed = null;
            try {
              indexed = await fetchIndexedNftHolds(pData.config.nftCa, wallet);
            } catch {
              indexed = null;
            }
            if (indexed && indexed.ownedIds.size === bal) {
              ownedTokenIds = indexed.ownedIds;
              inbound = indexed.inbound;
            } else {
              try {
                const log = await fetchNftTransferLog(pData.config.nftCa, wallet);
                inbound = log.inbound;
                ownedTokenIds = log.ownedIds;
              } catch {
                /* explorer rate-limit — try other ID sources */
              }
              if (indexed) {
                for (const [id, row] of indexed.inbound) {
                  ownedTokenIds.add(id);
                  const prev = inbound.get(id);
                  if (!prev?.ts && row.ts) inbound.set(id, { ...(prev || {}), ...row, hash: prev?.hash || '' });
                }
              }
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

            let brokerById = new Map();
            if (isBroker) {
              const list = await fetchWalletBrokers(wallet);
              for (const b of list) brokerById.set(Number(b.id), b);
            }

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
              const broker = brokerById.get(Number(tokenId));
              const earning = isBroker ? !!broker?.active : isMachine ? !!machine?.inked : !!tokenData;
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
              const actTs = Number(tokenData?.ts) || 0;
              const act = earning
                ? activationTokenCostUsd(pData, {
                    tierId,
                    ts: actTs || lastIn?.ts,
                    tokenAmount: isMachine ? machine?.ink : undefined,
                    data,
                  })
                : { usd: 0, tokens: 0, tokenPriceUsd: 0 };
              nfts.push({
                id: `${pKey}-${wallet}-${tokenId}`,
                projectKey: pKey,
                nftCa: pData.config.nftCa,
                tokenId,
                ticker: pData.config.ticker,
                tierId,
                tierName: isMachine
                  ? (earning
                    ? `Awake · ${Number(machine?.multiplier || machine?.weight / 100 || 1).toFixed(1)}×`
                    : 'Dormant')
                  : isBroker
                    ? (earning ? 'Active Broker' : 'Inactive (shell)')
                  : earning
                    ? (tierObj?.name || tierId)
                    : 'Inactive',
                yieldValue,
                earnedValue,
                floorValue: floorUsd,
                tba: broker?.wallet || null,
                wallet,
                lastTransferTs: lastIn?.ts || 0,
                lastTransferHash: lastIn?.hash || null,
                minted: !!lastIn?.mint,
                activationTs: actTs,
                isActive: earning,
                alwaysOn: false,
                machineWeight: machine?.weight || 0,
                machineInk: machine?.ink || 0,
                imageUrl: machine?.imageUrl || null,
                purchaseEth: 0,
                basisUsd: 0,
                basisKnown: false,
                entryFloorUsd: floorUsdOn(pData, lastIn?.ts || actTs),
                activationCostUsd: act.usd,
                actTokens: act.tokens,
                actTokenPriceUsd: act.tokenPriceUsd,
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
                ...sumNftCosts(nfts),
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

      const allNfts = ownedAssets.flatMap((a) => a.nfts || []);
      if (allNfts.some((n) => n.lastTransferHash)) {
        setScanProgress('Reading purchase and mint costs…');
        await applyPurchaseCosts(allNfts, data, ethUsd);
        for (const asset of ownedAssets) {
          Object.assign(asset, sumNftCosts(asset.nfts));
        }
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

  useEffect(() => {
    if (autoScan.current || !data || !urlWallets.trim()) return;
    autoScan.current = true;
    handleScan();
  }, [data, urlWallets]);

  const enrichProject = async (projectKey) => {
    if (enriched[projectKey]) return;
    setEnriched((e) => ({ ...e, [projectKey]: 'loading' }));
    const nfts = results.ownedAssets.flatMap((a) => (a.projectKey === projectKey ? a.nfts || [] : []));
    if (!nfts.length) {
      setEnriched((e) => ({ ...e, [projectKey]: 'done' }));
      return;
    }
    await applyPurchaseCosts(nfts, data, ethUsd);
    await mapLimited(nfts, 6, async (nft) => {
      nft.imageUrl = await fetchNftImage(nft.nftCa, nft.tokenId);
    });
    setResults((r) => ({
      ...r,
      ownedAssets: r.ownedAssets.map((a) => (
        a.projectKey === projectKey ? { ...a, ...sumNftCosts(a.nfts) } : a
      )),
    }));
    try {
      const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
      const cfg = data?.projects?.[projectKey]?.config || {};
      const registry = tbaRegistry(provider, {
        tbaRegistry: cfg.tbaRegistry,
      });
      await mapLimited(nfts, 8, async (nft) => {
        if (nft.tba) return;
        try {
          nft.tba = await resolveTbaAddress(registry, nft.nftCa, nft.tokenId, {
            tbaImplementation: cfg.tbaImplementation,
            tbaChainId: cfg.tbaChainId,
            tbaSalt: cfg.tbaSalt,
          });
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
  const costTotals = useMemo(() => {
    let basisUsd = 0;
    let activationCostUsd = 0;
    let entryCostUsd = 0;
    let basisKnown = 0;
    let nftCount = 0;
    for (const g of grouped) {
      if (g.tokenPosition) continue;
      basisUsd += Number(g.basisUsd) || 0;
      activationCostUsd += Number(g.activationCostUsd) || 0;
      entryCostUsd += assetEntryCostUsd(g);
      basisKnown += Number(g.basisKnown) || 0;
      nftCount += (g.nfts || []).length;
    }
    return { basisUsd, activationCostUsd, entryCostUsd, basisKnown, nftCount, total: entryCostUsd };
  }, [grouped]);

  useEffect(() => {
    if (!grouped.length) return;
    let cancelled = false;
    grouped.forEach(async (asset) => {
      const prev = pickedThumb.current[asset.projectKey];
      if (prev?.src) return;
      if (!prev && (asset.nfts || []).length) {
        const pick = pickOwnedNft(asset.nfts);
        pickedThumb.current[asset.projectKey] = { tokenId: pick?.tokenId };
      } else if (!prev) {
        pickedThumb.current[asset.projectKey] = { tokenId: null };
      }
      const thumb = await resolveThumb(asset, pickedThumb.current[asset.projectKey]);
      pickedThumb.current[asset.projectKey] = thumb;
      if (!cancelled) {
        setThumbs((cur) => ({ ...cur, [asset.projectKey]: thumb }));
      }
    });
    return () => { cancelled = true; };
  }, [grouped]);
  const hasHoldings = results.ownedAssets.length > 0;
  const forecastUsd = results.yieldUsd * forecastYears;
  const cashLabel = mode === 'history' ? 'Earned in your ownership' : `Forecasted ${forecastYears}y cash-flow`;
  const cashValue = mode === 'history' ? results.earnedUsd : forecastUsd;
  const realizedDenom = grouped.reduce((sum, g) => sum + assetEntryCostUsd(g), 0);
  const roiPct = mode === 'history'
    ? roiAgainst(results.earnedUsd, realizedDenom)
    : roiAgainst(forecastUsd, results.floorUsd);
  const formatRoi = (pct, digits = 2) => (pct == null ? '—' : `${pct.toFixed(digits)}%`);
  const runRate = {
    d: results.yieldUsd / 365,
    w: results.yieldUsd / 52,
    m: results.yieldUsd / 12,
    a: results.yieldUsd,
  };
  const dropSeries = useMemo(
    () => walletDailyDrops(results.ownedAssets, data),
    [results.ownedAssets, data],
  );
  const historyChart = useMemo(
    () => bucketDropSeries(dropSeries.labels, dropSeries.data, historyGrain),
    [dropSeries, historyGrain],
  );
  const cashMark = useMemo(
    () => portfolioCashMarkSeries(results.ownedAssets, data),
    [results.ownedAssets, data],
  );

  const copyLabel =
    copyState === 'busy' ? 'Copying…' :
    copyState === 'copied' ? 'Copied — paste into X' :
    copyState === 'saved' ? 'PNG saved' :
    copyState === 'fail' ? 'Copy failed' :
    'Copy';

  const copyOk = copyState === 'copied' || copyState === 'saved';

  const handleCopySnapshot = async () => {
    if (copyState === 'busy') return;
    setCopyState('busy');
    try {
      const pieGroups = grouped.filter((g) => g.floorValue > 0);
      const resolved = {};
      await Promise.all(grouped.map(async (asset) => {
        const thumb = await resolveThumb(asset, thumbs[asset.projectKey] || pickedThumb.current[asset.projectKey]);
        pickedThumb.current[asset.projectKey] = thumb;
        resolved[asset.projectKey] = thumb;
      }));
      setThumbs((cur) => ({ ...cur, ...resolved }));
      const copied = await copyPortfolioSnapshot({
        mode,
        floor: formatCurrency(results.floorUsd),
        basis: costTotals.nftCount > 0 ? formatCurrency(costTotals.total) : '',
        basisDetail: mode === 'history'
          ? 'Cash credited after each seat opened and activated'
          : `${forecastYears}y at the current run rate. Not compounded.`,
        cashLabel,
        cash: results.hasErrors ? 'ERROR' : formatCurrency(cashValue),
        roi: results.hasErrors ? 'ERROR' : formatRoi(roiPct),
        units: `${results.totalUnits} Units`,
        pie: pieGroups.map((g, i) => ({
          label: projectName(g.projectKey, g.ticker),
          value: g.floorValue,
          color: PIE_COLORS[i % PIE_COLORS.length],
        })),
        barCanvas: chartCanvas(barRef),
        bars: mode === 'forecast'
          ? {
            title: 'Forecasted cash-flow',
            headline: `${formatCurrency(runRate[forecastGrain] || 0)} / ${GRAINS.find((g) => g.id === forecastGrain)?.title.toLowerCase()}`,
            headlineColor: '#00a804',
            note: 'Current wallet yield as a run-rate. Not compounded.',
          }
          : {
            title: 'Daily drops',
            labels: historyGrain === 'd' ? formatLabels(historyChart.labels) : historyChart.labels,
            values: historyChart.data,
            colors: historyChart.data.map(() => STREAM_COLORS.holdersRev),
          },
        assets: grouped.map((asset) => {
          const thumb = resolved[asset.projectKey] || {};
          const entryCost = assetEntryCostUsd(asset);
          const assetRoi = mode === 'history'
            ? roiAgainst(asset.earnedValue, entryCost)
            : roiAgainst((asset.yieldValue || 0) * forecastYears, asset.floorValue);
          return {
            name: `${asset.project} (${asset.tokenPosition ? formatAmount(asset.balance) : `${asset.balance} owned`})`,
            detail: mode === 'history'
              ? `Floor today ${formatCurrency(asset.floorValue)} · Entry ${entryCost > 0 ? formatCurrency(entryCost) : '—'} · Since entry ${formatRoi(assetRoi, 1)}`
              : `Floor today ${formatCurrency(asset.floorValue)} · ${forecastYears}y ${formatRoi(assetRoi, 1)}`,
            value: mode === 'history'
              ? formatCurrency(asset.earnedValue || 0)
              : `+ ${formatCurrency((asset.yieldValue || 0) * forecastYears)}`,
            thumb: thumb.src || officialLogoSrc(asset),
            mark: asset.ticker,
          };
        }),
      });
      setCopyState(copied ? 'copied' : 'saved');
    } catch (err) {
      console.error('portfolio copy failed', err);
      setCopyState('fail');
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl mt-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Portfolio tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Comma-separated wallets. Forecast uses current yield. History counts drops after you
            received the NFT (and after activation). Basis is the inbound mint or purchase ETH;
            activation tokens are priced from the daily close nearest that date.
          </p>
        </div>
      </div>

      <div data-share-omit className="flex flex-col sm:flex-row gap-3 mb-6">
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
        {scanComplete && hasHoldings && (
          <button
            type="button"
            data-share-omit
            onClick={handleCopySnapshot}
            disabled={copyState === 'busy'}
            title="Copy a 4:5 portfolio card for X (no addresses)"
            className={`sm:min-w-[11.5rem] inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-extrabold shadow-md transition disabled:opacity-60 ${
              copyOk
                ? 'bg-emerald-950 text-emerald-300 ring-2 ring-emerald-500/70'
                : copyState === 'fail'
                  ? 'bg-rose-950 text-rose-300 ring-2 ring-rose-500/60'
                  : 'bg-white text-[#08090b] hover:bg-emerald-200'
            }`}
          >
            {copyOk ? (
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                <path d="M16 6l-4-4-4 4" />
                <path d="M12 2v14" />
              </svg>
            )}
            {copyLabel}
          </button>
        )}
      </div>

      {!isScanning && !scanComplete && (
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Paste a wallet to load holdings. Or open{' '}
          <Link to="/ecosystem" className="text-slate-200 underline underline-offset-2 hover:text-white">
            Ecosystem
          </Link>
          {' / '}
          <Link to="/" className="text-slate-200 underline underline-offset-2 hover:text-white">
            a project
          </Link>{' '}
          to browse live stats first.
        </p>
      )}

      {isScanning && (
        <p className="text-xs text-slate-300 text-center mb-6">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-2 align-middle" />
          {scanProgress || 'Scanning owned Token IDs, last transfers, and activations…'}
          <span className="block text-slate-500 mt-1">Large wallets are read one collection at a time so the explorer does not drop the request.</span>
        </p>
      )}

      {scanComplete && (
        <div>
          <p className="text-sm text-slate-400 mb-5 leading-relaxed">
            This view stays public.{' '}
            <a
              href={SAVI_X}
              target="_blank"
              rel="noreferrer"
              className="text-slate-200 underline underline-offset-2 hover:text-white"
            >
              Follow @SaviCrypto
            </a>{' '}
            for new projects and daily changes.
          </p>
          <NfaNote
            className="mb-5"
            extra="The 1Y / 3Y / 5Y / 10Y figures multiply the current trailing run-rate. They are not a prediction that yield stays constant."
          />
          {hasHoldings && (
            <div data-share-omit className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-extrabold text-white">Share this wallet on X</p>
                <p className="text-[11px] text-emerald-200/80 mt-0.5">
                  Copies a one-page card for X. Each chart below has its own Copy. Addresses stay off the image.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySnapshot}
                disabled={copyState === 'busy'}
                className={`shrink-0 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-extrabold shadow-lg shadow-emerald-500/20 transition disabled:opacity-60 ${
                  copyOk
                    ? 'bg-emerald-500 text-black'
                    : copyState === 'fail'
                      ? 'bg-rose-500 text-white'
                      : 'bg-emerald-400 text-black hover:bg-emerald-300'
                }`}
              >
                {copyOk ? (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                    <path d="M16 6l-4-4-4 4" />
                    <path d="M12 2v14" />
                  </svg>
                )}
                {copyLabel}
              </button>
            </div>
          )}
          {!hasHoldings ? (
            <p className="text-sm text-slate-400">No ecosystem NFTs found in the provided wallet(s).</p>
          ) : (
            <>
          <nav aria-label="In this scan" className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-faint">In this scan</span>
            {[
              { id: 'totals', label: 'Totals' },
              { id: 'portfolio-forecast', label: 'Forecast' },
              { id: 'portfolio-holdings', label: 'Holdings' },
            ].map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => document.getElementById(row.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-ink"
              >
                {row.label}
              </button>
            ))}
          </nav>
          <div id="portfolio-forecast" className="scroll-mt-36 flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
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

          <Copyable id="totals" className="mb-8">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Floor Value</p>
              <p className="text-xl md:text-2xl font-extrabold text-white">{formatCurrency(results.floorUsd)}</p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Cost at entry</p>
              <p className="text-xl md:text-2xl font-extrabold text-white">
                {costTotals.nftCount === 0
                  ? '—'
                  : formatCurrency(costTotals.total)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {costTotals.nftCount === 0
                  ? 'No seats in this scan'
                  : 'Floor the day the seat opened, or the ETH paid, plus activation tokens'}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">{cashLabel}</p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-emerald-400'}`}>
                {results.hasErrors ? 'ERROR' : formatCurrency(cashValue)}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">
                {mode === 'history' ? 'Cash on entry cost' : 'Combined Portfolio ROI'}
              </p>
              <p className={`text-xl md:text-2xl font-extrabold ${results.hasErrors ? 'text-rose-400' : 'text-blue-400'}`}>
                {results.hasErrors ? 'ERROR' : formatRoi(roiPct)}
              </p>
            </div>
            <div className="bg-[#08090b] border border-[#1e2228] rounded-xl p-3 sm:p-5 shadow-inner">
              <p className="text-[10px] md:text-xs uppercase tracking-wider text-slate-400 mb-1">Total Active Units</p>
              <p className="text-xl md:text-2xl font-extrabold text-purple-400">{results.totalUnits} Units</p>
            </div>
          </div>
          </Copyable>

          {grouped.some((g) => g.floorValue > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Copyable id="floor" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                <h3 className="text-sm font-bold text-white mb-4 pr-8">Floor allocation</h3>
                <SliceChart
                  noun="Floor"
                  format={formatCurrency}
                  slices={grouped.filter((g) => g.floorValue > 0).map((g, i) => ({
                    label: projectName(g.projectKey, g.ticker),
                    value: g.floorValue,
                    color: PIE_COLORS[i % PIE_COLORS.length],
                  }))}
                />
              </Copyable>
              {mode === 'forecast' ? (
                <Copyable id="forecast" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                  <div className="flex items-center justify-between gap-2 mb-2 pr-8">
                    <h3 className="text-sm font-bold text-white">Forecasted cash-flow</h3>
                    <div data-share-omit><GrainBar value={forecastGrain} onChange={setForecastGrain} /></div>
                  </div>
                  <p className="text-2xl font-extrabold text-emerald-400 mb-1">
                    {formatCurrency(runRate[forecastGrain] || 0)}
                    <span className="ml-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      / {GRAINS.find((g) => g.id === forecastGrain)?.title.toLowerCase()}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">Current wallet yield as a run-rate. Not compounded.</p>
                </Copyable>
              ) : (
                <Copyable id="drops" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6">
                  <div className="flex items-center justify-between gap-2 mb-2 pr-8">
                    <h3 className="text-sm font-bold text-white">Daily drops</h3>
                    <div data-share-omit><GrainBar value={historyGrain} onChange={setHistoryGrain} /></div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Yield credited after you received and activated each NFT. {GRAINS.find((g) => g.id === historyGrain)?.title} buckets.
                  </p>
                  <div className="relative h-44 w-full">
                    {historyChart.labels.length ? (
                      <Bar
                        ref={barRef}
                        data={{
                          labels: historyGrain === 'd' ? formatLabels(historyChart.labels) : historyChart.labels,
                          datasets: [{
                            label: 'Drops',
                            data: historyChart.data,
                            backgroundColor: STREAM_COLORS.holdersRev,
                            borderRadius: 3,
                            maxBarThickness: 22,
                          }],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#1e2228' } },
                            y: { ticks: { color: '#94a3b8', callback: tickMoney }, grid: { color: '#1e2228' }, beginAtZero: true, unit: ccy },
                          },
                        }}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-4">
                        No dated drops in this wallet yet
                      </div>
                    )}
                  </div>
                </Copyable>
              )}
            </div>
          )}

          {cashMark.labels.length > 1 && (
            <Copyable id="cash-mark" className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 md:p-6 mb-8">
              <h3 className="text-sm font-bold text-white mb-1 pr-8">Cash vs mark</h3>
              <p className="text-xs text-slate-500 mb-3">
                Cash is what these seats were paid after they opened. Mark is the replacement cost that day, floor plus activation tokens, minus what the seat cost to open.
              </p>
              <div className="relative h-52 w-full">
                <Line
                  data={{
                    labels: formatLabels(cashMark.labels),
                    datasets: [
                      {
                        label: 'Cumulative cash',
                        data: cashMark.cash,
                        borderColor: '#00a804',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 0,
                        spanGaps: true,
                      },
                      {
                        label: 'Mark change',
                        data: cashMark.mark,
                        borderColor: '#94a3b8',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 0,
                        spanGaps: true,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10 } } },
                    scales: {
                      x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: '#1e2228' } },
                      y: { ticks: { color: '#94a3b8', callback: tickMoney }, grid: { color: '#1e2228' }, unit: ccy },
                    },
                  }}
                />
              </div>
            </Copyable>
          )}

          <div id="portfolio-holdings" className="scroll-mt-36 mb-4 flex items-center justify-between gap-3 border-b border-[#1e2228] pb-2">
            <h3 className="text-sm font-bold text-white">Owned Asset Breakdown</h3>
            {grouped.length > 0 && (
              <CsvButton filename="savi-portfolio.csv" rows={portfolioCsvRows(grouped)} />
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {grouped.length === 0 ? (
              <p className="text-xs text-slate-400 lg:col-span-2">No ecosystem NFTs found in the provided wallet(s).</p>
            ) : (
              grouped.map((asset) => {
                const open = !!openProjects[asset.projectKey];
                const entryCost = assetEntryCostUsd(asset);
                const assetRoi = mode === 'history'
                  ? roiAgainst(asset.earnedValue, entryCost)
                  : roiAgainst((asset.yieldValue || 0) * forecastYears, asset.floorValue);
                const payback = asset.tokenPosition ? null : paybackMonths(entryCost, asset.yieldValue);
                return (
                <Copyable key={asset.projectKey} id={`holding-${asset.projectKey}`} className="bg-[#08090b] border border-[#1e2228] rounded-xl p-4 shadow-inner">
                  <button
                    type="button"
                    onClick={() => toggleProject(asset.projectKey)}
                    className="w-full flex items-center justify-between gap-3 pr-8 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {thumbs[asset.projectKey]?.src || officialLogoSrc(asset) ? (
                        <img
                          src={thumbs[asset.projectKey]?.src || officialLogoSrc(asset)}
                          className="w-10 h-10 rounded-lg object-cover border border-[#1e2228] bg-[#0e1013]"
                          alt={thumbs[asset.projectKey]?.tokenId != null ? `#${thumbs[asset.projectKey].tokenId}` : asset.ticker}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-[#1e2228] bg-[#0e1013] flex items-center justify-center text-[10px] font-extrabold text-slate-400">
                          {(asset.ticker || '?').slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white">
                          {asset.project} ({asset.tokenPosition ? formatAmount(asset.balance) : `${asset.balance} owned`})
                        </h4>
                        <p data-share-omit className="text-[10px] text-slate-400 font-mono">
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
                        Floor today {formatCurrency(asset.floorValue)}
                        {mode === 'history' && !asset.tokenPosition && entryCost > 0
                          ? ` · Entry ${formatCurrency(entryCost)}`
                          : ''}
                        {' · '}{mode === 'history' ? 'Since entry' : 'ROI'} {formatRoi(assetRoi, 1)}
                        {payback != null ? ` · Payback ${formatPaybackMonths(payback)}` : ''}
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
                            <th className="py-2 px-2 font-medium">Basis</th>
                            <th className="py-2 px-2 font-medium">Activated / ink</th>
                            <th className="py-2 pl-2 font-medium text-right">{mode === 'history' ? 'Earned' : 'Forecast'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e2228]/80">
                          {asset.nfts.map((nft) => {
                            const open = expandedNft === nft.id;
                            const inv = nft.tba ? inventories[nft.tba] : null;
                            const basisUsd = Number(nft.basisUsd) || 0;
                            const actUsd = Number(nft.activationCostUsd) || 0;
                            const actTokens = Number(nft.actTokens) || Number(nft.machineInk) || 0;
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
                                      {nft.minted ? 'Mint' : 'Bought'}
                                      {nft.basisKnown
                                        ? basisUsd > 0
                                          ? ` ${formatCurrency(basisUsd)}`
                                          : nft.minted
                                            ? ' · free'
                                            : ' · —'
                                        : ' …'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-300 whitespace-nowrap">
                                    {nft.machineInk > 0 || nft.machineWeight > 0 ? (
                                      <>
                                        <div>{nft.isActive ? 'Inked' : 'Dormant'}</div>
                                        <div className="text-slate-500">
                                          {actUsd > 0 ? `~${formatCurrency(actUsd)}` : ''}
                                          {nft.machineInk ? ` · ${nft.machineInk.toLocaleString()} ink` : ''}
                                          {nft.machineWeight ? ` · wt ${nft.machineWeight}` : ''}
                                        </div>
                                      </>
                                    ) : nft.isActive ? (
                                      <>
                                        <div>{formatDate(nft.activationTs)}</div>
                                        <div className="text-slate-500">
                                          {actUsd > 0
                                            ? `~${formatCurrency(actUsd)}`
                                            : '—'}
                                          {actTokens > 0
                                            ? ` · ${formatAmount(actTokens)} ${nft.ticker || ''}`.trim()
                                            : ''}
                                        </div>
                                      </>
                                    ) : (
                                      'Not active'
                                    )}
                                  </td>
                                  <td className="py-2 pl-2 text-right text-xs font-bold text-emerald-400 whitespace-nowrap">
                                    <div>
                                      {mode === 'history'
                                        ? formatCurrency(nft.earnedValue || 0)
                                        : formatCurrency((nft.yieldValue || 0) * forecastYears)}
                                    </div>
                                    <div className="text-[10px] font-medium text-slate-400">
                                      Payback {formatPaybackMonths(paybackMonths(nftEntryCostUsd(nft), nft.yieldValue))}
                                    </div>
                                  </td>
                                </tr>
                                {open && (
                                  <tr>
                                    <td colSpan="4" className="pb-3 pt-1">
                                      {enriched[asset.projectKey] === 'loading' && !nft.tba ? (
                                        <p className="text-xs text-slate-500 animate-pulse">Resolving tokenbound wallet...</p>
                                      ) : nft.tba ? (
                                        <p data-share-omit className="text-[10px] text-slate-500 font-mono mb-2">
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
                </Copyable>
                );
              })
            )}
          </div>

          {allNfts.length > 0 && (
            <Copyable id="tokenbound" className="mt-6 bg-[#08090b] border border-[#1e2228] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setAggregateOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 pr-12 text-left hover:bg-[#1e2228]/30 transition"
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
            </Copyable>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
