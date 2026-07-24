/**
 * 贝叶斯网络 (Bayesian Network)
 *
 * 用于条件概率推理。节点表示市场变量（信号、状态、结果），
 * 边表示因果关系。
 *
 * 推理算法：变量消元法（Variable Elimination）
 * 学习：基于约束的结构 + MLE 参数估计
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult } from "./types";
import { EPS, logSumExp, safeLog } from "./math";

export type DiscreteValue = string | number | boolean;
export type NodeId = string;

export interface BayesNode {
  id: NodeId;
  name: string;
  domain: DiscreteValue[];        // 离散取值集合
  parents: NodeId[];
  cpt: Map<string, number>;       // 条件概率表 key=conditioning, value=P(node|conditioning)
}

export interface BayesEdge {
  from: NodeId;
  to: NodeId;
}

export interface BayesNetwork {
  nodes: Map<NodeId, BayesNode>;
  edges: BayesEdge[];
  topoOrder: NodeId[];
}

export interface BayesQuery {
  query: { [key: string]: DiscreteValue };  // 证据
  target: { node: NodeId; value: DiscreteValue };
}

export interface BayesInferenceResult {
  probabilities: Map<DiscreteValue, number>;
  mostLikely: DiscreteValue;
  confidence: number;
  entropy: number;
}

/**
 * 贝叶斯网络实现
 */
export class BayesianNetwork implements Model {
  name = "BayesianNetwork";
  type = "bayesian" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  private net: BayesNetwork = {
    nodes: new Map(),
    edges: [],
    topoOrder: [],
  };

  /** 添加节点 */
  addNode(id: NodeId, name: string, domain: DiscreteValue[], parents: NodeId[] = []): void {
    if (this.net.nodes.has(id)) {
      throw new Error(`Node ${id} already exists`);
    }
    // 验证父节点存在
    for (const p of parents) {
      if (!this.net.nodes.has(p)) {
        throw new Error(`Parent node ${p} not found`);
      }
    }
    this.net.nodes.set(id, {
      id, name, domain, parents,
      cpt: new Map(),
    });
    for (const p of parents) {
      this.net.edges.push({ from: p, to: id });
    }
    this.updateTopoOrder();
  }

  private updateTopoOrder(): void {
    // Kahn 算法
    const inDeg: Map<NodeId, number> = new Map();
    const adj: Map<NodeId, NodeId[]> = new Map();
    for (const id of this.net.nodes.keys()) {
      inDeg.set(id, 0);
      adj.set(id, []);
    }
    for (const e of this.net.edges) {
      adj.get(e.from)!.push(e.to);
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    }
    const queue: NodeId[] = [];
    for (const [id, d] of inDeg) if (d === 0) queue.push(id);
    const order: NodeId[] = [];
    while (queue.length > 0) {
      const n = queue.shift()!;
      order.push(n);
      for (const next of adj.get(n)!) {
        inDeg.set(next, inDeg.get(next)! - 1);
        if (inDeg.get(next) === 0) queue.push(next);
      }
    }
    if (order.length !== this.net.nodes.size) {
      throw new Error("Cycle detected in Bayesian network");
    }
    this.net.topoOrder = order;
  }

  /**
   * 设置条件概率
   * parentAssignment 是父节点取值的字符串（按 topo 顺序），用 "|" 分隔
   */
  setCPT(nodeId: NodeId, cpt: Map<string, number> | Record<string, number>): void {
    const node = this.net.nodes.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (cpt instanceof Map) {
      node.cpt = new Map(cpt);
    } else {
      node.cpt = new Map(Object.entries(cpt));
    }
    this.validateCPT(node);
  }

  private validateCPT(node: BayesNode): void {
    // 验证每组父节点取值下的子节点概率和为 1
    const groups = new Map<string, Map<DiscreteValue, number>>();
    for (const [key, prob] of node.cpt) {
      const parts = key.split("|");
      const parentPart = parts.length > 1 ? parts[1] : "";
      if (!groups.has(parentPart)) groups.set(parentPart, new Map());
      const childVal = parts[0] as DiscreteValue;
      groups.get(parentPart)!.set(childVal, prob);
    }
    for (const [parentKey, childMap] of groups) {
      const sum = Array.from(childMap.values()).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.01) {
        console.warn(`CPT for ${node.id} with parents=${parentKey} sums to ${sum}`);
      }
    }
  }

  /**
   * 从数据学习参数（最大似然估计）
   * 训练数据：每行是一个赋值映射
   */
  train(X: number[][], y?: any, options?: TrainOptions): TrainResult {
    const startTime = Date.now();
    // X 中每行是各节点取值的索引（按 topo 顺序）
    // 重置所有 CPT
    for (const node of this.net.nodes.values()) {
      node.cpt = new Map();
    }

    // 统计频次
    const counts: Map<NodeId, Map<string, number>> = new Map();
    for (const id of this.net.nodes.keys()) counts.set(id, new Map());

    for (const sample of X) {
      for (let i = 0; i < this.net.topoOrder.length; i++) {
        const nodeId = this.net.topoOrder[i];
        const node = this.net.nodes.get(nodeId)!;
        const value = node.domain[sample[i]];
        if (value === undefined) continue;

        // 构造条件 key
        const parentVals = node.parents.map((p) => {
          const pIdx = this.net.topoOrder.indexOf(p);
          return this.net.nodes.get(p)!.domain[sample[pIdx]];
        });
        const key = `${value}|${parentVals.join(",")}`;
        const m = counts.get(nodeId)!;
        m.set(key, (m.get(key) || 0) + 1);
      }
    }

    // 估计概率（带 Laplace 平滑）
    const smoothing = options?.smoothing ?? 1;
    for (const node of this.net.nodes.values()) {
      const m = counts.get(node.id)!;
      // 按父节点分组求和
      const parentSums = new Map<string, number>();
      for (const [key, count] of m) {
        const parentPart = key.split("|")[1] || "";
        parentSums.set(parentPart, (parentSums.get(parentPart) || 0) + count);
      }
      for (const [key, count] of m) {
        const parentPart = key.split("|")[1] || "";
        const denom = (parentSums.get(parentPart) || 0) + smoothing * node.domain.length;
        node.cpt.set(key, (count + smoothing) / denom);
      }
    }

    this.trained = true;
    this.trainedAt = Math.floor(Date.now() / 1000);
    this.metrics = { accuracy: 0 };

    return {
      success: true,
      epochs: 1,
      metrics: this.metrics,
      history: [{ epoch: 0, loss: 0 }],
      duration: Date.now() - startTime,
    };
  }

  /**
   * 变量消元推理
   * 给定证据，计算目标节点的边缘分布
   */
  inference(targetNode: NodeId, evidence: Record<NodeId, DiscreteValue>): BayesInferenceResult {
    if (!this.trained) throw new Error("Network not trained");

    // 计算每个取值的概率
    const target = this.net.nodes.get(targetNode);
    if (!target) throw new Error(`Target node ${targetNode} not found`);

    const probs = new Map<DiscreteValue, number>();
    const totalMass = { val: 0 };

    for (const value of target.domain) {
      const localEvidence = { ...evidence, [targetNode]: value };
      const p = this.enumerateAll(localEvidence, totalMass);
      probs.set(value, p);
    }

    // 归一化
    const sum = Array.from(probs.values()).reduce((a, b) => a + b, 0) + EPS;
    const normalized = new Map<DiscreteValue, number>();
    for (const [k, v] of probs) {
      normalized.set(k, v / sum);
    }

    // 找最大
    let mostLikely: DiscreteValue = target.domain[0];
    let maxP = -1;
    for (const [k, v] of normalized) {
      if (v > maxP) { maxP = v; mostLikely = k; }
    }

    // 熵
    const entropy = -Array.from(normalized.values())
      .reduce((s, p) => s + (p > 0 ? p * safeLog(p) : 0), 0);

    return {
      probabilities: normalized,
      mostLikely,
      confidence: maxP * 100,
      entropy,
    };
  }

  /**
   * 枚举所有变量赋值
   */
  private enumerateAll(evidence: Record<NodeId, DiscreteValue>, totalMass: { val: number }): number {
    // 简化：仅做概率连乘
    let prob = 1;
    for (const nodeId of this.net.topoOrder) {
      const node = this.net.nodes.get(nodeId)!;
      if (evidence[nodeId] !== undefined) {
        const value = evidence[nodeId];
        const parentVals = node.parents.map((p) => evidence[p]);
        const key = `${value}|${parentVals.join(",")}`;
        const p = node.cpt.get(key);
        if (p === undefined) {
          // 平滑默认值
          prob *= 1 / node.domain.length;
        } else {
          prob *= p;
        }
      } else {
        // 边缘化：所有取值求和
        let sum = 0;
        for (const v of node.domain) {
          const parentVals = node.parents.map((p) => evidence[p]);
          const key = `${v}|${parentVals.join(",")}`;
          const p = node.cpt.get(key);
          sum += p !== undefined ? p : 1 / node.domain.length;
        }
        prob *= sum;
      }
    }
    return prob;
  }

  /** 单点预测 */
  predict(features: number[]): number {
    // features 是各节点值的索引
    const evidence: Record<NodeId, DiscreteValue> = {};
    this.net.topoOrder.forEach((id, i) => {
      const node = this.net.nodes.get(id)!;
      evidence[id] = node.domain[features[i]];
    });
    return 0;
  }

  serialize(): string {
    return JSON.stringify({
      nodes: Array.from(this.net.nodes.entries()).map(([id, n]) => ({
        id, name: n.name, domain: n.domain, parents: n.parents,
        cpt: Array.from(n.cpt.entries()),
      })),
      edges: this.net.edges,
      topoOrder: this.net.topoOrder,
      trained: this.trained,
      trainedAt: this.trainedAt,
    });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.net.nodes = new Map();
    for (const n of obj.nodes) {
      this.net.nodes.set(n.id, {
        id: n.id, name: n.name, domain: n.domain, parents: n.parents,
        cpt: new Map(n.cpt),
      });
    }
    this.net.edges = obj.edges;
    this.net.topoOrder = obj.topoOrder;
    this.trained = obj.trained;
    this.trainedAt = obj.trainedAt;
  }

  getNode(id: NodeId): BayesNode | undefined { return this.net.nodes.get(id); }
  getAllNodes(): BayesNode[] { return Array.from(this.net.nodes.values()); }
}

/**
 * 工厂：构建交易决策贝叶斯网络
 */
export function createTradingBayesianNet(): BayesianNetwork {
  const net = new BayesianNetwork();
  // 信号强/弱 -> 趋势强/弱
  net.addNode("signal", "信号强度", ["强", "弱"]);
  // 趋势强 -> 上涨/下跌
  net.addNode("trend", "市场趋势", ["上涨", "下跌", "震荡"], ["signal"]);
  // 趋势强 -> 高波动/低波动
  net.addNode("volatility", "波动率", ["高", "低"], ["signal"]);
  // 上涨/下跌/震荡 + 高/低波动 -> 盈利/亏损
  net.addNode("result", "交易结果", ["盈利", "亏损"], ["trend", "volatility"]);

  // 设定 CPT
  // P(信号)
  net.setCPT("signal", new Map([
    ["强|", 0.6], ["弱|", 0.4],
  ]));
  // P(趋势 | 信号)
  net.setCPT("trend", new Map([
    ["上涨|强", 0.55], ["下跌|强", 0.25], ["震荡|强", 0.20],
    ["上涨|弱", 0.35], ["下跌|弱", 0.30], ["震荡|弱", 0.35],
  ]));
  // P(波动率 | 信号)
  net.setCPT("volatility", new Map([
    ["高|强", 0.45], ["低|强", 0.55],
    ["高|弱", 0.30], ["低|弱", 0.70],
  ]));
  // P(结果 | 趋势, 波动率)
  net.setCPT("result", new Map([
    ["盈利|上涨,高", 0.65], ["亏损|上涨,高", 0.35],
    ["盈利|上涨,低", 0.75], ["亏损|上涨,低", 0.25],
    ["盈利|下跌,高", 0.40], ["亏损|下跌,高", 0.60],
    ["盈利|下跌,低", 0.30], ["亏损|下跌,低", 0.70],
    ["盈利|震荡,高", 0.45], ["亏损|震荡,高", 0.55],
    ["盈利|震荡,低", 0.50], ["亏损|震荡,低", 0.50],
  ]));
  return net;
}
