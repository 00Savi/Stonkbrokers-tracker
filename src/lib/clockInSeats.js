// Clock In 3.0 stores round weight as the activation tier weight times 100.
// A live roster of 1,461 Floor Traders at 100 plus the higher tiers summed to
// the same 21,221,700 the engine recorded on the latest round.

export const ENGINE_WEIGHT_SCALE = 100;

/** ETH and USD one seat of this tier was credited across the finished rounds. */
export function seatPay({ ethPerEngineWeight, weight, ethPriceUsd }) {
  const unit = Number(ethPerEngineWeight) || 0;
  const w = Number(weight) || 0;
  const px = Number(ethPriceUsd) || 0;
  const eth = unit * w * ENGINE_WEIGHT_SCALE;
  return { eth, usd: eth * px };
}
