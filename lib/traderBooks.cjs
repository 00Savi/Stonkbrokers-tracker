/**
 * Hourly snapshot of Mancer Books (Clutch contracts, Mancer API).
 * Same shape the UI expects on `projects.mancer.books`.
 */

const BOOKS_API = "https://api.mancer.xyz";
const BOOKS_FACTORY = "0xa727e7af47a965afd0341afcef7bc3f86be876b0";
const BOOKS_CLOSE_FEE_BPS = 200;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function weiToEth(wei) {
  const n = num(wei);
  return n > 0 ? n / 1e18 : 0;
}

function quoteUsd(quote, wei, ethUsdFallback = 0) {
  const amount = weiToEth(wei);
  if (!(amount > 0)) return 0;
  const usd8 = num(quote?.usd8);
  if (usd8 > 0) return amount * (usd8 / 1e8);
  if (quote?.isWeth && ethUsdFallback > 0) return amount * ethUsdFallback;
  return 0;
}

function bookHref(token) {
  return token ? `https://mancer.xyz/books/${String(token).toLowerCase()}` : "https://mancer.xyz/books";
}

function boardRow(book, ethUsd) {
  const quote = book?.quote || {};
  const raise = book?.raise || {};
  const value = book?.value || {};
  const settlement = book?.settlement?.estimate || {};
  const closeMancerWei = value.closeFeeMancerWei || settlement.closeFeeMancerWei || 0;
  const closeProtocolWei = value.closeFeeProtocolWei || settlement.closeFeeProtocolWei || 0;
  const raisedWei = raise.raisedEthWei || raise.raisedQuote || book.bookValueWei || 0;
  return {
    token: book.token,
    bookId: book.bookId,
    name: book.displayName || book.name || book.symbol || "Book",
    symbol: book.symbol || "—",
    phase: book.phase || "—",
    quoteSymbol: quote.symbol || (quote.isWeth ? "WETH" : "—"),
    creator: book.creator,
    creatorVerified: !!book.creatorVerified,
    progressBps: raise.progressBps != null ? num(raise.progressBps) : null,
    mcapUsd: raise.mcapUsd8 != null ? num(raise.mcapUsd8) / 1e8 : null,
    gradMcapUsd: raise.gradMcapUsd8 != null ? num(raise.gradMcapUsd8) / 1e8 : null,
    raisedUsd: quoteUsd(quote, raisedWei, ethUsd),
    timeLeftSecs: book.timeLeftSecs != null ? num(book.timeLeftSecs) : null,
    returnBps: value.returnBps != null ? num(value.returnBps) : null,
    closeFeeMancerUsd: quoteUsd(quote, closeMancerWei, ethUsd),
    closeFeeProtocolUsd: quoteUsd(quote, closeProtocolWei, ethUsd),
    href: bookHref(book.token),
  };
}

function summarize(listPayload, statsPayload, details = []) {
  const books = listPayload?.books || [];
  const byToken = new Map(
    details.map((d) => [String(d?.token || d?.book?.token || "").toLowerCase(), d?.book || d]),
  );
  const merged = books.map((b) => {
    const detail = byToken.get(String(b.token || "").toLowerCase());
    return detail ? { ...b, ...detail, token: b.token } : b;
  });
  let ethUsd = 0;
  for (const b of merged) {
    const q = b?.quote;
    if (q?.isWeth && num(q.usd8) > 0) {
      ethUsd = num(q.usd8) / 1e8;
      break;
    }
  }
  const board = merged.map((b) => boardRow(b, ethUsd));
  const close = statsPayload?.total?.closeFee || {};
  const nft = statsPayload?.total?.nftMarket || {};
  const raise = statsPayload?.total?.raise || {};
  const byPhase = statsPayload?.total?.books?.byPhase || listPayload?.counts || {};

  let mancerEstimatedUsd = 0;
  let protocolEstimatedUsd = 0;
  for (const row of board) {
    mancerEstimatedUsd += row.closeFeeMancerUsd || 0;
    protocolEstimatedUsd += row.closeFeeProtocolUsd || 0;
  }

  const mancerAccrued = quoteUsd({ isWeth: true }, close.mancerWei, ethUsd);
  const protocolAccrued = quoteUsd({ isWeth: true }, close.protocolWei, ethUsd);

  board.sort((a, b) => {
    const phaseRank = { trading: 0, graduated: 1, raising: 2, waiting: 3, frozen: 4, settled: 5, aborted: 6 };
    const pa = phaseRank[a.phase] ?? 9;
    const pb = phaseRank[b.phase] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.raisedUsd || 0) - (a.raisedUsd || 0);
  });

  return {
    fetchedAt: new Date().toISOString(),
    factory: BOOKS_FACTORY,
    head: listPayload?.head || statsPayload?.head || null,
    indexedBlock: listPayload?.indexedBlock || statsPayload?.indexedBlock || null,
    counts: {
      total: num(statsPayload?.total?.books?.total) || board.length,
      byPhase: { ...byPhase },
    },
    raise: {
      raisedEthWei: raise.raisedEthWei || null,
      raisedUsd: ethUsd > 0 ? weiToEth(raise.raisedEthWei) * ethUsd : 0,
      buys: num(raise.buys),
      sells: num(raise.sells),
    },
    fees: {
      closeBps: num(close.bps) || BOOKS_CLOSE_FEE_BPS,
      ethUsd,
      mancerAccruedUsd: mancerAccrued,
      protocolAccruedUsd: protocolAccrued,
      mancerClaimedUsd: quoteUsd({ isWeth: true }, close.claimedWei?.mancer, ethUsd),
      protocolClaimedUsd: quoteUsd({ isWeth: true }, close.claimedWei?.protocol, ethUsd),
      mancerEstimatedUsd,
      protocolEstimatedUsd,
      mancerUsd: mancerAccrued > 0 ? mancerAccrued : mancerEstimatedUsd,
      protocolUsd: protocolAccrued > 0 ? protocolAccrued : protocolEstimatedUsd,
      estimated: !(mancerAccrued > 0 || protocolAccrued > 0),
      nftMarketUsd: quoteUsd({ isWeth: true }, nft.feesWei, ethUsd),
      nftMancerUsd: quoteUsd({ isWeth: true }, nft.mancerWei, ethUsd),
      nftProtocolUsd: quoteUsd({ isWeth: true }, nft.protocolWei, ethUsd),
    },
    board,
  };
}

async function getJson(path) {
  const res = await fetch(`${BOOKS_API}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`books ${path} ${res.status}`);
  return res.json();
}

/**
 * Pull list + stats (+ detail for open trading books) into the mancer.books blob.
 */
async function fetchTraderBooks() {
  const [list, stats] = await Promise.all([
    getJson("/v1/books?limit=40"),
    getJson("/v1/books/stats"),
  ]);
  const need = (list.books || []).filter((b) => ["trading", "graduated", "settled"].includes(b.phase));
  const details = [];
  for (const b of need.slice(0, 12)) {
    try {
      details.push(await getJson(`/v1/books/${b.token}`));
    } catch {
      /* skip */
    }
  }
  return summarize(list, stats, details);
}

/**
 * Credit StonkBrokers Partner Revenue Share with Books protocol close fees.
 * Accrued (settled) only — estimates stay on the Books sidecar, not in booster history.
 */
function applyBooksShareToStonk(stonk, books) {
  const rev = stonk?.revenue;
  if (!rev || !books?.fees) return 0;
  const accrued = num(books.fees.protocolAccruedUsd);
  if (!(accrued > 0)) return 0;
  const dayLabels = rev.dailyDates || [];
  if (!dayLabels.length) return 0;
  if (!Array.isArray(rev.dailyBooster) || rev.dailyBooster.length !== dayLabels.length) {
    rev.dailyBooster = dayLabels.map((_, i) => num(rev.dailyBooster?.[i]));
  }
  const today = dayLabels[dayLabels.length - 1];
  const i = dayLabels.length - 1;
  // Replace prior books credit for today rather than stacking every hourly run.
  const prevBooks = num(rev.dailyBooksProtocol?.[i]);
  rev.dailyBooster[i] = Math.max(0, num(rev.dailyBooster[i]) - prevBooks) + accrued;
  if (!Array.isArray(rev.dailyBooksProtocol) || rev.dailyBooksProtocol.length !== dayLabels.length) {
    rev.dailyBooksProtocol = dayLabels.map(() => 0);
  }
  rev.dailyBooksProtocol[i] = accrued;
  rev.boosterUsd = rev.dailyBooster.reduce((s, v) => s + num(v), 0);
  rev.booksProtocolUsd = accrued;
  rev.booksProtocolDay = today;
  return accrued;
}

/**
 * Attach Mancer dailyBooks from accrued close + NFT market fees (mancer share).
 */
function applyBooksRevenueToMancer(mancer, books) {
  const rev = mancer?.revenue;
  if (!rev || !books?.fees) return 0;
  const accrued = num(books.fees.mancerAccruedUsd) + num(books.fees.nftMancerUsd);
  const dayLabels = rev.dailyDates || [];
  if (!dayLabels.length) return 0;
  if (!Array.isArray(rev.dailyBooks) || rev.dailyBooks.length !== dayLabels.length) {
    rev.dailyBooks = dayLabels.map((_, i) => num(rev.dailyBooks?.[i]));
  }
  const i = dayLabels.length - 1;
  rev.dailyBooks[i] = accrued;
  rev.booksUsd = accrued;
  return accrued;
}

module.exports = {
  BOOKS_API,
  BOOKS_FACTORY,
  BOOKS_CLOSE_FEE_BPS,
  fetchTraderBooks,
  applyBooksShareToStonk,
  applyBooksRevenueToMancer,
};
