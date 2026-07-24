/**
 * AI 策略增强相关类型定义
 */
import type { ScoreWeights, SignalScore, TradeHistory, TradingConfig } from "@/types";
import type {
  MarketRegime,
  MarketFeatures,
  RegimeAdjustment,
} from "@/lib/strategy/marketRegime";
import type {
  ParamKey,
  ParamRecommendation,
} from "@/lib/strategy/parameterOptimizer";
import type {
  AttributionFactor,
  TradeAttribution,
  BatchAttribution,
} from "@/lib/strategy/tradeAttributor";

// 重新导出 AI 模块类型
export type {
  MarketRegime,
  MarketFeatures,
  RegimeAdjustment,
  ParamKey,
  ParamRecommendation,
  AttributionFactor,
  TradeAttribution,
  BatchAttribution,
};

// AI 状态总览
export interface AIStrategyState {
  enabled: boolean;             // AI 增强总开关
  autoApplyRegime: boolean;     // 是否自动应用市场环境权重建议
  autoApplyParams: boolean;     // 是否自动应用参数优化建议

  // 市场环境
  regime: MarketRegime;
  regimeConfidence: number;
  regimeFeatures: MarketFeatures | null;
  regimeSummary: string;
  regimeAdjustments: RegimeAdjustment[];
  regimeWeights: ScoreWeights;
  regimeDetectedAt: number | null;

  // 参数优化
  paramRecommendations: ParamRecommendation[];
  paramOverallConfidence: number;
  paramSummary: string;
  paramGeneratedAt: number | null;
  appliedParamKeys: ParamKey[];     // 已应用的参数

  // 智能归因
  lastAttribution: TradeAttribution | null;
  batchAttribution: BatchAttribution | null;
  attributionHistory: TradeAttribution[];

  // 元数据
  lastAnalysisAt: number | null;
  totalAnalyses: number;
}

// AI 输入数据
export interface AIAnalysisInput {
  candles?: import("@/types").Candle[];
  trades: TradeHistory[];
  signal: SignalScore | null;
  currentWeights: ScoreWeights;
  currentConfig: TradingConfig;
  dimensionStats: import("@/types").DimensionStats;
}
