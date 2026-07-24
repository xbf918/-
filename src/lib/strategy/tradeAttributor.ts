/**
 * AI 智能原因分析模块（交易归因引擎）
 *
 * 对每笔交易进行多维度归因分析：
 * 1. 识别主因（哪个信号维度误导了交易）
 * 2. 识别次因（环境/参数/执行等因素）
 * 3. 生成自然语言解释 + 改进建议
 *
 * 输出按权重排序的归因因子列表（每个因子包含维度、贡献度、解释）。
 */
import type {
  DimensionStats,
  ScoreWeights,
  SignalScore,
  TradeHistory,
} from "@/types";
import type { MarketFeatures, MarketRegime } from "./marketRegime";

export type AttributionDimension =
  | keyof ScoreWeights
  | "regime"
  | "param"
  | "execution"
  | "luck";

export interface AttributionFactor {
  dimension: AttributionDimension;
  impact: number;        // -100 ~ +100  负值=不利因子，正值=有利因子
  confidence: number;     // 0-100
  description: string;   // 中文自然语言解释
  suggestion?: string;   // 改进建议
}

export interface TradeAttribution {
  tradeId: string;
  isWin: boolean;
  pnl: number;
  pnlPercent: number;
  primaryFactor: AttributionFactor;    // 主因（impact 绝对值最大）
  secondaryFactors: AttributionFactor[]; // 次因
  helpfulFactors: AttributionFactor[];   // 有利因子（impact > 0）
  harmfulFactors: AttributionFactor[];   // 不利因子（impact < 0）
  overallAssessment: string;
  lessonLearned: string;
  generatedAt: number;
}

// ============ 维度归一化辅助 ============

function normImpact(value: number, scale: number): number {
  // 将任意数值映射到 -100 ~ +100
  return Math.max(-100, Math.min(100, (value / scale) * 100));
}

// ============ 因子识别 ============

interface AttribInputs {
  trade: TradeHistory;
  signal: SignalScore | null;
  stats: DimensionStats;
  weights: ScoreWeights;
  regime?: MarketRegime;
  features?: MarketFeatures;
}

/**
 * 1. 信号维度归因
 * 分析当时信号各维度的得分，找出与结果最相关的维度
 */
function attributeSignalDimensions(
  trade: TradeHistory,
  signal: SignalScore | null,
  stats: DimensionStats,
): AttributionFactor[] {
  if (!signal) {
    return [{
      dimension: "execution",
      impact: 0,
      confidence: 30,
      description: "交易时无信号快照，归因信息有限",
      suggestion: "建议在开仓时记录 SignalScore，便于后续归因分析",
    }];
  }

  const isWin = trade.pnl >= 0;
  const factors: AttributionFactor[] = [];

  // 计算每个维度当时得分与历史胜率的不一致度
  // 如果胜率<45% 的维度在信号中得分高 -> 误导因子
  // 如果胜率>55% 的维度在信号中得分低 -> 错失机会
  const componentMap: Record<string, keyof ScoreWeights> = {
    technical: "technical",
    liquidity: "liquidity",
    divergence: "divergence",
    sentiment: "sentiment",
    timeframe: "timeframe",
    patterns: "technical",   // patterns 归到 technical 体系
  };

  Object.entries(signal.components).forEach(([compKey, value]) => {
    const dim = componentMap[compKey] || "technical";
    const stat = stats[dim];
    const sampleSize = stat.wins + stat.losses;

    if (sampleSize < 3) return; // 样本不足，跳过

    // 信号得分高（>60）但实际亏损 -> 误导
    // 信号得分低（<40）但实际盈利 -> 反而帮了忙
    let impact = 0;
    let desc = "";
    let suggestion: string | undefined;

    if (isWin && value < 50 && stat.winRate > 55) {
      // 盈利 + 维度历史胜率高 + 信号分低 -> 该维度不背锅
      impact = normImpact(50 - value, 100);
      desc = `${compKey} 维度历史胜率 ${stat.winRate.toFixed(0)}%，但当时信号仅 ${value} 分，未充分贡献`;
    } else if (!isWin && value > 50 && stat.winRate < 45) {
      // 亏损 + 维度历史胜率低 + 信号分高 -> 误导
      impact = -normImpact(value - 50, 50);
      desc = `${compKey} 维度历史胜率仅 ${stat.winRate.toFixed(0)}%，当时信号分 ${value} 偏高，误导开仓`;
      suggestion = `考虑降低 ${compKey} 权重或提高其信号门槛`;
    } else if (isWin && value > 60 && stat.winRate > 50) {
      // 盈利 + 高分 + 高胜率 -> 正向因子
      impact = normImpact(value, 100);
      desc = `${compKey} 维度信号分 ${value} 强劲，且历史胜率 ${stat.winRate.toFixed(0)}%，助益本次盈利`;
    }

    if (desc) {
      factors.push({
        dimension: compKey as AttributionDimension,
        impact,
        confidence: Math.min(95, sampleSize * 8),
        description: desc,
        suggestion,
      });
    }
  });

  return factors;
}

/**
 * 2. 市场环境归因
 * 检查交易时市场状态是否对结果产生影响
 */
function attributeRegime(
  trade: TradeHistory,
  regime: MarketRegime | undefined,
  features: MarketFeatures | undefined,
): AttributionFactor[] {
  if (!regime || !features) {
    return [{
      dimension: "regime",
      impact: 0,
      confidence: 20,
      description: "缺少市场环境数据，无法归因",
    }];
  }

  const isWin = trade.pnl >= 0;
  const factors: AttributionFactor[] = [];

  // 方向一致性
  if (regime === "trending") {
    if (features.trendSlope > 0.1 && trade.side === "long") {
      factors.push({
        dimension: "regime",
        impact: isWin ? 30 : 5,
        confidence: 80,
        description: "上升趋势中做多，方向与市场一致",
        suggestion: isWin ? undefined : "顺势但仍亏损，可能为入场点位不佳",
      });
    } else if (features.trendSlope < -0.1 && trade.side === "short") {
      factors.push({
        dimension: "regime",
        impact: isWin ? 30 : 5,
        confidence: 80,
        description: "下降趋势中做空，方向与市场一致",
        suggestion: isWin ? undefined : "顺势但仍亏损，可能为入场点位不佳",
      });
    } else if (Math.abs(features.trendSlope) > 0.3) {
      factors.push({
        dimension: "regime",
        impact: isWin ? -20 : -40,
        confidence: 75,
        description: `强趋势市逆势开仓（趋势斜率 ${features.trendSlope.toFixed(2)}）`,
        suggestion: "趋势市中避免逆势，建议顺势或观望",
      });
    }
  }

  if (regime === "volatile") {
    factors.push({
      dimension: "regime",
      impact: isWin ? -10 : -30,
      confidence: 70,
      description: "高波动市场，止损/止盈容易被扫",
      suggestion: "高波动市建议提高信号门槛或降低杠杆",
    });
  }

  if (regime === "ranging" && Math.abs(features.rangePosition - 50) < 15) {
    factors.push({
      dimension: "regime",
      impact: isWin ? 10 : 5,
      confidence: 60,
      description: "震荡市且价格在区间中部，方向性弱",
      suggestion: "震荡市避免追单，等待区间边界确认",
    });
  }

  return factors;
}

/**
 * 3. 执行/参数归因
 * 通过盈亏比、持仓时间等推断执行质量
 */
function attributeExecution(trade: TradeHistory): AttributionFactor[] {
  const factors: AttributionFactor[] = [];
  const absPnlPct = Math.abs(trade.pnlPercent);
  const holdingMs = trade.closeTime - trade.openTime;
  const holdingMin = holdingMs / 60;

  // 极短持仓亏损 -> 可能追涨杀跌
  if (trade.pnl < 0 && holdingMin < 5) {
    factors.push({
      dimension: "execution",
      impact: -50,
      confidence: 75,
      description: `持仓仅 ${holdingMin.toFixed(1)} 分钟即亏损，可能为冲动追单`,
      suggestion: "设置冷静期，开仓前等待 1-2 根 K 线确认",
    });
  }

  // 极小盈利 + 长持仓 -> 利润未放大
  if (trade.pnl > 0 && trade.pnlPercent < 0.3 && holdingMin > 60) {
    factors.push({
      dimension: "execution",
      impact: -15,
      confidence: 50,
      description: `持仓 ${holdingMin.toFixed(0)} 分钟仅获利 ${trade.pnlPercent.toFixed(2)}%，盈亏比偏低`,
      suggestion: "考虑放大止盈或启用移动止损",
    });
  }

  // 亏损幅度异常大
  if (trade.pnl < 0 && absPnlPct > 8) {
    factors.push({
      dimension: "param",
      impact: -60,
      confidence: 80,
      description: `单笔亏损达 ${absPnlPct.toFixed(1)}%，远超常规止损`,
      suggestion: "检查止损设置是否生效，或考虑降低杠杆",
    });
  }

  // 持仓时间过长的盈利单
  if (trade.pnl > 0 && holdingMin > 60 * 24 * 3) {
    factors.push({
      dimension: "execution",
      impact: -10,
      confidence: 40,
      description: `盈利单持仓超过 3 天，资金效率低`,
      suggestion: "考虑缩短持仓周期以提高资金周转",
    });
  }

  return factors;
}

/**
 * 4. 运气/随机性归因
 * 当其它因子都不显著时，标记为随机性
 */
function attributeLuck(
  trade: TradeHistory,
  signal: SignalScore | null,
): AttributionFactor[] {
  const isWin = trade.pnl >= 0;
  const signalConf = signal?.confidence ?? 50;

  // 低信心度 + 盈利 = 运气
  if (isWin && signalConf < 50) {
    return [{
      dimension: "luck",
      impact: 30,
      confidence: 40,
      description: "信号信心度不高但盈利，含有运气成分",
    }];
  }

  // 高信心度 + 亏损 = 反向运气
  if (!isWin && signalConf > 70) {
    return [{
      dimension: "luck",
      impact: -25,
      confidence: 40,
      description: "高信心信号仍亏损，可能遇到黑天鹅/滑点",
    }];
  }

  return [];
}

// ============ 主入口 ============

export function analyzeTradeAttribution(
  trade: TradeHistory,
  signal: SignalScore | null,
  stats: DimensionStats,
  weights: ScoreWeights,
  regime?: MarketRegime,
  features?: MarketFeatures,
): TradeAttribution {
  const inputs: AttribInputs = { trade, signal, stats, weights, regime, features };

  const factors: AttributionFactor[] = [
    ...attributeSignalDimensions(trade, signal, stats),
    ...attributeRegime(trade, regime, features),
    ...attributeExecution(trade),
    ...attributeLuck(trade, signal),
  ];

  // 排序：按 |impact| 降序
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const primaryFactor = factors[0] || {
    dimension: "execution" as AttributionDimension,
    impact: 0,
    confidence: 0,
    description: "无法识别主要因子",
  };

  const secondaryFactors = factors.slice(1);
  const helpfulFactors = factors.filter((f) => f.impact > 0);
  const harmfulFactors = factors.filter((f) => f.impact < 0);

  return {
    tradeId: trade.id,
    isWin: trade.pnl >= 0,
    pnl: trade.pnl,
    pnlPercent: trade.pnlPercent,
    primaryFactor,
    secondaryFactors,
    helpfulFactors,
    harmfulFactors,
    overallAssessment: buildOverallAssessment(trade, primaryFactor, helpfulFactors, harmfulFactors),
    lessonLearned: buildLessonLearned(trade, primaryFactor, factors),
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

function buildOverallAssessment(
  trade: TradeHistory,
  primary: AttributionFactor,
  helpful: AttributionFactor[],
  harmful: AttributionFactor[],
): string {
  const verdict = trade.pnl >= 0 ? "盈利" : "亏损";
  const sign = trade.pnl >= 0 ? "+" : "";
  return `本次${verdict} ${sign}${trade.pnlPercent.toFixed(2)}%。主因：${primary.description}。` +
    `共识别 ${helpful.length} 个有利因子、${harmful.length} 个不利因子。`;
}

function buildLessonLearned(
  trade: TradeHistory,
  primary: AttributionFactor,
  factors: AttributionFactor[],
): string {
  if (primary.suggestion) return primary.suggestion;
  if (trade.pnl >= 0) {
    return "本次决策要素有效，可作为同类信号的参考模板";
  }
  // 综合多个因子生成教训
  const harmful = factors.filter((f) => f.impact < 0).slice(0, 2);
  if (harmful.length === 0) return "亏损幅度有限，无需特别调整";
  return harmful.map((f) => f.description).join("；");
}

// ============ 批量分析 ============

/**
 * 对最近 N 笔交易进行批量归因
 * 汇总主要问题维度
 */
export interface BatchAttribution {
  totalAnalyzed: number;
  winCount: number;
  lossCount: number;
  topHarmfulDimensions: Array<{ dimension: AttributionDimension; count: number; avgImpact: number }>;
  topHelpfulDimensions: Array<{ dimension: AttributionDimension; count: number; avgImpact: number }>;
  commonLesson: string;
  generatedAt: number;
}

export function analyzeBatchAttribution(
  attributions: TradeAttribution[],
): BatchAttribution {
  if (attributions.length === 0) {
    return {
      totalAnalyzed: 0,
      winCount: 0,
      lossCount: 0,
      topHarmfulDimensions: [],
      topHelpfulDimensions: [],
      commonLesson: "暂无归因数据",
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }

  const dimAgg = new Map<AttributionDimension, { count: number; totalImpact: number }>();

  for (const attr of attributions) {
    for (const factor of [...attr.helpfulFactors, ...attr.harmfulFactors]) {
      const cur = dimAgg.get(factor.dimension) || { count: 0, totalImpact: 0 };
      cur.count++;
      cur.totalImpact += factor.impact;
      dimAgg.set(factor.dimension, cur);
    }
  }

  const all = Array.from(dimAgg.entries()).map(([dimension, agg]) => ({
    dimension,
    count: agg.count,
    avgImpact: agg.totalImpact / agg.count,
  }));

  const topHarmful = all
    .filter((x) => x.avgImpact < 0)
    .sort((a, b) => a.avgImpact - b.avgImpact)
    .slice(0, 3);

  const topHelpful = all
    .filter((x) => x.avgImpact > 0)
    .sort((a, b) => b.avgImpact - a.avgImpact)
    .slice(0, 3);

  const winCount = attributions.filter((a) => a.isWin).length;
  const lossCount = attributions.length - winCount;

  return {
    totalAnalyzed: attributions.length,
    winCount,
    lossCount,
    topHarmfulDimensions: topHarmful,
    topHelpfulDimensions: topHelpful,
    commonLesson: buildCommonLesson(topHarmful, lossCount, attributions.length),
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

function buildCommonLesson(
  topHarmful: Array<{ dimension: AttributionDimension; count: number; avgImpact: number }>,
  lossCount: number,
  total: number,
): string {
  if (topHarmful.length === 0) return "未发现显著不利因子，继续保持";
  const top = topHarmful[0];
  return `近期 ${lossCount}/${total} 笔亏损中，${top.dimension} 维度贡献最多负面影响（出现 ${top.count} 次），建议优先优化该维度`;
}
