/**
 * 交易所接入相关类型定义
 */

/** 支持的交易所 */
export type ExchangeId = "binance" | "okx" | "paper";

/** 交易模式 */
export type TradeMode = "paper" | "live";

/** 合约方向 */
export type PositionSide = "LONG" | "SHORT" | "BOTH";

/** 订单类型 */
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";

/** 订单方向 */
export type OrderSide = "BUY" | "SELL";

/** 订单状态 */
export type OrderStatus =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";

/** 交易所 API 凭证 */
export interface ApiCredentials {
  exchange: ExchangeId;
  apiKey: string;
  apiSecret: string;
  /** OKX 需要 passphrase，Binance 不需要 */
  passphrase?: string;
  /** 是否使用测试网 */
  testnet: boolean;
  /** 权限标记 */
  permissions: string[];
  /** 创建时间 */
  createdAt: number;
  /** 最后验证时间 */
  lastValidated?: number;
  /** 验证状态 */
  validated: boolean;
}

/** 交易所账户信息 */
export interface ExchangeAccount {
  exchange: ExchangeId;
  totalWalletBalance: number;
  availableBalance: number;
  marginBalance: number;
  unrealizedProfit: number;
  positions: ExchangePosition[];
}

/** 交易所持仓 */
export interface ExchangePosition {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  leverage: number;
  positionSide: PositionSide;
  marginType: "isolated" | "cross";
  updateTime: number;
}

/** 下单请求 */
export interface PlaceOrderRequest {
  exchange: ExchangeId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  leverage?: number;
  reduceOnly?: boolean;
  positionSide?: PositionSide;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

/** 下单响应 */
export interface PlaceOrderResponse {
  orderId: string;
  symbol: string;
  status: OrderStatus;
  type: OrderType;
  side: OrderSide;
  price: number;
  origQty: number;
  executedQty: number;
  avgPrice: number;
  time: number;
}

/** 交易所连接状态 */
export interface ExchangeConnection {
  exchange: ExchangeId;
  connected: boolean;
  testing: boolean;
  error?: string;
  account?: ExchangeAccount;
}

/** 交易所配置 */
export interface ExchangeConfig {
  mode: TradeMode;
  activeExchange: ExchangeId;
  credentials: Record<ExchangeId, ApiCredentials | null>;
  autoSync: boolean;
  syncInterval: number;
}

/** 交易所信息 */
export interface ExchangeInfo {
  id: ExchangeId;
  name: string;
  nameCn: string;
  logo: string;
  color: string;
  testnetSupported: boolean;
  requiresPassphrase: boolean;
  url: string;
  testnetUrl: string;
  apiKeyUrl: string;
  testnetApiKeyUrl?: string;
}
