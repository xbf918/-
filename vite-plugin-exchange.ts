import type { Plugin } from "vite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import nodemailer from "nodemailer";

/**
 * Vite 插件：交易所 API 代理 + 邮件服务
 * 将 Binance / OKX 的私有接口签名和请求集成到 Vite dev server 中
 * 同时提供邮件发送功能用于邮箱验证
 */

// ========== 凭证存储（内存） ==========
interface StoredCredentials {
  exchange: "binance" | "okx";
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: boolean;
  permissions: string[];
  createdAt: number;
  lastValidated?: number;
  validated: boolean;
}

const credentialsStore = new Map<string, StoredCredentials>();

// ========== 邮件配置存储（内存 + 文件持久化） ==========
type EmailProvider = "demo" | "emailjs" | "smtp";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}

interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  fromName: string;
  fromEmail: string;
}

interface EmailConfig {
  provider: EmailProvider;
  smtp?: SmtpConfig;
  emailjs?: EmailJsConfig;
}

const EMAIL_CONFIG_FILE = path.join(process.cwd(), ".email-config.json");

function loadEmailConfig(): EmailConfig {
  try {
    if (fs.existsSync(EMAIL_CONFIG_FILE)) {
      const raw = fs.readFileSync(EMAIL_CONFIG_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Email] 读取邮件配置文件失败:", err);
  }
  return { provider: "demo" };
}

function saveEmailConfigToFile(config: EmailConfig): void {
  try {
    fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    try {
      fs.chmodSync(EMAIL_CONFIG_FILE, 0o600);
    } catch {
      // ignore
    }
  } catch (err) {
    console.warn("[Email] 保存邮件配置文件失败:", err);
  }
}

let emailConfig: EmailConfig = loadEmailConfig();

// 验证码存储：email -> { code, expiresAt, type }
interface VerificationCodeEntry {
  code: string;
  expiresAt: number;
  type: "register" | "reset";
  createdAt: number;
}
const verificationCodeStore = new Map<string, VerificationCodeEntry>();

// ========== 邮件发送 ==========
function buildEmailHtml(code: string, type: "register" | "reset"): string {
  const title = type === "register" ? "注册验证码" : "密码重置验证码";
  const action = type === "register" ? "账号注册" : "密码重置";
  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #00d4ff; margin: 0;">CRYPTO<span style="color: #ffffff;">PULSE</span></h1>
        <p style="color: #888; font-size: 14px;">加密交易分析终端</p>
      </div>
      <div style="background: #1a1f2e; border-radius: 12px; padding: 30px; border: 1px solid #2a3142;">
        <h2 style="color: #ffffff; margin-top: 0; font-size: 18px;">${title}</h2>
        <p style="color: #a0aec0; font-size: 14px; line-height: 1.6;">
          您好，您正在进行${action}操作，您的验证码为：
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="display: inline-block; background: #0d1117; color: #00d4ff; font-size: 32px; font-weight: bold; padding: 15px 40px; border-radius: 8px; letter-spacing: 8px; border: 1px solid #00d4ff40;">
            ${code}
          </span>
        </div>
        <p style="color: #a0aec0; font-size: 14px; line-height: 1.6;">
          验证码有效期为 <strong style="color: #00d4ff;">5分钟</strong>，请尽快使用。
        </p>
        <p style="color: #666; font-size: 12px;">
          如果这不是您本人操作，请忽略此邮件。
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
        © 2026 CryptoPulse Terminal. All rights reserved.
      </div>
    </div>
  `;
}

async function sendViaEmailJs(
  to: string,
  code: string,
  type: "register" | "reset",
  config: EmailJsConfig,
): Promise<boolean> {
  console.log(`[EmailJS] 正在发送验证码邮件至 ${to}...`);

  const subject = type === "register" ? "【CryptoPulse】注册验证码" : "【CryptoPulse】密码重置验证码";
  const html = buildEmailHtml(code, type);

  try {
    const response = await axios.post(
      "https://api.emailjs.com/api/v1.0/email/send",
      {
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        accessToken: config.privateKey,
        template_params: {
          to_email: to,
          from_name: config.fromName || "CryptoPulse",
          subject,
          message: html,
          code,
          type,
        },
      },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`[EmailJS] 邮件发送成功!`);
    return true;
  } catch (err: any) {
    console.error("[EmailJS] 发送失败:", err.message);
    if (err.response?.data) {
      console.error("[EmailJS] 错误详情:", JSON.stringify(err.response.data));
    }
    throw new Error(`EmailJS发送失败: ${err.message}`);
  }
}

async function sendViaSmtp(
  to: string,
  code: string,
  type: "register" | "reset",
  config: SmtpConfig,
): Promise<boolean> {
  console.log(`[SMTP] 正在发送验证码邮件至 ${to}...`);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    await transporter.verify();
    console.log(`[SMTP] 连接验证成功`);
  } catch (verifyErr: any) {
    console.error(`[SMTP] 连接验证失败:`, verifyErr.message);
    throw new Error(`SMTP连接失败: ${verifyErr.message}`);
  }

  const subject = type === "register" ? "【CryptoPulse】注册验证码" : "【CryptoPulse】密码重置验证码";
  const html = buildEmailHtml(code, type);

  const info = await transporter.sendMail({
    from: `"${config.fromName}" <${config.user}>`,
    to,
    subject,
    html,
  });

  console.log(`[SMTP] 邮件发送成功! 消息ID: ${info.messageId}`);
  return true;
}

async function sendVerificationEmail(
  to: string,
  code: string,
  type: "register" | "reset",
): Promise<boolean> {
  const provider = emailConfig.provider;

  if (provider === "demo") {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  [DEMO MODE] 演示模式 - 验证码未真实发送                    ║
╠══════════════════════════════════════════════════════════════╣
║  收件邮箱: ${to.padEnd(45)}║
║  验证码:   ${code.padEnd(45)}║
║  有效期:   5分钟                                            ║
╠══════════════════════════════════════════════════════════════╣
║  提示: 请在设置页面配置邮件服务以启用真实邮件发送              ║
╚══════════════════════════════════════════════════════════════╝
`);
    return true;
  }

  if (provider === "emailjs") {
    if (!emailConfig.emailjs) {
      throw new Error("EmailJS 配置不完整");
    }
    return sendViaEmailJs(to, code, type, emailConfig.emailjs);
  }

  if (provider === "smtp") {
    if (!emailConfig.smtp) {
      throw new Error("SMTP 配置不完整");
    }
    return sendViaSmtp(to, code, type, emailConfig.smtp);
  }

  throw new Error("未知的邮件服务提供商");
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ========== 签名工具 ==========
function hmacSha256Hex(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function hmacSha256Base64(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

function timestampMs(): number {
  return Date.now();
}

function isoTimestamp(): string {
  return new Date().toISOString();
}

// ========== Binance 合约 API ==========
const BINANCE_MAIN = "https://fapi.binance.com";
const BINANCE_TESTNET = "https://testnet.binancefuture.com";

async function binanceRequest(
  creds: StoredCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, any> = {},
) {
  const baseUrl = creds.testnet ? BINANCE_TESTNET : BINANCE_MAIN;
  const timestamp = timestampMs();
  const queryParams = new URLSearchParams({
    timestamp: String(timestamp),
    recvWindow: "5000",
    ...params,
  });
  const signature = hmacSha256Hex(creds.apiSecret, queryParams.toString());
  queryParams.append("signature", signature);

  const url = `${baseUrl}${path}?${queryParams.toString()}`;

  try {
    const res = await axios({
      method,
      url,
      headers: {
        "X-MBX-APIKEY": creds.apiKey,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    });
    return res.data;
  } catch (err: any) {
    const msg = err?.response?.data?.msg ?? err?.message ?? "Binance API error";
    const code = err?.response?.data?.code;
    const error: any = new Error(msg);
    error.status = err?.response?.status ?? 500;
    error.code = code ?? "BINANCE_ERROR";
    error.exchange = "binance";
    throw error;
  }
}

async function binanceTestConnection(creds: StoredCredentials) {
  await binanceRequest(creds, "GET", "/fapi/v2/account");
  return true;
}

async function binanceGetAccount(creds: StoredCredentials) {
  const data: any = await binanceRequest(creds, "GET", "/fapi/v2/account");
  const positions = (data.positions || [])
    .filter((p: any) => Number(p.positionAmt) !== 0)
    .map((p: any) => ({
      symbol: p.symbol,
      positionAmt: Number(p.positionAmt),
      entryPrice: Number(p.entryPrice),
      markPrice: Number(p.markPrice),
      unRealizedProfit: Number(p.unRealizedProfit),
      liquidationPrice: Number(p.liquidationPrice),
      leverage: Number(p.leverage),
      positionSide: p.positionSide || "BOTH",
      marginType: p.marginType || "cross",
      updateTime: Number(p.updateTime),
    }));

  return {
    exchange: "binance",
    totalWalletBalance: Number(data.totalWalletBalance),
    availableBalance: Number(data.availableBalance),
    marginBalance: Number(data.totalMarginBalance),
    unrealizedProfit: Number(data.totalUnrealizedProfit),
    positions,
  };
}

async function binanceGetPositions(creds: StoredCredentials) {
  const data: any[] = await binanceRequest(creds, "GET", "/fapi/v2/positionRisk");
  return data
    .filter((p) => Number(p.positionAmt) !== 0)
    .map((p) => ({
      symbol: p.symbol,
      positionAmt: Number(p.positionAmt),
      entryPrice: Number(p.entryPrice),
      markPrice: Number(p.markPrice),
      unRealizedProfit: Number(p.unRealizedProfit),
      liquidationPrice: Number(p.liquidationPrice),
      leverage: Number(p.leverage),
      positionSide: p.positionSide || "BOTH",
      marginType: p.marginType || "cross",
      updateTime: Number(p.updateTime),
    }));
}

async function binancePlaceOrder(
  creds: StoredCredentials,
  params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: string;
    quantity: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
    positionSide?: string;
  },
) {
  const body: Record<string, any> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: String(params.quantity),
  };
  if (params.price !== undefined) body.price = String(params.price);
  if (params.stopPrice !== undefined) body.stopPrice = String(params.stopPrice);
  if (params.reduceOnly) body.reduceOnly = "true";
  if (params.positionSide) body.positionSide = params.positionSide;
  if (params.type === "LIMIT") body.timeInForce = "GTC";

  const data: any = await binanceRequest(creds, "POST", "/fapi/v1/order", body);
  return {
    orderId: String(data.orderId),
    symbol: data.symbol,
    status: data.status,
    type: data.type,
    side: data.side,
    price: Number(data.price),
    origQty: Number(data.origQty),
    executedQty: Number(data.executedQty),
    avgPrice: Number(data.avgPrice || data.price),
    time: Number(data.time),
  };
}

async function binanceClosePosition(
  creds: StoredCredentials,
  params: { symbol: string; positionSide?: string },
) {
  const positions = await binanceGetPositions(creds);
  const pos = positions.find(
    (p) => p.symbol === params.symbol && Math.abs(p.positionAmt) > 0,
  );
  if (!pos) throw new Error("No open position found");

  const side = pos.positionAmt > 0 ? "SELL" : "BUY";
  const quantity = Math.abs(pos.positionAmt);

  return binancePlaceOrder(creds, {
    symbol: params.symbol,
    side,
    type: "MARKET",
    quantity,
    reduceOnly: true,
    positionSide: params.positionSide,
  });
}

async function binanceCancelOrder(
  creds: StoredCredentials,
  params: { symbol: string; orderId?: string },
) {
  const body: Record<string, any> = { symbol: params.symbol };
  if (params.orderId) body.orderId = params.orderId;
  await binanceRequest(creds, "DELETE", "/fapi/v1/order", body);
  return { success: true };
}

async function binanceSetLeverage(
  creds: StoredCredentials,
  params: { symbol: string; leverage: number },
) {
  await binanceRequest(creds, "POST", "/fapi/v1/leverage", {
    symbol: params.symbol,
    leverage: params.leverage,
  });
  return { success: true, leverage: params.leverage };
}

// ========== OKX API ==========
const OKX_BASE = "https://www.okx.com";

// 本地与 OKX 服务器的时间偏差（毫秒）
let okxTimeOffset = 0;

async function syncOkxTime() {
  try {
    const res = await axios.get(`${OKX_BASE}/api/v5/public/time`, { timeout: 5_000 });
    const serverTs = Number(res.data.data[0].ts);
    okxTimeOffset = serverTs - Date.now();
  } catch {
    // 同步失败则使用本地时间
  }
}

async function okxRequest(
  creds: StoredCredentials,
  method: "GET" | "POST",
  path: string,
  body: any = {},
) {
  const timestamp = new Date(Date.now() + okxTimeOffset).toISOString();
  const bodyStr = method === "GET" ? "" : JSON.stringify(body);
  const signStr = `${timestamp}${method.toUpperCase()}${path}${bodyStr}`;
  const sign = hmacSha256Base64(creds.apiSecret, signStr);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": creds.passphrase || "",
    "Content-Type": "application/json",
  };
  if (creds.testnet) headers["x-simulated-trading"] = "1";

  const url = `${OKX_BASE}${path}`;

  try {
    const res = await axios({
      method,
      url,
      headers,
      // POST 请求必须发送与签名完全一致的字符串
      data: method === "POST" ? bodyStr : undefined,
      timeout: 10_000,
    });
    if (res.data.code !== "0") {
      const error: any = new Error(res.data.msg || "OKX API error");
      error.status = 400;
      error.code = res.data.code;
      error.exchange = "okx";
      throw error;
    }
    return res.data.data;
  } catch (err: any) {
    if (err.exchange) throw err;
    const msg = err?.response?.data?.msg ?? err?.message ?? "OKX API error";
    const error: any = new Error(msg);
    error.status = err?.response?.status ?? 500;
    error.code = err?.response?.data?.code ?? "OKX_ERROR";
    error.exchange = "okx";
    throw error;
  }
}

async function okxTestConnection(creds: StoredCredentials) {
  // 先同步 OKX 服务器时间，避免时间偏差导致 Invalid Sign
  await syncOkxTime();
  // 使用账户配置接口测试连接
  await okxRequest(creds, "GET", "/api/v5/account/config");
  return true;
}

async function okxGetAccount(creds: StoredCredentials) {
  const data: any = await okxRequest(creds, "GET", "/api/v5/account/balance");
  const acc = data[0] || {};
  const totalEq = Number(acc.totalEq || 0);
  const availEq = Number(acc.availEq || 0);

  const positions = await okxGetPositions(creds);
  const unrealizedPnl = positions.reduce(
    (sum: number, p: any) => sum + Number(p.unRealizedProfit),
    0,
  );

  return {
    exchange: "okx",
    totalWalletBalance: totalEq,
    availableBalance: availEq,
    marginBalance: totalEq,
    unrealizedProfit: unrealizedPnl,
    positions,
  };
}

async function okxGetPositions(creds: StoredCredentials) {
  const data: any[] = await okxRequest(creds, "GET", "/api/v5/account/positions", {
    instType: "SWAP",
  });
  return data
    .filter((p) => Math.abs(Number(p.pos)) > 0)
    .map((p) => ({
      symbol: p.instId,
      positionAmt: Number(p.pos),
      entryPrice: Number(p.avgPx),
      markPrice: Number(p.markPx),
      unRealizedProfit: Number(p.upl),
      liquidationPrice: Number(p.liqPx),
      leverage: Number(p.lever),
      positionSide: p.posSide === "long" ? "LONG" : p.posSide === "short" ? "SHORT" : "BOTH",
      marginType: p.mgnMode === "cross" ? "cross" : "isolated",
      updateTime: Number(p.uTime),
    }));
}

async function okxPlaceOrder(
  creds: StoredCredentials,
  params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: string;
    quantity: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
    positionSide?: string;
  },
) {
  let tdMode = "cross";
  let posSide: string | undefined;
  if (params.positionSide === "LONG") posSide = "long";
  else if (params.positionSide === "SHORT") posSide = "short";
  else tdMode = "cross";

  const body: Record<string, any> = {
    instId: params.symbol,
    side: params.side.toLowerCase(),
    tdMode,
    ordType: params.type === "MARKET" ? "market" : params.type === "LIMIT" ? "limit" : params.type,
    sz: String(params.quantity),
  };
  if (params.price !== undefined) body.px = String(params.price);
  if (posSide) body.posSide = posSide;
  if (params.reduceOnly) body.reduceOnly = "true";

  // 条件单（止盈止损）
  if (params.type === "TAKE_PROFIT_MARKET" || params.type === "STOP_MARKET") {
    body.tpTriggerPx = params.stopPrice;
    body.tpOrdPx = "-1";
  }

  const data: any = await okxRequest(creds, "POST", "/api/v5/trade/order", body);
  const order = data[0] || {};
  return {
    orderId: String(order.ordId || ""),
    symbol: params.symbol,
    status: order.state === "filled" ? "FILLED" : order.state === "live" ? "NEW" : "NEW",
    type: params.type,
    side: params.side,
    price: Number(params.price || 0),
    origQty: Number(params.quantity),
    executedQty: Number(order.fillSz || 0),
    avgPrice: Number(order.avgPx || 0),
    time: Date.now(),
  };
}

async function okxClosePosition(
  creds: StoredCredentials,
  params: { symbol: string; positionSide?: string },
) {
  const positions = await okxGetPositions(creds);
  const pos = positions.find(
    (p) => p.symbol === params.symbol && Math.abs(p.positionAmt) > 0,
  );
  if (!pos) throw new Error("No open position found");

  const side = pos.positionAmt > 0 ? "SELL" : "BUY";

  return okxPlaceOrder(creds, {
    symbol: params.symbol,
    side,
    type: "MARKET",
    quantity: Math.abs(pos.positionAmt),
    reduceOnly: true,
    positionSide: params.positionSide,
  });
}

async function okxCancelOrder(
  creds: StoredCredentials,
  params: { symbol: string; orderId?: string },
) {
  const body: Record<string, any> = { instId: params.symbol };
  if (params.orderId) body.ordId = params.orderId;
  await okxRequest(creds, "POST", "/api/v5/trade/cancel-order", body);
  return { success: true };
}

async function okxSetLeverage(
  creds: StoredCredentials,
  params: { symbol: string; leverage: number },
) {
  await okxRequest(creds, "POST", "/api/v5/account/set-leverage", {
    instId: params.symbol,
    lever: String(params.leverage),
    mgnMode: "cross",
  });
  return { success: true, leverage: params.leverage };
}

// ========== 工具函数 ==========
function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return "****";
  return secret.slice(0, 4) + "*".repeat(secret.length - 8) + secret.slice(-4);
}

function sendJson(res: any, status: number, data: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ========== 市场数据：恐惧贪婪指数 ==========
const FEAR_GREED_URL = "https://api.alternative.me/fng/";

interface FearGreedCache {
  data: any;
  timestamp: number;
  ttl: number;
}

let fearGreedCache: FearGreedCache | null = null;

async function fetchFearGreedIndex(limit: number = 7): Promise<any> {
  const now = Date.now();
  if (fearGreedCache && now - fearGreedCache.timestamp < fearGreedCache.ttl) {
    return fearGreedCache.data;
  }

  try {
    const res = await axios.get(`${FEAR_GREED_URL}?limit=${limit}&format=json`, {
      timeout: 8000,
      headers: {
        "User-Agent": "CryptoPulse/1.0",
      },
    });
    const data = res.data;
    fearGreedCache = {
      data,
      timestamp: now,
      ttl: 5 * 60 * 1000,
    };
    return data;
  } catch (err: any) {
    console.warn("[FearGreed] 获取失败，使用模拟数据:", err.message);
    // 降级：返回模拟数据
    const value = 45 + Math.floor(Math.random() * 20);
    return {
      metadata: { error: true, fallback: true },
      data: [
        {
          value: String(value),
          value_classification: value < 25 ? "Extreme Fear" : value < 45 ? "Fear" : value < 55 ? "Neutral" : value < 75 ? "Greed" : "Extreme Greed",
          timestamp: String(Math.floor(now / 1000)),
          time_until_update: "3600",
        },
      ],
    };
  }
}

// ========== 市场数据：加密新闻（CryptoPanic 兼容层） ==========
interface NewsCache {
  data: any;
  timestamp: number;
  ttl: number;
}

let newsCache: NewsCache | null = null;

const MOCK_NEWS = [
  { title: "Bitcoin ETF 资金净流入创月度新高", source: "CryptoNews", published_at: new Date(Date.now() - 1800000).toISOString(), sentiment: "bullish", url: "#" },
  { title: "美联储暗示可能提前降息，市场情绪回暖", source: "Reuters", published_at: new Date(Date.now() - 3600000).toISOString(), sentiment: "bullish", url: "#" },
  { title: "以太坊质押量突破新高，机构持续增持", source: "TheBlock", published_at: new Date(Date.now() - 7200000).toISOString(), sentiment: "bullish", url: "#" },
  { title: "监管文件显示某大型交易所被调查", source: "Bloomberg", published_at: new Date(Date.now() - 5400000).toISOString(), sentiment: "bearish", url: "#" },
  { title: "矿工抛售压力增加，短期承压", source: "CoinDesk", published_at: new Date(Date.now() - 9000000).toISOString(), sentiment: "bearish", url: "#" },
  { title: "稳定币市值持续增长，市场流动性改善", source: "CoinTelegraph", published_at: new Date(Date.now() - 10800000).toISOString(), sentiment: "bullish", url: "#" },
  { title: "链上数据：巨鲸地址小幅减持", source: "Glassnode", published_at: new Date(Date.now() - 12600000).toISOString(), sentiment: "bearish", url: "#" },
  { title: "Layer2 交易量持续增长，以太坊扩容进展顺利", source: "Messari", published_at: new Date(Date.now() - 14400000).toISOString(), sentiment: "bullish", url: "#" },
];

async function fetchCryptoNews(currency: string = "BTC"): Promise<any> {
  const now = Date.now();
  if (newsCache && now - newsCache.timestamp < newsCache.ttl) {
    return newsCache.data;
  }

  // 目前使用高质量模拟数据（结构与 CryptoPanic 兼容）
  // 用户可配置 API key 后切换到真实接口
  const articles = MOCK_NEWS.map((n, i) => ({
    ...n,
    id: String(now + i),
    currencies: [{ code: currency, title: currency === "BTC" ? "Bitcoin" : currency }],
  }));

  const data = {
    metadata: { source: "mock", count: articles.length, updated: now },
    results: articles,
  };

  newsCache = {
    data,
    timestamp: now,
    ttl: 3 * 60 * 1000,
  };

  return data;
}

// ========== 链上基础数据（CoinGecko 公开接口） ==========
interface OnchainCache {
  data: Record<string, any>;
  timestamp: number;
  ttl: number;
}

let onchainCache: OnchainCache | null = null;

async function fetchOnchainData(coinId: string = "bitcoin"): Promise<any> {
  const now = Date.now();
  if (onchainCache && now - onchainCache.timestamp < onchainCache.ttl && onchainCache.data[coinId]) {
    return onchainCache.data[coinId];
  }

  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=true&developer_data=false&sparkline=false`,
      {
        timeout: 8000,
        headers: { "User-Agent": "CryptoPulse/1.0" },
      },
    );
    const market = res.data.market_data || {};
    const community = res.data.community_data || {};

    const data = {
      market_cap_rank: res.data.market_cap_rank,
      market_cap: market.market_cap?.usd || 0,
      fully_diluted_valuation: market.fully_diluted_valuation?.usd || 0,
      total_volume: market.total_volume?.usd || 0,
      high_24h: market.high_24h?.usd || 0,
      low_24h: market.low_24h?.usd || 0,
      price_change_percentage_7d: market.price_change_percentage_7d || 0,
      price_change_percentage_30d: market.price_change_percentage_30d || 0,
      market_cap_change_percentage_24h: market.market_cap_change_percentage_24h || 0,
      circulating_supply: market.circulating_supply || 0,
      total_supply: market.total_supply || 0,
      twitter_followers: community.twitter_followers || 0,
      reddit_subscribers: community.reddit_subscribers || 0,
      reddit_average_posts_48h: community.reddit_average_posts_48h || 0,
      reddit_average_comments_48h: community.reddit_average_comments_48h || 0,
      source: "coingecko",
    };

    if (!onchainCache) {
      onchainCache = { data: {}, timestamp: now, ttl: 5 * 60 * 1000 };
    }
    onchainCache.data[coinId] = data;
    onchainCache.timestamp = now;
    return data;
  } catch (err: any) {
    console.warn("[Onchain] CoinGecko 获取失败，使用模拟数据:", err.message);
    return {
      market_cap_rank: 1,
      market_cap: 1_200_000_000_000,
      total_volume: 28_000_000_000,
      price_change_percentage_7d: 2.3,
      price_change_percentage_30d: 8.5,
      circulating_supply: 19_700_000,
      twitter_followers: 4500000,
      source: "mock",
    };
  }
}

// ========== Vite 插件 ==========
export function exchangeProxyPlugin(): Plugin {
  return {
    name: "exchange-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          return next();
        }

        try {
          const url = new URL(req.url, "http://localhost");
          const path = url.pathname;
          const method = (req.method || "GET").toUpperCase();
          const body = method !== "GET" ? await readBody(req) : {};

          // ---- 邮件服务：获取配置 ----
          if (path === "/api/email/config" && method === "GET") {
            const result: any = {
              provider: emailConfig.provider,
            };
            if (emailConfig.provider === "smtp" && emailConfig.smtp) {
              result.config = {
                host: emailConfig.smtp.host,
                port: emailConfig.smtp.port,
                secure: emailConfig.smtp.secure,
                user: emailConfig.smtp.user,
                fromName: emailConfig.smtp.fromName,
              };
            } else if (emailConfig.provider === "emailjs" && emailConfig.emailjs) {
              result.config = {
                serviceId: emailConfig.emailjs.serviceId,
                templateId: emailConfig.emailjs.templateId,
                publicKey: emailConfig.emailjs.publicKey,
                fromName: emailConfig.emailjs.fromName,
                fromEmail: emailConfig.emailjs.fromEmail,
              };
            }
            return sendJson(res, 200, result);
          }

          // ---- 邮件服务：保存配置 ----
          if (path === "/api/email/config" && method === "POST") {
            const { provider, config } = body as { provider: EmailProvider; config: any };

            if (!provider) {
              return sendJson(res, 400, {
                success: false,
                error: "Missing required field: provider",
              });
            }

            const newConfig: EmailConfig = { provider };

            if (provider === "smtp") {
              if (!config.host || !config.user || !config.pass) {
                return sendJson(res, 400, {
                  success: false,
                  error: "Missing required SMTP fields: host, user, pass",
                });
              }
              newConfig.smtp = {
                host: config.host,
                port: config.port || 465,
                secure: config.secure ?? true,
                user: config.user,
                pass: config.pass,
                fromName: config.fromName || "CryptoPulse",
              };
            } else if (provider === "emailjs") {
              if (!config.serviceId || !config.templateId || !config.publicKey) {
                return sendJson(res, 400, {
                  success: false,
                  error: "Missing required EmailJS fields: serviceId, templateId, publicKey",
                });
              }
              newConfig.emailjs = {
                serviceId: config.serviceId,
                templateId: config.templateId,
                publicKey: config.publicKey,
                privateKey: config.privateKey || "",
                fromName: config.fromName || "CryptoPulse",
                fromEmail: config.fromEmail || "",
              };
            }

            emailConfig = newConfig;
            saveEmailConfigToFile(emailConfig);
            console.log(`[Email] 邮件配置已更新: ${provider}`);

            return sendJson(res, 200, { success: true });
          }

          // ---- 邮件服务：测试发送 ----
          if (path === "/api/email/test" && method === "POST") {
            const { to } = body as { to: string };
            if (!to) {
              return sendJson(res, 400, {
                success: false,
                error: "Missing required field: to",
              });
            }
            if (emailConfig.provider === "demo") {
              try {
                const code = generateVerificationCode();
                await sendVerificationEmail(to, code, "register");
                return sendJson(res, 200, { success: true, demo: true, code });
              } catch (err: any) {
                return sendJson(res, 500, {
                  success: false,
                  error: err.message,
                });
              }
            }
            try {
              const code = generateVerificationCode();
              await sendVerificationEmail(to, code, "register");
              return sendJson(res, 200, { success: true });
            } catch (err: any) {
              return sendJson(res, 500, {
                success: false,
                error: err.message,
              });
            }
          }

          // ---- 邮件服务：发送验证码 ----
          if (path === "/api/email/send-code" && method === "POST") {
            const { email, type } = body as { email: string; type: "register" | "reset" };
            if (!email || !type) {
              return sendJson(res, 400, {
                success: false,
                error: "Missing required fields: email, type",
              });
            }

            const emailTrimmed = email.trim().toLowerCase();
            
            // 冷却时间：60秒
            const existing = verificationCodeStore.get(emailTrimmed);
            if (existing && Date.now() - existing.createdAt < 60_000) {
              return sendJson(res, 429, {
                success: false,
                error: "Too many requests, please wait 60 seconds",
              });
            }

            const code = generateVerificationCode();
            const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

            try {
              await sendVerificationEmail(emailTrimmed, code, type);
              verificationCodeStore.set(emailTrimmed, {
                code,
                expiresAt,
                type,
                createdAt: Date.now(),
              });
              // 演示模式下把验证码也返回，方便前端显示
              if (emailConfig.provider === "demo") {
                return sendJson(res, 200, { success: true, demo: true, code });
              }
              return sendJson(res, 200, { success: true });
            } catch (err: any) {
              return sendJson(res, 500, {
                success: false,
                error: err.message,
              });
            }
          }

          // ---- 邮件服务：验证验证码 ----
          if (path === "/api/email/verify-code" && method === "POST") {
            const { email, code, type } = body as { email: string; code: string; type: "register" | "reset" };
            if (!email || !code || !type) {
              return sendJson(res, 400, {
                success: false,
                error: "Missing required fields: email, code, type",
              });
            }

            const emailTrimmed = email.trim().toLowerCase();
            const entry = verificationCodeStore.get(emailTrimmed);

            if (!entry) {
              return sendJson(res, 200, {
                success: false,
                error: "Verification code not found or expired",
              });
            }

            if (entry.type !== type) {
              return sendJson(res, 200, {
                success: false,
                error: "Verification code type mismatch",
              });
            }

            if (Date.now() > entry.expiresAt) {
              verificationCodeStore.delete(emailTrimmed);
              return sendJson(res, 200, {
                success: false,
                error: "Verification code expired",
              });
            }

            if (entry.code !== code.trim()) {
              return sendJson(res, 200, {
                success: false,
                error: "Invalid verification code",
              });
            }

            // 验证成功后删除验证码（一次性使用）
            verificationCodeStore.delete(emailTrimmed);

            return sendJson(res, 200, { success: true });
          }

          // ---- 市场数据：恐惧贪婪指数 ----
          if (path === "/api/market/fear-greed" && method === "GET") {
            const limit = Number(url.searchParams.get("limit") || 7);
            const data = await fetchFearGreedIndex(limit);
            return sendJson(res, 200, data);
          }

          // ---- 市场数据：加密新闻 ----
          if (path === "/api/market/news" && method === "GET") {
            const currency = url.searchParams.get("currency") || "BTC";
            const data = await fetchCryptoNews(currency);
            return sendJson(res, 200, data);
          }

          // ---- 市场数据：链上基础数据 ----
          if (path === "/api/market/onchain" && method === "GET") {
            const coinId = url.searchParams.get("coinId") || "bitcoin";
            const data = await fetchOnchainData(coinId);
            return sendJson(res, 200, data);
          }

          // ---- 凭证管理 ----
          if (path === "/api/credentials" && method === "POST") {
            const creds = body as StoredCredentials;
            if (!creds.exchange || !creds.apiKey || !creds.apiSecret) {
              return sendJson(res, 400, {
                success: false,
                error: "Missing required fields: exchange, apiKey, apiSecret",
              });
            }
            const saved: StoredCredentials & { createdAt: number; validated: boolean } = {
              exchange: creds.exchange,
              apiKey: creds.apiKey,
              apiSecret: creds.apiSecret,
              passphrase: creds.passphrase,
              testnet: creds.testnet,
              permissions: creds.permissions || [],
              createdAt: Date.now(),
              validated: false,
            };
            credentialsStore.set(creds.exchange, saved);
            // 返回完整凭证对象（apiSecret 脱敏）
            return sendJson(res, 200, {
              ...saved,
              apiSecret: maskSecret(saved.apiSecret),
            });
          }

          if (path === "/api/credentials" && method === "GET") {
            const result: Record<string, any> = {};
            for (const [ex, creds] of credentialsStore) {
              result[ex] = {
                ...creds,
                apiSecret: maskSecret(creds.apiSecret),
              };
            }
            if (!result.binance) result.binance = null;
            if (!result.okx) result.okx = null;
            if (!result.paper) result.paper = null;
            return sendJson(res, 200, result);
          }

          if (path.startsWith("/api/credentials/") && method === "DELETE") {
            const exchange = path.split("/").pop()!;
            credentialsStore.delete(exchange);
            return sendJson(res, 200, { success: true, exchange });
          }

          if (path === "/api/credentials/test" && method === "POST") {
            const creds = body as StoredCredentials;
            if (!creds.exchange || !creds.apiKey || !creds.apiSecret) {
              return sendJson(res, 400, {
                success: false,
                error: "Missing required fields",
              });
            }
            let success = false;
            let account: any = null;
            let testError: string | undefined;
            try {
              if (creds.exchange === "binance") {
                success = await binanceTestConnection(creds);
              } else if (creds.exchange === "okx") {
                success = await okxTestConnection(creds);
              }
              if (success) {
                credentialsStore.set(creds.exchange, {
                  ...creds,
                  validated: true,
                  lastValidated: Date.now(),
                });
                // 获取账户信息（失败不影响测试连接结果）
                try {
                  if (creds.exchange === "binance") {
                    account = await binanceGetAccount(creds);
                  } else if (creds.exchange === "okx") {
                    account = await okxGetAccount(creds);
                  }
                } catch {
                  // 账户信息获取失败不阻断测试连接
                }
              }
            } catch (err: any) {
              testError = err.message;
              return sendJson(res, 200, {
                success: false,
                error: testError,
                account: null,
              });
            }
            return sendJson(res, 200, { success, account });
          }

          // 以下接口需要已保存的凭证
          const exchange =
            (method === "GET" ? url.searchParams.get("exchange") : body.exchange) || "";
          const creds = credentialsStore.get(exchange);
          if (!creds && path !== "/api/credentials" && !path.includes("/credentials/")) {
            return sendJson(res, 404, {
              success: false,
              error: `No credentials found for exchange: ${exchange}`,
              code: "NO_CREDENTIALS",
            });
          }

          // ---- 账户 ----
          if (path === "/api/account" && method === "GET" && creds) {
            const account =
              exchange === "binance"
                ? await binanceGetAccount(creds)
                : await okxGetAccount(creds);
            return sendJson(res, 200, account);
          }

          if (path === "/api/positions" && method === "GET" && creds) {
            const positions =
              exchange === "binance"
                ? await binanceGetPositions(creds)
                : await okxGetPositions(creds);
            return sendJson(res, 200, positions);
          }

          // ---- 交易 ----
          if (path === "/api/order" && method === "POST" && creds) {
            const result =
              exchange === "binance"
                ? await binancePlaceOrder(creds, body)
                : await okxPlaceOrder(creds, body);
            return sendJson(res, 200, result);
          }

          if (path === "/api/order/close" && method === "POST" && creds) {
            const result =
              exchange === "binance"
                ? await binanceClosePosition(creds, body)
                : await okxClosePosition(creds, body);
            return sendJson(res, 200, result);
          }

          if (path === "/api/order/cancel" && method === "POST" && creds) {
            const result =
              exchange === "binance"
                ? await binanceCancelOrder(creds, body)
                : await okxCancelOrder(creds, body);
            return sendJson(res, 200, result);
          }

          if (path === "/api/leverage" && method === "POST" && creds) {
            const result =
              exchange === "binance"
                ? await binanceSetLeverage(creds, body)
                : await okxSetLeverage(creds, body);
            return sendJson(res, 200, result);
          }

          next();
        } catch (err: any) {
          console.error("[Exchange Proxy] Error:", err.message);
          sendJson(res, err.status ?? 500, {
            success: false,
            error: err.message ?? "Internal Server Error",
            code: err.code ?? "INTERNAL_ERROR",
            exchange: err.exchange,
          });
        }
      });

      console.log("  ⚡ Exchange Proxy ready at /api/*");
    },
  };
}
