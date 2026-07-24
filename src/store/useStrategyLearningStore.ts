import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrategyLearning, ScoreWeights, DimensionStats, LearningRecord, SignalScore } from "@/types";
import {
  createInitialLearning,
  updateStats,
  adjustWeights,
  handleConsecutiveLosses,
  calculateRiskThreshold,
  shouldPauseTrading,
} from "@/lib/strategy/learningEngine";
import { DEFAULT_WEIGHTS } from "@/lib/constants";

interface StrategyLearningState {
  enabled: boolean;
  weights: ScoreWeights;
  dimensionStats: DimensionStats;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  learningHistory: LearningRecord[];
  riskMode: "normal" | "conservative" | "aggressive";
  lastAdjustmentTime: number | null;
  pauseTrading: boolean;

  setEnabled: (enabled: boolean) => void;
  setRiskMode: (mode: "normal" | "conservative" | "aggressive") => void;
  setMaxConsecutiveLosses: (max: number) => void;
  setWeights: (weights: ScoreWeights) => void;
  resetWeights: () => void;
  
  onTradeClosed: (trade: { pnl: number; closeTime: number }, signal: SignalScore | null) => void;
  getEffectiveThreshold: () => number;
  isTradingPaused: () => boolean;
  getWeightForDimension: (dim: keyof DimensionStats) => number;
}

const LEARNING_KEY = "crytopulse-strategy-learning";

export const useStrategyLearningStore = create<StrategyLearningState>()(
  persist(
    (set, get) => ({
      enabled: false,
      weights: { ...DEFAULT_WEIGHTS },
      dimensionStats: createInitialLearning().stats,
      consecutiveLosses: 0,
      maxConsecutiveLosses: 5,
      learningHistory: [],
      riskMode: "normal",
      lastAdjustmentTime: null,
      pauseTrading: false,

      setEnabled: (enabled) => set({ enabled }),

      setRiskMode: (mode) => set({ riskMode: mode }),

      setMaxConsecutiveLosses: (max) => set({ maxConsecutiveLosses: max }),

      setWeights: (weights) => set({ weights }),

      resetWeights: () => {
        const initial = createInitialLearning();
        set({
          weights: initial.weights,
          dimensionStats: initial.stats,
          consecutiveLosses: 0,
          learningHistory: [],
          riskMode: "normal",
          pauseTrading: false,
        });
      },

      onTradeClosed: (trade, signal) => {
        const state = get();
        if (!state.enabled) return;

        const isWin = trade.pnl >= 0;
        const newConsecutiveLosses = isWin ? 0 : state.consecutiveLosses + 1;

        const newStats = updateStats(state.dimensionStats, {
          id: "",
          symbol: "",
          side: isWin ? "long" : "short",
          entryPrice: 0,
          exitPrice: 0,
          quantity: 0,
          leverage: 0,
          pnl: trade.pnl,
          pnlPercent: 0,
          openTime: 0,
          closeTime: trade.closeTime,
          reason: "",
        }, signal);

        const { newWeights, records } = adjustWeights(state.weights, newStats, {
          id: "",
          symbol: "",
          side: isWin ? "long" : "short",
          entryPrice: 0,
          exitPrice: 0,
          quantity: 0,
          leverage: 0,
          pnl: trade.pnl,
          pnlPercent: 0,
          openTime: 0,
          closeTime: trade.closeTime,
          reason: "",
        }, signal);

        const { newWeights: finalWeights, records: lossRecords, riskMode } = handleConsecutiveLosses(
          newWeights,
          newStats,
          newConsecutiveLosses,
        );

        const allRecords = [...records, ...lossRecords];
        const shouldPause = shouldPauseTrading(newConsecutiveLosses, state.maxConsecutiveLosses);

        set({
          weights: finalWeights,
          dimensionStats: newStats,
          consecutiveLosses: newConsecutiveLosses,
          learningHistory: [...state.learningHistory, ...allRecords].slice(-50),
          riskMode,
          lastAdjustmentTime: Math.floor(Date.now() / 1000),
          pauseTrading: shouldPause,
        });
      },

      getEffectiveThreshold: () => {
        const state = get();
        return calculateRiskThreshold(state.consecutiveLosses, state.riskMode);
      },

      isTradingPaused: () => {
        const state = get();
        return state.pauseTrading || shouldPauseTrading(state.consecutiveLosses, state.maxConsecutiveLosses);
      },

      getWeightForDimension: (dim) => {
        const state = get();
        const weights = state.weights;
        switch (dim) {
          case "technical": return weights.technical;
          case "divergence": return weights.divergence;
          case "liquidity": return weights.liquidity;
          case "timeframe": return weights.timeframe;
          case "sentiment": return weights.sentiment;
          case "patterns": return 0.15;
          case "volumeFlow": return 0.15;
          default: return 0.1;
        }
      },
    }),
    {
      name: LEARNING_KEY,
      partialize: (state) => ({
        enabled: state.enabled,
        weights: state.weights,
        dimensionStats: state.dimensionStats,
        consecutiveLosses: state.consecutiveLosses,
        maxConsecutiveLosses: state.maxConsecutiveLosses,
        riskMode: state.riskMode,
      }),
    },
  ),
);
