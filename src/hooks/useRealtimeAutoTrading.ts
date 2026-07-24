/**
 * 实时自动交易 Hook
 * 监听信号变化和价格更新，毫秒级响应自动交易
 * 
 * 关键改进：
 * - 实盘模式下止损/止盈单直接挂在交易所端，断连也不会漏止损
 * - 部分平仓使用交易所 API 真正按比例平仓
 * - 追踪止损更新时同步更新交易所端止损单
 */
import { useEffect, useRef, useCallback } from "react";
import { useMultiAgentStore } from "@/store/useMultiAgentStore";
import { useMarketStore } from "@/store/useMarketStore";
import { useExchangeStore } from "@/store/useExchangeStore";
import { useTradingStore } from "@/store/useTradingStore";
import {
  openPosition,
  closePosition,
  fetchAccount,
  fetchPositions,
  setStopLossTakeProfit,
  partialClosePosition,
  cancelStopLossTakeProfit,
} from "@/services/server";
import {
  AdvancedRiskManager,
  calculateATR,
  type RiskState,
} from "@/lib/risk/advancedRiskManager";
import {
  createPositionExitState,
  evaluateExit,
  updatePositionExitState,
  type PositionExitState,
  type StopLossConfig,
  type TakeProfitConfig,
} from "@/lib/risk/takeProfitStopLoss";

interface TradeState {
  lastTradeTime: number;
  lastSignalDirection: string | null;
  lastSignalConfidence: number;
  pendingTrade: boolean;
  dailyPnl: number;
  dailyStartEquity: number;
  tradeCount: number;
}

/** 记录每个持仓的交易所端止损单 ID，用于更新时取消旧单 */
interface ExchangeOrderState {
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  lastUpdatePrice: number;
}

export function useRealtimeAutoTrading() {
  const combinedSignal = useMultiAgentStore((s) => s.combinedSignal);
  const settings = useMultiAgentStore((s) => s.settings);
  const ticker = useMarketStore((s) => s.ticker);
  const symbol = useMarketStore((s) => s.symbol);
  const candles = useMarketStore((s) => s.candles);
  const exchangeMode = useExchangeStore((s) => s.mode);
  const activeExchange = useExchangeStore((s) => s.activeExchange);

  const stateRef = useRef<TradeState>({
    lastTradeTime: 0,
    lastSignalDirection: null,
    lastSignalConfidence: 0,
    pendingTrade: false,
    dailyPnl: 0,
    dailyStartEquity: 0,
    tradeCount: 0,
  });

  const riskManagerRef = useRef<AdvancedRiskManager | null>(null);
  const positionExitStatesRef = useRef<Map<string, PositionExitState>>(new Map());
  const exchangeOrderStatesRef = useRef<Map<string, ExchangeOrderState>>(new Map());

  const initRiskManager = useCallback(() => {
    if (riskManagerRef.current) return;
    const tradingStore = useTradingStore.getState();
    const initialEquity = tradingStore.balance.total;
    riskManagerRef.current = new AdvancedRiskManager(initialEquity);
  }, []);

  const getRiskState = useCallback((): RiskState | null => {
    if (!riskManagerRef.current) return null;
    return riskManagerRef.current.getState();
  }, []);

  const resumeTrading = useCallback(() => {
    if (!riskManagerRef.current) return;
    riskManagerRef.current.resumeTrading();
    console.log("[Risk] 手动恢复交易");
  }, []);

  const calculateExposure = useCallback((positions: any[], currentPrice: number): number => {
    let totalExposure = 0;
    for (const pos of positions) {
      const qty = pos.quantity || pos.positionAmt || 0;
      totalExposure += Math.abs(qty) * currentPrice;
    }
    return totalExposure;
  }, []);

  const calculateATRFromCandles = useCallback((): number => {
    if (!candles || candles.length < 15) return 0;
    const highs = candles.map((c: any) => c.high || c.h);
    const lows = candles.map((c: any) => c.low || c.l);
    const closes = candles.map((c: any) => c.close || c.c);
    return calculateATR(highs, lows, closes, 14);
  }, [candles]);

  /**
   * 在交易所端设置止损/止盈条件单
   * 即使浏览器关闭或断网，交易所也会自动执行
   */
  const placeExchangeStopLossTakeProfit = useCallback(async (
    posKey: string,
    exchange: string,
    sym: string,
    side: "long" | "short",
    stopLossPrice?: number,
    takeProfitPrice?: number,
    quantity?: number,
  ) => {
    try {
      const result = await setStopLossTakeProfit(
        exchange,
        sym,
        side,
        stopLossPrice,
        takeProfitPrice,
        quantity,
      );

      if (result.success) {
        exchangeOrderStatesRef.current.set(posKey, {
          stopLossOrderId: result.stopLossOrderId,
          takeProfitOrderId: result.takeProfitOrderId,
          lastUpdatePrice: stopLossPrice || 0,
        });
        console.log(`[AutoTrade] 交易所端止损/止盈已设置: SL=${stopLossPrice?.toFixed(2)} TP=${takeProfitPrice?.toFixed(2)}`);
      } else {
        console.error(`[AutoTrade] 交易所端止损/止盈设置失败: ${result.message}`);
      }
    } catch (error) {
      console.error("[AutoTrade] 设置交易所端止损/止盈异常:", error);
    }
  }, []);

  // 每日重置
  useEffect(() => {
    initRiskManager();
    const timer = setInterval(() => {
      stateRef.current.dailyPnl = 0;
      stateRef.current.dailyStartEquity = 0;
      stateRef.current.tradeCount = 0;
      if (riskManagerRef.current) {
        riskManagerRef.current.resetDaily();
      }
    }, 24 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [initRiskManager]);

  // 实时更新权益
  useEffect(() => {
    initRiskManager();
    const updateEquity = () => {
      const tradingStore = useTradingStore.getState();
      if (riskManagerRef.current) {
        riskManagerRef.current.updateEquity(tradingStore.balance.total);
      }
    };

    updateEquity();

    const interval = setInterval(updateEquity, 1000);
    return () => clearInterval(interval);
  }, [initRiskManager]);

  // 实时更新敞口
  useEffect(() => {
    initRiskManager();
    if (!ticker || ticker.lastPrice <= 0) return;

    const updateExposure = async () => {
      try {
        let positions: any[] = [];
        let openPositionsCount = 0;

        if (exchangeMode === "live" && activeExchange !== "paper") {
          positions = await fetchPositions(activeExchange);
          openPositionsCount = positions.length;
        } else {
          const tradingStore = useTradingStore.getState();
          positions = tradingStore.positions || [];
          openPositionsCount = positions.length;
        }

        const totalExposure = calculateExposure(positions, ticker.lastPrice);

        if (riskManagerRef.current) {
          riskManagerRef.current.updateExposure(totalExposure, openPositionsCount);
        }
      } catch {
        // 忽略错误
      }
    };

    updateExposure();

    const interval = setInterval(updateExposure, 3000);
    return () => clearInterval(interval);
  }, [initRiskManager, ticker?.lastPrice, exchangeMode, activeExchange, calculateExposure]);

  // 执行交易
  const executeTrade = useCallback(async (
    direction: "long" | "short",
    entryPrice: number,
    confidence: number,
    strength: number,
  ) => {
    if (stateRef.current.pendingTrade) return;

    initRiskManager();

    if (riskManagerRef.current) {
      const riskCheck = riskManagerRef.current.canOpenNewPosition();
      if (!riskCheck.passed) {
        console.log(`[AutoTrade] 风控未通过: ${riskCheck.reason}`);
        return;
      }
    }

    stateRef.current.pendingTrade = true;

    const { riskManagement, defaultLeverage, tradeAmount } = settings;
    const cooldownMs = riskManagement.positionCooldown || 300000;

    if (Date.now() - stateRef.current.lastTradeTime < cooldownMs) {
      console.log(`[AutoTrade] 冷却中，剩余 ${Math.round((cooldownMs - (Date.now() - stateRef.current.lastTradeTime)) / 1000)}秒`);
      stateRef.current.pendingTrade = false;
      return;
    }

    try {
      if (exchangeMode === "live" && activeExchange !== "paper") {
        const exchange = activeExchange;
        
        const positions = await fetchPositions(exchange, symbol);
        const sameDirectionPos = positions.find(p => 
          p.side === (direction === "long" ? "LONG" : "SHORT")
        );
        
        if (sameDirectionPos) {
          console.log(`[AutoTrade] 已存在${direction === "long" ? "多" : "空"}头持仓，跳过`);
          stateRef.current.pendingTrade = false;
          return;
        }

        const allPositions = await fetchPositions(exchange);
        if (allPositions.length >= riskManagement.maxOpenPositions) {
          console.log(`[AutoTrade] 已达最大持仓数 ${riskManagement.maxOpenPositions}`);
          stateRef.current.pendingTrade = false;
          return;
        }

        console.log(`[AutoTrade] 执行${direction === "long" ? "开多" : "开空"} @ ${entryPrice.toFixed(2)}`);
        
        const result = await openPosition(
          exchange,
          symbol,
          direction,
          entryPrice,
          defaultLeverage,
        );

        if (result.success) {
          const atr = calculateATRFromCandles();
          const posKey = `${symbol}-${direction}`;

          // 计算止损/止盈价格
          const slPercent = riskManagement.stopLoss.fixedPercent;
          const tpPercent = riskManagement.takeProfit.fixedPercent;
          const stopLossPrice = direction === "long"
            ? entryPrice * (1 - slPercent / 100)
            : entryPrice * (1 + slPercent / 100);
          const takeProfitPrice = direction === "long"
            ? entryPrice * (1 + tpPercent / 100)
            : entryPrice * (1 - tpPercent / 100);

          positionExitStatesRef.current.set(
            posKey,
            createPositionExitState(
              symbol,
              direction,
              entryPrice,
              result.position?.quantity || 0,
              defaultLeverage,
              riskManagement.stopLoss,
              riskManagement.takeProfit,
              atr,
            ),
          );

          // 关键改进：在交易所端设置止损/止盈条件单
          await placeExchangeStopLossTakeProfit(
            posKey,
            exchange,
            symbol,
            direction,
            stopLossPrice,
            takeProfitPrice,
            result.position?.quantity,
          );

          stateRef.current.lastTradeTime = Date.now();
          stateRef.current.lastSignalDirection = direction;
          stateRef.current.tradeCount++;
          
          playTradeSound(direction);
          showTradeNotification(symbol, direction, entryPrice, confidence);
          
          console.log(`[AutoTrade] 开仓成功: ${result.message}`);
        } else {
          console.error(`[AutoTrade] 开仓失败: ${result.message}`);
        }
      } else {
        const tradingStore = useTradingStore.getState();
        if (tradingStore.manualOpenPosition) {
          const pos = tradingStore.manualOpenPosition(symbol, direction, entryPrice, tradeAmount);

          const atr = calculateATRFromCandles();
          const posKey = `${symbol}-${direction}`;
          positionExitStatesRef.current.set(
            posKey,
            createPositionExitState(
              symbol,
              direction,
              entryPrice,
              pos?.quantity || 0,
              defaultLeverage,
              settings.riskManagement.stopLoss,
              settings.riskManagement.takeProfit,
              atr,
            ),
          );

          stateRef.current.lastTradeTime = Date.now();
          stateRef.current.lastSignalDirection = direction;
          stateRef.current.tradeCount++;
          
          playTradeSound(direction);
          showTradeNotification(symbol, direction, entryPrice, confidence);
          
          console.log(`[AutoTrade] 模拟开仓: ${direction} @ ${entryPrice.toFixed(2)}`);
        }
      }
    } catch (error) {
      console.error("[AutoTrade] 交易执行错误:", error);
    } finally {
      stateRef.current.pendingTrade = false;
    }
  }, [settings, exchangeMode, activeExchange, symbol, initRiskManager, calculateATRFromCandles, placeExchangeStopLossTakeProfit]);

  // 平仓（支持分批平仓）
  const executeClose = useCallback(async (
    direction: "long" | "short",
    currentPrice: number,
    reason: string,
    closeRatio: number = 1,
  ) => {
    try {
      let pnl = 0;
      const posKey = `${symbol}-${direction}`;
      const exitState = positionExitStatesRef.current.get(posKey);

      if (exchangeMode === "live" && activeExchange !== "paper") {
        const positions = await fetchPositions(activeExchange, symbol);
        const pos = positions.find(p => 
          p.side === (direction === "long" ? "LONG" : "SHORT")
        );
        if (pos) {
          pnl = (pos.unrealizedPnl || 0) * closeRatio;
        }

        if (closeRatio >= 1) {
          // 全部平仓
          const result = await closePosition(activeExchange, symbol, direction);
          console.log(`[AutoTrade] 平仓: ${result.message}`);

          // 取消交易所端的条件单（如果还残留的话）
          try {
            await cancelStopLossTakeProfit(activeExchange, symbol);
          } catch {
            // 忽略取消错误，可能已经被触发
          }
          exchangeOrderStatesRef.current.delete(posKey);
        } else {
          // 部分平仓：调用交易所部分平仓 API
          const result = await partialClosePosition(activeExchange, symbol, closeRatio * 100, direction);
          console.log(`[AutoTrade] 部分平仓 ${(closeRatio * 100).toFixed(0)}%: ${result.message}`);

          // 更新交易所端止损/止盈单的数量（减去已平仓部分）
          if (exitState && result.success) {
            const orderState = exchangeOrderStatesRef.current.get(posKey);
            if (orderState) {
              const remainingQty = (exitState.quantity || 0) * (1 - closeRatio);
              const slPercent = settings.riskManagement.stopLoss.fixedPercent;
              const tpPercent = settings.riskManagement.takeProfit.fixedPercent;
              const entryPrice = exitState.entryPrice;
              const stopLossPrice = direction === "long"
                ? entryPrice * (1 - slPercent / 100)
                : entryPrice * (1 + slPercent / 100);
              const takeProfitPrice = direction === "long"
                ? entryPrice * (1 + tpPercent / 100)
                : entryPrice * (1 - tpPercent / 100);

              await placeExchangeStopLossTakeProfit(
                posKey,
                activeExchange,
                symbol,
                direction,
                stopLossPrice,
                takeProfitPrice,
                remainingQty,
              );
            }
          }
        }
      } else {
        const tradingStore = useTradingStore.getState();
        const pos = (tradingStore.positions || []).find(p => 
          p.symbol === symbol && p.side === direction
        );
        if (pos && tradingStore.manualClosePosition) {
          const entryPrice = exitState?.entryPrice || pos.entryPrice;
          const closeQty = pos.quantity * closeRatio;
          pnl = direction === "long"
            ? (currentPrice - entryPrice) * closeQty
            : (entryPrice - currentPrice) * closeQty;

          if (closeRatio >= 1) {
            tradingStore.manualClosePosition(pos.id, currentPrice, reason);
          } else {
            // 模拟部分平仓：按比例减少持仓数量
            // 通过先全部平仓再重新开仓剩余部分来实现
            tradingStore.manualClosePosition(pos.id, currentPrice, `${reason}_partial_${(closeRatio * 100).toFixed(0)}%`);
            const remainingQty = pos.quantity * (1 - closeRatio);
            if (remainingQty > 0 && tradingStore.manualOpenPosition) {
              tradingStore.manualOpenPosition(symbol, direction, entryPrice, remainingQty * entryPrice / (settings.defaultLeverage || 1));
            }
          }
          console.log(`[AutoTrade] 模拟平仓: ${direction} @ ${currentPrice.toFixed(2)} 比例 ${(closeRatio * 100).toFixed(0)}%`);
        }
      }

      if (riskManagerRef.current && pnl !== 0) {
        riskManagerRef.current.recordTradeResult(pnl, symbol);
      }

      if (closeRatio >= 1) {
        positionExitStatesRef.current.delete(posKey);
      }
    } catch (error) {
      console.error("[AutoTrade] 平仓错误:", error);
    }
  }, [exchangeMode, activeExchange, symbol, settings.riskManagement.stopLoss, settings.riskManagement.takeProfit, settings.defaultLeverage, placeExchangeStopLossTakeProfit]);

  // 实时信号检测 - 当信号变化时立即判断是否交易
  useEffect(() => {
    if (!settings.autoTrade) return;
    if (!combinedSignal || combinedSignal.direction === "neutral") return;
    if (!ticker || ticker.lastPrice <= 0) return;

    const { direction, confidence, strength } = combinedSignal;
    const { minConfidence, minStrength } = settings;

    if (confidence < minConfidence) {
      console.log(`[AutoTrade] 置信度不足: ${(confidence * 100).toFixed(0)}% < ${(minConfidence * 100).toFixed(0)}%`);
      return;
    }

    if (strength < minStrength) {
      console.log(`[AutoTrade] 强度不足: ${(strength * 100).toFixed(0)}% < ${(minStrength * 100).toFixed(0)}%`);
      return;
    }

    const state = stateRef.current;
    if (
      state.lastSignalDirection === direction &&
      Math.abs(state.lastSignalConfidence - confidence) < 0.05
    ) {
      return;
    }

    if (state.lastSignalDirection && state.lastSignalDirection !== direction) {
      executeClose(state.lastSignalDirection === "long" ? "long" : "short", ticker.lastPrice, "signal_flip");
    }

    const entryPrice = combinedSignal.entryZone?.lower ?? ticker.lastPrice;
    executeTrade(direction as "long" | "short", entryPrice, confidence, strength);

    stateRef.current.lastSignalDirection = direction;
    stateRef.current.lastSignalConfidence = confidence;

  }, [combinedSignal, ticker?.lastPrice, settings.autoTrade, executeTrade, executeClose]);

  /**
   * 价格监听 - 检查追踪止损/分批止盈
   * 
   * 关键改进：
   * - 实盘模式下交易所端已有止损/止盈单，这里只做追踪止损更新和分批止盈
   * - 追踪止损更新时同步更新交易所端止损单
   * - 检查频率改为 5 秒（实盘模式下交易所端毫秒级执行，无需高频轮询）
   */
  useEffect(() => {
    if (!settings.autoTrade) return;
    if (!ticker || ticker.lastPrice <= 0) return;

    const interval = setInterval(async () => {
      try {
        let positions: any[] = [];

        if (exchangeMode === "live" && activeExchange !== "paper") {
          positions = await fetchPositions(activeExchange, symbol);
        } else {
          const tradingStore = useTradingStore.getState();
          positions = tradingStore.positions || [];
        }

        for (const pos of positions) {
          const side = pos.side === "LONG" || pos.side === "long" ? "long" : "short";
          const posKey = `${symbol}-${side}`;
          const currentPrice = ticker.lastPrice;
          const entryPrice = pos.entryPrice || 0;
          const quantity = pos.quantity || pos.positionAmt || 0;
          const leverage = pos.leverage || settings.defaultLeverage;

          let exitState = positionExitStatesRef.current.get(posKey);
          const atr = calculateATRFromCandles();

          if (!exitState && entryPrice > 0) {
            exitState = createPositionExitState(
              symbol,
              side,
              entryPrice,
              quantity,
              leverage,
              settings.riskManagement.stopLoss,
              settings.riskManagement.takeProfit,
              atr,
            );
            positionExitStatesRef.current.set(posKey, exitState);
          }

          if (!exitState) continue;

          const decision = evaluateExit(
            exitState,
            currentPrice,
            settings.riskManagement.takeProfit,
          );

          if (decision.shouldClose) {
            // 分批平仓或全部平仓
            await executeClose(side, currentPrice, decision.reason, decision.closeRatio);
          } else if (decision.updateStopLoss !== undefined) {
            // 追踪止损更新
            const oldStopLoss = exitState.currentStopLoss;
            exitState.currentStopLoss = decision.updateStopLoss;

            // 实盘模式：同步更新交易所端止损单
            // 只在止损价变化超过 0.1% 时才更新，避免频繁下单
            if (
              exchangeMode === "live" &&
              activeExchange !== "paper" &&
              oldStopLoss !== undefined &&
              Math.abs(decision.updateStopLoss - oldStopLoss) / oldStopLoss > 0.001
            ) {
              console.log(`[AutoTrade] 更新交易所端追踪止损: ${oldStopLoss.toFixed(2)} → ${decision.updateStopLoss.toFixed(2)}`);
              await placeExchangeStopLossTakeProfit(
                posKey,
                activeExchange,
                symbol,
                side,
                decision.updateStopLoss,
                undefined, // 不更新止盈
                quantity,
              );
            }
          }
        }
      } catch (error) {
        // 忽略查询错误
      }
    }, 5000); // 实盘模式下交易所端有止损单，5 秒检查足够

    return () => clearInterval(interval);
  }, [settings.autoTrade, exchangeMode, activeExchange, symbol, ticker?.lastPrice, calculateATRFromCandles, executeClose, settings.riskManagement.stopLoss, settings.riskManagement.takeProfit, settings.defaultLeverage, placeExchangeStopLossTakeProfit]);

  // 返回控制函数
  return {
    executeTrade,
    executeClose,
    isAutoTradeEnabled: settings.autoTrade,
    lastTradeTime: stateRef.current.lastTradeTime,
    tradeCount: stateRef.current.tradeCount,
    getRiskState,
    resumeTrading,
  };
}

// 播放交易提示音
function playTradeSound(direction: "long" | "short") {
  try {
    const ctx = new (window as any).AudioContext || (window as any).webkitAudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = direction === "long" ? 880 : 440;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // 忽略
  }
}

// 浏览器通知
function showTradeNotification(
  symbol: string,
  direction: "long" | "short",
  price: number,
  confidence: number,
) {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(`自动${direction === "long" ? "开多" : "开空"} - ${symbol}`, {
        body: `价格: ${price.toFixed(2)}，置信度: ${(confidence * 100).toFixed(0)}%`,
        icon: direction === "long" ? "📈" : "📉",
      });
    }
  }
}
