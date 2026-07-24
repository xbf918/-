import type { ExchangeInfo, ExchangeId } from "@/types/exchange";

/** 交易所信息列表 */
export const EXCHANGES: Record<ExchangeId, ExchangeInfo> = {
  binance: {
    id: "binance",
    name: "Binance",
    nameCn: "币安",
    logo: "BINANCE",
    color: "#F0B90B",
    testnetSupported: true,
    requiresPassphrase: false,
    url: "https://fapi.binance.com",
    testnetUrl: "https://testnet.binancefuture.com",
    apiKeyUrl: "https://www.binance.com/en/my/settings/api-management",
    testnetApiKeyUrl: "https://testnet.binance.vision/",
  },
  okx: {
    id: "okx",
    name: "OKX",
    nameCn: "欧易",
    logo: "OKX",
    color: "#4299E1",
    testnetSupported: true,
    requiresPassphrase: true,
    url: "https://www.okx.com",
    testnetUrl: "https://www.okx.com",
    apiKeyUrl: "https://www.okx.com/account/my-api",
    testnetApiKeyUrl: "https://www.okx.com/account/my-api",
  },
  paper: {
    id: "paper",
    name: "Paper Trading",
    nameCn: "模拟交易",
    logo: "PAPER",
    color: "#00FF88",
    testnetSupported: false,
    requiresPassphrase: false,
    url: "",
    testnetUrl: "",
    apiKeyUrl: "",
  },
};

/** 后端代理服务器地址 */
export const PROXY_BASE_URL = "http://localhost:3456";

/** 代理 API 端点 */
export const PROXY_ENDPOINTS = {
  // 凭证管理
  saveCredentials: "/api/credentials",
  getCredentials: "/api/credentials",
  deleteCredentials: "/api/credentials",
  testConnection: "/api/credentials/test",
  // 账户
  getAccount: "/api/account",
  // 交易
  placeOrder: "/api/order",
  closePosition: "/api/order/close",
  cancelOrder: "/api/order/cancel",
  setLeverage: "/api/leverage",
  // 持仓
  getPositions: "/api/positions",
} as const;
