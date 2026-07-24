/**
 * 贝叶斯优化 (Bayesian Optimization)
 *
 * 用高斯过程作为代理模型，结合采集函数（EI/PI/UCB）进行超参数优化。
 * 适用于样本昂贵的黑盒函数优化。
 */
import { zeros, gaussianPdf, gaussianSample, mean, std, clamp, EPS } from "./math";

export interface BOConfig {
  bounds: Array<{ name: string; min: number; max: number; type: "int" | "float" }>;
  objective: (params: Record<string, number>) => number;
  numIterations?: number;
  numInitialPoints?: number;
  acquisition?: "ei" | "ucb" | "pi";  // Expected Improvement / UCB / Probability of Improvement
  kappa?: number;    // UCB 探索系数
  xi?: number;       // EI 平衡参数
  noise?: number;    // 观测噪声
  lengthScale?: number;  // RBF 核长度尺度
  seed?: number;
  verbose?: boolean;
}

export interface BOResult {
  bestParams: Record<string, number>;
  bestValue: number;
  history: Array<{ params: Record<string, number>; value: number; isBest: boolean }>;
  totalIterations: number;
}

/**
 * 高斯过程回归（简化版，RBF 核）
 */
class GaussianProcess {
  X: number[][] = [];
  y: number[] = [];
  private lengthScale: number;
  private noise: number;
  private K: number[][] = [];
  private KInv: number[][] = [];
  private dirty = true;

  constructor(lengthScale = 1.0, noise = 1e-4) {
    this.lengthScale = lengthScale;
    this.noise = noise;
  }

  private rbfKernel(x1: number[], x2: number[]): number {
    let sum = 0;
    for (let i = 0; i < x1.length; i++) sum += ((x1[i] - x2[i]) / this.lengthScale) ** 2;
    return Math.exp(-0.5 * sum);
  }

  addData(x: number[], y: number): void {
    this.X.push(x);
    this.y.push(y);
    this.dirty = true;
  }

  private computeKernel(): void {
    const n = this.X.length;
    this.K = zeros(n, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        this.K[i][j] = this.rbfKernel(this.X[i], this.X[j]) + (i === j ? this.noise : 0);
      }
    }
    this.KInv = matrixInverse(this.K);
    this.dirty = false;
  }

  /** 预测均值和方差 */
  predict(x: number[]): { mean: number; variance: number } {
    if (this.X.length === 0) {
      return { mean: 0, variance: 1 };
    }
    if (this.dirty) this.computeKernel();

    const n = this.X.length;
    const k = new Array(n);
    for (let i = 0; i < n; i++) k[i] = this.rbfKernel(x, this.X[i]);

    // 均值 = k^T * K^{-1} * y
    let mu = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += this.KInv[i][j] * this.y[j];
      mu += k[i] * sum;
    }

    // 方差 = k(x,x) - k^T * K^{-1} * k
    let var_ = 1.0;  // k(x,x) = 1 for RBF with unit variance
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += this.KInv[i][j] * k[j];
      var_ -= k[i] * sum;
    }
    return { mean: mu, variance: Math.max(var_, EPS) };
  }
}

/** 矩阵求逆（高斯消元，小规模够用） */
function matrixInverse(matrix: number[][]): number[][] {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < EPS) {
      aug[col][col] = aug[col][col] + EPS;
    }
    for (let j = col; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row !== col && Math.abs(aug[row][col]) > EPS) {
        const factor = aug[row][col];
        for (let j = col; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * 贝叶斯优化器
 */
export class BayesianOptimizer {
  private config: Required<Omit<BOConfig, "bounds" | "objective">> & {
    bounds: BOConfig["bounds"];
    objective: BOConfig["objective"];
  };
  private gp: GaussianProcess;
  private rng: () => number;

  constructor(config: BOConfig) {
    this.config = {
      numIterations: config.numIterations ?? 20,
      numInitialPoints: config.numInitialPoints ?? 5,
      acquisition: config.acquisition ?? "ei",
      kappa: config.kappa ?? 2.576,
      xi: config.xi ?? 0.01,
      noise: config.noise ?? 1e-4,
      lengthScale: config.lengthScale ?? 1.0,
      seed: config.seed ?? Date.now(),
      verbose: config.verbose ?? false,
      bounds: config.bounds,
      objective: config.objective,
    };
    this.gp = new GaussianProcess(this.config.lengthScale, this.config.noise);
    let seed = this.config.seed;
    this.rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private paramsToVec(params: Record<string, number>): number[] {
    return this.config.bounds.map((b) => params[b.name]);
  }

  private vecToParams(vec: number[]): Record<string, number> {
    const result: Record<string, number> = {};
    this.config.bounds.forEach((b, i) => {
      result[b.name] = b.type === "int" ? Math.round(vec[i]) : vec[i];
    });
    return result;
  }

  private randomParams(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const b of this.config.bounds) {
      const val = b.min + this.rng() * (b.max - b.min);
      result[b.name] = b.type === "int" ? Math.round(val) : val;
    }
    return result;
  }

  /** 采集函数 */
  private acquisition(x: number[], bestY: number): number {
    const { mean: mu, variance: var_ } = this.gp.predict(x);
    const sigma = Math.sqrt(var_);
    const xi = this.config.xi;

    if (sigma < EPS) return 0;

    if (this.config.acquisition === "ucb") {
      return mu + this.config.kappa * sigma;
    }
    if (this.config.acquisition === "pi") {
      const z = (mu - bestY - xi) / sigma;
      return 0.5 * (1 + erf(z / Math.SQRT2));
    }
    // EI (default)
    const z = (mu - bestY - xi) / sigma;
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const cdf = 0.5 * (1 + erf(z / Math.SQRT2));
    return (mu - bestY - xi) * cdf + sigma * pdf;
  }

  /** 用随机采样近似优化采集函数 */
  private optimizeAcquisition(bestY: number): Record<string, number> {
    let bestVal = -Infinity;
    let bestParams = this.randomParams();
    const numSamples = 100;
    for (let i = 0; i < numSamples; i++) {
      const params = this.randomParams();
      const x = this.paramsToVec(params);
      const val = this.acquisition(x, bestY);
      if (val > bestVal) {
        bestVal = val;
        bestParams = params;
      }
    }
    return bestParams;
  }

  run(): BOResult {
    const history: Array<{ params: Record<string, number>; value: number; isBest: boolean }> = [];
    let bestValue = -Infinity;
    let bestParams: Record<string, number> = {};

    // 初始采样
    for (let i = 0; i < this.config.numInitialPoints; i++) {
      const params = this.randomParams();
      const value = this.config.objective(params);
      this.gp.addData(this.paramsToVec(params), value);
      const isBest = value > bestValue;
      if (isBest) {
        bestValue = value;
        bestParams = { ...params };
      }
      history.push({ params, value, isBest });
      if (this.config.verbose) {
        console.log(`[BO] init ${i}: ${value.toFixed(4)}, best=${bestValue.toFixed(4)}`);
      }
    }

    // 迭代优化
    for (let iter = 0; iter < this.config.numIterations; iter++) {
      const nextParams = this.optimizeAcquisition(bestValue);
      const value = this.config.objective(nextParams);
      this.gp.addData(this.paramsToVec(nextParams), value);
      const isBest = value > bestValue;
      if (isBest) {
        bestValue = value;
        bestParams = { ...nextParams };
      }
      history.push({ params: nextParams, value, isBest });
      if (this.config.verbose) {
        console.log(`[BO] iter ${iter}: ${value.toFixed(4)}, best=${bestValue.toFixed(4)}`);
      }
    }

    return { bestParams, bestValue, history, totalIterations: this.config.numIterations };
  }
}

/** 误差函数近似 */
function erf(x: number): number {
  // Abramowitz & Stegun 近似
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
