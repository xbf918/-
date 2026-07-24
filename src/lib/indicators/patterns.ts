import type { Candle, CandlePattern, CandlePatternType, PatternSummary, ChartPattern } from "@/types";

interface CandleMetrics {
  body: number;
  upperWick: number;
  lowerWick: number;
  totalRange: number;
  isBullish: boolean;
  isBearish: boolean;
  bodyPercent: number;
  upperWickPercent: number;
  lowerWickPercent: number;
}

function getCandleMetrics(c: Candle): CandleMetrics {
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const totalRange = c.high - c.low || 0.00000001;
  return {
    body,
    upperWick,
    lowerWick,
    totalRange,
    isBullish: c.close > c.open,
    isBearish: c.close < c.open,
    bodyPercent: (body / totalRange) * 100,
    upperWickPercent: (upperWick / totalRange) * 100,
    lowerWickPercent: (lowerWick / totalRange) * 100,
  };
}

function isDoji(c: Candle, threshold = 5): boolean {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low || 0.00000001;
  return (body / range) * 100 < threshold;
}

function detectSingleCandle(candles: Candle[], index: number): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (index < 0 || index >= candles.length) return patterns;

  const c = candles[index];
  const m = getCandleMetrics(c);
  const time = c.time;

  // Doji 十字星
  if (isDoji(c, 3)) {
    if (m.lowerWickPercent > 60 && m.upperWickPercent < 15) {
      patterns.push({
        type: "dragonfly_doji",
        direction: "bullish",
        strength: 2,
        startIndex: index,
        endIndex: index,
        startTime: time,
        endTime: time,
      });
    } else if (m.upperWickPercent > 60 && m.lowerWickPercent < 15) {
      patterns.push({
        type: "gravestone_doji",
        direction: "bearish",
        strength: 2,
        startIndex: index,
        endIndex: index,
        startTime: time,
        endTime: time,
      });
    } else {
      patterns.push({
        type: "doji",
        direction: "neutral",
        strength: 1,
        startIndex: index,
        endIndex: index,
        startTime: time,
        endTime: time,
      });
    }
    return patterns;
  }

  // Spinning Top 纺锤线
  if (m.bodyPercent < 30 && m.upperWickPercent > 25 && m.lowerWickPercent > 25) {
    patterns.push({
      type: "spinning_top",
      direction: "neutral",
      strength: 1,
      startIndex: index,
      endIndex: index,
      startTime: time,
      endTime: time,
    });
  }

  // Marubozu 光头光脚
  if (m.bodyPercent > 90) {
    if (m.isBullish) {
      patterns.push({
        type: "bullish_marubozu",
        direction: "bullish",
        strength: m.upperWickPercent < 2 && m.lowerWickPercent < 2 ? 3 : 2,
        startIndex: index,
        endIndex: index,
        startTime: time,
        endTime: time,
      });
    } else {
      patterns.push({
        type: "bearish_marubozu",
        direction: "bearish",
        strength: m.upperWickPercent < 2 && m.lowerWickPercent < 2 ? 3 : 2,
        startIndex: index,
        endIndex: index,
        startTime: time,
        endTime: time,
      });
    }
  }

  // Hammer 锤子线 / Hanging Man 上吊线
  if (m.lowerWickPercent > 55 && m.upperWickPercent < 10 && m.bodyPercent < 35) {
    const type = m.isBullish ? "hammer" : "hanging_man";
    const direction: "bullish" | "bearish" = type === "hammer" ? "bullish" : "bearish";
    patterns.push({
      type: type as CandlePatternType,
      direction,
      strength: m.lowerWickPercent > 70 ? 3 : 2,
      startIndex: index,
      endIndex: index,
      startTime: time,
      endTime: time,
    });
  }

  // Inverted Hammer 倒锤子线 / Shooting Star 流星线
  if (m.upperWickPercent > 55 && m.lowerWickPercent < 10 && m.bodyPercent < 35) {
    const type = m.isBearish ? "shooting_star" : "inverted_hammer";
    const direction: "bullish" | "bearish" = type === "inverted_hammer" ? "bullish" : "bearish";
    patterns.push({
      type: type as CandlePatternType,
      direction,
      strength: m.upperWickPercent > 70 ? 3 : 2,
      startIndex: index,
      endIndex: index,
      startTime: time,
      endTime: time,
    });
  }

  return patterns;
}

function detectDoubleCandle(candles: Candle[], index: number): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (index < 1 || index >= candles.length) return patterns;

  const prev = candles[index - 1];
  const curr = candles[index];
  const prevM = getCandleMetrics(prev);
  const currM = getCandleMetrics(curr);

  // Bullish Engulfing 看涨吞没
  if (prevM.isBearish && currM.isBullish &&
      curr.open < prev.close && curr.close > prev.open) {
    const strength = curr.close > prev.high ? 3 : 2;
    patterns.push({
      type: "bullish_engulfing",
      direction: "bullish",
      strength: strength as 1 | 2 | 3,
      startIndex: index - 1,
      endIndex: index,
      startTime: prev.time,
      endTime: curr.time,
    });
  }

  // Bearish Engulfing 看跌吞没
  if (prevM.isBullish && currM.isBearish &&
      curr.open > prev.close && curr.close < prev.open) {
    const strength = curr.close < prev.low ? 3 : 2;
    patterns.push({
      type: "bearish_engulfing",
      direction: "bearish",
      strength: strength as 1 | 2 | 3,
      startIndex: index - 1,
      endIndex: index,
      startTime: prev.time,
      endTime: curr.time,
    });
  }

  // Piercing Pattern 刺透形态
  if (prevM.isBearish && currM.isBullish &&
      curr.open < prev.low &&
      curr.close > (prev.open + prev.close) / 2 &&
      curr.close < prev.open) {
    const mid = (prev.open + prev.close) / 2;
    const penetration = (curr.close - mid) / (prev.open - mid);
    const strength = penetration > 0.8 ? 3 : 2;
    patterns.push({
      type: "piercing_pattern",
      direction: "bullish",
      strength: strength as 1 | 2 | 3,
      startIndex: index - 1,
      endIndex: index,
      startTime: prev.time,
      endTime: curr.time,
    });
  }

  // Dark Cloud Cover 乌云盖顶
  if (prevM.isBullish && currM.isBearish &&
      curr.open > prev.high &&
      curr.close < (prev.open + prev.close) / 2 &&
      curr.close > prev.open) {
    const mid = (prev.open + prev.close) / 2;
    const penetration = (mid - curr.close) / (mid - prev.open);
    const strength = penetration > 0.8 ? 3 : 2;
    patterns.push({
      type: "dark_cloud_cover",
      direction: "bearish",
      strength: strength as 1 | 2 | 3,
      startIndex: index - 1,
      endIndex: index,
      startTime: prev.time,
      endTime: curr.time,
    });
  }

  // Bullish Harami 看涨孕线
  if (prevM.isBearish && currM.isBullish &&
      curr.open > prev.close && curr.close < prev.open &&
      currM.bodyPercent < prevM.bodyPercent * 0.6) {
    patterns.push({
      type: "bullish_harami",
      direction: "bullish",
      strength: 2,
      startIndex: index - 1,
      endIndex: index,
      startTime: prev.time,
      endTime: curr.time,
    });
  }

  // Bearish Harami 看跌孕线
  if (prevM.isBullish && currM.isBearish &&
      curr.open < prev.close && curr.close > prev.open &&
      currM.bodyPercent < prevM.bodyPercent * 0.6) {
    patterns.push({
      type: "bearish_harami",
      direction: "bearish",
      strength: 2,
      startIndex: index - 1,
      endIndex: index,
      startTime: prev.time,
      endTime: curr.time,
    });
  }

  return patterns;
}

function detectTripleCandle(candles: Candle[], index: number): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (index < 2 || index >= candles.length) return patterns;

  const first = candles[index - 2];
  const second = candles[index - 1];
  const third = candles[index];
  const firstM = getCandleMetrics(first);
  const secondM = getCandleMetrics(second);
  const thirdM = getCandleMetrics(third);

  // Morning Star 早晨之星
  if (firstM.isBearish && firstM.bodyPercent > 50 &&
      secondM.bodyPercent < 30 &&
      thirdM.isBullish && thirdM.bodyPercent > 50 &&
      third.close > (first.open + first.close) / 2) {
    const isDojiStar = isDoji(second, 5);
    patterns.push({
      type: "morning_star",
      direction: "bullish",
      strength: isDojiStar ? 3 : 2,
      startIndex: index - 2,
      endIndex: index,
      startTime: first.time,
      endTime: third.time,
    });
  }

  // Evening Star 黄昏之星
  if (firstM.isBullish && firstM.bodyPercent > 50 &&
      secondM.bodyPercent < 30 &&
      thirdM.isBearish && thirdM.bodyPercent > 50 &&
      third.close < (first.open + first.close) / 2) {
    const isDojiStar = isDoji(second, 5);
    patterns.push({
      type: "evening_star",
      direction: "bearish",
      strength: isDojiStar ? 3 : 2,
      startIndex: index - 2,
      endIndex: index,
      startTime: first.time,
      endTime: third.time,
    });
  }

  // Three White Soldiers 三白兵
  if (firstM.isBullish && secondM.isBullish && thirdM.isBullish &&
      firstM.bodyPercent > 50 && secondM.bodyPercent > 50 && thirdM.bodyPercent > 50 &&
      second.open > first.open && second.close > first.close &&
      third.open > second.open && third.close > second.close &&
      second.open < first.close && third.open < second.close) {
    patterns.push({
      type: "three_white_soldiers",
      direction: "bullish",
      strength: 3,
      startIndex: index - 2,
      endIndex: index,
      startTime: first.time,
      endTime: third.time,
    });
  }

  // Three Black Crows 三黑兵
  if (firstM.isBearish && secondM.isBearish && thirdM.isBearish &&
      firstM.bodyPercent > 50 && secondM.bodyPercent > 50 && thirdM.bodyPercent > 50 &&
      second.open < first.open && second.close < first.close &&
      third.open < second.open && third.close < second.close &&
      second.open > first.close && third.open > second.close) {
    patterns.push({
      type: "three_black_crows",
      direction: "bearish",
      strength: 3,
      startIndex: index - 2,
      endIndex: index,
      startTime: first.time,
      endTime: third.time,
    });
  }

  return patterns;
}

export function detectCandlePatterns(candles: Candle[]): CandlePattern[] {
  if (candles.length < 1) return [];

  const allPatterns: CandlePattern[] = [];

  for (let i = Math.max(0, candles.length - 30); i < candles.length; i++) {
    allPatterns.push(...detectSingleCandle(candles, i));
    if (i >= 1) {
      allPatterns.push(...detectDoubleCandle(candles, i));
    }
    if (i >= 2) {
      allPatterns.push(...detectTripleCandle(candles, i));
    }
  }

  return allPatterns.sort((a, b) => b.strength - a.strength);
}

export function summarizePatterns(candlePatterns: CandlePattern[], chartPatterns: ChartPattern[]): PatternSummary {
  const bullish = candlePatterns.filter((p) => p.direction === "bullish").length +
    chartPatterns.filter((p) => p.direction === "bullish").length;
  const bearish = candlePatterns.filter((p) => p.direction === "bearish").length +
    chartPatterns.filter((p) => p.direction === "bearish").length;

  let score = 0;
  for (const p of candlePatterns) {
    const val = p.strength * 10;
    if (p.direction === "bullish") score += val;
    else if (p.direction === "bearish") score -= val;
  }
  for (const p of chartPatterns) {
    const val = p.strength * 15;
    if (p.direction === "bullish") score += val;
    else if (p.direction === "bearish") score -= val;
  }

  score = Math.max(-100, Math.min(100, score));

  return {
    candlePatterns,
    chartPatterns,
    bullishCount: bullish,
    bearishCount: bearish,
    score,
  };
}

export const PATTERN_NAMES_ZH: Record<CandlePatternType, string> = {
  hammer: "锤子线",
  inverted_hammer: "倒锤子线",
  bullish_marubozu: "看涨光头光脚",
  dragonfly_doji: "蜻蜓十字",
  shooting_star: "流星线",
  hanging_man: "上吊线",
  bearish_marubozu: "看跌光头光脚",
  gravestone_doji: "墓碑十字",
  doji: "十字星",
  spinning_top: "纺锤线",
  bullish_engulfing: "看涨吞没",
  piercing_pattern: "刺透形态",
  bullish_harami: "看涨孕线",
  bearish_engulfing: "看跌吞没",
  dark_cloud_cover: "乌云盖顶",
  bearish_harami: "看跌孕线",
  morning_star: "早晨之星",
  three_white_soldiers: "三白兵",
  evening_star: "黄昏之星",
  three_black_crows: "三黑兵",
};

export const PATTERN_NAMES_EN: Record<CandlePatternType, string> = {
  hammer: "Hammer",
  inverted_hammer: "Inverted Hammer",
  bullish_marubozu: "Bullish Marubozu",
  dragonfly_doji: "Dragonfly Doji",
  shooting_star: "Shooting Star",
  hanging_man: "Hanging Man",
  bearish_marubozu: "Bearish Marubozu",
  gravestone_doji: "Gravestone Doji",
  doji: "Doji",
  spinning_top: "Spinning Top",
  bullish_engulfing: "Bullish Engulfing",
  piercing_pattern: "Piercing Pattern",
  bullish_harami: "Bullish Harami",
  bearish_engulfing: "Bearish Engulfing",
  dark_cloud_cover: "Dark Cloud Cover",
  bearish_harami: "Bearish Harami",
  morning_star: "Morning Star",
  three_white_soldiers: "Three White Soldiers",
  evening_star: "Evening Star",
  three_black_crows: "Three Black Crows",
};
