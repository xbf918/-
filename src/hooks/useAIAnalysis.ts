/**
 * AI 自动分析 Hook
 *
 * - 监听交易历史变化，对每笔新增交易自动归因
 * - 监听 K 线数据，定时分析市场环境
 * - 监听交易历史变化，定时执行参数优化
 *
 * 仅在 useAIStrategyStore.enabled = true 时激活
 */
import { useEffect, useRef } from "react";
import { useTradingStore } from "@/store/useTradingStore";
import { useMarketStore } from "@/store/useMarketStore";
import { useStrategyLearningStore } from "@/store/useStrategyLearningStore";
import { useAIStrategyStore } from "@/store/useAIStrategyStore";

const REGIME_ANALYSIS_INTERVAL = 60_000; // 60s
const PARAM_OPTIMIZATION_INTERVAL = 30_000; // 30s

export function useAIAnalysis() {
  const aiEnabled = useAIStrategyStore((s) => s.enabled);
  const attributeTrade = useAIStrategyStore((s) => s.attributeTrade);
  const analyzeRegime = useAIStrategyStore((s) => s.analyzeRegime);
  const optimizeParams = useAIStrategyStore((s) => s.optimizeParams);
  const lastAttributionTradeId = useAIStrategyStore((s) => s.lastAttribution?.tradeId);
  const lastParamOptTime = useRef<number>(0);
  const lastRegimeTime = useRef<number>(0);

  // 监听交易历史，归因新交易
  useEffect(() => {
    if (!aiEnabled) return;

    const unsubscribe = useTradingStore.subscribe((state, prevState) => {
      if (state.history.length === 0) return;
      if (state.history.length === prevState.history.length) return;

      // 找到新增加的交易
      const newTrade = state.history[0];
      if (!newTrade) return;
      if (newTrade.id === lastAttributionTradeId) return;

      // 获取当时的信号（如果有）
      const signal = useMarketStore.getState().signalScore;
      const learning = useStrategyLearningStore.getState();
      const aiState = useAIStrategyStore.getState();

      // 归因分析
      attributeTrade(
        newTrade,
        signal,
        learning.dimensionStats,
        learning.weights,
        aiState.regime !== "unknown" ? aiState.regime : undefined,
        aiState.regimeFeatures ?? undefined,
      );
    });

    return unsubscribe;
  }, [aiEnabled, attributeTrade, lastAttributionTradeId]);

  // 定时分析市场环境
  useEffect(() => {
    if (!aiEnabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastRegimeTime.current < REGIME_ANALYSIS_INTERVAL) return;
      lastRegimeTime.current = now;

      const market = useMarketStore.getState();
      const candles = market.candles;
      const learning = useStrategyLearningStore.getState();
      if (candles && candles.length >= 30) {
        analyzeRegime(candles, learning.weights);
      }
    }, 20_000); // 每 20s 检查一次，但不每次都跑

    return () => clearInterval(timer);
  }, [aiEnabled, analyzeRegime]);

  // 定时参数优化
  useEffect(() => {
    if (!aiEnabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastParamOptTime.current < PARAM_OPTIMIZATION_INTERVAL) return;
      lastParamOptTime.current = now;

      const trading = useTradingStore.getState();
      if (trading.history.length < 3) return;
      optimizeParams(trading.history.slice(0, 30), trading.config);
    }, 20_000);

    return () => clearInterval(timer);
  }, [aiEnabled, optimizeParams]);
}
