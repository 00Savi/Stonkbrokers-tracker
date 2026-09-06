// Index, RH Machines, Oakmont, and Coattail are not Anvil NFT-yield projects.
// They share the dashboard's CoC shape (cost vs cash-flow) but must not run
// through activation-log replay or oracle-wallet yield. This module builds
// their data.json rows from DexScreener, DefiLlama, and supply reads.

const { fetchOakmontVault, fetchGeckoHolders } = require("./oakmontApi.cjs");
const { fetchCoattailStats, fetchGeckoPriceUsd } = require("./coattailApi.cjs");

async function llamaFees(slug, dataType) {
  const url = dataType
    ? `https://api.llama.fi/summary/fees/${slug}?dataType=${dataType}`
    : `https://api.llama.fi/summary/fees/${slug}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`llama ${slug} ${dataType || "fees"} -> ${res.status}`);
  return res.json();
}

function chartFromLlama(payload, days = 14) {
  const rows = Array.isArray(payload?.totalDataChart) ? payload.totalDataChart : [];
  const sliced = rows.slice(-days);
  return {
    labels: sliced.map(([ts]) => {
      const d = new Date(Number(ts) * 1000);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }),
    values: sliced.map(([, v]) => Number(v) || 0),
  };
}

function snapshotPush(prev, row) {
  const list = Array.isArray(prev) ? [...prev] : [];
  const today = row.date;
  if (list.length && list[list.length - 1].date === today) list[list.length - 1] = row;
  else list.push(row);
  if (list.length > 90) list.shift();
  return list;
}

async function holdersOrNull(gg, address, opts) {
  if (!address) return null;
  try {
    return await gg.holders(address, opts);
  } catch (e) {
    console.warn(`[warn] holders ${address}: ${e.message}`);
    return null;
  }
}

async function supplyBurn(gg, tokenCa, maxSupply) {
  const stats = await gg.supplies([tokenCa]);
  const s = stats.get(tokenCa.toLowerCase());
  if (!s || s.supply === null || !(Number(s.supply) > 0n)) {
    throw new Error(`supply read failed for ${tokenCa}`);
  }
  const scale = 10 ** (s.decimals ?? 18);
  const currentSupply = Number(s.supply) / scale;
  const dead = s.dead === null || s.zero === null ? 0 : (Number(s.dead) + Number(s.zero)) / scale;
  const native = Math.max(0, maxSupply - currentSupply);
  const totalBurnTokens = native + dead;
  return { currentSupply, totalBurnTokens, deadBalance: dead };
}

function dexLiquidity(pairs, tokenCa) {
  const addr = tokenCa.toLowerCase();
  let usd = 0;
  const pools = [];
  for (const p of pairs || []) {
    const b = p.baseToken?.address?.toLowerCase();
    const q = p.quoteToken?.address?.toLowerCase();
    if (b !== addr && q !== addr) continue;
    const liq = p.liquidity?.usd || 0;
    usd += liq;
    pools.push({
      pairName: `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
      dex: p.dexId || "dex",
      liquidityUsd: liq,
      volume24h: p.volume?.h24 || 0,
    });
  }
  pools.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
  return { totalLpUsd: usd, pools: pools.slice(0, 12) };
}

/**
 * @param {object} args
 * @param {string} args.key
 * @param {object} args.conf
 * @param {object} args.market
 * @param {object} args.prev
 * @param {object} args.gg
 * @param {object[]} args.dexPairs
 */
async function buildSpecialProject({ key, conf, market, prev, gg, dexPairs }) {
  const todayStr = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  let burn;
  try {
    burn = await supplyBurn(gg, conf.tokenCa, conf.maxSupply);
  } catch (e) {
    console.warn(`[warn] ${key} supply via gg-index: ${e.message}`);
    const prevCirc = prev?.ownership?.circulatingSupply;
    const prevBurn = prev?.ownership?.permanentlyBurntTokens;
    if (prevCirc > 0) {
      burn = { currentSupply: prevCirc, totalBurnTokens: prevBurn || 0, deadBalance: 0 };
    } else {
      burn = { currentSupply: conf.maxSupply, totalBurnTokens: 0, deadBalance: 0 };
    }
  }
  let tokenHolders = await holdersOrNull(gg, conf.tokenCa);
  let nftHolders = conf.nftCa ? await holdersOrNull(gg, conf.nftCa) : null;

  let cashflow = {
    source: conf.llamaSlug ? "defillama" : null,
    fees24h: 0, fees7d: 0, fees30d: 0, feesAllTime: 0, feesAnnualized: 0,
    revenue24h: 0, revenue7d: 0, revenue30d: 0, revenueAllTime: 0, revenueAnnualized: 0,
    holders24h: 0, holders7d: 0, holders30d: 0, holdersAnnualized: 0,
    dailyDates: [], dailyFees: [], dailyRevenue: [],
  };

  if (conf.llamaSlug) {
    try {
      const [fees, revenue, holders] = await Promise.all([
        llamaFees(conf.llamaSlug),
        llamaFees(conf.llamaSlug, "dailyRevenue"),
        llamaFees(conf.llamaSlug, "dailyHoldersRevenue").catch(() => null),
      ]);
      cashflow = {
        ...cashflow,
        source: "defillama",
        fees24h: fees.total24h || 0,
        fees7d: fees.total7d || 0,
        fees30d: fees.total30d || 0,
        feesAllTime: fees.totalAllTime || 0,
        feesAnnualized: fees.annualized1y || (fees.total30d || 0) * 12,
        revenue24h: revenue.total24h || 0,
        revenue7d: revenue.total7d || 0,
        revenue30d: revenue.total30d || 0,
        revenueAllTime: revenue.totalAllTime || 0,
        revenueAnnualized: revenue.annualized1y || (revenue.total30d || 0) * 12,
        holders24h: holders?.total24h || revenue.total24h || 0,
        holders7d: holders?.total7d || revenue.total7d || 0,
        holders30d: holders?.total30d || revenue.total30d || 0,
        holdersAnnualized: holders?.annualized1y || revenue.annualized1y || (revenue.total30d || 0) * 12,
        dailyDates: chartFromLlama(fees, 14).labels,
        dailyFees: chartFromLlama(fees, 14).values,
        dailyRevenue: chartFromLlama(holders || revenue, 14).values,
      };
    } catch (e) {
      console.warn(`[warn] ${key} llama: ${e.message}`);
    }
  }

  const fdv = (burn.currentSupply || 0) * (market.tokenPriceUsd || 0);
  let annualYield = 0;
  let eligible = null;
  let activeCount = 0;
  let totalSupplyUnits = conf.nftCa ? conf.collectionSupply || 0 : burn.currentSupply;
  let oakmontVault = null;
  let coattail = null;

  if (key === "index") {
    annualYield = cashflow.holdersAnnualized || 0;
    if (conf.eligibleMin) {
      try {
        eligible = await gg.holders(conf.tokenCa, {
          minBalance: (10n ** 18n * BigInt(conf.eligibleMin)).toString(),
        });
      } catch (e) {
        console.warn(`[warn] ${key} eligible holders: ${e.message}`);
      }
    }
    activeCount = eligible || 0;
    totalSupplyUnits = tokenHolders || 0;
  }

  if (key === "printer") {
    const vol24 = (dexPairs || [])
      .filter((p) => {
        const a = conf.tokenCa.toLowerCase();
        return p.baseToken?.address?.toLowerCase() === a || p.quoteToken?.address?.toLowerCase() === a;
      })
      .reduce((s, p) => s + (p.volume?.h24 || 0), 0);
    // Documented 5% sell tax, ~80% of that to the stock pot. Volume is two-sided,
    // so half of it is treated as sells.
    const dailyPot = vol24 * 0.5 * 0.05 * 0.8;
    annualYield = dailyPot * 365;
    cashflow = {
      ...cashflow,
      source: cashflow.source || "volume-tax",
      fees24h: vol24 * 0.5 * 0.05,
      fees7d: vol24 * 0.5 * 0.05 * 7,
      revenue24h: dailyPot,
      revenue7d: dailyPot * 7,
      revenueAnnualized: annualYield,
      holdersAnnualized: annualYield,
    };
    activeCount = conf.earningFleet || 7458;
    totalSupplyUnits = conf.collectionSupply || 10000;
    const ink = conf.unitValue || 4250;
    const ops = conf.opsFee || 1.15;
    market.nftFloorEth = +((ink * market.tokenPriceUsd * 1.1) / (market.ethPriceUsd || 1)).toFixed(3);
    conf._inkUsd = ink * ops * (market.tokenPriceUsd || 0);
  }

  if (key === "coattail") {
    if (!(market.tokenPriceUsd > 0) || market.tokenPriceUsd === 0.03) {
      const px = await fetchGeckoPriceUsd(conf.tokenCa);
      if (px > 0) market.tokenPriceUsd = px;
    }
    const [geckoCoat, geckoNft] = await Promise.all([
      fetchGeckoHolders(conf.tokenCa),
      fetchGeckoHolders(conf.nftCa),
    ]);
    if (geckoCoat) tokenHolders = geckoCoat;
    if (geckoNft) nftHolders = geckoNft;
    try {
      coattail = await fetchCoattailStats();
      activeCount = coattail.activeNow;
      totalSupplyUnits = conf.collectionSupply || 1776;
      annualYield = coattail.annualizedPurchases;
      cashflow = {
        ...cashflow,
        source: "coattail-api",
        fees24h: coattail.fees24h,
        fees7d: coattail.fees7d,
        feesAllTime: coattail.usdSpent,
        feesAnnualized: coattail.annualizedPurchases,
        revenue24h: coattail.fees24h,
        revenue7d: coattail.fees7d,
        revenueAllTime: coattail.usdSpent,
        revenueAnnualized: coattail.annualizedPurchases,
        holders24h: coattail.fees24h,
        holders7d: coattail.fees7d,
        holdersAnnualized: coattail.annualizedPurchases,
        dailyDates: coattail.dailyDates,
        dailyFees: coattail.dailyPurchases,
        dailyRevenue: coattail.dailyPurchases,
      };
      market.basketValueUsd = coattail.basketValue;
      market.basketSpentUsd = coattail.usdSpent;
      market.basketPnlPct = coattail.pnlPct;
      market.coatSymbols = coattail.symbols;
      if (coattail.activationBurnCoat > 0 && burn.totalBurnTokens < coattail.activationBurnCoat) {
        burn.totalBurnTokens = coattail.activationBurnCoat;
        burn.currentSupply = Math.max(0, conf.maxSupply - coattail.activationBurnCoat);
      }
    } catch (e) {
      console.warn(`[warn] coattail api: ${e.message}`);
      activeCount = prev?.activation?.activeCount || 0;
      totalSupplyUnits = conf.collectionSupply || 1776;
    }
  }

  if (key === "oakmont") {
    const reservePairs = (dexPairs || []).filter((p) => {
      const a = (conf.reserveCa || "").toLowerCase();
      return p.baseToken?.address?.toLowerCase() === a || p.quoteToken?.address?.toLowerCase() === a;
    });
    let reserveUsd = 0;
    const best = reservePairs.sort((a, b) => {
      const ta = (a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 0);
      const tb = (b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 0);
      return tb - ta;
    })[0];
    if (best) {
      reserveUsd = parseFloat(best.priceUsd || 0);
      if (best.quoteToken?.address?.toLowerCase() === conf.reserveCa.toLowerCase()) {
        const n = parseFloat(best.priceNative || 0);
        if (n > 0) reserveUsd = reserveUsd / n;
      }
    }
    market.reservePriceUsd = reserveUsd;
    market.wrapRatio = market.tokenPriceUsd > 0 ? reserveUsd / market.tokenPriceUsd : 0;
    market.strikeFdvUsd = fdv;
    market.reserveFdvUsd = 0;
    try {
      const rs = await gg.supplies([conf.reserveCa]);
      const r = rs.get(conf.reserveCa.toLowerCase());
      if (r?.supply) {
        const scale = 10 ** (r.decimals ?? 18);
        market.reserveSupply = Number(r.supply) / scale;
        market.reserveFdvUsd = market.reserveSupply * reserveUsd;
      }
    } catch (e) {
      console.warn(`[warn] oakmont reserve supply: ${e.message}`);
    }
    // Coverage: reserve market vs strike FDV. True vault NAV lands when the
    // vault contract is readable; until then this is the liquid claim vs FDV.
    market.navCoverage = fdv > 0 ? (market.reserveFdvUsd || 0) / fdv : 0;
    const strikeSupply = burn.currentSupply || 0;
    market.wrappedPct = strikeSupply > 0 ? (market.reserveSupply || 0) / strikeSupply : 0;
    market.poolVolume24h = 0;
    annualYield = 0;
    activeCount = Math.round(market.reserveSupply || 0);
    totalSupplyUnits = strikeSupply;
    const [ggReserve, geckoStrike, geckoReserve] = await Promise.all([
      holdersOrNull(gg, conf.reserveCa),
      fetchGeckoHolders(conf.tokenCa),
      fetchGeckoHolders(conf.reserveCa),
    ]);
    market.reserveHolders = geckoReserve || ggReserve || 0;
    market.strikeHolders = geckoStrike || tokenHolders || 0;
    try {
      oakmontVault = await fetchOakmontVault();
      market.protocolExchangeRate = oakmontVault.exchangeRate;
      market.vaultNavUsdg = oakmontVault.vaultNavUsdg;
      market.reservePriceUsdg = oakmontVault.reservePriceUsdg;
      market.claimApyPct = oakmontVault.claimApyPct;
      market.wraps24h = oakmontVault.wraps24h;
      market.unwraps24h = oakmontVault.unwraps24h;
      market.navToFdv = fdv > 0 ? oakmontVault.vaultNavUsdg / fdv : 0;
      if (oakmontVault.soakSupply > 0) {
        market.reserveSupply = oakmontVault.soakSupply;
        market.reserveFdvUsd = market.reserveSupply * reserveUsd;
        market.navCoverage = fdv > 0 ? market.reserveFdvUsd / fdv : 0;
        market.wrappedPct = strikeSupply > 0 ? market.reserveSupply / strikeSupply : 0;
        activeCount = Math.round(market.reserveSupply);
      }
      const ethPx = market.ethPriceUsd || 0;
      const feeUsdAnnual = oakmontVault.feeDays > 0
        ? (oakmontVault.ethFeesAll / oakmontVault.feeDays) * 365 * ethPx
        : 0;
      annualYield = feeUsdAnnual;
      cashflow = {
        ...cashflow,
        source: "oakmont-api",
        feesAnnualized: feeUsdAnnual,
        revenueAnnualized: feeUsdAnnual,
        holdersAnnualized: feeUsdAnnual,
        feesAllTime: oakmontVault.ethFeesAll * ethPx,
        dailyDates: oakmontVault.revenue.map((r) => String(r.date).slice(5)),
        dailyFees: oakmontVault.revenue.map((r) => r.eth * ethPx),
        dailyRevenue: oakmontVault.revenue.map((r) => r.eth * ethPx),
      };
    } catch (e) {
      console.warn(`[warn] oakmont vault api: ${e.message}`);
    }
  }

  const circulating = burn.currentSupply || 1;
  const perTokenAnnual = circulating > 0 ? annualYield / circulating : 0;
  const costOne = market.tokenPriceUsd || 0;
  let roiPct = costOne > 0 ? (perTokenAnnual / costOne) * 100 : 0;

  const tiers = [];
  if (key === "index") {
    const min = conf.eligibleMin || 10000;
    const minCost = min * costOne;
    const minAnnual = perTokenAnnual * min;
    tiers.push({
      tier: "T0",
      name: `Eligible (≥ ${min.toLocaleString()} INDEX)`,
      reqTokens: min,
      weight: 100,
      trackedAnnualYieldUsd: minAnnual,
      dailyDates: cashflow.dailyDates,
      dailyYields: cashflow.dailyRevenue,
    });
  } else if (key === "printer") {
    const floorUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
    const inkUsd = conf._inkUsd || 0;
    const earning = activeCount || conf.earningFleet || 7458;
    const perMachine = earning > 0 ? annualYield / earning : 0;
    tiers.push({
      tier: "T0",
      name: "Awake Machine (1×)",
      reqTokens: conf.unitValue || 4250,
      weight: 100,
      trackedAnnualYieldUsd: perMachine,
      dailyDates: [],
      dailyYields: [],
      floorEth: market.nftFloorEth,
      entryUsd: floorUsd + inkUsd,
    });
    tiers.push({
      tier: "T1",
      name: "1.5× weight (fuse / extra ink)",
      reqTokens: conf.unitValue || 4250,
      weight: 150,
      trackedAnnualYieldUsd: perMachine * 1.5,
      dailyDates: [],
      dailyYields: [],
      floorEth: market.nftFloorEth,
      entryUsd: floorUsd + inkUsd,
    });
  } else if (key === "coattail") {
    const floorUsd = (market.nftFloorEth || 0) * (market.ethPriceUsd || 0);
    const coatUsd = (conf.unitValue || 36750) * costOne;
    const earning = activeCount || 1;
    const perBroker = earning > 0 ? annualYield / earning : 0;
    tiers.push({
      tier: "T0",
      name: "Active Broker",
      reqTokens: conf.unitValue || 36750,
      weight: 100,
      trackedAnnualYieldUsd: perBroker,
      dailyDates: cashflow.dailyDates,
      dailyYields: cashflow.dailyRevenue,
      floorEth: market.nftFloorEth,
      entryUsd: floorUsd + coatUsd,
    });
  } else if (key === "oakmont") {
    const feeAnnual = annualYield;
    const strikeSupply = burn.currentSupply || 1;
    const rSupply = market.reserveSupply || 1;
    tiers.push({
      tier: "T0",
      name: "Hold $STRIKE",
      reqTokens: 1,
      weight: 0,
      trackedAnnualYieldUsd: strikeSupply > 0 ? feeAnnual / strikeSupply : 0,
      entryUsd: costOne,
      dailyDates: cashflow.dailyDates,
      dailyYields: cashflow.dailyRevenue,
    });
    tiers.push({
      tier: "T1",
      name: "Hold $RESERVE",
      reqTokens: 1,
      weight: 100,
      trackedAnnualYieldUsd: rSupply > 0 ? feeAnnual / rSupply : 0,
      entryUsd: market.reservePriceUsd || 0,
      claimApyPct: market.claimApyPct,
      dailyDates: cashflow.dailyDates,
      dailyYields: cashflow.dailyRevenue,
    });
  }

  const lp = dexLiquidity(dexPairs, conf.tokenCa);
  if (key === "oakmont" && conf.reserveCa) {
    const extra = dexLiquidity(dexPairs, conf.reserveCa);
    lp.totalLpUsd += extra.totalLpUsd;
    lp.pools = [...lp.pools, ...extra.pools].sort((a, b) => b.liquidityUsd - a.liquidityUsd).slice(0, 12);
    market.poolVolume24h = lp.pools.reduce((s, p) => s + (p.volume24h || 0), 0);
  }

  if ((key === "coattail" || key === "printer") && tiers[0]?.entryUsd > 0) {
    roiPct = ((tiers[0].trackedAnnualYieldUsd || 0) / tiers[0].entryUsd) * 100;
  }

  const dailySnapshots = snapshotPush(prev?.dailySnapshots, {
    date: todayStr,
    timestamp: Date.now(),
    tokenPriceUsd: market.tokenPriceUsd,
    reservePriceUsd: market.reservePriceUsd || 0,
    wrapRatio: market.wrapRatio || 0,
    navCoverage: market.navCoverage || 0,
    claimApyPct: market.claimApyPct || 0,
    vaultNavUsdg: market.vaultNavUsdg || 0,
    totalBurn: Math.max(burn.totalBurnTokens, 1),
    fdv,
    annualYield,
    roi: roiPct,
    tiers: tiers.map((t) => ({
      tier: t.tier,
      roi: roiPct,
      yieldUsd: t.trackedAnnualYieldUsd,
    })),
  });

  const percentActivated =
    totalSupplyUnits > 0 && activeCount > 0 ? +((activeCount / totalSupplyUnits) * 100).toFixed(2) : 0;

  return {
    market,
    cashflow,
    activation: {
      activeCount,
      totalSupply: totalSupplyUnits,
      percentActivated,
      eligibleWallets: eligible,
      eligibleMin: conf.eligibleMin || null,
      dualBurn: {
        totalBurnTokens: Math.round(burn.totalBurnTokens),
        activationBurnTokens: coattail?.activationBurnCoat || 0,
        equivalentBrokersBurnt: coattail?.activationBurnCoat
          ? coattail.activationBurnCoat / (conf.unitValue || 36750)
          : (conf.unitValue > 1 ? burn.totalBurnTokens / conf.unitValue : 0),
      },
      breakdown: { T0: activeCount },
      history: coattail?.history || { labels: [], cumulative: [], dailyActivations: [], dailyDeactivations: [] },
      tierStats: {},
    },
    ownership: {
      tokenHolders: market.strikeHolders || tokenHolders || 0,
      stonkHolders: tokenHolders || 0,
      nftHolders: nftHolders || 0,
      currentMaxSupply: conf.nftCa ? conf.collectionSupply : burn.currentSupply,
      circulatingNftSupply: conf.nftCa ? conf.collectionSupply : burn.currentSupply,
      permanentlyBurntTokens: burn.totalBurnTokens,
      burntNfts: 0,
      ammVaultNfts: 0,
      ownershipRatio: 0,
      circulatingSupply: burn.currentSupply,
      historicalGrowth: prev?.ownership?.historicalGrowth || { labels: [], data: [] },
    },
    tiers,
    revenue: {
      ammFeesUsd: cashflow.holders7d || cashflow.revenue7d || 0,
      securityBoxUsd: 0,
      launchpadUsd: 0,
      dexFeesUsd: cashflow.fees7d || 0,
      dailyAmm: cashflow.dailyRevenue,
      dailyDex: cashflow.dailyFees,
      dailySecurityBox: [],
      dailyLaunchpad: [],
    },
    lockedLp: lp,
    vault: oakmontVault,
    coattail,
    underConstruction: !!conf.underConstruction,
    dailySnapshots,
    config: {
      ticker: conf.ticker,
      unitValue: conf.unitValue,
      logo: conf.logo,
      nftCa: conf.nftCa || null,
      tokenCa: conf.tokenCa,
      reserveCa: conf.reserveCa || null,
      kind: conf.kind,
      eligibleMin: conf.eligibleMin || null,
      site: conf.site || null,
      collectionSupply: conf.collectionSupply || null,
      tbaRegistry: conf.tbaRegistry || null,
      tbaImplementation: conf.tbaImplementation || null,
      boosterCa: conf.boosterCa || null,
    },
  };
}

module.exports = { buildSpecialProject, isSpecial: (conf) => !!conf?.kind && conf.kind !== "nft" };
