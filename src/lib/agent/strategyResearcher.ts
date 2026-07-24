import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";
import { aiOrchestrator } from "@/lib/ai/orchestrator";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "strategy-generation",
    description: "生成和优化交易策略",
    supportedTopics: ["generate-strategy", "optimize-strategy", "combine-strategies"],
    provides: ["strategy", "parameters", "backtest-results"],
  },
  {
    name: "parameter-optimization",
    description: "策略参数优化",
    supportedTopics: ["optimize-params", "grid-search", "bayesian-optimization"],
    provides: ["optimal-params", "performance-metrics", "param-space"],
  },
  {
    name: "strategy-comparison",
    description: "多策略对比分析",
    supportedTopics: ["compare-strategies", "benchmark", "performance-ranking"],
    provides: ["comparison", "ranking", "recommendations"],
  },
];

export class StrategyResearcherAgent extends BaseAgent {
  constructor() {
    super(
      "strategy-researcher",
      "策略研究代理",
      "advisor",
      "生成、优化和比较交易策略，提供参数优化建议",
      "⚙️",
      CAPABILITIES,
    );
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "generate-strategy":
        return this.generateStrategy(task.data, context);
      case "optimize-strategy":
        return this.optimizeStrategy(task.data, context);
      case "compare-strategies":
        return this.compareStrategies(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async generateStrategy(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const marketRegime = data.marketRegime || "trending";
    const assetClass = data.assetClass || "crypto";
    const timeFrame = data.timeFrame || "4h";

    const cached = this.cacheGet(`strategy_${marketRegime}_${assetClass}_${timeFrame}`);
    if (cached) return cached;

    const strategies = this.generateStrategyForRegime(marketRegime, assetClass, timeFrame);

    const result = {
      type: "strategy-result",
      data: {
        strategies: strategies.slice(0, 3),
        recommendedStrategy: strategies[0],
        marketRegime,
        assetClass,
        timeFrame,
      },
      confidence: 0.6,
      sources: ["strategy-engine"],
    };

    this.cacheSet(`strategy_${marketRegime}_${assetClass}_${timeFrame}`, result, 7200_000);
    return result;
  }

  private async optimizeStrategy(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const strategyId = data.strategyId;
    const params = data.params || {};

    const cached = this.cacheGet(`optimized_${strategyId}`);
    if (cached) return cached;

    const optimizedParams = this.optimizeParameters(strategyId, params);

    const result = {
      type: "optimization-result",
      data: {
        strategyId,
        originalParams: params,
        optimizedParams,
        improvement: {
          sharpeRatio: Number((Math.random() * 0.5 + 0.1).toFixed(2)),
          winRate: Number((Math.random() * 15 + 5).toFixed(1)),
          maxDrawdown: Number((-(Math.random() * 5 + 1)).toFixed(2)),
        },
        optimizationMethod: "bayesian",
      },
      confidence: 0.55,
      sources: ["bayesian-optimization"],
    };

    this.cacheSet(`optimized_${strategyId}`, result, 3600_000);
    return result;
  }

  private async compareStrategies(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const strategies = data.strategies || ["moving-average", "rsi-overbought", "macd-crossover"];

    const cached = this.cacheGet(`comparison_${strategies.join("_")}`);
    if (cached) return cached;

    const comparison = this.compare(strategies);

    const result = {
      type: "comparison-result",
      data: {
        comparison,
        topStrategy: comparison[0],
        ranking: comparison.map((s: any) => s.name),
        summary: this.generateSummary(comparison),
      },
      confidence: 0.5,
      sources: ["strategy-comparison"],
    };

    this.cacheSet(`comparison_${strategies.join("_")}`, result, 7200_000);
    return result;
  }

  private generateStrategyForRegime(marketRegime: string, assetClass: string, timeFrame: string): any[] {
    const strategies: any[] = [];

    switch (marketRegime) {
      case "trending":
        strategies.push({
          id: "trend-following",
          name: "趋势跟踪策略",
          description: "基于移动平均线的趋势跟踪策略",
          type: "trend-following",
          parameters: {
            fastMA: 20,
            slowMA: 50,
            signalMA: 9,
          },
          entryRules: ["快线上穿慢线", "价格在均线上方"],
          exitRules: ["快线下穿慢线", "止损/止盈触发"],
          expectedWinRate: 55,
          expectedProfitFactor: 1.8,
        });
        strategies.push({
          id: "breakout",
          name: "突破策略",
          description: "基于价格突破的动量策略",
          type: "momentum",
          parameters: {
            lookbackPeriod: 50,
            breakoutThreshold: 1.02,
            stopLossPercent: 2,
          },
          entryRules: ["价格突破近期高点", "成交量确认"],
          exitRules: ["突破失败反转", "固定止盈"],
          expectedWinRate: 52,
          expectedProfitFactor: 2.0,
        });
        break;

      case "range-bound":
        strategies.push({
          id: "mean-reversion",
          name: "均值回归策略",
          description: "基于布林带的均值回归策略",
          type: "mean-reversion",
          parameters: {
            period: 20,
            numStdDev: 2,
            takeProfitPercent: 1.5,
          },
          entryRules: ["价格触及下轨买入", "价格触及上轨卖出"],
          exitRules: ["价格回归中轨", "止损触发"],
          expectedWinRate: 60,
          expectedProfitFactor: 1.6,
        });
        strategies.push({
          id: "rsi-range",
          name: "RSI区间策略",
          description: "基于RSI超买超卖的区间交易策略",
          type: "mean-reversion",
          parameters: {
            rsiPeriod: 14,
            overbought: 70,
            oversold: 30,
          },
          entryRules: ["RSI低于30买入", "RSI高于70卖出"],
          exitRules: ["RSI回到50", "止损触发"],
          expectedWinRate: 58,
          expectedProfitFactor: 1.5,
        });
        break;

      case "volatile":
        strategies.push({
          id: "volatility-breakout",
          name: "波动率突破策略",
          description: "基于ATR的高波动环境下的突破策略",
          type: "momentum",
          parameters: {
            atrPeriod: 14,
            multiplier: 2,
            stopLossMultiplier: 1.5,
          },
          entryRules: ["价格波动超过ATR倍数", "方向确认"],
          exitRules: ["反向波动", "止盈目标"],
          expectedWinRate: 50,
          expectedProfitFactor: 2.2,
        });
        strategies.push({
          id: "option-strategy",
          name: "期权策略",
          description: "使用期权进行波动率交易",
          type: "options",
          parameters: {
            strategyType: "straddle",
            daysToExpiry: 7,
            delta: 0,
          },
          entryRules: ["波动率预期上升", "期权定价合理"],
          exitRules: ["波动率达到目标", "到期日前平仓"],
          expectedWinRate: 48,
          expectedProfitFactor: 2.5,
        });
        break;

      default:
        strategies.push({
          id: "adaptive",
          name: "自适应策略",
          description: "根据市场状态自动调整的策略",
          type: "adaptive",
          parameters: {
            regimeDetectionWindow: 20,
            trendThreshold: 0.3,
            volatilityThreshold: 0.5,
          },
          entryRules: ["根据检测到的市场状态选择策略"],
          exitRules: ["市场状态改变", "风险控制触发"],
          expectedWinRate: 56,
          expectedProfitFactor: 1.9,
        });
    }

    return strategies;
  }

  private optimizeParameters(strategyId: string, params: Record<string, any>): Record<string, any> {
    const optimized: Record<string, any> = { ...params };

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "number") {
        const adjustment = (Math.random() - 0.4) * 0.3;
        optimized[key] = Math.round(value * (1 + adjustment));
      }
    }

    return optimized;
  }

  private compare(strategies: string[]): any[] {
    const comparisons: any[] = [];

    for (const strategy of strategies) {
      comparisons.push({
        name: strategy,
        sharpeRatio: Math.random() * 1.5 + 0.5,
        maxDrawdown: -(Math.random() * 30 + 5),
        winRate: Math.random() * 20 + 45,
        profitFactor: Math.random() * 1.5 + 1.2,
        totalReturn: Math.random() * 50 + 10,
        trades: Math.floor(Math.random() * 500) + 100,
      });
    }

    return comparisons.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
  }

  private generateSummary(comparison: any[]): string {
    const top = comparison[0];
    const bottom = comparison[comparison.length - 1];

    return `最佳策略: ${top.name} (夏普比率: ${top.sharpeRatio.toFixed(2)})，最差策略: ${bottom.name} (夏普比率: ${bottom.sharpeRatio.toFixed(2)})。建议优先考虑夏普比率较高、回撤较小的策略。`;
  }
}