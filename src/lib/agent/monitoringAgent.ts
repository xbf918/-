import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "market-monitoring",
    description: "市场监控",
    supportedTopics: ["price-alert", "volume-alert", "volatility-alert"],
    provides: ["alerts", "triggers", "notifications"],
  },
  {
    name: "position-monitoring",
    description: "仓位监控",
    supportedTopics: ["pnl-alert", "stop-loss", "take-profit", "liquidation"],
    provides: ["position-status", "alerts", "actions"],
  },
  {
    name: "system-monitoring",
    description: "系统监控",
    supportedTopics: ["api-status", "connection", "latency", "errors"],
    provides: ["health-status", "metrics", "warnings"],
  },
];

export class MonitoringAgent extends BaseAgent {
  private alerts: Map<string, any>;
  private monitors: Map<string, any>;
  private monitoringInterval: ReturnType<typeof setInterval> | null;
  private startTime: number | null;

  constructor() {
    super(
      "monitoring-agent",
      "监控代理",
      "monitor",
      "监控市场价格、仓位状态和系统健康，触发预警通知",
      "🔍",
      CAPABILITIES,
    );
    this.alerts = new Map();
    this.monitors = new Map();
    this.monitoringInterval = null;
    this.startTime = null;
  }

  async init(): Promise<void> {
    await super.init();
    this.startTime = Date.now();
    this.startMonitoring();
  }

  async shutdown(): Promise<void> {
    await super.shutdown();
    this.stopMonitoring();
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "create-alert":
        return this.createAlert(task.data, context);
      case "remove-alert":
        return this.removeAlert(task.data, context);
      case "get-alerts":
        return this.getAlerts(task.data, context);
      case "check-market":
        return this.checkMarket(task.data, context);
      case "check-positions":
        return this.checkPositions(task.data, context);
      case "check-system":
        return this.checkSystem(task.data, context);
      case "trigger-test":
        return this.triggerTestAlert(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async createAlert(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { type, symbol, condition, threshold, message, severity } = data;

    if (!type || !symbol || !condition || !threshold) {
      return {
        type: "error",
        data: { error: "Missing required alert parameters" },
        confidence: 0,
      };
    }

    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert = {
      id: alertId,
      type: type as "price" | "volume" | "volatility" | "pnl" | "system",
      symbol,
      condition: condition as "above" | "below" | "cross" | "change",
      threshold: Number(threshold),
      message: message || `${symbol} ${condition} ${threshold}`,
      severity: severity || "warning",
      enabled: true,
      triggered: false,
      lastTriggered: null,
      createdAt: Date.now(),
    };

    this.alerts.set(alertId, alert);

    return {
      type: "alert-created",
      data: {
        alertId,
        type,
        symbol,
        condition,
        threshold,
        message,
        severity,
      },
      confidence: 0.95,
      sources: ["monitoring-system"],
    };
  }

  private async removeAlert(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const alertId = data.alertId;

    if (!alertId) {
      return {
        type: "error",
        data: { error: "Alert ID required" },
        confidence: 0,
      };
    }

    const alert = this.alerts.get(alertId);

    if (!alert) {
      return {
        type: "error",
        data: { error: "Alert not found" },
        confidence: 0,
      };
    }

    this.alerts.delete(alertId);

    return {
      type: "alert-removed",
      data: {
        alertId,
        symbol: alert.symbol,
      },
      confidence: 0.95,
      sources: ["monitoring-system"],
    };
  }

  private async getAlerts(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { symbol, type, triggered } = data;

    let alerts = Array.from(this.alerts.values());

    if (symbol) {
      alerts = alerts.filter((a) => a.symbol === symbol);
    }
    if (type) {
      alerts = alerts.filter((a) => a.type === type);
    }
    if (triggered !== undefined) {
      alerts = alerts.filter((a) => a.triggered === triggered);
    }

    return {
      type: "alerts-result",
      data: {
        alerts,
        total: alerts.length,
        activeCount: alerts.filter((a) => a.enabled && !a.triggered).length,
        triggeredCount: alerts.filter((a) => a.triggered).length,
      },
      confidence: 0.95,
      sources: ["monitoring-system"],
    };
  }

  private async checkMarket(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { symbol, price, volume, volatility } = data;

    const alerts = this.alerts.values();
    const triggeredAlerts: any[] = [];

    for (const alert of alerts) {
      if (!alert.enabled || alert.type !== "price") continue;

      const triggered = this.checkPriceCondition(alert, price);
      if (triggered) {
        alert.triggered = true;
        alert.lastTriggered = Date.now();
        triggeredAlerts.push(alert);
      }
    }

    return {
      type: "market-check-result",
      data: {
        symbol,
        price,
        volume,
        volatility,
        triggeredAlerts,
        totalAlerts: triggeredAlerts.length,
      },
      confidence: 0.9,
      sources: ["market-monitor"],
      warnings: triggeredAlerts.map((a) => a.message),
    };
  }

  private async checkPositions(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const positions = data.positions || [];

    const positionAlerts: any[] = [];

    for (const position of positions) {
      const unrealizedPnl = this.calculateUnrealizedPnl(position);
      const pnlPercent = (unrealizedPnl / (position.entryPrice * position.quantity)) * 100;

      if (position.stopLoss && position.side === "long" && position.markPrice <= position.stopLoss) {
        positionAlerts.push({
          type: "stop-loss",
          symbol: position.symbol,
          message: `${position.symbol} 触发止损: 当前价格 ${position.markPrice} <= 止损价 ${position.stopLoss}`,
          severity: "critical",
          positionId: position.id,
        });
      }

      if (position.stopLoss && position.side === "short" && position.markPrice >= position.stopLoss) {
        positionAlerts.push({
          type: "stop-loss",
          symbol: position.symbol,
          message: `${position.symbol} 触发止损: 当前价格 ${position.markPrice} >= 止损价 ${position.stopLoss}`,
          severity: "critical",
          positionId: position.id,
        });
      }

      if (position.takeProfit && position.side === "long" && position.markPrice >= position.takeProfit) {
        positionAlerts.push({
          type: "take-profit",
          symbol: position.symbol,
          message: `${position.symbol} 触发止盈: 当前价格 ${position.markPrice} >= 止盈价 ${position.takeProfit}`,
          severity: "success",
          positionId: position.id,
        });
      }

      if (position.takeProfit && position.side === "short" && position.markPrice <= position.takeProfit) {
        positionAlerts.push({
          type: "take-profit",
          symbol: position.symbol,
          message: `${position.symbol} 触发止盈: 当前价格 ${position.markPrice} <= 止盈价 ${position.takeProfit}`,
          severity: "success",
          positionId: position.id,
        });
      }

      if (position.liquidationPrice && position.side === "long" && position.markPrice <= position.liquidationPrice * 1.05) {
        positionAlerts.push({
          type: "liquidation-warning",
          symbol: position.symbol,
          message: `${position.symbol} 接近强平价: 当前价格 ${position.markPrice}，强平价 ${position.liquidationPrice}`,
          severity: "critical",
          positionId: position.id,
        });
      }

      if (pnlPercent < -10) {
        positionAlerts.push({
          type: "pnl-warning",
          symbol: position.symbol,
          message: `${position.symbol} 亏损超过10%: ${pnlPercent.toFixed(2)}%`,
          severity: "warning",
          positionId: position.id,
        });
      }
    }

    return {
      type: "positions-check-result",
      data: {
        positions: positions.length,
        alerts: positionAlerts,
        criticalAlerts: positionAlerts.filter((a) => a.severity === "critical").length,
        warningAlerts: positionAlerts.filter((a) => a.severity === "warning").length,
      },
      confidence: 0.95,
      sources: ["position-monitor"],
      warnings: positionAlerts.filter((a) => a.severity !== "success").map((a) => a.message),
    };
  }

  private async checkSystem(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const healthStatus = this.getSystemHealth();

    return {
      type: "system-check-result",
      data: healthStatus,
      confidence: 0.95,
      sources: ["system-monitor"],
      warnings: healthStatus.warnings,
    };
  }

  private async triggerTestAlert(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { type, symbol, threshold } = data;

    const testAlert = {
      id: `test_${Date.now()}`,
      type: type || "price",
      symbol: symbol || "BTCUSDT",
      condition: "above",
      threshold: threshold || 60000,
      message: `测试警报触发: ${symbol} ${type} 测试`,
      severity: "warning",
      triggered: true,
      lastTriggered: Date.now(),
    };

    return {
      type: "test-alert-triggered",
      data: testAlert,
      confidence: 1.0,
      sources: ["test"],
      warnings: [testAlert.message],
    };
  }

  private checkPriceCondition(alert: any, currentPrice: number): boolean {
    if (!currentPrice) return false;

    switch (alert.condition) {
      case "above":
        return currentPrice > alert.threshold;
      case "below":
        return currentPrice < alert.threshold;
      case "cross":
        return Math.abs(currentPrice - alert.threshold) < alert.threshold * 0.001;
      case "change":
        return Math.abs(currentPrice - alert.threshold) / alert.threshold * 100 > 1;
      default:
        return false;
    }
  }

  private calculateUnrealizedPnl(position: any): number {
    if (!position.markPrice || !position.entryPrice || !position.quantity) return 0;

    return position.side === "long"
      ? (position.markPrice - position.entryPrice) * position.quantity * (position.leverage || 1)
      : (position.entryPrice - position.markPrice) * position.quantity * (position.leverage || 1);
  }

  private getSystemHealth(): any {
    const now = Date.now();
    const latency = Math.floor(Math.random() * 100) + 50;

    const uptimeSeconds = this.startTime
      ? Math.floor((now - this.startTime) / 1000)
      : 0;

    const warnings: string[] = [];

    if (latency > 200) {
      warnings.push(`高延迟警告: ${latency}ms`);
    }

    const services = [
      { name: "exchange-api", status: "healthy", latency: Math.floor(Math.random() * 80) + 30 },
      { name: "data-feed", status: "healthy", latency: Math.floor(Math.random() * 60) + 20 },
      { name: "strategy-engine", status: "healthy", latency: Math.floor(Math.random() * 40) + 10 },
      { name: "database", status: "healthy", latency: Math.floor(Math.random() * 20) + 5 },
    ];

    const memUsed = Math.floor(Math.random() * 200 + 100);
    const memTotal = Math.floor(memUsed * (1.5 + Math.random()));

    return {
      timestamp: now,
      status: warnings.length === 0 ? "healthy" : "degraded",
      uptime: this.formatUptime(uptimeSeconds),
      latency,
      memoryUsage: {
        used: memUsed,
        total: memTotal,
        percent: Number(((memUsed / memTotal) * 100).toFixed(1)),
      },
      cpuUsage: Number((Math.random() * 20 + 5).toFixed(1)),
      services,
      warnings,
    };
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
      return `${days}天 ${hours}小时 ${minutes}分钟`;
    }
    if (hours > 0) {
      return `${hours}小时 ${minutes}分钟 ${secs}秒`;
    }
    return `${minutes}分钟 ${secs}秒`;
  }

  private startMonitoring(): void {
    if (this.monitoringInterval) return;

    this.monitoringInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, 10000);
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private async runMonitoringCycle(): Promise<void> {
    const priceAlerts = Array.from(this.alerts.values()).filter((a) => a.type === "price" && a.enabled);

    for (const alert of priceAlerts) {
      const mockPrice = this.getMockPrice(alert.symbol);
      if (this.checkPriceCondition(alert, mockPrice)) {
        alert.triggered = true;
        alert.lastTriggered = Date.now();
      }
    }
  }

  private getMockPrice(symbol: string): number {
    const basePrices: Record<string, number> = {
      BTCUSDT: 67000,
      ETHUSDT: 3500,
      SOLUSDT: 170,
    };

    const basePrice = basePrices[symbol] || 100;
    return basePrice * (1 + (Math.random() - 0.5) * 0.005);
  }
}