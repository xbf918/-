import axios from "axios";
import type {
  ApiCredentials,
  ExchangeAccount,
  ExchangeId,
  PlaceOrderRequest,
  PlaceOrderResponse,
  ExchangePosition,
} from "@/types/exchange";

// 使用相对路径，由 Vite 插件 / 后端代理提供 /api/* 端点
const client = axios.create({ baseURL: "", timeout: 15_000 });

const API = {
  credentials: "/api/credentials",
  testConnection: "/api/credentials/test",
  account: "/api/account",
  positions: "/api/positions",
  order: "/api/order",
  closePosition: "/api/order/close",
  cancelOrder: "/api/order/cancel",
  leverage: "/api/leverage",
};

/** 保存交易所 API 凭证 */
export async function saveCredentials(
  creds: Omit<ApiCredentials, "createdAt" | "validated">,
): Promise<ApiCredentials> {
  const { data } = await client.post(API.credentials, creds);
  return data;
}

/** 获取所有已保存的凭证（secret 脱敏） */
export async function getAllCredentials(): Promise<
  Record<ExchangeId, ApiCredentials | null>
> {
  const { data } = await client.get(API.credentials);
  return data;
}

/** 删除凭证 */
export async function deleteCredentials(exchange: ExchangeId): Promise<void> {
  await client.delete(`${API.credentials}/${exchange}`);
}

/** 测试交易所连接（可传完整凭证，也可用已保存的凭证） */
export async function testConnection(
  exchange: ExchangeId,
  creds?: { apiKey: string; apiSecret: string; passphrase?: string; testnet: boolean },
): Promise<{ success: boolean; account?: ExchangeAccount; error?: string }> {
  try {
    const payload = creds ? { exchange, ...creds } : { exchange };
    const { data } = await client.post(API.testConnection, payload);
    return {
      success: data.success !== false,
      account: data.account,
      error: data.success === false ? data.error : undefined,
    };
  } catch (err: any) {
    return { success: false, error: err?.response?.data?.error ?? err?.message ?? "Unknown error" };
  }
}

/** 获取交易所账户信息 */
export async function getAccount(exchange: ExchangeId): Promise<ExchangeAccount> {
  const { data } = await client.get(API.account, { params: { exchange } });
  return data;
}

/** 获取持仓列表 */
export async function getPositions(exchange: ExchangeId): Promise<ExchangePosition[]> {
  const { data } = await client.get(API.positions, { params: { exchange } });
  return data;
}

/** 下单 */
export async function placeOrder(
  req: PlaceOrderRequest,
): Promise<PlaceOrderResponse> {
  const { data } = await client.post(API.order, req);
  return data;
}

/** 平仓 */
export async function closePosition(params: {
  exchange: ExchangeId;
  symbol: string;
  positionSide?: string;
}): Promise<PlaceOrderResponse> {
  const { data } = await client.post(API.closePosition, params);
  return data;
}

/** 撤单 */
export async function cancelOrder(params: {
  exchange: ExchangeId;
  symbol: string;
  orderId: string;
}): Promise<void> {
  await client.post(API.cancelOrder, params);
}

/** 设置杠杆 */
export async function setLeverage(params: {
  exchange: ExchangeId;
  symbol: string;
  leverage: number;
}): Promise<void> {
  await client.post(API.leverage, params);
}
