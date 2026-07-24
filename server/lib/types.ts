/**
 * 交易所相关类型定义（服务端）
 * 与前端 src/types/exchange.ts 保持一致
 */

export type ExchangeId = "binance" | "okx" | "paper";

export type PositionSide = "LONG" | "SHORT" | "BOTH";

export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";

export type OrderSide = "BUY" | "SELL";

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

/** 平仓请求参数 */
export interface ClosePositionRequest {
  exchange: ExchangeId;
  symbol: string;
  positionSide?: PositionSide;
  quantity?: number;
}

/** 撤单请求参数 */
export interface CancelOrderRequest {
  exchange: ExchangeId;
  symbol: string;
  orderId?: string;
  clientOrderId?: string;
}

/** 设置杠杆请求参数 */
export interface SetLeverageRequest {
  exchange: ExchangeId;
  symbol: string;
  leverage: number;
  positionSide?: PositionSide;
  mgnMode?: "isolated" | "cross";
}

/** API 错误 */
export interface ApiError {
  code: string | number;
  msg: string;
  exchange?: ExchangeId;
}
