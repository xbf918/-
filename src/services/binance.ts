import axios, { type AxiosInstance } from "axios";
import type { Candle, OrderBook, OrderBookLevel, Ticker24h, Timeframe, OIDataPoint } from "@/types";
import { ENDPOINTS, KLINE_LIMIT } from "@/lib/constants";

// 主 + 备用客户端
const clients: AxiosInstance[] = [
  axios.create({ baseURL: ENDPOINTS.binance, timeout: 12_000 }),
  axios.create({ baseURL: ENDPOINTS.binanceFallback, timeout: 12_000 }),
];

// 合约 API 客户端（单独配置，因为域名不同）
const futuresClients: AxiosInstance[] = [
  axios.create({ baseURL: ENDPOINTS.binanceFutures, timeout: 12_000 }),
  axios.create({ baseURL: ENDPOINTS.binanceFuturesFallback, timeout: 12_000 }),
];

/** 带故障转移的 GET 请求 */
async function getWithFallback<T>(path: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown;
  for (const client of clients) {
    try {
      const res = await client.get<T>(path, { params, signal });
      return res.data;
    } catch (err) {
      // 被取消的请求不重试
      if ((err as any)?.name === "AbortError" || (err as any)?.code === "ERR_CANCELED") throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("所有端点请求失败");
}

/** 获取 K 线数据 */
export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = KLINE_LIMIT,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const data = await getWithFallback<unknown[][]>(
    "/api/v3/klines",
    { symbol, interval, limit },
    signal,
  );
  return data.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
}

/** 获取订单簿深度 */
export async function fetchDepth(
  symbol: string,
  limit: 100 | 500 | 1000 = 500,
  signal?: AbortSignal,
): Promise<OrderBook> {
  const data = await getWithFallback<{ lastUpdateId: number; bids: unknown[][]; asks: unknown[][] }>(
    "/api/v3/depth",
    { symbol, limit },
    signal,
  );
  const toLevels = (arr: unknown[][]): OrderBookLevel[] =>
    arr.map((row) => ({ price: Number(row[0]), qty: Number(row[1]) }));
  return {
    bids: toLevels(data.bids),
    asks: toLevels(data.asks),
    lastUpdateId: data.lastUpdateId,
  };
}

/** 获取 24h 行情 */
export async function fetchTicker24h(
  symbol: string,
  signal?: AbortSignal,
): Promise<Ticker24h> {
  const data = await getWithFallback<any>(
    "/api/v3/ticker/24hr",
    { symbol },
    signal,
  );
  return {
    symbol: data.symbol,
    lastPrice: Number(data.lastPrice),
    priceChangePercent: Number(data.priceChangePercent),
    highPrice: Number(data.highPrice),
    lowPrice: Number(data.lowPrice),
    volume: Number(data.volume),
    quoteVolume: Number(data.quoteVolume),
  };
}

/** 搜索交易对符号 */
export async function searchSymbols(
  keyword: string,
  signal?: AbortSignal,
): Promise<{ symbol: string; base: string; quote: string }[]> {
  if (!keyword) return [];
  const data = await getWithFallback<any>("/api/v3/exchangeInfo", { permissions: "SPOT" }, signal);
  const upper = keyword.toUpperCase();
  return (data.symbols as unknown[])
    .filter((s: any) => s.status === "TRADING" && s.symbol.includes(upper))
    .slice(0, 30)
    .map((s: any) => ({
      symbol: s.symbol as string,
      base: s.baseAsset as string,
      quote: s.quoteAsset as string,
    }));
}

/** 获取所有 USDT 交易对（用于全市场扫描） */
export async function fetchAllUsdtSymbols(
  signal?: AbortSignal,
): Promise<{ symbol: string; base: string }[]> {
  const data = await getWithFallback<any>("/api/v3/exchangeInfo", { permissions: "SPOT" }, signal);
  return (data.symbols as unknown[])
    .filter((s: any) =>
      s.status === "TRADING" &&
      s.quoteAsset === "USDT" &&
      !s.baseAsset.includes("UP") &&
      !s.baseAsset.includes("DOWN") &&
      !s.baseAsset.includes("BULL") &&
      !s.baseAsset.includes("BEAR")
    )
    .map((s: any) => ({
      symbol: s.symbol as string,
      base: s.baseAsset as string,
    }));
}

/** 获取当前价格 */
export async function fetchPrice(symbol: string, signal?: AbortSignal): Promise<number> {
  const data = await getWithFallback<{ price: string }>("/api/v3/ticker/price", { symbol }, signal);
  return Number(data.price);
}

/** 合约 API 故障转移 */
async function getFuturesWithFallback<T>(path: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown;
  for (const client of futuresClients) {
    try {
      const res = await client.get<T>(path, { params, signal });
      return res.data;
    } catch (err) {
      if ((err as any)?.name === "AbortError" || (err as any)?.code === "ERR_CANCELED") throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("所有合约端点请求失败");
}

/** 获取合约持仓量历史 (Open Interest) */
export async function fetchOpenInterestHist(
  symbol: string,
  period: Timeframe,
  limit = 100,
  signal?: AbortSignal,
): Promise<OIDataPoint[]> {
  try {
    const data = await getFuturesWithFallback<unknown[]>(
      "/futures/data/openInterestHist",
      { symbol, period, limit },
      signal,
    );
    return data.map((row: any) => ({
      time: Math.floor(Number(row.timestamp) / 1000),
      openInterest: Number(row.sumOpenInterest),
      openInterestValue: Number(row.sumOpenInterestValue),
    }));
  } catch {
    return [];
  }
}

/** 获取当前持仓量 */
export async function fetchOpenInterest(
  symbol: string,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const data = await getFuturesWithFallback<{ openInterest: string }>(
      "/fapi/v1/openInterest",
      { symbol },
      signal,
    );
    return Number(data.openInterest);
  } catch {
    return 0;
  }
}
