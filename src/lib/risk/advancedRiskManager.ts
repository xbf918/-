export interface RiskState {
  peakEquity: number;
  currentEquity: number;
  maxDrawdownPercent: number;
  currentDrawdownPercent: number;
  dailyPnl: number;
  dailyStartEquity: number;
  dailyPnlPercent: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalTradesToday: number;
  winTradesToday: number;
  lossTradesToday: number;
  totalExposure: number;
  exposurePercent: number;
  openPositionsCount: number;
  tradingPaused: boolean;
  pauseReason: string;
  pauseUntil: number;
  equityHistory: Array<{ time: number; equity: number }>;
  tradeResults: Array<{ time: number; pnl: number; symbol: string }>;
}

export interface RiskConfig {
  maxDrawdownPercent: number;
  maxDailyLossPercent: number;
  maxConsecutiveLosses: number;
  maxOpenPositions: number;
  maxExposurePercent: number;
  cooldownAfterLossStreak: number;
  positionCooldown: number;
  kellyFraction: number;
  useKellyCriterion: boolean;
  riskPerTradePercent: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxDrawdownPercent: 15,
  maxDailyLossPercent: 5,
  maxConsecutiveLosses: 3,
  maxOpenPositions: 3,
  maxExposurePercent: 50,
  cooldownAfterLossStreak: 1800000,
  positionCooldown: 300000,
  kellyFraction: 0.5,
  useKellyCriterion: false,
  riskPerTradePercent: 2,
};

export interface RiskCheckResult {
  passed: boolean;
  level: "safe" | "warning" | "danger";
  reason: string;
  details?: Record<string, any>;
}

export class AdvancedRiskManager {
  private state: RiskState;
  private config: RiskConfig;

  constructor(initialEquity: number, config?: Partial<RiskConfig>) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    this.state = {
      peakEquity: initialEquity,
      currentEquity: initialEquity,
      maxDrawdownPercent: 0,
      currentDrawdownPercent: 0,
      dailyPnl: 0,
      dailyStartEquity: initialEquity,
      dailyPnlPercent: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      totalTradesToday: 0,
      winTradesToday: 0,
      lossTradesToday: 0,
      totalExposure: 0,
      exposurePercent: 0,
      openPositionsCount: 0,
      tradingPaused: false,
      pauseReason: "",
      pauseUntil: 0,
      equityHistory: [{ time: Date.now(), equity: initialEquity }],
      tradeResults: [],
    };
  }

  updateConfig(config: Partial<RiskConfig>) {
    this.config = { ...this.config, ...config };
  }

  getState(): RiskState {
    return { ...this.state };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }

  updateEquity(equity: number) {
    this.state.currentEquity = equity;

    if (equity > this.state.peakEquity) {
      this.state.peakEquity = equity;
    }

    this.state.currentDrawdownPercent =
      ((this.state.peakEquity - equity) / this.state.peakEquity) * 100;

    if (this.state.currentDrawdownPercent > this.state.maxDrawdownPercent) {
      this.state.maxDrawdownPercent = this.state.currentDrawdownPercent;
    }

    this.state.dailyPnl = equity - this.state.dailyStartEquity;
    this.state.dailyPnlPercent =
      this.state.dailyStartEquity > 0
        ? (this.state.dailyPnl / this.state.dailyStartEquity) * 100
        : 0;

    this.state.equityHistory.push({ time: Date.now(), equity });
    if (this.state.equityHistory.length > 1000) {
      this.state.equityHistory = this.state.equityHistory.slice(-1000);
    }

    this.checkAutoResume();
  }

  updateExposure(totalExposure: number, openPositionsCount: number) {
    this.state.totalExposure = totalExposure;
    this.state.exposurePercent =
      this.state.currentEquity > 0
        ? (totalExposure / this.state.currentEquity) * 100
        : 0;
    this.state.openPositionsCount = openPositionsCount;
  }

  recordTradeResult(pnl: number, symbol: string) {
    this.state.tradeResults.push({ time: Date.now(), pnl, symbol });
    this.state.totalTradesToday++;

    if (pnl > 0) {
      this.state.winTradesToday++;
      this.state.consecutiveWins++;
      this.state.consecutiveLosses = 0;
    } else {
      this.state.lossTradesToday++;
      this.state.consecutiveLosses++;
      this.state.consecutiveWins = 0;
    }

  }

  canOpenNewPosition(): RiskCheckResult {
    if (this.state.tradingPaused) {
      const remaining = Math.max(0, this.state.pauseUntil - Date.now());
      return {
        passed: false,
        level: "danger",
        reason: `交易暂停: ${this.state.pauseReason}${
          remaining > 0 ? ` (剩余 ${Math.ceil(remaining / 60000)}分钟)` : ""
        }`,
      };
    }

    const checks: Array<() => RiskCheckResult> = [
      () => this.checkMaxDrawdown(),
      () => this.checkDailyLoss(),
      () => this.checkConsecutiveLosses(),
      () => this.checkMaxPositions(),
      () => this.checkMaxExposure(),
    ];

    for (const check of checks) {
      const result = check();
      if (!result.passed) {
        return result;
      }
    }

    return { passed: true, level: "safe", reason: "风控通过" };
  }

  private checkMaxDrawdown(): RiskCheckResult {
    if (this.state.currentDrawdownPercent >= this.config.maxDrawdownPercent) {
      this.pauseTrading(
        `最大回撤 ${this.state.currentDrawdownPercent.toFixed(1)}% 超过限制 ${this.config.maxDrawdownPercent}%`,
      );
      return {
        passed: false,
        level: "danger",
        reason: `最大回撤: ${this.state.currentDrawdownPercent.toFixed(1)}% / ${this.config.maxDrawdownPercent}%`,
        details: { drawdown: this.state.currentDrawdownPercent },
      };
    }

    const warnThreshold = this.config.maxDrawdownPercent * 0.7;
    if (this.state.currentDrawdownPercent >= warnThreshold) {
      return {
        passed: true,
        level: "warning",
        reason: `回撤接近上限: ${this.state.currentDrawdownPercent.toFixed(1)}% / ${this.config.maxDrawdownPercent}%`,
      };
    }

    return { passed: true, level: "safe", reason: "回撤正常" };
  }

  private checkDailyLoss(): RiskCheckResult {
    if (
      this.state.dailyPnlPercent <= -this.config.maxDailyLossPercent &&
      this.state.dailyPnl < 0
    ) {
      this.pauseTrading(
        `日亏损 ${Math.abs(this.state.dailyPnlPercent).toFixed(1)}% 超过限制 ${this.config.maxDailyLossPercent}%`,
      );
      return {
        passed: false,
        level: "danger",
        reason: `日亏损: ${this.state.dailyPnlPercent.toFixed(1)}% / -${this.config.maxDailyLossPercent}%`,
        details: { dailyLoss: this.state.dailyPnlPercent },
      };
    }

    const warnThreshold = this.config.maxDailyLossPercent * 0.7;
    if (this.state.dailyPnlPercent <= -warnThreshold && this.state.dailyPnl < 0) {
      return {
        passed: true,
        level: "warning",
        reason: `日亏损接近上限: ${this.state.dailyPnlPercent.toFixed(1)}%`,
      };
    }

    return { passed: true, level: "safe", reason: "日盈亏正常" };
  }

  private checkConsecutiveLosses(): RiskCheckResult {
    if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.pauseTrading(
        `连续亏损 ${this.state.consecutiveLosses} 次`,
        this.config.cooldownAfterLossStreak,
      );
      return {
        passed: false,
        level: "danger",
        reason: `连续亏损: ${this.state.consecutiveLosses} / ${this.config.maxConsecutiveLosses}`,
        details: { consecutiveLosses: this.state.consecutiveLosses },
      };
    }

    if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses - 1) {
      return {
        passed: true,
        level: "warning",
        reason: `连续亏损: ${this.state.consecutiveLosses} / ${this.config.maxConsecutiveLosses}`,
      };
    }

    return { passed: true, level: "safe", reason: "连续亏损正常" };
  }

  private checkMaxPositions(): RiskCheckResult {
    if (this.state.openPositionsCount >= this.config.maxOpenPositions) {
      return {
        passed: false,
        level: "warning",
        reason: `持仓数: ${this.state.openPositionsCount} / ${this.config.maxOpenPositions}`,
      };
    }
    return { passed: true, level: "safe", reason: "持仓数正常" };
  }

  private checkMaxExposure(): RiskCheckResult {
    if (this.state.exposurePercent >= this.config.maxExposurePercent) {
      return {
        passed: false,
        level: "warning",
        reason: `敞口: ${this.state.exposurePercent.toFixed(1)}% / ${this.config.maxExposurePercent}%`,
      };
    }
    return { passed: true, level: "safe", reason: "敞口正常" };
  }

  private pauseTrading(reason: string, durationMs?: number) {
    this.state.tradingPaused = true;
    this.state.pauseReason = reason;
    this.state.pauseUntil = durationMs ? Date.now() + durationMs : 0;
  }

  resumeTrading() {
    this.state.tradingPaused = false;
    this.state.pauseReason = "";
    this.state.pauseUntil = 0;
  }

  private checkAutoResume() {
    if (!this.state.tradingPaused) return;
    if (this.state.pauseUntil === 0) return;

    if (Date.now() >= this.state.pauseUntil) {
      if (
        this.state.currentDrawdownPercent < this.config.maxDrawdownPercent &&
        this.state.dailyPnlPercent > -this.config.maxDailyLossPercent &&
        this.state.consecutiveLosses < this.config.maxConsecutiveLosses
      ) {
        this.resumeTrading();
      }
    }
  }

  calculatePositionSize(
    entryPrice: number,
    stopLoss: number,
    winRate?: number,
    profitFactor?: number,
  ): number {
    if (this.config.useKellyCriterion && winRate !== undefined && profitFactor !== undefined) {
      return this.calculateKellySize(entryPrice, stopLoss, winRate, profitFactor);
    }
    return this.calculateFixedRiskSize(entryPrice, stopLoss);
  }

  private calculateFixedRiskSize(entryPrice: number, stopLoss: number): number {
    const riskAmount =
      this.state.currentEquity * (this.config.riskPerTradePercent / 100);
    const priceDiff = Math.abs(entryPrice - stopLoss);
    if (priceDiff <= 0) return 0;
    return riskAmount / priceDiff;
  }

  private calculateKellySize(
    entryPrice: number,
    stopLoss: number,
    winRate: number,
    profitFactor: number,
  ): number {
    const kellyPct = winRate - (1 - winRate) / profitFactor;
    const adjustedKelly = Math.max(0, kellyPct * this.config.kellyFraction);
    const riskAmount = this.state.currentEquity * adjustedKelly;
    const priceDiff = Math.abs(entryPrice - stopLoss);
    if (priceDiff <= 0) return 0;
    return riskAmount / priceDiff;
  }

  getWinRate(): number {
    if (this.state.totalTradesToday === 0) return 0.5;
    return this.state.winTradesToday / this.state.totalTradesToday;
  }

  getProfitFactor(): number {
    let totalWin = 0;
    let totalLoss = 0;
    for (const t of this.state.tradeResults) {
      if (t.pnl > 0) totalWin += t.pnl;
      else totalLoss += Math.abs(t.pnl);
    }
    return totalLoss > 0 ? totalWin / totalLoss : 1.5;
  }

  resetDaily() {
    this.state.dailyStartEquity = this.state.currentEquity;
    this.state.dailyPnl = 0;
    this.state.dailyPnlPercent = 0;
    this.state.totalTradesToday = 0;
    this.state.winTradesToday = 0;
    this.state.lossTradesToday = 0;
    this.state.consecutiveWins = 0;
    this.state.consecutiveLosses = 0;
    this.state.tradeResults = [];
    if (this.state.tradingPaused && this.state.pauseUntil > 0) {
      this.resumeTrading();
    }
  }
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return 0;
  }

  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  if (trs.length < period) return 0;

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return atr;
}

export interface TrailingStopConfig {
  activationPercent: number;
  trailingPercent: number;
  mode: "fixed" | "atr";
  atrMultiplier?: number;
}

export function updateTrailingStopAdvanced(
  entryPrice: number,
  currentPrice: number,
  currentStop: number,
  side: "long" | "short",
  config: TrailingStopConfig,
  atr?: number,
): number {
  const profitPercent =
    side === "long"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

  if (profitPercent < config.activationPercent) {
    return currentStop;
  }

  let trailingDistance: number;
  if (config.mode === "atr" && atr && atr > 0) {
    trailingDistance = atr * (config.atrMultiplier || 2);
  } else {
    trailingDistance = entryPrice * (config.trailingPercent / 100);
  }

  let newStop: number;
  if (side === "long") {
    newStop = currentPrice - trailingDistance;
    return Math.max(currentStop, newStop);
  } else {
    newStop = currentPrice + trailingDistance;
    return Math.min(currentStop, newStop);
  }
}

export interface PartialTakeProfitLevel {
  percent: number;
  ratio: number;
  movedToBreakEven: boolean;
}

export function calculatePartialTakeProfit(
  entryPrice: number,
  side: "long" | "short",
  levels: PartialTakeProfitLevel[],
): Array<{ price: number; quantityRatio: number }> {
  return levels.map((level) => ({
    price:
      side === "long"
        ? entryPrice * (1 + level.percent / 100)
        : entryPrice * (1 - level.percent / 100),
    quantityRatio: level.ratio,
  }));
}
