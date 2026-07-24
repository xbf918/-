import type {
  TradePosition,
  TradeOrder,
  TradeHistory,
  AccountBalance,
  PositionSide,
  OrderSide,
  TradingConfig,
} from "@/types";
import { MAINTENANCE_MARGIN_RATE } from "@/lib/constants";

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function calculateLiquidationPrice(
  entryPrice: number,
  side: PositionSide,
  leverage: number,
): number {
  const mmr = MAINTENANCE_MARGIN_RATE;
  const initialMargin = 1 / leverage;
  if (side === "long") {
    return entryPrice * (1 - initialMargin + mmr);
  } else {
    return entryPrice * (1 + initialMargin - mmr);
  }
}

export function calculatePnl(
  entryPrice: number,
  currentPrice: number,
  quantity: number,
  side: PositionSide,
  leverage: number,
): { pnl: number; pnlPercent: number } {
  const priceDiff = side === "long"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  const pnl = priceDiff * quantity;
  const margin = (entryPrice * quantity) / leverage;
  const pnlPercent = margin > 0 ? (pnl / margin) * 100 : 0;
  return { pnl, pnlPercent };
}

export function calculateTakeProfit(
  entryPrice: number,
  side: PositionSide,
  percent: number,
): number {
  return side === "long"
    ? entryPrice * (1 + percent / 100)
    : entryPrice * (1 - percent / 100);
}

export function calculateStopLoss(
  entryPrice: number,
  side: PositionSide,
  percent: number,
): number {
  return side === "long"
    ? entryPrice * (1 - percent / 100)
    : entryPrice * (1 + percent / 100);
}

export function openPosition(params: {
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  quantity: number;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
  reason?: string;
}): TradePosition {
  const { symbol, side, entryPrice, quantity, leverage, takeProfit, stopLoss, reason } = params;
  const margin = (entryPrice * quantity) / leverage;
  const liquidationPrice = calculateLiquidationPrice(entryPrice, side, leverage);
  return {
    id: genId(),
    symbol,
    side,
    entryPrice,
    quantity,
    leverage,
    margin,
    takeProfit: takeProfit ?? null,
    stopLoss: stopLoss ?? null,
    liquidationPrice,
    openTime: Date.now(),
    reason,
  };
}

export function closePosition(
  position: TradePosition,
  exitPrice: number,
  reason: string,
): { closed: TradePosition; history: TradeHistory } {
  const { pnl, pnlPercent } = calculatePnl(
    position.entryPrice,
    exitPrice,
    position.quantity,
    position.side,
    position.leverage,
  );
  const closed: TradePosition = {
    ...position,
    closeTime: Date.now(),
    closePrice: exitPrice,
    pnl,
    pnlPercent,
    reason,
  };
  const history: TradeHistory = {
    id: genId(),
    symbol: position.symbol,
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: position.quantity,
    leverage: position.leverage,
    pnl,
    pnlPercent,
    openTime: position.openTime,
    closeTime: Date.now(),
    reason,
  };
  return { closed, history };
}

export function createOrder(params: {
  symbol: string;
  side: OrderSide;
  type: "market" | "limit";
  action: "open" | "close";
  quantity: number;
  price: number;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
  reason?: string;
}): TradeOrder {
  return {
    id: genId(),
    ...params,
    status: "pending",
    createTime: Date.now(),
  };
}

export function calculateAccountBalance(
  initialBalance: number,
  positions: TradePosition[],
  history: TradeHistory[],
  currentPrices: Record<string, number>,
): AccountBalance {
  let usedMargin = 0;
  let unrealizedPnl = 0;

  for (const pos of positions) {
    usedMargin += pos.margin;
    const price = currentPrices[pos.symbol] ?? pos.entryPrice;
    const { pnl } = calculatePnl(pos.entryPrice, price, pos.quantity, pos.side, pos.leverage);
    unrealizedPnl += pnl;
  }

  const realizedPnl = history.reduce((sum, h) => sum + h.pnl, 0);
  const total = initialBalance + realizedPnl + unrealizedPnl;
  const available = total - usedMargin;

  return { total, available, usedMargin, unrealizedPnl };
}

export function calculateOrderQuantity(
  availableBalance: number,
  entryPrice: number,
  leverage: number,
  orderSizePercent: number,
): number {
  const marginToUse = availableBalance * (orderSizePercent / 100);
  const notionalValue = marginToUse * leverage;
  return notionalValue / entryPrice;
}

export function calculateTradingStats(history: TradeHistory[]) {
  const totalTrades = history.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
    };
  }

  const wins = history.filter((h) => h.pnl > 0);
  const losses = history.filter((h) => h.pnl <= 0);
  const winTrades = wins.length;
  const lossTrades = losses.length;
  const winRate = (winTrades / totalTrades) * 100;

  const totalPnl = history.reduce((sum, h) => sum + h.pnl, 0);
  const totalPnlPercent = history.reduce((sum, h) => sum + h.pnlPercent, 0) / totalTrades;

  const bestTrade = Math.max(...history.map((h) => h.pnl));
  const worstTrade = Math.min(...history.map((h) => h.pnl));

  const avgWin = winTrades > 0 ? wins.reduce((sum, h) => sum + h.pnl, 0) / winTrades : 0;
  const avgLoss = lossTrades > 0 ? losses.reduce((sum, h) => sum + h.pnl, 0) / lossTrades : 0;

  const grossProfit = wins.reduce((sum, h) => sum + h.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, h) => sum + h.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // 计算当前连胜/连败（history[0] 为最新记录）
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  for (const h of history) {
    if (h.pnl > 0) {
      if (consecutiveLosses > 0) break;
      consecutiveWins++;
    } else {
      if (consecutiveWins > 0) break;
      consecutiveLosses++;
    }
  }

  return {
    totalTrades,
    winTrades,
    lossTrades,
    winRate,
    totalPnl,
    totalPnlPercent,
    bestTrade,
    worstTrade,
    avgWin,
    avgLoss,
    profitFactor,
    consecutiveWins,
    consecutiveLosses,
  };
}

export function shouldTriggerSignal(
  direction: "long" | "short" | "neutral",
  confidence: number,
  config: TradingConfig,
): boolean {
  if (direction === "neutral") return false;
  return confidence >= config.signalThreshold;
}

export function checkStopLoss(position: TradePosition, currentPrice: number): boolean {
  if (!position.stopLoss) return false;
  if (position.side === "long") {
    return currentPrice <= position.stopLoss;
  } else {
    return currentPrice >= position.stopLoss;
  }
}

export function checkTakeProfit(position: TradePosition, currentPrice: number): boolean {
  if (!position.takeProfit) return false;
  if (position.side === "long") {
    return currentPrice >= position.takeProfit;
  } else {
    return currentPrice <= position.takeProfit;
  }
}

export function checkLiquidation(position: TradePosition, currentPrice: number): boolean {
  if (position.side === "long") {
    return currentPrice <= position.liquidationPrice;
  } else {
    return currentPrice >= position.liquidationPrice;
  }
}

export function updateTrailingStop(
  position: TradePosition,
  currentPrice: number,
  trailingPercent: number,
): number | null {
  if (position.side === "long") {
    const newStop = currentPrice * (1 - trailingPercent / 100);
    if (!position.stopLoss || newStop > position.stopLoss) {
      return newStop;
    }
  } else {
    const newStop = currentPrice * (1 + trailingPercent / 100);
    if (!position.stopLoss || newStop < position.stopLoss) {
      return newStop;
    }
  }
  return position.stopLoss;
}
