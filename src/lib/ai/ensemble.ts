/**
 * 集成学习 (Ensemble Learning)
 *
 * 包含：投票集成、加权集成、Stacking、Bagging
 */
import type { ModelMetrics, SupervisedSample } from "./types";
import { softmax, mean, std } from "./math";

function argmax(arr: number[]): number {
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > bestVal) { bestVal = arr[i]; bestIdx = i; }
  }
  return bestIdx;
}

export type EnsembleMethod = "voting" | "weighted_voting" | "averaging" | "stacking";

export interface EnsembleModel {
  name: string;
  type: string;
  isTrained: boolean;
  metrics: ModelMetrics;
  predict(features: number[]): number | number[];
  train(data: SupervisedSample[]): void;
}

export interface EnsembleConfig {
  method?: EnsembleMethod;
  baseModels?: EnsembleModel[];
  metaLearner?: EnsembleModel;
  weights?: number[];
  verbose?: boolean;
}

export class TradingEnsemble implements EnsembleModel {
  name = "Ensemble";
  type = "ensemble" as const;
  isTrained = false;
  metrics: ModelMetrics = { accuracy: 0, precision: 0, recall: 0, f1: 0 };
  method: EnsembleMethod;
  baseModels: EnsembleModel[];
  weights: number[];
  metaLearner?: EnsembleModel;

  constructor(config: EnsembleConfig = {}) {
    this.method = config.method || "weighted_voting";
    this.baseModels = config.baseModels || [];
    this.weights = config.weights || [];
    this.metaLearner = config.metaLearner;
  }

  addModel(model: EnsembleModel, weight = 1): void {
    this.baseModels.push(model);
    this.weights.push(weight);
  }

  train(data: SupervisedSample[]): void {
    if (this.baseModels.length === 0) return;
    for (const m of this.baseModels) {
      if (!m.isTrained) m.train(data);
    }
    // Stacking：在基模型预测上训练元学习器
    if (this.method === "stacking" && this.metaLearner) {
      const metaTrain: SupervisedSample[] = data.map((sample) => {
        const preds = this.baseModels.map((m) => m.predict(sample.features));
        return { features: preds as number[], label: sample.label };
      });
      this.metaLearner.train(metaTrain);
    }
    // 从验证集计算权重
    if (this.method === "weighted_voting" && this.weights.every((w) => w === 1)) {
      this.adaptiveWeights(data);
    }
    this.isTrained = true;
    this.evaluate(data);
  }

  private adaptiveWeights(data: SupervisedSample[]): void {
    const perfs = this.baseModels.map((m) => {
      let correct = 0;
      for (const s of data) {
        const pred = m.predict(s.features);
        const predClass = Array.isArray(pred) ? argmax(pred) : Math.round(pred);
        const trueClass = Array.isArray(s.label) ? argmax(s.label as number[]) : Math.round(s.label as number);
        if (predClass === trueClass) correct++;
      }
      return correct / data.length + 0.001; // 避免 0
    });
    const total = perfs.reduce((a, b) => a + b, 0);
    this.weights = perfs.map((p) => p / total);
  }

  predict(features: number[]): number | number[] {
    if (this.baseModels.length === 0) return 0;
    const predictions = this.baseModels.map((m) => m.predict(features));

    switch (this.method) {
      case "voting":
        return this.majorityVoting(predictions);
      case "weighted_voting":
        return this.weightedVoting(predictions);
      case "averaging":
        return this.averaging(predictions);
      case "stacking":
        return this.stacking(predictions);
      default:
        return this.weightedVoting(predictions);
    }
  }

  private majorityVoting(predictions: (number | number[])[]): number {
    const classVotes: Record<number, number> = {};
    predictions.forEach((p) => {
      const cls = Array.isArray(p) ? argmax(p) : Math.round(p);
      classVotes[cls] = (classVotes[cls] || 0) + 1;
    });
    let bestCls = 0, bestVotes = -1;
    for (const [cls, votes] of Object.entries(classVotes)) {
      if (votes > bestVotes) { bestVotes = votes; bestCls = +cls; }
    }
    return bestCls;
  }

  private weightedVoting(predictions: (number | number[])[]): number[] {
    const nClasses = Array.isArray(predictions[0]) ? (predictions[0] as number[]).length : 2;
    const result = new Array(nClasses).fill(0);
    predictions.forEach((p, i) => {
      const probs = Array.isArray(p) ? (p as number[]) : [1 - (p as number), p as number];
      const w = this.weights[i] || 1;
      for (let c = 0; c < nClasses; c++) result[c] += probs[c] * w;
    });
    const total = result.reduce((a, b) => a + b, 0) || 1;
    return result.map((r) => r / total);
  }

  private averaging(predictions: (number | number[])[]): number {
    const vals = predictions.map((p) => (Array.isArray(p) ? argmax(p) : p));
    return mean(vals);
  }

  private stacking(predictions: (number | number[])[]): number | number[] {
    if (!this.metaLearner) return 0;
    const metaFeatures = predictions.map((p) => (Array.isArray(p) ? (p as number[])[argmax(p as number[])] : p));
    return this.metaLearner.predict(metaFeatures);
  }

  private evaluate(data: SupervisedSample[]): void {
    let correct = 0, tp = 0, fp = 0, fn = 0;
    for (const s of data) {
      const pred = this.predict(s.features);
      const predClass = Array.isArray(pred) ? argmax(pred as number[]) : Math.round(pred as number);
      const trueClass = Array.isArray(s.label) ? argmax(s.label as number[]) : Math.round(s.label as number);
      if (predClass === trueClass) correct++;
      if (predClass === 1 && trueClass === 1) tp++;
      if (predClass === 1 && trueClass === 0) fp++;
      if (predClass === 0 && trueClass === 1) fn++;
    }
    this.metrics.accuracy = correct / data.length;
    this.metrics.precision = tp / (tp + fp) || 0;
    this.metrics.recall = tp / (tp + fn) || 0;
    this.metrics.f1 = (2 * this.metrics.precision * this.metrics.recall) / (this.metrics.precision + this.metrics.recall) || 0;
  }
}

/**
 * 简单的逻辑回归（用作 Stacking 元学习器 & 在线学习基线）
 */
export class LogisticRegression implements EnsembleModel {
  name = "LogisticRegression";
  type = "classification" as const;
  isTrained = false;
  metrics: ModelMetrics = { accuracy: 0, precision: 0, recall: 0, f1: 0 };
  weights: number[] = [];
  bias = 0;
  learningRate = 0.01;

  train(data: SupervisedSample[], epochs = 100, lr = 0.01): void {
    if (data.length === 0) return;
    const n = data[0].features.length;
    this.weights = new Array(n).fill(0);
    this.bias = 0;
    this.learningRate = lr;
    for (let e = 0; e < epochs; e++) {
      for (const s of data) {
        this.updateOnline(s.features, s.label as number);
      }
    }
    this.isTrained = true;
    this.evaluate(data);
  }

  predict(features: number[]): number {
    return this.sigmoid(this.dot(features, this.weights) + this.bias);
  }

  /** 在线学习：单样本梯度更新 */
  updateOnline(features: number[], label: number): void {
    const pred = this.predict(features);
    const error = pred - label;
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= this.learningRate * error * features[i];
    }
    this.bias -= this.learningRate * error;
  }

  private dot(a: number[], b: number[]): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private evaluate(data: SupervisedSample[]): void {
    let correct = 0, tp = 0, fp = 0, fn = 0;
    for (const s of data) {
      const pred = this.predict(s.features);
      const predClass = pred >= 0.5 ? 1 : 0;
      const trueClass = Math.round(s.label as number);
      if (predClass === trueClass) correct++;
      if (predClass === 1 && trueClass === 1) tp++;
      if (predClass === 1 && trueClass === 0) fp++;
      if (predClass === 0 && trueClass === 1) fn++;
    }
    this.metrics.accuracy = correct / data.length;
    this.metrics.precision = tp / (tp + fp) || 0;
    this.metrics.recall = tp / (tp + fn) || 0;
    this.metrics.f1 = (2 * this.metrics.precision * this.metrics.recall) / (this.metrics.precision + this.metrics.recall) || 0;
  }
}
