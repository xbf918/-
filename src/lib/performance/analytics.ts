import type { TradeHistory } from "@/types";

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  openTime: number;
  closeTime: number;
  durationSeconds: number;
  reason: string;
  emotion?: string;
  notes?: string;
  marketContext?: string;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  calmarRatio: number;
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
  longWinRate: number;
  shortWinRate: number;
  longPnl: number;
  shortPnl: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

export interface AttributionAnalysis {
  bySymbol: Array<{ symbol: string; trades: number; winRate: number; pnl: number }>;
  byDirection: Array<{ direction: string; trades: number; winRate: number; pnl: number }>;
  byReason: Array<{ reason: string; trades: number; winRate: number; pnl: number }>;
  byHour: Array<{ hour: number; trades: number; winRate: number; pnl: number }>;
  byDayOfWeek: Array<{ day: number; trades: number; winRate: number; pnl: number }>;
}

export function buildTradeJournal(history: TradeHistory[]): TradeJournalEntry[] {
  return history.map((h) => {
    const duration = h.closeTime - h.openTime;
    const pnlPercent = h.entryPrice !== 0
      ? ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100 * (h.side === "long" ? 1 : -1)
      : 0;

    return {
      id: h.id,
      symbol: h.symbol,
      side: h.side,
      entryPrice: h.entryPrice,
      exitPrice: h.exitPrice,
      quantity: h.quantity,
      pnl: h.pnl,
      pnlPercent,
      leverage: h.leverage || 1,
      openTime: h.openTime,
      closeTime: h.closeTime,
      durationSeconds: duration,
      reason: h.reason || "unknown",
      emotion: (h as any).emotion,
      notes: (h as any).notes,
      marketContext: (h as any).marketContext,
    };
  });
}

export function calculateEquityCurve(
  history: TradeHistory[],
  initialBalance: number,
): EquityPoint[] {
  const sorted = [...history].sort((a, b) => a.closeTime - b.closeTime);
  let equity = initialBalance;
  let peak = initialBalance;
  const points: EquityPoint[] = [{ time: sorted[0]?.openTime || Date.now(), equity, drawdown: 0, drawdownPercent: 0 }];

  for (const trade of sorted) {
    equity += trade.pnl;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
    points.push({
      time: trade.closeTime,
      equity,
      drawdown,
      drawdownPercent,
    });
  }

  return points;
}

export function calculatePerformanceMetrics(
  history: TradeHistory[],
  initialBalance: number,
): PerformanceMetrics {
  const totalTrades = history.length;
  const wins = history.filter((h) => h.pnl > 0);
  const losses = history.filter((h) => h.pnl < 0);

  const totalWinPnl = wins.reduce((sum, h) => sum + h.pnl, 0);
  const totalLossPnl = Math.abs(losses.reduce((sum, h) => sum + h.pnl, 0));

  const equityCurve = calculateEquityCurve(history, initialBalance);
  const maxDrawdownPercent = Math.max(...equityCurve.map((p) => p.drawdownPercent), 0);
  const maxDrawdown = Math.max(...equityCurve.map((p) => p.drawdown), 0);

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    const curr = equityCurve[i].equity;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }

  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const finalPnl = history.reduce((sum, h) => sum + h.pnl, 0);
  const calmarRatio = maxDrawdownPercent > 0
    ? (finalPnl / initialBalance) * 100 / maxDrawdownPercent
    : 0;

  const longTrades = history.filter((h) => h.side === "long");
  const shortTrades = history.filter((h) => h.side === "short");

  const durations = history.map((h) => h.closeTime - h.openTime).filter((d) => d > 0);

  return {
    totalTrades,
    winTrades: wins.length,
    lossTrades: losses.length,
    winRate: totalTrades > 0 ? wins.length / totalTrades : 0,
    totalPnl: finalPnl,
    totalPnlPercent: initialBalance > 0 ? (finalPnl / initialBalance) * 100 : 0,
    avgWin: wins.length > 0 ? totalWinPnl / wins.length : 0,
    avgLoss: losses.length > 0 ? -totalLossPnl / losses.length : 0,
    profitFactor: totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? Infinity : 0,
    expectancy: totalTrades > 0 ? finalPnl / totalTrades : 0,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    calmarRatio,
    avgTradeDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    bestTrade: history.length > 0 ? Math.max(...history.map((h) => h.pnl)) : 0,
    worstTrade: history.length > 0 ? Math.min(...history.map((h) => h.pnl)) : 0,
    longWinRate: longTrades.length > 0
      ? longTrades.filter((h) => h.pnl > 0).length / longTrades.length
      : 0,
    shortWinRate: shortTrades.length > 0
      ? shortTrades.filter((h) => h.pnl > 0).length / shortTrades.length
      : 0,
    longPnl: longTrades.reduce((sum, h) => sum + h.pnl, 0),
    shortPnl: shortTrades.reduce((sum, h) => sum + h.pnl, 0),
  };
}

export function calculateAttribution(history: TradeHistory[]): AttributionAnalysis {
  const groupBy = (key: keyof TradeHistory | ((h: TradeHistory) => string | number)) => {
    const map = new Map<string, { trades: TradeHistory[]; pnl: number }>();
    for (const h of history) {
      const k = typeof key === "function" ? String(key(h)) : String(h[key]);
      if (!map.has(k)) map.set(k, { trades: [], pnl: 0 });
      const item = map.get(k)!;
      item.trades.push(h);
      item.pnl += h.pnl;
    }
    return Array.from(map.entries())
      .map(([key, { trades, pnl }]) => ({
        // @ts-ignore
        symbol: key,
        // @ts-ignore
        direction: key,
        // @ts-ignore
        reason: key,
        // @ts-ignore
        hour: parseInt(key),
        // @ts-ignore
        day: parseInt(key),
        trades: trades.length,
        winRate: trades.length > 0 ? trades.filter((t) => t.pnl > 0).length / trades.length : 0,
        pnl,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  };

  return {
    bySymbol: groupBy("symbol").map((item) => ({
      symbol: item.symbol,
      trades: item.trades,
      winRate: item.winRate,
      pnl: item.pnl,
    })),
    byDirection: groupBy("side").map((item) => ({
      direction: item.direction,
      trades: item.trades,
      winRate: item.winRate,
      pnl: item.pnl,
    })),
    byReason: groupBy("reason").map((item) => ({
      reason: item.reason,
      trades: item.trades,
      winRate: item.winRate,
      pnl: item.pnl,
    })),
    byHour: groupBy((h) => new Date(h.closeTime * 1000).getHours()).map((item) => ({
      hour: item.hour,
      trades: item.trades,
      winRate: item.winRate,
      pnl: item.pnl,
    })),
    byDayOfWeek: groupBy((h) => new Date(h.closeTime * 1000).getDay()).map((item) => ({
      day: item.day,
      trades: item.trades,
      winRate: item.winRate,
      pnl: item.pnl,
    })),
  };
}

export function generateWeeklyReport(
  history: TradeHistory[],
  initialBalance: number,
): {
  weekStart: string;
  trades: number;
  winRate: number;
  pnl: number;
  pnlPercent: number;
  maxDrawdownPercent: number;
  bestTrade: number;
  worstTrade: number;
  summary: string;
} {
  const now = Date.now() / 1000;
  const weekAgo = now - 7 * 24 * 3600;
  const weekTrades = history.filter((h) => h.closeTime >= weekAgo);
  const metrics = calculatePerformanceMetrics(weekTrades, initialBalance);

  const weekStart = new Date(weekAgo * 1000).toLocaleDateString();
  let summary = "本周";
  if (weekTrades.length === 0) {
    summary += "无交易";
  } else if (metrics.totalPnl > 0) {
    summary += `盈利 ${metrics.totalPnlPercent.toFixed(2)}%，胜率 ${(metrics.winRate * 100).toFixed(0)}%`;
  } else {
    summary += `亏损 ${Math.abs(metrics.totalPnlPercent).toFixed(2)}%，胜率 ${(metrics.winRate * 100).toFixed(0)}%`;
  }

  return {
    weekStart,
    trades: metrics.totalTrades,
    winRate: metrics.winRate,
    pnl: metrics.totalPnl,
    pnlPercent: metrics.totalPnlPercent,
    maxDrawdownPercent: metrics.maxDrawdownPercent,
    bestTrade: metrics.bestTrade,
    worstTrade: metrics.worstTrade,
    summary,
  };
}
