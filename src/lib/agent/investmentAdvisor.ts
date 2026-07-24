import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "portfolio-allocation",
    description: "投资组合配置建议",
    supportedTopics: ["asset-allocation", "rebalance", "diversification"],
    provides: ["allocation", "target-weights", "rebalance-signal"],
  },
  {
    name: "investment-recommendation",
    description: "投资建议",
    supportedTopics: ["buy-signal", "sell-signal", "hold-signal", "timing"],
    provides: ["recommendation", "confidence", "rationale"],
  },
  {
    name: "goal-planning",
    description: "投资目标规划",
    supportedTopics: ["retirement", "wealth-building", "risk-profile"],
    provides: ["plan", "milestones", "asset-allocation"],
  },
];

export class InvestmentAdvisorAgent extends BaseAgent {
  constructor() {
    super(
      "investment-advisor",
      "投资顾问代理",
      "advisor",
      "提供投资组合配置建议、投资建议和目标规划",
      "💼",
      CAPABILITIES,
    );
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "portfolio-allocation":
        return this.allocatePortfolio(task.data, context);
      case "investment-recommendation":
        return this.generateRecommendation(task.data, context);
      case "goal-planning":
        return this.planGoal(task.data, context);
      case "rebalance":
        return this.rebalancePortfolio(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async allocatePortfolio(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const riskProfile = data.riskProfile || "moderate";
    const investmentGoal = data.investmentGoal || "wealth-building";
    const timeHorizon = data.timeHorizon || "medium";

    const cached = this.cacheGet(`allocation_${riskProfile}_${investmentGoal}_${timeHorizon}`);
    if (cached) return cached;

    const allocation = this.generateAllocation(riskProfile, investmentGoal, timeHorizon);

    const result = {
      type: "allocation-result",
      data: {
        allocation,
        riskProfile,
        investmentGoal,
        timeHorizon,
        expectedReturn: this.calculateExpectedReturn(allocation),
        expectedVolatility: this.calculateExpectedVolatility(allocation, riskProfile),
        rationale: this.generateAllocationRationale(allocation, riskProfile, investmentGoal),
      },
      confidence: 0.65,
      sources: ["portfolio-model"],
    };

    this.cacheSet(`allocation_${riskProfile}_${investmentGoal}_${timeHorizon}`, result, 7200_000);
    return result;
  }

  private async generateRecommendation(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const symbol = data.symbol;
    const marketAnalysis = data.marketAnalysis;
    const sentiment = data.sentiment;
    const onchainData = data.onchainData;

    if (!symbol) {
      return {
        type: "error",
        data: { error: "Symbol is required" },
        confidence: 0,
      };
    }

    const recommendation = this.analyzeAndRecommend(symbol, marketAnalysis, sentiment, onchainData);

    return {
      type: "recommendation-result",
      data: recommendation,
      confidence: recommendation.confidence,
      sources: ["multi-factor-analysis"],
    };
  }

  private async planGoal(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const goal = data.goal || "retirement";
    const currentAge = data.currentAge || 30;
    const targetAge = data.targetAge || 60;
    const currentSavings = data.currentSavings || 100000;
    const targetAmount = data.targetAmount || 1000000;
    const monthlyContribution = data.monthlyContribution || 2000;

    const plan = this.createPlan(goal, currentAge, targetAge, currentSavings, targetAmount, monthlyContribution);

    return {
      type: "plan-result",
      data: plan,
      confidence: 0.7,
      sources: ["financial-planning"],
    };
  }

  private async rebalancePortfolio(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const currentAllocation = data.currentAllocation;
    const targetAllocation = data.targetAllocation;

    if (!currentAllocation || !targetAllocation) {
      return {
        type: "error",
        data: { error: "Current and target allocation required" },
        confidence: 0,
      };
    }

    const rebalanceSignal = this.calculateRebalance(currentAllocation, targetAllocation);

    return {
      type: "rebalance-result",
      data: rebalanceSignal,
      confidence: 0.75,
      sources: ["rebalance-engine"],
    };
  }

  private generateAllocation(riskProfile: string, investmentGoal: string, timeHorizon: string): any[] {
    const baseAllocations: Record<string, any[]> = {
      conservative: [
        { asset: "cash", weight: 30, expectedReturn: 2 },
        { asset: "bond", weight: 50, expectedReturn: 4 },
        { asset: "equity", weight: 15, expectedReturn: 8 },
        { asset: "crypto", weight: 5, expectedReturn: 15 },
      ],
      moderate: [
        { asset: "cash", weight: 15, expectedReturn: 2 },
        { asset: "bond", weight: 35, expectedReturn: 4 },
        { asset: "equity", weight: 35, expectedReturn: 8 },
        { asset: "crypto", weight: 15, expectedReturn: 15 },
      ],
      aggressive: [
        { asset: "cash", weight: 5, expectedReturn: 2 },
        { asset: "bond", weight: 15, expectedReturn: 4 },
        { asset: "equity", weight: 50, expectedReturn: 8 },
        { asset: "crypto", weight: 30, expectedReturn: 15 },
      ],
    };

    let allocation = [...baseAllocations[riskProfile as keyof typeof baseAllocations] || baseAllocations.moderate];

    if (investmentGoal === "retirement") {
      allocation = allocation.map((a) => ({
        ...a,
        weight: a.asset === "bond" ? a.weight + 10 : a.asset === "crypto" ? Math.max(0, a.weight - 10) : a.weight,
      }));
    } else if (investmentGoal === "wealth-building") {
      allocation = allocation.map((a) => ({
        ...a,
        weight: a.asset === "equity" || a.asset === "crypto" ? a.weight + 5 : a.weight - 3,
      }));
    }

    if (timeHorizon === "short") {
      allocation = allocation.map((a) => ({
        ...a,
        weight: a.asset === "cash" || a.asset === "bond" ? a.weight + 10 : Math.max(0, a.weight - 5),
      }));
    } else if (timeHorizon === "long") {
      allocation = allocation.map((a) => ({
        ...a,
        weight: a.asset === "equity" || a.asset === "crypto" ? a.weight + 10 : a.weight - 5,
      }));
    }

    const totalWeight = allocation.reduce((sum, a) => sum + a.weight, 0);
    return allocation.map((a) => ({
      ...a,
      weight: Number((a.weight / totalWeight * 100).toFixed(1)),
    }));
  }

  private calculateExpectedReturn(allocation: any[]): number {
    return Number(allocation.reduce((sum, a) => sum + (a.weight / 100) * a.expectedReturn, 0).toFixed(2));
  }

  private calculateExpectedVolatility(allocation: any[], riskProfile: string): number {
    const volatilityMap: Record<string, number> = {
      cash: 1,
      bond: 3,
      equity: 15,
      crypto: 35,
    };

    const baseVolatility = allocation.reduce((sum, a) => sum + (a.weight / 100) * (volatilityMap[a.asset] || 10), 0);

    if (riskProfile === "conservative") return Number((baseVolatility * 0.8).toFixed(2));
    if (riskProfile === "aggressive") return Number((baseVolatility * 1.2).toFixed(2));
    return Number(baseVolatility.toFixed(2));
  }

  private generateAllocationRationale(allocation: any[], riskProfile: string, investmentGoal: string): string {
    const equityWeight = allocation.find((a) => a.asset === "equity")?.weight || 0;
    const cryptoWeight = allocation.find((a) => a.asset === "crypto")?.weight || 0;

    if (riskProfile === "conservative") {
      return `保守型配置：强调本金安全，债券和现金占比约${allocation.find((a) => a.asset === "bond")?.weight + allocation.find((a) => a.asset === "cash")?.weight}%，适合风险厌恶型投资者。`;
    } else if (riskProfile === "aggressive") {
      return `进取型配置：追求高收益，股票和加密货币占比${equityWeight + cryptoWeight}%，适合年轻投资者和长期目标。`;
    }

    return `稳健型配置：平衡风险与收益，股票占${equityWeight}%，加密货币占${cryptoWeight}%，适合大多数投资者的${investmentGoal}目标。`;
  }

  private analyzeAndRecommend(symbol: string, marketAnalysis: any, sentiment: any, onchainData: any): any {
    let score = 0;
    const factors: string[] = [];

    if (marketAnalysis?.trend === "up") {
      score += 25;
      factors.push("技术面看涨");
    } else if (marketAnalysis?.trend === "down") {
      score -= 20;
      factors.push("技术面看跌");
    }

    if (marketAnalysis?.supportLevel) {
      score += 10;
      factors.push("接近支撑位");
    }
    if (marketAnalysis?.resistanceLevel) {
      score -= 10;
      factors.push("接近阻力位");
    }

    if (sentiment?.score && sentiment.score > 0.5) {
      score += 20;
      factors.push("市场情绪乐观");
    } else if (sentiment?.score && sentiment.score < 0.3) {
      score -= 15;
      factors.push("市场情绪悲观");
    }

    if (onchainData?.netflow === "inflow") {
      score += 15;
      factors.push("链上资金流入");
    } else if (onchainData?.netflow === "outflow") {
      score -= 10;
      factors.push("链上资金流出");
    }

    if (onchainData?.activeAddresses && onchainData.activeAddresses > 100000) {
      score += 10;
      factors.push("活跃地址增加");
    }

    score = Math.min(100, Math.max(-100, score));

    let recommendation: "buy" | "sell" | "hold" | "accumulate" | "reduce";
    let confidence: number;

    if (score >= 60) {
      recommendation = "buy";
      confidence = 0.75 + Math.random() * 0.2;
    } else if (score >= 30) {
      recommendation = "accumulate";
      confidence = 0.6 + Math.random() * 0.2;
    } else if (score >= -20) {
      recommendation = "hold";
      confidence = 0.5 + Math.random() * 0.2;
    } else if (score >= -50) {
      recommendation = "reduce";
      confidence = 0.55 + Math.random() * 0.2;
    } else {
      recommendation = "sell";
      confidence = 0.7 + Math.random() * 0.2;
    }

    return {
      symbol,
      recommendation,
      confidence: Number(confidence.toFixed(2)),
      score,
      factors,
      rationale: this.generateRationale(recommendation, factors),
      targetPrice: this.calculateTargetPrice(symbol, marketAnalysis),
      stopLoss: this.calculateStopLoss(symbol, marketAnalysis),
    };
  }

  private generateRationale(recommendation: string, factors: string[]): string {
    const factorStr = factors.join("；");
    if (recommendation === "buy") return `买入建议：${factorStr}。建议在当前价位附近入场，设置止损保护。`;
    if (recommendation === "accumulate") return `逢低吸纳：${factorStr}。建议分批建仓，控制仓位。`;
    if (recommendation === "hold") return `持有建议：${factorStr}。当前信号不明确，建议继续观察。`;
    if (recommendation === "reduce") return `减仓建议：${factorStr}。建议部分获利了结，降低风险。`;
    return `卖出建议：${factorStr}。建议尽快平仓，避免进一步损失。`;
  }

  private calculateTargetPrice(symbol: string, marketAnalysis: any): number {
    if (marketAnalysis?.resistanceLevel) {
      return marketAnalysis.resistanceLevel * (1 + Math.random() * 0.05);
    }
    return 0;
  }

  private calculateStopLoss(symbol: string, marketAnalysis: any): number {
    if (marketAnalysis?.supportLevel) {
      return marketAnalysis.supportLevel * (1 - Math.random() * 0.02);
    }
    return 0;
  }

  private createPlan(goal: string, currentAge: number, targetAge: number, currentSavings: number, targetAmount: number, monthlyContribution: number): any {
    const years = targetAge - currentAge;
    const months = years * 12;
    const expectedReturn = goal === "retirement" ? 5 : goal === "wealth-building" ? 8 : 6;
    const monthlyReturn = expectedReturn / 100 / 12;

    let futureValue = currentSavings * Math.pow(1 + monthlyReturn, months);
    const annuity = monthlyContribution * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn);
    futureValue += annuity;

    const gap = targetAmount - futureValue;
    const requiredMonthly = gap > 0 ? (gap * monthlyReturn) / (Math.pow(1 + monthlyReturn, months) - 1) : 0;

    const milestones = this.generateMilestones(currentAge, targetAge, currentSavings, monthlyContribution, expectedReturn);

    return {
      goal,
      timeFrame: `${years}年`,
      currentSavings,
      targetAmount,
      monthlyContribution,
      expectedReturn: `${expectedReturn}%`,
      futureValue: Number(futureValue.toFixed(2)),
      gap: Number(gap.toFixed(2)),
      requiredMonthlyContribution: Number(Math.max(monthlyContribution, requiredMonthly).toFixed(2)),
      milestones,
      recommendations: this.generatePlanningRecommendations(goal, gap, monthlyContribution, requiredMonthly),
    };
  }

  private generateMilestones(currentAge: number, targetAge: number, currentSavings: number, monthlyContribution: number, expectedReturn: number): any[] {
    const milestones: any[] = [];
    const years = targetAge - currentAge;
    const monthlyReturn = expectedReturn / 100 / 12;

    let value = currentSavings;
    for (let i = 1; i <= years; i += Math.max(1, Math.floor(years / 5))) {
      const months = i * 12;
      value = currentSavings * Math.pow(1 + monthlyReturn, months) +
        monthlyContribution * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn);
      milestones.push({
        age: currentAge + i,
        targetValue: Number(value.toFixed(2)),
        progress: Number(((value / (currentSavings * 2)) * 100).toFixed(1)),
      });
    }

    return milestones;
  }

  private generatePlanningRecommendations(goal: string, gap: number, currentMonthly: number, requiredMonthly: number): string[] {
    const recs: string[] = [];

    if (gap > 0) {
      recs.push(`当前每月投入${currentMonthly}元，建议增加至${requiredMonthly.toFixed(0)}元以实现目标`);
      recs.push("考虑提高投资收益预期或延长投资期限");
    } else {
      recs.push("当前储蓄计划可以实现目标");
      recs.push("建议定期审查投资组合表现");
    }

    if (goal === "retirement") {
      recs.push("考虑配置更多固定收益类资产");
    } else if (goal === "wealth-building") {
      recs.push("可以适当增加股票和加密货币配置");
    }

    return recs;
  }

  private calculateRebalance(currentAllocation: any[], targetAllocation: any[]): any {
    const rebalanceActions: any[] = [];

    for (const target of targetAllocation) {
      const current = currentAllocation.find((a) => a.asset === target.asset);
      const currentWeight = current?.weight || 0;
      const diff = currentWeight - target.weight;

      if (Math.abs(diff) > 5) {
        rebalanceActions.push({
          asset: target.asset,
          currentWeight,
          targetWeight: target.weight,
          action: diff > 0 ? "sell" : "buy",
          amount: Math.abs(diff),
        });
      }
    }

    return {
      needsRebalance: rebalanceActions.length > 0,
      actions: rebalanceActions,
      summary: rebalanceActions.length > 0
        ? `需要调整${rebalanceActions.length}项资产配置`
        : "当前配置符合目标，无需调整",
    };
  }
}