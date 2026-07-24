import { exchanges, type ExchangeId, type Position, type Account } from '../exchange/client';
import { query, run } from '../db';

export interface TradeConfig {
  maxOpenPositions: number;
  maxDailyLossPercent: number;
  leverage: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  orderSizePercent: number;
}

export interface Signal {
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  confidence: number;
  price: number;
}

export const defaultConfig: TradeConfig = {
  maxOpenPositions: 3,
  maxDailyLossPercent: 5,
  leverage: 5,
  takeProfitPercent: 1.5,
  stopLossPercent: 1,
  orderSizePercent: 10,
};

let config = { ...defaultConfig };

export function setConfig(newConfig: Partial<TradeConfig>) {
  config = { ...config, ...newConfig };
}

export function getConfig(): TradeConfig {
  return { ...config };
}

export async function getPositions(exchangeId: ExchangeId, symbol?: string): Promise<Position[]> {
  return exchanges[exchangeId].getPositions(symbol);
}

export async function getAccount(exchangeId: ExchangeId): Promise<Account> {
  return exchanges[exchangeId].getAccount();
}

export async function getPrice(exchangeId: ExchangeId, symbol: string): Promise<number> {
  return exchanges[exchangeId].getPrice(symbol);
}

export async function openPosition(
  exchangeId: ExchangeId,
  symbol: string,
  direction: 'long' | 'short',
  price: number,
  leverage?: number,
): Promise<{ success: boolean; message: string; position?: Position }> {
  const client = exchanges[exchangeId];

  const [account, positions] = await Promise.all([
    client.getAccount(),
    client.getPositions(symbol),
  ]);

  const currentLeverage = leverage || config.leverage;
  const quantity = calculateQuantity(account.availableBalance, price, currentLeverage, config.orderSizePercent);

  if (quantity <= 0) {
    return { success: false, message: 'Insufficient balance' };
  }

  const sameSidePos = positions.find((p) => p.side === (direction === 'long' ? 'LONG' : 'SHORT'));
  if (sameSidePos) {
    return { success: false, message: 'Position already exists' };
  }

  const totalPositions = (await client.getPositions()).length;
  if (totalPositions >= config.maxOpenPositions) {
    return { success: false, message: 'Max open positions reached' };
  }

  const takeProfit = calculateTakeProfit(price, direction, config.takeProfitPercent);
  const stopLoss = calculateStopLoss(price, direction, config.stopLossPercent);

  const side = direction === 'long' ? 'BUY' : 'SELL';

  try {
    await client.placeOrder(symbol, side, 'MARKET', quantity, currentLeverage, undefined, takeProfit, stopLoss);

    await run(
      'INSERT INTO trades (symbol, side, entry_price, quantity, leverage, margin, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        symbol,
        direction,
        price,
        quantity,
        currentLeverage,
        (account.availableBalance * config.orderSizePercent) / 100,
        'open',
        'signal',
        Date.now(),
        Date.now(),
      ],
    );

    const newPositions = await client.getPositions(symbol);
    const newPos = newPositions.find((p) => p.side === (direction === 'long' ? 'LONG' : 'SHORT'));

    return { success: true, message: 'Position opened', position: newPos };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to open position' };
  }
}

export async function closePosition(
  exchangeId: ExchangeId,
  symbol: string,
  direction?: 'long' | 'short',
): Promise<{ success: boolean; message: string }> {
  const client = exchanges[exchangeId];

  try {
    await client.closePosition(symbol, direction ? (direction === 'long' ? 'LONG' : 'SHORT') : undefined);

    await run(
      'UPDATE trades SET status = ?, updated_at = ? WHERE symbol = ? AND status = ?',
      ['closed', Date.now(), symbol, 'open'],
    );

    return { success: true, message: 'Position closed' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to close position' };
  }
}

export async function checkStopLoss(
  exchangeId: ExchangeId,
  positions: Position[],
): Promise<Position[]> {
  const client = exchanges[exchangeId];
  const triggered: Position[] = [];

  for (const pos of positions) {
    const currentPrice = await client.getPrice(pos.symbol);

    if (pos.side === 'LONG' && currentPrice <= pos.stopLoss!) {
      await client.closePosition(pos.symbol, 'LONG');
      triggered.push(pos);
    } else if (pos.side === 'SHORT' && currentPrice >= pos.stopLoss!) {
      await client.closePosition(pos.symbol, 'SHORT');
      triggered.push(pos);
    }
  }

  return triggered;
}

export async function checkTakeProfit(
  exchangeId: ExchangeId,
  positions: Position[],
): Promise<Position[]> {
  const client = exchanges[exchangeId];
  const triggered: Position[] = [];

  for (const pos of positions) {
    const currentPrice = await client.getPrice(pos.symbol);

    if (pos.side === 'LONG' && currentPrice >= pos.takeProfit!) {
      await client.closePosition(pos.symbol, 'LONG');
      triggered.push(pos);
    } else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfit!) {
      await client.closePosition(pos.symbol, 'SHORT');
      triggered.push(pos);
    }
  }

  return triggered;
}

function calculateQuantity(balance: number, price: number, leverage: number, percent: number): number {
  const amount = (balance * percent) / 100;
  return (amount * leverage) / price;
}

function calculateTakeProfit(price: number, direction: 'long' | 'short', percent: number): number {
  if (direction === 'long') {
    return price * (1 + percent / 100);
  }
  return price * (1 - percent / 100);
}

function calculateStopLoss(price: number, direction: 'long' | 'short', percent: number): number {
  if (direction === 'long') {
    return price * (1 - percent / 100);
  }
  return price * (1 + percent / 100);
}

export async function saveSignal(signal: Signal): Promise<number> {
  const result = await run(
    'INSERT INTO signals (symbol, direction, strength, confidence, price, signal_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      signal.symbol,
      signal.direction,
      signal.strength,
      signal.confidence,
      signal.price,
      JSON.stringify(signal),
      Date.now(),
    ],
  );
  return result.lastID;
}

export async function getSignals(symbol?: string, limit: number = 50): Promise<any[]> {
  let sql = 'SELECT * FROM signals ORDER BY created_at DESC';
  const params: any[] = [];

  if (symbol) {
    sql = 'SELECT * FROM signals WHERE symbol = ? ORDER BY created_at DESC';
    params.push(symbol);
  }

  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return query(sql, params);
}

export async function getTrades(symbol?: string, status?: string, limit: number = 50): Promise<any[]> {
  let sql = 'SELECT * FROM trades ORDER BY created_at DESC';
  const params: any[] = [];

  if (symbol) {
    sql = 'SELECT * FROM trades WHERE symbol = ? ORDER BY created_at DESC';
    params.push(symbol);
  }

  if (status) {
    sql = symbol
      ? 'SELECT * FROM trades WHERE symbol = ? AND status = ? ORDER BY created_at DESC'
      : 'SELECT * FROM trades WHERE status = ? ORDER BY created_at DESC';
    params.push(status);
  }

  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return query(sql, params);
}

/**
 * 在交易所端设置止损/止盈条件单
 * 这样即使前端断连，交易所也会自动执行止损/止盈
 */
export async function setStopLossTakeProfit(
  exchangeId: ExchangeId,
  symbol: string,
  side: 'long' | 'short',
  stopLossPrice?: number,
  takeProfitPrice?: number,
  quantity?: number,
): Promise<{ success: boolean; stopLossOrderId?: string; takeProfitOrderId?: string; message: string }> {
  const client = exchanges[exchangeId];
  const posSide = side === 'long' ? 'LONG' : 'SHORT';

  try {
    // 先取消旧的条件单
    await client.cancelConditionalOrders(symbol);

    const result = await client.setStopLossTakeProfit(
      symbol,
      posSide,
      stopLossPrice,
      takeProfitPrice,
      quantity,
    );

    return {
      success: true,
      stopLossOrderId: result.stopLossOrderId,
      takeProfitOrderId: result.takeProfitOrderId,
      message: '止损/止盈单已设置',
    };
  } catch (error: any) {
    return { success: false, message: error.message || '设置止损/止盈失败' };
  }
}

/**
 * 取消交易所端的止损/止盈条件单
 */
export async function cancelStopLossTakeProfit(
  exchangeId: ExchangeId,
  symbol: string,
): Promise<{ success: boolean; message: string }> {
  const client = exchanges[exchangeId];
  try {
    await client.cancelConditionalOrders(symbol);
    return { success: true, message: '已取消止损/止盈单' };
  } catch (error: any) {
    return { success: false, message: error.message || '取消止损/止盈失败' };
  }
}

/**
 * 部分平仓
 * @param percent 平仓比例 0-100
 */
export async function partialClosePosition(
  exchangeId: ExchangeId,
  symbol: string,
  percent: number,
  direction?: 'long' | 'short',
): Promise<{ success: boolean; message: string }> {
  const client = exchanges[exchangeId];

  try {
    const positions = await client.getPositions(symbol);
    const posSide = direction === 'long' ? 'LONG' : direction === 'short' ? 'SHORT' : undefined;

    for (const pos of positions) {
      if (posSide && pos.side !== posSide) continue;

      const closeQty = pos.quantity * (percent / 100);
      if (closeQty <= 0) continue;

      await client.partialClose(symbol, pos.side, closeQty, pos.leverage);
    }

    return { success: true, message: `已平仓 ${percent}%` };
  } catch (error: any) {
    return { success: false, message: error.message || '部分平仓失败' };
  }
}