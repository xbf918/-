import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "performance-analysis",
    description: "交易绩效分析",
    supportedTopics: ["trade-analysis", "pnl-breakdown", "win-rate", "drawdown"],
    provides: ["metrics", "charts", "insights"],
  },
  {
    name: "log-analysis",
    description: "日志分析",
    supportedTopics: ["error-analysis", "system-logs", "performance-logs"],
    provides: ["errors", "patterns", "recommendations"],
  },
  {
    name: "compliance-audit",
    description: "合规审计",
    supportedTopics: ["risk-policy", "position-limits", "trade-rules"],
    provides: ["violations", "warnings", "compliance-score"],
  },
];

export class PerformanceAuditorAgent extends BaseAgent {
  private tradeLogs: any[];
  private systemLogs: any[];

  constructor() {
    super(
      "performance-auditor",
      "日志分析代理",
      "auditor",
      "分析交易绩效、审查系统日志、进行合规审计",
      "📝",
      CAPABILITIES,
    );
    this.tradeLogs = [];
    this.systemLogs = [];
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "analyze-trades":
        return this.analyzeTrades(task.data, context);
      case "analyze-logs":
        return this.analyzeLogs(task.data, context);
      case "compliance-audit":
        return this.complianceAudit(task.data, context);
      case "generate-report":
        return this.generateReport(task.data, context);
      case "add-trade-log":
        return this.addTradeLog(task.data, context);
      case "add-system-log":
        return this.addSystemLog(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async analyzeTrades(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { startTime, endTime, symbol } = data;

    let trades = this.tradeLogs;

    if (startTime) {
      trades = trades.filter((t) => t.timestamp >= startTime);
    }
    if (endTime) {
      trades = trades.filter((t) => t.timestamp <= endTime);
    }
    if (symbol) {
      trades = trades.filter((t) => t.symbol === symbol);
    }

    const metrics = this.calculateTradeMetrics(trades);

    return {
      type: "trade-analysis-result",
      data: {
        ...metrics,
        trades,
        totalTrades: trades.length,
        timeRange: { startTime, endTime },
      },
      confidence: 0.75,
      sources: ["trade-logs"],
    };
  }

  private async analyzeLogs(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { startTime, endTime, level } = data;

    let logs = this.systemLogs;

    if (startTime) {
      logs = logs.filter((l) => l.timestamp >= startTime);
    }
    if (endTime) {
      logs = logs.filter((l) => l.timestamp <= endTime);
    }
    if (level) {
      logs = logs.filter((l) => l.level === level);
    }

    const analysis = this.analyzeSystemLogs(logs);

    return {
      type: "log-analysis-result",
      data: {
        ...analysis,
        logs,
        totalLogs: logs.length,
      },
      confidence: 0.8,
      sources: ["system-logs"],
      warnings: analysis.criticalErrors.map((e: any) => e.message),
    };
  }

  private async complianceAudit(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { positions, trades, policies } = data;

    const violations = this.checkCompliance(positions, trades, policies);

    return {
      type: "compliance-audit-result",
      data: {
        violations,
        complianceScore: this.calculateComplianceScore(violations),
        totalChecks: violations.totalChecks,
        passedChecks: violations.passedChecks,
        failedChecks: violations.failedChecks,
      },
      confidence: 0.85,
      sources: ["compliance-engine"],
      warnings: violations.issues.map((i: any) => i.message),
    };
  }

  private async generateReport(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { reportType, startTime, endTime } = data;

    const report = this.createReport(reportType || "daily", startTime, endTime);

    return {
      type: "report-result",
      data: report,
      confidence: 0.7,
      sources: ["report-generator"],
    };
  }

  private async addTradeLog(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const trade = {
      id: `trade_${Date.now()}`,
      timestamp: Date.now(),
      ...data,
    };

    this.tradeLogs.push(trade);

    return {
      type: "log-added",
      data: {
        id: trade.id,
        symbol: (trade as any).symbol || "unknown",
        timestamp: trade.timestamp,
      },
      confidence: 0.95,
      sources: ["trade-logs"],
    };
  }

  private async addSystemLog(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const log = {
      id: `log_${Date.now()}`,
      timestamp: Date.now(),
      level: data.level || "info",
      message: data.message,
      source: data.source || "system",
      ...data,
    };

    this.systemLogs.push(log);

    return {
      type: "log-added",
      data: {
        id: log.id,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
      },
      confidence: 0.95,
      sources: ["system-logs"],
    };
  }

  private calculateTradeMetrics(trades: any[]): any {
    if (trades.length === 0) {
      return {
        totalPnl: 0,
        totalPnlPercent: 0,
        winRate: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        avgTradePnl: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: null,
        worstTrade: null,
        dailyPnl: [],
        hourlyPnl: [],
      };
    }

    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);

    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalWin = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLoss = losses.reduce((sum, t) => Math.abs(sum + (t.pnl || 0)), 0);

    const winRate = (wins.length / trades.length) * 100;
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : Infinity;

    let maxDrawdown = 0;
    let peak = 0;
    let cumulative = 0;
    for (const trade of trades.sort((a, b) => a.timestamp - b.timestamp)) {
      cumulative += trade.pnl || 0;
      if (cumulative > peak) peak = cumulative;
      const drawdown = (peak - cumulative) / peak * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const avgTradePnl = totalPnl / trades.length;
    const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;

    const bestTrade = trades.reduce((best, t) => (t.pnl > best.pnl ? t : best), trades[0]);
    const worstTrade = trades.reduce((worst, t) => (t.pnl < worst.pnl ? t : worst), trades[0]);

    const dailyPnl = this.aggregateByDay(trades);
    const hourlyPnl = this.aggregateByHour(trades);

    return {
      totalPnl: Number(totalPnl.toFixed(2)),
      totalPnlPercent: Number(((totalPnl / 10000) * 100).toFixed(2)),
      winRate: Number(winRate.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      avgTradePnl: Number(avgTradePnl.toFixed(2)),
      avgWin: Number(avgWin.toFixed(2)),
      avgLoss: Number(avgLoss.toFixed(2)),
      bestTrade,
      worstTrade,
      dailyPnl,
      hourlyPnl,
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
    };
  }

  private aggregateByDay(trades: any[]): any[] {
    const daily: Record<string, number> = {};

    for (const trade of trades) {
      const day = new Date(trade.timestamp).toISOString().slice(0, 10);
      daily[day] = (daily[day] || 0) + (trade.pnl || 0);
    }

    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, pnl]) => ({ day, pnl: Number(pnl.toFixed(2)) }));
  }

  private aggregateByHour(trades: any[]): any[] {
    const hourly: Record<string, number> = {};

    for (const trade of trades) {
      const hour = new Date(trade.timestamp).toISOString().slice(0, 13);
      hourly[hour] = (hourly[hour] || 0) + (trade.pnl || 0);
    }

    return Object.entries(hourly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([hour, pnl]) => ({ hour, pnl: Number(pnl.toFixed(2)) }));
  }

  private analyzeSystemLogs(logs: any[]): any {
    const errors = logs.filter((l) => l.level === "error");
    const warnings = logs.filter((l) => l.level === "warning");
    const criticalErrors = errors.filter((e) => e.critical);

    const errorPatterns = this.detectErrorPatterns(errors);
    const topErrorSources = this.getTopErrorSources(errors);

    return {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      criticalErrors,
      errorPatterns,
      topErrorSources,
      uptime: this.calculateUptime(logs),
      averageResponseTime: this.calculateAverageResponseTime(logs),
    };
  }

  private detectErrorPatterns(errors: any[]): any[] {
    const patterns: Record<string, number> = {};

    for (const error of errors) {
      const message = error.message || "";
      const pattern = message.match(/(Timeout|Connection|API|Rate limit|Authentication)/)?.[0] || "Other";
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    }

    return Object.entries(patterns)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getTopErrorSources(errors: any[]): any[] {
    const sources: Record<string, number> = {};

    for (const error of errors) {
      const source = error.source || "unknown";
      sources[source] = (sources[source] || 0) + 1;
    }

    return Object.entries(sources)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private calculateUptime(logs: any[]): string {
    const now = Date.now();
    const start = logs.length > 0 ? Math.min(...logs.map((l) => l.timestamp)) : now;
    const uptimeSeconds = (now - start) / 1000;

    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    return `${minutes}分钟`;
  }

  private calculateAverageResponseTime(logs: any[]): number {
    const responseTimes = logs.filter((l) => l.responseTime).map((l) => l.responseTime);
    if (responseTimes.length === 0) return 0;
    return Number((responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length).toFixed(2));
  }

  private checkCompliance(positions: any[], trades: any[], policies: any): any {
    const issues: any[] = [];
    let totalChecks = 0;
    let passedChecks = 0;
    let failedChecks = 0;

    const defaultPolicies = {
      maxPositionSize: 10,
      maxLeverage: 20,
      maxDrawdown: 20,
      maxOpenPositions: 10,
      minWinRate: 40,
    };

    const effectivePolicies = { ...defaultPolicies, ...policies };

    totalChecks++;
    if (positions.length > effectivePolicies.maxOpenPositions) {
      issues.push({
        type: "position-limit",
        message: `开仓数量超过限制: ${positions.length} > ${effectivePolicies.maxOpenPositions}`,
        severity: "warning",
      });
      failedChecks++;
    } else {
      passedChecks++;
    }

    for (const position of positions) {
      totalChecks++;
      if (position.leverage && position.leverage > effectivePolicies.maxLeverage) {
        issues.push({
          type: "leverage-limit",
          message: `${position.symbol} 杠杆超过限制: ${position.leverage}x > ${effectivePolicies.maxLeverage}x`,
          severity: "critical",
        });
        failedChecks++;
      } else {
        passedChecks++;
      }
    }

    const tradeMetrics = this.calculateTradeMetrics(trades);
    totalChecks++;
    if (tradeMetrics.winRate < effectivePolicies.minWinRate) {
      issues.push({
        type: "win-rate",
        message: `胜率低于要求: ${tradeMetrics.winRate}% < ${effectivePolicies.minWinRate}%`,
        severity: "warning",
      });
      failedChecks++;
    } else {
      passedChecks++;
    }

    totalChecks++;
    if (tradeMetrics.maxDrawdown > effectivePolicies.maxDrawdown) {
      issues.push({
        type: "drawdown",
        message: `最大回撤超过限制: ${tradeMetrics.maxDrawdown}% > ${effectivePolicies.maxDrawdown}%`,
        severity: "critical",
      });
      failedChecks++;
    } else {
      passedChecks++;
    }

    return {
      issues,
      totalChecks,
      passedChecks,
      failedChecks,
      policies: effectivePolicies,
    };
  }

  private calculateComplianceScore(violations: any): number {
    if (violations.totalChecks === 0) return 100;

    const criticalIssues = violations.issues.filter((i: any) => i.severity === "critical").length;
    const warningIssues = violations.issues.filter((i: any) => i.severity === "warning").length;

    let score = (violations.passedChecks / violations.totalChecks) * 100;
    score -= criticalIssues * 10;
    score -= warningIssues * 5;

    return Math.max(0, Math.min(100, Number(score.toFixed(2))));
  }

  private createReport(reportType: string, startTime?: number, endTime?: number): any {
    const tradeMetrics = this.calculateTradeMetrics(this.tradeLogs);
    const logAnalysis = this.analyzeSystemLogs(this.systemLogs);

    const report: any = {
      reportType,
      generatedAt: Date.now(),
      timeRange: {
        startTime: startTime || Date.now() - 86400000,
        endTime: endTime || Date.now(),
      },
    };

    switch (reportType) {
      case "daily":
        report.summary = {
          title: "每日交易报告",
          date: new Date().toISOString().slice(0, 10),
          totalTrades: tradeMetrics.totalTrades,
          totalPnl: tradeMetrics.totalPnl,
          winRate: tradeMetrics.winRate,
          profitFactor: tradeMetrics.profitFactor,
          maxDrawdown: tradeMetrics.maxDrawdown,
        };
        report.dailyPnl = tradeMetrics.dailyPnl.slice(-7);
        report.systemStatus = {
          errors: logAnalysis.totalErrors,
          warnings: logAnalysis.totalWarnings,
          uptime: logAnalysis.uptime,
        };
        break;

      case "weekly":
        report.summary = {
          title: "每周交易报告",
          week: new Date().toISOString().slice(0, 10),
          totalTrades: tradeMetrics.totalTrades,
          totalPnl: tradeMetrics.totalPnl,
          winRate: tradeMetrics.winRate,
          profitFactor: tradeMetrics.profitFactor,
          maxDrawdown: tradeMetrics.maxDrawdown,
        };
        report.weeklyPnl = tradeMetrics.dailyPnl.slice(-7);
        report.topSymbols = this.getTopSymbols(this.tradeLogs);
        report.systemStatus = logAnalysis;
        break;

      case "performance":
        report.summary = {
          title: "绩效分析报告",
          totalPnl: tradeMetrics.totalPnl,
          winRate: tradeMetrics.winRate,
          profitFactor: tradeMetrics.profitFactor,
          maxDrawdown: tradeMetrics.maxDrawdown,
        };
        report.metrics = tradeMetrics;
        report.analysis = {
          strengths: this.identifyStrengths(tradeMetrics),
          weaknesses: this.identifyWeaknesses(tradeMetrics),
          recommendations: this.generateRecommendations(tradeMetrics),
        };
        break;

      default:
        report.summary = {
          title: "综合报告",
          totalTrades: tradeMetrics.totalTrades,
          totalPnl: tradeMetrics.totalPnl,
          errors: logAnalysis.totalErrors,
        };
        report.tradeMetrics = tradeMetrics;
        report.logAnalysis = logAnalysis;
    }

    return report;
  }

  private getTopSymbols(trades: any[]): any[] {
    const symbols: Record<string, { pnl: number; count: number }> = {};

    for (const trade of trades) {
      if (!symbols[trade.symbol]) {
        symbols[trade.symbol] = { pnl: 0, count: 0 };
      }
      symbols[trade.symbol].pnl += trade.pnl || 0;
      symbols[trade.symbol].count++;
    }

    return Object.entries(symbols)
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5);
  }

  private identifyStrengths(metrics: any): string[] {
    const strengths: string[] = [];

    if (metrics.winRate > 50) strengths.push("胜率高于50%");
    if (metrics.profitFactor > 1.5) strengths.push("盈亏比合理");
    if (metrics.maxDrawdown < 20) strengths.push("回撤控制良好");
    if (metrics.totalPnl > 0) strengths.push("总体盈利");

    return strengths.length > 0 ? strengths : ["交易表现稳定"];
  }

  private identifyWeaknesses(metrics: any): string[] {
    const weaknesses: string[] = [];

    if (metrics.winRate < 45) weaknesses.push("胜率偏低");
    if (metrics.profitFactor < 1.2) weaknesses.push("盈亏比较低");
    if (metrics.maxDrawdown > 30) weaknesses.push("回撤过大");
    if (metrics.totalPnl < 0) weaknesses.push("总体亏损");

    return weaknesses.length > 0 ? weaknesses : ["交易表现正常"];
  }

  private generateRecommendations(metrics: any): string[] {
    const recs: string[] = [];

    if (metrics.winRate < 45) recs.push("优化入场时机，提高胜率");
    if (metrics.profitFactor < 1.5) recs.push("调整止盈策略，提高盈亏比");
    if (metrics.maxDrawdown > 25) recs.push("增加止损保护，控制回撤");
    if (metrics.totalTrades < 100) recs.push("增加交易样本量以验证策略");

    return recs.length > 0 ? recs : ["当前策略表现良好，继续执行"];
  }
}