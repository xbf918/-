// 综合评分引擎：整合技术面、背离、流动性、多周期、消息面
import type {
  Candle,
  Divergence,
  FearGreedIndex,
  LiquidityZone,
  MACDSummary,
  RSISummary,
  KDJSummary,
  CVDSummary,
  OISummary,
  NewsItem,
  SignalScore,
  SupportResistance,
  TimeframeSignal,
  ScoreWeights,
  PatternSummary,
} from "@/types";
import { DEFAULT_WEIGHTS } from "@/lib/constants";
import { liquiditySummary } from "@/lib/liquidity/analyze";
import { multiTimeframeScore } from "@/lib/indicators/multiTimeframe";
import { clamp } from "@/lib/format";

export interface ScoringInput {
  candles: Candle[];
  currentPrice: number;
  macdSummary: MACDSummary | null;
  rsiSummary: RSISummary | null;
  kdjSummary: KDJSummary | null;
  cvdSummary: CVDSummary | null;
  oiSummary: OISummary | null;
  supportResistance: SupportResistance[];
  divergences: Divergence[];
  liquidityZones: LiquidityZone[];
  timeframeSignals: TimeframeSignal[];
  news: NewsItem[];
  fearGreed: FearGreedIndex | null;
  patternSummary: PatternSummary | null;
  weights?: ScoreWeights;
}

/** 各维度评分（-100 ~ +100，正为看多） */
function scoreTechnical(
  candles: Candle[],
  macdSummary: MACDSummary | null,
  rsiSummary: RSISummary | null,
  kdjSummary: KDJSummary | null,
  currentPrice: number,
  supportResistance: SupportResistance[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // MACD
  if (macdSummary) {
    if (macdSummary.trend === "bullish") {
      score += 30;
      reasons.push("MACD 看涨");
    } else if (macdSummary.trend === "bearish") {
      score -= 30;
      reasons.push("MACD 看跌");
    }
    if (macdSummary.histogramRising) {
      score += 8;
    } else {
      score -= 8;
    }
    if (macdSummary.lastCrossover) {
      const barsAgo = candles.length - 1 - candles.findIndex((c) => c.time === macdSummary.lastCrossover!.time);
      if (barsAgo < 5) {
        if (macdSummary.lastCrossover.crossover === "bullish") {
          score += 12;
          reasons.push(`MACD 金叉（${barsAgo} 根前）`);
        } else {
          score -= 12;
          reasons.push(`MACD 死叉（${barsAgo} 根前）`);
        }
      }
    }
  }

  // RSI
  if (rsiSummary) {
    if (rsiSummary.zone === "oversold") {
      score += 25;
      reasons.push(`RSI 超卖（${rsiSummary.value.toFixed(1)}）`);
    } else if (rsiSummary.zone === "overbought") {
      score -= 25;
      reasons.push(`RSI 超买（${rsiSummary.value.toFixed(1)}）`);
    }
    if (rsiSummary.signal === "bullish") {
      score += 10;
    } else if (rsiSummary.signal === "bearish") {
      score -= 10;
    }
  }

  // KDJ
  if (kdjSummary) {
    if (kdjSummary.zone === "oversold") {
      score += 20;
      reasons.push("KDJ 超卖区域");
    } else if (kdjSummary.zone === "overbought") {
      score -= 20;
      reasons.push("KDJ 超买区域");
    }
    if (kdjSummary.trend === "bullish") {
      score += 12;
      reasons.push("KDJ 金叉向上");
    } else if (kdjSummary.trend === "bearish") {
      score -= 12;
      reasons.push("KDJ 死叉向下");
    }
    if (kdjSummary.lastCross) {
      const barsAgo = candles.length - 1 - candles.findIndex((c) => c.time === kdjSummary.lastCross!.point.time);
      if (barsAgo < 3) {
        if (kdjSummary.lastCross.type === "golden") {
          score += 10;
          reasons.push(`KDJ 金叉（${barsAgo} 根前）`);
        } else {
          score -= 10;
          reasons.push(`KDJ 死叉（${barsAgo} 根前）`);
        }
      }
    }
  }

  // 支撑阻力位距离
  const nearestSup = supportResistance.filter((s) => s.type === "support" && s.price < currentPrice)
    .sort((a, b) => b.price - a.price)[0];
  const nearestRes = supportResistance.filter((s) => s.type === "resistance" && s.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0];

  if (nearestSup) {
    const dist = ((currentPrice - nearestSup.price) / currentPrice) * 100;
    if (dist < 1) {
      score += 20;
      reasons.push(`接近支撑位（${dist.toFixed(2)}%）`);
    } else if (dist < 3) {
      score += 8;
    }
  }
  if (nearestRes) {
    const dist = ((nearestRes.price - currentPrice) / currentPrice) * 100;
    if (dist < 1) {
      score -= 20;
      reasons.push(`接近阻力位（${dist.toFixed(2)}%）`);
    } else if (dist < 3) {
      score -= 8;
    }
  }

  return { score: clamp(score, -100, 100), reasons };
}

function scoreDivergence(divergences: Divergence[]): { score: number; reasons: string[] } {
  if (divergences.length === 0) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  const recent = divergences.slice(0, 3);
  for (const d of recent) {
    const weight = d.strength === "strong" ? 1 : d.strength === "medium" ? 0.6 : 0.3;
    if (d.type === "regular_bearish") {
      score -= 35 * weight;
      reasons.push(`${d.strength === "strong" ? "强" : d.strength === "medium" ? "中" : "弱"}顶背离`);
    } else if (d.type === "regular_bullish") {
      score += 35 * weight;
      reasons.push(`${d.strength === "strong" ? "强" : d.strength === "medium" ? "中" : "弱"}底背离`);
    } else if (d.type === "hidden_bullish") {
      score += 15 * weight;
      reasons.push("隐藏底背离（趋势延续）");
    } else if (d.type === "hidden_bearish") {
      score -= 15 * weight;
      reasons.push("隐藏顶背离（趋势延续）");
    }
  }
  return { score: clamp(score, -100, 100), reasons };
}

function scoreLiquidity(
  zones: LiquidityZone[],
  currentPrice: number,
): { score: number; reasons: string[] } {
  if (zones.length === 0) return { score: 0, reasons: [] };
  const { imbalance, walls } = liquiditySummary(zones);
  let score = imbalance * 0.6;
  const reasons: string[] = [];
  if (imbalance > 20) {
    reasons.push(`买方流动性占优 ${imbalance.toFixed(1)}%`);
  } else if (imbalance < -20) {
    reasons.push(`卖方流动性占优 ${Math.abs(imbalance).toFixed(1)}%`);
  }

  // 买卖墙分析
  const bidWalls = walls.filter((w) => w.side === "bid" && w.distancePct > -5);
  const askWalls = walls.filter((w) => w.side === "ask" && w.distancePct < 5);
  if (bidWalls.length > 0) {
    score += 15;
    reasons.push(`下方 ${bidWalls.length} 个买墙支撑`);
  }
  if (askWalls.length > 0) {
    score -= 15;
    reasons.push(`上方 ${askWalls.length} 个卖墙压制`);
  }

  return { score: clamp(score, -100, 100), reasons };
}

function scoreTimeframe(
  signals: TimeframeSignal[],
): { score: number; reasons: string[] } {
  if (signals.length === 0) return { score: 0, reasons: [] };
  const score = multiTimeframeScore(signals);
  const reasons: string[] = [];
  const bull = signals.filter((s) => s.trend === "bullish");
  const bear = signals.filter((s) => s.trend === "bearish");
  if (bull.length === signals.length) {
    reasons.push(`全部 ${signals.length} 个周期看涨共振`);
  } else if (bear.length === signals.length) {
    reasons.push(`全部 ${signals.length} 个周期看跌共振`);
  } else {
    reasons.push(`${bull.length} 涨 / ${bear.length} 跌 / ${signals.length - bull.length - bear.length} 中`);
  }
  return { score: clamp(score, -100, 100), reasons };
}

function scoreVolumeFlow(
  cvdSummary: CVDSummary | null,
  oiSummary: OISummary | null,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // CVD 量能流向
  if (cvdSummary) {
    if (cvdSummary.trend === "bullish") {
      score += 30;
      reasons.push("CVD 量能向上（买方主导）");
    } else if (cvdSummary.trend === "bearish") {
      score -= 30;
      reasons.push("CVD 量能向下（卖方主导）");
    }
    if (cvdSummary.diverging) {
      score += cvdSummary.trend === "bullish" ? -15 : 15;
      reasons.push("量价背离");
    }
  }

  // OI 持仓量分析
  if (oiSummary) {
    if (oiSummary.trend === "bullish") {
      score += 25;
      reasons.push("OI 增仓上涨（多头加仓）");
    } else if (oiSummary.trend === "bearish") {
      score -= 25;
      reasons.push("OI 增仓下跌（空头加仓）");
    }
    if (oiSummary.diverging) {
      reasons.push("价格与持仓量背离");
    }
    if (oiSummary.changePercent > 5) {
      reasons.push(`OI 24h 变化 +${oiSummary.changePercent.toFixed(1)}%`);
    } else if (oiSummary.changePercent < -5) {
      reasons.push(`OI 24h 变化 ${oiSummary.changePercent.toFixed(1)}%`);
    }
  }

  return { score: clamp(score, -100, 100), reasons };
}

function scoreSentiment(
  news: NewsItem[],
  fearGreed: FearGreedIndex | null,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (fearGreed) {
    // 恐惧贪婪：极端恐惧（<25）为看多逆向信号，极端贪婪（>75）为看空逆向信号
    if (fearGreed.value < 25) {
      score += 40;
      reasons.push(`恐惧贪婪指数 ${fearGreed.value}（极度恐惧，逆向看多）`);
    } else if (fearGreed.value < 45) {
      score += 15;
      reasons.push(`恐惧贪婪指数 ${fearGreed.value}（恐惧）`);
    } else if (fearGreed.value > 75) {
      score -= 40;
      reasons.push(`恐惧贪婪指数 ${fearGreed.value}（极度贪婪，逆向看空）`);
    } else if (fearGreed.value > 55) {
      score -= 15;
      reasons.push(`恐惧贪婪指数 ${fearGreed.value}（贪婪）`);
    } else {
      reasons.push(`恐惧贪婪指数 ${fearGreed.value}（中性）`);
    }
  }

  // 新闻情绪
  if (news.length > 0) {
    const recent = news.slice(0, 10);
    const pos = recent.filter((n) => n.sentiment === "positive").length;
    const neg = recent.filter((n) => n.sentiment === "negative").length;
    const net = (pos - neg) / recent.length;
    score += net * 30;
    if (net > 0.3) {
      reasons.push(`新闻情绪偏多（${pos}/${recent.length}）`);
    } else if (net < -0.3) {
      reasons.push(`新闻情绪偏空（${neg}/${recent.length}）`);
    } else {
      reasons.push(`新闻情绪中性`);
    }
  }

  return { score: clamp(score, -100, 100), reasons };
}

function scorePatterns(
  patternSummary: PatternSummary | null,
): { score: number; reasons: string[] } {
  if (!patternSummary) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = patternSummary.score;

  const candleBull = patternSummary.candlePatterns.filter((p) => p.direction === "bullish");
  const candleBear = patternSummary.candlePatterns.filter((p) => p.direction === "bearish");
  const chartBull = patternSummary.chartPatterns.filter((p) => p.direction === "bullish");
  const chartBear = patternSummary.chartPatterns.filter((p) => p.direction === "bearish");

  if (candleBull.length > 0) {
    const top = candleBull[0];
    reasons.push(`看涨K线形态: ${top.type} (${top.strength}级)`);
  }
  if (candleBear.length > 0) {
    const top = candleBear[0];
    reasons.push(`看跌K线形态: ${top.type} (${top.strength}级)`);
  }
  if (chartBull.length > 0) {
    const top = chartBull[0];
    reasons.push(`看涨图表形态: ${top.type}`);
  }
  if (chartBear.length > 0) {
    const top = chartBear[0];
    reasons.push(`看跌图表形态: ${top.type}`);
  }

  return { score: clamp(score, -100, 100), reasons };
}

/** 主评分函数 */
export function computeSignalScore(input: ScoringInput): SignalScore {
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const {
    candles,
    currentPrice,
    macdSummary,
    rsiSummary,
    kdjSummary,
    cvdSummary,
    oiSummary,
    supportResistance,
    divergences,
    liquidityZones,
    timeframeSignals,
    news,
    fearGreed,
    patternSummary,
  } = input;

  const technical = scoreTechnical(candles, macdSummary, rsiSummary, kdjSummary, currentPrice, supportResistance);
  const divergence = scoreDivergence(divergences);
  const liquidity = scoreLiquidity(liquidityZones, currentPrice);
  const timeframe = scoreTimeframe(timeframeSignals);
  const volumeFlow = scoreVolumeFlow(cvdSummary, oiSummary);
  const sentiment = scoreSentiment(news, fearGreed);
  const patterns = scorePatterns(patternSummary);

  const allReasons = [
    ...technical.reasons,
    ...divergence.reasons,
    ...liquidity.reasons,
    ...timeframe.reasons,
    ...volumeFlow.reasons,
    ...sentiment.reasons,
    ...patterns.reasons,
  ].slice(0, 10);

  const volFlowWeight = 0.15;
  const patternWeight = 0.15;
  const totalWeight = weights.technical + weights.divergence + weights.liquidity + weights.timeframe + weights.sentiment + volFlowWeight + patternWeight;
  const weighted = (
    technical.score * weights.technical +
    divergence.score * weights.divergence +
    liquidity.score * weights.liquidity +
    timeframe.score * weights.timeframe +
    sentiment.score * weights.sentiment +
    volumeFlow.score * volFlowWeight +
    patterns.score * patternWeight
  ) / totalWeight;

  const total = Math.round(Math.abs(weighted));
  const direction: SignalScore["direction"] =
    weighted > 15 ? "long" : weighted < -15 ? "short" : "neutral";

  const componentScores = [technical.score, divergence.score, liquidity.score, timeframe.score, volumeFlow.score, sentiment.score, patterns.score];
  const positive = componentScores.filter((s) => s > 10).length;
  const negative = componentScores.filter((s) => s < -10).length;
  const activeDims = componentScores.filter((s) => Math.abs(s) >= 5).length;
  const aligned = Math.max(positive, negative);
  const alignRatio = activeDims > 0 ? aligned / activeDims : 0;
  const confidence = Math.round(alignRatio * 50 + Math.min(50, Math.abs(weighted) * 0.6));

  return {
    total: clamp(total, 0, 100),
    direction,
    confidence: clamp(confidence, 0, 100),
    components: {
      technical: Math.round(technical.score),
      liquidity: Math.round(liquidity.score),
      divergence: Math.round(divergence.score),
      sentiment: Math.round(sentiment.score),
      timeframe: Math.round(timeframe.score),
      patterns: Math.round(patterns.score),
    },
    reasons: allReasons,
    timestamp: Math.floor(Date.now() / 1000),
  };
}
