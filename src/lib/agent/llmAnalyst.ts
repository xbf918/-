import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";
import { llmClient, type LLMAnalysisResult } from "@/lib/llm/llmClient";
import { buildPrompt, getSystemPrompt } from "@/lib/llm/prompts";
import type { Candle } from "@/types";
import { macd, summarizeMacd } from "@/lib/indicators/macd";
import { detectChartPatterns, CHART_PATTERN_NAMES_ZH } from "@/lib/indicators/chartPatterns";
import { findSupportResistance } from "@/lib/indicators/supportResistance";
import { rsi, summarizeRsi } from "@/lib/indicators/rsi";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "llm-technical-analysis",
    description: "AI 大模型技术分析",
    supportedTopics: ["llm-ta", "ai-analysis", "llm-analysis"],
    provides: ["llm-signal", "ai-rationale"],
  },
  {
    name: "llm-sentiment",
    description: "AI 市场情绪分析",
    supportedTopics: ["llm-sentiment"],
    provides: ["sentiment-analysis"],
  },
  {
    name: "llm-risk",
    description: "AI 风险评估",
    supportedTopics: ["llm-risk"],
    provides: ["risk-assessment"],
  },
];

export class LLMAnalystAgent extends BaseAgent {
  private enabled: boolean = false;

  constructor() {
    super(
      "llm-analyst",
      "AI智能分析师",
      "analyst",
      "使用大语言模型进行深度市场分析和决策辅助",
      "🤖",
      CAPABILITIES,
    );
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    if (!this.enabled) {
      return {
        type: "info",
        data: { message: "LLM analysis not enabled" },
        confidence: 0,
      };
    }

    switch (task.type) {
      case "llm-ta":
        return this.analyzeTechnical(task.data, context);
      case "llm-sentiment":
        return this.analyzeSentiment(task.data, context);
      case "llm-risk":
        return this.assessRisk(task.data, context);
      case "llm-comprehensive":
        return this.comprehensiveAnalysis(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async analyzeTechnical(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    try {
      const candles = data.candles as Candle[];
      const symbol = data.symbol || "BTC/USDT";
      const timeframe = data.timeframe || "1h";
      const currentPrice = candles?.[candles.length - 1]?.close || 0;

      if (!candles || candles.length === 0) {
        return {
          type: "error",
          data: { error: "No candles provided" },
          confidence: 0,
        };
      }

      const macdPoints = macd(candles);
      const macdSummary = summarizeMacd(macdPoints);
      const rsiValues = rsi(candles);
      const rsiSummary = summarizeRsi(rsiValues);
      const patterns = detectChartPatterns(candles);
      const levels = findSupportResistance(candles, currentPrice);
      const supportLevels = levels.filter((l) => l.type === "support").slice(0, 3).map((l) => l.price);
      const resistanceLevels = levels.filter((l) => l.type === "resistance").slice(0, 3).map((l) => l.price);

      const prompt = buildPrompt("technicalAnalysis", {
        symbol,
        currentPrice,
        timeframe,
        macd: macdSummary,
        rsi: {
          value: rsiSummary?.value ?? 50,
          condition: rsiSummary?.zone ?? "neutral",
        },
        patterns: patterns.slice(0, 5).map((p) => ({
          type: p.type,
          name: CHART_PATTERN_NAMES_ZH[p.type] || p.type,
          confidence: p.strength / 3,
        })),
        supportLevels,
        resistanceLevels,
        recentCandles: candles.slice(-20).map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
      });

      const result = await llmClient.analyzeAndParse(prompt, getSystemPrompt("technicalAnalysis"));
      return this.formatOutput(result);
    } catch (error: any) {
      return {
        type: "error",
        data: { error: error.message || "LLM analysis failed" },
        confidence: 0,
      };
    }
  }

  private async analyzeSentiment(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    try {
      const symbol = data.symbol || "BTC/USDT";
      const prompt = buildPrompt("sentimentAnalysis", {
        symbol,
        fearGreedIndex: data.fearGreedIndex,
        newsItems: data.newsItems,
        socialSentiment: data.socialSentiment,
        fundingRate: data.fundingRate,
      });

      const result = await llmClient.analyzeAndParse(prompt, getSystemPrompt("sentimentAnalysis"));
      return this.formatOutput(result);
    } catch (error: any) {
      return {
        type: "error",
        data: { error: error.message || "LLM sentiment analysis failed" },
        confidence: 0,
      };
    }
  }

  private async assessRisk(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    try {
      const symbol = data.symbol || "BTC/USDT";
      const currentPrice = data.currentPrice || 0;
      const prompt = buildPrompt("riskAssessment", {
        symbol,
        currentPrice,
        volatility: data.volatility,
        maxDrawdown: data.maxDrawdown,
        positionSize: data.positionSize,
        leverage: data.leverage,
        atr: data.atr,
      });

      const result = await llmClient.analyzeAndParse(prompt, getSystemPrompt("riskAssessment"));
      return this.formatOutput(result);
    } catch (error: any) {
      return {
        type: "error",
        data: { error: error.message || "LLM risk assessment failed" },
        confidence: 0,
      };
    }
  }

  private async comprehensiveAnalysis(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    try {
      const candles = data.candles as Candle[];
      const symbol = data.symbol || "BTC/USDT";
      const timeframe = data.timeframe || "1h";
      const currentPrice = candles?.[candles.length - 1]?.close || 0;

      // 优先使用传入的预计算技术指标结果
      const ti = data.techIndicators || {};
      const macdSummary = ti.macdSummary || summarizeMacd(macd(candles || []));
      const rsiSummary = ti.rsiSummary || summarizeRsi(rsi(candles || []));
      const patterns = ti.patternSummary?.patterns || detectChartPatterns(candles || []);
      const levels = ti.supportResistance || findSupportResistance(candles || [], currentPrice);
      const supportLevels = levels.filter((l: any) => l.type === "support").slice(0, 2).map((l: any) => l.price);
      const resistanceLevels = levels.filter((l: any) => l.type === "resistance").slice(0, 2).map((l: any) => l.price);

      const macdTrend = macdSummary?.trend === "bullish" ? "看涨" : macdSummary?.trend === "bearish" ? "看跌" : "中性";
      const macdCross = macdSummary?.lastCrossover?.crossover === "bullish" ? "金叉" : macdSummary?.lastCrossover?.crossover === "bearish" ? "死叉" : "无交叉";

      // 整合技术指标信号引擎的结论
      const signalScore = ti.signalScore;
      const techSignal = signalScore
        ? `技术指标信号引擎综合判断: ${signalScore.direction === "long" ? "看多" : signalScore.direction === "short" ? "看空" : "观望"} (评分: ${signalScore.total}, 置信度: ${signalScore.confidence}%)`
        : "";

      // 多周期信号
      const timeframeSignals = ti.timeframeSignals;
      const timeframeSummary = timeframeSignals && timeframeSignals.length > 0
        ? `多周期一致性: ${timeframeSignals.filter((s: any) => s.direction === signalScore?.direction).length}/${timeframeSignals.length} 个周期同向`
        : "";

      // 背离信息
      const divergences = ti.divergences || [];
      const divergenceSummary = divergences.length > 0
        ? `发现 ${divergences.length} 处背离: ${divergences.slice(0, 2).map((d: any) => `${d.type}@${d.indicator}`).join(", ")}`
        : "无显著背离";

      const context = `
【交易对】${symbol}
【时间周期】${timeframe}
【当前价格】$${currentPrice.toLocaleString()}

${techSignal}
${timeframeSummary}
${divergenceSummary}

【技术指标】
- MACD: ${macdTrend} (${macdCross})
- RSI: ${rsiSummary?.value?.toFixed(2) || "N/A"} (区域: ${rsiSummary?.zone || "N/A"})
- 形态: ${patterns.slice(0, 3).map((p: any) => CHART_PATTERN_NAMES_ZH[p.type] || p.type).join(", ") || "无明显形态"}
- 支撑位: ${supportLevels.map((s: any) => "$" + s.toLocaleString()).join(", ") || "无"}
- 阻力位: ${resistanceLevels.map((r: any) => "$" + r.toLocaleString()).join(", ") || "无"}

${data.fearGreedIndex !== undefined ? `【情绪指标】恐惧贪婪指数: ${data.fearGreedIndex}/100` : ""}
${data.fundingRate !== undefined ? `【资金费率】${(data.fundingRate * 100).toFixed(4)}%` : ""}

请基于以上数据进行综合分析，**特别要参考技术指标信号引擎的综合判断**，给出多空方向和操作建议。

请以JSON格式返回：
{
  "direction": "bullish/bearish/neutral",
  "confidence": 0-1,
  "strength": 0-100,
  "rationale": ["理由1", "理由2", "理由3"],
  "keyFactors": ["关键因素1", "关键因素2"],
  "riskLevel": "low/medium/high",
  "suggestedAction": "long/short/hold"
}`;

      const result = await llmClient.analyzeAndParse(
        context,
        `你是一位资深加密货币交易分析师，精通技术分析、情绪面分析和风险管理。请基于提供的数据给出客观、专业的综合判断。`,
      );

      return this.formatOutput(result);
    } catch (error: any) {
      return {
        type: "error",
        data: { error: error.message || "LLM comprehensive analysis failed" },
        confidence: 0,
      };
    }
  }

  private formatOutput(result: LLMAnalysisResult): AgentOutput {
    return {
      type: result.direction === "bullish" ? "bullish" : result.direction === "bearish" ? "bearish" : "neutral",
      data: {
        direction: result.direction,
        strength: result.strength,
        rationale: result.rationale,
        keyFactors: result.keyFactors,
        riskLevel: result.riskLevel,
        suggestedAction: result.suggestedAction,
        summary: result.rationale[0] || "",
      },
      confidence: result.confidence,
    };
  }
}

export const llmAnalystAgent = new LLMAnalystAgent();