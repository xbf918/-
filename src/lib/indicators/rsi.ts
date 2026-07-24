import type { Candle, RSIPoint, RSISummary } from "@/types";

export const DEFAULT_RSI_PERIOD = 14;
export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;

export function rsi(candles: Candle[], period = DEFAULT_RSI_PERIOD): RSIPoint[] {
  const result: RSIPoint[] = [];
  if (candles.length <= period) return result;

  let gainAvg = 0;
  let lossAvg = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainAvg += diff;
    else lossAvg -= diff;
  }
  gainAvg /= period;
  lossAvg /= period;

  for (let i = 0; i < candles.length; i++) {
    if (i < period) continue;
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    gainAvg = (gainAvg * (period - 1) + gain) / period;
    lossAvg = (lossAvg * (period - 1) + loss) / period;
    const value = lossAvg === 0 ? 100 : 100 - 100 / (1 + gainAvg / lossAvg);
    result.push({ time: candles[i].time, value });
  }
  return result;
}

export function summarizeRsi(points: RSIPoint[]): RSISummary | null {
  if (points.length < 2) return null;
  const current = points[points.length - 1];
  const prev = points[points.length - 2];
  const rising = current.value > prev.value;

  let zone: RSISummary["zone"] = "normal";
  if (current.value >= RSI_OVERBOUGHT) zone = "overbought";
  else if (current.value <= RSI_OVERSOLD) zone = "oversold";

  let signal: RSISummary["signal"] = "neutral";
  if (zone === "oversold" && rising) signal = "bullish";
  else if (zone === "overbought" && !rising) signal = "bearish";
  else if (rising && current.value > 50) signal = "bullish";
  else if (!rising && current.value < 50) signal = "bearish";

  return { value: current.value, zone, rising, signal };
}
