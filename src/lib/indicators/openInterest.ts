import type { OIDataPoint, OISummary, Candle } from "@/types";

export function summarizeOi(
  oiData: OIDataPoint[],
  candles: Candle[],
): OISummary | null {
  if (oiData.length < 2) return null;

  const current = oiData[oiData.length - 1];
  const prev = oiData[oiData.length - 2];
  const rising = current.openInterest > prev.openInterest;

  let change24h = 0;
  let changePercent = 0;
  if (oiData.length >= 24) {
    const old = oiData[0];
    change24h = current.openInterest - old.openInterest;
    changePercent = old.openInterest > 0
      ? (change24h / old.openInterest) * 100
      : 0;
  } else {
    const first = oiData[0];
    change24h = current.openInterest - first.openInterest;
    changePercent = first.openInterest > 0
      ? (change24h / first.openInterest) * 100
      : 0;
  }

  let trend: OISummary["trend"] = "neutral";
  if (candles.length >= 5 && oiData.length >= 5) {
    const priceRising = candles[candles.length - 1].close > candles[candles.length - 5].close;
    const oiRising5 = current.openInterest > oiData[oiData.length - 5].openInterest;
    if (priceRising && oiRising5) trend = "bullish";
    else if (!priceRising && oiRising5) trend = "bearish";
    else if (priceRising && !oiRising5) trend = "neutral";
  }

  const lookback = Math.min(10, oiData.length - 1);
  const oiSlope = lookback > 0
    ? (current.openInterest - oiData[oiData.length - 1 - lookback].openInterest) / lookback
    : 0;
  const priceSlope = candles.length > lookback
    ? (candles[candles.length - 1].close - candles[candles.length - 1 - lookback].close) / lookback
    : 0;
  const diverging = (oiSlope > 0 && priceSlope < 0) || (oiSlope < 0 && priceSlope > 0);

  return {
    current,
    trend,
    change24h,
    changePercent,
    rising,
    diverging,
  };
}
