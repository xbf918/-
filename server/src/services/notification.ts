import axios from 'axios';
import { broadcastSignal } from '../ws';

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
  lastTriggered?: number;
}

export interface NotificationConfig {
  telegram: TelegramConfig;
  email: EmailConfig;
  rules: NotificationRule[];
  globalCooldownMinutes: number;
  globalEnabled: boolean;
}

export const defaultNotificationConfig: NotificationConfig = {
  telegram: { botToken: '', chatId: '', enabled: false },
  email: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    username: '',
    password: '',
    from: '',
    to: [],
    secure: false,
    enabled: false,
  },
  rules: [
    {
      id: 'rule-price-alert',
      name: '价格告警',
      event: 'price_alert',
      channels: ['browser'],
      enabled: true,
      cooldownMinutes: 5,
    },
    {
      id: 'rule-signal',
      name: '交易信号',
      event: 'signal_generated',
      channels: ['browser'],
      enabled: true,
      minConfidence: 0.65,
      cooldownMinutes: 15,
    },
    {
      id: 'rule-position',
      name: '仓位变动',
      event: 'position_opened',
      channels: ['browser'],
      enabled: true,
      cooldownMinutes: 1,
    },
    {
      id: 'rule-risk',
      name: '风控触发',
      event: 'risk_triggered',
      channels: ['browser'],
      enabled: true,
      cooldownMinutes: 30,
    },
  ],
  globalCooldownMinutes: 1,
  globalEnabled: true,
};

let notificationConfig: NotificationConfig = { ...defaultNotificationConfig };

export function setNotificationConfig(config: Partial<NotificationConfig>) {
  notificationConfig = { ...notificationConfig, ...config };
}

export function getNotificationConfig(): NotificationConfig {
  return { ...notificationConfig };
}

export function setNotificationRules(rules: NotificationRule[]) {
  notificationConfig = { ...notificationConfig, rules };
}

export function getNotificationRules(): NotificationRule[] {
  return [...notificationConfig.rules];
}

let lastGlobalNotification = 0;

export async function sendNotification(
  event: NotificationEvent,
  payload: Record<string, any>,
): Promise<void> {
  if (!notificationConfig.globalEnabled) return;

  const now = Date.now();
  const globalCooldownMs = notificationConfig.globalCooldownMinutes * 60_000;
  if (now - lastGlobalNotification < globalCooldownMs) return;

  const rule = notificationConfig.rules.find(
    (r) => r.event === event && r.enabled,
  );
  if (!rule) return;

  if (rule.minConfidence && payload.confidence < rule.minConfidence) return;

  const ruleCooldownMs = (rule.cooldownMinutes || 0) * 60_000;
  if (rule.lastTriggered && now - rule.lastTriggered < ruleCooldownMs) return;

  const message = buildMessage(event, payload, rule.messageTemplate);
  const channels = rule.channels.length > 0 ? rule.channels : ['browser'];

  for (const channel of channels) {
    try {
      switch (channel) {
        case 'browser':
          await sendBrowserNotification(event, message, payload);
          break;
        case 'telegram':
          await sendTelegramNotification(message);
          break;
        case 'email':
          await sendEmailNotification(event, message);
          break;
      }
    } catch (error) {
      console.error(`[Notification] Failed to send via ${channel}:`, error);
    }
  }

  rule.lastTriggered = now;
  lastGlobalNotification = now;
}

function buildMessage(
  event: NotificationEvent,
  payload: Record<string, any>,
  template?: string,
): string {
  if (template) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => payload[key] ?? '');
  }

  switch (event) {
    case 'price_alert':
      return `[价格告警] ${payload.symbol || ''} 当前价格 $${payload.currentPrice} 触发 ${payload.direction} $${payload.targetPrice}。${payload.message || ''}`;
    case 'signal_generated':
      return `[交易信号] ${payload.symbol || ''} ${payload.direction === 'long' ? '做多' : payload.direction === 'short' ? '做空' : '观望'} 置信度 ${Math.round((payload.confidence || 0) * 100)}% 强度 ${Math.round((payload.strength || 0) * 100)}%`;
    case 'position_opened':
      return `[开仓] ${payload.symbol || ''} ${payload.side || ''} 入场价 $${payload.entryPrice} 杠杆 ${payload.leverage || 1}x`;
    case 'position_closed':
      return `[平仓] ${payload.symbol || ''} ${payload.side || ''} 收益 $${payload.pnl || 0} (${(payload.pnlPercent || 0).toFixed(2)}%) 原因: ${payload.reason || ''}`;
    case 'stop_loss':
      return `[止损触发] ${payload.symbol || ''} ${payload.side || ''} 价格 $${payload.price}`;
    case 'take_profit':
      return `[止盈触发] ${payload.symbol || ''} ${payload.side || ''} 价格 $${payload.price}`;
    case 'risk_triggered':
      return `[风控触发] ${payload.reason || ''}`;
    case 'drawdown_warning':
      return `[回撤警告] 当前回撤 ${(payload.drawdownPercent || 0).toFixed(2)}%`;
    case 'daily_loss_limit':
      return `[日亏损限制] 今日亏损 ${(payload.dailyPnlPercent || 0).toFixed(2)}%，已暂停交易`;
    default:
      return `[通知] ${JSON.stringify(payload)}`;
  }
}

async function sendBrowserNotification(
  event: NotificationEvent,
  message: string,
  payload: Record<string, any>,
): Promise<void> {
  await broadcastSignal({
    type: 'notification',
    event,
    message,
    payload,
    timestamp: Date.now(),
  });
}

async function sendTelegramNotification(message: string): Promise<void> {
  const cfg = notificationConfig.telegram;
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;

  await axios.post(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    chat_id: cfg.chatId,
    text: message,
    parse_mode: 'HTML',
  });
}

async function sendEmailNotification(
  event: NotificationEvent,
  message: string,
): Promise<void> {
  const cfg = notificationConfig.email;
  if (!cfg.enabled || !cfg.smtpHost || !cfg.username || cfg.to.length === 0) return;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.secure,
      auth: { user: cfg.username, pass: cfg.password },
    });

    await transporter.sendMail({
      from: cfg.from || cfg.username,
      to: cfg.to.join(','),
      subject: `交易通知 - ${event}`,
      text: message,
    });
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn('[Notification] nodemailer not installed, skipping email');
      return;
    }
    throw error;
  }
}
