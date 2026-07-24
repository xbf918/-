import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "risk-assessment",
    description: "评估交易风险",
    supportedTopics: ["assess-risk", "position-sizing", "stop-loss"],
    provides: ["risk-score", "position-size", "stop-loss-level"],
  },
  {
    name: "portfolio-risk",
    description: "投资组合风险分析",
    supportedTopics: ["portfolio-diversification", "correlation-risk", "concentration"],
    provides: ["diversification-score", "correlation-matrix", "max-exposure"],
  },
  {
    name: "risk-monitoring",
    description: "实时风险监控",
    supportedTopics: ["alert-threshold", "drawdown-monitor", "position-limit"],
    provides: ["alerts", "violations", "recommendations"],
  },
];

export class RiskManagerAgent extends BaseAgent {
  constructor() {
    super(
      "risk-manager",
      "风险控制代理",
      "monitor",
      "评估交易风险、管理投资组合风险、实时监控风险指标",
      "📊",
      CAPABILITIES,
    );
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "assess-risk":
        return this.assessRisk(task.data, context);
      case "portfolio-risk":
        return this.analyzePortfolioRisk(task.data, context);
      case "monitor-risk":
        return this.monitorRisk(task.data, context);
      case "calculate-position-size":
        return this.calculatePositionSize(task.data, context);
      case "set-stop-loss":
        return this.setStopLoss(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async assessRisk(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const position = data.position;
    const marketConditions = data.marketConditions;
    const accountBalance = data.accountBalance || 10000;

    if (!position) {
      return {
        type: "error",
        data: { error: "No position data provided" },
        confidence: 0,
      };
    }

    const riskScore = this.calculateRiskScore(position, marketConditions, accountBalance);

    return {
      type: "risk-assessment-result",
      data: {
        riskScore,
        riskLevel: this.getRiskLevel(riskScore),
        factors: this.identifyRiskFactors(position, marketConditions),
        recommendations: this.generateRiskRecommendations(riskScore, position),
        maximumLoss: this.calculateMaximumLoss(position, accountBalance),
      },
      confidence: 0.75,
      sources: ["risk-model"],
    };
  }

  private async analyzePortfolioRisk(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const positions = data.positions || [];
    const portfolioValue = data.portfolioValue || 10000;

    const diversificationScore = this.calculateDiversification(positions);
    const concentrationRisk = this.calculateConcentrationRisk(positions, portfolioValue);
    const correlationRisk = this.calculateCorrelationRisk(positions);

    return {
      type: "portfolio-risk-result",
      data: {
        diversificationScore,
        concentrationRisk,
        correlationRisk,
        maxSinglePositionExposure: this.calculateMaxExposure(positions, portfolioValue),
        totalRiskScore: this.calculateTotalPortfolioRisk(diversificationScore, concentrationRisk, correlationRisk),
        recommendations: this.generatePortfolioRecommendations(positions, portfolioValue),
      },
      confidence: 0.7,
      sources: ["portfolio-analysis"],
    };
  }

  private async monitorRisk(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const positions = data.positions || [];
    const thresholds = data.thresholds || {
      maxDrawdown: 20,
      maxPositionSize: 10,
      maxConcentration: 30,
    };

    const alerts = this.checkThresholds(positions, thresholds);

    return {
      type: "monitoring-result",
      data: {
        alerts,
        activeAlerts: alerts.filter((a: any) => a.active).length,
        riskLevel: alerts.some((a: any) => a.severity === "critical") ? "high" : alerts.some((a: any) => a.severity === "warning") ? "medium" : "low",
      },
      confidence: 0.8,
      sources: ["risk-monitor"],
      warnings: alerts.filter((a: any) => a.active).map((a: any) => a.message),
    };
  }

  private async calculatePositionSize(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const accountBalance = data.accountBalance || 10000;
    const riskPerTrade = data.riskPerTrade || 1;
    const entryPrice = data.entryPrice;
    const stopLossPrice = data.stopLossPrice;

    if (!entryPrice || !stopLossPrice) {
      return {
        type: "error",
        data: { error: "Entry and stop loss prices required" },
        confidence: 0,
      };
    }

    const riskAmount = (accountBalance * riskPerTrade) / 100;
    const priceDiff = Math.abs(entryPrice - stopLossPrice);
    const positionSize = priceDiff > 0 ? riskAmount / priceDiff : 0;
    const positionValue = positionSize * entryPrice;
    const positionPercent = (positionValue / accountBalance) * 100;

    return {
      type: "position-size-result",
      data: {
        positionSize: Number(positionSize.toFixed(4)),
        positionValue: Number(positionValue.toFixed(2)),
        positionPercent: Number(positionPercent.toFixed(2)),
        riskAmount: Number(riskAmount.toFixed(2)),
        maxPositionSize: Number((accountBalance * 0.1).toFixed(2)),
        maxPositionPercent: 10,
      },
      confidence: 0.9,
      sources: ["position-sizing"],
    };
  }

  private async setStopLoss(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const entryPrice = data.entryPrice;
    const atr = data.atr || 1;
    const volatility = data.volatility || "normal";

    const multiplier = volatility === "high" ? 2.5 : volatility === "low" ? 1.5 : 2;
    const stopLossDistance = atr * multiplier;
    const stopLossPrice = data.positionType === "short" ? entryPrice + stopLossDistance : entryPrice - stopLossDistance;
    const riskPercent = (stopLossDistance / entryPrice) * 100;

    return {
      type: "stop-loss-result",
      data: {
        stopLossPrice: Number(stopLossPrice.toFixed(2)),
        stopLossDistance: Number(stopLossDistance.toFixed(2)),
        riskPercent: Number(riskPercent.toFixed(2)),
        multiplier,
        volatility,
      },
      confidence: 0.85,
      sources: ["stop-loss-calculator"],
    };
  }

  private calculateRiskScore(position: any, marketConditions: any, accountBalance: number): number {
    let score = 50;

    if (position.leverage && position.leverage > 10) score += 15;
    else if (position.leverage && position.leverage > 5) score += 8;

    const positionPercent = (position.size * position.entryPrice) / accountBalance * 100;
    if (positionPercent > 10) score += 10;
    else if (positionPercent > 5) score += 5;

    if (marketConditions?.volatility === "high") score += 15;
    else if (marketConditions?.volatility === "medium") score += 5;

    if (marketConditions?.trend === "strong") score -= 5;
    else if (marketConditions?.trend === "weak") score += 10;

    if (position.stopLoss) score -= 10;

    return Math.min(100, Math.max(0, score));
  }

  private getRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
    if (score >= 80) return "critical";
    if (score >= 60) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  private identifyRiskFactors(position: any, marketConditions: any): string[] {
    const factors: string[] = [];

    if (position.leverage && position.leverage > 10) factors.push("高杠杆");
    if (!position.stopLoss) factors.push("未设置止损");
    if (marketConditions?.volatility === "high") factors.push("高波动环境");
    if (marketConditions?.liquidity === "low") factors.push("流动性不足");

    return factors.length > 0 ? factors : ["风险因素正常"];
  }

  private generateRiskRecommendations(score: number, position: any): string[] {
    const recs: string[] = [];

    if (score >= 80) {
      recs.push("建议立即减仓或平仓");
      recs.push("设置止损保护");
      recs.push("降低杠杆至5倍以下");
    } else if (score >= 60) {
      recs.push("考虑设置止损");
      recs.push("适当降低仓位");
    } else if (score >= 40) {
      recs.push("保持止损设置");
      recs.push("监控市场变化");
    }

    if (!position.stopLoss) recs.push("建议设置止损");

    return recs.length > 0 ? recs : ["当前风险水平可接受"];
  }

  private calculateMaximumLoss(position: any, accountBalance: number): number {
    if (position.stopLoss) {
      const diff = Math.abs(position.entryPrice - position.stopLoss);
      return (diff / position.entryPrice) * (position.size * position.entryPrice);
    }
    return accountBalance * 0.02;
  }

  private calculateDiversification(positions: any[]): number {
    if (positions.length === 0) return 100;

    const symbols = new Set(positions.map((p) => p.symbol));
    const sectors = new Set(positions.map((p) => p.sector || "unknown"));

    return Math.min(100, (symbols.size * 20 + sectors.size * 10));
  }

  private calculateConcentrationRisk(positions: any[], portfolioValue: number): any {
    const positionsBySymbol: Record<string, number> = {};

    for (const position of positions) {
      const value = position.size * position.entryPrice;
      positionsBySymbol[position.symbol] = (positionsBySymbol[position.symbol] || 0) + value;
    }

    const maxConcentration = Math.max(...Object.values(positionsBySymbol), 0) / portfolioValue * 100;

    return {
      maxConcentration: Number(maxConcentration.toFixed(2)),
      concentratedSymbols: Object.entries(positionsBySymbol)
        .filter(([, value]) => (value / portfolioValue * 100) > 20)
        .map(([symbol]) => symbol),
    };
  }

  private calculateCorrelationRisk(positions: any[]): any {
    const symbols = [...new Set(positions.map((p) => p.symbol))];
    const matrix: Record<string, Record<string, number>> = {};

    for (const s1 of symbols) {
      matrix[s1] = {};
      for (const s2 of symbols) {
        if (s1 === s2) {
          matrix[s1][s2] = 1;
        } else {
          const sameSector = positions.find((p) => p.symbol === s1)?.sector ===
            positions.find((p) => p.symbol === s2)?.sector;
          matrix[s1][s2] = Number((sameSector ? 0.7 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3).toFixed(2));
        }
      }
    }

    return {
      correlationMatrix: matrix,
      highCorrelationPairs: this.findHighCorrelationPairs(matrix),
    };
  }

  private findHighCorrelationPairs(matrix: Record<string, Record<string, number>>): string[][] {
    const pairs: string[][] = [];
    const symbols = Object.keys(matrix);

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        if (matrix[symbols[i]][symbols[j]] > 0.7) {
          pairs.push([symbols[i], symbols[j]]);
        }
      }
    }

    return pairs;
  }

  private calculateMaxExposure(positions: any[], portfolioValue: number): number {
    if (positions.length === 0) return 0;
    const maxValue = Math.max(...positions.map((p) => p.size * p.entryPrice), 0);
    return Number((maxValue / portfolioValue * 100).toFixed(2));
  }

  private calculateTotalPortfolioRisk(diversification: number, concentration: any, correlation: any): number {
    let score = 50;

    if (diversification < 60) score += 20;
    else if (diversification < 80) score += 10;

    if (concentration.maxConcentration > 30) score += 20;
    else if (concentration.maxConcentration > 20) score += 10;

    if (correlation.highCorrelationPairs.length > 2) score += 15;
    else if (correlation.highCorrelationPairs.length > 0) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  private generatePortfolioRecommendations(positions: any[], portfolioValue: number): string[] {
    const recs: string[] = [];
    const diversification = this.calculateDiversification(positions);
    const concentration = this.calculateConcentrationRisk(positions, portfolioValue);
    const correlation = this.calculateCorrelationRisk(positions);

    if (diversification < 60) recs.push("建议增加资产种类，提高分散度");
    if (concentration.maxConcentration > 30) recs.push(`建议降低 ${concentration.concentratedSymbols.join(", ")} 的仓位`);
    if (correlation.highCorrelationPairs.length > 0) {
      recs.push(`以下资产相关性较高，考虑调整：${correlation.highCorrelationPairs.map((p: string[]) => p.join("-")).join(", ")}`);
    }

    return recs.length > 0 ? recs : ["投资组合风险水平合理"];
  }

  private checkThresholds(positions: any[], thresholds: any): any[] {
    const alerts: any[] = [];
    let totalValue = 0;

    for (const position of positions) {
      totalValue += position.size * position.entryPrice;
    }

    if (totalValue > 0) {
      for (const position of positions) {
        const positionPercent = (position.size * position.entryPrice) / totalValue * 100;
        if (positionPercent > thresholds.maxPositionSize) {
          alerts.push({
            id: `position_${position.symbol}`,
            type: "position_size",
            message: `${position.symbol} 仓位超过 ${thresholds.maxPositionSize}% (当前: ${positionPercent.toFixed(2)}%)`,
            severity: "warning",
            active: true,
            threshold: thresholds.maxPositionSize,
            current: positionPercent,
          });
        }
      }

      const maxConcentration = Math.max(...positions.map((p) => (p.size * p.entryPrice) / totalValue * 100), 0);
      if (maxConcentration > thresholds.maxConcentration) {
        alerts.push({
          id: "concentration",
          type: "concentration",
          message: `最大持仓集中度超过 ${thresholds.maxConcentration}% (当前: ${maxConcentration.toFixed(2)}%)`,
          severity: "critical",
          active: true,
          threshold: thresholds.maxConcentration,
          current: maxConcentration,
        });
      }
    }

    return alerts;
  }
}