import axios from "axios";
import { hmacSha256, timestamp } from "../lib/crypto.js";
import type {
  ApiCredentials,
  CancelOrderRequest,
  ClosePositionRequest,
  ExchangeAccount,
  ExchangePosition,
  PlaceOrderRequest,
  PlaceOrderResponse,
  SetLeverageRequest,
} from "../lib/types.js";

/**
 * Binance USDⓈ-M 合约 API 适配器
 */

const RECV_WINDOW = 5000;

/** 根据 testnet 标记返回 base URL */
function getBaseUrl(creds: ApiCredentials): string {
  return creds.testnet
    ? "https://testnet.binancefuture.com"
    : "https://fapi.binance.com";
}

/** 构造签名后的 query string */
function buildSignedQuery(creds: ApiCredentials, params: Record<string, string | number | boolean | undefined>): string {
  const query: string[] = [];
  query.push(`timestamp=${timestamp()}`);
  query.push(`recvWindow=${RECV_WINDOW}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.push(`${key}=${value}`);
  }
  const queryString = query.join("&");
  const signature = hmacSha256(creds.apiSecret, queryString);
  return `${queryString}&signature=${signature}`;
}

/** 构造请求头 */
function buildHeaders(creds: ApiCredentials): Record<string, string> {
  return {
    "X-MBX-APIKEY": creds.apiKey,
  };
}

/** 处理 axios 错误，提取交易所返回的 code 和 msg */
function handleAxiosError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { code?: number; msg?: string } | undefined;
    const code = data?.code ?? err.code ?? "UNKNOWN";
    const msg = data?.msg ?? err.message ?? "Binance API request failed";
    const status = err.response?.status ?? 500;
    const error = new Error(`[Binance ${code}] ${msg}`) as Error & {
      status: number;
      code: string | number;
      exchange: string;
    };
    error.status = status;
    error.code = code;
    error.exchange = "binance";
    throw error;
  }
  throw err;
}

/**
 * 测试连接 - GET /fapi/v2/account
 */
export async function testConnection(creds: ApiCredentials): Promise<boolean> {
  try {
    await getAccount(creds);
    return true;
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 获取账户信息 - GET /fapi/v2/account
 */
export async function getAccount(creds: ApiCredentials): Promise<ExchangeAccount> {
  const url = `${getBaseUrl(creds)}/fapi/v2/account?${buildSignedQuery(creds, {})}`;
  try {
    const res = await axios.get(url, { headers: buildHeaders(creds) });
    const data = res.data;

    // 获取持仓
    let positions: ExchangePosition[] = [];
    try {
      positions = await getPositions(creds);
    } catch {
      // 持仓获取失败不影响账户信息返回
      positions = [];
    }

    return {
      exchange: "binance",
      totalWalletBalance: Number(data.totalWalletBalance ?? 0),
      availableBalance: Number(data.availableBalance ?? 0),
      marginBalance: Number(data.totalMarginBalance ?? 0),
      unrealizedProfit: Number(data.totalUnrealizedProfit ?? 0),
      positions,
    };
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 获取持仓 - GET /fapi/v2/positionRisk
 */
export async function getPositions(creds: ApiCredentials): Promise<ExchangePosition[]> {
  const url = `${getBaseUrl(creds)}/fapi/v2/positionRisk?${buildSignedQuery(creds, {})}`;
  try {
    const res = await axios.get(url, { headers: buildHeaders(creds) });
    const list = res.data as Array<Record<string, unknown>>;
    const positions: ExchangePosition[] = [];

    for (const item of list) {
      const positionAmt = Number(item.positionAmt ?? 0);
      // 过滤掉仓位为 0 的记录（除非是 BOTH 模式的对冲单边）
      if (positionAmt === 0) continue;

      positions.push({
        symbol: String(item.symbol ?? ""),
        positionAmt,
        entryPrice: Number(item.entryPrice ?? 0),
        markPrice: Number(item.markPrice ?? 0),
        unRealizedProfit: Number(item.unRealizedProfit ?? 0),
        liquidationPrice: Number(item.liquidationPrice ?? 0),
        leverage: Number(item.leverage ?? 1),
        positionSide: (String(item.positionSide ?? "BOTH") as ExchangePosition["positionSide"]),
        marginType: String(item.marginType ?? "cross").toLowerCase() === "isolated" ? "isolated" : "cross",
        updateTime: Number(item.updateTime ?? 0),
      });
    }

    return positions;
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 下单 - POST /fapi/v1/order
 */
export async function placeOrder(creds: ApiCredentials, params: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
    price: params.price,
    stopPrice: params.stopPrice,
    reduceOnly: params.reduceOnly ? "true" : undefined,
    positionSide: params.positionSide,
    timeInForce: params.type === "LIMIT" ? "GTC" : undefined,
  };

  const url = `${getBaseUrl(creds)}/fapi/v1/order?${buildSignedQuery(creds, queryParams)}`;
  try {
    const res = await axios.post(url, null, { headers: buildHeaders(creds) });
    const data = res.data;
    return {
      orderId: String(data.orderId ?? ""),
      symbol: String(data.symbol ?? params.symbol),
      status: String(data.status ?? "NEW") as PlaceOrderResponse["status"],
      type: String(data.type ?? params.type) as PlaceOrderResponse["type"],
      side: String(data.side ?? params.side) as PlaceOrderResponse["side"],
      price: Number(data.price ?? 0),
      origQty: Number(data.origQty ?? params.quantity),
      executedQty: Number(data.executedQty ?? 0),
      avgPrice: Number(data.avgPrice ?? 0),
      time: Number(data.updateTime ?? timestamp()),
    };
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 平仓 - 使用 reduceOnly=true 的反向订单
 * 自动判断当前持仓方向并构造反向订单
 */
export async function closePosition(creds: ApiCredentials, params: ClosePositionRequest): Promise<PlaceOrderResponse> {
  // 获取当前持仓，找到对应的仓位
  const positions = await getPositions(creds);
  const target = positions.find(
    (p) => p.symbol === params.symbol && (!params.positionSide || p.positionSide === params.positionSide)
  );

  if (!target) {
    const error = new Error(`[Binance] No position found for ${params.symbol}`) as Error & {
      status: number;
      code: string;
      exchange: string;
    };
    error.status = 404;
    error.code = "NO_POSITION";
    error.exchange = "binance";
    throw error;
  }

  // 反向订单方向
  const closeSide = target.positionAmt > 0 ? "SELL" : "BUY";
  // 平仓数量（取绝对值）
  const closeQty = params.quantity ?? Math.abs(target.positionAmt);

  return placeOrder(creds, {
    exchange: "binance",
    symbol: params.symbol,
    side: closeSide,
    type: "MARKET",
    quantity: closeQty,
    reduceOnly: true,
    positionSide: target.positionSide,
  });
}

/**
 * 撤单 - DELETE /fapi/v1/order
 */
export async function cancelOrder(creds: ApiCredentials, params: CancelOrderRequest): Promise<{ orderId: string; symbol: string; status: string }> {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    symbol: params.symbol,
    orderId: params.orderId,
    origClientOrderId: params.clientOrderId,
  };

  const url = `${getBaseUrl(creds)}/fapi/v1/order?${buildSignedQuery(creds, queryParams)}`;
  try {
    const res = await axios.delete(url, { headers: buildHeaders(creds) });
    const data = res.data;
    return {
      orderId: String(data.orderId ?? ""),
      symbol: String(data.symbol ?? params.symbol),
      status: String(data.status ?? "CANCELED"),
    };
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 设置杠杆 - POST /fapi/v1/leverage
 */
export async function setLeverage(creds: ApiCredentials, params: SetLeverageRequest): Promise<{ symbol: string; leverage: number; maxNotionalValue: number }> {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    symbol: params.symbol,
    leverage: params.leverage,
  };

  const url = `${getBaseUrl(creds)}/fapi/v1/leverage?${buildSignedQuery(creds, queryParams)}`;
  try {
    const res = await axios.post(url, null, { headers: buildHeaders(creds) });
    const data = res.data;
    return {
      symbol: String(data.symbol ?? params.symbol),
      leverage: Number(data.leverage ?? params.leverage),
      maxNotionalValue: Number(data.maxNotionalValue ?? 0),
    };
  } catch (err) {
    handleAxiosError(err);
  }
}
