import type { AgentId, AgentMessage, AgentInput, AgentOutput, TaskContext, AgentStatus } from "./types";
import { MarketAnalystAgent } from "./marketAnalyst";
import { OnchainAnalystAgent } from "./onchainAnalyst";
import { NewsAnalystAgent } from "./newsAnalyst";
import { SentimentAnalystAgent } from "./sentimentAnalyst";
import { MacroAnalystAgent } from "./macroAnalyst";
import { StrategyResearcherAgent } from "./strategyResearcher";
import { BacktestAgent } from "./backtestAgent";
import { RiskManagerAgent } from "./riskManager";
import { InvestmentAdvisorAgent } from "./investmentAdvisor";
import { ExecutionAgent } from "./executionAgent";
import { MonitoringAgent } from "./monitoringAgent";
import { PerformanceAuditorAgent } from "./performanceAuditor";
import { LLMAnalystAgent, llmAnalystAgent } from "./llmAnalyst";
import type { IAgent } from "./types";

export class AgentCoordinator {
  private agents: Map<AgentId, IAgent>;
  private messageQueue: AgentMessage[];
  private isInitialized: boolean;

  constructor() {
    this.agents = new Map();
    this.messageQueue = [];
    this.isInitialized = false;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.registerAgent(new MarketAnalystAgent());
    this.registerAgent(new OnchainAnalystAgent());
    this.registerAgent(new NewsAnalystAgent());
    this.registerAgent(new SentimentAnalystAgent());
    this.registerAgent(new MacroAnalystAgent());
    this.registerAgent(new StrategyResearcherAgent());
    this.registerAgent(new BacktestAgent());
    this.registerAgent(new RiskManagerAgent());
    this.registerAgent(new InvestmentAdvisorAgent());
    this.registerAgent(new ExecutionAgent());
    this.registerAgent(new MonitoringAgent());
    this.registerAgent(new PerformanceAuditorAgent());
    this.registerAgent(llmAnalystAgent);

    await this.initializeAllAgents();
    this.startMessageProcessing();

    this.isInitialized = true;
  }

  private registerAgent(agent: IAgent): void {
    this.agents.set(agent.id, agent);
  }

  private async initializeAllAgents(): Promise<void> {
    const initPromises = Array.from(this.agents.values()).map((agent) => agent.init());
    await Promise.all(initPromises);
  }

  private startMessageProcessing(): void {
    setInterval(() => {
      this.processMessageQueue();
    }, 1000);
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.dispatchMessage(message);
    }
  }

  private dispatchMessage(message: AgentMessage): void {
    if (message.to === "broadcast") {
      this.broadcastMessage(message);
    } else {
      const agent = this.agents.get(message.to);
      if (agent) {
        agent.handleMessage(message).catch((err) => {
          console.error(`Agent ${message.to} failed to handle message:`, err);
        });
      }
    }
  }

  private broadcastMessage(message: AgentMessage): void {
    for (const agent of this.agents.values()) {
      if (agent.id !== message.from) {
        agent.handleMessage(message).catch((err) => {
          console.error(`Agent ${agent.id} failed to handle broadcast:`, err);
        });
      }
    }
  }

  async executeTask(agentId: AgentId, task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return {
        type: "error",
        data: { error: `Agent ${agentId} not found` },
        confidence: 0,
      };
    }

    return await agent.execute(task, context);
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    this.messageQueue.push(message);
  }

  async broadcast(topic: string, payload: Record<string, any>, from: AgentId): Promise<void> {
    const message: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: "event",
      from,
      to: "broadcast",
      topic,
      payload,
      timestamp: Date.now(),
      priority: "normal",
    };
    await this.sendMessage(message);
  }

  getAgentStatus(agentId: AgentId): AgentStatus | null {
    const agent = this.agents.get(agentId);
    return agent ? agent.getStatus() : null;
  }

  getAllAgentStatuses(): AgentStatus[] {
    return Array.from(this.agents.values()).map((agent) => agent.getStatus());
  }

  getAgent(agentId: AgentId): IAgent | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByRole(role: string): IAgent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.role === role);
  }

  setAllAgentsLLM(enabled: boolean): void {
    for (const agent of this.agents.values()) {
      if ("setUseLLM" in agent && typeof (agent as any).setUseLLM === "function") {
        (agent as any).setUseLLM(enabled);
      }
    }
    console.log(`[AgentCoordinator] 所有智能体 LLM 模式: ${enabled ? "启用" : "禁用"}`);
  }

  setAgentLLM(agentId: AgentId, enabled: boolean): void {
    const agent = this.agents.get(agentId);
    if (agent && "setUseLLM" in agent && typeof (agent as any).setUseLLM === "function") {
      (agent as any).setUseLLM(enabled);
    }
  }

  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.agents.values()).map((agent) => agent.shutdown());
    await Promise.all(shutdownPromises);
    this.isInitialized = false;
  }

  async analyzeMarket(symbol: string, candles: any[]): Promise<AgentOutput> {
    const marketResult = await this.executeTask("market-analyst", {
      type: "ta-analysis",
      data: { candles },
    });

    const onchainResult = await this.executeTask("onchain-analyst", {
      type: "onchain-analysis",
      data: { symbol },
    });

    const newsResult = await this.executeTask("news-analyst", {
      type: "news-analysis",
      data: { symbol },
    });

    const sentimentResult = await this.executeTask("sentiment-analyst", {
      type: "sentiment-analysis",
      data: { symbol },
    });

    const macroResult = await this.executeTask("macro-analyst", {
      type: "economic-indicators",
      data: {},
    });

    await this.broadcast("market-analysis-complete", {
      symbol,
      market: marketResult.data,
      onchain: onchainResult.data,
      news: newsResult.data,
      sentiment: sentimentResult.data,
      macro: macroResult.data,
    }, "agent-coordinator");

    return {
      type: "combined-analysis",
      data: {
        symbol,
        market: marketResult.data,
        onchain: onchainResult.data,
        news: newsResult.data,
        sentiment: sentimentResult.data,
        macro: macroResult.data,
        summary: this.generateAnalysisSummary(marketResult, onchainResult, newsResult, sentimentResult, macroResult),
      },
      confidence: this.calculateCombinedConfidence([marketResult, onchainResult, newsResult, sentimentResult, macroResult]),
      sources: ["market-analyst", "onchain-analyst", "news-analyst", "sentiment-analyst", "macro-analyst"],
    };
  }

  async generateTradingSignal(symbol: string, candles: any[]): Promise<AgentOutput> {
    const analysis = await this.analyzeMarket(symbol, candles);

    const strategyResult = await this.executeTask("strategy-researcher", {
      type: "generate-strategy",
      data: {
        marketRegime: analysis.data.market?.regime?.regime || "trending",
        assetClass: "crypto",
        timeFrame: "4h",
      },
    });

    const riskResult = await this.executeTask("risk-manager", {
      type: "assess-risk",
      data: {
        position: {
          symbol,
          side: "long",
          leverage: 5,
          stopLoss: true,
        },
        marketConditions: {
          volatility: analysis.data.market?.indicators?.volatility ? "high" : "normal",
          trend: analysis.data.market?.indicators?.trend ? "strong" : "weak",
        },
      },
    });

    const advisorResult = await this.executeTask("investment-advisor", {
      type: "investment-recommendation",
      data: {
        symbol,
        marketAnalysis: {
          trend: analysis.data.market?.indicators?.trend ? "up" : "down",
          supportLevel: analysis.data.market?.supportLevels?.[0],
          resistanceLevel: analysis.data.market?.resistanceLevels?.[0],
        },
        sentiment: analysis.data.sentiment,
        onchainData: analysis.data.onchain,
      },
    });

    await this.broadcast("trading-signal-generated", {
      symbol,
      analysis,
      strategy: strategyResult.data,
      risk: riskResult.data,
      recommendation: advisorResult.data,
    }, "agent-coordinator");

    return {
      type: "trading-signal",
      data: {
        symbol,
        analysis,
        strategy: strategyResult.data,
        riskAssessment: riskResult.data,
        recommendation: advisorResult.data,
        signal: this.generateFinalSignal(advisorResult, riskResult),
      },
      confidence: advisorResult.confidence || 0.7,
      sources: ["investment-advisor", "risk-manager", "strategy-researcher"],
    };
  }

  async executeTrade(signal: any): Promise<AgentOutput> {
    const positionSizeResult = await this.executeTask("risk-manager", {
      type: "calculate-position-size",
      data: {
        accountBalance: 10000,
        riskPerTrade: 1,
        entryPrice: signal.recommendation.targetPrice || signal.analysis.market?.indicators?.price || 67000,
        stopLossPrice: signal.recommendation.stopLoss || signal.riskAssessment.maximumLoss,
      },
    });

    const executionResult = await this.executeTask("execution-agent", {
      type: "open-position",
      data: {
        symbol: signal.symbol,
        side: signal.recommendation.recommendation === "sell" ? "short" : "long",
        quantity: positionSizeResult.data.positionSize,
        leverage: 5,
        entryPrice: signal.recommendation.targetPrice || 67000,
        stopLoss: signal.recommendation.stopLoss,
        takeProfit: signal.recommendation.targetPrice,
      },
    });

    await this.executeTask("monitoring-agent", {
      type: "create-alert",
      data: {
        type: "price",
        symbol: signal.symbol,
        condition: signal.recommendation.recommendation === "sell" ? "above" : "below",
        threshold: signal.recommendation.stopLoss || 65000,
        message: `${signal.symbol} 触发止损警报`,
        severity: "critical",
      },
    });

    await this.executeTask("performance-auditor", {
      type: "add-trade-log",
      data: {
        symbol: signal.symbol,
        side: signal.recommendation.recommendation === "sell" ? "short" : "long",
        entryPrice: signal.recommendation.targetPrice || 67000,
        quantity: positionSizeResult.data.positionSize,
        leverage: 5,
        pnl: 0,
      },
    });

    await this.broadcast("trade-executed", {
      symbol: signal.symbol,
      execution: executionResult.data,
      positionSize: positionSizeResult.data,
    }, "agent-coordinator");

    return {
      type: "trade-executed",
      data: {
        ...executionResult.data,
        positionSize: positionSizeResult.data,
      },
      confidence: executionResult.confidence || 0.95,
      sources: ["execution-agent", "risk-manager", "monitoring-agent", "performance-auditor"],
    };
  }

  async runFullAnalysis(symbol: string, candles: any[]): Promise<AgentOutput> {
    const signal = await this.generateTradingSignal(symbol, candles);
    const backtestResult = await this.executeTask("backtest-agent", {
      type: "run-backtest",
      data: {
        candles,
        strategy: signal.data.strategy?.recommendedStrategy,
      },
    });

    return {
      type: "full-analysis",
      data: {
        signal,
        backtest: backtestResult.data,
      },
      confidence: this.calculateCombinedConfidence([signal, backtestResult]),
      sources: ["market-analyst", "strategy-researcher", "backtest-agent", "risk-manager", "investment-advisor"],
    };
  }

  private generateAnalysisSummary(
    market: AgentOutput,
    onchain: AgentOutput,
    news: AgentOutput,
    sentiment: AgentOutput,
    macro: AgentOutput,
  ): string {
    const parts: string[] = [];

    if (market.data?.indicators?.trend) {
      parts.push(`技术面: ${market.data.indicators.trend > 0 ? "看涨" : "看跌"}`);
    }

    if (onchain.data?.netflow) {
      parts.push(`链上: ${onchain.data.netflow === "inflow" ? "资金流入" : "资金流出"}`);
    }

    if (sentiment.data?.score) {
      parts.push(`情绪: ${sentiment.data.score > 0.5 ? "乐观" : sentiment.data.score < 0.3 ? "悲观" : "中性"}`);
    }

    if (news.data?.articles?.length) {
      parts.push(`新闻: ${news.data.articles.length}条相关新闻`);
    }

    return parts.join("；") || "暂无分析数据";
  }

  private calculateCombinedConfidence(results: AgentOutput[]): number {
    const validConfidences = results.filter((r) => r.confidence && r.confidence > 0).map((r) => r.confidence!);
    if (validConfidences.length === 0) return 0.5;

    const average = validConfidences.reduce((sum, c) => sum + c, 0) / validConfidences.length;
    const variance = validConfidences.reduce((sum, c) => sum + Math.pow(c - average, 2), 0) / validConfidences.length;
    const adjusted = average * (1 - variance * 0.5);

    return Number(Math.max(0.1, Math.min(0.99, adjusted)).toFixed(2));
  }

  private generateFinalSignal(advisor: AgentOutput, risk: AgentOutput): string {
    const recommendation = advisor.data?.recommendation;
    const riskLevel = risk.data?.riskLevel;

    if (riskLevel === "critical") return "hold";
    if (riskLevel === "high") return recommendation === "buy" ? "accumulate" : recommendation === "sell" ? "reduce" : "hold";

    return recommendation || "hold";
  }
}

export const agentCoordinator = new AgentCoordinator();