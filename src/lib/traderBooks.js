/**
 * Clutch + Mancer “Books” Social Capital Markets.
 *
 * Live board and close-fee estimates come from api.mancer.xyz. Accrued close
 * fees (after settlement) are the protocol take: 2% of vault NAV, split 50/50
 * Mancer / StonkBrokers (protocolWei). Until a book settles, value.closeFee*
 * is an estimate only.
 */

export const BOOKS_API = 'https://api.mancer.xyz';
export const BOOKS_APP = 'https://mancer.xyz/books';
export const BOOKS_FACTORY = '0xa727e7af47a965afd0341afcef7bc3f86be876b0';
/** 2% close fee · 50% to Mancer · 50% to StonkBrokers (protocol). */
export const BOOKS_CLOSE_FEE_BPS = 200;
export const BOOKS_MANCER_SHARE_BPS = 5000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function weiToEth(wei) {
  const n = typeof wei === 'bigint' ? Number(wei) : num(wei);
  if (!(n > 0)) return 0;
  return n / 1e18;
}

/** Quote USD from Books quote.usd8 (1e8) or eth spot × wei when WETH. */
export function quoteUsd(quote, wei, ethUsdFallback = 0) {
  const amount = weiToEth(wei);
  if (!(amount > 0)) return 0;
  const usd8 = num(quote?.usd8);
  if (usd8 > 0) return amount * (usd8 / 1e8);
  if (quote?.isWeth && ethUsdFallback > 0) return amount * ethUsdFallback;
  return 0;
}

export function bookHref(token) {
  if (!token) return BOOKS_APP;
  return `${BOOKS_APP}/${String(token).toLowerCase()}`;
}

export async function fetchBooksJson(path, { signal } = {}) {
  const res = await fetch(`${BOOKS_API}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`books ${path} ${res.status}`);
  return res.json();
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
    name: book.displayName || book.name || book.symbol || 'Book',
    symbol: book.symbol || '—',
    phase: book.phase || '—',
    quoteSymbol: quote.symbol || (quote.isWeth ? 'WETH' : '—'),
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

function ethUsdFromStatsOrBooks(stats, books) {
  for (const b of books || []) {
    const q = b?.quote;
    if (q?.isWeth && num(q.usd8) > 0) return num(q.usd8) / 1e8;
  }
  return 0;
}

/**
 * Snapshot the live board + fee totals from list + stats endpoints.
 * Detail close-fee estimates need per-book fetches (optional).
 */
export function summarizeBooksList(listPayload, statsPayload, { details = [] } = {}) {
  const books = listPayload?.books || [];
  const byToken = new Map(details.map((d) => [String(d?.token || d?.book?.token || '').toLowerCase(), d?.book || d]));
  const merged = books.map((b) => {
    const detail = byToken.get(String(b.token || '').toLowerCase());
    return detail ? { ...b, ...detail, token: b.token } : b;
  });
  const ethUsd = ethUsdFromStatsOrBooks(statsPayload, merged);
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
      // Kept for callers that want a single “shown” number: accrued if any, else estimate.
      mancerUsd: mancerAccrued > 0 ? mancerAccrued : mancerEstimatedUsd,
      protocolUsd: protocolAccrued > 0 ? protocolAccrued : protocolEstimatedUsd,
      estimated: !(mancerAccrued > 0 || protocolAccrued > 0),
      nftMarketUsd: quoteUsd({ isWeth: true }, nft.feesWei, ethUsd),
      nftMancerUsd: quoteUsd({ isWeth: true }, nft.mancerWei, ethUsd),
      nftProtocolUsd: quoteUsd({ isWeth: true }, nft.protocolWei, ethUsd),
    },
    board: board.sort((a, b) => {
      const phaseRank = { trading: 0, graduated: 1, raising: 2, waiting: 3, frozen: 4, settled: 5, aborted: 6 };
      const pa = phaseRank[a.phase] ?? 9;
      const pb = phaseRank[b.phase] ?? 9;
      if (pa !== pb) return pa - pb;
      return (b.raisedUsd || 0) - (a.raisedUsd || 0);
    }),
  };
}

/** Live fetch used by the Mancer Books tab. */
export async function loadTraderBooks({ signal, withDetails = true } = {}) {
  const [list, stats] = await Promise.all([
    fetchBooksJson('/v1/books?limit=40', { signal }),
    fetchBooksJson('/v1/books/stats', { signal }),
  ]);
  let details = [];
  if (withDetails) {
    const need = (list.books || []).filter((b) => ['trading', 'graduated', 'settled'].includes(b.phase));
    details = await Promise.all(
      need.slice(0, 12).map(async (b) => {
        try {
          return await fetchBooksJson(`/v1/books/${b.token}`, { signal });
        } catch {
          return null;
        }
      }),
    );
    details = details.filter(Boolean);
  }
  return summarizeBooksList(list, stats, { details });
}

export function formatBooksPhase(phase) {
  const p = String(phase || '');
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '—';
}

export function formatProgress(bps) {
  if (bps == null || !Number.isFinite(Number(bps))) return '—';
  return `${(Number(bps) / 100).toFixed(0)}%`;
}

export function formatDuration(secs) {
  const s = Number(secs);
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}
