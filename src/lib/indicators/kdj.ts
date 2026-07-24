import type { Candle } from "@/types";
import { sma } from "./ema";

export interface KDJPoint {
  time: number;
  k: number;
  d: number;
  j: number;
  signal?: "overbought" | "oversold" | "golden_cross" | "death_cross";
}

export interface KDJSummary {
  current: KDJPoint;
  trend: "bullish" | "bearish" | "neutral";
  kRising: boolean;
  zone: "overbought" | "oversold" | "normal";
  lastCross?: { type: "golden" | "death"; point: KDJPoint };
}

export interface KDJParams {
  n: number;
  m1: number;
  m2: number;
  overbought: number;
  oversold: number;
}

export const DEFAULT_KDJ: KDJParams = {
  n: 9,
  m1: 3,
  m2: 3,
  overbought: 80,
  oversold: 20,
};

export function kdj(candles: Candle[], params: KDJParams = DEFAULT_KDJ): KDJPoint[] {
  const { n, m1, m2, overbought, oversold } = params;
  const len = candles.length;
  if (len < n) return [];

  const rsv: (number | null)[] = new Array(len).fill(null);
  for (let i = n - 1; i < len; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      if (candles[j].high > high) high = candles[j].high;
      if (candles[j].low < low) low = candles[j].low;
    }
    if (high === low) {
      rsv[i] = 50;
    } else {
      rsv[i] = ((candles[i].close - low) / (high - low)) * 100;
    }
  }

  const kVals: (number | null)[] = new Array(len).fill(null);
  const dVals: (number | null)[] = new Array(len).fill(null);

  let k = 50;
  let d = 50;
  let started = false;
  for (let i = 0; i < len; i++) {
    if (rsv[i] == null) continue;
    if (!started) {
      k = rsv[i]!;
      d = rsv[i]!;
      started = true;
    } else {
      k = ((m1 - 1) / m1) * k + (1 / m1) * rsv[i]!;
      d = ((m2 - 1) / m2) * d + (1 / m2) * k;
    }
    kVals[i] = k;
    dVals[i] = d;
  }

  const points: KDJPoint[] = [];
  for (let i = 0; i < len; i++) {
    if (kVals[i] == null || dVals[i] == null) continue;
    const kVal = kVals[i]!;
    const dVal = dVals[i]!;
    const jVal = 3 * kVal - 2 * dVal;

    const point: KDJPoint = {
      time: candles[i].time,
      k: kVal,
      d: dVal,
      j: jVal,
    };

    if (points.length > 0) {
      const prev = points[points.length - 1];
      if (prev.k <= prev.d && kVal > dVal) {
        point.signal = "golden_cross";
      } else if (prev.k >= prev.d && kVal < dVal) {
        point.signal = "death_cross";
      } else if (kVal > overbought && dVal > overbought) {
        point.signal = "overbought";
      } else if (kVal < oversold && dVal < oversold) {
        point.signal = "oversold";
      }
    }

    points.push(point);
  }

  return points;
}

export function summarizeKdj(points: KDJPoint[], params: KDJParams = DEFAULT_KDJ): KDJSummary | null {
  if (points.length < 2) return null;
  const current = points[points.length - 1];
  const prev = points[points.length - 2];
  const kRising = current.k > prev.k;

  let zone: KDJSummary["zone"] = "normal";
  if (current.k > params.overbought && current.d > params.overbought) zone = "overbought";
  else if (current.k < params.oversold && current.d < params.oversold) zone = "oversold";

  let trend: KDJSummary["trend"] = "neutral";
  if (kRising && current.k > current.d) trend = "bullish";
  else if (!kRising && current.k < current.d) trend = "bearish";

  let lastCross: KDJSummary["lastCross"];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.signal === "golden_cross") {
      lastCross = { type: "golden", point: p };
      break;
    } else if (p.signal === "death_cross") {
      lastCross = { type: "death", point: p };
      break;
    }
  }

  return { current, trend, kRising, zone, lastCross };
}
