/**
 * Python 量化后端状态管理
 * 对接 crypto_quant FastAPI 服务
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  fetchQuantHealth,
  fetchStrategies,
  fetchStrategySignal,
  fetchQuantIndicators,
  runBacktest,
  fetchPaperAccount,
  fetchPaperPositions,
  closePaperPosition,
  fetchPaperTrades,
  type StrategyInfo,
  type QuantSignal,
  type QuantIndicators,
  type BacktestResult,
  type PaperAccount,
  type PaperPosition,
} from "@/services/quant";
import type { Timeframe } from "@/types";

interface StrategySignal {
  signal: QuantSignal;
  strategy: string;
  symbol: string;
  timeframe: string;
  updatedAt: number;
}

interface QuantState {
  // 服务状态
  serverOnline: boolean;
  serverChecking: boolean;
  lastCheckTime: number;

  // 策略列表
  strategies: Record<string, StrategyInfo>;
  strategiesLoaded: boolean;

  // 策略信号
  strategySignals: Record<string, StrategySignal>;
  signalsLoading: Record<string, boolean>;

  // 技术指标
  quantIndicators: QuantIndicators | null;
  indicatorsLoading: boolean;
  indicatorsSymbol: string;
  indicatorsTimeframe: string;

  // 回测
  backtestResult: BacktestResult | null;
  backtestLoading: boolean;

  // 模拟盘
  paperAccount: PaperAccount | null;
  paperPositions: Record<string, PaperPosition>;
  paperTrades: any[];
  paperLoading: boolean;

  // 信号统计
  signalStats: any | null;
  signalStatsLoading: boolean;
  signalHistory: any[];
  signalHistoryLoading: boolean;
  timeframeResonance: any | null;
  timeframeResonanceLoading: boolean;

  // 配置
  selectedStrategies: string[];
  backtestInitialCapital: number;
  backtestLimit: number;

  // actions
  checkServer: () => Promise<boolean>;
  loadStrategies: () => Promise<void>;
  fetchAllStrategySignals: (symbol: string, timeframe: Timeframe) => Promise<void>;
  fetchSingleStrategySignal: (
    strategy: string,
    symbol: string,
    timeframe: Timeframe,
  ) => Promise<void>;
  fetchIndicators: (symbol: string, timeframe: Timeframe) => Promise<void>;
  runBacktest: (
    symbol: string,
    timeframe: Timeframe,
    strategy: string,
    params?: Record<string, any>,
  ) => Promise<void>;
  fetchSignalStats: (symbol: string, timeframe?: string) => Promise<void>;
  fetchSignalHistory: (symbol: string, timeframe?: string, limit?: number) => Promise<void>;
  fetchTimeframeResonance: (symbol: string, strategy?: string) => Promise<void>;
  loadPaperAccount: () => Promise<void>;
  loadPaperPositions: () => Promise<void>;
  loadPaperTrades: () => Promise<void>;
  closePaperPosition: (symbol: string) => Promise<void>;
  toggleStrategy: (strategy: string) => void;
  setBacktestInitialCapital: (v: number) => void;
}

const DEFAULT_SELECTED_STRATEGIES = [
  "ma_trend",
  "rsi_mean_reversion",
  "macd_momentum",
  "bollinger_breakout",
];

export const useQuantStore = create<QuantState>()(
  persist(
    (set, get) => ({
      serverOnline: false,
      serverChecking: false,
      lastCheckTime: 0,

      strategies: {},
      strategiesLoaded: false,

      strategySignals: {},
      signalsLoading: {},

      quantIndicators: null,
      indicatorsLoading: false,
      indicatorsSymbol: "",
      indicatorsTimeframe: "",

      backtestResult: null,
      backtestLoading: false,

      paperAccount: null,
      paperPositions: {},
      paperTrades: [],
      paperLoading: false,

      signalStats: null,
      signalStatsLoading: false,
      signalHistory: [],
      signalHistoryLoading: false,
      timeframeResonance: null,
      timeframeResonanceLoading: false,

      selectedStrategies: DEFAULT_SELECTED_STRATEGIES,
      backtestInitialCapital: 10000,
      backtestLimit: 500,

      checkServer: async () => {
        set({ serverChecking: true });
        try {
          const res = await fetchQuantHealth();
          const online = res.status === "healthy";
          set({ serverOnline: online, lastCheckTime: Date.now(), serverChecking: false });
          return online;
        } catch (e) {
          set({ serverOnline: false, serverChecking: false });
          return false;
        }
      },

      loadStrategies: async () => {
        if (get().strategiesLoaded) return;
        try {
          const strategies = await fetchStrategies();
          set({ strategies, strategiesLoaded: true });
        } catch (e) {
          console.error("加载策略列表失败:", e);
        }
      },

      fetchAllStrategySignals: async (symbol: string, timeframe: Timeframe) => {
        const { selectedStrategies } = get();
        await get().loadStrategies();

        for (const strategy of selectedStrategies) {
          get().fetchSingleStrategySignal(strategy, symbol, timeframe);
        }
      },

      fetchSingleStrategySignal: async (
        strategy: string,
        symbol: string,
        timeframe: Timeframe,
      ) => {
        const key = `${strategy}_${symbol}_${timeframe}`;
        set((state) => ({
          signalsLoading: { ...state.signalsLoading, [key]: true },
        }));

        try {
          const res = await fetchStrategySignal(symbol, timeframe, strategy);
          set((state) => ({
            strategySignals: {
              ...state.strategySignals,
              [key]: {
                signal: res.signal,
                strategy: res.strategy,
                symbol: res.symbol,
                timeframe: res.timeframe,
                updatedAt: Date.now(),
              },
            },
            signalsLoading: { ...state.signalsLoading, [key]: false },
          }));
        } catch (e) {
          console.error(`获取策略信号失败 [${strategy}]:`, e);
          set((state) => ({
            signalsLoading: { ...state.signalsLoading, [key]: false },
          }));
        }
      },

      fetchIndicators: async (symbol: string, timeframe: Timeframe) => {
        set({ indicatorsLoading: true });
        try {
          const res = await fetchQuantIndicators(symbol, timeframe);
          set({
            quantIndicators: res.indicators,
            indicatorsSymbol: res.symbol,
            indicatorsTimeframe: res.timeframe,
            indicatorsLoading: false,
          });
        } catch (e) {
          console.error("获取技术指标失败:", e);
          set({ indicatorsLoading: false });
        }
      },

      runBacktest: async (
        symbol: string,
        timeframe: Timeframe,
        strategy: string,
        params: Record<string, any> = {},
      ) => {
        set({ backtestLoading: true });
        try {
          const res = await runBacktest(
            symbol,
            timeframe,
            strategy,
            params,
            get().backtestInitialCapital,
            get().backtestLimit,
          );
          set({ backtestResult: res.result, backtestLoading: false });
        } catch (e) {
          console.error("回测失败:", e);
          set({ backtestLoading: false });
        }
      },

      loadPaperAccount: async () => {
        set({ paperLoading: true });
        try {
          const res = await fetchPaperAccount();
          set({ paperAccount: res.account, paperLoading: false });
        } catch (e) {
          console.error("获取模拟盘账户失败:", e);
          set({ paperLoading: false });
        }
      },

      loadPaperPositions: async () => {
        try {
          const res = await fetchPaperPositions();
          set({ paperPositions: res.positions });
        } catch (e) {
          console.error("获取模拟盘持仓失败:", e);
        }
      },

      loadPaperTrades: async () => {
        try {
          const res = await fetchPaperTrades(50);
          set({ paperTrades: res.trades });
        } catch (e) {
          console.error("获取模拟盘交易历史失败:", e);
        }
      },

      closePaperPosition: async (symbol: string) => {
        try {
          await closePaperPosition(symbol);
          await Promise.all([
            get().loadPaperAccount(),
            get().loadPaperPositions(),
            get().loadPaperTrades(),
          ]);
        } catch (e) {
          console.error("平仓失败:", e);
        }
      },

      fetchSignalStats: async (symbol: string, timeframe?: string) => {
        set({ signalStatsLoading: true });
        try {
          const { fetchSignalStats: apiFetchStats } = await import('@/services/quant');
          const res = await apiFetchStats(symbol, timeframe, undefined, 30);
          set({ signalStats: res.stats, signalStatsLoading: false });
        } catch (e) {
          console.error('获取信号统计失败:', e);
          set({ signalStatsLoading: false });
        }
      },

      fetchSignalHistory: async (symbol: string, timeframe?: string, limit = 50) => {
        set({ signalHistoryLoading: true });
        try {
          const { fetchSignalHistory: apiFetchHistory } = await import('@/services/quant');
          const res = await apiFetchHistory(symbol, timeframe, limit, true);
          set({ signalHistory: res.signals || [], signalHistoryLoading: false });
        } catch (e) {
          console.error('获取信号历史失败:', e);
          set({ signalHistoryLoading: false });
        }
      },

      fetchTimeframeResonance: async (symbol: string, strategy = 'ma_trend') => {
        set({ timeframeResonanceLoading: true });
        try {
          const { fetchTimeframeResonance: apiFetchResonance } = await import('@/services/quant');
          const res = await apiFetchResonance(symbol, strategy);
          set({ timeframeResonance: res.resonance, timeframeResonanceLoading: false });
        } catch (e) {
          console.error('获取多周期共振失败:', e);
          set({ timeframeResonanceLoading: false });
        }
      },

      toggleStrategy: (strategy: string) => {
        set((state) => {
          const exists = state.selectedStrategies.includes(strategy);
          return {
            selectedStrategies: exists
              ? state.selectedStrategies.filter((s) => s !== strategy)
              : [...state.selectedStrategies, strategy],
          };
        });
      },

      setBacktestInitialCapital: (v: number) => {
        set({ backtestInitialCapital: v });
      },
    }),
    {
      name: "quant-store",
      partialize: (state) => ({
        selectedStrategies: state.selectedStrategies,
        backtestInitialCapital: state.backtestInitialCapital,
        backtestLimit: state.backtestLimit,
      }),
    },
  ),
);
