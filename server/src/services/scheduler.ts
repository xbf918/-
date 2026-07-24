import { getPrice, getPositions, checkStopLoss, checkTakeProfit } from '../services/trading';
import { exchanges, type ExchangeId, type Position } from '../exchange/client';
import { broadcastPriceUpdate, broadcastPositionUpdate, broadcastSignal } from '../ws';
import { sendNotification } from '../services/notification';

interface PriceUpdate {
  exchange: ExchangeId;
  symbol: string;
  price: number;
}

interface PriceAlert {
  id: string;
  exchange: ExchangeId;
  symbol: string;
  targetPrice: number;
  direction: 'above' | 'below';
  triggered: boolean;
  message: string;
}

const symbolsToMonitor: Array<{ exchange: ExchangeId; symbol: string }> = [
  { exchange: 'binance', symbol: 'BTCUSDT' },
  { exchange: 'binance', symbol: 'ETHUSDT' },
];

let priceHistory: Record<string, number[]> = {};
let priceAlerts: PriceAlert[] = [];

export async function updatePrices(): Promise<PriceUpdate[]> {
  const updates: PriceUpdate[] = [];

  for (const { exchange, symbol } of symbolsToMonitor) {
    try {
      const price = await getPrice(exchange, symbol);
      updates.push({ exchange, symbol, price });

      const key = `${exchange}-${symbol}`;
      priceHistory[key] = priceHistory[key] || [];
      priceHistory[key].push(price);
      if (priceHistory[key].length > 60) {
        priceHistory[key] = priceHistory[key].slice(-60);
      }

      await broadcastPriceUpdate(exchange, symbol, price);
      await checkPriceAlerts(exchange, symbol, price);
    } catch (error) {
      console.error(`Failed to update price for ${symbol}:`, error);
    }
  }

  return updates;
}

export async function monitorPositions(): Promise<void> {
  for (const exchangeId of ['binance', 'okx'] as ExchangeId[]) {
    try {
      const positions = await getPositions(exchangeId);

      if (positions.length > 0) {
        const [slTriggered, tpTriggered] = await Promise.all([
          checkStopLoss(exchangeId, positions),
          checkTakeProfit(exchangeId, positions),
        ]);

        if (slTriggered.length > 0) {
          console.log(`[${exchangeId}] Stop loss triggered for:`, slTriggered.map((p) => p.symbol));
          await broadcastPositionUpdate(exchangeId, slTriggered);
          for (const pos of slTriggered) {
            await sendNotification('stop_loss', {
              symbol: pos.symbol,
              side: pos.side,
              price: pos.stopLoss,
            });
          }
        }

        if (tpTriggered.length > 0) {
          console.log(`[${exchangeId}] Take profit triggered for:`, tpTriggered.map((p) => p.symbol));
          await broadcastPositionUpdate(exchangeId, tpTriggered);
          for (const pos of tpTriggered) {
            await sendNotification('take_profit', {
              symbol: pos.symbol,
              side: pos.side,
              price: pos.takeProfit,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to monitor positions for ${exchangeId}:`, error);
    }
  }
}

export async function checkPriceAlerts(exchange: ExchangeId, symbol: string, price: number): Promise<void> {
  const activeAlerts = priceAlerts.filter(a => a.exchange === exchange && a.symbol === symbol && !a.triggered);
  
  for (const alert of activeAlerts) {
    const triggered = (alert.direction === 'above' && price >= alert.targetPrice) ||
                      (alert.direction === 'below' && price <= alert.targetPrice);
    
    if (triggered) {
      alert.triggered = true;
      await broadcastSignal({
        type: 'price_alert',
        id: alert.id,
        exchange,
        symbol,
        targetPrice: alert.targetPrice,
        currentPrice: price,
        direction: alert.direction,
        message: alert.message,
        timestamp: Date.now(),
      });
      await sendNotification('price_alert', {
        id: alert.id,
        exchange,
        symbol,
        targetPrice: alert.targetPrice,
        currentPrice: price,
        direction: alert.direction,
        message: alert.message,
      });
      console.log(`[ALERT] ${alert.message} - ${symbol} ${price}`);
    }
  }
}

export function addPriceAlert(alert: Omit<PriceAlert, 'triggered'>): void {
  priceAlerts.push({ ...alert, triggered: false });
}

export function removePriceAlert(id: string): void {
  priceAlerts = priceAlerts.filter(a => a.id !== id);
}

export function getPriceAlerts(exchange?: ExchangeId, symbol?: string): PriceAlert[] {
  return priceAlerts.filter(a => 
    (!exchange || a.exchange === exchange) &&
    (!symbol || a.symbol === symbol)
  );
}

export function clearTriggeredAlerts(): void {
  priceAlerts = priceAlerts.filter(a => !a.triggered);
}

export function getPriceHistory(exchange: ExchangeId, symbol: string): number[] {
  const key = `${exchange}-${symbol}`;
  return priceHistory[key] || [];
}

export function addSymbolToMonitor(exchange: ExchangeId, symbol: string): void {
  const exists = symbolsToMonitor.some((s) => s.exchange === exchange && s.symbol === symbol);
  if (!exists) {
    symbolsToMonitor.push({ exchange, symbol });
  }
}

export function removeSymbolFromMonitor(exchange: ExchangeId, symbol: string): void {
  const index = symbolsToMonitor.findIndex((s) => s.exchange === exchange && s.symbol === symbol);
  if (index > -1) {
    symbolsToMonitor.splice(index, 1);
  }
}