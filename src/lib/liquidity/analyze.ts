// 订单簿流动性分析
import type { LiquidityZone, OrderBook } from "@/types";

/** 将订单簿分桶聚合为流动性区间 */
export function analyzeLiquidity(
  orderBook: OrderBook,
  currentPrice: number,
  bucketPct = 0.0025, // 每桶 0.25%
  wallThreshold = 2.5, // 相对均值倍数
): LiquidityZone[] {
  const zones: LiquidityZone[] = [];

  const buildZones = (
    levels: { price: number; qty: number }[],
    side: "bid" | "ask",
  ): LiquidityZone[] => {
    if (levels.length === 0) return [];
    // 计算每个价位距当前价的百分比
    const enriched = levels.map((l) => ({
      ...l,
      distPct: (Math.abs(l.price - currentPrice) / currentPrice) * 100,
      notional: l.price * l.qty,
    }));
    // 按距离分桶
    const buckets = new Map<number, { qty: number; notional: number; low: number; high: number }>();
    for (const l of enriched) {
      const bucketIdx = Math.floor(l.distPct / (bucketPct * 100));
      const existing = buckets.get(bucketIdx) ?? { qty: 0, notional: 0, low: Infinity, high: -Infinity };
      existing.qty += l.qty;
      existing.notional += l.notional;
      existing.low = Math.min(existing.low, l.price);
      existing.high = Math.max(existing.high, l.price);
      buckets.set(bucketIdx, existing);
    }

    // 计算均值用于识别墙
    const allQtys = [...buckets.values()].map((b) => b.qty);
    const avgQty = allQtys.length > 0 ? allQtys.reduce((a, b) => a + b, 0) / allQtys.length : 0;

    return [...buckets.entries()].map(([idx, b]) => ({
      priceLow: Math.min(b.low, b.high),
      priceHigh: Math.max(b.low, b.high),
      side,
      totalQty: b.qty,
      notional: b.notional,
      isWall: avgQty > 0 && b.qty > avgQty * wallThreshold,
      distancePct: side === "ask" ? idx * bucketPct * 100 : -idx * bucketPct * 100,
    }));
  };

  zones.push(...buildZones(orderBook.bids, "bid"));
  zones.push(...buildZones(orderBook.asks, "ask"));

  // 按绝对距离排序
  return zones.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

/** 流动性简报：买卖压力比、最大买卖墙 */
export function liquiditySummary(zones: LiquidityZone[]): {
  bidPressure: number;
  askPressure: number;
  imbalance: number; // -100 ~ +100，正为买方强
  walls: LiquidityZone[];
} {
  const bids = zones.filter((z) => z.side === "bid");
  const asks = zones.filter((z) => z.side === "ask");
  const bidTotal = bids.reduce((s, z) => s + z.notional, 0);
  const askTotal = asks.reduce((s, z) => s + z.notional, 0);
  const total = bidTotal + askTotal;
  const imbalance = total > 0 ? ((bidTotal - askTotal) / total) * 100 : 0;
  const walls = zones.filter((z) => z.isWall).slice(0, 5);
  return {
    bidPressure: bidTotal,
    askPressure: askTotal,
    imbalance,
    walls,
  };
}
