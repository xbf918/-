import type { AgentId, AgentOutput } from "./types";

export type SignalDirection = "long" | "short" | "neutral";

export interface AgentSignal {
  agentId: AgentId;
  agentName: string;
  direction: SignalDirection;
  strength: number;
  confidence: number;
  weight: number;
  keyFindings: string[];
}

export interface CombinedSignal {
  direction: SignalDirection;
  strength: number;
  confidence: number;
  score: number;
  threshold: number;
  shouldTrade: boolean;
  signals: AgentSignal[];
  bullishVotes: number;
  bearishVotes: number;
  neutralVotes: number;
  bullishWeight: number;
  bearishWeight: number;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  recommendedLeverage: number;
  entryZone: { upper: number; lower: number } | null;
  stopLoss: number | null;
  takeProfit: number | null;
}

export const AGENT_WEIGHTS: Record<AgentId, number> = {
  "market-analyst": 0.20,
  "onchain-analyst": 0.12,
  "news-analyst": 0.08,
  "sentiment-analyst": 0.10,
  "macro-analyst": 0.06,
  "strategy-researcher": 0.08,
  "backtest-agent": 0.06,
  "risk-manager": 0.04,
  "investment-advisor": 0.06,
  "execution-agent": 0.04,
  "monitoring-agent": 0.02,
  "performance-auditor": 0.02,
  "agent-coordinator": 0,
  "llm-analyst": 0.12,
};

const AGENT_NAMES: Record<AgentId, string> = {
  "market-analyst": "市场分析",
  "onchain-analyst": "链上数据",
  "news-analyst": "新闻分析",
  "sentiment-analyst": "市场情绪",
  "macro-analyst": "宏观经济",
  "strategy-researcher": "策略研究",
  "backtest-agent": "回测验证",
  "risk-manager": "风险控制",
  "investment-advisor": "投资顾问",
  "execution-agent": "交易执行",
  "monitoring-agent": "系统监控",
  "performance-auditor": "绩效审核",
  "agent-coordinator": "协调器",
  "llm-analyst": "AI智能分析",
};

export function combineAgentSignals(
  results: Partial<Record<AgentId, AgentOutput>>,
  currentPrice: number,
  threshold: number = 0.6,
  customWeights?: Partial<Record<AgentId, number>>,
): CombinedSignal {
  const signals: AgentSignal[] = [];

  const weights = { ...AGENT_WEIGHTS };
  if (customWeights) {
    for (const [k, v] of Object.entries(customWeights)) {
      if (v !== undefined) weights[k as AgentId] = v;
    }
  }

  for (const [id, result] of Object.entries(results)) {
    if (!result) continue;
    const agentId = id as AgentId;
    const signal = extractSignal(agentId, result, currentPrice, weights);
    if (signal) {
      signals.push(signal);
    }
  }

  let bullishWeight = 0;
  let bearishWeight = 0;
  let totalWeight = 0;
  let bullishVotes = 0;
  let bearishVotes = 0;
  let neutralVotes = 0;
  let totalConfidence = 0;
  let activeSignals = 0;

  for (const sig of signals) {
    const w = sig.weight;
    totalWeight += w;
    if (sig.confidence > 0) {
      totalConfidence += sig.confidence;
      activeSignals++;
    }

    if (sig.direction === "long") {
      bullishWeight += w * sig.strength * sig.confidence;
      bullishVotes++;
    } else if (sig.direction === "short") {
      bearishWeight += w * sig.strength * sig.confidence;
      bearishVotes++;
    } else {
      neutralVotes++;
    }
  }

  const netScore = totalWeight > 0 ? (bullishWeight - bearishWeight) / totalWeight : 0;
  const strength = Math.abs(netScore);
  const avgConfidence = activeSignals > 0 ? totalConfidence / activeSignals : 0.5;

  let direction: SignalDirection = "neutral";
  if (netScore > 0.1) direction = "long";
  else if (netScore < -0.1) direction = "short";

  const shouldTrade = direction !== "neutral" && avgConfidence >= threshold && strength >= 0.15;

  let riskLevel: "low" | "medium" | "high" = "medium";
  if (avgConfidence >= 0.75 && strength >= 0.4) riskLevel = "low";
  else if (avgConfidence <= 0.45 || strength <= 0.2) riskLevel = "high";

  let recommendedLeverage = 1;
  if (riskLevel === "low") recommendedLeverage = 5;
  else if (riskLevel === "medium") recommendedLeverage = 3;
  else recommendedLeverage = 1;

  const entryZone = direction !== "neutral" && currentPrice > 0
    ? {
        upper: currentPrice * (direction === "long" ? 1.005 : 0.998),
        lower: currentPrice * (direction === "long" ? 0.995 : 1.002),
      }
    : null;

  const stopLoss = direction !== "neutral" && currentPrice > 0
    ? currentPrice * (direction === "long" ? 0.97 : 1.03)
    : null;

  const takeProfit = direction !== "neutral" && currentPrice > 0
    ? currentPrice * (direction === "long" ? 1.05 : 0.95)
    : null;

  const summary = generateSummary(direction, strength, avgConfidence, signals, riskLevel);

  return {
    direction,
    strength,
    confidence: avgConfidence,
    score: netScore,
    threshold,
    shouldTrade,
    signals,
    bullishVotes,
    bearishVotes,
    neutralVotes,
    bullishWeight,
    bearishWeight,
    summary,
    riskLevel,
    recommendedLeverage,
    entryZone,
    stopLoss,
    takeProfit,
  };
}

function extractSignal(
  agentId: AgentId,
  result: AgentOutput,
  currentPrice: number,
  weights: Record<AgentId, number>,
): AgentSignal | null {
  if (result.type === "error" || !result.data) return null;

  const weight = weights[agentId] || 0.05;
  const confidence = result.confidence || 0.5;
  const keyFindings: string[] = [];
  let direction: SignalDirection = "neutral";
  let strength = 0;

  switch (agentId) {
    case "market-analyst": {
      const indicators = result.data.indicators;
      if (indicators?.macd) {
        const macdDir = indicators.macd.trend || indicators.macd.signal || indicators.macd.direction || "neutral";
        if (macdDir === "bullish" || macdDir === "up") { direction = "long"; strength += 0.3; }
        else if (macdDir === "bearish" || macdDir === "down") { direction = "short"; strength += 0.3; }
        keyFindings.push(`MACD: ${macdDir}`);
      }
      if (indicators?.rsi !== undefined) {
        const rsiVal = typeof indicators.rsi === "number" ? indicators.rsi : indicators.rsi?.value ?? null;
        if (rsiVal !== null && !isNaN(rsiVal)) {
          if (rsiVal < 30) { if (direction !== "short") { direction = "long"; } strength += 0.2; keyFindings.push(`RSI超卖: ${rsiVal.toFixed(1)}`); }
          else if (rsiVal > 70) { if (direction !== "long") { direction = "short"; } strength += 0.2; keyFindings.push(`RSI超买: ${rsiVal.toFixed(1)}`); }
          else { keyFindings.push(`RSI中性: ${rsiVal.toFixed(1)}`); }
        }
      }
      if (indicators?.trend) {
        if (indicators.trend === "up" || indicators.trend === "bullish") {
          direction = direction === "short" ? "neutral" : "long";
          strength += 0.25;
        } else if (indicators.trend === "down" || indicators.trend === "bearish") {
          direction = direction === "long" ? "neutral" : "short";
          strength += 0.25;
        }
        keyFindings.push(`趋势: ${indicators.trend}`);
      }
      if (result.data.patterns?.length > 0) {
        const patterns = result.data.patterns;
        for (const p of patterns.slice(0, 2)) {
          if (p.direction === "bullish") { if (direction !== "short") { direction = "long"; strength += 0.1; } }
          else if (p.direction === "bearish") { if (direction !== "long") { direction = "short"; strength += 0.1; } }
        }
        keyFindings.push(`形态: ${patterns.length}个`);
      }
      break;
    }

    case "onchain-analyst": {
      const data = result.data;
      // whale-tracking 返回 { whaleWallets: [{ activity }], netFlow }
      const whaleWallets = data.whaleWallets || [];
      const netFlow = data.netFlow ?? data.netflow;
      
      if (netFlow === "inflow" || netFlow > 0) {
        direction = "long"; strength = 0.5;
        keyFindings.push("链上资金流入");
      } else if (netFlow === "outflow" || netFlow < 0) {
        direction = "short"; strength = 0.5;
        keyFindings.push("链上资金流出");
      }
      
      for (const whale of whaleWallets) {
        if (whale.activity === "accumulating" || whale.activity === "buying") {
          if (direction !== "short") { direction = "long"; strength += 0.2; }
          keyFindings.push("巨鲸积累");
          break;
        } else if (whale.activity === "distributing" || whale.activity === "selling") {
          if (direction !== "long") { direction = "short"; strength += 0.2; }
          keyFindings.push("巨鲸派发");
          break;
        }
      }
      
      if (data.fundingRate !== undefined) {
        if (data.fundingRate > 0.01) { if (direction !== "short") { direction = "long"; strength += 0.1; } keyFindings.push(`资金费正: ${(data.fundingRate*100).toFixed(2)}%`); }
        else if (data.fundingRate < -0.01) { if (direction !== "long") { direction = "short"; strength += 0.1; } keyFindings.push(`资金费负: ${(data.fundingRate*100).toFixed(2)}%`); }
      }
      if (keyFindings.length === 0) keyFindings.push("链上数据中性");
      break;
    }

    case "news-analyst": {
      const data = result.data;
      const summary = data.summary || {};
      const bullishNews = data.bullishNews ?? summary.positive;
      const bearishNews = data.bearishNews ?? summary.negative;
      const totalCount = data.totalArticles ?? data.total;
      
      if (bullishNews !== undefined && bearishNews !== undefined) {
        const diff = bullishNews - bearishNews;
        if (diff > 10) { direction = "long"; strength = 0.4; keyFindings.push(`利多新闻主导: ${bullishNews.toFixed(0)}%`); }
        else if (diff < -10) { direction = "short"; strength = 0.4; keyFindings.push(`利空新闻主导: ${bearishNews.toFixed(0)}%`); }
        else { keyFindings.push("新闻面中性"); }
      }
      
      const marketImpact = data.marketImpact ?? data.trend;
      if (marketImpact) {
        if (marketImpact === "bullish" || marketImpact === "improving" || marketImpact === "up") { if (direction !== "short") { direction = "long"; strength += 0.2; } }
        else if (marketImpact === "bearish" || marketImpact === "deteriorating" || marketImpact === "down") { if (direction !== "long") { direction = "short"; strength += 0.2; } }
      }
      
      if (totalCount) keyFindings.push(`共${totalCount}条新闻`);
      break;
    }

    case "sentiment-analyst": {
      const data = result.data;
      // fng-index 任务返回 { value, classification, trend }
      // composite-score 任务返回 { compositeScore, classification }
      const fngValue = data.value ?? data.fearGreedIndex;
      const score = data.compositeScore ?? data.score ?? data.sentimentScore ?? (fngValue !== undefined ? fngValue / 100 : 0.5);
      if (score > 0.6) { direction = "long"; strength = 0.6; keyFindings.push(`情绪乐观: ${(score*100).toFixed(0)}%`); }
      else if (score < 0.4) { direction = "short"; strength = 0.6; keyFindings.push(`情绪悲观: ${(score*100).toFixed(0)}%`); }
      else { keyFindings.push(`情绪中性: ${(score*100).toFixed(0)}%`); }
      if (fngValue !== undefined) {
        if (fngValue < 25) { if (direction !== "short") { direction = "long"; strength += 0.15; } keyFindings.push(`极度恐惧: ${fngValue}`); }
        else if (fngValue > 75) { if (direction !== "long") { direction = "short"; strength += 0.15; } keyFindings.push(`极度贪婪: ${fngValue}`); }
        else keyFindings.push(`恐慌贪婪: ${fngValue}`);
      }
      if (data.classification) keyFindings.push(`情绪分类: ${data.classification}`);
      break;
    }

    case "macro-analyst": {
      const data = result.data;
      const fedPolicy = data.fedPolicy || {};
      const inflation = data.inflation || {};
      const gdp = data.gdp || {};
      
      let score = 0;
      if (fedPolicy.rateCutProbability !== undefined) {
        if (fedPolicy.rateCutProbability > 60) { score += 2; keyFindings.push("降息概率高"); }
        else if (fedPolicy.rateCutProbability < 30) { score -= 1; keyFindings.push("降息概率低"); }
      }
      if (inflation.trend === "decreasing") { score += 1; keyFindings.push("通胀下降"); }
      else if (inflation.trend === "increasing") { score -= 1; keyFindings.push("通胀上升"); }
      if (gdp.annualGrowth !== undefined) {
        if (gdp.annualGrowth > 2) { score += 1; keyFindings.push("GDP增长强劲"); }
        else if (gdp.annualGrowth < 0) { score -= 2; keyFindings.push("GDP负增长"); }
      }
      if (data.treasuryYields?.yieldCurveInverted) { score -= 1; keyFindings.push("收益率曲线倒挂"); }
      
      if (score >= 2) { direction = "long"; strength = 0.4; keyFindings.unshift("宏观面利好"); }
      else if (score <= -1) { direction = "short"; strength = 0.3; keyFindings.unshift("宏观面利空"); }
      else { keyFindings.unshift("宏观面中性"); }
      break;
    }

    case "strategy-researcher": {
      const data = result.data;
      const recommended = data.recommendedStrategy;
      if (recommended) {
        const strategyType = recommended.type || recommended.id;
        const expectedWinRate = recommended.expectedWinRate ? recommended.expectedWinRate / 100 : 0.5;
        if (strategyType === "trend-following" || strategyType === "momentum" || strategyType === "breakout") {
          direction = "long";
          strength = Math.min(0.5, 0.2 + expectedWinRate - 0.5);
          keyFindings.push("策略建议顺势做多");
        } else if (strategyType === "mean-reversion") {
          direction = "neutral";
          strength = 0.2;
          keyFindings.push("策略建议区间操作");
        } else {
          keyFindings.push("策略观望");
        }
        keyFindings.push(`策略: ${recommended.name || strategyType}`);
      } else if (data.signal === "long" || data.recommendation === "buy") {
        direction = "long"; strength = 0.5; keyFindings.push("策略建议买入");
      } else if (data.signal === "short" || data.recommendation === "sell") {
        direction = "short"; strength = 0.5; keyFindings.push("策略建议卖出");
      } else {
        keyFindings.push("策略观望");
      }
      break;
    }

    case "backtest-agent": {
      const data = result.data;
      const winRateNum = typeof data.winRate === "number" ? data.winRate : parseFloat(data.winRate) / 100;
      const totalReturnNum = typeof data.totalReturn === "number" ? data.totalReturn : parseFloat(data.totalReturn) / 100;
      const maxDrawdownNum = typeof data.maxDrawdown === "number" ? data.maxDrawdown : parseFloat(data.maxDrawdown) / 100;
      const sharpeNum = typeof data.sharpeRatio === "number" ? data.sharpeRatio : parseFloat(data.sharpeRatio);
      
      if (!isNaN(winRateNum) && winRateNum > 0.55 && !isNaN(totalReturnNum) && totalReturnNum > 0) {
        direction = "long";
        strength = Math.min(0.5, winRateNum - 0.4);
        keyFindings.push(`回测胜率: ${(winRateNum*100).toFixed(1)}%`);
        keyFindings.push(`总收益: ${(totalReturnNum*100).toFixed(1)}%`);
      } else if (!isNaN(winRateNum) && winRateNum < 0.45) {
        direction = "short";
        strength = Math.min(0.5, 0.6 - winRateNum);
        keyFindings.push(`回测胜率低: ${(winRateNum*100).toFixed(1)}%`);
      } else {
        keyFindings.push("回测结果中性");
      }
      if (!isNaN(maxDrawdownNum)) keyFindings.push(`最大回撤: ${(maxDrawdownNum*100).toFixed(1)}%`);
      if (!isNaN(sharpeNum)) keyFindings.push(`夏普比: ${sharpeNum.toFixed(2)}`);
      break;
    }

    case "risk-manager": {
      const data = result.data;
      if (data.riskLevel === "high" || data.overallRisk === "high") {
        keyFindings.push("高风险警示");
        strength = 0;
      } else if (data.riskLevel === "low" || data.overallRisk === "low") {
        keyFindings.push("风险可控");
        strength = 0.2;
      } else {
        keyFindings.push("风险中等");
      }
      if (data.maxPositionSize) keyFindings.push(`最大仓位: ${data.maxPositionSize}`);
      if (data.recommendedLeverage) keyFindings.push(`建议杠杆: ${data.recommendedLeverage}x`);
      break;
    }

    case "investment-advisor": {
      const data = result.data;
      if (data.action === "buy" || data.recommendation === "accumulate") {
        direction = "long"; strength = 0.4; keyFindings.push("建议买入/增持");
      } else if (data.action === "sell" || data.recommendation === "reduce") {
        direction = "short"; strength = 0.4; keyFindings.push("建议卖出/减持");
      } else {
        keyFindings.push("建议观望");
      }
      if (data.positionSize) keyFindings.push(`仓位: ${data.positionSize}`);
      if (data.timeHorizon) keyFindings.push(`周期: ${data.timeHorizon}`);
      break;
    }

    case "llm-analyst": {
      const data = result.data;
      if (data.direction === "bullish") {
        direction = "long";
        strength = data.strength ? data.strength / 100 : 0.5;
        keyFindings.push("AI看多看涨");
      } else if (data.direction === "bearish") {
        direction = "short";
        strength = data.strength ? data.strength / 100 : 0.5;
        keyFindings.push("AI看空看跌");
      } else {
        keyFindings.push("AI观点中性");
      }
      if (data.riskLevel) keyFindings.push(`风险: ${data.riskLevel}`);
      if (data.suggestedAction) keyFindings.push(`建议: ${data.suggestedAction}`);
      break;
    }

    default:
      keyFindings.push("已检查");
      break;
  }

  return {
    agentId,
    agentName: AGENT_NAMES[agentId] || agentId,
    direction,
    strength: Math.min(1, Math.max(0, strength)),
    confidence,
    weight,
    keyFindings: keyFindings.slice(0, 3),
  };
}

function generateSummary(
  direction: SignalDirection,
  strength: number,
  confidence: number,
  signals: AgentSignal[],
  riskLevel: string,
): string {
  const parts: string[] = [];

  if (direction === "long") {
    parts.push(`综合信号：看涨（强度${(strength*100).toFixed(0)}%）`);
  } else if (direction === "short") {
    parts.push(`综合信号：看跌（强度${(strength*100).toFixed(0)}%）`);
  } else {
    parts.push("综合信号：观望");
  }

  const bullish = signals.filter((s) => s.direction === "long").length;
  const bearish = signals.filter((s) => s.direction === "short").length;
  const neutral = signals.filter((s) => s.direction === "neutral").length;
  parts.push(`${bullish}多 / ${bearish}空 / ${neutral}中`);

  parts.push(`置信度${(confidence*100).toFixed(0)}%，风险${riskLevel === "low" ? "低" : riskLevel === "high" ? "高" : "中"}`);

  const topBullish = signals.filter((s) => s.direction === "long").sort((a, b) => b.strength - a.strength)[0];
  const topBearish = signals.filter((s) => s.direction === "short").sort((a, b) => b.strength - a.strength)[0];

  if (direction === "long" && topBullish) {
    parts.push(`主要依据：${topBullish.agentName}`);
  } else if (direction === "short" && topBearish) {
    parts.push(`主要依据：${topBearish.agentName}`);
  }

  return parts.join("；");
}

export type StrategyPreset = "conservative" | "moderate" | "aggressive" | "trend" | "reversal";

export const STRATEGY_PRESETS: Record<StrategyPreset, {
  name: string;
  description: string;
  threshold: number;
  minStrength: number;
  minConfidence: number;
  leverage: number;
  weights: Partial<Record<AgentId, number>>;
}> = {
  conservative: {
    name: "保守型",
    description: "高置信度+低杠杆，只做高胜率机会",
    threshold: 0.75,
    minStrength: 0.3,
    minConfidence: 0.75,
    leverage: 2,
    weights: {
      "market-analyst": 0.3,
      "risk-manager": 0.12,
      "backtest-agent": 0.12,
    },
  },
  moderate: {
    name: "稳健型",
    description: "平衡收益与风险，适合大多数情况",
    threshold: 0.6,
    minStrength: 0.2,
    minConfidence: 0.65,
    leverage: 3,
    weights: {},
  },
  aggressive: {
    name: "激进型",
    description: "低门槛高杠杆，捕捉更多机会",
    threshold: 0.45,
    minStrength: 0.1,
    minConfidence: 0.5,
    leverage: 5,
    weights: {
      "sentiment-analyst": 0.18,
      "news-analyst": 0.15,
      "strategy-researcher": 0.15,
    },
  },
  trend: {
    name: "趋势跟踪",
    description: "技术面主导，顺势而为",
    threshold: 0.55,
    minStrength: 0.25,
    minConfidence: 0.6,
    leverage: 4,
    weights: {
      "market-analyst": 0.35,
      "onchain-analyst": 0.2,
      "macro-analyst": 0.1,
    },
  },
  reversal: {
    name: "反转交易",
    description: "情绪+基本面，抄底摸顶",
    threshold: 0.55,
    minStrength: 0.3,
    minConfidence: 0.6,
    leverage: 2,
    weights: {
      "sentiment-analyst": 0.25,
      "news-analyst": 0.2,
      "market-analyst": 0.2,
      "onchain-analyst": 0.15,
    },
  },
};
