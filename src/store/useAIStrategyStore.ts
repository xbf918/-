/**
 * AI 策略增强 Store
 *
 * 集成三大 AI 模块：
 * 1. 市场环境识别（marketRegime） - 自动识别趋势/震荡/高波动
 * 2. 动态调参优化（parameterOptimizer） - 基于历史交易优化参数
 * 3. 智能原因分析（tradeAttributor） - 交易归因引擎
 *
 * 配合 useStrategyLearningStore 一起工作，提供 AI 驱动的策略建议。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ScoreWeights,
  TradingConfig,
  TradeHistory,
  SignalScore,
  DimensionStats,
  Candle,
} from "@/types";
import type { AIStrategyState } from "@/types/ai";
import type { ParamKey } from "@/lib/strategy/parameterOptimizer";
import {
  analyzeMarketRegime,
  type MarketRegime,
  type MarketFeatures,
  type RegimeAdjustment,
} from "@/lib/strategy/marketRegime";
import {
  optimizeParameters,
  applyRecommendations,
  type ParamRecommendation,
} from "@/lib/strategy/parameterOptimizer";
import {
  analyzeTradeAttribution,
  analyzeBatchAttribution,
  type TradeAttribution,
  type BatchAttribution,
} from "@/lib/strategy/tradeAttributor";

interface AIStrategyActions {
  setEnabled: (enabled: boolean) => void;
  setAutoApplyRegime: (auto: boolean) => void;
  setAutoApplyParams: (auto: boolean) => void;
  resetAIState: () => void;

  // 分析入口
  runFullAnalysis: (input: {
    candles?: Candle[];
    trades: TradeHistory[];
    signal: SignalScore | null;
    currentWeights: ScoreWeights;
    currentConfig: TradingConfig;
    dimensionStats: DimensionStats;
  }) => void;

  // 单独方法
  analyzeRegime: (candles: Candle[], currentWeights: ScoreWeights) => void;
  optimizeParams: (trades: TradeHistory[], currentConfig: TradingConfig) => void;
  attributeTrade: (
    trade: TradeHistory,
    signal: SignalScore | null,
    dimensionStats: DimensionStats,
    currentWeights: ScoreWeights,
    regime?: MarketRegime,
    features?: MarketFeatures,
  ) => TradeAttribution;
  refreshBatchAttribution: () => void;

  // 应用建议
  applyRegimeWeights: () => ScoreWeights | null;
  applyParamRecommendations: () => TradingConfig | null;
  applyParam: (key: ParamKey) => number | null;

  // 获取方法
  getActiveWeights: (baseWeights: ScoreWeights) => ScoreWeights;
  getAdjustedThreshold: (baseThreshold: number) => number;
}

type AIStrategyStore = AIStrategyState & AIStrategyActions;

const AI_KEY = "crytopulse-ai-strategy";

const initialState: AIStrategyState = {
  enabled: false,
  autoApplyRegime: false,
  autoApplyParams: false,
  regime: "unknown",
  regimeConfidence: 0,
  regimeFeatures: null,
  regimeSummary: "",
  regimeAdjustments: [],
  regimeWeights: { technical: 0.3, divergence: 0.2, liquidity: 0.2, timeframe: 0.2, sentiment: 0.1 },
  regimeDetectedAt: null,
  paramRecommendations: [],
  paramOverallConfidence: 0,
  paramSummary: "",
  paramGeneratedAt: null,
  appliedParamKeys: [],
  lastAttribution: null,
  batchAttribution: null,
  attributionHistory: [],
  lastAnalysisAt: null,
  totalAnalyses: 0,
};

export const useAIStrategyStore = create<AIStrategyStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setEnabled: (enabled) => set({ enabled }),
      setAutoApplyRegime: (auto) => set({ autoApplyRegime: auto }),
      setAutoApplyParams: (auto) => set({ autoApplyParams: auto }),

      resetAIState: () => set({ ...initialState, enabled: get().enabled }),

      runFullAnalysis: (input) => {
        const state = get();
        if (!state.enabled) return;

        // 1. 市场环境识别
        let regimeReport = null;
        if (input.candles && input.candles.length >= 30) {
          regimeReport = analyzeMarketRegime(input.candles, input.currentWeights);
        }

        // 2. 参数优化
        const optResult = optimizeParameters(input.trades, input.currentConfig);

        // 3. 批量归因（基于历史 attribution）
        const batchAttr = state.attributionHistory.length > 0
          ? analyzeBatchAttribution(state.attributionHistory.slice(-20))
          : state.batchAttribution;

        // 决定是否自动应用
        const newRegimeWeights = (regimeReport && state.autoApplyRegime)
          ? regimeReport.recommendedWeights
          : state.regimeWeights;

        const newAppliedParamKeys = state.autoApplyParams
          ? optResult.recommendations
              .filter((r) => r.recommended !== null && r.recommended !== r.current)
              .map((r) => r.key)
          : state.appliedParamKeys;

        set({
          regime: regimeReport?.regime ?? state.regime,
          regimeConfidence: regimeReport?.confidence ?? state.regimeConfidence,
          regimeFeatures: regimeReport?.features ?? state.regimeFeatures,
          regimeSummary: regimeReport?.summary ?? state.regimeSummary,
          regimeAdjustments: regimeReport?.adjustments ?? state.regimeAdjustments,
          regimeWeights: newRegimeWeights,
          regimeDetectedAt: regimeReport?.detectedAt ?? state.regimeDetectedAt,
          paramRecommendations: optResult.recommendations,
          paramOverallConfidence: optResult.overallConfidence,
          paramSummary: optResult.summary,
          paramGeneratedAt: optResult.generatedAt,
          appliedParamKeys: newAppliedParamKeys,
          batchAttribution: batchAttr,
          lastAnalysisAt: Math.floor(Date.now() / 1000),
          totalAnalyses: state.totalAnalyses + 1,
        });
      },

      analyzeRegime: (candles, currentWeights) => {
        if (candles.length < 30) return;
        const report = analyzeMarketRegime(candles, currentWeights);
        const state = get();
        set({
          regime: report.regime,
          regimeConfidence: report.confidence,
          regimeFeatures: report.features,
          regimeSummary: report.summary,
          regimeAdjustments: report.adjustments,
          regimeWeights: state.autoApplyRegime
            ? report.recommendedWeights
            : state.regimeWeights,
          regimeDetectedAt: report.detectedAt,
          lastAnalysisAt: Math.floor(Date.now() / 1000),
          totalAnalyses: state.totalAnalyses + 1,
        });
      },

      optimizeParams: (trades, currentConfig) => {
        const result = optimizeParameters(trades, currentConfig);
        const state = get();
        set({
          paramRecommendations: result.recommendations,
          paramOverallConfidence: result.overallConfidence,
          paramSummary: result.summary,
          paramGeneratedAt: result.generatedAt,
          appliedParamKeys: state.autoApplyParams
            ? result.recommendations
                .filter((r) => r.recommended !== null && r.recommended !== r.current)
                .map((r) => r.key)
            : state.appliedParamKeys,
          lastAnalysisAt: Math.floor(Date.now() / 1000),
          totalAnalyses: state.totalAnalyses + 1,
        });
      },

      attributeTrade: (trade, signal, dimensionStats, currentWeights, regime, features) => {
        const attr = analyzeTradeAttribution(
          trade, signal, dimensionStats, currentWeights, regime, features,
        );
        const state = get();
        const newHistory = [...state.attributionHistory, attr].slice(-50);
        const batchAttr = newHistory.length >= 3
          ? analyzeBatchAttribution(newHistory.slice(-20))
          : state.batchAttribution;
        set({
          lastAttribution: attr,
          attributionHistory: newHistory,
          batchAttribution: batchAttr,
        });
        return attr;
      },

      refreshBatchAttribution: () => {
        const state = get();
        if (state.attributionHistory.length < 3) return;
        const batchAttr = analyzeBatchAttribution(state.attributionHistory.slice(-20));
        set({ batchAttribution: batchAttr });
      },

      applyRegimeWeights: () => {
        const state = get();
        if (state.regime === "unknown") return null;
        set({
          regimeWeights: state.regimeAdjustments.length > 0
            ? state.regimeAdjustments.reduce<ScoreWeights>(
                (acc, adj) => ({ ...acc, [adj.dimension]: adj.toWeight }),
                state.regimeWeights,
              )
            : state.regimeWeights,
        });
        return get().regimeWeights;
      },

      applyParamRecommendations: () => {
        const state = get();
        const applicable = state.paramRecommendations.filter(
          (r) => r.recommended !== null && r.recommended !== r.current,
        );
        if (applicable.length === 0) return null;
        const updated: TradingConfig = applyRecommendations(
          {} as TradingConfig,
          state.paramRecommendations,
        );
        // 记录已应用的 key
        set({
          appliedParamKeys: applicable.map((r) => r.key),
        });
        return updated;
      },

      applyParam: (key: ParamKey) => {
        const state = get();
        const rec = state.paramRecommendations.find((r) => r.key === key);
        if (!rec || rec.recommended === null) return null;
        if (!state.appliedParamKeys.includes(key)) {
          set({ appliedParamKeys: [...state.appliedParamKeys, key] });
        }
        return rec.recommended;
      },

      getActiveWeights: (baseWeights) => {
        const state = get();
        if (!state.enabled || !state.autoApplyRegime) return baseWeights;
        return state.regimeWeights;
      },

      getAdjustedThreshold: (baseThreshold) => {
        const state = get();
        if (!state.enabled) return baseThreshold;
        const { regime, regimeFeatures } = state;
        const volatility = regimeFeatures?.volatility ?? 50;
        let adjustment = 0;
        if (regime === "volatile") adjustment += 8;
        else if (regime === "trending") adjustment -= 3;
        else if (regime === "ranging") adjustment += 2;
        if (volatility > 80) adjustment += 5;
        else if (volatility < 20) adjustment -= 2;
        return Math.max(30, Math.min(90, baseThreshold + adjustment));
      },
    }),
    {
      name: AI_KEY,
      partialize: (state) => ({
        enabled: state.enabled,
        autoApplyRegime: state.autoApplyRegime,
        autoApplyParams: state.autoApplyParams,
        regime: state.regime,
        regimeConfidence: state.regimeConfidence,
        regimeFeatures: state.regimeFeatures,
        regimeSummary: state.regimeSummary,
        regimeAdjustments: state.regimeAdjustments,
        regimeWeights: state.regimeWeights,
        regimeDetectedAt: state.regimeDetectedAt,
        paramRecommendations: state.paramRecommendations,
        paramOverallConfidence: state.paramOverallConfidence,
        paramSummary: state.paramSummary,
        paramGeneratedAt: state.paramGeneratedAt,
        appliedParamKeys: state.appliedParamKeys,
        lastAttribution: state.lastAttribution,
        batchAttribution: state.batchAttribution,
        attributionHistory: state.attributionHistory,
        totalAnalyses: state.totalAnalyses,
      }),
    },
  ),
);
