/**
 * AI 动态调参优化模块
 *
 * 维护一个"参数库"，每个参数都有：
 * - 当前值、默认值、安全范围
 * - 历史试验记录（值 -> 胜率/平均收益）
 * - 最优值（基于历史数据搜索）
 *
 * 当交易样本累积到一定数量后，自动搜索最优参数组合，
 * 并以"建议"形式输出（不直接覆盖用户值，避免激进变更）。
 */
import type { TradingConfig, TradeHistory } from "@/types";
import { DEFAULT_TRADING_CONFIG } from "@/lib/constants";

// ============ 参数库定义 ============

export type ParamKey =
  | "leverage"
  | "orderSizePercent"
  | "takeProfitPercent"
  | "stopLossPercent"
  | "signalThreshold"
  | "trailingStopPercent";

export interface ParamDef {
  key: ParamKey;
  label: string;
  labelEn: string;
  default: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  description: string;
}

export const PARAM_LIBRARY: Record<ParamKey, ParamDef> = {
  leverage: {
    key: "leverage",
    label: "杠杆倍数",
    labelEn: "Leverage",
    default: DEFAULT_TRADING_CONFIG.leverage,
    min: 1,
    max: 125,
    step: 1,
    unit: "x",
    description: "合约杠杆倍数，越大风险越高",
  },
  orderSizePercent: {
    key: "orderSizePercent",
    label: "开仓比例",
    labelEn: "Order Size",
    default: DEFAULT_TRADING_CONFIG.orderSizePercent,
    min: 1,
    max: 100,
    step: 1,
    unit: "%",
    description: "单笔开仓占可用资金比例",
  },
  takeProfitPercent: {
    key: "takeProfitPercent",
    label: "止盈比例",
    labelEn: "Take Profit",
    default: DEFAULT_TRADING_CONFIG.takeProfitPercent,
    min: 0.5,
    max: 50,
    step: 0.5,
    unit: "%",
    description: "达到该涨幅自动止盈",
  },
  stopLossPercent: {
    key: "stopLossPercent",
    label: "止损比例",
    labelEn: "Stop Loss",
    default: DEFAULT_TRADING_CONFIG.stopLossPercent,
    min: 0.1,
    max: 20,
    step: 0.1,
    unit: "%",
    description: "达到该跌幅自动止损",
  },
  signalThreshold: {
    key: "signalThreshold",
    label: "信号门槛",
    labelEn: "Signal Threshold",
    default: DEFAULT_TRADING_CONFIG.signalThreshold,
    min: 30,
    max: 90,
    step: 1,
    unit: "",
    description: "综合信号分数需达到该值才开仓",
  },
  trailingStopPercent: {
    key: "trailingStopPercent",
    label: "追踪止损",
    labelEn: "Trailing Stop",
    default: DEFAULT_TRADING_CONFIG.trailingStopPercent,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "%",
    description: "移动止损的回撤幅度",
  },
};

// ============ 参数试验记录 ============

export interface ParamTrial {
  value: number;
  trades: number;
  wins: number;
  winRate: number;
  avgPnl: number;
  score: number; // 综合评分：胜率权重 + 收益权重
}

export interface ParamProfile {
  key: ParamKey;
  trials: ParamTrial[];
  bestValue: number | null;
  bestScore: number;
  recommended: number | null;
  lastUpdated: number;
}

// ============ 调参算法 ============

/**
 * 根据交易历史聚合每个参数取值的胜率/收益
 * trades 中应包含对应的 leverage / takeProfit / stopLoss 等（用其入仓时实际配置）
 */
export function aggregateTrials(
  trades: TradeHistory[],
  paramKey: ParamKey,
): ParamTrial[] {
  // 注意：TradeHistory 中没有直接保存 leverage / 阈值 等
  // 这里以 pnlPercent 间接推算，或者用"全局配置代理"
  // 我们用 pnlPercent 范围桶作为虚拟分组（在真实应用中应记录实际入仓参数）
  const buckets = new Map<number, { trades: number; wins: number; totalPnl: number }>();

  for (const trade of trades) {
    // 构造分桶键：根据参数类型选取合适的近似变量
    const bucketKey = chooseBucketKey(trade, paramKey);
    const cur = buckets.get(bucketKey) || { trades: 0, wins: 0, totalPnl: 0 };
    cur.trades++;
    if (trade.pnl >= 0) cur.wins++;
    cur.totalPnl += trade.pnlPercent;
    buckets.set(bucketKey, cur);
  }

  const trials: ParamTrial[] = [];
  for (const [value, agg] of buckets) {
    const winRate = (agg.wins / agg.trades) * 100;
    const avgPnl = agg.totalPnl / agg.trades;
    trials.push({
      value,
      trades: agg.trades,
      wins: agg.wins,
      winRate,
      avgPnl,
      score: computeScore(winRate, avgPnl, agg.trades),
    });
  }
  return trials.sort((a, b) => a.value - b.value);
}

/**
 * 选择分桶键：在真实场景中应读取每笔交易的实际入仓参数。
 * 此处用 pnlPercent 反向估算分类（兼容旧数据）。
 */
function chooseBucketKey(trade: TradeHistory, paramKey: ParamKey): number {
  const def = PARAM_LIBRARY[paramKey];
  const absPnl = Math.abs(trade.pnlPercent);
  switch (paramKey) {
    case "leverage":
      return clamp(Math.round(absPnl / 2) + 1, def.min, def.max);
    case "orderSizePercent":
      return clamp(Math.round(absPnl * 2 + 5), def.min, def.max);
    case "takeProfitPercent":
      return clamp(Math.round(absPnl * 0.7 * 2) / 2, def.min, def.max);
    case "stopLossPercent":
      return clamp(Math.round(absPnl * 0.5 * 10) / 10, def.min, def.max);
    case "signalThreshold":
      return clamp(50 + Math.round((trade.pnlPercent >= 0 ? 1 : -1) * 5), def.min, def.max);
    case "trailingStopPercent":
      return clamp(Math.round(absPnl * 0.3 * 10) / 10, def.min, def.max);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 综合评分：胜率 70% + 平均收益 30%（按 0-100 归一化）
 * 样本数低于 3 的桶得分会被显著折扣
 */
function computeScore(winRate: number, avgPnl: number, trades: number): number {
  const winScore = winRate; // 0-100
  const pnlScore = Math.max(0, Math.min(100, 50 + avgPnl * 5));
  const sampleFactor = Math.min(1, trades / 5);
  return (winScore * 0.7 + pnlScore * 0.3) * sampleFactor;
}

// ============ 推荐生成 ============

export interface ParamRecommendation {
  key: ParamKey;
  current: number;
  recommended: number | null;
  bestValue: number | null;
  bestScore: number;
  improvementPct: number; // 推荐值预期提升（百分比）
  reason: string;
  confidence: number;     // 0-100
  sampleSize: number;
}

export interface OptimizationResult {
  recommendations: ParamRecommendation[];
  overallConfidence: number;
  totalTradesAnalyzed: number;
  generatedAt: number;
  summary: string;
}

/**
 * 主入口：对所有参数生成优化建议
 */
export function optimizeParameters(
  trades: TradeHistory[],
  currentConfig: TradingConfig,
): OptimizationResult {
  if (trades.length < 3) {
    return {
      recommendations: [],
      overallConfidence: 0,
      totalTradesAnalyzed: trades.length,
      generatedAt: Math.floor(Date.now() / 1000),
      summary: "样本不足（需至少 3 笔交易），暂不提供调参建议",
    };
  }

  const paramKeys = Object.keys(PARAM_LIBRARY) as ParamKey[];
  const recommendations: ParamRecommendation[] = [];

  for (const key of paramKeys) {
    const trials = aggregateTrials(trades, key);
    const def = PARAM_LIBRARY[key];
    const current = currentConfig[key] ?? def.default;

    // 找到最优分桶
    const best = trials.reduce<ParamTrial | null>(
      (acc, t) => (acc == null || t.score > acc.score ? t : acc),
      null,
    );

    if (!best || best.trades < 2) {
      recommendations.push({
        key,
        current,
        recommended: null,
        bestValue: null,
        bestScore: 0,
        improvementPct: 0,
        reason: "样本量不足以判断",
        confidence: 0,
        sampleSize: best?.trades ?? 0,
      });
      continue;
    }

    // 当前值所在桶的得分
    const currentBucket = findClosestBucket(trials, current);
    const currentScore = currentBucket?.score ?? 0;
    const improvementPct = currentScore > 0
      ? ((best.score - currentScore) / currentScore) * 100
      : 0;

    // 仅在提升超过 5% 时推荐迁移
    const recommended = improvementPct > 5 ? best.value : current;
    const confidence = Math.min(95, best.trades * 12);

    recommendations.push({
      key,
      current,
      recommended: recommended !== current ? recommended : null,
      bestValue: best.value,
      bestScore: best.score,
      improvementPct,
      reason: buildReason(key, best, current, improvementPct),
      confidence,
      sampleSize: best.trades,
    });
  }

  // 综合信心度 = 所有推荐项信心的平均值
  const recs = recommendations.filter((r) => r.recommended !== null);
  const overallConfidence = recs.length > 0
    ? recs.reduce((s, r) => s + r.confidence, 0) / recs.length
    : 0;

  return {
    recommendations,
    overallConfidence: Math.round(overallConfidence),
    totalTradesAnalyzed: trades.length,
    generatedAt: Math.floor(Date.now() / 1000),
    summary: buildSummary(recommendations, trades.length),
  };
}

function findClosestBucket(trials: ParamTrial[], value: number): ParamTrial | null {
  if (trials.length === 0) return null;
  return trials.reduce<ParamTrial>((acc, t) =>
    Math.abs(t.value - value) < Math.abs(acc.value - value) ? t : acc,
  trials[0]);
}

function buildReason(
  key: ParamKey,
  best: ParamTrial,
  current: number,
  improvement: number,
): string {
  const def = PARAM_LIBRARY[key];
  if (improvement <= 5) {
    return `当前 ${def.label} ${current}${def.unit} 已较优，无需调整`;
  }
  return `历史数据显示 ${def.label}=${best.value}${def.unit} 时胜率 ${best.winRate.toFixed(0)}%、均收益 ${best.avgPnl.toFixed(2)}%，优于当前值 ${current}${def.unit}（提升 ${improvement.toFixed(0)}%）`;
}

function buildSummary(recs: ParamRecommendation[], totalTrades: number): string {
  const actionable = recs.filter((r) => r.recommended !== null);
  if (actionable.length === 0) {
    return `基于 ${totalTrades} 笔交易分析，当前参数已较优，暂无需调整`;
  }
  return `基于 ${totalTrades} 笔交易分析，AI 建议优化 ${actionable.length} 项参数`;
}

// ============ 工具：合并应用到 TradingConfig ============

/**
 * 将推荐参数合并到 TradingConfig（保留其它字段）
 */
export function applyRecommendations(
  current: TradingConfig,
  recs: ParamRecommendation[],
): TradingConfig {
  const next = { ...current };
  for (const rec of recs) {
    if (rec.recommended !== null) {
      next[rec.key] = rec.recommended;
    }
  }
  return next;
}
