import { BaseAgent } from "./baseAgent";
import type { AgentInput, AgentOutput, TaskContext, AgentCapability } from "./types";

const CAPABILITIES: AgentCapability[] = [
  {
    name: "order-execution",
    description: "执行交易订单",
    supportedTopics: ["place-order", "cancel-order", "modify-order"],
    provides: ["order-id", "status", "filled-price"],
  },
  {
    name: "execution-algorithms",
    description: "执行算法（限价单、市价单、冰山单等）",
    supportedTopics: ["limit-order", "market-order", "iceberg", "TWAP", "VWAP"],
    provides: ["algorithm", "execution-details", "slippage"],
  },
  {
    name: "position-management",
    description: "仓位管理",
    supportedTopics: ["open-position", "close-position", "partial-close", "rollover"],
    provides: ["position-id", "pnl", "status"],
  },
];

export class ExecutionAgent extends BaseAgent {
  private orders: Map<string, any>;
  private positions: Map<string, any>;

  constructor() {
    super(
      "execution-agent",
      "交易执行代理",
      "executor",
      "执行交易订单、管理仓位、支持多种执行算法",
      "🚀",
      CAPABILITIES,
    );
    this.orders = new Map();
    this.positions = new Map();
  }

  protected async processTask(task: AgentInput, context?: TaskContext): Promise<AgentOutput> {
    switch (task.type) {
      case "place-order":
        return this.placeOrder(task.data, context);
      case "cancel-order":
        return this.cancelOrder(task.data, context);
      case "modify-order":
        return this.modifyOrder(task.data, context);
      case "open-position":
        return this.openPosition(task.data, context);
      case "close-position":
        return this.closePosition(task.data, context);
      case "get-orders":
        return this.getOrders(task.data, context);
      case "get-positions":
        return this.getPositions(task.data, context);
      default:
        return {
          type: "error",
          data: { error: `Unknown task type: ${task.type}` },
          confidence: 0,
        };
    }
  }

  private async placeOrder(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { symbol, side, type, quantity, price, stopPrice, timeInForce } = data;

    if (!symbol || !side || !type || !quantity) {
      return {
        type: "error",
        data: { error: "Missing required order parameters" },
        confidence: 0,
      };
    }

    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const order = {
      id: orderId,
      symbol,
      side: side as "buy" | "sell",
      type: type as "limit" | "market" | "stop" | "stop-limit",
      quantity: Number(quantity),
      price: price ? Number(price) : null,
      stopPrice: stopPrice ? Number(stopPrice) : null,
      timeInForce: timeInForce || "GTC",
      status: type === "market" ? "filled" : "pending",
      filledQuantity: type === "market" ? Number(quantity) : 0,
      filledPrice: type === "market" ? this.getMarketPrice(symbol) : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(orderId, order);

    if (type === "market") {
      await this.simulateFill(order);
    }

    return {
      type: "order-placed",
      data: {
        orderId,
        status: order.status,
        symbol,
        side,
        type,
        quantity,
        filledQuantity: order.filledQuantity,
        filledPrice: order.filledPrice,
        estimatedSlippage: this.calculateSlippage(order),
      },
      confidence: type === "market" ? 0.95 : 0.9,
      sources: ["exchange-api"],
    };
  }

  private async cancelOrder(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const orderId = data.orderId;

    if (!orderId) {
      return {
        type: "error",
        data: { error: "Order ID required" },
        confidence: 0,
      };
    }

    const order = this.orders.get(orderId);

    if (!order) {
      return {
        type: "error",
        data: { error: "Order not found" },
        confidence: 0,
      };
    }

    if (order.status === "filled" || order.status === "cancelled") {
      return {
        type: "error",
        data: { error: "Cannot cancel order with status: " + order.status },
        confidence: 0,
      };
    }

    order.status = "cancelled";
    order.updatedAt = Date.now();

    return {
      type: "order-cancelled",
      data: {
        orderId,
        status: "cancelled",
        symbol: order.symbol,
      },
      confidence: 0.95,
      sources: ["exchange-api"],
    };
  }

  private async modifyOrder(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { orderId, price, quantity, stopPrice } = data;

    if (!orderId) {
      return {
        type: "error",
        data: { error: "Order ID required" },
        confidence: 0,
      };
    }

    const order = this.orders.get(orderId);

    if (!order) {
      return {
        type: "error",
        data: { error: "Order not found" },
        confidence: 0,
      };
    }

    if (order.status === "filled" || order.status === "cancelled") {
      return {
        type: "error",
        data: { error: "Cannot modify order with status: " + order.status },
        confidence: 0,
      };
    }

    if (price) order.price = Number(price);
    if (quantity) order.quantity = Number(quantity);
    if (stopPrice) order.stopPrice = Number(stopPrice);
    order.updatedAt = Date.now();

    return {
      type: "order-modified",
      data: {
        orderId,
        status: order.status,
        price: order.price,
        quantity: order.quantity,
        stopPrice: order.stopPrice,
      },
      confidence: 0.9,
      sources: ["exchange-api"],
    };
  }

  private async openPosition(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { symbol, side, quantity, leverage, entryPrice, stopLoss, takeProfit } = data;

    if (!symbol || !side || !quantity) {
      return {
        type: "error",
        data: { error: "Missing required position parameters" },
        confidence: 0,
      };
    }

    const positionId = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const actualEntryPrice = entryPrice || this.getMarketPrice(symbol);

    const posBase = {
      id: positionId,
      symbol,
      side: side as "long" | "short",
      quantity: Number(quantity),
      leverage: leverage || 1,
      entryPrice: Number(actualEntryPrice),
      markPrice: Number(actualEntryPrice),
      stopLoss: stopLoss ? Number(stopLoss) : null,
      takeProfit: takeProfit ? Number(takeProfit) : null,
      unrealizedPnl: 0,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const position = {
      ...posBase,
      liquidationPrice: this.calculateLiquidationPrice(posBase),
    };

    this.positions.set(positionId, position);

    return {
      type: "position-opened",
      data: {
        positionId,
        symbol,
        side,
        quantity,
        leverage,
        entryPrice: actualEntryPrice,
        stopLoss,
        takeProfit,
        liquidationPrice: position.liquidationPrice,
        status: "open",
      },
      confidence: 0.95,
      sources: ["exchange-api"],
    };
  }

  private async closePosition(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const positionId = data.positionId;
    const quantity = data.quantity;

    if (!positionId) {
      return {
        type: "error",
        data: { error: "Position ID required" },
        confidence: 0,
      };
    }

    const position = this.positions.get(positionId);

    if (!position) {
      return {
        type: "error",
        data: { error: "Position not found" },
        confidence: 0,
      };
    }

    if (position.status !== "open") {
      return {
        type: "error",
        data: { error: "Position is not open" },
        confidence: 0,
      };
    }

    const closeQuantity = quantity ? Number(quantity) : position.quantity;
    const currentPrice = this.getMarketPrice(position.symbol);

    const pnl = position.side === "long"
      ? (currentPrice - position.entryPrice) / position.entryPrice * closeQuantity * position.leverage
      : (position.entryPrice - currentPrice) / position.entryPrice * closeQuantity * position.leverage;

    position.quantity -= closeQuantity;
    position.markPrice = currentPrice;
    position.updatedAt = Date.now();

    if (position.quantity <= 0) {
      position.status = "closed";
      position.unrealizedPnl = 0;
    } else {
      position.unrealizedPnl = this.calculateUnrealizedPnl(position);
    }

    return {
      type: "position-closed",
      data: {
        positionId,
        symbol: position.symbol,
        side: position.side,
        closedQuantity: closeQuantity,
        remainingQuantity: position.quantity,
        exitPrice: currentPrice,
        pnl: Number(pnl.toFixed(2)),
        pnlPercent: Number(((pnl / (position.entryPrice * closeQuantity)) * 100).toFixed(2)),
        status: position.status,
      },
      confidence: 0.95,
      sources: ["exchange-api"],
    };
  }

  private async getOrders(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { symbol, status } = data;

    let orders = Array.from(this.orders.values());

    if (symbol) {
      orders = orders.filter((o) => o.symbol === symbol);
    }
    if (status) {
      orders = orders.filter((o) => o.status === status);
    }

    return {
      type: "orders-result",
      data: {
        orders,
        total: orders.length,
      },
      confidence: 0.95,
      sources: ["exchange-api"],
    };
  }

  private async getPositions(data: Record<string, any>, _context?: TaskContext): Promise<AgentOutput> {
    const { symbol, status } = data;

    let positions = Array.from(this.positions.values());

    if (symbol) {
      positions = positions.filter((p) => p.symbol === symbol);
    }
    if (status) {
      positions = positions.filter((p) => p.status === status);
    }

    positions.forEach((p) => {
      p.markPrice = this.getMarketPrice(p.symbol);
      p.unrealizedPnl = this.calculateUnrealizedPnl(p);
    });

    return {
      type: "positions-result",
      data: {
        positions,
        total: positions.length,
        totalUnrealizedPnl: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
      },
      confidence: 0.95,
      sources: ["exchange-api"],
    };
  }

  private async simulateFill(order: any): Promise<void> {
    setTimeout(() => {
      order.status = "filled";
      order.filledQuantity = order.quantity;
      order.filledPrice = this.getMarketPrice(order.symbol);
      order.updatedAt = Date.now();
    }, 100 + Math.random() * 200);
  }

  private getMarketPrice(symbol: string): number {
    const basePrices: Record<string, number> = {
      BTCUSDT: 67000,
      ETHUSDT: 3500,
      SOLUSDT: 170,
    };

    const basePrice = basePrices[symbol] || 100;
    const variation = basePrice * (Math.random() - 0.5) * 0.002;

    return Number((basePrice + variation).toFixed(2));
  }

  private calculateSlippage(order: any): number {
    if (!order.filledPrice || !order.price) return 0;

    const slippage = Math.abs(order.filledPrice - order.price) / order.price * 100;
    return Number(slippage.toFixed(4));
  }

  private calculateLiquidationPrice(position: any): number {
    if (!position.leverage || position.leverage <= 1) {
      return position.side === "long" ? 0 : Infinity;
    }

    const maintenanceMargin = 0.005;
    const liquidationPrice = position.side === "long"
      ? position.entryPrice * (1 - 1 / position.leverage + maintenanceMargin)
      : position.entryPrice * (1 + 1 / position.leverage - maintenanceMargin);

    return Number(liquidationPrice.toFixed(2));
  }

  private calculateUnrealizedPnl(position: any): number {
    if (!position.markPrice || !position.entryPrice) return 0;

    const pnl = position.side === "long"
      ? (position.markPrice - position.entryPrice) / position.entryPrice * position.quantity * position.leverage
      : (position.entryPrice - position.markPrice) / position.entryPrice * position.quantity * position.leverage;

    return Number(pnl.toFixed(2));
  }
}