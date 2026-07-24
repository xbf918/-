/**
 * 隐马尔可夫模型 (Hidden Markov Model)
 *
 * 用于市场状态识别。隐藏状态：trending/ranging/volatile
 * 观测：价格特征（收益率、波动率、量能）
 *
 * 使用 Baum-Welch 算法训练，前向-后向算法推理。
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult } from "./types";
import { EPS, logSumExp, normalizeProbs } from "./math";

export type HMMMarketState = "trending" | "ranging" | "volatile" | "crash" | "bull";

export interface HMMConfig {
  numStates: number;       // 隐藏状态数
  numObservations: number; // 观测维度
  stateLabels?: string[];  // 状态标签
  maxIters?: number;
  tol?: number;
}

export interface HMMResult {
  states: HMMMarketState[];
  stateProbs: number[][];     // [t][state]
  forwardVars: number[][];
  backwardVars: number[][];
  logLikelihood: number;
}

/**
 * 高斯 HMM（连续观测）
 */
export class GaussianHMM implements Model {
  name = "HMM-MarketState";
  type = "hmm" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  // 模型参数
  private N: number;           // 隐藏状态数
  private D: number;           // 观测维度
  private pi: number[];        // 初始概率 [N]
  private A: number[][];       // 转移矩阵 [N][N]
  private mu: number[][];      // 均值 [N][D]
  private sigma: number[][][]; // 协方差 [N][D][D]（对角）
  private stateLabels: string[];
  private maxIters = 100;
  private tol = 1e-4;

  constructor(config: HMMConfig) {
    this.N = config.numStates;
    this.D = config.numObservations;
    this.stateLabels = config.stateLabels || ["trending", "ranging", "volatile", "crash", "bull"];
    this.maxIters = config.maxIters ?? 100;
    this.tol = config.tol ?? 1e-4;
    this.initParams();
  }

  private initParams(): void {
    this.pi = normalizeProbs(Array.from({ length: this.N }, () => Math.random()));
    this.A = Array.from({ length: this.N }, () =>
      normalizeProbs(Array.from({ length: this.N }, () => Math.random())),
    );
    this.mu = Array.from({ length: this.N }, () =>
      Array.from({ length: this.D }, () => (Math.random() - 0.5) * 0.1),
    );
    // 初始化为单位协方差
    this.sigma = Array.from({ length: this.N }, () =>
      Array.from({ length: this.D }, () =>
        Array.from({ length: this.D }, (_, j) => (j === 0 ? 0.01 : 0)),
      ),
    );
    for (let n = 0; n < this.N; n++) {
      for (let d = 0; d < this.D; d++) {
        this.sigma[n][d][d] = 0.01;
      }
    }
  }

  /** 高斯概率密度（对角协方差） */
  private gaussianProb(x: number[], n: number): number {
    const D = this.D;
    let logProb = 0;
    for (let d = 0; d < D; d++) {
      const diff = x[d] - this.mu[n][d];
      const var_ = this.sigma[n][d][d] + EPS;
      logProb += -0.5 * Math.log(2 * Math.PI * var_) - (diff * diff) / (2 * var_);
    }
    return Math.exp(logProb);
  }

  /** 前向算法 - 返回 alpha[t][n] */
  private forward(O: number[][]): { alpha: number[][]; c: number[]; logLik: number } {
    const T = O.length;
    const alpha: number[][] = Array.from({ length: T }, () => Array(this.N).fill(0));
    const c = new Array(T).fill(0);

    // t=0
    for (let n = 0; n < this.N; n++) {
      alpha[0][n] = this.pi[n] * this.gaussianProb(O[0], n);
    }
    c[0] = alpha[0].reduce((a, b) => a + b, 0) + EPS;
    alpha[0] = alpha[0].map((v) => v / c[0]);

    // t>0
    for (let t = 1; t < T; t++) {
      for (let n = 0; n < this.N; n++) {
        let sum = 0;
        for (let j = 0; j < this.N; j++) sum += alpha[t - 1][j] * this.A[j][n];
        alpha[t][n] = sum * this.gaussianProb(O[t], n);
      }
      c[t] = alpha[t].reduce((a, b) => a + b, 0) + EPS;
      alpha[t] = alpha[t].map((v) => v / c[t]);
    }

    const logLik = -c.reduce((a, b) => a + Math.log(b + EPS), 0);
    return { alpha, c, logLik };
  }

  /** 后向算法 - 返回 beta[t][n] */
  private backward(O: number[][], c: number[]): number[][] {
    const T = O.length;
    const beta: number[][] = Array.from({ length: T }, () => Array(this.N).fill(0));

    // t=T-1
    for (let n = 0; n < this.N; n++) beta[T - 1][n] = 1 / (c[T - 1] + EPS);

    // t<T-1
    for (let t = T - 2; t >= 0; t--) {
      for (let n = 0; n < this.N; n++) {
        let sum = 0;
        for (let j = 0; j < this.N; j++) {
          sum += this.A[n][j] * this.gaussianProb(O[t + 1], j) * beta[t + 1][j];
        }
        beta[t][n] = sum / (c[t] + EPS);
      }
    }

    return beta;
  }

  /** Baum-Welch (EM) 训练 */
  train(X: number[][], _y?: any, options?: TrainOptions): TrainResult {
    const startTime = Date.now();
    const O = X;
    const T = O.length;
    const maxIters = options?.epochs ?? this.maxIters;
    const verbose = options?.verbose ?? false;
    const history: { epoch: number; loss: number; valLoss?: number }[] = [];
    let prevLogLik = -Infinity;

    for (let iter = 0; iter < maxIters; iter++) {
      // E-step
      const { alpha, c, logLik } = this.forward(O);
      const beta = this.backward(O, c);

      // 计算 gamma[t][n] 和 xi[t][n][j]
      const gamma: number[][] = Array.from({ length: T }, () => Array(this.N).fill(0));
      const xi: number[][][] = Array.from({ length: T - 1 }, () =>
        Array.from({ length: this.N }, () => Array(this.N).fill(0)),
      );

      for (let t = 0; t < T; t++) {
        let sum = 0;
        for (let n = 0; n < this.N; n++) {
          gamma[t][n] = alpha[t][n] * beta[t][n];
          sum += gamma[t][n];
        }
        if (sum > 0) for (let n = 0; n < this.N; n++) gamma[t][n] /= sum;

        if (t < T - 1) {
          let xiSum = 0;
          for (let n = 0; n < this.N; n++) {
            for (let j = 0; j < this.N; j++) {
              xi[t][n][j] = alpha[t][n] * this.A[n][j] *
                this.gaussianProb(O[t + 1], j) * beta[t + 1][j];
              xiSum += xi[t][n][j];
            }
          }
          if (xiSum > 0) {
            for (let n = 0; n < this.N; n++) {
              for (let j = 0; j < this.N; j++) xi[t][n][j] /= xiSum;
            }
          }
        }
      }

      // M-step: 更新参数
      // pi
      for (let n = 0; n < this.N; n++) this.pi[n] = gamma[0][n];

      // A
      for (let n = 0; n < this.N; n++) {
        let denom = 0;
        for (let t = 0; t < T - 1; t++) denom += gamma[t][n];
        for (let j = 0; j < this.N; j++) {
          let numer = 0;
          for (let t = 0; t < T - 1; t++) numer += xi[t][n][j];
          this.A[n][j] = (numer + EPS) / (denom + EPS);
        }
        // 重新归一化
        const rowSum = this.A[n].reduce((a, b) => a + b, 0) + EPS;
        this.A[n] = this.A[n].map((v) => v / rowSum);
      }

      // mu 和 sigma
      for (let n = 0; n < this.N; n++) {
        let gammaSum = 0;
        for (let t = 0; t < T; t++) gammaSum += gamma[t][n];
        for (let d = 0; d < this.D; d++) {
          let muNum = 0;
          for (let t = 0; t < T; t++) muNum += gamma[t][n] * O[t][d];
          this.mu[n][d] = muNum / (gammaSum + EPS);
        }
        for (let d = 0; d < this.D; d++) {
          let varSum = 0;
          for (let t = 0; t < T; t++) {
            const diff = O[t][d] - this.mu[n][d];
            varSum += gamma[t][n] * diff * diff;
          }
          this.sigma[n][d][d] = varSum / (gammaSum + EPS) + EPS;
        }
      }

      history.push({ epoch: iter, loss: -logLik });
      if (verbose) console.log(`[HMM] iter ${iter}, log-lik=${logLik.toFixed(4)}`);

      if (Math.abs(logLik - prevLogLik) < this.tol) {
        if (verbose) console.log(`[HMM] Converged at iter ${iter}`);
        break;
      }
      prevLogLik = logLik;
    }

    this.trained = true;
    this.trainedAt = Math.floor(Date.now() / 1000);
    this.metrics = { mse: -prevLogLik, accuracy: 0 };

    return {
      success: true,
      epochs: history.length,
      metrics: this.metrics,
      history,
      duration: Date.now() - startTime,
    };
  }

  /** Viterbi 解码 - 最可能状态序列 */
  predictSequence(observations: number[][]): { states: number[]; probs: number[][]; logLik: number } {
    if (!this.trained) throw new Error("HMM not trained");
    const T = observations.length;
    const dp: number[][] = Array.from({ length: T }, () => Array(this.N).fill(0));
    const backPtr: number[][] = Array.from({ length: T }, () => Array(this.N).fill(0));

    // 初始化
    for (let n = 0; n < this.N; n++) {
      dp[0][n] = Math.log(this.pi[n] + EPS) + Math.log(this.gaussianProb(observations[0], n) + EPS);
    }

    // 递推
    for (let t = 1; t < T; t++) {
      for (let n = 0; n < this.N; n++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        const emit = Math.log(this.gaussianProb(observations[t], n) + EPS);
        for (let j = 0; j < this.N; j++) {
          const v = dp[t - 1][j] + Math.log(this.A[j][n] + EPS);
          if (v > maxVal) {
            maxVal = v;
            maxIdx = j;
          }
        }
        dp[t][n] = maxVal + emit;
        backPtr[t][n] = maxIdx;
      }
    }

    // 回溯
    const states = new Array(T);
    let bestFinal = 0;
    let bestVal = dp[T - 1][0];
    for (let n = 1; n < this.N; n++) {
      if (dp[T - 1][n] > bestVal) {
        bestVal = dp[T - 1][n];
        bestFinal = n;
      }
    }
    states[T - 1] = bestFinal;
    for (let t = T - 2; t >= 0; t--) {
      states[t] = backPtr[t + 1][states[t + 1]];
    }

    // 计算每个时刻的状态概率
    const probs: number[][] = [];
    for (let t = 0; t < T; t++) {
      const logNorms = dp[t].map((v) => v - logSumExp(dp[t]));
      probs.push(logNorms.map(Math.exp));
    }

    return { states, probs, logLik: bestVal };
  }

  /** 单次预测 - 返回当前最可能状态 */
  predict(observation: number[]): number {
    if (!this.trained) return 0;
    const result = this.predictSequence([observation]);
    return result.states[0];
  }

  /** 带标签的完整预测 */
  predictLabeled(observation: number[]): HMMMarketState {
    const state = this.predict(observation);
    return (this.stateLabels[state] as HMMMarketState) || "ranging";
  }

  serialize(): string {
    return JSON.stringify({
      N: this.N,
      D: this.D,
      pi: this.pi,
      A: this.A,
      mu: this.mu,
      sigma: this.sigma,
      stateLabels: this.stateLabels,
      trained: this.trained,
      trainedAt: this.trainedAt,
      metrics: this.metrics,
    });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.N = obj.N;
    this.D = obj.D;
    this.pi = obj.pi;
    this.A = obj.A;
    this.mu = obj.mu;
    this.sigma = obj.sigma;
    this.stateLabels = obj.stateLabels;
    this.trained = obj.trained;
    this.trainedAt = obj.trainedAt;
    this.metrics = obj.metrics;
  }

  getTransitionMatrix(): number[][] { return this.A; }
  getMeans(): number[][] { return this.mu; }
  getLabels(): string[] { return this.stateLabels; }
}

/**
 * 工厂：创建市场状态 HMM
 */
export function createMarketHMM(numStates = 3, numObs = 4): GaussianHMM {
  const labels = ["trending", "ranging", "volatile", "crash", "bull"].slice(0, numStates);
  return new GaussianHMM({
    numStates,
    numObservations: numObs,
    stateLabels: labels,
  });
}
