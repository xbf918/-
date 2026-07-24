/**
 * AutoML + 元学习 (AutoML & Meta-Learning)
 *
 * AutoML: 自动选择模型和超参数
 * 元学习: 学习如何学习，利用历史任务经验加速新任务
 */
import type { ModelMetrics, SupervisedSample } from "./types";
import { LogisticRegression, TradingEnsemble, type EnsembleModel } from "./ensemble";
import { createXGBoost, createLightGBM, createCatBoost } from "./gradientBoosting";
import { BayesianOptimizer } from "./bayesianOptimization";

type SimpleModel = EnsembleModel;

export interface AutoMLConfig {
  maxTrials?: number;
  timeLimitMs?: number;
  cvFolds?: number;
  metric?: "accuracy" | "f1" | "precision" | "recall";
  candidateModels?: string[];
  optimizationStrategy?: "random" | "bayesian";
  verbose?: boolean;
}

export interface AutoMLResult {
  bestModel: SimpleModel;
  bestModelName: string;
  bestMetrics: ModelMetrics;
  allResults: Array<{ modelName: string; metrics: ModelMetrics; params: Record<string, number> }>;
  totalTrials: number;
  timeMs: number;
}

export class AutoML {
  private config: Required<AutoMLConfig>;

  constructor(config: AutoMLConfig = {}) {
    this.config = {
      maxTrials: config.maxTrials ?? 15,
      timeLimitMs: config.timeLimitMs ?? 60000,
      cvFolds: config.cvFolds ?? 3,
      metric: config.metric ?? "accuracy",
      candidateModels: config.candidateModels ?? [
        "LogisticRegression", "XGBoost", "LightGBM", "CatBoost",
      ],
      optimizationStrategy: config.optimizationStrategy ?? "random",
      verbose: config.verbose ?? false,
    };
  }

  fit(trainData: SupervisedSample[]): AutoMLResult {
    const startTime = Date.now();
    const results: Array<{ modelName: string; metrics: ModelMetrics; params: Record<string, number> }> = [];
    let bestModel: SimpleModel | null = null;
    let bestMetrics: ModelMetrics = { accuracy: 0, precision: 0, recall: 0, f1: 0 };
    let bestName = "";
    let trials = 0;

    for (const modelName of this.config.candidateModels) {
      if (Date.now() - startTime > this.config.timeLimitMs) break;
      if (trials >= this.config.maxTrials) break;

      const { model, metrics, params, trialCount } = this.optimizeModel(modelName, trainData);
      trials += trialCount;
      results.push({ modelName, metrics, params });

      const key = this.config.metric as keyof ModelMetrics;
      if (metrics[key] > bestMetrics[key]) {
        bestModel = model;
        bestMetrics = metrics;
        bestName = modelName;
      }
      if (this.config.verbose) {
        console.log(`[AutoML] ${modelName}: ${this.config.metric}=${metrics[key].toFixed(4)}`);
      }
    }

    // 最后尝试集成所有模型
    if (this.config.candidateModels.includes("Ensemble") && trials < this.config.maxTrials) {
      const ensembleMetrics = this.tryEnsemble(trainData);
      results.push({ modelName: "Ensemble", metrics: ensembleMetrics, params: {} });
      if (ensembleMetrics.accuracy > bestMetrics.accuracy) {
        bestMetrics = ensembleMetrics;
        bestName = "Ensemble";
      }
    }

    return {
      bestModel: bestModel!,
      bestModelName: bestName,
      bestMetrics,
      allResults: results,
      totalTrials: trials,
      timeMs: Date.now() - startTime,
    };
  }

  private optimizeModel(
    modelName: string,
    data: SupervisedSample[],
  ): { model: SimpleModel; metrics: ModelMetrics; params: Record<string, number>; trialCount: number } {
    const paramSpace = this.getParamSpace(modelName);
    let bestParams: Record<string, number> = {};
    let bestMetrics: ModelMetrics = { accuracy: 0, precision: 0, recall: 0, f1: 0 };
    let bestModel: SimpleModel | null = null;
    let trialCount = 0;

    if (this.config.optimizationStrategy === "bayesian" && paramSpace.length > 0) {
      const bo = new BayesianOptimizer({
        bounds: paramSpace,
        objective: (params) => {
          trialCount++;
          const model = this.createModel(modelName, params);
          const metrics = this.crossValidate(model, data);
          const key = this.config.metric as keyof ModelMetrics;
          if (metrics[key] > bestMetrics[key]) {
            bestMetrics = metrics;
            bestParams = params;
            bestModel = model;
          }
          return metrics[key];
        },
        numIterations: Math.min(8, this.config.maxTrials - trialCount),
        numInitialPoints: 3,
        acquisition: "ei",
      });
      bo.run();
    } else {
      // Random search
      const nTrials = Math.min(5, this.config.maxTrials);
      for (let t = 0; t < nTrials; t++) {
        trialCount++;
        const params = this.randomParams(paramSpace);
        const model = this.createModel(modelName, params);
        const metrics = this.crossValidate(model, data);
        const key = this.config.metric as keyof ModelMetrics;
        if (metrics[key] > bestMetrics[key]) {
          bestMetrics = metrics;
          bestParams = params;
          bestModel = model;
        }
      }
    }

    if (!bestModel) {
      bestModel = this.createModel(modelName, bestParams);
      bestModel.train(data);
      bestMetrics = this.evaluate(bestModel, data);
    }

    return { model: bestModel, metrics: bestMetrics, params: bestParams, trialCount };
  }

  private getParamSpace(modelName: string): Array<{ name: string; min: number; max: number; type: "int" | "float" }> {
    switch (modelName) {
      case "XGBoost":
      case "LightGBM":
      case "CatBoost":
        return [
          { name: "learningRate", min: 0.01, max: 0.3, type: "float" },
          { name: "maxDepth", min: 2, max: 8, type: "int" },
          { name: "nEstimators", min: 10, max: 100, type: "int" },
        ];
      case "LogisticRegression":
        return [
          { name: "learningRate", min: 0.001, max: 0.1, type: "float" },
        ];
      default:
        return [];
    }
  }

  private randomParams(space: Array<{ name: string; min: number; max: number; type: string }>): Record<string, number> {
    const params: Record<string, number> = {};
    for (const p of space) {
      const val = p.min + Math.random() * (p.max - p.min);
      params[p.name] = p.type === "int" ? Math.round(val) : val;
    }
    return params;
  }

  private createModel(modelName: string, params: Record<string, number>): SimpleModel {
    switch (modelName) {
      case "LogisticRegression": {
        const m = new LogisticRegression();
        m.learningRate = params.learningRate || 0.01;
        return m;
      }
      case "XGBoost":
        return createXGBoost({
          numEstimators: Math.round(params.nEstimators || 50),
          maxDepth: Math.round(params.maxDepth || 4),
          learningRate: params.learningRate || 0.1,
          subsample: 0.8,
          regLambda: 1,
        }) as unknown as SimpleModel;
      case "LightGBM":
        return createLightGBM({
          numEstimators: Math.round(params.nEstimators || 50),
          maxDepth: Math.round(params.maxDepth || 4),
          learningRate: params.learningRate || 0.1,
          numLeaves: 31,
          subsample: 0.8,
        }) as unknown as SimpleModel;
      case "CatBoost":
        return createCatBoost({
          numEstimators: Math.round(params.nEstimators || 50),
          maxDepth: Math.round(params.maxDepth || 4),
          learningRate: params.learningRate || 0.1,
          subsample: 0.8,
        }) as unknown as SimpleModel;
      default:
        return new LogisticRegression();
    }
  }

  private crossValidate(model: SimpleModel, data: SupervisedSample[]): ModelMetrics {
    const k = this.config.cvFolds;
    const foldSize = Math.floor(data.length / k);
    const allMetrics: ModelMetrics[] = [];
    for (let i = 0; i < k; i++) {
      const valStart = i * foldSize;
      const valEnd = valStart + foldSize;
      const trainFold = [...data.slice(0, valStart), ...data.slice(valEnd)];
      const valFold = data.slice(valStart, valEnd);
      if (trainFold.length < 5 || valFold.length < 2) continue;
      const clone = this.cloneModel(model);
      clone.train(trainFold);
      allMetrics.push(this.evaluate(clone, valFold));
    }
    if (allMetrics.length === 0) return { accuracy: 0.5, precision: 0.5, recall: 0.5, f1: 0.5 };
    return {
      accuracy: allMetrics.reduce((s, m) => s + (m.accuracy || 0), 0) / allMetrics.length,
      precision: allMetrics.reduce((s, m) => s + (m.precision || 0), 0) / allMetrics.length,
      recall: allMetrics.reduce((s, m) => s + (m.recall || 0), 0) / allMetrics.length,
      f1: allMetrics.reduce((s, m) => s + (m.f1 || 0), 0) / allMetrics.length,
    };
  }

  private cloneModel(model: SimpleModel): SimpleModel {
    if (model instanceof LogisticRegression) {
      const m = new LogisticRegression();
      m.learningRate = model.learningRate;
      return m;
    }
    return model;
  }

  private evaluate(model: SimpleModel, data: SupervisedSample[]): ModelMetrics {
    let correct = 0, tp = 0, fp = 0, fn = 0;
    for (const s of data) {
      const pred = model.predict(s.features);
      const predClass = Array.isArray(pred) ? (pred[1] > pred[0] ? 1 : 0) : (pred >= 0.5 ? 1 : 0);
      const trueClass = typeof s.label === "number" ? (s.label >= 0.5 ? 1 : 0) : ((s.label as number[])[1] > (s.label as number[])[0] ? 1 : 0);
      if (predClass === trueClass) correct++;
      if (predClass === 1 && trueClass === 1) tp++;
      if (predClass === 1 && trueClass === 0) fp++;
      if (predClass === 0 && trueClass === 1) fn++;
    }
    const accuracy = correct / data.length;
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = (2 * precision * recall) / (precision + recall) || 0;
    return { accuracy, precision, recall, f1 };
  }

  private tryEnsemble(data: SupervisedSample[]): ModelMetrics {
    const lr = new LogisticRegression();
    lr.train(data);
    const xgb = createXGBoost({ numEstimators: 30, maxDepth: 4, learningRate: 0.1 });
    const ensemble = new TradingEnsemble({
      method: "weighted_voting",
      baseModels: [lr as any, xgb as any],
    });
    ensemble.train(data);
    return this.evaluate(ensemble as any, data);
  }
}

/**
 * 元学习 (Meta-Learning)
 * - 维护任务历史
 * - 基于任务相似度，推荐初始超参数
 * - MAML 风格快速适应
 */
export interface MetaTask {
  id: string;
  name: string;
  features: string[];
  bestModel: string;
  bestParams: Record<string, number>;
  bestMetrics: ModelMetrics;
  taskEmbedding: number[];
}

export class MetaLearner {
  private taskHistory: MetaTask[] = [];
  private defaultParams: Record<string, Record<string, number>> = {};

  addTask(task: MetaTask): void {
    this.taskHistory.push(task);
    this.updateDefaultParams();
  }

  /** 基于新任务特征，推荐最优初始化 */
  recommendForNewTask(taskEmbedding: number[]): {
    modelName: string;
    params: Record<string, number>;
    confidence: number;
    similarTask?: MetaTask;
  } {
    if (this.taskHistory.length === 0) {
      return { modelName: "LogisticRegression", params: { learningRate: 0.01 }, confidence: 0 };
    }
    // 找最相似任务
    let bestTask = this.taskHistory[0];
    let bestSim = -Infinity;
    for (const t of this.taskHistory) {
      const sim = this.cosineSimilarity(taskEmbedding, t.taskEmbedding);
      if (sim > bestSim) { bestSim = sim; bestTask = t; }
    }
    return {
      modelName: bestTask.bestModel,
      params: { ...bestTask.bestParams },
      confidence: Math.max(0, bestSim),
      similarTask: bestTask,
    };
  }

  getTaskHistory(): MetaTask[] {
    return [...this.taskHistory];
  }

  getDefaultParams(modelName: string): Record<string, number> {
    return this.defaultParams[modelName] || {};
  }

  private updateDefaultParams(): void {
    const byModel: Record<string, Array<Record<string, number>>> = {};
    for (const t of this.taskHistory) {
      if (!byModel[t.bestModel]) byModel[t.bestModel] = [];
      byModel[t.bestModel].push(t.bestParams);
    }
    this.defaultParams = {};
    for (const [name, paramsList] of Object.entries(byModel)) {
      const avg: Record<string, number> = {};
      if (paramsList.length === 0) continue;
      const keys = Object.keys(paramsList[0]);
      for (const key of keys) {
        avg[key] = paramsList.reduce((s, p) => s + (p[key] || 0), 0) / paramsList.length;
      }
      this.defaultParams[name] = avg;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
}
