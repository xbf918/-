export interface PartialProfitLevel {
  id: string;
  profitPercent: number;
  closeRatio: number;
  moveToBreakEven: boolean;
  triggered: boolean;
}

export interface StopLossConfig {
  mode: "fixed" | "atr" | "swing";
  fixedPercent: number;
  atrMultiplier: number;
  minStopDistancePercent: number;
}

export interface TakeProfitConfig {
  mode: "fixed" | "partial" | "trailing";
  fixedPercent: number;
  partialLevels: PartialProfitLevel[];
  trailingActivationPercent: number;
  trailingDistancePercent: number;
  moveToBreakEvenAfterPercent: number;
}

export const DEFAULT_STOP_LOSS_CONFIG: StopLossConfig = {
  mode: "atr",
  fixedPercent: 5,
  atrMultiplier: 2,
  minStopDistancePercent: 1,
};

export const DEFAULT_TAKE_PROFIT_CONFIG: TakeProfitConfig = {
  mode: "partial",
  fixedPercent: 10,
  partialLevels: [
    { id: "tp1", profitPercent: 3, closeRatio: 0.3, moveToBreakEven: false, triggered: false },
    { id: "tp2", profitPercent: 6, closeRatio: 0.3, moveToBreakEven: true, triggered: false },
    { id: "tp3", profitPercent: 12, closeRatio: 0.4, moveToBreakEven: true, triggered: false },
  ],
  trailingActivationPercent: 5,
  trailingDistancePercent: 2,
  moveToBreakEvenAfterPercent: 3,
};

export interface PositionExitState {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  quantity: number;
  leverage: number;
  remainingRatio: number;
  initialStopLoss: number;
  currentStopLoss: number;
  takeProfitLevels: PartialProfitLevel[];
  trailingActivated: boolean;
  movedToBreakEven: boolean;
  createdAt: number;
}

export interface ExitDecision {
  shouldClose: boolean;
  closeRatio: number;
  closePrice: number;
  reason: string;
  updateStopLoss?: number;
  updateTakeProfitLevels?: PartialProfitLevel[];
}

export function calculateInitialStopLoss(
  entryPrice: number,
  side: "long" | "short",
  config: StopLossConfig,
  atr?: number,
): number {
  if (config.mode === "atr" && atr && atr > 0) {
    const distance = Math.max(
      atr * config.atrMultiplier,
      entryPrice * (config.minStopDistancePercent / 100),
    );
    return side === "long" ? entryPrice - distance : entryPrice + distance;
  }

  const distance = entryPrice * (config.fixedPercent / 100);
  return side === "long" ? entryPrice - distance : entryPrice + distance;
}

export function calculateFixedTakeProfit(
  entryPrice: number,
  side: "long" | "short",
  percent: number,
): number {
  const distance = entryPrice * (percent / 100);
  return side === "long" ? entryPrice + distance : entryPrice - distance;
}

export function calculateProfitPercent(
  entryPrice: number,
  currentPrice: number,
  side: "long" | "short",
): number {
  if (side === "long") {
    return ((currentPrice - entryPrice) / entryPrice) * 100;
  }
  return ((entryPrice - currentPrice) / entryPrice) * 100;
}

export function createPositionExitState(
  symbol: string,
  side: "long" | "short",
  entryPrice: number,
  quantity: number,
  leverage: number,
  stopLossConfig: StopLossConfig,
  takeProfitConfig: TakeProfitConfig,
  atr?: number,
): PositionExitState {
  const initialStopLoss = calculateInitialStopLoss(entryPrice, side, stopLossConfig, atr);
  return {
    symbol,
    side,
    entryPrice,
    quantity,
    leverage,
    remainingRatio: 1,
    initialStopLoss,
    currentStopLoss: initialStopLoss,
    takeProfitLevels: takeProfitConfig.partialLevels.map((level) => ({
      ...level,
      triggered: false,
    })),
    trailingActivated: false,
    movedToBreakEven: false,
    createdAt: Date.now(),
  };
}

export function evaluateExit(
  state: PositionExitState,
  currentPrice: number,
  takeProfitConfig: TakeProfitConfig,
): ExitDecision {
  const profitPercent = calculateProfitPercent(state.entryPrice, currentPrice, state.side);

  // 1. 止损检查
  const hitStopLoss = state.side === "long"
    ? currentPrice <= state.currentStopLoss
    : currentPrice >= state.currentStopLoss;

  if (hitStopLoss) {
    return {
      shouldClose: true,
      closeRatio: state.remainingRatio,
      closePrice: currentPrice,
      reason: state.movedToBreakEven ? "breakeven_stop" : "stop_loss",
    };
  }

  // 2. 分批止盈检查
  if (takeProfitConfig.mode === "partial") {
    for (const level of state.takeProfitLevels) {
      if (level.triggered) continue;

      const levelPrice = calculateFixedTakeProfit(state.entryPrice, state.side, level.profitPercent);
      const hitLevel = state.side === "long"
        ? currentPrice >= levelPrice
        : currentPrice <= levelPrice;

      if (hitLevel) {
        const closeRatio = level.closeRatio * state.remainingRatio;
        level.triggered = true;

        let newStopLoss = state.currentStopLoss;
        if (level.moveToBreakEven && !state.movedToBreakEven) {
          newStopLoss = state.entryPrice;
          state.movedToBreakEven = true;
        }

        return {
          shouldClose: true,
          closeRatio,
          closePrice: currentPrice,
          reason: `partial_tp_${level.profitPercent}%`,
          updateStopLoss: newStopLoss,
          updateTakeProfitLevels: [...state.takeProfitLevels],
        };
      }
    }
  }

  // 3. 固定止盈检查
  if (takeProfitConfig.mode === "fixed") {
    const tpPrice = calculateFixedTakeProfit(state.entryPrice, state.side, takeProfitConfig.fixedPercent);
    const hitTp = state.side === "long"
      ? currentPrice >= tpPrice
      : currentPrice <= tpPrice;

    if (hitTp) {
      return {
        shouldClose: true,
        closeRatio: state.remainingRatio,
        closePrice: currentPrice,
        reason: "take_profit",
      };
    }
  }

  // 4. 追踪止损更新
  let newStopLoss = state.currentStopLoss;
  let trailingActivated = state.trailingActivated;

  if (takeProfitConfig.mode === "trailing" || profitPercent >= takeProfitConfig.trailingActivationPercent) {
    const activationPct = Math.min(takeProfitConfig.trailingActivationPercent, profitPercent);
    if (profitPercent >= activationPct) {
      trailingActivated = true;
      const trailingDistance = state.entryPrice * (takeProfitConfig.trailingDistancePercent / 100);
      const candidateStop = state.side === "long"
        ? currentPrice - trailingDistance
        : currentPrice + trailingDistance;

      if (state.side === "long" && candidateStop > newStopLoss) {
        newStopLoss = candidateStop;
      } else if (state.side === "short" && candidateStop < newStopLoss) {
        newStopLoss = candidateStop;
      }
    }
  }

  // 5. 保本止盈
  if (
    !state.movedToBreakEven &&
    profitPercent >= takeProfitConfig.moveToBreakEvenAfterPercent
  ) {
    newStopLoss = state.entryPrice;
    state.movedToBreakEven = true;
  }

  if (newStopLoss !== state.currentStopLoss || trailingActivated !== state.trailingActivated) {
    return {
      shouldClose: false,
      closeRatio: 0,
      closePrice: currentPrice,
      reason: "trailing_update",
      updateStopLoss: newStopLoss,
    };
  }

  return {
    shouldClose: false,
    closeRatio: 0,
    closePrice: currentPrice,
    reason: "hold",
  };
}

export function updatePositionExitState(
  state: PositionExitState,
  decision: ExitDecision,
): PositionExitState {
  const newRemainingRatio = Math.max(0, state.remainingRatio - decision.closeRatio);
  return {
    ...state,
    remainingRatio: newRemainingRatio,
    currentStopLoss: decision.updateStopLoss ?? state.currentStopLoss,
    takeProfitLevels: decision.updateTakeProfitLevels ?? state.takeProfitLevels,
    trailingActivated:
      decision.reason === "trailing_update" && decision.updateStopLoss !== undefined
        ? true
        : state.trailingActivated,
  };
}
