import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";
import type { NewsItem } from "@/types";
import { fetchCryptoNews } from "@/services/news";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "news-aggregation",
    description: "多源新闻聚合和过滤",
    supportedTopics: ["fetch-news", "news-filter", "news-summary"],
    provides: ["news-items", "filtered-news", "summary"],
  },
  {
    name: "sentiment-analysis",
    description: "新闻情绪分析",
    supportedTopics: ["sentiment", "news-sentiment", "mood-analysis"],
    provides: ["sentiment-score", "sentiment-trend", "impact"],
  },
  {
    name: "event-detection",
    description: "重要事件和公告检测",
    supportedTopics: ["event-detection", "announcement", "breaking-news"],
    provides: ["events", "urgent-news", "impact-assessment"],
  },
];

export class NewsAnalystAgent extends BaseAgent {
  constructor() {
    super(
      "news-analyst",
      "新闻分析代理",
      "analyst",
      "聚合加密货币新闻、分析情绪、检测重要事件",
      "📰",
      CAPABILITIES,
    );
    this.llmSystemPrompt = `你是一位资深的加密货币新闻分析师，擅长从新闻中提取情绪倾向和关键事件。
你的分析应该：
1. 客观评估新闻的正面/负面情绪
2. 识别重要的市场影响事件
3. 判断新闻对价格的潜在影响
4. 给出明确的情绪倾向和置信度`;
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "fetch-news":
        return this.fetchNews(task.data, context);
      case "sentiment-analysis":
        return this.analyzeSentiment(task.data, context);
      case "event-detection":
        return this.detectEvents(task.data, context);
      case "news-summary":
        return this.summarizeNews(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async fetchNews(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const categories = data.categories || "BTC,ETH";
    const limit = data.limit || 20;

    const cached = this.cacheGet(`news_${categories}_${limit}`);
    if (cached) return cached;

    try {
      const news = await fetchCryptoNews(categories, limit);

      const result = {
        type: "news-result",
        data: {
          news: news.slice(0, limit),
          total: news.length,
          categories,
        },
        confidence: 0.8,
        sources: ["cointelegraph", "coindesk", "decrypt"],
      };

      this.cacheSet(`news_${categories}_${limit}`, result, 300_000);
      return result;
    } catch (error) {
      return {
        type: "news-result",
        data: {
          news: this.generateMockNews(limit),
          total: limit,
          categories,
          error: "Failed to fetch real news, using mock data",
        },
        confidence: 0.3,
        sources: ["mock-data"],
        warnings: ["News API unavailable"],
      };
    }
  }

  private async analyzeSentiment(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const news = data.news as NewsItem[];

    if (!news || news.length === 0) {
      return {
        type: "error",
        data: { error: "No news items provided" },
        confidence: 0,
      };
    }

    const positive = news.filter((n) => n.sentiment === "positive").length;
    const negative = news.filter((n) => n.sentiment === "negative").length;
    const neutral = news.filter((n) => n.sentiment === "neutral").length;
    const total = news.length;

    const avgScore = news.reduce((sum, n) => sum + (n.sentimentScore || 0), 0) / total;
    const sentimentTrend = this.calculateTrend(news);

    let resultData: any = {
      summary: {
        positive: (positive / total) * 100,
        negative: (negative / total) * 100,
        neutral: (neutral / total) * 100,
      },
      averageScore: avgScore,
      trend: sentimentTrend,
      topPositiveNews: news.filter((n) => n.sentiment === "positive").slice(0, 5),
      topNegativeNews: news.filter((n) => n.sentiment === "negative").slice(0, 5),
    };
    let confidence = 0.65;
    let sources = ["sentiment-analysis"];

    // LLM 模式
    if (this.useLLM) {
      const llmResult = await this.callLLM<any>(
        `请分析以下新闻数据的市场情绪：

新闻数量: ${total}条
正面新闻: ${positive}条
负面新闻: ${negative}条
中性新闻: ${neutral}条
平均情绪得分: ${avgScore.toFixed(2)}
情绪趋势: ${sentimentTrend}

最近的新闻标题:
${news.slice(0, 5).map((n, i) => `${i + 1}. [${n.sentiment}] ${n.title}`).join("\n")}

请综合分析新闻情绪对市场的影响，给出明确的多空判断。`,
        {
          direction: "bullish/bearish/neutral",
          confidence: 0.65,
          sentimentScore: 50,
          trend: "up/down/stable",
          keyEvents: ["事件1", "事件2"],
          rationale: ["理由1", "理由2"],
          impactLevel: "low/medium/high",
        },
      );

      if (llmResult) {
        resultData = {
          ...resultData,
          llmAnalysis: llmResult,
          averageScore: llmResult.sentimentScore ?? avgScore,
          trend: llmResult.trend || sentimentTrend,
        };
        confidence = llmResult.confidence || 0.75;
        sources = ["llm-deepseek", "sentiment-analysis"];
      }
    }

    return {
      type: "sentiment-result",
      data: resultData,
      confidence,
      sources,
    };
  }

  private async detectEvents(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const news = data.news as NewsItem[];

    if (!news || news.length === 0) {
      return {
        type: "error",
        data: { error: "No news items provided" },
        confidence: 0,
      };
    }

    const events = this.findEvents(news);

    return {
      type: "events-result",
      data: {
        events: events.slice(0, 5),
        urgentCount: events.filter((e) => e.urgent).length,
      },
      confidence: 0.55,
      sources: ["event-detection"],
    };
  }

  private async summarizeNews(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const news = data.news as NewsItem[];
    const limit = data.summaryLimit || 3;

    if (!news || news.length === 0) {
      return {
        type: "error",
        data: { error: "No news items provided" },
        confidence: 0,
      };
    }

    const topNews = news.slice(0, limit);
    const summary = topNews.map((n, i) => ({
      rank: i + 1,
      title: n.title,
      source: n.source,
      sentiment: n.sentiment,
      timestamp: n.publishedOn,
    }));

    return {
      type: "summary-result",
      data: {
        summary,
        totalNews: news.length,
        timeRange: {
          from: news[news.length - 1]?.publishedOn,
          to: news[0]?.publishedOn,
        },
      },
      confidence: 0.7,
      sources: ["news-summary"],
    };
  }

  private generateMockNews(count: number): NewsItem[] {
    const titles = [
      "Bitcoin Surges to New All-Time High",
      "Ethereum Foundation Releases Major Update",
      "SEC Approves New Bitcoin ETF",
      "Major Exchange Reports Security Breach",
      "Institutional Investors Increase Crypto Holdings",
      "Regulatory Framework Proposed for Digital Assets",
      "DeFi Protocol Suffers Exploit, $50M Lost",
      "Bitcoin Halving Approaches, Miners Prepare",
      "New Layer 2 Solution Launches with Record TVL",
      "Whale Activity Indicates Accumulation Phase",
    ];

    return Array.from({ length: count }, (_, i) => ({
      id: `mock_${i}`,
      title: titles[i % titles.length] + (i > titles.length ? ` #${i}` : ""),
      source: ["Cointelegraph", "CoinDesk", "Decrypt"][i % 3],
      url: `https://example.com/news/${i}`,
      publishedOn: Date.now() - Math.random() * 24 * 3600,
      categories: [["BTC"], ["ETH"], ["DeFi"]][i % 3],
      body: "Mock news content for analysis",
      sentiment: (["positive", "negative", "neutral"][i % 3]) as NewsItem["sentiment"],
      sentimentScore: (Math.random() - 0.5) * 100,
    }));
  }

  private calculateTrend(news: NewsItem[]): "up" | "down" | "stable" {
    const recent = news.slice(0, 5);
    const older = news.slice(-5);
    const recentScore = recent.reduce((sum, n) => sum + (n.sentimentScore || 0), 0) / recent.length;
    const olderScore = older.reduce((sum, n) => sum + (n.sentimentScore || 0), 0) / older.length;

    if (recentScore > olderScore + 10) return "up";
    if (recentScore < olderScore - 10) return "down";
    return "stable";
  }

  private findEvents(news: NewsItem[]): any[] {
    const keywords = ["approve", "approves", "ETF", "halving", "breach", "exploit", "hack", "ban", "lawsuit"];
    const events: any[] = [];

    for (const n of news) {
      const lowerTitle = n.title.toLowerCase();
      const matchedKeyword = keywords.find((k) => lowerTitle.includes(k));
      if (matchedKeyword) {
        events.push({
          title: n.title,
          source: n.source,
          timestamp: n.publishedOn,
          type: matchedKeyword.toUpperCase(),
          urgent: ["breach", "exploit", "hack"].includes(matchedKeyword),
        });
      }
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }
}
