// 支撑阻力位识别（基于枢轴点密度聚类）
import type { Candle, SupportResistance } from "@/types";
import { findPivots, type Pivot } from "./pivots";

interface Cluster {
  price: number;
  touches: number;
  type: "high" | "low";
  lastIndex: number;
  lastTime: number;
}

/** 密度聚类：将相近的极值点合并 */
function clusterPivots(pivots: Pivot[], tolerance = 0.005): Cluster[] {
  if (pivots.length === 0) return [];
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;

  for (const p of sorted) {
    if (current === null) {
      current = {
        price: p.price,
        touches: 1,
        type: p.type,
        lastIndex: p.index,
        lastTime: p.time,
      };
      continue;
    }
    const diff = Math.abs(p.price - current.price) / current.price;
    if (diff <= tolerance) {
      // 合并
      current.price = (current.price * current.touches + p.price) / (current.touches + 1);
      current.touches += 1;
      if (p.index > current.lastIndex) {
        current.lastIndex = p.index;
        current.lastTime = p.time;
      }
    } else {
      clusters.push(current);
      current = {
        price: p.price,
        touches: 1,
        type: p.type,
        lastIndex: p.index,
        lastTime: p.time,
      };
    }
  }
  if (current) clusters.push(current);
  return clusters;
}

/** 识别支撑阻力位 */
export function findSupportResistance(
  candles: Candle[],
  currentPrice: number,
  tolerance = 0.005,
  maxLevels = 8,
): SupportResistance[] {
  if (candles.length < 10) return [];
  const pivots = findPivots(candles, 3, 3);
  if (pivots.length === 0) return [];

  const clusters = clusterPivots(pivots, tolerance);
  const levels: SupportResistance[] = clusters.map((c) => ({
    price: c.price,
    type: c.price > currentPrice ? "resistance" : "support",
    // 强度 = 触碰次数 * 1 + (远离当前价的额外权重)
    strength: Math.min(5, c.touches + (Math.abs(c.price - currentPrice) / currentPrice > 0.03 ? 1 : 0)),
    touches: c.touches,
    lastTouch: c.lastTime,
  }));

  // 按距当前价 relevance 排序：靠近 + 多次触碰 优先
  const scored = levels.map((l) => ({
    level: l,
    score:
      l.touches * 2 +
      (5 - Math.min(5, (Math.abs(l.price - currentPrice) / currentPrice) * 100)) +
      l.strength,
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxLevels).map((s) => s.level);
}
