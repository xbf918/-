import axios from "axios";
import { hmacSha256Base64, isoTimestamp, timestamp } from "../lib/crypto.js";
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
 * OKX V5 API 适配器
 */

const BASE_URL = "https://www.okx.com";

/** 构造 OKX 签名头 */
function buildHeaders(
  creds: ApiCredentials,
  method: string,
  requestPath: string,
  body: string = ""
): Record<string, string> {
  const ts = isoTimestamp();
  const preHash = ts + method.toUpperCase() + requestPath + body;
  const sign = hmacSha256Base64(creds.apiSecret, preHash);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
    "Content-Type": "application/json",
  };

  // 模拟交易模式
  if (creds.testnet) {
    headers["x-simulated-trading"] = "1";
  }

  return headers;
}

/** 处理 axios 错误，提取交易所返回的 code 和 msg */
function handleAxiosError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { code?: string; msg?: string; data?: Array<{ sCode?: string; sMsg?: string }> } | undefined;
    // OKX 错误可能在顶层 code/msg，也可能在 data[0].sCode/sMsg
    const code = data?.code ?? data?.data?.[0]?.sCode ?? err.code ?? "UNKNOWN";
    const msg = data?.msg ?? data?.data?.[0]?.sMsg ?? err.message ?? "OKX API request failed";
    const status = err.response?.status ?? 500;
    const error = new Error(`[OKX ${code}] ${msg}`) as Error & {
      status: number;
      code: string | number;
      exchange: string;
    };
    error.status = status;
    error.code = code;
    error.exchange = "okx";
    throw error;
  }
  throw err;
}

/** 校验 OKX 响应 body（code !== "0" 表示业务错误） */
function assertOkxSuccess(body: { code: string; msg: string; data?: unknown[] }): void {
  if (body.code !== "0") {
    const error = new Error(`[OKX ${body.code}] ${body.msg}`) as Error & {
      status: number;
      code: string | number;
      exchange: string;
    };
    error.status = 400;
    error.code = body.code;
    error.exchange = "okx";
    throw error;
  }
}

/**
 * 测试连接 - GET /api/v5/account/balance
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
 * 获取账户信息 - GET /api/v5/account/balance
 */
export async function getAccount(creds: ApiCredentials): Promise<ExchangeAccount> {
  const requestPath = "/api/v5/account/balance";
  const url = `${BASE_URL}${requestPath}`;
  try {
    const res = await axios.get(url, { headers: buildHeaders(creds, "GET", requestPath) });
    assertOkxSuccess(res.data);
    const data = (res.data.data as Array<Record<string, unknown>>)[0] ?? {};

    // 汇总各币种余额
    const details = (data.details as Array<Record<string, unknown>>) ?? [];
    let totalWalletBalance = 0;
    let availableBalance = 0;
    for (const d of details) {
      totalWalletBalance += Number(d.eq ?? 0);
      availableBalance += Number(d.availBal ?? d.cashBal ?? 0);
    }

    // 获取持仓
    let positions: ExchangePosition[] = [];
    try {
      positions = await getPositions(creds);
    } catch {
      positions = [];
    }

    return {
      exchange: "okx",
      totalWalletBalance,
      availableBalance,
      marginBalance: Number(data.totalEq ?? totalWalletBalance),
      unrealizedProfit: Number(data.upl ?? 0),
      positions,
    };
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 获取持仓 - GET /api/v5/account/positions
 */
export async function getPositions(creds: ApiCredentials): Promise<ExchangePosition[]> {
  const requestPath = "/api/v5/account/positions";
  const url = `${BASE_URL}${requestPath}`;
  try {
    const res = await axios.get(url, { headers: buildHeaders(creds, "GET", requestPath) });
    assertOkxSuccess(res.data);
    const list = (res.data.data as Array<Record<string, unknown>>) ?? [];

    const positions: ExchangePosition[] = [];
    for (const item of list) {
      const pos = Number(item.pos ?? 0);
      if (pos === 0) continue;

      // OKX posSide: long/short/net -> 映射到 LONG/SHORT/BOTH
      const posSideRaw = String(item.posSide ?? "net");
      const positionSide: ExchangePosition["positionSide"] =
        posSideRaw === "long" ? "LONG" : posSideRaw === "short" ? "SHORT" : "BOTH";

      positions.push({
        symbol: String(item.instId ?? ""),
        positionAmt: pos,
        entryPrice: Number(item.avgPx ?? 0),
        markPrice: Number(item.markPx ?? 0),
        unRealizedProfit: Number(item.upl ?? 0),
        liquidationPrice: Number(item.liqPx ?? 0),
        leverage: Number(item.lever ?? 1),
        positionSide,
        marginType: String(item.mgnMode ?? "cross") === "isolated" ? "isolated" : "cross",
        updateTime: Number(item.uTime ?? 0),
      });
    }

    return positions;
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 下单 - POST /api/v5/trade/order
 */
export async function placeOrder(creds: ApiCredentials, params: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  const requestPath = "/api/v5/trade/order";

  // 映射订单类型
  const ordTypeMap: Record<string, string> = {
    MARKET: "market",
    LIMIT: "limit",
    STOP_MARKET: "trigger",
    TAKE_PROFIT_MARKET: "trigger",
  };
  const ordType = ordTypeMap[params.type] ?? "market";

  // 映射 posSide
  let posSide: string | undefined;
  if (params.positionSide === "LONG") posSide = "long";
  else if (params.positionSide === "SHORT") posSide = "short";
  else posSide = "net";

  const bodyObj: Record<string, unknown> = {
    instId: params.symbol,
    tdMode: "cross",
    side: params.side.toLowerCase(),
    posSide,
    ordType,
    sz: String(params.quantity),
  };

  // 限价单需要价格
  if (params.type === "LIMIT" && params.price !== undefined) {
    bodyObj.px = String(params.price);
  }

  // 触发单需要触发价
  if (params.stopPrice !== undefined) {
    bodyObj.triggerPx = String(params.stopPrice);
    // 触发后执行方式：市价
    bodyObj.orderPx = "-1";
  }

  // reduceOnly: OKX 通过 tgtCcy 或 posSide 处理，这里使用 closePos 标记
  if (params.reduceOnly) {
    // OKX 通过设置 reduceOnly 实现只减仓
    bodyObj.reduceOnly = true;
  }

  const bodyStr = JSON.stringify(bodyObj);
  const url = `${BASE_URL}${requestPath}`;

  try {
    const res = await axios.post(url, bodyStr, { headers: buildHeaders(creds, "POST", requestPath, bodyStr) });
    assertOkxSuccess(res.data);
    const data = (res.data.data as Array<Record<string, unknown>>)[0] ?? {};

    return {
      orderId: String(data.ordId ?? ""),
      symbol: params.symbol,
      status: "NEW",
      type: params.type,
      side: params.side,
      price: Number(params.price ?? 0),
      origQty: Number(params.quantity),
      executedQty: 0,
      avgPrice: 0,
      time: timestamp(),
    };
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 平仓 - 使用 posSide 反向的订单
 * 自动判断当前持仓方向并构造反向订单
 */
export async function closePosition(creds: ApiCredentials, params: ClosePositionRequest): Promise<PlaceOrderResponse> {
  // 获取当前持仓
  const positions = await getPositions(creds);
  const target = positions.find(
    (p) => p.symbol === params.symbol && (!params.positionSide || p.positionSide === params.positionSide)
  );

  if (!target) {
    const error = new Error(`[OKX] No position found for ${params.symbol}`) as Error & {
      status: number;
      code: string;
      exchange: string;
    };
    error.status = 404;
    error.code = "NO_POSITION";
    error.exchange = "okx";
    throw error;
  }

  // 反向订单方向：多头持仓 -> 卖出；空头持仓 -> 买入
  const closeSide = target.positionAmt > 0 ? "SELL" : "BUY";
  const closeQty = params.quantity ?? Math.abs(target.positionAmt);

  return placeOrder(creds, {
    exchange: "okx",
    symbol: params.symbol,
    side: closeSide,
    type: "MARKET",
    quantity: closeQty,
    reduceOnly: true,
    positionSide: target.positionSide,
  });
}

/**
 * 撤单 - POST /api/v5/trade/cancel-order
 */
export async function cancelOrder(creds: ApiCredentials, params: CancelOrderRequest): Promise<{ orderId: string; symbol: string; status: string }> {
  const requestPath = "/api/v5/trade/cancel-order";

  const bodyObj: Record<string, unknown> = {
    instId: params.symbol,
  };
  if (params.orderId) {
    bodyObj.ordId = params.orderId;
  }
  if (params.clientOrderId) {
    bodyObj.clOrdId = params.clientOrderId;
  }

  const bodyStr = JSON.stringify(bodyObj);
  const url = `${BASE_URL}${requestPath}`;

  try {
    const res = await axios.post(url, bodyStr, { headers: buildHeaders(creds, "POST", requestPath, bodyStr) });
    assertOkxSuccess(res.data);
    const data = (res.data.data as Array<Record<string, unknown>>)[0] ?? {};

    return {
      orderId: String(data.ordId ?? params.orderId ?? ""),
      symbol: params.symbol,
      status: "CANCELED",
    };
  } catch (err) {
    handleAxiosError(err);
  }
}

/**
 * 设置杠杆 - POST /api/v5/account/set-leverage
 */
export async function setLeverage(creds: ApiCredentials, params: SetLeverageRequest): Promise<{ symbol: string; leverage: number; maxNotionalValue: number }> {
  const requestPath = "/api/v5/account/set-leverage";

  const bodyObj: Record<string, unknown> = {
    instId: params.symbol,
    lever: String(params.leverage),
    mgnMode: params.mgnMode ?? "cross",
  };

  // posSide: 在对冲模式下需要指定
  if (params.positionSide === "LONG") {
    bodyObj.posSide = "long";
  } else if (params.positionSide === "SHORT") {
    bodyObj.posSide = "short";
  } else {
    bodyObj.posSide = "net";
  }

  const bodyStr = JSON.stringify(bodyObj);
  const url = `${BASE_URL}${requestPath}`;

  try {
    const res = await axios.post(url, bodyStr, { headers: buildHeaders(creds, "POST", requestPath, bodyStr) });
    assertOkxSuccess(res.data);

    return {
      symbol: params.symbol,
      leverage: params.leverage,
      maxNotionalValue: 0,
    };
  } catch (err) {
    handleAxiosError(err);
  }
}
