import type { Timeframe, ScoreWeights, SymbolInfo, TradingConfig } from "@/types";

// 时间周期配置（含秒数用于排序与显示）
export const TIMEFRAMES: {
  value: Timeframe;
  label: string;
  seconds: number;
}[] = [
  { value: "15m", label: "15m", seconds: 15 * 60 },
  { value: "1h", label: "1H", seconds: 60 * 60 },
  { value: "4h", label: "4H", seconds: 4 * 60 * 60 },
  { value: "1d", label: "1D", seconds: 24 * 60 * 60 },
];

export const DEFAULT_TIMEFRAME: Timeframe = "4h";

// 默认交易对列表
export const DEFAULT_SYMBOLS: SymbolInfo[] = [
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT" },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT" },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT" },
  { symbol: "BNBUSDT", base: "BNB", quote: "USDT" },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT" },
  { symbol: "DOGEUSDT", base: "DOGE", quote: "USDT" },
  { symbol: "ADAUSDT", base: "ADA", quote: "USDT" },
  { symbol: "AVAXUSDT", base: "AVAX", quote: "USDT" },
  { symbol: "LINKUSDT", base: "LINK", quote: "USDT" },
  { symbol: "MATICUSDT", base: "MATIC", quote: "USDT" },
];

// 默认评分权重
export const DEFAULT_WEIGHTS: ScoreWeights = {
  technical: 0.3,
  divergence: 0.2,
  liquidity: 0.2,
  timeframe: 0.2,
  sentiment: 0.1,
};

// K线请求条数
export const KLINE_LIMIT = 300;

// 轮询间隔（毫秒）
export const REFRESH_INTERVAL = 30_000;

// API 端点（使用 Binance 和 OKX 公共数据镜像，CORS 友好且地理可达）
export const ENDPOINTS = {
  binance: "https://data-api.binance.vision",
  binanceFallback: "https://api.binance.com",
  binanceFutures: "https://fapi.binance.com",
  binanceFuturesFallback: "https://dapi.binance.com",
  okx: "https://www.okx.com",
  okxFutures: "https://www.okx.com",
  cryptocompare: "https://min-api.cryptocompare.com",
  fearGreed: "https://api.alternative.me",
} as const;

// 交易所配置
export const EXCHANGES = {
  binance: {
    name: "Binance",
    nameCn: "币安",
    apiKeyUrl: "https://www.binance.com/en/my/settings/api-management",
    testnetApiKeyUrl: "https://testnet.binance.vision/",
    requiresPassphrase: false,
    testnetSupported: true,
    color: "#f3ba2f",
  },
  okx: {
    name: "OKX",
    nameCn: "欧意",
    apiKeyUrl: "https://www.okx.com/account/myApiKeys",
    testnetApiKeyUrl: "https://www.okx.com/account/myApiKeys",
    requiresPassphrase: true,
    testnetSupported: true,
    color: "#4f46e5",
  },
} as const;

// 默认交易配置
export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  enabled: false,
  leverage: 10,
  orderSizePercent: 10,
  takeProfitPercent: 3,
  stopLossPercent: 1.5,
  signalThreshold: 50,
  maxOpenPositions: 1,
  allowHedge: false,
  trailingStop: false,
  trailingStopPercent: 1,
};

// 初始模拟账户余额（USDT）
export const INITIAL_BALANCE = 10_000;

// 维持保证金率（用于计算强平价）
export const MAINTENANCE_MARGIN_RATE = 0.005;
