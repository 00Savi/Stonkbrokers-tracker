// Clock In 3.0 stores round weight as the activation tier weight times 100.
// A live roster of 1,461 Floor Traders at 100 plus the higher tiers summed to
// the same 21,221,700 the engine recorded on the latest round.

export const ENGINE_WEIGHT_SCALE = 100;

const WINDOW_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

/** ETH and USD one seat of this tier was credited across the finished rounds. */
export function seatPay({ ethPerEngineWeight, weight, ethPriceUsd }) {
  const unit = Number(ethPerEngineWeight) || 0;
  const w = Number(weight) || 0;
  const px = Number(ethPriceUsd) || 0;
  const eth = unit * w * ENGINE_WEIGHT_SCALE;
  return { eth, usd: eth * px };
}

function utcDay(now) {
  const d = now instanceof Date ? now : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** First calendar day included in 7D / 30D / 90D. All-time is an empty key. */
export function clockInWindowStart(timeframe, now = new Date()) {
  const days = WINDOW_DAYS[timeframe] || 0;
  if (!days) return '';
  const day = utcDay(now);
  day.setUTCDate(day.getUTCDate() - (days - 1));
  return day.toISOString().slice(0, 10);
}

/**
 * Rounds inside the chart range, newest first.
 * `unit` is that round's pot divided by engine weight, so a seat's pay for
 * the range is the sum of those units times the tier weight.
 */
export function clockInWindow(book, timeframe = '30d', now = new Date()) {
  const history = Array.isArray(book?.history) && book.history.length
    ? book.history
    : (Array.isArray(book?.recent) ? book.recent : []);
  const start = clockInWindowStart(timeframe, now);
  const rows = (start
    ? history.filter((row) => row?.date && row.date >= start)
    : history.slice()
  ).slice().sort((a, b) => (b.round || 0) - (a.round || 0));
  const potEth = rows.reduce((sum, row) => sum + (Number(row.potEth) || 0), 0);
  const summed = rows.reduce((sum, row) => sum + (Number(row.unit) || 0), 0);
  const anyUnit = rows.some((row) => Number(row.unit) > 0);
  const unit = (anyUnit || start)
    ? summed
    : (Number(book?.ethPerEngineWeight) || 0);
  return { rows, potEth, unit, start };
}
