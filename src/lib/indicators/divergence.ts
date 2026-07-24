// 背离检测（基于价格枢轴点与 MACD 枢轴点）
import type { Candle, Divergence, MACDPoint } from "@/types";
import { findPivots, type Pivot } from "./pivots";

interface PivotWithValue extends Pivot {
  value: number; // 对应指标值
}

/** 在 MACD 序列中找到对应时间的枢轴点 */
function matchIndicatorPivots(
  pricePivots: Pivot[],
  macdPoints: MACDPoint[],
): PivotWithValue[] {
  const result: PivotWithValue[] = [];
  const macdMap = new Map(macdPoints.map((p) => [p.time, p]));
  for (const pv of pricePivots) {
    const m = macdMap.get(pv.time);
    if (m) result.push({ ...pv, value: m.histogram });
  }
  return result;
}

/** 评估背离强度 */
function divergenceStrength(
  priceDelta: number,
  indicatorDelta: number,
  spanBars: number,
): Divergence["strength"] {
  const pricePct = Math.abs(priceDelta);
  const indicatorPct = Math.abs(indicatorDelta);
  const magnitude = pricePct + indicatorPct * 0.5;
  if (magnitude > 0.05 || spanBars > 30) return "strong";
  if (magnitude > 0.02 || spanBars > 15) return "medium";
  return "weak";
}

/** 检测背离 */
export function detectDivergences(
  candles: Candle[],
  macdPoints: MACDPoint[],
  lookback = 80,
): Divergence[] {
  if (candles.length < 20 || macdPoints.length < 20) return [];

  const recentCandles = candles.slice(-lookback);
  const offset = candles.length - recentCandles.length;
  const pricePivots = findPivots(recentCandles, 3, 3);
  // 调整 index 为全局
  const globalPivots: Pivot[] = pricePivots.map((p) => ({
    ...p,
    index: p.index + offset,
  }));
  const pivotsWithMacd = matchIndicatorPivots(globalPivots, macdPoints);
  if (pivotsWithMacd.length < 2) return [];

  const highs = pivotsWithMacd.filter((p) => p.type === "high");
  const lows = pivotsWithMacd.filter((p) => p.type === "low");

  const divergences: Divergence[] = [];

  // 检查连续两个高点
  for (let i = 1; i < highs.length; i++) {
    const a = highs[i - 1];
    const b = highs[i];
    const spanBars = b.index - a.index;
    if (spanBars < 5) continue;

    const priceDelta = b.price - a.price;
    const indicatorDelta = b.value - a.value;
    const strength = divergenceStrength(priceDelta, indicatorDelta, spanBars);

    // 顶背离：价格更高，指标更低
    if (priceDelta > 0 && indicatorDelta < 0) {
      divergences.push({
        type: "regular_bearish",
        startTime: a.time,
        endTime: b.time,
        priceStart: a.price,
        priceEnd: b.price,
        indicatorStart: a.value,
        indicatorEnd: b.value,
        strength,
      });
    }
    // 隐藏顶背离（趋势延续）：价格更低，指标更高
    else if (priceDelta < 0 && indicatorDelta > 0) {
      divergences.push({
        type: "hidden_bearish",
        startTime: a.time,
        endTime: b.time,
        priceStart: a.price,
        priceEnd: b.price,
        indicatorStart: a.value,
        indicatorEnd: b.value,
        strength,
      });
    }
  }

  // 检查连续两个低点
  for (let i = 1; i < lows.length; i++) {
    const a = lows[i - 1];
    const b = lows[i];
    const spanBars = b.index - a.index;
    if (spanBars < 5) continue;

    const priceDelta = b.price - a.price;
    const indicatorDelta = b.value - a.value;
    const strength = divergenceStrength(priceDelta, indicatorDelta, spanBars);

    // 底背离：价格更低，指标更高
    if (priceDelta < 0 && indicatorDelta > 0) {
      divergences.push({
        type: "regular_bullish",
        startTime: a.time,
        endTime: b.time,
        priceStart: a.price,
        priceEnd: b.price,
        indicatorStart: a.value,
        indicatorEnd: b.value,
        strength,
      });
    }
    // 隐藏底背离（趋势延续）：价格更高，指标更低
    else if (priceDelta > 0 && indicatorDelta < 0) {
      divergences.push({
        type: "hidden_bullish",
        startTime: a.time,
        endTime: b.time,
        priceStart: a.price,
        priceEnd: b.price,
        indicatorStart: a.value,
        indicatorEnd: b.value,
        strength,
      });
    }
  }

  // 按时间倒序
  return divergences.sort((a, b) => b.endTime - a.endTime);
}
