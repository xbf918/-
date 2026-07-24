export interface ServerPrice {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
}

export interface ServerPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  takeProfit?: number;
  stopLoss?: number;
}

export interface ServerAccount {
  totalBalance: number;
  availableBalance: number;
  usedMargin: number;
  unrealizedPnl: number;
}

export interface ServerSignal {
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  confidence: number;
  price: number;
}

export interface ServerTradeConfig {
  maxOpenPositions: number;
  maxDailyLossPercent: number;
  leverage: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  orderSizePercent: number;
}

export interface TradeResult {
  success: boolean;
  message: string;
  position?: ServerPosition;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}`;

/**
 * 统一 fetch 封装：自动检查 response.ok，解析 JSON，抛出含状态码的 Error
 */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.detail || body?.message || JSON.stringify(body);
    } catch {
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`API ${response.status} ${response.statusText}: ${detail}`);
  }

  // 处理空响应
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function fetchHealth(): Promise<{ status: string; timestamp: number }> {
  return apiFetch(`${API_BASE}/health`);
}

export async function fetchAccount(exchange: string): Promise<ServerAccount> {
  return apiFetch(`${API_BASE}/account/${exchange}`);
}

export async function fetchPositions(exchange: string, symbol?: string): Promise<ServerPosition[]> {
  const url = symbol ? `${API_BASE}/positions/${exchange}?symbol=${symbol}` : `${API_BASE}/positions/${exchange}`;
  return apiFetch(url);
}

export async function fetchPrice(exchange: string, symbol: string): Promise<{ price: number }> {
  return apiFetch(`${API_BASE}/price/${exchange}/${symbol}`);
}

export async function fetchCandles(exchange: string, symbol: string, interval = '1h', limit = 100): Promise<any[]> {
  return apiFetch(`${API_BASE}/candles/${exchange}/${symbol}?interval=${interval}&limit=${limit}`);
}

export async function openPosition(
  exchange: string,
  symbol: string,
  direction: 'long' | 'short',
  price: number,
  leverage?: number,
): Promise<TradeResult> {
  return apiFetch(`${API_BASE}/trade/open`, {
    method: 'POST',
    body: JSON.stringify({ exchange, symbol, direction, price, leverage }),
  });
}

export async function closePosition(
  exchange: string,
  symbol: string,
  direction?: 'long' | 'short',
): Promise<TradeResult> {
  return apiFetch(`${API_BASE}/trade/close`, {
    method: 'POST',
    body: JSON.stringify({ exchange, symbol, direction }),
  });
}

/**
 * 在交易所端设置止损/止盈单
 * 返回交易所返回的订单信息
 */
export async function setStopLossTakeProfit(
  exchange: string,
  symbol: string,
  side: 'long' | 'short',
  stopLossPrice?: number,
  takeProfitPrice?: number,
  quantity?: number,
): Promise<{
  success: boolean;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  message: string;
}> {
  return apiFetch(`${API_BASE}/trade/stop-loss-take-profit`, {
    method: 'POST',
    body: JSON.stringify({ exchange, symbol, side, stopLossPrice, takeProfitPrice, quantity }),
  });
}

/**
 * 取消交易所端的止损/止盈单
 */
export async function cancelStopLossTakeProfit(
  exchange: string,
  symbol: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch(`${API_BASE}/trade/cancel-sl-tp`, {
    method: 'POST',
    body: JSON.stringify({ exchange, symbol }),
  });
}

/**
 * 部分平仓
 * @param percent 平仓比例 0-100
 */
export async function partialClosePosition(
  exchange: string,
  symbol: string,
  percent: number,
  direction?: 'long' | 'short',
): Promise<TradeResult> {
  return apiFetch(`${API_BASE}/trade/partial-close`, {
    method: 'POST',
    body: JSON.stringify({ exchange, symbol, percent, direction }),
  });
}

export async function fetchConfig(): Promise<ServerTradeConfig> {
  return apiFetch(`${API_BASE}/config`);
}

export async function updateConfig(config: Partial<ServerTradeConfig>): Promise<ServerTradeConfig> {
  return apiFetch(`${API_BASE}/config`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function fetchSignals(symbol?: string, limit = 50): Promise<any[]> {
  const url = symbol ? `${API_BASE}/signals?symbol=${symbol}&limit=${limit}` : `${API_BASE}/signals?limit=${limit}`;
  return apiFetch(url);
}

export async function saveSignal(signal: ServerSignal): Promise<{ success: boolean; id: number }> {
  return apiFetch(`${API_BASE}/signals`, {
    method: 'POST',
    body: JSON.stringify(signal),
  });
}

export async function fetchTrades(symbol?: string, status?: string, limit = 50): Promise<any[]> {
  let url = `${API_BASE}/trades?limit=${limit}`;
  if (symbol) url += `&symbol=${symbol}`;
  if (status) url += `&status=${status}`;
  return apiFetch(url);
}

export async function fetchStats(): Promise<any> {
  return apiFetch(`${API_BASE}/stats`);
}

export interface PriceAlert {
  id: string;
  exchange: string;
  symbol: string;
  targetPrice: number;
  direction: 'above' | 'below';
  triggered: boolean;
  message: string;
}

export interface SignalAnalysis {
  analysis: string;
  model: string;
}

export async function fetchPriceAlerts(exchange?: string, symbol?: string): Promise<PriceAlert[]> {
  let url = `${API_BASE}/alerts`;
  const params: string[] = [];
  if (exchange) params.push(`exchange=${exchange}`);
  if (symbol) params.push(`symbol=${symbol}`);
  if (params.length > 0) url += `?${params.join('&')}`;
  return apiFetch(url);
}

export async function addPriceAlert(alert: Omit<PriceAlert, 'triggered'>): Promise<{ success: boolean }> {
  return apiFetch(`${API_BASE}/alerts`, {
    method: 'POST',
    body: JSON.stringify(alert),
  });
}

export async function removePriceAlert(id: string): Promise<{ success: boolean }> {
  return apiFetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' });
}

export async function clearTriggeredAlerts(): Promise<{ success: boolean }> {
  return apiFetch(`${API_BASE}/alerts/clear`, { method: 'POST' });
}

export async function analyzeSignal(data: {
  signal: any;
  marketData?: any;
  strategyName?: string;
}): Promise<SignalAnalysis> {
  return apiFetch(`${API_BASE}/llm/analyze-signal`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchLLMConfig(): Promise<any> {
  return apiFetch(`${API_BASE}/llm/config`);
}

export async function updateLLMConfig(config: Partial<any>): Promise<any> {
  return apiFetch(`${API_BASE}/llm/config`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export type NotificationChannel = 'browser' | 'telegram' | 'email';
export type NotificationEvent =
  | 'price_alert'
  | 'signal_generated'
  | 'position_opened'
  | 'position_closed'
  | 'stop_loss'
  | 'take_profit'
  | 'risk_triggered'
  | 'drawdown_warning'
  | 'daily_loss_limit'
  | 'custom';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  from: string;
  to: string[];
  secure: boolean;
  enabled: boolean;
}

export interface NotificationRule {
  id: string;
  name: string;
  event: NotificationEvent;
  channels: NotificationChannel[];
  enabled: boolean;
  minConfidence?: number;
  cooldownMinutes?: number;
  messageTemplate?: string;
}

export interface NotificationConfig {
  telegram: TelegramConfig;
  email: EmailConfig;
  rules: NotificationRule[];
  globalCooldownMinutes: number;
  globalEnabled: boolean;
}

export async function fetchNotificationConfig(): Promise<NotificationConfig> {
  return apiFetch(`${API_BASE}/notifications/config`);
}

export async function updateNotificationConfig(config: Partial<NotificationConfig>): Promise<NotificationConfig> {
  return apiFetch(`${API_BASE}/notifications/config`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function updateNotificationRules(rules: NotificationRule[]): Promise<NotificationConfig> {
  return apiFetch(`${API_BASE}/notifications/rules`, {
    method: 'POST',
    body: JSON.stringify({ rules }),
  });
}

export async function testNotification(event: NotificationEvent, payload?: Record<string, any>): Promise<{ success: boolean }> {
  return apiFetch(`${API_BASE}/notifications/test`, {
    method: 'POST',
    body: JSON.stringify({ event, payload }),
  });
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(url?: string) {
    this.url = url || WS_URL;
  }

  connect(onMessage: (data: any) => void) {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect(onMessage);
    };
  }

  private reconnect(onMessage: (data: any) => void) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    console.log(`Reconnecting in ${delay}ms...`);

    setTimeout(() => {
      this.connect(onMessage);
    }, delay);
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  subscribe(exchange: string, symbol: string) {
    this.send({ type: 'subscribe', exchange, symbol });
  }

  unsubscribe(exchange: string, symbol: string) {
    this.send({ type: 'unsubscribe', exchange, symbol });
  }

  getPrice(exchange: string, symbol: string) {
    this.send({ type: 'get_price', exchange, symbol });
  }

  getPositions(exchange: string, symbol?: string) {
    this.send({ type: 'get_positions', exchange, symbol });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
