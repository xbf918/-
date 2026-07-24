// 全局市场数据状态管理
import { create } from "zustand";
import type {
  Candle,
  Divergence,
  FearGreedIndex,
  Gap,
  LiquidityZone,
  MACDPoint,
  MACDSummary,
  NewsItem,
  OrderBook,
  SignalScore,
  SupportResistance,
  Ticker24h,
  Timeframe,
  TimeframeSignal,
  ScoreWeights,
  SymbolInfo,
  LoadingState,
  RSIPoint,
  RSISummary,
  KDJPoint,
  KDJSummary,
  CVDPoint,
  CVDSummary,
  OIDataPoint,
  OISummary,
  PatternSummary,
  CandlePattern,
  ChartPattern,
} from "@/types";
import { DEFAULT_SYMBOLS, DEFAULT_TIMEFRAME, DEFAULT_WEIGHTS, TIMEFRAMES, KLINE_LIMIT, EXCHANGES } from "@/lib/constants";
import * as binanceApi from "@/services/binance";
import * as okxApi from "@/services/okx";
import { fetchCryptoNews } from "@/services/news";
import { fetchFearGreedIndex } from "@/services/sentiment";
import { macd, summarizeMacd } from "@/lib/indicators/macd";
import { rsi, summarizeRsi } from "@/lib/indicators/rsi";
import { kdj, summarizeKdj } from "@/lib/indicators/kdj";
import { cvd, summarizeCvd } from "@/lib/indicators/cvd";
import { summarizeOi } from "@/lib/indicators/openInterest";
import { findSupportResistance } from "@/lib/indicators/supportResistance";
import { detectDivergences } from "@/lib/indicators/divergence";
import { detectGaps } from "@/lib/indicators/gaps";
import { detectCandlePatterns, summarizePatterns } from "@/lib/indicators/patterns";
import { detectChartPatterns } from "@/lib/indicators/chartPatterns";
import { analyzeLiquidity } from "@/lib/liquidity/analyze";
import { analyzeTimeframe } from "@/lib/indicators/multiTimeframe";
import { computeSignalScore } from "@/lib/scoring/engine";
import { useStrategyLearningStore } from "./useStrategyLearningStore";
import { wsService } from "@/lib/ws";

type ExchangeId = keyof typeof EXCHANGES;

interface MarketState {
  // 配置
  symbol: string;
  symbolInfo: SymbolInfo;
  timeframe: Timeframe;
  weights: ScoreWeights;
  autoRefresh: boolean;
  exchange: ExchangeId;

  // 原始数据
  candles: Candle[];
  ticker: Ticker24h | null;
  orderBook: OrderBook | null;
  news: NewsItem[];
  fearGreed: FearGreedIndex | null;
  multiCandles: Partial<Record<Timeframe, Candle[]>>;

  // 分析结果
  macdPoints: MACDPoint[];
  macdSummary: MACDSummary | null;
  rsiPoints: RSIPoint[];
  rsiSummary: RSISummary | null;
  kdjPoints: KDJPoint[];
  kdjSummary: KDJSummary | null;
  cvdPoints: CVDPoint[];
  cvdSummary: CVDSummary | null;
  oiData: OIDataPoint[];
  oiSummary: OISummary | null;
  supportResistance: SupportResistance[];
  divergences: Divergence[];
  gaps: Gap[];
  liquidityZones: LiquidityZone[];
  timeframeSignals: TimeframeSignal[];
  candlePatterns: CandlePattern[];
  chartPatterns: ChartPattern[];
  patternSummary: PatternSummary | null;
  signalScore: SignalScore | null;

  // 状态
  status: LoadingState;
  error: string | null;
  lastUpdated: number | null;

  // 搜索
  searchResults: SymbolInfo[];
  searchStatus: LoadingState;

  // Actions
  setSymbol: (symbol: string, base?: string, quote?: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setWeights: (w: ScoreWeights) => void;
  setExchange: (exchange: ExchangeId) => void;
  toggleAutoRefresh: () => void;
  loadAll: (force?: boolean) => Promise<void>;
  searchSymbol: (keyword: string) => Promise<void>;
  refresh: () => Promise<void>;
  recomputeScore: () => void;
  
  // WebSocket
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

let abortController: AbortController | null = null;
let loadingKey = "";
let wsInterval: ReturnType<typeof setInterval> | null = null;

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: "BTCUSDT",
  symbolInfo: { symbol: "BTCUSDT", base: "BTC", quote: "USDT" },
  timeframe: DEFAULT_TIMEFRAME,
  weights: DEFAULT_WEIGHTS,
  autoRefresh: true,
  exchange: "binance",

  candles: [],
  ticker: null,
  orderBook: null,
  news: [],
  fearGreed: null,
  multiCandles: {},

  macdPoints: [],
  macdSummary: null,
  rsiPoints: [],
  rsiSummary: null,
  kdjPoints: [],
  kdjSummary: null,
  cvdPoints: [],
  cvdSummary: null,
  oiData: [],
  oiSummary: null,
  supportResistance: [],
  divergences: [],
  gaps: [],
  liquidityZones: [],
  timeframeSignals: [],
  candlePatterns: [],
  chartPatterns: [],
  patternSummary: null,
  signalScore: null,

  status: "idle",
  error: null,
  lastUpdated: null,

  searchResults: DEFAULT_SYMBOLS,
  searchStatus: "idle",

  setSymbol: (symbol, base, quote) => {
    const info: SymbolInfo = base
      ? { symbol, base, quote: quote ?? "USDT" }
      : DEFAULT_SYMBOLS.find((s) => s.symbol === symbol) ?? { symbol, base: symbol.replace(/USDT$|USDC$/, ""), quote: "USDT" };
    set({ symbol, symbolInfo: info });
    get().loadAll();
  },

  setTimeframe: (tf) => {
    set({ timeframe: tf });
    get().loadAll();
  },

  setWeights: (w) => {
    set({ weights: w });
    get().recomputeScore();
  },

  toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),

  setExchange: (exchange) => {
    set({ exchange });
    get().loadAll();
  },

  searchSymbol: async (keyword) => {
    if (!keyword) {
      set({ searchResults: DEFAULT_SYMBOLS, searchStatus: "idle" });
      return;
    }
    const { exchange } = get();
    const api = exchange === "binance" ? binanceApi : okxApi;
    set({ searchStatus: "loading" });
    try {
      const results = await api.searchSymbols(keyword);
      const mapped: SymbolInfo[] = results.map((r) => ({ symbol: r.symbol, base: r.base, quote: r.quote }));
      set({ searchResults: mapped.length > 0 ? mapped : DEFAULT_SYMBOLS, searchStatus: "success" });
    } catch {
      const upper = keyword.toUpperCase();
      const filtered = DEFAULT_SYMBOLS.filter((s) => s.symbol.includes(upper));
      set({ searchResults: filtered, searchStatus: "error" });
    }
  },

  loadAll: async (force?: boolean) => {
    const { symbol, timeframe, weights, exchange } = get();
    const api = exchange === "binance" ? binanceApi : okxApi;
    const key = `${exchange}:${symbol}:${timeframe}`;
    if (!force && loadingKey === key) return;
    loadingKey = key;

    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    set({ status: "loading", error: null });

    try {
      const [candles, ticker, orderBook, news, fearGreed, oiData] = await Promise.all([
        api.fetchKlines(symbol, timeframe, KLINE_LIMIT, signal),
        api.fetchTicker24h(symbol, signal),
        api.fetchDepth(symbol, 500, signal),
        fetchCryptoNews("BTC,ETH", 20, signal).catch(() => [] as NewsItem[]),
        fetchFearGreedIndex(signal).catch(() => null),
        api.fetchOpenInterestHist(symbol, timeframe, 100, signal).catch(() => [] as OIDataPoint[]),
      ]);

      const otherTimeframes = TIMEFRAMES.filter((t) => t.value !== timeframe).map((t) => t.value);
      const multiResults = await Promise.all(
        otherTimeframes.map((tf) => api.fetchKlines(symbol, tf, 100, signal).then((c) => [tf, c] as const)),
      );
      const multiCandles: Partial<Record<Timeframe, Candle[]>> = { [timeframe]: candles };
      for (const [tf, c] of multiResults) multiCandles[tf] = c;

      const currentPrice = ticker.lastPrice;

      const macdPoints = macd(candles);
      const macdSummary = summarizeMacd(macdPoints);
      const rsiPoints = rsi(candles);
      const rsiSummary = summarizeRsi(rsiPoints);
      const kdjPoints = kdj(candles);
      const kdjSummary = summarizeKdj(kdjPoints);
      const cvdPoints = cvd(candles);
      const cvdSummary = summarizeCvd(cvdPoints, candles);
      const oiSummary = summarizeOi(oiData, candles);
      const supportResistance = findSupportResistance(candles, currentPrice);
      const divergences = detectDivergences(candles, macdPoints);
      const gaps = detectGaps(candles);
      const liquidityZones = orderBook ? analyzeLiquidity(orderBook, currentPrice) : [];
      const candlePatterns = detectCandlePatterns(candles);
      const chartPatterns = detectChartPatterns(candles);
      const patternSummary = summarizePatterns(candlePatterns, chartPatterns);

      const timeframeSignals: TimeframeSignal[] = [];
      for (const t of TIMEFRAMES) {
        const c = multiCandles[t.value];
        if (c && c.length > 35) {
          const sig = analyzeTimeframe(c, t.value);
          if (sig) timeframeSignals.push(sig);
        }
      }

      const learning = useStrategyLearningStore.getState();
      const effectiveWeights = learning.enabled ? learning.weights : weights;

      const signalScore = computeSignalScore({
        candles,
        currentPrice,
        macdSummary,
        rsiSummary,
        kdjSummary,
        cvdSummary,
        oiSummary,
        supportResistance,
        divergences,
        liquidityZones,
        timeframeSignals,
        news,
        fearGreed,
        patternSummary,
        weights: effectiveWeights,
      });

      set({
        candles,
        ticker,
        orderBook,
        news,
        fearGreed,
        oiData,
        multiCandles,
        macdPoints,
        macdSummary,
        rsiPoints,
        rsiSummary,
        kdjPoints,
        kdjSummary,
        cvdPoints,
        cvdSummary,
        oiSummary,
        supportResistance,
        divergences,
        gaps,
        liquidityZones,
        timeframeSignals,
        candlePatterns,
        chartPatterns,
        patternSummary,
        signalScore,
        status: "success",
        lastUpdated: Date.now(),
        error: null,
      });
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        loadingKey = "";
        return;
      }
      set({
        status: "error",
        error: err instanceof Error ? err.message : "数据加载失败",
      });
    } finally {
      loadingKey = "";
    }
  },

  refresh: async () => {
    await get().loadAll(true);
  },

  recomputeScore: () => {
    const s = get();
    if (!s.ticker || s.candles.length === 0) return;
    const learning = useStrategyLearningStore.getState();
    const effectiveWeights = learning.enabled ? learning.weights : s.weights;
    const score = computeSignalScore({
      candles: s.candles,
      currentPrice: s.ticker.lastPrice,
      macdSummary: s.macdSummary,
      rsiSummary: s.rsiSummary,
      kdjSummary: s.kdjSummary,
      cvdSummary: s.cvdSummary,
      oiSummary: s.oiSummary,
      supportResistance: s.supportResistance,
      divergences: s.divergences,
      liquidityZones: s.liquidityZones,
      timeframeSignals: s.timeframeSignals,
      news: s.news,
      fearGreed: s.fearGreed,
      patternSummary: s.patternSummary,
      weights: effectiveWeights,
    });
    set({ signalScore: score });
  },
  
  connectWebSocket: () => {
    const { exchange, symbol, refresh } = get();
    
    wsService.connect();
    
    wsService.on('price_update', (data) => {
      const { exchange: dataExchange, symbol: dataSymbol, price } = data;
      if (dataExchange === exchange && dataSymbol === symbol) {
        set((state) => {
          if (state.ticker) {
            return {
              ticker: { ...state.ticker, lastPrice: price },
            };
          }
          return {};
        });
      }
    });
    
    wsService.on('signal', (data) => {
      console.log('Signal received:', data);
    });
    
    wsService.subscribe(exchange, symbol);
    
    if (wsInterval) clearInterval(wsInterval);
    wsInterval = setInterval(() => {
      refresh();
    }, 5000);
  },
  
  disconnectWebSocket: () => {
    if (wsInterval) {
      clearInterval(wsInterval);
      wsInterval = null;
    }
    wsService.disconnect();
  },
}));
