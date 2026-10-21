// Uniswap v3 amounts for a Smart LP position.
//
// The hold gap is the current liquidity valued two ways at today's prices:
// the token mix at today's pool price, and the mix that same liquidity would
// have been at the pool price from the start of the window. It is the price
// move on the position that is in the vault now. It is not a replay of
// deposits, and it does not include the protocol skim (that stays on the fee
// line as the amount depositors did not keep).

const MAX_TICK = 887272;
const Q96 = 1n << 96n;

const RATIO_0 = 0xfffcb933bd6fad37aa2d162d1a594001n;
const RATIO_1 = 0x100000000000000000000000000000000n;
const MULTIPLIERS = [
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];

function getSqrtRatioAtTick(tick) {
  const t = Number(tick);
  if (!Number.isInteger(t) || t < -MAX_TICK || t > MAX_TICK) return null;
  const absTick = t < 0 ? -t : t;
  let ratio = (absTick & 0x1) !== 0 ? RATIO_0 : RATIO_1;
  for (let i = 0; i < MULTIPLIERS.length; i++) {
    if ((absTick & (1 << (i + 1))) !== 0) {
      ratio = (ratio * MULTIPLIERS[i]) >> 128n;
    }
  }
  if (t > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function getAmount0(sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) return getAmount0(sqrtB, sqrtA, liquidity);
  return ((liquidity << 96n) * (sqrtB - sqrtA)) / sqrtB / sqrtA;
}

function getAmount1(sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) return getAmount1(sqrtB, sqrtA, liquidity);
  return (liquidity * (sqrtB - sqrtA)) / Q96;
}

function amountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, liquidity) {
  const sqrtP = BigInt(sqrtPriceX96);
  const L = BigInt(liquidity);
  if (sqrtP <= 0n || L <= 0n) return null;
  let sqrtA = getSqrtRatioAtTick(tickLower);
  let sqrtB = getSqrtRatioAtTick(tickUpper);
  if (sqrtA == null || sqrtB == null) return null;
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  if (sqrtP <= sqrtA) return { amount0: getAmount0(sqrtA, sqrtB, L), amount1: 0n };
  if (sqrtP < sqrtB) {
    return {
      amount0: getAmount0(sqrtP, sqrtB, L),
      amount1: getAmount1(sqrtA, sqrtP, L),
    };
  }
  return { amount0: 0n, amount1: getAmount1(sqrtA, sqrtB, L) };
}

function rawToUsd(raw, decimals, px) {
  if (raw == null || !(px > 0)) return 0;
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  const n = Number(whole) + Number(frac) / Number(base);
  return Number.isFinite(n) ? n * px : 0;
}

module.exports = {
  MAX_TICK,
  getSqrtRatioAtTick,
  amountsForLiquidity,
  rawToUsd,
};

if (require.main === module) {
  const sqrt0 = getSqrtRatioAtTick(0);
  if (sqrt0 !== Q96) {
    console.error("FAIL tick 0 sqrt", sqrt0);
    process.exit(1);
  }
  const L = 10n ** 18n;
  const same = amountsForLiquidity(sqrt0, -MAX_TICK, MAX_TICK, L);
  const again = amountsForLiquidity(sqrt0, -MAX_TICK, MAX_TICK, L);
  if (same.amount0 !== again.amount0 || same.amount1 !== again.amount1) {
    console.error("FAIL unchanged amounts");
    process.exit(1);
  }
  const tick2x = 6932;
  const sqrt2 = getSqrtRatioAtTick(tick2x);
  const then = amountsForLiquidity(sqrt0, -MAX_TICK, MAX_TICK, L);
  const now = amountsForLiquidity(sqrt2, -MAX_TICK, MAX_TICK, L);
  const ratio = Number(sqrt2) / Number(Q96);
  const price = ratio * ratio;
  // price is raw token1 per raw token0, so token1 converts into token0 by dividing.
  const value = (amt) => Number(amt.amount0) / 1e18 + Number(amt.amount1) / 1e18 / price;
  const il = value(now) / value(then) - 1;
  if (!(il < -0.04 && il > -0.08)) {
    console.error("FAIL 2x full-range IL", il);
    process.exit(1);
  }
  console.log(`ok    full-range 2x hold gap ${(il * 100).toFixed(2)}%`);
}
