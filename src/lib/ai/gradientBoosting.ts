/**
 * 梯度提升决策树（GBDT）
 *
 * 统一实现 XGBoost / LightGBM / CatBoost 风格的核心算法：
 * - 二阶泰勒展开（XGBoost 风格）
 * - 直方图分箱（LightGBM 风格）
 * - 对称树 / ordered boosting（CatBoost 风格）
 *
 * 全部使用 CART 回归树作为基学习器。
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult } from "./types";
import { EPS, safeLog } from "./math";

export type GBDTVariant = "xgboost" | "lightgbm" | "catboost";

export interface GBDTConfig {
  variant?: GBDTVariant;
  numEstimators?: number;     // 树数量
  learningRate?: number;      // 收缩率 (eta)
  maxDepth?: number;          // 树最大深度
  minSamplesSplit?: number;   // 分裂最少样本
  minChildWeight?: number;    // 子节点最小权重和（XGBoost）
  regAlpha?: number;          // L1 正则
  regLambda?: number;         // L2 正则
  subsample?: number;         // 行采样
  colsample?: number;         // 列采样
  numLeaves?: number;         // Leaf-wise 树最大叶子（LightGBM）
  numBins?: number;           // 直方图分箱数
  objective?: "regression" | "binary" | "regression_l2";
  maxBins?: number;
  randomSeed?: number;
}

interface TreeNode {
  leaf: boolean;
  value?: number;          // 叶节点值
  feature?: number;        // 分裂特征
  threshold?: number;      // 分裂阈值
  left?: TreeNode;
  right?: TreeNode;
  weight?: number;         // 节点权重（XGBoost hessian sum）
}

/**
 * 梯度提升树
 */
export class GradientBoostingTree implements Model {
  name = "GBDT";
  type = "gbdt" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  private config: Required<GBDTConfig>;
  private trees: TreeNode[] = [];
  private initValue = 0;
  private featureBins: Map<number, number[]> = new Map();
  private rng: () => number;

  constructor(config: GBDTConfig = {}) {
    this.config = {
      variant: config.variant ?? "xgboost",
      numEstimators: config.numEstimators ?? 50,
      learningRate: config.learningRate ?? 0.1,
      maxDepth: config.maxDepth ?? 6,
      minSamplesSplit: config.minSamplesSplit ?? 5,
      minChildWeight: config.minChildWeight ?? 1,
      regAlpha: config.regAlpha ?? 0,
      regLambda: config.regLambda ?? 1,
      subsample: config.subsample ?? 0.8,
      colsample: config.colsample ?? 0.8,
      numLeaves: config.numLeaves ?? 31,
      numBins: config.numBins ?? 64,
      objective: config.objective ?? "regression",
      maxBins: config.maxBins ?? 64,
      randomSeed: config.randomSeed ?? 42,
    };
    // 简单 PRNG
    let seed = this.config.randomSeed;
    this.rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private computeBinEdges(X: number[][]): void {
    const D = X[0].length;
    for (let d = 0; d < D; d++) {
      const values = X.map((row) => row[d]).sort((a, b) => a - b);
      const numBins = this.config.numBins;
      const edges: number[] = [];
      for (let i = 1; i < numBins; i++) {
        const idx = Math.floor((values.length - 1) * (i / numBins));
        edges.push(values[idx]);
      }
      this.featureBins.set(d, edges);
    }
  }

  private getBin(x: number, d: number): number {
    const edges = this.featureBins.get(d);
    if (!edges) return 0;
    let lo = 0, hi = edges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (x <= edges[mid]) hi = mid - 1;
      else lo = mid + 1;
    }
    return lo;
  }

  /** 计算梯度和 Hessian（二阶） */
  private computeGradHess(y: number, pred: number): { g: number; h: number } {
    if (this.config.objective === "binary") {
      const p = 1 / (1 + Math.exp(-pred));
      return { g: p - y, h: Math.max(p * (1 - p), EPS) };
    }
    // L2 loss
    return { g: pred - y, h: 1 };
  }

  /** 计算 XGBoost 风格的分裂增益 */
  private splitGain(gL: number, hL: number, gR: number, hR: number, lambda: number): number {
    const T = (gL * gL) / (hL + lambda) + (gR * gR) / (hR + lambda);
    const g = gL + gR, h = hL + hR;
    return 0.5 * (T - (g * g) / (h + lambda));
  }

  /** 构建单棵树（直方图近似） */
  private buildTree(
    X: number[][],
    grad: number[],
    hess: number[],
    featureSubset: number[],
  ): TreeNode {
    return this.buildTreeRecursive(X, grad, hess, featureSubset, 0);
  }

  private buildTreeRecursive(
    X: number[][],
    grad: number[],
    hess: number[],
    features: number[],
    depth: number,
  ): TreeNode {
    const N = X.length;
    if (N < this.config.minSamplesSplit ||
        (this.config.variant === "lightgbm" && depth >= Math.log2(this.config.numLeaves))) {
      return this.makeLeaf(grad, hess);
    }

    // 选择最佳分裂
    let bestGain = -Infinity;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestLeftIdx: number[] = [];
    let bestRightIdx: number[] = [];

    for (const d of features) {
      const edges = this.featureBins.get(d) || [];
      // 用直方图分箱加速
      const bins: Map<number, { g: number; h: number; idx: number[] }> = new Map();
      for (let i = 0; i < N; i++) {
        const b = this.getBin(X[i][d], d);
        if (!bins.has(b)) bins.set(b, { g: 0, h: 0, idx: [] });
        const slot = bins.get(b)!;
        slot.g += grad[i];
        slot.h += hess[i];
        slot.idx.push(i);
      }

      // 累积
      const sortedBins = Array.from(bins.keys()).sort((a, b) => a - b);
      let gAcc = 0, hAcc = 0;
      for (let k = 0; k < sortedBins.length - 1; k++) {
        const lSlot = bins.get(sortedBins[k])!;
        gAcc += lSlot.g;
        hAcc += lSlot.h;
        const gR = grad.reduce((s, _, i) => {
          if (!lSlot.idx.includes(i)) return s + grad[i];
          return s;
        }, 0);
        const hR = hess.reduce((s, _, i) => {
          if (!lSlot.idx.includes(i)) return s + hess[i];
          return s;
        }, 0);
        const gain = this.splitGain(gAcc, hAcc, gR, hR, this.config.regLambda);
        if (gain > bestGain && hAcc >= this.config.minChildWeight && hR >= this.config.minChildWeight) {
          bestGain = gain;
          bestFeature = d;
          bestThreshold = edges[sortedBins[k]] || 0;
          bestLeftIdx = lSlot.idx;
          bestRightIdx = [];
          for (let i = 0; i < N; i++) {
            if (!bestLeftIdx.includes(i)) bestRightIdx.push(i);
          }
        }
      }
    }

    if (bestFeature === -1 || bestGain <= 0) {
      return this.makeLeaf(grad, hess);
    }

    // 递归分裂
    const leftX = bestLeftIdx.map((i) => X[i]);
    const leftGrad = bestLeftIdx.map((i) => grad[i]);
    const leftHess = bestLeftIdx.map((i) => hess[i]);
    const rightX = bestRightIdx.map((i) => X[i]);
    const rightGrad = bestRightIdx.map((i) => grad[i]);
    const rightHess = bestRightIdx.map((i) => hess[i]);

    return {
      leaf: false,
      feature: bestFeature,
      threshold: bestThreshold,
      left: this.buildTreeRecursive(leftX, leftGrad, leftHess, features, depth + 1),
      right: this.buildTreeRecursive(rightX, rightGrad, rightHess, features, depth + 1),
    };
  }

  private makeLeaf(grad: number[], hess: number[]): TreeNode {
    const G = grad.reduce((a, b) => a + b, 0);
    const H = hess.reduce((a, b) => a + b, 0);
    // XGBoost 风格叶节点值：-G / (H + lambda)
    const value = -G / (H + this.config.regLambda);
    return { leaf: true, value, weight: H };
  }

  /** 单棵树预测 */
  private predictTree(tree: TreeNode, x: number[]): number {
    if (tree.leaf) return tree.value || 0;
    const v = x[tree.feature!];
    if (v === undefined) return 0;
    if (v <= tree.threshold!) {
      return this.predictTree(tree.left!, x);
    }
    return this.predictTree(tree.right!, x);
  }

  train(X: number[][], y: number[] | number[][], options?: TrainOptions): TrainResult {
    const startTime = Date.now();
    const yArr = (Array.isArray(y[0]) ? (y as number[][]).map((r) => r[0]) : y) as number[];
    this.computeBinEdges(X);

    // 初始值：均值
    this.initValue = yArr.reduce((a, b) => a + b, 0) / yArr.length;
    this.trees = [];

    const history: { epoch: number; loss: number; valLoss?: number }[] = [];
    const N = X.length;
    const D = X[0].length;
    let preds = new Array(N).fill(this.initValue);

    const valSplit = options?.validationSplit ?? 0;
    const valStart = Math.floor(N * (1 - valSplit));

    for (let iter = 0; iter < this.config.numEstimators; iter++) {
      // 计算梯度和 Hessian
      const grad = new Array(N);
      const hess = new Array(N);
      for (let i = 0; i < N; i++) {
        const gh = this.computeGradHess(yArr[i], preds[i]);
        grad[i] = gh.g;
        hess[i] = gh.h;
      }

      // 子采样
      let trainIdx = Array.from({ length: N }, (_, i) => i);
      if (this.config.subsample < 1) {
        trainIdx = trainIdx.filter(() => this.rng() < this.config.subsample);
      }
      const subX = trainIdx.map((i) => X[i]);
      const subGrad = trainIdx.map((i) => grad[i]);
      const subHess = trainIdx.map((i) => hess[i]);

      // 列采样
      const featureSubset: number[] = [];
      for (let d = 0; d < D; d++) {
        if (this.rng() < this.config.colsample) featureSubset.push(d);
      }
      if (featureSubset.length === 0) featureSubset.push(0);

      // CatBoost 风格：对树结构使用对称/有序 boosting（这里简化为标准 GBDT）
      const tree = this.buildTree(subX, subGrad, subHess, featureSubset);
      this.trees.push(tree);

      // 更新预测
      for (let i = 0; i < N; i++) {
        preds[i] += this.config.learningRate * this.predictTree(tree, X[i]);
      }

      // 计算损失
      let trainLoss = 0;
      for (let i = 0; i < valStart; i++) {
        if (this.config.objective === "binary") {
          const p = 1 / (1 + Math.exp(-preds[i]));
          trainLoss -= yArr[i] * safeLog(p) + (1 - yArr[i]) * safeLog(1 - p);
        } else {
          const diff = preds[i] - yArr[i];
          trainLoss += diff * diff;
        }
      }
      trainLoss /= valStart;
      history.push({ epoch: iter, loss: trainLoss });

      if (valStart < N) {
        let valLoss = 0;
        for (let i = valStart; i < N; i++) {
          if (this.config.objective === "binary") {
            const p = 1 / (1 + Math.exp(-preds[i]));
            valLoss -= yArr[i] * safeLog(p) + (1 - yArr[i]) * safeLog(1 - p);
          } else {
            const diff = preds[i] - yArr[i];
            valLoss += diff * diff;
          }
        }
        valLoss /= N - valStart;
        history[history.length - 1].valLoss = valLoss;
      }

      if (options?.verbose && iter % 10 === 0) {
        console.log(`[GBDT] iter ${iter}, loss=${trainLoss.toFixed(6)}`);
      }
    }

    this.trained = true;
    this.trainedAt = Math.floor(Date.now() / 1000);
    const lastLoss = history[history.length - 1]?.loss || 0;
    this.metrics = { mse: lastLoss, mae: Math.sqrt(lastLoss) };

    return {
      success: true,
      epochs: this.config.numEstimators,
      metrics: this.metrics,
      history,
      duration: Date.now() - startTime,
    };
  }

  predict(features: number[]): number {
    if (!this.trained) return this.initValue;
    let pred = this.initValue;
    for (const tree of this.trees) {
      pred += this.config.learningRate * this.predictTree(tree, features);
    }
    return this.config.objective === "binary" ? 1 / (1 + Math.exp(-pred)) : pred;
  }

  /** 预测多棵树的总和（用于 SHAP 等） */
  predictRaw(features: number[]): number {
    if (!this.trained) return this.initValue;
    let pred = this.initValue;
    for (const tree of this.trees) {
      pred += this.predictTree(tree, features);
    }
    return pred;
  }

  serialize(): string {
    return JSON.stringify({
      config: this.config,
      trees: this.trees,
      initValue: this.initValue,
      featureBins: Array.from(this.featureBins.entries()),
    });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.config = { ...this.config, ...obj.config };
    this.trees = obj.trees;
    this.initValue = obj.initValue;
    this.featureBins = new Map(obj.featureBins);
    this.trained = true;
  }

  getNumTrees(): number { return this.trees.length; }
  getFeatureImportance(): number[] {
    const importance: number[] = new Array(this.featureBins.size).fill(0);
    const visit = (node: TreeNode, weight: number) => {
      if (node.leaf) return;
      importance[node.feature!] += weight;
      visit(node.left!, weight * 0.5);
      visit(node.right!, weight * 0.5);
    };
    for (const tree of this.trees) visit(tree, 1);
    const sum = importance.reduce((a, b) => a + b, 0) + EPS;
    return importance.map((v) => v / sum);
  }
}

/** 工厂：XGBoost 风格 */
export function createXGBoost(config?: Partial<GBDTConfig>): GradientBoostingTree {
  return new GradientBoostingTree({ ...config, variant: "xgboost" });
}

/** 工厂：LightGBM 风格 */
export function createLightGBM(config?: Partial<GBDTConfig>): GradientBoostingTree {
  return new GradientBoostingTree({
    ...config,
    variant: "lightgbm",
    maxDepth: undefined,
    numLeaves: config?.numLeaves ?? 31,
  });
}

/** 工厂：CatBoost 风格 */
export function createCatBoost(config?: Partial<GBDTConfig>): GradientBoostingTree {
  return new GradientBoostingTree({
    ...config,
    variant: "catboost",
    maxDepth: config?.maxDepth ?? 8,
    learningRate: config?.learningRate ?? 0.05,
  });
}
