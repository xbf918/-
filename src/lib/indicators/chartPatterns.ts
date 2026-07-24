import type { Candle, ChartPattern, ChartPatternType } from "@/types";

interface SwingPoint {
  index: number;
  price: number;
  time: number;
  type: "high" | "low";
}

function findSwingPoints(candles: Candle[], lookback = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < lookback * 2 + 1) return swings;

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high) isHigh = false;
      if (candles[i + j].high >= c.high) isHigh = false;
      if (candles[i - j].low <= c.low) isLow = false;
      if (candles[i + j].low <= c.low) isLow = false;
    }
    if (isHigh) {
      swings.push({ index: i, price: c.high, time: c.time, type: "high" });
    }
    if (isLow) {
      swings.push({ index: i, price: c.low, time: c.time, type: "low" });
    }
  }
  return swings.sort((a, b) => a.index - b.index);
}

function detectHeadAndShoulders(swings: SwingPoint[]): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const highs = swings.filter((s) => s.type === "high");

  for (let i = 0; i < highs.length - 2; i++) {
    const left = highs[i];
    const head = highs[i + 1];
    const right = highs[i + 2];

    if (head.price <= left.price || head.price <= right.price) continue;

    const leftHeight = head.price - left.price;
    const rightHeight = head.price - right.price;
    const symmetry = Math.abs(leftHeight - rightHeight) / Math.max(leftHeight, rightHeight);
    if (symmetry > 0.35) continue;

    const lowsBetween = swings.filter(
      (s) => s.type === "low" && s.index > left.index && s.index < right.index,
    );
    if (lowsBetween.length < 2) continue;

    const necklineLow = lowsBetween.reduce((min, l) => (l.price < min.price ? l : min), lowsBetween[0]);
    const patternHeight = head.price - necklineLow.price;
    const targetPrice = necklineLow.price - patternHeight;

    patterns.push({
      type: "head_and_shoulders_top",
      direction: "bearish",
      strength: symmetry < 0.15 ? 3 : symmetry < 0.25 ? 2 : 1,
      startIndex: left.index,
      endIndex: right.index,
      startTime: left.time,
      endTime: right.time,
      neckline: necklineLow.price,
      targetPrice,
    });
  }

  const lows = swings.filter((s) => s.type === "low");
  for (let i = 0; i < lows.length - 2; i++) {
    const left = lows[i];
    const head = lows[i + 1];
    const right = lows[i + 2];

    if (head.price >= left.price || head.price >= right.price) continue;

    const leftHeight = left.price - head.price;
    const rightHeight = right.price - head.price;
    const symmetry = Math.abs(leftHeight - rightHeight) / Math.max(leftHeight, rightHeight);
    if (symmetry > 0.35) continue;

    const highsBetween = swings.filter(
      (s) => s.type === "high" && s.index > left.index && s.index < right.index,
    );
    if (highsBetween.length < 2) continue;

    const necklineHigh = highsBetween.reduce((max, h) => (h.price > max.price ? h : max), highsBetween[0]);
    const patternHeight = necklineHigh.price - head.price;
    const targetPrice = necklineHigh.price + patternHeight;

    patterns.push({
      type: "head_and_shoulders_bottom",
      direction: "bullish",
      strength: symmetry < 0.15 ? 3 : symmetry < 0.25 ? 2 : 1,
      startIndex: left.index,
      endIndex: right.index,
      startTime: left.time,
      endTime: right.time,
      neckline: necklineHigh.price,
      targetPrice,
    });
  }

  return patterns;
}

function detectDoubleTopBottom(swings: SwingPoint[]): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  const highs = swings.filter((s) => s.type === "high");

  for (let i = 0; i < highs.length - 1; i++) {
    const left = highs[i];
    const right = highs[i + 1];

    const diffPct = Math.abs(left.price - right.price) / left.price * 100;
    if (diffPct > 2.5) continue;

    const distance = right.index - left.index;
    if (distance < 8 || distance > 80) continue;

    const lowsBetween = swings.filter(
      (s) => s.type === "low" && s.index > left.index && s.index < right.index,
    );
    if (lowsBetween.length < 1) continue;

    const neckline = lowsBetween.reduce((min, l) => (l.price < min.price ? l : min), lowsBetween[0]);
    const patternHeight = left.price - neckline.price;
    if (patternHeight / left.price < 0.02) continue;
    const targetPrice = neckline.price - patternHeight;

    patterns.push({
      type: "double_top",
      direction: "bearish",
      strength: diffPct < 1 ? 3 : diffPct < 1.8 ? 2 : 1,
      startIndex: left.index,
      endIndex: right.index,
      startTime: left.time,
      endTime: right.time,
      neckline: neckline.price,
      targetPrice,
    });
  }

  const lows = swings.filter((s) => s.type === "low");
  for (let i = 0; i < lows.length - 1; i++) {
    const left = lows[i];
    const right = lows[i + 1];

    const diffPct = Math.abs(left.price - right.price) / left.price * 100;
    if (diffPct > 2.5) continue;

    const distance = right.index - left.index;
    if (distance < 8 || distance > 80) continue;

    const highsBetween = swings.filter(
      (s) => s.type === "high" && s.index > left.index && s.index < right.index,
    );
    if (highsBetween.length < 1) continue;

    const neckline = highsBetween.reduce((max, h) => (h.price > max.price ? h : max), highsBetween[0]);
    const patternHeight = neckline.price - left.price;
    if (patternHeight / left.price < 0.02) continue;
    const targetPrice = neckline.price + patternHeight;

    patterns.push({
      type: "double_bottom",
      direction: "bullish",
      strength: diffPct < 1 ? 3 : diffPct < 1.8 ? 2 : 1,
      startIndex: left.index,
      endIndex: right.index,
      startTime: left.time,
      endTime: right.time,
      neckline: neckline.price,
      targetPrice,
    });
  }

  return patterns;
}

function detectTriangles(swings: SwingPoint[], candles: Candle[]): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  if (swings.length < 6) return patterns;

  const recentSwings = swings.slice(-12);
  const highs = recentSwings.filter((s) => s.type === "high");
  const lows = recentSwings.filter((s) => s.type === "low");

  if (highs.length < 2 || lows.length < 2) return patterns;

  function slope(points: SwingPoint[]): number {
    if (points.length < 2) return 0;
    const first = points[0];
    const last = points[points.length - 1];
    const dx = last.index - first.index;
    if (dx === 0) return 0;
    return ((last.price - first.price) / first.price) / dx;
  }

  const highSlope = slope(highs);
  const lowSlope = slope(lows);

  const firstHigh = highs[0];
  const lastHigh = highs[highs.length - 1];
  const firstLow = lows[0];
  const lastLow = lows[lows.length - 1];

  const startIdx = Math.min(firstHigh.index, firstLow.index);
  const endIdx = Math.max(lastHigh.index, lastLow.index);
  const duration = endIdx - startIdx;

  if (duration < 10 || duration > 100) return patterns;

  const highDeclining = highSlope < -0.001;
  const highRising = highSlope > 0.001;
  const lowDeclining = lowSlope < -0.001;
  const lowRising = lowSlope > 0.001;
  const highFlat = Math.abs(highSlope) < 0.002;
  const lowFlat = Math.abs(lowSlope) < 0.002;

  const convergence = Math.abs(highSlope - lowSlope);

  if (highFlat && lowRising) {
    patterns.push({
      type: "ascending_triangle",
      direction: "bullish",
      strength: convergence > 0.003 ? 3 : 2,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
      neckline: firstHigh.price,
      targetPrice: firstHigh.price + (firstHigh.price - lastLow.price),
    });
  }

  if (lowFlat && highDeclining) {
    patterns.push({
      type: "descending_triangle",
      direction: "bearish",
      strength: convergence > 0.003 ? 3 : 2,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
      neckline: firstLow.price,
      targetPrice: firstLow.price - (firstLow.price - lastHigh.price),
    });
  }

  if (highDeclining && lowRising) {
    patterns.push({
      type: "symmetrical_triangle",
      direction: "neutral",
      strength: convergence > 0.004 ? 2 : 1,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
    });
  }

  return patterns;
}

function detectWedgesAndFlags(swings: SwingPoint[], candles: Candle[]): ChartPattern[] {
  const patterns: ChartPattern[] = [];
  if (swings.length < 6) return patterns;

  const recentSwings = swings.slice(-14);
  const highs = recentSwings.filter((s) => s.type === "high");
  const lows = recentSwings.filter((s) => s.type === "low");

  if (highs.length < 2 || lows.length < 2) return patterns;

  function slope(points: SwingPoint[]): number {
    if (points.length < 2) return 0;
    const first = points[0];
    const last = points[points.length - 1];
    const dx = last.index - first.index;
    if (dx === 0) return 0;
    return ((last.price - first.price) / first.price) / dx;
  }

  const highSlope = slope(highs);
  const lowSlope = slope(lows);

  const startIdx = Math.min(highs[0].index, lows[0].index);
  const endIdx = Math.max(highs[highs.length - 1].index, lows[lows.length - 1].index);
  const duration = endIdx - startIdx;

  if (duration < 8 || duration > 60) return patterns;

  const bothRising = highSlope > 0.001 && lowSlope > 0.001;
  const bothFalling = highSlope < -0.001 && lowSlope < -0.001;
  const converging = Math.abs(highSlope - lowSlope) > 0.001;

  if (bothRising && converging && highSlope < lowSlope) {
    patterns.push({
      type: "rising_wedge",
      direction: "bearish",
      strength: 2,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
    });
  }

  if (bothFalling && converging && highSlope > lowSlope) {
    patterns.push({
      type: "falling_wedge",
      direction: "bullish",
      strength: 2,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
    });
  }

  const channelWidth = Math.abs(highSlope - lowSlope);
  if (bothRising && channelWidth < 0.003 && duration > 10) {
    patterns.push({
      type: "bull_flag",
      direction: "bullish",
      strength: 2,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
    });
  }

  if (bothFalling && channelWidth < 0.003 && duration > 10) {
    patterns.push({
      type: "bear_flag",
      direction: "bearish",
      strength: 2,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: candles[startIdx]?.time || 0,
      endTime: candles[endIdx]?.time || 0,
    });
  }

  return patterns;
}

export function detectChartPatterns(candles: Candle[]): ChartPattern[] {
  if (candles.length < 30) return [];

  const swings = findSwingPoints(candles, 4);
  if (swings.length < 4) return [];

  const patterns: ChartPattern[] = [
    ...detectHeadAndShoulders(swings),
    ...detectDoubleTopBottom(swings),
    ...detectTriangles(swings, candles),
    ...detectWedgesAndFlags(swings, candles),
  ];

  return patterns.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

export const CHART_PATTERN_NAMES_ZH: Record<ChartPatternType, string> = {
  head_and_shoulders_top: "头肩顶",
  head_and_shoulders_bottom: "头肩底",
  double_top: "双顶",
  double_bottom: "双底",
  ascending_triangle: "上升三角形",
  descending_triangle: "下降三角形",
  symmetrical_triangle: "对称三角形",
  rising_wedge: "上升楔形",
  falling_wedge: "下降楔形",
  bull_flag: "看涨旗形",
  bear_flag: "看跌旗形",
};

export const CHART_PATTERN_NAMES_EN: Record<ChartPatternType, string> = {
  head_and_shoulders_top: "Head & Shoulders Top",
  head_and_shoulders_bottom: "Head & Shoulders Bottom",
  double_top: "Double Top",
  double_bottom: "Double Bottom",
  ascending_triangle: "Ascending Triangle",
  descending_triangle: "Descending Triangle",
  symmetrical_triangle: "Symmetrical Triangle",
  rising_wedge: "Rising Wedge",
  falling_wedge: "Falling Wedge",
  bull_flag: "Bull Flag",
  bear_flag: "Bear Flag",
};
