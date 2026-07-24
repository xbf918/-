// MACD 指标计算
import type { Candle, MACDPoint, MACDSummary } from "@/types";
import { ema } from "./ema";

export interface MACDParams {
  fast: number;
  slow: number;
  signal: number;
}

export const DEFAULT_MACD: MACDParams = { fast: 12, slow: 26, signal: 9 };

/** 计算 MACD 序列 */
export function macd(
  candles: Candle[],
  params: MACDParams = DEFAULT_MACD,
): MACDPoint[] {
  const closes = candles.map((c) => c.close);
  const emaFast = ema(closes, params.fast);
  const emaSlow = ema(closes, params.slow);

  const macdLine: (number | null)[] = closes.map((_, i) => {
    if (emaFast[i] == null || emaSlow[i] == null) return null;
    return emaFast[i]! - emaSlow[i]!;
  });

  // 信号线 = macdLine 的 EMA（仅对非 null 部分计算）
  const validStart = macdLine.findIndex((v) => v != null);
  const signalLine: (number | null)[] = new Array(candles.length).fill(null);
  if (validStart !== -1) {
    const validMacd = macdLine.slice(validStart).map((v) => v as number);
    const sig = ema(validMacd, params.signal);
    for (let i = 0; i < sig.length; i++) {
      signalLine[validStart + i] = sig[i];
    }
  }

  const points: MACDPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const m = macdLine[i];
    const s = signalLine[i];
    if (m == null || s == null) continue;
    const point: MACDPoint = {
      time: candles[i].time,
      macd: m,
      signal: s,
      histogram: m - s,
    };
    // 交叉检测
    if (points.length > 0) {
      const prev = points[points.length - 1];
      if (prev.histogram < 0 && point.histogram >= 0) {
        point.crossover = "bullish";
      } else if (prev.histogram > 0 && point.histogram <= 0) {
        point.crossover = "bearish";
      }
    }
    points.push(point);
  }
  return points;
}

/** 汇总 MACD 状态 */
export function summarizeMacd(points: MACDPoint[]): MACDSummary | null {
  if (points.length < 2) return null;
  const current = points[points.length - 1];
  const prev = points[points.length - 2];
  const histogramRising = current.histogram > prev.histogram;
  const aboveZero = current.macd > 0;

  let trend: MACDSummary["trend"] = "neutral";
  if (current.histogram > 0 && histogramRising) trend = "bullish";
  else if (current.histogram < 0 && !histogramRising) trend = "bearish";
  else if (current.histogram > 0) trend = "bullish";

  // 最近一次交叉
  let lastCrossover: MACDPoint | undefined;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].crossover) {
      lastCrossover = points[i];
      break;
    }
  }

  return { current, trend, histogramRising, aboveZero, lastCrossover };
}
