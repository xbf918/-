import axios, { type AxiosInstance } from "axios";
import type { Candle, OrderBook, OrderBookLevel, Ticker24h, Timeframe, OIDataPoint } from "@/types";
import { ENDPOINTS, KLINE_LIMIT } from "@/lib/constants";

const clients: AxiosInstance[] = [
  axios.create({ baseURL: ENDPOINTS.okx, timeout: 12_000 }),
];

async function getWithFallback<T>(path: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown;
  for (const client of clients) {
    try {
      const res = await client.get<T>(path, { params, signal });
      return res.data;
    } catch (err) {
      if ((err as any)?.name === "AbortError" || (err as any)?.code === "ERR_CANCELED") throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("所有 OKX 端点请求失败");
}

/**
 * 将币安格式的交易对转换为 OKX 格式
 * 币安: BTCUSDT → OKX: BTC-USDT
 * 如果已经是 OKX 格式（含连字符），则原样返回
 */
function toOkxSymbol(symbol: string): string {
  if (symbol.includes("-")) return symbol;
  // 常见计价货币，按长度降序匹配
  const quotes = ["USDT", "USDC", "USD", "BUSD", "TUSD", "FDUSD", "EUR"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) {
      return `${symbol.slice(0, -q.length)}-${q}`;
    }
  }
  return symbol;
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = KLINE_LIMIT,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const intervalMap: Record<Timeframe, string> = {
    "15m": "15m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
  };
  const data = await getWithFallback<any>(
    "/api/v5/market/history-candles",
    {
      instId: toOkxSymbol(symbol),
      bar: intervalMap[interval],
      limit,
    },
    signal,
  );
  if (data.code !== "0") throw new Error(data.msg);
  return (data.data as unknown[][])
    .reverse()
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));
}

export async function fetchDepth(
  symbol: string,
  limit: 100 | 500 | 1000 = 500,
  signal?: AbortSignal,
): Promise<OrderBook> {
  // OKX 订单簿接口 sz 最大 200，超过会报 Parameter sz error
  const sz = Math.min(limit, 200);
  const data = await getWithFallback<any>(
    "/api/v5/market/books",
    { instId: toOkxSymbol(symbol), sz },
    signal,
  );
  if (data.code !== "0") throw new Error(data.msg);
  const toLevels = (arr: unknown[][]): OrderBookLevel[] =>
    arr.map((row) => ({ price: Number(row[0]), qty: Number(row[1]) }));
  return {
    bids: toLevels(data.data[0].bids),
    asks: toLevels(data.data[0].asks),
    lastUpdateId: Date.now(),
  };
}

export async function fetchTicker24h(
  symbol: string,
  signal?: AbortSignal,
): Promise<Ticker24h> {
  const data = await getWithFallback<any>(
    "/api/v5/market/ticker",
    { instId: toOkxSymbol(symbol) },
    signal,
  );
  if (data.code !== "0") throw new Error(data.msg);
  const d = data.data[0];
  return {
    symbol: symbol, // 保持传入的交易对格式
    lastPrice: Number(d.last),
    priceChangePercent: Number(d.changePct) * 100,
    highPrice: Number(d.high24h),
    lowPrice: Number(d.low24h),
    volume: Number(d.vol24h),
    quoteVolume: Number(d.volCcy24h),
  };
}

export async function searchSymbols(
  keyword: string,
  signal?: AbortSignal,
): Promise<{ symbol: string; base: string; quote: string }[]> {
  if (!keyword) return [];
  const data = await getWithFallback<any>("/api/v5/market/instruments", { instType: "SPOT" }, signal);
  if (data.code !== "0") return [];
  const upper = keyword.toUpperCase();
  return (data.data as unknown[])
    .filter((s: any) => s.state === "live" && s.instId.includes(upper))
    .slice(0, 30)
    .map((s: any) => {
      const parts = s.instId.split("-");
      return {
        symbol: parts.join("") as string,
        base: parts[0] as string,
        quote: parts[1] as string,
      };
    });
}

/** 获取所有 USDT 交易对（用于全市场扫描） */
export async function fetchAllUsdtSymbols(
  signal?: AbortSignal,
): Promise<{ symbol: string; base: string }[]> {
  const data = await getWithFallback<any>("/api/v5/market/instruments", { instType: "SPOT" }, signal);
  if (data.code !== "0") return [];
  return (data.data as unknown[])
    .filter((s: any) => {
      if (s.state !== "live") return false;
      const parts = s.instId.split("-");
      if (parts[1] !== "USDT") return false;
      // 排除杠杆代币
      const base = parts[0] as string;
      return !base.includes("UP") && !base.includes("DOWN") && !base.includes("BULL") && !base.includes("BEAR");
    })
    .map((s: any) => {
      const parts = s.instId.split("-");
      return {
        symbol: parts.join("") as string,
        base: parts[0] as string,
      };
    });
}

export async function fetchPrice(symbol: string, signal?: AbortSignal): Promise<number> {
  const data = await getWithFallback<any>("/api/v5/market/ticker", { instId: toOkxSymbol(symbol) }, signal);
  if (data.code !== "0") throw new Error(data.msg);
  return Number(data.data[0].last);
}

export async function fetchOpenInterest(
  symbol: string,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const data = await getWithFallback<any>(
      "/api/v5/market/open-interest",
      { instId: toOkxSymbol(symbol) },
      signal,
    );
    if (data.code !== "0") return 0;
    return Number(data.data[0].oi);
  } catch {
    return 0;
  }
}

export async function fetchOpenInterestHist(
  symbol: string,
  period: Timeframe,
  limit = 100,
  signal?: AbortSignal,
): Promise<OIDataPoint[]> {
  try {
    const periodMap: Record<Timeframe, string> = {
      "15m": "15m",
      "1h": "1H",
      "4h": "4H",
      "1d": "1D",
    };
    const data = await getWithFallback<any>(
      "/api/v5/market/open-interest-history",
      { instId: toOkxSymbol(symbol), bar: periodMap[period], limit },
      signal,
    );
    if (data.code !== "0") return [];
    return (data.data as unknown[])
      .reverse()
      .map((row: any) => ({
        time: Math.floor(Number(row[0]) / 1000),
        openInterest: Number(row[1]),
        openInterestValue: Number(row[1]) * Number(row[2]),
      }));
  } catch {
    return [];
  }
}
