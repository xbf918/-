// 多时间周期共振分析
import type { Candle, TimeframeSignal, SignalDirection } from "@/types";
import { ema } from "./ema";
import { macd, summarizeMacd } from "./macd";
import { rsi } from "./rsi";

/** 分析单个周期的信号 */
export function analyzeTimeframe(
  candles: Candle[],
  timeframe: TimeframeSignal["timeframe"],
): TimeframeSignal | null {
  if (candles.length < 35) return null;

  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];
  const lastClose = closes[closes.length - 1];

  // 趋势：EMA20 vs EMA50 + 价格 vs EMA20
  let trend: SignalDirection = "neutral";
  if (lastEma20 != null && lastEma50 != null) {
    if (lastEma20 > lastEma50 && lastClose > lastEma20) trend = "bullish";
    else if (lastEma20 < lastEma50 && lastClose < lastEma20) trend = "bearish";
    else if (lastEma20 > lastEma50) trend = "bullish";
    else trend = "bearish";
  }

  // MACD 信号
  const macdPoints = macd(candles);
  const summary = summarizeMacd(macdPoints);
  let macdSignal: SignalDirection = "neutral";
  if (summary) {
    if (summary.trend === "bullish") macdSignal = "bullish";
    else if (summary.trend === "bearish") macdSignal = "bearish";
  }

  // RSI 信号
  const rsiArr = rsi(candles, 14);
  const lastRsi = rsiArr[rsiArr.length - 1]?.value ?? null;
  let rsiSignal: TimeframeSignal["rsiSignal"] = "neutral";
  if (lastRsi != null) {
    if (lastRsi >= 70) rsiSignal = "overbought";
    else if (lastRsi <= 30) rsiSignal = "oversold";
  }

  // 价格 vs EMA20
  let priceVsEma: SignalDirection = "neutral";
  if (lastEma20 != null) {
    if (lastClose > lastEma20) priceVsEma = "bullish";
    else priceVsEma = "bearish";
  }

  // 共振强度：方向一致的指标数量
  const signals = [trend, macdSignal, priceVsEma];
  const bullCount = signals.filter((s) => s === "bullish").length;
  const bearCount = signals.filter((s) => s === "bearish").length;
  const maxAlign = Math.max(bullCount, bearCount);
  let resonance = Math.round((maxAlign / signals.length) * 100);
  // RSI 极端增加共振
  if (rsiSignal === "overbought" && bearCount >= bullCount) resonance = Math.min(100, resonance + 10);
  if (rsiSignal === "oversold" && bullCount >= bearCount) resonance = Math.min(100, resonance + 10);

  return {
    timeframe,
    trend,
    macdSignal,
    rsiSignal,
    priceVsEma,
    resonance,
  };
}

/** 计算多周期共振汇总分数（-100 ~ +100） */
export function multiTimeframeScore(signals: TimeframeSignal[]): number {
  if (signals.length === 0) return 0;
  const weights: Record<TimeframeSignal["timeframe"], number> = {
    "15m": 0.15,
    "1h": 0.25,
    "4h": 0.35,
    "1d": 0.25,
  };
  let score = 0;
  let totalWeight = 0;
  for (const s of signals) {
    const w = weights[s.timeframe] ?? 0.25;
    const local =
      (s.trend === "bullish" ? 1 : s.trend === "bearish" ? -1 : 0) * 0.4 +
      (s.macdSignal === "bullish" ? 1 : s.macdSignal === "bearish" ? -1 : 0) * 0.35 +
      (s.priceVsEma === "bullish" ? 1 : s.priceVsEma === "bearish" ? -1 : 0) * 0.25;
    score += local * s.resonance * w;
    totalWeight += w * 100;
  }
  return totalWeight > 0 ? (score / totalWeight) * 100 : 0;
}
