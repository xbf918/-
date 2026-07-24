export interface TechnicalAnalysisInput {
  symbol: string;
  currentPrice: number;
  timeframe: string;
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
    trend: "bullish" | "bearish" | "neutral";
    cross: "golden" | "death" | "none";
  };
  rsi?: {
    value: number;
    condition: "oversold" | "overbought" | "neutral";
  };
  patterns?: Array<{
    type: string;
    name: string;
    confidence: number;
  }>;
  supportLevels?: number[];
  resistanceLevels?: number[];
  recentCandles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export interface SentimentAnalysisInput {
  symbol: string;
  fearGreedIndex?: number;
  newsItems?: Array<{
    title: string;
    source: string;
    sentiment?: "positive" | "negative" | "neutral";
  }>;
  socialSentiment?: number;
  fundingRate?: number;
}

export interface RiskAssessmentInput {
  symbol: string;
  currentPrice: number;
  volatility?: number;
  maxDrawdown?: number;
  positionSize?: number;
  leverage?: number;
  atr?: number;
}

const SYSTEM_PROMPT = `你是一位资深的加密货币交易分析师，擅长技术分析、市场情绪研判和风险管理。
请基于提供的数据给出客观、专业的分析结论。
回答要求：
1. 只分析提供的数据，不做无依据猜测
2. 给出明确的多空判断
3. 说明关键依据
4. 评估风险等级`;

export const PROMPTS = {
  technicalAnalysis: {
    system: `${SYSTEM_PROMPT}\n你专注于技术面分析，包括指标解读、形态识别和支撑阻力位分析。`,
    template: (data: TechnicalAnalysisInput) => `请分析以下技术面数据并给出判断：

【交易对】${data.symbol}
【时间周期】${data.timeframe}
【当前价格】$${data.currentPrice.toLocaleString()}

${data.macd ? `
【MACD指标】
- MACD线: ${data.macd.macd.toFixed(4)}
- 信号线: ${data.macd.signal.toFixed(4)}
- 柱状图: ${data.macd.histogram.toFixed(4)}
- 趋势: ${data.macd.trend === "bullish" ? "看涨" : data.macd.trend === "bearish" ? "看跌" : "中性"}
- 交叉: ${data.macd.cross === "golden" ? "金叉" : data.macd.cross === "death" ? "死叉" : "无"}
` : ""}

${data.rsi ? `
【RSI指标】
- RSI值: ${data.rsi.value.toFixed(2)}
- 状态: ${data.rsi.condition === "oversold" ? "超卖" : data.rsi.condition === "overbought" ? "超买" : "中性"}
` : ""}

${data.patterns && data.patterns.length > 0 ? `
【图表形态】
${data.patterns.map((p) => `- ${p.name} (置信度: ${(p.confidence * 100).toFixed(0)}%)`).join("\n")}
` : ""}

${data.supportLevels && data.supportLevels.length > 0 ? `
【支撑位】
${data.supportLevels.map((s) => `- $${s.toLocaleString()}`).join("\n")}
` : ""}

${data.resistanceLevels && data.resistanceLevels.length > 0 ? `
【阻力位】
${data.resistanceLevels.map((r) => `- $${r.toLocaleString()}`).join("\n")}
` : ""}

${data.recentCandles && data.recentCandles.length > 0 ? `
【最近K线】（最近${data.recentCandles.length}根）
${data.recentCandles.slice(-10).map((c) => `开:${c.open.toFixed(2)} 高:${c.high.toFixed(2)} 低:${c.low.toFixed(2)} 收:${c.close.toFixed(2)} 量:${(c.volume / 1000).toFixed(1)}K`).join("\n")}
` : ""}

请以JSON格式返回分析结果：
{
  "direction": "bullish/bearish/neutral",
  "confidence": 0-1之间的数字,
  "strength": 0-100之间的数字,
  "rationale": ["理由1", "理由2", "理由3"],
  "keyFactors": ["关键因素1", "关键因素2"],
  "riskLevel": "low/medium/high",
  "suggestedAction": "long/short/hold"
}`,
  },

  sentimentAnalysis: {
    system: `${SYSTEM_PROMPT}\n你专注于市场情绪分析，包括恐惧贪婪指数、新闻舆情和社交媒体情绪。`,
    template: (data: SentimentAnalysisInput) => `请分析以下市场情绪数据并给出判断：

【交易对】${data.symbol}

${data.fearGreedIndex !== undefined ? `
【恐惧贪婪指数】${data.fearGreedIndex}/100
- ${data.fearGreedIndex <= 25 ? "极度恐惧" : data.fearGreedIndex <= 45 ? "恐惧" : data.fearGreedIndex <= 55 ? "中性" : data.fearGreedIndex <= 75 ? "贪婪" : "极度贪婪"}
` : ""}

${data.newsItems && data.newsItems.length > 0 ? `
【最新新闻】
${data.newsItems.slice(0, 10).map((n) => `- [${n.source}] ${n.title}`).join("\n")}
` : ""}

${data.socialSentiment !== undefined ? `
【社交媒体情绪】${(data.socialSentiment * 100).toFixed(1)}%（正数看涨，负数看跌）
` : ""}

${data.fundingRate !== undefined ? `
【资金费率】${(data.fundingRate * 100).toFixed(4)}%
- ${data.fundingRate > 0 ? "多头付费（市场偏多）" : "空头付费（市场偏空）"}
` : ""}

请以JSON格式返回分析结果：
{
  "direction": "bullish/bearish/neutral",
  "confidence": 0-1之间的数字,
  "strength": 0-100之间的数字,
  "rationale": ["理由1", "理由2", "理由3"],
  "keyFactors": ["关键因素1", "关键因素2"],
  "riskLevel": "low/medium/high",
  "suggestedAction": "long/short/hold"
}`,
  },

  riskAssessment: {
    system: `${SYSTEM_PROMPT}\n你专注于风险管理，评估交易风险并给出合理的仓位建议。`,
    template: (data: RiskAssessmentInput) => `请评估以下交易风险：

【交易对】${data.symbol}
【当前价格】$${data.currentPrice.toLocaleString()}

${data.volatility !== undefined ? `
【波动率】${(data.volatility * 100).toFixed(2)}%
- ${data.volatility < 0.02 ? "低波动" : data.volatility < 0.05 ? "中等波动" : "高波动"}
` : ""}

${data.maxDrawdown !== undefined ? `
【最大回撤】${(data.maxDrawdown * 100).toFixed(2)}%
` : ""}

${data.atr !== undefined ? `
【ATR（平均真实波幅）】$${data.atr.toFixed(2)}
` : ""}

${data.positionSize !== undefined && data.leverage !== undefined ? `
【仓位信息】
- 仓位大小: $${data.positionSize.toLocaleString()}
- 杠杆: ${data.leverage}x
` : ""}

请以JSON格式返回风险评估结果：
{
  "direction": "bullish/bearish/neutral",
  "confidence": 0-1之间的数字,
  "strength": 0-100之间的数字,
  "rationale": ["风险分析1", "风险分析2", "风险分析3"],
  "keyFactors": ["关键风险因素1", "关键风险因素2"],
  "riskLevel": "low/medium/high",
  "suggestedAction": "long/short/hold",
  "recommendedLeverage": 推荐杠杆倍数,
  "recommendedPositionSize": 建议仓位比例(0-1)
}`,
  },
};

export function buildPrompt(type: keyof typeof PROMPTS, data: any): string {
  return PROMPTS[type].template(data);
}

export function getSystemPrompt(type: keyof typeof PROMPTS): string {
  return PROMPTS[type].system;
}