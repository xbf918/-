/**
 * AI 市场环境识别模块
 *
 * 通过分析近期 K 线特征，自动识别当前市场处于：
 * - trending（趋势市）：强方向性，权重应偏向技术面、多周期共振
 * - ranging（震荡市）：无明显方向，权重应偏向 K线形态、流动性
 * - volatile（高波动）：剧烈波动，应提高置信度门槛，权重偏向背离、量能
 *
 * 输出建议权重，叠加在现有学习权重上。
 */
import type { Candle, ScoreWeights } from "@/types";
import { DEFAULT_WEIGHTS } from "@/lib/constants";

export type MarketRegime = "trending" | "ranging" | "volatile" | "unknown";

export interface MarketFeatures {
  adx: number;            // 0-100 趋势强度
  volatility: number;     // 0-100 波动率（ATR 相对价格）
  trendSlope: number;     // -1 ~ 1 趋势斜率（标准化）
  rangePosition: number;  // 0-100 当前价格在最近 N 根 K 线区间的位置
  bodyRatio: number;      // 0-1 实体/总波幅均值（趋势/震荡辨别）
  volumeExpansion: number; // 0-1 近期成交量相对历史均值的扩张
}

export interface MarketRegimeReport {
  regime: MarketRegime;
  confidence: number;     // 0-100 对该判断的把握度
  features: MarketFeatures;
  recommendedWeights: ScoreWeights;
  adjustments: RegimeAdjustment[];
  summary: string;
  detectedAt: number;
}

export interface RegimeAdjustment {
  dimension: keyof ScoreWeights;
  fromWeight: number;
  toWeight: number;
  reason: string;
}

// ============ 特征计算 ============

/**
 * 计算 ADX 风格的趋势强度（简化版：连续同向 K 线占比 + 实体强度）
 * 返回 0-100 的趋势强度指数
 */
function calcADX(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const slice = candles.slice(-period - 1);
  let upMove = 0;
  let downMove = 0;
  let totalRange = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const prev = slice[i - 1];
    const up = c.high - prev.high;
    const down = prev.low - c.low;
    const plusDM = up > down && up > 0 ? up : 0;
    const minusDM = down > up && down > 0 ? down : 0;
    const range = c.high - c.low || 1e-9;
    upMove += plusDM;
    downMove += minusDM;
    totalRange += range;
  }
  if (totalRange === 0) return 0;
  // 取 +DM、-DM 中较大者与总波幅比值，再放大成 0-100
  const dx = (Math.max(upMove, downMove) / totalRange) * 100;
  return Math.min(100, dx * 2.5);
}

/**
 * 计算波动率（ATR / 当前价格 * 100）
 */
function calcVolatility(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const slice = candles.slice(-period - 1);
  let atr = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const prev = slice[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    atr += tr;
  }
  atr /= period;
  const lastClose = candles[candles.length - 1].close || 1e-9;
  return Math.min(100, (atr / lastClose) * 100 * 10);
}

/**
 * 标准化趋势斜率（线性回归斜率 / 价格），范围 -1 ~ 1
 */
function calcTrendSlope(candles: Candle[], period = 20): number {
  if (candles.length < period) return 0;
  const slice = candles.slice(-period);
  const n = slice.length;
  const xs = slice.map((_, i) => i);
  const ys = slice.map((c) => c.close);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 0;
  const slope = num / den;
  // 标准化：斜率 / 平均价格
  return Math.max(-1, Math.min(1, slope / (meanY || 1e-9)));
}

/**
 * 当前价格在最近 N 根 K 线区间中的位置 0-100
 */
function calcRangePosition(candles: Candle[], period = 20): number {
  if (candles.length < period) return 50;
  const slice = candles.slice(-period);
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const last = slice[slice.length - 1].close;
  if (high === low) return 50;
  return Math.max(0, Math.min(100, ((last - low) / (high - low)) * 100));
}

/**
 * 实体 / 总波幅 均值（趋势/震荡辨别）
 * 趋势市：实体大，影线短；震荡市：实体小，影线长
 */
function calcBodyRatio(candles: Candle[], period = 14): number {
  if (candles.length < period) return 0.5;
  const slice = candles.slice(-period);
  let sum = 0;
  for (const c of slice) {
    const range = c.high - c.low || 1e-9;
    const body = Math.abs(c.close - c.open);
    sum += body / range;
  }
  return sum / period;
}

/**
 * 近期成交量扩张比率：近 5 根均量 / 之前 20 根均量
 */
function calcVolumeExpansion(candles: Candle[]): number {
  if (candles.length < 25) return 1;
  const recent = candles.slice(-5);
  const historical = candles.slice(-25, -5);
  const recentAvg = recent.reduce((s, c) => s + c.volume, 0) / 5;
  const histAvg = historical.reduce((s, c) => s + c.volume, 0) / 20 || 1e-9;
  return recentAvg / histAvg;
}

// ============ 综合特征 ============

export function extractMarketFeatures(candles: Candle[]): MarketFeatures {
  return {
    adx: calcADX(candles),
    volatility: calcVolatility(candles),
    trendSlope: calcTrendSlope(candles),
    rangePosition: calcRangePosition(candles),
    bodyRatio: calcBodyRatio(candles),
    volumeExpansion: calcVolumeExpansion(candles),
  };
}

// ============ 状态分类 ============

/**
 * 根据特征判断市场状态
 */
export function classifyRegime(features: MarketFeatures): {
  regime: MarketRegime;
  confidence: number;
} {
  const { adx, volatility, trendSlope, bodyRatio } = features;

  // 高波动优先（无论趋势/震荡）
  if (volatility > 70) {
    return { regime: "volatile", confidence: Math.min(95, volatility) };
  }

  // 强趋势：ADX 高 + 斜率明显 + 实体大
  if (adx > 50 && Math.abs(trendSlope) > 0.3 && bodyRatio > 0.5) {
    return { regime: "trending", confidence: Math.min(95, adx) };
  }

  // 弱趋势：ADX 中等，方向性强
  if (adx > 30 && Math.abs(trendSlope) > 0.15) {
    return { regime: "trending", confidence: Math.min(85, adx + 10) };
  }

  // 震荡：ADX 低，斜率小，实体小
  if (adx < 30 && Math.abs(trendSlope) < 0.15 && bodyRatio < 0.5) {
    return { regime: "ranging", confidence: Math.min(90, 80 - adx) };
  }

  // 默认按 ADX 主导
  if (adx < 25) return { regime: "ranging", confidence: 60 };
  return { regime: "trending", confidence: 60 };
}

// ============ 权重建议 ============

/**
 * 各类市场状态下的推荐权重模板
 * 总和 = 0.7（剩余 30% 留给 patterns / volumeFlow 等附加维度）
 */
const REGIME_WEIGHTS: Record<MarketRegime, ScoreWeights> = {
  trending: {
    technical: 0.32,   // 趋势中技术面（MA、MACD）最有效
    divergence: 0.08,  // 趋势中背离信号偏少
    liquidity: 0.15,
    timeframe: 0.25,   // 多周期共振在趋势中权重提升
    sentiment: 0.10,
  },
  ranging: {
    technical: 0.15,   // 震荡中技术指标易钝化
    divergence: 0.20,  // 背离在反转时更有意义
    liquidity: 0.25,   // 流动性区间识别支撑压力
    timeframe: 0.15,
    sentiment: 0.15,   // 情绪反转信号重要
  },
  volatile: {
    technical: 0.18,
    divergence: 0.25,  // 高波动中背离是反转关键
    liquidity: 0.20,
    timeframe: 0.12,
    sentiment: 0.15,   // 情绪 + 流动性 抓顶部底部
  },
  unknown: { ...DEFAULT_WEIGHTS },
};

/**
 * 根据市场状态生成推荐权重，并在现有权重基础上平滑调整
 */
export function recommendWeights(
  regime: MarketRegime,
  currentWeights: ScoreWeights,
  confidence: number,
): { weights: ScoreWeights; adjustments: RegimeAdjustment[] } {
  const target = REGIME_WEIGHTS[regime] || REGIME_WEIGHTS.unknown;
  // 信心度越高，越偏向目标权重（最高 70% 迁移）
  const blendRatio = Math.min(0.7, confidence / 100);
  const adjustments: RegimeAdjustment[] = [];
  const result: ScoreWeights = { ...currentWeights };

  (Object.keys(target) as (keyof ScoreWeights)[]).forEach((key) => {
    const from = currentWeights[key];
    const to = target[key];
    const blended = from * (1 - blendRatio) + to * blendRatio;
    if (Math.abs(blended - from) > 0.005) {
      result[key] = blended;
      adjustments.push({
        dimension: key,
        fromWeight: from,
        toWeight: blended,
        reason: explainRegimeAdjustment(key, regime),
      });
    }
  });

  return { weights: result, adjustments };
}

function explainRegimeAdjustment(
  dim: keyof ScoreWeights,
  regime: MarketRegime,
): string {
  if (regime === "trending") {
    return {
      technical: "趋势市：MA/MACD 等技术面指标最有效",
      divergence: "趋势市：背离信号偏少，权重适度下调",
      liquidity: "趋势市：流动性仍可作为辅助过滤",
      timeframe: "趋势市：多周期共振能确认趋势强度",
      sentiment: "趋势市：情绪延续性强，权重中性",
    }[dim];
  }
  if (regime === "ranging") {
    return {
      technical: "震荡市：技术指标易钝化，权重降低",
      divergence: "震荡市：背离用于抓反转，权重提升",
      liquidity: "震荡市：流动性区间识别支撑压力",
      timeframe: "震荡市：多周期共振弱化",
      sentiment: "震荡市：情绪反转信号关键",
    }[dim];
  }
  if (regime === "volatile") {
    return {
      technical: "高波动：技术面假突破多，权重降低",
      divergence: "高波动：背离是反转关键信号",
      liquidity: "高波动：流动性真空加剧波动",
      timeframe: "高波动：大周期方向更稳定",
      sentiment: "高波动：情绪恐慌/贪婪反转点",
    }[dim];
  }
  return "数据不足，维持默认权重";
}

// ============ 主入口 ============

/**
 * 完整分析流程：特征提取 -> 状态分类 -> 权重建议
 */
export function analyzeMarketRegime(
  candles: Candle[],
  currentWeights: ScoreWeights,
): MarketRegimeReport {
  const features = extractMarketFeatures(candles);
  const { regime, confidence } = classifyRegime(features);
  const { weights, adjustments } = recommendWeights(regime, currentWeights, confidence);

  return {
    regime,
    confidence: Math.round(confidence),
    features,
    recommendedWeights: weights,
    adjustments,
    summary: buildRegimeSummary(regime, features, confidence),
    detectedAt: Math.floor(Date.now() / 1000),
  };
}

function buildRegimeSummary(
  regime: MarketRegime,
  features: MarketFeatures,
  confidence: number,
): string {
  const direction = features.trendSlope > 0.1 ? "向上" : features.trendSlope < -0.1 ? "向下" : "横盘";
  if (regime === "trending") {
    return `检测到 ${direction} 趋势市（强度 ${features.adx.toFixed(0)}），适合顺势策略`;
  }
  if (regime === "ranging") {
    return `检测到震荡市（ADX ${features.adx.toFixed(0)}），价格在区间内运行`;
  }
  if (regime === "volatile") {
    return `检测到高波动市（波动率 ${features.volatility.toFixed(0)}），建议提高门槛`;
  }
  return `市场数据不足（信心度 ${confidence.toFixed(0)}%），使用默认权重`;
}

// ============ 信号置信度调整 ============

/**
 * 根据市场状态调整信号置信度门槛
 * 高波动 -> 提高门槛；趋势 -> 适当降低；震荡 -> 中性
 */
export function adjustConfidenceThreshold(
  baseThreshold: number,
  regime: MarketRegime,
  volatility: number,
): number {
  let adjustment = 0;
  if (regime === "volatile") adjustment += 8;
  else if (regime === "trending") adjustment -= 3;
  else if (regime === "ranging") adjustment += 2;

  // 波动率加成
  if (volatility > 80) adjustment += 5;
  else if (volatility < 20) adjustment -= 2;

  return Math.max(30, Math.min(90, baseThreshold + adjustment));
}
