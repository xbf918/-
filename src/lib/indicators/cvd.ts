import type { Candle } from "@/types";

export interface CVDPoint {
  time: number;
  cvd: number;
  delta: number;
  volume: number;
}

export interface CVDSummary {
  current: CVDPoint;
  trend: "bullish" | "bearish" | "neutral";
  diverging: boolean;
  cvdRising: boolean;
}

export function cvd(candles: Candle[]): CVDPoint[] {
  const result: CVDPoint[] = [];
  let cumulative = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    let delta: number;

    if (range === 0) {
      delta = 0;
    } else {
      const closePosition = (c.close - c.low) / range;
      const strength = (closePosition - 0.5) * 2;
      delta = c.volume * strength;
    }

    cumulative += delta;
    result.push({
      time: c.time,
      cvd: cumulative,
      delta,
      volume: c.volume,
    });
  }

  return result;
}

export function summarizeCvd(points: CVDPoint[], candles: Candle[]): CVDSummary | null {
  if (points.length < 10) return null;
  const current = points[points.length - 1];
  const prev = points[points.length - 2];
  const cvdRising = current.cvd > prev.cvd;

  const lookback = Math.min(20, Math.floor(points.length / 3));
  const cvdSlope = (current.cvd - points[points.length - lookback].cvd) / lookback;
  const priceSlope = (candles[candles.length - 1].close - candles[candles.length - lookback].close) / lookback;

  const diverging = (cvdSlope > 0 && priceSlope < 0) || (cvdSlope < 0 && priceSlope > 0);

  let trend: CVDSummary["trend"] = "neutral";
  if (cvdSlope > 0) trend = "bullish";
  else if (cvdSlope < 0) trend = "bearish";

  return { current, trend, diverging, cvdRising };
}
