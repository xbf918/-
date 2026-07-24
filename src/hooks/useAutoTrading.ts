import { useEffect, useRef } from "react";
import { useMarketStore } from "@/store/useMarketStore";
import { useTradingStore } from "@/store/useTradingStore";
import { useExchangeStore } from "@/store/useExchangeStore";
import { placeOrder, closePosition as apiClosePosition, setLeverage } from "@/services/exchange";
import type { OrderSide, PositionSide as ExchangePositionSide } from "@/types/exchange";

export function useAutoTrading() {
  const signalScore = useMarketStore((s) => s.signalScore);
  const ticker = useMarketStore((s) => s.ticker);
  const symbol = useMarketStore((s) => s.symbol);
  const status = useMarketStore((s) => s.status);
  const config = useTradingStore((s) => s.config);
  const processSignal = useTradingStore((s) => s.processSignal);
  const updatePrices = useTradingStore((s) => s.updatePrices);

  const lastSignalRef = useRef<{
    direction: string;
    confidence: number;
    timestamp: number;
  } | null>(null);

  const liveTradeRef = useRef(false);

  // 价格更新 - 触发止盈止损检查
  useEffect(() => {
    if (!ticker || !symbol) return;
    const prices: Record<string, number> = { [symbol]: ticker.lastPrice };
    updatePrices(prices);
  }, [ticker?.lastPrice, symbol, updatePrices]);

  // 实盘交易：通过交易所 API 下单
  const executeLiveOrder = async (
    direction: "long" | "short",
    currentPrice: number,
  ) => {
    const exchangeStore = useExchangeStore.getState();
    if (exchangeStore.mode !== "live" || exchangeStore.activeExchange === "paper") return;
    if (liveTradeRef.current) return; // 防止重复下单

    const tradingConfig = useTradingStore.getState().config;
    const balance = useExchangeStore.getState().account?.availableBalance ?? 0;
    if (balance <= 0) return;

    const exchange = exchangeStore.activeExchange;
    // 转换 symbol 格式：BTCUSDT (Binance) / BTC-USDT-SWAP (OKX)
    const exchangeSymbol = exchange === "binance"
      ? symbol.replace("/", "")
      : symbol.replace("/", "-") + "-SWAP";

    const orderSide: OrderSide = direction === "long" ? "BUY" : "SELL";
    const posSide: ExchangePositionSide = direction === "long" ? "LONG" : "SHORT";

    // 计算数量
    const qty = (balance * (tradingConfig.orderSizePercent / 100) * tradingConfig.leverage) / currentPrice;
    // 精度处理：截断到 3 位小数
    const quantity = Math.floor(qty * 1000) / 1000;
    if (quantity <= 0) return;

    liveTradeRef.current = true;
    try {
      // 1. 设置杠杆
      await setLeverage({ exchange, symbol: exchangeSymbol, leverage: tradingConfig.leverage });

      // 2. 开仓下单
      const order = await placeOrder({
        exchange,
        symbol: exchangeSymbol,
        side: orderSide,
        type: "MARKET",
        quantity,
        positionSide: posSide,
        leverage: tradingConfig.leverage,
      });

      // 3. 设置止盈止损（如果配置了）
      if (order.status === "FILLED" || order.status === "NEW") {
        const tpPrice = direction === "long"
          ? currentPrice * (1 + tradingConfig.takeProfitPercent / 100)
          : currentPrice * (1 - tradingConfig.takeProfitPercent / 100);
        const slPrice = direction === "long"
          ? currentPrice * (1 - tradingConfig.stopLossPercent / 100)
          : currentPrice * (1 + tradingConfig.stopLossPercent / 100);

        // 止盈单
        await placeOrder({
          exchange,
          symbol: exchangeSymbol,
          side: direction === "long" ? "SELL" : "BUY",
          type: "TAKE_PROFIT_MARKET",
          quantity,
          stopPrice: Math.floor(tpPrice * 100) / 100,
          reduceOnly: true,
          positionSide: posSide,
        }).catch(() => {});

        // 止损单
        await placeOrder({
          exchange,
          symbol: exchangeSymbol,
          side: direction === "long" ? "SELL" : "BUY",
          type: "STOP_MARKET",
          quantity,
          stopPrice: Math.floor(slPrice * 100) / 100,
          reduceOnly: true,
          positionSide: posSide,
        }).catch(() => {});
      }

      // 同时在本地记录（用于 UI 显示）
      useTradingStore.getState().manualOpenPosition(
        symbol,
        direction,
        currentPrice,
        balance,
      );
    } catch (err) {
      console.error("[Live Trading] Order failed:", err);
    } finally {
      liveTradeRef.current = false;
    }
  };

  // 实盘平仓
  const executeLiveClose = async (positionSymbol: string, side: "long" | "short") => {
    const exchangeStore = useExchangeStore.getState();
    if (exchangeStore.mode !== "live" || exchangeStore.activeExchange === "paper") return;

    const exchange = exchangeStore.activeExchange;
    const exchangeSymbol = exchange === "binance"
      ? positionSymbol.replace("/", "")
      : positionSymbol.replace("/", "-") + "-SWAP";

    try {
      await apiClosePosition({
        exchange,
        symbol: exchangeSymbol,
        positionSide: side === "long" ? "LONG" : "SHORT",
      });
    } catch (err) {
      console.error("[Live Trading] Close position failed:", err);
    }
  };

  // 信号处理
  useEffect(() => {
    if (!config.enabled) return;
    if (!signalScore || !ticker || status !== "success") return;

    const { direction, confidence, timestamp } = signalScore;

    if (lastSignalRef.current && lastSignalRef.current.timestamp === timestamp) {
      return;
    }

    lastSignalRef.current = { direction, confidence, timestamp };

    const exchangeMode = useExchangeStore.getState().mode;

    if (exchangeMode === "live") {
      // 实盘模式：通过交易所 API 下单
      const { positions } = useTradingStore.getState();
      const sameSymbolPositions = positions.filter((p) => p.symbol === symbol);
      const longPos = sameSymbolPositions.find((p) => p.side === "long");
      const shortPos = sameSymbolPositions.find((p) => p.side === "short");

      if (direction === "long") {
        if (shortPos) {
          executeLiveClose(symbol, "short");
          useTradingStore.getState().manualClosePosition(shortPos.id, ticker.lastPrice, "signal_flip");
        }
        if (!config.allowHedge && longPos) return;
        executeLiveOrder("long", ticker.lastPrice);
      } else if (direction === "short") {
        if (longPos) {
          executeLiveClose(symbol, "long");
          useTradingStore.getState().manualClosePosition(longPos.id, ticker.lastPrice, "signal_flip");
        }
        if (!config.allowHedge && shortPos) return;
        executeLiveOrder("short", ticker.lastPrice);
      }
    } else {
      // 模拟模式：使用本地 store
      processSignal(symbol, direction, confidence, ticker.lastPrice);
    }
  }, [signalScore, ticker, symbol, status, config.enabled, processSignal]);

  // 初始化交易所连接
  useEffect(() => {
    useExchangeStore.getState().init();
  }, []);
}
