import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";
import type { Candle } from "@/types";
import { aiOrchestrator } from "@/lib/ai/orchestrator";
import { macd, summarizeMacd } from "@/lib/indicators/macd";
import { detectChartPatterns } from "@/lib/indicators/chartPatterns";
import { findSupportResistance } from "@/lib/indicators/supportResistance";
import { rsi } from "@/lib/indicators/rsi";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "technical-analysis",
    description: "技术指标分析和图表模式识别",
    supportedTopics: ["ta-analysis", "pattern-detection", "support-resistance"],
    provides: ["ta-signals", "patterns", "levels"],
  },
  {
    name: "market-prediction",
    description: "基于AI模型的市场走势预测",
    supportedTopics: ["predict", "forecast", "trend-analysis"],
    provides: ["prediction", "confidence", "rationale"],
  },
  {
    name: "regime-detection",
    description: "市场状态识别（趋势/震荡/高波动）",
    supportedTopics: ["regime", "market-state", "volatility"],
    provides: ["regime", "features", "adjustments"],
  },
];

export class MarketAnalystAgent extends BaseAgent {
  constructor() {
    super(
      "market-analyst",
      "市场分析代理",
      "analyst",
      "提供技术分析、图表模式识别和市场预测",
      "📈",
      CAPABILITIES,
    );
    this.llmSystemPrompt = `你是一位资深的加密货币技术分析师，擅长使用MACD、RSI、KDJ、布林带等技术指标，以及图表形态识别来分析市场趋势。
你的分析应该：
1. 客观、专业，基于数据而非情绪
2. 给出明确的多空判断和置信度
3. 识别关键的支撑位和阻力位
4. 注意风险提示`;
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "ta-analysis":
        return this.analyzeTechnical(task.data, context);
      case "predict":
        return this.predictMarket(task.data, context);
      case "pattern-detection":
        return this.detectChartPatterns(task.data, context);
      case "support-resistance":
        return this.findLevels(task.data, context);
      case "regime-detection":
        return this.detectRegime(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async analyzeTechnical(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const candles = data.candles as Candle[];
    if (!candles || candles.length === 0) {
      return {
        type: "error",
        data: { error: "No candles provided" },
        confidence: 0,
      };
    }

    const currentPrice = candles[candles.length - 1]?.close || 0;

    // 优先使用传入的预计算技术指标结果，避免重复计算
    const ti = data.techIndicators || {};
    const macdSummary = ti.macdSummary || summarizeMacd(macd(candles));
    const rsiValues = ti.rsiSummary ? [ti.rsiSummary] : rsi(candles);
    const patterns = ti.patternSummary?.patterns || detectChartPatterns(candles);
    const levels = ti.supportResistance || findSupportResistance(candles, currentPrice);

    const supportLevels = levels.filter((l: any) => l.type === "support");
    const resistanceLevels = levels.filter((l: any) => l.type === "resistance");

    // 整合信号评分结论
    const signalScore = ti.signalScore;

    // LLM 模式：调用 DeepSeek 进行深度技术分析
    if (this.useLLM) {
      const llmResult = await this.callLLM<any>(
        `请对以下加密货币数据进行专业的技术分析：

【交易对】BTC/USDT
【当前价格】$${currentPrice.toLocaleString()}
【K线数量】${candles.length}根

【技术指标摘要】
- MACD趋势: ${macdSummary?.trend || "N/A"}
- MACD信号: ${macdSummary?.lastCrossover?.crossover || "N/A"}
- RSI值: ${Array.isArray(rsiValues) ? rsiValues[rsiValues.length - 1] : (rsiValues as any)?.value || "N/A"}
- RSI区域: ${ti.rsiSummary?.zone || "N/A"}

【信号引擎结论】
- 方向: ${signalScore?.direction || "N/A"}
- 综合评分: ${signalScore?.total || "N/A"}
- 置信度: ${signalScore?.confidence || "N/A"}%

【支撑位】${supportLevels.slice(0, 3).map((s: any) => "$" + s.price.toLocaleString()).join(", ")}
【阻力位】${resistanceLevels.slice(0, 3).map((r: any) => "$" + r.price.toLocaleString()).join(", ")}

【图表形态】${patterns.slice(0, 3).map((p: any) => p.type).join(", ")}

请进行综合技术分析，给出明确的多空判断。`,
        {
          direction: "bullish/bearish/neutral",
          confidence: 0.75,
          trend: "up/down/ranging",
          supportLevels: ["价格1", "价格2"],
          resistanceLevels: ["价格1", "价格2"],
          keyIndicators: { macd: "MACD分析结论", rsi: "RSI分析结论" },
          patterns: ["形态1", "形态2"],
          rationale: ["理由1", "理由2", "理由3"],
          riskLevel: "low/medium/high",
        },
      );

      if (llmResult) {
        return {
          type: "ta-analysis-result",
          data: {
            indicators: {
              macd: macdSummary,
              rsi: Array.isArray(rsiValues) ? rsiValues[rsiValues.length - 1] : rsiValues,
              price: currentPrice,
              volatility: this.calculateVolatility(candles),
              trend: llmResult.trend || signalScore?.direction || this.detectTrend(candles),
              signalScore,
              llmAnalysis: llmResult,
            },
            patterns,
            supportLevels,
            resistanceLevels,
            llmRationale: llmResult.rationale,
          },
          confidence: llmResult.confidence || 0.8,
          sources: ["llm-deepseek", "macd", "rsi", "chart-patterns", "support-resistance"],
        };
      }
    }

    return {
      type: "ta-analysis-result",
      data: {
        indicators: {
          macd: macdSummary,
          rsi: Array.isArray(rsiValues) ? rsiValues[rsiValues.length - 1] : rsiValues,
          price: currentPrice,
          volatility: this.calculateVolatility(candles),
          trend: signalScore?.direction || this.detectTrend(candles),
          signalScore: signalScore
            ? { direction: signalScore.direction, total: signalScore.total, confidence: signalScore.confidence }
            : undefined,
        },
        patterns: patterns.slice(0, 5),
        supportLevels: supportLevels.slice(0, 5),
        resistanceLevels: resistanceLevels.slice(0, 5),
      },
      confidence: signalScore ? Math.min(0.85, 0.75 + signalScore.confidence / 1000) : 0.75,
      sources: ["macd", "rsi", "chart-patterns", "support-resistance", "signal-engine"],
    };
  }

  private async predictMarket(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const features = data.features as number[];
    const contextText = data.context as string;

    if (!features || features.length === 0) {
      return {
        type: "error",
        data: { error: "No features provided" },
        confidence: 0,
      };
    }

    const prediction = aiOrchestrator.predict(features, contextText);

    return {
      type: "prediction-result",
      data: {
        direction: prediction.direction,
        probability: prediction.probability,
        confidence: prediction.confidence,
        marketRegime: prediction.marketRegime,
        modelScores: prediction.modelScores,
        rationale: prediction.rationale,
        warning: prediction.warning,
      },
      confidence: prediction.confidence,
      sources: ["ensemble-model", "hmm", "bayesian-network"],
      warnings: prediction.warning ? [prediction.warning] : undefined,
    };
  }

  private async detectChartPatterns(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const candles = data.candles as Candle[];
    if (!candles || candles.length === 0) {
      return {
        type: "error",
        data: { error: "No candles provided" },
        confidence: 0,
      };
    }

    const patterns = detectChartPatterns(candles);

    return {
      type: "patterns-result",
      data: {
        patterns: patterns.slice(0, 10),
        totalCount: patterns.length,
      },
      confidence: 0.65,
      sources: ["chart-patterns"],
    };
  }

  private async findLevels(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const candles = data.candles as Candle[];
    if (!candles || candles.length === 0) {
      return {
        type: "error",
        data: { error: "No candles provided" },
        confidence: 0,
      };
    }

    const currentPrice = candles[candles.length - 1]?.close || 0;
    const levels = findSupportResistance(candles, currentPrice);

    const support = levels.filter((l) => l.type === "support");
    const resistance = levels.filter((l) => l.type === "resistance");

    return {
      type: "levels-result",
      data: {
        support: support.slice(0, 10),
        resistance: resistance.slice(0, 10),
        pivotPoints: this.calculatePivotPoints(candles),
      },
      confidence: 0.7,
      sources: ["support-resistance"],
    };
  }

  private async detectRegime(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const features = data.features as number[];
    if (!features || features.length === 0) {
      return {
        type: "error",
        data: { error: "No features provided" },
        confidence: 0,
      };
    }

    const prediction = aiOrchestrator.predict(features);

    return {
      type: "regime-result",
      data: {
        regime: prediction.marketRegime,
        features: {
          trendStrength: features[0],
          volatility: features[1],
          volume: features[2],
        },
      },
      confidence: 0.6,
      sources: ["hmm"],
    };
  }

  private calculateVolatility(candles: Candle[]): number {
    if (candles.length < 20) return 0;
    const recent = candles.slice(-20);
    const returns = recent.map((c, i) => i > 0 ? (c.close - recent[i - 1].close) / recent[i - 1].close : 0);
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(24 * 365);
  }

  private detectTrend(candles: Candle[]): "up" | "down" | "sideways" {
    if (candles.length < 50) return "sideways";
    const recent = candles.slice(-50);
    const prices = recent.map((c) => c.close);
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = prices.length;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgPrice = sumY / n;
    const trendStrength = Math.abs(slope / avgPrice);
    
    if (trendStrength > 0.001) return slope > 0 ? "up" : "down";
    return "sideways";
  }

  private calculatePivotPoints(candles: Candle[]): any[] {
    if (candles.length < 2) return [];
    const prev = candles[candles.length - 2];
    const high = prev.high;
    const low = prev.low;
    const close = prev.close;
    
    const pivot = (high + low + close) / 3;
    const r1 = 2 * pivot - low;
    const s1 = 2 * pivot - high;
    const r2 = pivot + (high - low);
    const s2 = pivot - (high - low);
    
    return [
      { level: "R2", price: r2, type: "resistance" },
      { level: "R1", price: r1, type: "resistance" },
      { level: "Pivot", price: pivot, type: "pivot" },
      { level: "S1", price: s1, type: "support" },
      { level: "S2", price: s2, type: "support" },
    ];
  }
}