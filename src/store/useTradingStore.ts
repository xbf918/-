import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  TradePosition,
  TradeOrder,
  TradeHistory,
  AccountBalance,
  TradingConfig,
  TradingStats,
  PositionSide,
} from "@/types";
import { DEFAULT_TRADING_CONFIG, INITIAL_BALANCE } from "@/lib/constants";
import {
  openPosition,
  closePosition,
  calculateTakeProfit,
  calculateStopLoss,
  calculateOrderQuantity,
  calculateAccountBalance,
  calculateTradingStats,
  checkStopLoss,
  checkTakeProfit,
  checkLiquidation,
  updateTrailingStop,
  shouldTriggerSignal,
  calculatePnl,
} from "@/lib/trading/engine";
import * as exchangeApi from "@/services/exchange";
import type { ExchangeId } from "@/types/exchange";
import { useExchangeStore } from "./useExchangeStore";
import { useStrategyLearningStore } from "./useStrategyLearningStore";

interface TradingState {
  config: TradingConfig;
  positions: TradePosition[];
  orders: TradeOrder[];
  history: TradeHistory[];
  balance: AccountBalance;
  stats: TradingStats;
  initialBalance: number;
  lastSignalDirection: "long" | "short" | "neutral" | null;
  lastSignalTime: number | null;
  liveMode: boolean;

  setConfig: (config: Partial<TradingConfig>) => void;
  toggleAutoTrading: () => void;
  setLiveMode: (mode: boolean) => void;

  manualOpenPosition: (
    symbol: string,
    side: PositionSide,
    entryPrice: number,
    availableBalance: number,
  ) => TradePosition | null;
  manualClosePosition: (positionId: string, exitPrice: number, reason: string) => void;
  closeAllPositions: (prices: Record<string, number>, reason: string) => void;

  liveOpenPosition: (
    symbol: string,
    side: PositionSide,
    entryPrice: number,
    leverage: number,
  ) => Promise<boolean>;
  liveClosePosition: (positionId: string, symbol: string) => Promise<boolean>;
  syncLivePositions: () => Promise<void>;

  processSignal: (
    symbol: string,
    direction: "long" | "short" | "neutral",
    confidence: number,
    currentPrice: number,
  ) => void;

  updatePrices: (prices: Record<string, number>) => void;

  resetAccount: () => void;
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_TRADING_CONFIG,
      positions: [],
      orders: [],
      history: [],
      balance: {
        total: INITIAL_BALANCE,
        available: INITIAL_BALANCE,
        usedMargin: 0,
        unrealizedPnl: 0,
      },
      stats: {
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
    },
      initialBalance: INITIAL_BALANCE,
      lastSignalDirection: null,
      lastSignalTime: null,
      liveMode: false,

      setConfig: (config) => {
        set((s) => ({ config: { ...s.config, ...config } }));
      },

      toggleAutoTrading: () => {
        set((s) => ({ config: { ...s.config, enabled: !s.config.enabled } }));
      },

      setLiveMode: (mode) => {
        set({ liveMode: mode });
        if (!mode) {
          set({
            positions: [],
            orders: [],
            balance: {
              total: INITIAL_BALANCE,
              available: INITIAL_BALANCE,
              usedMargin: 0,
              unrealizedPnl: 0,
            },
            stats: {
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
            },
            initialBalance: INITIAL_BALANCE,
          });
        }
      },

      manualOpenPosition: (symbol, side, entryPrice, availableBalance) => {
        const { config, positions, liveMode } = get();
        if (liveMode) return null;

        const sameSidePositions = positions.filter((p) => p.symbol === symbol && p.side === side);
        if (!config.allowHedge && sameSidePositions.length > 0) {
          return null;
        }
        if (positions.length >= config.maxOpenPositions) {
          return null;
        }

        const quantity = calculateOrderQuantity(
          availableBalance,
          entryPrice,
          config.leverage,
          config.orderSizePercent,
        );
        if (quantity <= 0) return null;

        const takeProfit = calculateTakeProfit(entryPrice, side, config.takeProfitPercent);
        const stopLoss = calculateStopLoss(entryPrice, side, config.stopLossPercent);

        const pos = openPosition({
          symbol,
          side,
          entryPrice,
          quantity,
          leverage: config.leverage,
          takeProfit,
          stopLoss,
          reason: "manual",
        });

        set((s) => {
          const newPositions = [...s.positions, pos];
          const prices: Record<string, number> = { [symbol]: entryPrice };
          for (const p of s.positions) {
            if (p.symbol !== symbol) prices[p.symbol] = p.entryPrice;
          }
          const balance = calculateAccountBalance(
            s.initialBalance,
            newPositions,
            s.history,
            prices,
          );
          return { positions: newPositions, balance };
        });

        return pos;
      },

      manualClosePosition: (positionId, exitPrice, reason) => {
        const { positions, history, initialBalance, liveMode } = get();
        if (liveMode) return;
        const position = positions.find((p) => p.id === positionId);
        if (!position) return;

        const { closed, history: hist } = closePosition(position, exitPrice, reason);
        const newPositions = positions.filter((p) => p.id !== positionId);
        const newHistory = [hist, ...history];

        const prices: Record<string, number> = {};
        for (const p of newPositions) {
          prices[p.symbol] = p.symbol === position.symbol ? exitPrice : p.entryPrice;
        }

        const balance = calculateAccountBalance(initialBalance, newPositions, newHistory, prices);
        const stats = calculateTradingStats(newHistory);

        set({ positions: newPositions, history: newHistory, balance, stats });

        useStrategyLearningStore.getState().onTradeClosed(
          { pnl: hist.pnl, closeTime: hist.closeTime },
          null,
        );
      },

      closeAllPositions: (prices, reason) => {
        const { positions, history, initialBalance, liveMode } = get();
        if (liveMode) return;
        if (positions.length === 0) return;

        let newHistory = [...history];
        let totalPnl = 0;
        for (const pos of positions) {
          const price = prices[pos.symbol] ?? pos.entryPrice;
          const { history: hist } = closePosition(pos, price, reason);
          newHistory = [hist, ...newHistory];
          totalPnl += hist.pnl;
        }

        const balance = calculateAccountBalance(initialBalance, [], newHistory, prices);
        const stats = calculateTradingStats(newHistory);

        set({ positions: [], history: newHistory, balance, stats });

        useStrategyLearningStore.getState().onTradeClosed(
          { pnl: totalPnl, closeTime: Math.floor(Date.now() / 1000) },
          null,
        );
      },

      liveOpenPosition: async (symbol, side, entryPrice, leverage) => {
        const { config, balance } = get();
        const { activeExchange } = useExchangeStore.getState();
        if (activeExchange === "paper") return false;

        try {
          const quantity = calculateOrderQuantity(
            balance.available,
            entryPrice,
            leverage,
            config.orderSizePercent,
          );

          await exchangeApi.placeOrder({
            exchange: activeExchange,
            symbol: symbol.replace("/", ""),
            side: side === "long" ? "BUY" : "SELL",
            type: "MARKET",
            quantity,
            leverage,
            takeProfitPrice: calculateTakeProfit(entryPrice, side, config.takeProfitPercent),
            stopLossPrice: calculateStopLoss(entryPrice, side, config.stopLossPercent),
          });

          await get().syncLivePositions();
          return true;
        } catch {
          return false;
        }
      },

      liveClosePosition: async (positionId, symbol) => {
        const { activeExchange } = useExchangeStore.getState();
        if (activeExchange === "paper") return false;

        try {
          await exchangeApi.closePosition({
            exchange: activeExchange,
            symbol: symbol.replace("/", ""),
          });

          await get().syncLivePositions();
          return true;
        } catch {
          return false;
        }
      },

      syncLivePositions: async () => {
        const { activeExchange } = useExchangeStore.getState();
        if (activeExchange === "paper") return;

        try {
          const positions = await exchangeApi.getPositions(activeExchange);
          const tradePositions: TradePosition[] = positions.map((pos) => ({
            id: `${pos.symbol}-${pos.positionSide}-${Date.now()}`,
            symbol: pos.symbol,
            side: pos.positionSide === "LONG" ? "long" : "short",
            entryPrice: pos.entryPrice,
            quantity: Math.abs(pos.positionAmt),
            leverage: pos.leverage,
            margin: (pos as any).marginBalance || 0,
            takeProfit: (pos as any).takeProfitPrice || undefined,
            stopLoss: (pos as any).stopLossPrice || undefined,
            liquidationPrice: pos.liquidationPrice,
            openTime: pos.updateTime,
            reason: "live",
          }));

          const account = await exchangeApi.getAccount(activeExchange);
          set({
            positions: tradePositions,
            balance: {
              total: account.totalWalletBalance,
              available: account.availableBalance,
              usedMargin: account.marginBalance,
              unrealizedPnl: account.unrealizedProfit,
            },
          });
        } catch {
          // ignore
        }
      },

      processSignal: (symbol, direction, confidence, currentPrice) => {
        const { config, positions, balance, lastSignalDirection, lastSignalTime, liveMode } = get();

        if (!config.enabled) return;

        const learning = useStrategyLearningStore.getState();
        if (learning.enabled && learning.isTradingPaused()) {
          return;
        }

        const effectiveThreshold = learning.enabled ? learning.getEffectiveThreshold() : config.signalThreshold;
        if (confidence < effectiveThreshold && direction !== "neutral") {
          return;
        }

        const sameSymbolPositions = positions.filter((p) => p.symbol === symbol);
        const longPos = sameSymbolPositions.find((p) => p.side === "long");
        const shortPos = sameSymbolPositions.find((p) => p.side === "short");

        if (direction === "neutral") {
          set({ lastSignalDirection: "neutral", lastSignalTime: Date.now() });
          return;
        }

        const now = Date.now();
        if (
          lastSignalDirection === direction &&
          lastSignalTime &&
          now - lastSignalTime < 60_000
        ) {
          return;
        }

        const trigger = shouldTriggerSignal(direction, confidence, { ...config, signalThreshold: effectiveThreshold });
        if (!trigger) {
          return;
        }

        if (liveMode) {
          const { activeExchange } = useExchangeStore.getState();
          if (activeExchange !== "paper") {
            if (direction === "long") {
              if (shortPos) get().liveClosePosition(shortPos.id, symbol);
              if (!longPos) {
                get().liveOpenPosition(symbol, "long", currentPrice, config.leverage);
              }
            } else if (direction === "short") {
              if (longPos) get().liveClosePosition(longPos.id, symbol);
              if (!shortPos) {
                get().liveOpenPosition(symbol, "short", currentPrice, config.leverage);
              }
            }
          }
        } else {
          if (direction === "long") {
            if (shortPos) {
              get().manualClosePosition(shortPos.id, currentPrice, "signal_flip");
            }
            if (!config.allowHedge && longPos) {
              set({ lastSignalDirection: "long", lastSignalTime: now });
              return;
            }
            if (get().positions.length < config.maxOpenPositions) {
              get().manualOpenPosition(symbol, "long", currentPrice, balance.available);
            }
          } else if (direction === "short") {
            if (longPos) {
              get().manualClosePosition(longPos.id, currentPrice, "signal_flip");
            }
            if (!config.allowHedge && shortPos) {
              set({ lastSignalDirection: "short", lastSignalTime: now });
              return;
            }
            if (get().positions.length < config.maxOpenPositions) {
              get().manualOpenPosition(symbol, "short", currentPrice, balance.available);
            }
          }
        }

        set({ lastSignalDirection: direction, lastSignalTime: now });
      },

      updatePrices: (prices) => {
        const { positions, history, initialBalance, config, liveMode } = get();
        if (positions.length === 0) return;
        if (liveMode) return;

        let updatedPositions = [...positions];
        let newHistory = [...history];

        for (let i = updatedPositions.length - 1; i >= 0; i--) {
          const pos = updatedPositions[i];
          const price = prices[pos.symbol];
          if (price === undefined) continue;

          if (checkLiquidation(pos, price)) {
            const { closed, history: hist } = closePosition(pos, pos.liquidationPrice, "liquidation");
            newHistory = [hist, ...newHistory];
            updatedPositions.splice(i, 1);
            continue;
          }

          if (checkTakeProfit(pos, price)) {
            const { closed, history: hist } = closePosition(pos, pos.takeProfit!, "take_profit");
            newHistory = [hist, ...newHistory];
            updatedPositions.splice(i, 1);
            continue;
          }

          if (checkStopLoss(pos, price)) {
            const { closed, history: hist } = closePosition(pos, pos.stopLoss!, "stop_loss");
            newHistory = [hist, ...newHistory];
            updatedPositions.splice(i, 1);
            continue;
          }

          if (config.trailingStop && pos.side === "long" && price > pos.entryPrice) {
            const newStop = updateTrailingStop(pos, price, config.trailingStopPercent);
            if (newStop !== pos.stopLoss) {
              updatedPositions[i] = { ...pos, stopLoss: newStop };
            }
          } else if (config.trailingStop && pos.side === "short" && price < pos.entryPrice) {
            const newStop = updateTrailingStop(pos, price, config.trailingStopPercent);
            if (newStop !== pos.stopLoss) {
              updatedPositions[i] = { ...pos, stopLoss: newStop };
            }
          }
        }

        const balance = calculateAccountBalance(initialBalance, updatedPositions, newHistory, prices);
        const stats = calculateTradingStats(newHistory);

        set({ positions: updatedPositions, history: newHistory, balance, stats });
      },

      resetAccount: () => {
        set({
          positions: [],
          orders: [],
          history: [],
          balance: {
            total: INITIAL_BALANCE,
            available: INITIAL_BALANCE,
            usedMargin: 0,
            unrealizedPnl: 0,
          },
          stats: {
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
          },
          lastSignalDirection: null,
          lastSignalTime: null,
        });
      },
    }),
    {
      name: "trading_state_v2",
      partialize: (state) => ({
        config: state.config,
        positions: state.positions,
        history: state.history,
        balance: state.balance,
        stats: state.stats,
        initialBalance: state.initialBalance,
        lastSignalDirection: state.lastSignalDirection,
        lastSignalTime: state.lastSignalTime,
        liveMode: state.liveMode,
      }),
    },
  ),
);