// 缺口识别：价格缺口 + 公平价值缺口(FVG)
import type { Candle, Gap } from "@/types";

/** 检测价格缺口与公平价值缺口
 *  - price_gap: 传统缺口，前一根 high < 后一根 low（向上）或前一根 low > 后一根 high（向下）
 *  - fvg: 公平价值缺口，三根K线中第1根与第3根之间未覆盖的区间
 */
export function detectGaps(candles: Candle[], lookback = 100): Gap[] {
  if (candles.length < 3) return [];
  const start = Math.max(0, candles.length - lookback);
  const recent = candles.slice(start);
  const gaps: Gap[] = [];

  for (let i = 2; i < recent.length; i++) {
    const c1 = recent[i - 2];
    const c2 = recent[i - 1];
    const c3 = recent[i];

    // 传统缺口（c1 -> c2 之间）
    if (c1.high < c2.low) {
      const filled = recent.slice(i).some((c) => c.low <= c1.high);
      gaps.push({
        type: "price_gap",
        startTime: c1.time,
        endTime: c2.time,
        topPrice: c2.low,
        bottomPrice: c1.high,
        filled,
      });
    } else if (c1.low > c2.high) {
      const filled = recent.slice(i).some((c) => c.high >= c1.low);
      gaps.push({
        type: "price_gap",
        startTime: c1.time,
        endTime: c2.time,
        topPrice: c1.low,
        bottomPrice: c2.high,
        filled,
      });
    }

    // FVG（三根K线）
    // 向上 FVG: c1.high < c3.low，中间存在未覆盖区间
    if (c1.high < c3.low) {
      const filled = recent.slice(i).some((c) => c.low <= c1.high);
      gaps.push({
        type: "fvg",
        startTime: c1.time,
        endTime: c3.time,
        topPrice: c3.low,
        bottomPrice: c1.high,
        filled,
      });
    }
    // 向下 FVG: c1.low > c3.high
    else if (c1.low > c3.high) {
      const filled = recent.slice(i).some((c) => c.high >= c1.low);
      gaps.push({
        type: "fvg",
        startTime: c1.time,
        endTime: c3.time,
        topPrice: c1.low,
        bottomPrice: c3.high,
        filled,
      });
    }
  }

  // 仅返回未填充的缺口，按时间倒序
  return gaps.filter((g) => !g.filled).sort((a, b) => b.endTime - a.endTime).slice(0, 10);
}
