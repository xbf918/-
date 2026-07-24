/**
 * 币种扫描器服务
 * 并行获取多个交易对的 K 线数据，计算综合信号，筛选符合入场条件的币种
 */
import * as binanceApi from "@/services/binance";
import * as okxApi from "@/services/okx";
import { macd, summarizeMacd } from "@/lib/indicators/macd";
import { rsi, summarizeRsi } from "@/lib/indicators/rsi";
import { kdj, summarizeKdj } from "@/lib/indicators/kdj";
import { cvd, summarizeCvd } from "@/lib/indicators/cvd";
import { findSupportResistance } from "@/lib/indicators/supportResistance";
import { detectDivergences } from "@/lib/indicators/divergence";
import { detectCandlePatterns, summarizePatterns } from "@/lib/indicators/patterns";
import { detectChartPatterns } from "@/lib/indicators/chartPatterns";
import { analyzeTimeframe } from "@/lib/indicators/multiTimeframe";
import { computeSignalScore } from "@/lib/scoring/engine";
import type {
  SignalScore,
  Timeframe,
  Ticker24h,
  NewsItem,
  FearGreedIndex,
} from "@/types";
import { useStrategyLearningStore } from "@/store/useStrategyLearningStore";

/** 扫描结果项 */
export interface ScanResult {
  symbol: string;
  base: string;
  price: number;
  changePercent: number;
  volume: number;
  signal: SignalScore;
  scannedAt: number;
  agentAnalysis?: {
    direction: string;
    confidence: number;
    strength: number;
    summary: string;
    agentSignals?: Array<{ agent: string; direction: string; confidence: number }>;
  };
}

/** 扫描配置 */
export interface ScanConfig {
  symbols: { symbol: string; base: string }[];
  timeframe: Timeframe;
  minConfidence: number;
  maxResults: number;
  exchange: "binance" | "okx";
  scanAllMarket?: boolean; // 扫描整个交易所所有 USDT 交易对
}

/** 单个币种信号计算 */
async function scanSingleSymbol(
  symbol: string,
  base: string,
  timeframe: Timeframe,
  exchange: "binance" | "okx",
  sharedNews: NewsItem[],
  sharedFearGreed: FearGreedIndex | null,
  signal?: AbortSignal,
): Promise<ScanResult | null> {
  const api = exchange === "binance" ? binanceApi : okxApi;
  try {
    // 并行获取 K 线和 24h 行情
    const [candles, ticker24h] = await Promise.all([
      api.fetchKlines(symbol, timeframe, 300, signal),
      api.fetchTicker24h(symbol, signal).catch(() => null),
    ]);

    if (candles.length < 50) return null;

    const currentPrice = candles[candles.length - 1].close;

    // 计算各维度指标
    const macdPoints = macd(candles);
    const macdSummary = summarizeMacd(macdPoints);
    const rsiPoints = rsi(candles);
    const rsiSummary = summarizeRsi(rsiPoints);
    const kdjPoints = kdj(candles);
    const kdjSummary = summarizeKdj(kdjPoints);
    const cvdPoints = cvd(candles);
    const cvdSummary = summarizeCvd(cvdPoints, candles);
    const supportResistance = findSupportResistance(candles, currentPrice);
    const divergences = detectDivergences(candles, macdPoints);
    const candlePatterns = detectCandlePatterns(candles);
    const chartPatterns = detectChartPatterns(candles);
    const patternSummary = summarizePatterns(candlePatterns, chartPatterns);

    // 多周期：获取 1h 和 4h K 线
    const [candles1h, candles4h] = await Promise.all([
      timeframe !== "1h"
        ? api.fetchKlines(symbol, "1h", 100, signal).catch(() => [])
        : candles,
      timeframe !== "4h"
        ? api.fetchKlines(symbol, "4h", 100, signal).catch(() => [])
        : candles,
    ]);

    const tfSignals = [
      analyzeTimeframe(candles, "15m"),
      analyzeTimeframe(candles1h.length >= 35 ? candles1h : candles, "1h"),
      analyzeTimeframe(candles4h.length >= 35 ? candles4h : candles, "4h"),
    ].filter((s): s is NonNullable<typeof s> => s !== null);

    // 计算综合信号（流动性、OI 用空值，消息面用共享数据）
    const learning = useStrategyLearningStore.getState();
    const weights = learning.enabled ? learning.weights : undefined;

    const signalScore = computeSignalScore({
      candles,
      currentPrice,
      macdSummary,
      rsiSummary,
      kdjSummary,
      cvdSummary,
      oiSummary: null,
      supportResistance,
      divergences,
      liquidityZones: [],
      timeframeSignals: tfSignals,
      news: sharedNews,
      fearGreed: sharedFearGreed,
      patternSummary,
      weights,
    });

    const ticker: Ticker24h | null = ticker24h;

    return {
      symbol,
      base,
      price: currentPrice,
      changePercent: ticker?.priceChangePercent ?? 0,
      volume: ticker?.quoteVolume ?? 0,
      signal: signalScore,
      scannedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** 并发控制 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 扫描多个币种，返回符合入场条件的结果
 */
export async function scanSymbols(
  config: ScanConfig,
  sharedNews: NewsItem[] = [],
  sharedFearGreed: FearGreedIndex | null = null,
  signal?: AbortSignal,
): Promise<ScanResult[]> {
  let symbols = config.symbols;

  // 全市场扫描：动态拉取交易所所有 USDT 交易对
  if (config.scanAllMarket) {
    const api = config.exchange === "binance" ? binanceApi : okxApi;
    try {
      const allSymbols = await api.fetchAllUsdtSymbols(signal);
      // 限制最大扫描数量，避免请求过多
      symbols = allSymbols.slice(0, 100);
    } catch {
      // 拉取失败则使用默认列表
    }
  }

  const results = await mapWithConcurrency(
    symbols,
    6, // 6 并发，全市场扫描时提高并发度
    (item) => scanSingleSymbol(item.symbol, item.base, config.timeframe, config.exchange, sharedNews, sharedFearGreed, signal),
  );

  return results
    .filter((r): r is ScanResult => r !== null)
    .filter((r) => r.signal.direction !== "neutral")
    .filter((r) => r.signal.confidence >= config.minConfidence)
    .sort((a, b) => {
      if (a.signal.direction !== "neutral" && b.signal.direction === "neutral") return -1;
      if (a.signal.direction === "neutral" && b.signal.direction !== "neutral") return 1;
      return b.signal.confidence - a.signal.confidence;
    })
    .slice(0, config.maxResults);
}
