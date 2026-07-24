import express from "express";
import cors from "cors";
import * as binance from "./adapters/binance.js";
import * as okx from "./adapters/okx.js";
import {
  saveCredentials,
  getCredentials,
  deleteCredentials,
  getAllCredentials,
} from "./lib/storage.js";
import type {
  ApiCredentials,
  CancelOrderRequest,
  ClosePositionRequest,
  ExchangeId,
  PlaceOrderRequest,
  SetLeverageRequest,
} from "./lib/types.js";

const app = express();
const PORT = 3456;

// CORS 中间件，允许前端开发服务器
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

// JSON body parser
app.use(express.json());

/** 根据交易所获取适配器 */
function getAdapter(exchange: ExchangeId) {
  switch (exchange) {
    case "binance":
      return binance;
    case "okx":
      return okx;
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

/** 从请求中获取凭证，若存储中不存在则抛错 */
function requireCredentials(exchange: ExchangeId): ApiCredentials {
  const creds = getCredentials(exchange);
  if (!creds) {
    const err = new Error(`No credentials found for exchange: ${exchange}`) as Error & {
      status: number;
      code: string;
    };
    err.status = 404;
    err.code = "NO_CREDENTIALS";
    throw err;
  }
  return creds;
}

// ========== 凭证管理路由 ==========

/** POST /api/credentials - 保存凭证 */
app.post("/api/credentials", (req, res, next) => {
  try {
    const creds = req.body as ApiCredentials;
    if (!creds.exchange || !creds.apiKey || !creds.apiSecret) {
      const err = new Error("Missing required fields: exchange, apiKey, apiSecret") as Error & {
        status: number;
      };
      err.status = 400;
      throw err;
    }
    const now = Date.now();
    const fullCreds: ApiCredentials = {
      ...creds,
      createdAt: creds.createdAt ?? now,
      lastValidated: creds.lastValidated,
      validated: creds.validated ?? false,
      permissions: creds.permissions ?? [],
    };
    saveCredentials(fullCreds);
    res.json({ success: true, exchange: fullCreds.exchange });
  } catch (err) {
    next(err);
  }
});

/** GET /api/credentials - 获取所有凭证（隐藏 secret 中间部分） */
app.get("/api/credentials", (_req, res) => {
  res.json(getAllCredentials());
});

/** DELETE /api/credentials/:exchange - 删除凭证 */
app.delete("/api/credentials/:exchange", (req, res, next) => {
  try {
    const exchange = req.params.exchange as ExchangeId;
    const deleted = deleteCredentials(exchange);
    res.json({ success: deleted, exchange });
  } catch (err) {
    next(err);
  }
});

/** POST /api/credentials/test - 测试连接 */
app.post("/api/credentials/test", async (req, res, next) => {
  try {
    const creds = req.body as ApiCredentials;
    if (!creds.exchange || !creds.apiKey || !creds.apiSecret) {
      const err = new Error("Missing required fields: exchange, apiKey, apiSecret") as Error & {
        status: number;
      };
      err.status = 400;
      throw err;
    }
    const adapter = getAdapter(creds.exchange);
    const connected = await adapter.testConnection(creds);
    res.json({ success: connected, exchange: creds.exchange });
  } catch (err) {
    next(err);
  }
});

// ========== 账户与持仓路由 ==========

/** GET /api/account?exchange=xxx - 获取账户 */
app.get("/api/account", async (req, res, next) => {
  try {
    const exchange = req.query.exchange as ExchangeId;
    if (!exchange) {
      const err = new Error("Missing query param: exchange") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    const creds = requireCredentials(exchange);
    const adapter = getAdapter(exchange);
    const account = await adapter.getAccount(creds);
    res.json(account);
  } catch (err) {
    next(err);
  }
});

/** GET /api/positions?exchange=xxx - 获取持仓 */
app.get("/api/positions", async (req, res, next) => {
  try {
    const exchange = req.query.exchange as ExchangeId;
    if (!exchange) {
      const err = new Error("Missing query param: exchange") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    const creds = requireCredentials(exchange);
    const adapter = getAdapter(exchange);
    const positions = await adapter.getPositions(creds);
    res.json(positions);
  } catch (err) {
    next(err);
  }
});

// ========== 交易路由 ==========

/** POST /api/order - 下单 */
app.post("/api/order", async (req, res, next) => {
  try {
    const params = req.body as PlaceOrderRequest;
    if (!params.exchange || !params.symbol || !params.side || !params.type || params.quantity === undefined) {
      const err = new Error("Missing required fields: exchange, symbol, side, type, quantity") as Error & {
        status: number;
      };
      err.status = 400;
      throw err;
    }
    const creds = requireCredentials(params.exchange);
    const adapter = getAdapter(params.exchange);
    const result = await adapter.placeOrder(creds, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/order/close - 平仓 */
app.post("/api/order/close", async (req, res, next) => {
  try {
    const params = req.body as ClosePositionRequest;
    if (!params.exchange || !params.symbol) {
      const err = new Error("Missing required fields: exchange, symbol") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    const creds = requireCredentials(params.exchange);
    const adapter = getAdapter(params.exchange);
    const result = await adapter.closePosition(creds, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/order/cancel - 撤单 */
app.post("/api/order/cancel", async (req, res, next) => {
  try {
    const params = req.body as CancelOrderRequest;
    if (!params.exchange || !params.symbol || (!params.orderId && !params.clientOrderId)) {
      const err = new Error("Missing required fields: exchange, symbol, and either orderId or clientOrderId") as Error & {
        status: number;
      };
      err.status = 400;
      throw err;
    }
    const creds = requireCredentials(params.exchange);
    const adapter = getAdapter(params.exchange);
    const result = await adapter.cancelOrder(creds, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/leverage - 设置杠杆 */
app.post("/api/leverage", async (req, res, next) => {
  try {
    const params = req.body as SetLeverageRequest;
    if (!params.exchange || !params.symbol || params.leverage === undefined) {
      const err = new Error("Missing required fields: exchange, symbol, leverage") as Error & {
        status: number;
      };
      err.status = 400;
      throw err;
    }
    const creds = requireCredentials(params.exchange);
    const adapter = getAdapter(params.exchange);
    const result = await adapter.setLeverage(creds, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ========== 错误处理中间件 ==========

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err as Error & { status?: number; code?: string | number; exchange?: string };
    const status = e.status ?? 500;
    const message = e.message ?? "Internal Server Error";
    const code = e.code ?? "INTERNAL_ERROR";
    const exchange = e.exchange;

    console.error(`[ERROR] ${status} ${code} - ${message}`);

    res.status(status).json({
      success: false,
      error: message,
      code,
      ...(exchange ? { exchange } : {}),
    });
  }
);

// ========== 启动服务器 ==========

app.listen(PORT, () => {
  console.log(`CryptoPulse Proxy Server running on http://localhost:${PORT}`);
});
