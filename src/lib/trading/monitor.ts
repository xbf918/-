import { backgroundScheduler } from "@/lib/scheduler";
import { useTradingStore } from "@/store/useTradingStore";
import { useMarketStore } from "@/store/useMarketStore";

let priceUpdateRegistered = false;

export function startTradingMonitor() {
  if (priceUpdateRegistered) return;
  priceUpdateRegistered = true;

  backgroundScheduler.register("trading-price-update", () => {
    const tradingStore = useTradingStore.getState();
    const marketStore = useMarketStore.getState();

    const positions = tradingStore.positions;
    if (positions.length === 0 || tradingStore.liveMode) return;

    const prices: Record<string, number> = {};
    for (const pos of positions) {
      const candle = marketStore.candles[pos.symbol]?.[0];
      if (candle) {
        prices[pos.symbol] = candle.close;
      }
    }

    if (Object.keys(prices).length > 0) {
      tradingStore.updatePrices(prices);
    }
  }, 5000);
}