import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "economic-indicators",
    description: "宏观经济指标分析",
    supportedTopics: ["fed-policy", "inflation", "gdp", "unemployment"],
    provides: ["indicators", "policy-outlook", "impact"],
  },
  {
    name: "correlation-analysis",
    description: "资产相关性分析",
    supportedTopics: ["correlation", "beta", "hedging"],
    provides: ["correlation-matrix", "beta-values", "diversification"],
  },
  {
    name: "global-events",
    description: "全球事件影响评估",
    supportedTopics: ["geopolitics", "regulation", "central-banks"],
    provides: ["event-impact", "risk-assessment", "timeline"],
  },
];

export class MacroAnalystAgent extends BaseAgent {
  constructor() {
    super(
      "macro-analyst",
      "宏观经济代理",
      "analyst",
      "分析宏观经济指标、评估全球事件影响、分析资产相关性",
      "🧠",
      CAPABILITIES,
    );
    this.llmSystemPrompt = `你是一位资深的宏观经济分析师，擅长分析全球经济指标、货币政策和地缘政治事件对加密货币市场的影响。
你的分析应该：
1. 关注美联储政策、通胀、就业等关键宏观指标
2. 评估全球事件对加密市场的潜在影响
3. 分析加密货币与传统资产的相关性
4. 给出明确的宏观判断和对市场的影响方向`;
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "economic-indicators":
        return this.analyzeIndicators(task.data, context);
      case "correlation-analysis":
        return this.analyzeCorrelation(task.data, context);
      case "global-events":
        return this.analyzeGlobalEvents(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async analyzeIndicators(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const cached = this.cacheGet("macro_indicators");
    if (cached) return cached;

    const result = {
      type: "indicators-result",
      data: {
        fedPolicy: {
          currentRate: 5.25 + Math.random() * 0.5,
          nextMeeting: "2026-07-29",
          rateCutProbability: Math.random() * 60 + 20,
          hawkishSentiment: Math.random() > 0.5,
        },
        inflation: {
          cpi: 2.5 + Math.random() * 1,
          coreCpi: 2.8 + Math.random() * 0.5,
          target: 2.0,
          trend: Math.random() > 0.5 ? "decreasing" : "increasing",
        },
        gdp: {
          quarterlyGrowth: (Math.random() - 0.3) * 2,
          annualGrowth: (Math.random() - 0.2) * 3,
          forecast: "stable",
        },
        unemployment: {
          rate: 3.5 + Math.random() * 0.5,
          trend: "stable",
          claims: Math.floor(Math.random() * 100000) + 200000,
        },
        treasuryYields: {
          "1Y": 4.5 + Math.random() * 0.5,
          "5Y": 4.0 + Math.random() * 0.5,
          "10Y": 3.8 + Math.random() * 0.5,
          "30Y": 4.2 + Math.random() * 0.5,
          yieldCurveInverted: Math.random() > 0.3,
        },
      },
      confidence: 0.5,
      sources: ["economic-data"],
    };

    this.cacheSet("macro_indicators", result, 3600_000);
    return result;
  }

  private async analyzeCorrelation(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const symbols = data.symbols || ["BTC", "ETH", "SPX", "Gold", "USD"];

    const cached = this.cacheGet(`correlation_${symbols.join("_")}`);
    if (cached) return cached;

    const matrix = this.generateCorrelationMatrix(symbols);

    const result = {
      type: "correlation-result",
      data: {
        symbols,
        correlationMatrix: matrix,
        betaValues: this.calculateBeta(matrix),
        diversificationAnalysis: this.analyzeDiversification(matrix),
      },
      confidence: 0.55,
      sources: ["correlation-analysis"],
    };

    this.cacheSet(`correlation_${symbols.join("_")}`, result, 7200_000);
    return result;
  }

  private async analyzeGlobalEvents(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const cached = this.cacheGet("global_events");
    if (cached) return cached;

    const events = this.generateGlobalEvents();

    const result = {
      type: "events-result",
      data: {
        events: events.slice(0, 10),
        riskLevel: this.calculateRiskLevel(events),
        timeline: this.generateTimeline(events),
      },
      confidence: 0.45,
      sources: ["global-events"],
    };

    this.cacheSet("global_events", result, 1800_000);
    return result;
  }

  private generateCorrelationMatrix(symbols: string[]): Record<string, Record<string, number>> {
    const matrix: Record<string, Record<string, number>> = {};
    for (const s1 of symbols) {
      matrix[s1] = {};
      for (const s2 of symbols) {
        if (s1 === s2) {
          matrix[s1][s2] = 1;
        } else {
          const baseCorrelation = s1.includes("BTC") && s2.includes("ETH") ? 0.8 :
            s1.includes("SPX") || s2.includes("SPX") ? 0.3 :
            s1.includes("Gold") || s2.includes("Gold") ? 0.2 : 0;
          matrix[s1][s2] = Number((baseCorrelation + (Math.random() - 0.5) * 0.2).toFixed(2));
        }
      }
    }
    return matrix;
  }

  private calculateBeta(matrix: Record<string, Record<string, number>>): Record<string, number> {
    const beta: Record<string, number> = {};
    const symbols = Object.keys(matrix);
    for (const s of symbols) {
      beta[s] = Number((matrix[s]["SPX"] || 0.3 + Math.random() * 0.2).toFixed(2));
    }
    return beta;
  }

  private analyzeDiversification(matrix: Record<string, Record<string, number>>): Record<string, string> {
    const analysis: Record<string, string> = {};
    const symbols = Object.keys(matrix);
    for (const s of symbols) {
      const avgCorrelation = symbols.reduce((sum, other) => sum + Math.abs(matrix[s][other]), 0) / symbols.length;
      if (avgCorrelation < 0.3) {
        analysis[s] = "良好的分散效果";
      } else if (avgCorrelation < 0.5) {
        analysis[s] = "中等分散效果";
      } else {
        analysis[s] = "分散效果有限，考虑其他资产";
      }
    }
    return analysis;
  }

  private generateGlobalEvents(): any[] {
    const events = [
      { title: "FOMC Meeting", date: "2026-07-29", type: "central-bank", impact: "high", status: "upcoming" },
      { title: "US CPI Release", date: "2026-07-15", type: "economic", impact: "medium", status: "upcoming" },
      { title: "Bitcoin ETF Decision", date: "2026-08-01", type: "regulation", impact: "high", status: "upcoming" },
      { title: "EU Crypto Regulation Vote", date: "2026-07-20", type: "regulation", impact: "medium", status: "upcoming" },
      { title: "China Economic Data", date: "2026-07-18", type: "economic", impact: "medium", status: "upcoming" },
      { title: "Geopolitical Tensions", date: "ongoing", type: "geopolitical", impact: "low", status: "ongoing" },
      { title: "Tech Earnings Season", date: "2026-07-22", type: "corporate", impact: "medium", status: "upcoming" },
    ];
    return events;
  }

  private calculateRiskLevel(events: any[]): "low" | "medium" | "high" | "extreme" {
    const highImpactCount = events.filter((e) => e.impact === "high").length;
    if (highImpactCount >= 3) return "extreme";
    if (highImpactCount >= 2) return "high";
    if (highImpactCount >= 1) return "medium";
    return "low";
  }

  private generateTimeline(events: any[]): any[] {
    return events
      .filter((e) => e.status === "upcoming")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }
}
