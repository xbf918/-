// 局部极值点（枢轴点）检测
import type { Candle } from "@/types";

export interface Pivot {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

/** 检测枢轴点（左右各 N 根 K 线确认） */
export function findPivots(candles: Candle[], left = 3, right = 3): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const candle = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candle.high) isHigh = false;
      if (candles[j].low <= candle.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) {
      pivots.push({ index: i, time: candle.time, price: candle.high, type: "high" });
    }
    if (isLow) {
      pivots.push({ index: i, time: candle.time, price: candle.low, type: "low" });
    }
  }
  return pivots;
}
