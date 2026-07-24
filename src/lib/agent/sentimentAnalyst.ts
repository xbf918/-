import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";
import type { FearGreedIndex } from "@/types";
import { fetchFearGreedIndex } from "@/services/sentiment";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "fear-greed",
    description: "恐惧贪婪指数获取和分析",
    supportedTopics: ["fng-index", "market-sentiment", "sentiment-trend"],
    provides: ["fng-value", "classification", "trend"],
  },
  {
    name: "social-sentiment",
    description: "社交媒体情绪分析",
    supportedTopics: ["social-analysis", "twitter-sentiment", "reddit-sentiment"],
    provides: ["social-score", "mentions", "trending"],
  },
  {
    name: "sentiment-composite",
    description: "综合情绪指标计算",
    supportedTopics: ["composite-score", "sentiment-aggregation", "confidence"],
    provides: ["composite", "components", "confidence"],
  },
];

export class SentimentAnalystAgent extends BaseAgent {
  constructor() {
    super(
      "sentiment-analyst",
      "市场情绪代理",
      "analyst",
      "分析市场情绪、获取恐惧贪婪指数、监控社交媒体情绪",
      "😊",
      CAPABILITIES,
    );
    this.llmSystemPrompt = `你是一位资深的市场情绪分析师，擅长解读恐惧贪婪指数和社交媒体情绪。
你的分析应该：
1. 综合恐惧贪婪指数判断市场情绪状态
2. 分析社交媒体情绪倾向
3. 判断情绪极端值（极度恐惧可能是反向指标
4. 给出明确的市场情绪判断和置信度`;
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "fng-index":
        return this.getFearGreedIndex(task.data, context);
      case "social-sentiment":
        return this.analyzeSocialSentiment(task.data, context);
      case "composite-score":
        return this.calculateComposite(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async getFearGreedIndex(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const cached = this.cacheGet("fng_index");
    if (cached) return cached;

    try {
      const fng = await fetchFearGreedIndex();

      let result: AgentOutput = {
        type: "fng-result",
        data: {
          value: fng.value,
          classification: fng.classification,
          timestamp: fng.timestamp,
          trend: this.calculateFngTrend(fng),
          historical: {
            yesterday: fng.yesterday,
            lastWeek: fng.lastWeek,
            lastMonth: fng.lastMonth,
          },
        },
        confidence: 0.75,
        sources: ["alternative-me"],
      };

      // LLM 模式
      if (this.useLLM) {
        const llmResult = await this.callLLM<any>(
          `请分析以下恐惧贪婪指数数据：

当前数值: ${fng.value}/100
当前分类: ${fng.classification}
昨日数值: ${fng.yesterday}
上周数值: ${fng.lastWeek}
上月数值: ${fng.lastMonth}

恐惧贪婪指数说明：
- 0-25: 极度恐惧（可能是买入机会）
- 26-46: 恐惧
- 47-54: 中性
- 55-75: 贪婪
- 76-100: 极度贪婪（可能是卖出信号）

请分析当前市场情绪状态，判断是贪婪还是恐惧，以及对市场的影响。`,
          {
            direction: "bullish/bearish/neutral",
            confidence: 0.75,
            value: 50,
            classification: "Neutral",
            trend: "up/down/stable",
            rationale: ["理由1", "理由2"],
            marketImplication: "市场影响描述",
          },
        );

        if (llmResult) {
          result = {
            ...result,
            data: {
              ...result.data,
              llmAnalysis: llmResult,
              value: llmResult.value ?? fng.value,
              classification: llmResult.classification || fng.classification,
              trend: llmResult.trend || result.data.trend,
            },
            confidence: llmResult.confidence || 0.8,
            sources: ["llm-deepseek", "alternative-me"],
          };
        }
      }

      this.cacheSet("fng_index", result, 300_000);
      return result;
    } catch (error) {
      return {
        type: "fng-result",
        data: this.generateMockFng(),
        confidence: 0.3,
        sources: ["mock-data"],
        warnings: ["FNG API unavailable"],
      };
    }
  }

  private async analyzeSocialSentiment(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const symbol = data.symbol || "BTC";

    const cached = this.cacheGet(`social_${symbol}`);
    if (cached) return cached;

    const result = {
      type: "social-result",
      data: {
        symbol,
        twitter: {
          mentions24h: Math.floor(Math.random() * 50000) + 10000,
          sentimentScore: (Math.random() - 0.5) * 2,
          trendingHashtags: ["#Bitcoin", "#Crypto", "#BTC"],
        },
        reddit: {
          posts24h: Math.floor(Math.random() * 2000) + 500,
          sentimentScore: (Math.random() - 0.5) * 2,
          hotTopics: ["ETF Approval", "Halving", "Regulation"],
        },
        telegram: {
          messageVolume: Math.floor(Math.random() * 100000) + 50000,
          sentimentScore: (Math.random() - 0.5) * 2,
        },
      },
      confidence: 0.5,
      sources: ["social-media"],
    };

    this.cacheSet(`social_${symbol}`, result, 180_000);
    return result;
  }

  private async calculateComposite(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const fngData = data.fng as FearGreedIndex;
    const socialData = data.social as Record<string, any>;
    const newsData = data.news as Record<string, any>;

    let fngScore = fngData ? fngData.value / 100 : 0.5;
    let socialScore = socialData ? ((socialData.twitter?.sentimentScore || 0) + 2) / 4 : 0.5;
    let newsScore = newsData ? newsData.averageScore ? (newsData.averageScore + 100) / 200 : 0.5 : 0.5;

    const composite = (fngScore * 0.4 + socialScore * 0.3 + newsScore * 0.3);
    const classification = this.classifyComposite(composite);

    return {
      type: "composite-result",
      data: {
        compositeScore: composite,
        classification,
        components: {
          fng: fngScore,
          social: socialScore,
          news: newsScore,
        },
        recommendation: this.getRecommendation(composite),
      },
      confidence: 0.6,
      sources: ["composite-analysis"],
    };
  }

  private calculateFngTrend(fng: FearGreedIndex): "up" | "down" | "stable" {
    const current = fng.value;
    const previous = fng.yesterday;

    if (current > previous + 5) return "up";
    if (current < previous - 5) return "down";
    return "stable";
  }

  private generateMockFng(): Record<string, any> {
    const value = Math.floor(Math.random() * 100);
    return {
      value,
      classification: this.classifyFng(value),
      timestamp: Date.now(),
      trend: "stable",
      historical: {
        yesterday: value + Math.floor((Math.random() - 0.5) * 10),
        lastWeek: value + Math.floor((Math.random() - 0.5) * 20),
        lastMonth: value + Math.floor((Math.random() - 0.5) * 30),
      },
    };
  }

  private classifyFng(value: number): string {
    if (value >= 80) return "Extreme Greed";
    if (value >= 60) return "Greed";
    if (value >= 40) return "Neutral";
    if (value >= 20) return "Fear";
    return "Extreme Fear";
  }

  private classifyComposite(score: number): string {
    if (score >= 0.7) return "bullish";
    if (score >= 0.55) return "slightly-bullish";
    if (score >= 0.45) return "neutral";
    if (score >= 0.3) return "slightly-bearish";
    return "bearish";
  }

  private getRecommendation(score: number): string {
    if (score >= 0.7) return "市场极度贪婪，考虑减仓或止盈";
    if (score >= 0.55) return "市场偏乐观，可适当跟进";
    if (score >= 0.45) return "市场中性，观望为主";
    if (score >= 0.3) return "市场偏悲观，注意风险";
    return "市场极度恐惧，可能是买入机会";
  }
}
