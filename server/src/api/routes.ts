import express from 'express';
import {
  getPositions,
  getAccount,
  getPrice,
  openPosition,
  closePosition,
  setStopLossTakeProfit,
  cancelStopLossTakeProfit,
  partialClosePosition,
  getConfig,
  setConfig,
  getSignals,
  saveSignal,
  getTrades,
  type TradeConfig,
  type Signal,
} from '../services/trading';
import { exchanges, type ExchangeId } from '../exchange/client';
import { query, run } from '../db';
import { llmService, type LLMMessage, type LLMConfig } from '../services/llm';
import {
  addPriceAlert,
  removePriceAlert,
  getPriceAlerts,
  clearTriggeredAlerts,
  addSymbolToMonitor,
  removeSymbolFromMonitor,
} from '../services/scheduler';
import {
  getNotificationConfig,
  setNotificationConfig,
  setNotificationRules,
  sendNotification,
  type NotificationConfig,
} from '../services/notification';
import { register, login, changePassword, authMiddleware, getUserById, updateUserRole } from '../services/auth';
import { getEmailConfig, setEmailConfig, testEmail, sendVerificationCode, verifyCode } from '../services/email-service';
import { fetchFearGreedIndex, fetchCryptoNews, fetchOnchainData } from '../services/market';
import { getCredentials, saveCredentials, deleteCredentials, setValidated, getCredentialsRaw } from '../services/credentials';
import { testConnection, getAccount as getExchangeAccount, getPositions as getExchangePositions, placeOrder, closePosition as closeExchangePosition, cancelOrder, setLeverage } from '../services/exchange-api';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

router.get('/', (req, res) => {
  res.json({
    name: 'Trading Bot API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /api/health',
      account: 'GET /api/account/:exchange',
      positions: 'GET /api/positions/:exchange',
      price: 'GET /api/price/:exchange/:symbol',
      candles: 'GET /api/candles/:exchange/:symbol?interval=1h&limit=100',
      'trade open': 'POST /api/trade/open',
      'trade close': 'POST /api/trade/close',
      config: 'GET/POST /api/config',
      signals: 'GET/POST /api/signals',
      trades: 'GET /api/trades',
      stats: 'GET /api/stats',
    },
    exchanges: ['binance', 'okx'],
    timestamp: Date.now(),
  });
});

// ========== 用户认证 ==========
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, verificationCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    if (verificationCode) {
      const verifyResult = verifyCode(email, verificationCode, 'register');
      if (!verifyResult.success) {
        return res.status(400).json({ success: false, error: verifyResult.error });
      }
    }

    const result = await register({ email, password });
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const result = await login(email, password);
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById((req as any).user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const result = await changePassword((req as any).user.userId, oldPassword, newPassword);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 管理员功能 ==========
router.get('/admin/users', authMiddleware, async (req, res) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const users = await query('SELECT id, email, role, email_verified, created_at, updated_at FROM users ORDER BY id DESC');
    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/admin/users/:id/role', authMiddleware, async (req, res) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const success = await updateUserRole(parseInt(req.params.id), role);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 邮件服务 ==========
router.get('/email/config', (req, res) => {
  res.json(getEmailConfig());
});

router.post('/email/config', (req, res) => {
  const { provider, config } = req.body;
  const result = setEmailConfig(provider, config);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

router.post('/email/test', async (req, res) => {
  const { to } = req.body;
  if (!to) {
    return res.status(400).json({ success: false, error: 'Missing required field: to' });
  }
  const result = await testEmail(to);
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

router.post('/email/send-code', async (req, res) => {
  try {
    const { email, type } = req.body;
    if (!email || !type) {
      return res.status(400).json({ success: false, error: 'Missing required fields: email, type' });
    }
    const result = await sendVerificationCode(email, type);
    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error?.includes('Too many') ? 429 : 500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/email/verify-code', (req, res) => {
  const { email, code, type } = req.body;
  if (!email || !code || !type) {
    return res.status(400).json({ success: false, error: 'Missing required fields: email, code, type' });
  }
  const result = verifyCode(email, code, type);
  res.json(result);
});

// ========== 市场数据 ==========
router.get('/market/fear-greed', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 7);
    const data = await fetchFearGreedIndex(limit);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/market/news', async (req, res) => {
  try {
    const currency = (req.query.currency as string) || 'BTC';
    const data = await fetchCryptoNews(currency);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/market/onchain', async (req, res) => {
  try {
    const coinId = (req.query.coinId as string) || 'bitcoin';
    const data = await fetchOnchainData(coinId);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 凭证管理 ==========
router.get('/credentials', authMiddleware, async (req, res) => {
  try {
    const result = await getCredentials();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/credentials', authMiddleware, async (req, res) => {
  try {
    const creds = req.body;
    if (!creds.exchange || !creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: exchange, apiKey, apiSecret',
      });
    }
    const result = await saveCredentials({
      exchange: creds.exchange,
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      passphrase: creds.passphrase,
      testnet: creds.testnet || false,
      permissions: creds.permissions || [],
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/credentials/:exchange', authMiddleware, async (req, res) => {
  try {
    await deleteCredentials(req.params.exchange);
    res.json({ success: true, exchange: req.params.exchange });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/credentials/test', authMiddleware, async (req, res) => {
  try {
    const creds = req.body;
    if (!creds.exchange || !creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const result = await testConnection(creds.exchange, creds);
    if (result.success) {
      await saveCredentials({
        exchange: creds.exchange,
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        passphrase: creds.passphrase,
        testnet: creds.testnet || false,
        permissions: creds.permissions || [],
        validated: true,
      });
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, account: null });
  }
});

// ========== 账户和持仓（使用凭证管理的 API Key） ==========
router.get('/account', authMiddleware, async (req, res) => {
  try {
    const exchange = req.query.exchange as string;
    if (!exchange) {
      return res.status(400).json({ error: 'exchange is required' });
    }
    const account = await getExchangeAccount(exchange);
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/positions', authMiddleware, async (req, res) => {
  try {
    const exchange = req.query.exchange as string;
    const symbol = req.query.symbol as string;
    if (!exchange) {
      return res.status(400).json({ error: 'exchange is required' });
    }
    const positions = await getExchangePositions(exchange, symbol);
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 交易（使用凭证管理的 API Key） ==========
router.post('/order', authMiddleware, async (req, res) => {
  try {
    const { exchange, ...body } = req.body;
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'exchange is required' });
    }
    const result = await placeOrder(exchange, body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/order/close', authMiddleware, async (req, res) => {
  try {
    const { exchange, ...body } = req.body;
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'exchange is required' });
    }
    const result = await closeExchangePosition(exchange, body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/order/cancel', authMiddleware, async (req, res) => {
  try {
    const { exchange, ...body } = req.body;
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'exchange is required' });
    }
    const result = await cancelOrder(exchange, body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/leverage', authMiddleware, async (req, res) => {
  try {
    const { exchange, ...body } = req.body;
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'exchange is required' });
    }
    const result = await setLeverage(exchange, body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 原有 API（保留兼容性） ==========
router.get('/account/:exchange', authMiddleware, async (req, res) => {
  try {
    const account = await getAccount(req.params.exchange as ExchangeId);
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/positions/:exchange', authMiddleware, async (req, res) => {
  try {
    const positions = await getPositions(req.params.exchange as ExchangeId, req.query.symbol as string);
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/price/:exchange/:symbol', async (req, res) => {
  try {
    const price = await getPrice(req.params.exchange as ExchangeId, req.params.symbol);
    res.json({ price });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/candles/:exchange/:symbol', async (req, res) => {
  try {
    const { interval = '1h', limit = 100 } = req.query;
    const candles = await exchanges[req.params.exchange as ExchangeId].getCandles(
      req.params.symbol,
      interval as string,
      parseInt(limit as string),
    );
    res.json(candles);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trade/open', authMiddleware, async (req, res) => {
  try {
    const { exchange, symbol, direction, price, leverage } = req.body;
    const result = await openPosition(exchange as ExchangeId, symbol, direction, price, leverage);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trade/close', authMiddleware, async (req, res) => {
  try {
    const { exchange, symbol, direction } = req.body;
    const result = await closePosition(exchange as ExchangeId, symbol, direction);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trade/stop-loss-take-profit', authMiddleware, async (req, res) => {
  try {
    const { exchange, symbol, side, stopLossPrice, takeProfitPrice, quantity } = req.body;
    const result = await setStopLossTakeProfit(
      exchange as ExchangeId,
      symbol,
      side,
      stopLossPrice,
      takeProfitPrice,
      quantity,
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trade/cancel-sl-tp', authMiddleware, async (req, res) => {
  try {
    const { exchange, symbol } = req.body;
    const result = await cancelStopLossTakeProfit(exchange as ExchangeId, symbol);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/trade/partial-close', authMiddleware, async (req, res) => {
  try {
    const { exchange, symbol, percent, direction } = req.body;
    const result = await partialClosePosition(exchange as ExchangeId, symbol, percent, direction);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/config', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/config', async (req, res) => {
  try {
    const config = await setConfig(req.body as Partial<TradeConfig>);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/signals', async (req, res) => {
  try {
    const signals = await getSignals(req.query.symbol as string, parseInt((req.query.limit as string) || '50'));
    res.json(signals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/signals', async (req, res) => {
  try {
    const result = await saveSignal(req.body as Signal);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trades', async (req, res) => {
  try {
    const trades = await getTrades(
      req.query.symbol as string,
      req.query.status as string,
      parseInt((req.query.limit as string) || '50'),
    );
    res.json(trades);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const trades = await query('SELECT * FROM trades');
    const signals = await query('SELECT * FROM signals');

    const closedTrades = trades.filter((t: any) => t.status === 'closed');
    const winTrades = closedTrades.filter((t: any) => t.pnl > 0);
    const lossTrades = closedTrades.filter((t: any) => t.pnl <= 0);

    const totalPnl = closedTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;

    res.json({
      totalTrades: trades.length,
      closedTrades: closedTrades.length,
      openTrades: trades.filter((t: any) => t.status === 'open').length,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      winRate: winRate.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      totalSignals: signals.length,
      tradedSignals: signals.filter((s: any) => s.traded).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/llm/chat', async (req, res) => {
  try {
    const { messages, config } = req.body as {
      messages: LLMMessage[];
      config?: Partial<LLMConfig>;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const result = await llmService.chat(messages, config);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/llm/config', (req, res) => {
  try {
    const config = llmService.getConfig();
    res.json({
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/llm/config', (req, res) => {
  try {
    const config = req.body as Partial<LLMConfig>;
    llmService.updateConfig(config);
    const updated = llmService.getConfig();
    res.json({
      provider: updated.provider,
      baseUrl: updated.baseUrl,
      model: updated.model,
      temperature: updated.temperature,
      maxTokens: updated.maxTokens,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/llm/analyze-signal', async (req, res) => {
  try {
    const { signal, marketData, strategyName } = req.body;

    const prompt = [
      {
        role: 'system' as const,
        content: `你是一个专业的加密货币交易分析师。请分析以下信号并给出操作建议。

分析格式要求：
1. 信号解读：用自然语言解释信号背后的逻辑
2. 操作建议：明确给出入场价、止损价、止盈价
3. 风险提示：指出潜在风险和注意事项
4. 交易计划：给出具体的仓位建议和执行步骤

保持专业但易懂，不要使用过于晦涩的术语。`,
      },
      {
        role: 'user' as const,
        content: `请分析以下交易信号：

策略名称：${strategyName || '综合策略'}
信号方向：${signal.direction}
置信度：${(signal.confidence * 100).toFixed(0)}%
强度：${(signal.strength * 100).toFixed(0)}%
入场价格：${signal.entry_price}
止损价格：${signal.stop_loss}
止盈价格：${signal.take_profit}
当前市场状态：${signal.market_regime || '未知'}

市场数据摘要：${JSON.stringify(marketData || {}, null, 2)}

请给出详细的分析和操作建议。`,
      },
    ];

    const result = await llmService.chat(prompt, { temperature: 0.3 });
    res.json({ analysis: result.content, model: result.model });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alerts', (req, res) => {
  try {
    const alerts = getPriceAlerts(req.query.exchange as ExchangeId, req.query.symbol as string);
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/alerts', (req, res) => {
  try {
    const { id, exchange, symbol, targetPrice, direction, message } = req.body;
    addPriceAlert({ id, exchange, symbol, targetPrice, direction, message });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/alerts/:id', (req, res) => {
  try {
    removePriceAlert(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/alerts/clear', (req, res) => {
  try {
    clearTriggeredAlerts();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/monitor/add', (req, res) => {
  try {
    const { exchange, symbol } = req.body;
    addSymbolToMonitor(exchange as ExchangeId, symbol);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/monitor/remove', (req, res) => {
  try {
    const { exchange, symbol } = req.body;
    removeSymbolFromMonitor(exchange as ExchangeId, symbol);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/notifications/config', (req, res) => {
  try {
    res.json(getNotificationConfig());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notifications/config', (req, res) => {
  try {
    setNotificationConfig(req.body as Partial<NotificationConfig>);
    res.json(getNotificationConfig());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notifications/rules', (req, res) => {
  try {
    setNotificationRules(req.body.rules || []);
    res.json(getNotificationConfig());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notifications/test', async (req, res) => {
  try {
    const { event, payload } = req.body;
    await sendNotification(event || 'custom', payload || { message: '测试通知' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
