import { create } from "zustand";
import { scanSymbols, type ScanResult } from "@/services/scanner";
import { DEFAULT_SYMBOLS, DEFAULT_TIMEFRAME } from "@/lib/constants";
import type { Timeframe, NewsItem, FearGreedIndex } from "@/types";
import { useMarketStore } from "./useMarketStore";

export interface ScannerConfig {
  symbols: { symbol: string; base: string }[];
  timeframe: Timeframe;
  minConfidence: number;
  maxResults: number;
  autoScan: boolean;
  scanInterval: number; // 秒
  autoTrade: boolean;
  scanAllMarket: boolean; // 扫描整个交易所所有 USDT 交易对
  useAgentAnalysis: boolean; // 对 Top 候选币种运行多智能体深度分析
  agentAnalysisCount: number; // 对前 N 个候选运行智能体分析
  rotationEnabled: boolean; // 启用自动轮动
  requireAgentConfirmation: boolean; // 轮动是否需要智能体确认
  maxRotationPositions: number; // 最大轮动持仓数
}

export interface ScanStats {
  totalScans: number;
  totalSignals: number;
  longSignals: number;
  shortSignals: number;
  startTime: number | null;
  lastScanDuration: number;
}

const SCANNER_KEY = "cryptopulse_scanner_config";

function loadPersistedConfig(): Partial<ScannerConfig> {
  try {
    const raw = localStorage.getItem(SCANNER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistConfig(config: ScannerConfig): void {
  try {
    localStorage.setItem(SCANNER_KEY, JSON.stringify({
      autoScan: config.autoScan,
      autoTrade: config.autoTrade,
      scanInterval: config.scanInterval,
      minConfidence: config.minConfidence,
      timeframe: config.timeframe,
      symbols: config.symbols,
      scanAllMarket: config.scanAllMarket,
      useAgentAnalysis: config.useAgentAnalysis,
      agentAnalysisCount: config.agentAnalysisCount,
      rotationEnabled: config.rotationEnabled,
      requireAgentConfirmation: config.requireAgentConfirmation,
      maxRotationPositions: config.maxRotationPositions,
    }));
  } catch { /* ignore */ }
}

export interface ScannerState {
  config: ScannerConfig;
  results: ScanResult[];
  scanning: boolean;
  lastScanTime: number | null;
  error: string | null;
  tradedSymbols: Set<string>;
  stats: ScanStats;
  nextScanIn: number;
  agentAnalysisProgress: { current: number; total: number; symbol: string } | null;

  setConfig: (config: Partial<ScannerConfig>) => void;
  toggleAutoScan: () => void;
  toggleAutoTrade: () => void;
  scanOnce: (news?: NewsItem[], fearGreed?: FearGreedIndex | null) => Promise<ScanResult[]>;
  clearTraded: () => void;
  addTraded: (symbol: string) => void;
  addSymbol: (symbol: string, base: string) => void;
  removeSymbol: (symbol: string) => void;
  tickNextScan: () => void;
  resetStats: () => void;
}

const persisted = loadPersistedConfig();

export const useScannerStore = create<ScannerState>((set, get) => ({
  config: {
    symbols: persisted.symbols ?? DEFAULT_SYMBOLS.map((s) => ({ symbol: s.symbol, base: s.base })),
    timeframe: persisted.timeframe ?? DEFAULT_TIMEFRAME,
    minConfidence: persisted.minConfidence ?? 60,
    maxResults: 50,
    autoScan: persisted.autoScan ?? false,
    scanInterval: persisted.scanInterval ?? 120,
    autoTrade: persisted.autoTrade ?? false,
    scanAllMarket: persisted.scanAllMarket ?? false,
    useAgentAnalysis: persisted.useAgentAnalysis ?? false,
    agentAnalysisCount: persisted.agentAnalysisCount ?? 5,
    rotationEnabled: persisted.rotationEnabled ?? false,
    requireAgentConfirmation: persisted.requireAgentConfirmation ?? true,
    maxRotationPositions: persisted.maxRotationPositions ?? 3,
  },
  results: [],
  scanning: false,
  lastScanTime: null,
  error: null,
  tradedSymbols: new Set(),
  stats: {
    totalScans: 0,
    totalSignals: 0,
    longSignals: 0,
    shortSignals: 0,
    startTime: null,
    lastScanDuration: 0,
  },
  nextScanIn: 0,
  agentAnalysisProgress: null,

  setConfig: (partial) =>
    set((state) => {
      const newConfig = { ...state.config, ...partial };
      persistConfig(newConfig);
      return { config: newConfig };
    }),

  toggleAutoScan: () =>
    set((state) => {
      const newAutoScan = !state.config.autoScan;
      const newConfig = { ...state.config, autoScan: newAutoScan };
      persistConfig(newConfig);
      return {
        config: newConfig,
        stats: newAutoScan && !state.stats.startTime
          ? { ...state.stats, startTime: Date.now() }
          : state.stats,
        nextScanIn: newAutoScan ? newConfig.scanInterval : 0,
      };
    }),

  toggleAutoTrade: () =>
    set((state) => {
      const newConfig = { ...state.config, autoTrade: !state.config.autoTrade };
      persistConfig(newConfig);
      return { config: newConfig };
    }),

  scanOnce: async (news = [], fearGreed = null) => {
    const { config, scanning, stats } = get();
    const exchange = useMarketStore.getState().exchange;
    if (scanning) return [];
    set({ scanning: true, error: null, agentAnalysisProgress: null });
    const startMs = Date.now();
    try {
      // 第一步：技术指标快速扫描
      let results = await scanSymbols(
        {
          symbols: config.symbols,
          timeframe: config.timeframe,
          minConfidence: config.minConfidence,
          maxResults: config.maxResults,
          exchange,
          scanAllMarket: config.scanAllMarket,
        },
        news,
        fearGreed,
      );

      // 第二步：对 Top 候选运行多智能体深度分析
      if (config.useAgentAnalysis && results.length > 0) {
        const { useMultiAgentStore } = await import("./useMultiAgentStore");
        const agentStore = useMultiAgentStore.getState();

        // 确保智能体已初始化
        if (!agentStore.isInitialized) {
          await agentStore.initializeAgents();
        }

        const analysisCount = Math.min(config.agentAnalysisCount, results.length);
        console.log(`[Scanner] 开始对 Top ${analysisCount} 个候选币种运行多智能体分析`);

        // 保存当前选中的交易对，分析完成后恢复
        const marketStore = useMarketStore.getState();
        const originalSymbol = marketStore.symbol;
        const originalSymbolInfo = { ...marketStore.symbolInfo };

        for (let i = 0; i < analysisCount; i++) {
          const result = results[i];
          set({
            agentAnalysisProgress: { current: i + 1, total: analysisCount, symbol: result.symbol },
          });

          try {
            // 获取该币种的 K 线数据
            const api = exchange === "binance"
              ? await import("@/services/binance")
              : await import("@/services/okx");
            const candles = await api.fetchKlines(result.symbol, config.timeframe, 300);

            // 临时设置 marketStore 的 symbol 和 candles，让 runAnalysis 能读到数据
            marketStore.setSymbol(result.symbol);

            // 运行多智能体分析
            await agentStore.runAnalysis(result.symbol);

            // 获取分析结果
            const combinedSignal = useMultiAgentStore.getState().combinedSignal;
            if (combinedSignal) {
              results[i] = {
                ...result,
                agentAnalysis: {
                  direction: combinedSignal.direction,
                  confidence: combinedSignal.confidence,
                  strength: combinedSignal.strength,
                  summary: combinedSignal.summary || "",
                },
              };
            }
          } catch (e) {
            console.warn(`[Scanner] 智能体分析 ${result.symbol} 失败:`, e);
          }
        }

        // 恢复原来的交易对
        marketStore.setSymbol(originalSymbol, originalSymbolInfo.base, originalSymbolInfo.quote);

        set({ agentAnalysisProgress: null });
        console.log("[Scanner] 多智能体分析完成");
      }

      const duration = Date.now() - startMs;
      const longs = results.filter((r) => r.signal.direction === "long").length;
      const shorts = results.filter((r) => r.signal.direction === "short").length;
      set({
        results,
        scanning: false,
        lastScanTime: Date.now(),
        tradedSymbols: new Set(),
        stats: {
          ...stats,
          totalScans: stats.totalScans + 1,
          totalSignals: stats.totalSignals + results.length,
          longSignals: stats.longSignals + longs,
          shortSignals: stats.shortSignals + shorts,
          startTime: stats.startTime ?? Date.now(),
          lastScanDuration: duration,
        },
        nextScanIn: config.autoScan ? config.scanInterval : 0,
        agentAnalysisProgress: null,
      });
      return results;
    } catch (err: any) {
      set({
        scanning: false,
        error: err?.message ?? "Scan failed",
        nextScanIn: config.autoScan ? config.scanInterval : 0,
        agentAnalysisProgress: null,
      });
      return [];
    }
  },

  tickNextScan: () =>
    set((state) => ({
      nextScanIn: Math.max(0, state.nextScanIn - 1),
    })),

  clearTraded: () => set({ tradedSymbols: new Set() }),

  addTraded: (symbol) =>
    set((state) => {
      const newSet = new Set(state.tradedSymbols);
      newSet.add(symbol);
      return { tradedSymbols: newSet };
    }),

  addSymbol: (symbol, base) =>
    set((state) => {
      if (state.config.symbols.some((s) => s.symbol === symbol)) return state;
      const newConfig = {
        ...state.config,
        symbols: [...state.config.symbols, { symbol, base }],
      };
      persistConfig(newConfig);
      return { config: newConfig };
    }),

  removeSymbol: (symbol) =>
    set((state) => {
      const newConfig = {
        ...state.config,
        symbols: state.config.symbols.filter((s) => s.symbol !== symbol),
      };
      persistConfig(newConfig);
      return { config: newConfig };
    }),

  resetStats: () =>
    set({
      stats: {
        totalScans: 0,
        totalSignals: 0,
        longSignals: 0,
        shortSignals: 0,
        startTime: null,
        lastScanDuration: 0,
      },
    }),
}));
