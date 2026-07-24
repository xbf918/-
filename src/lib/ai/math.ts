/**
 * AI/ML 通用数学工具
 * 提供矩阵运算、概率分布、优化器、激活函数等
 */

export type Vector = number[];
export type Matrix = number[][];
export type Tensor3D = number[][][];

// ============ 基础数学 ============

export const EPS = 1e-10;

export function clamp(x: number, lo = -Infinity, hi = Infinity): number {
  return Math.max(lo, Math.min(hi, x));
}

export function safeLog(x: number): number {
  return Math.log(Math.max(x, EPS));
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

export function logit(p: number): number {
  return Math.log(safeDiv(p, 1 - p));
}

export function softmax(arr: Vector): Vector {
  const max = Math.max(...arr);
  const exps = arr.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

export function tanh(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e1 = Math.exp(x);
  const e2 = Math.exp(-x);
  return (e1 - e2) / (e1 + e2);
}

export function relu(x: number): number {
  return Math.max(0, x);
}

export function reluGrad(x: number): number {
  return x > 0 ? 1 : 0;
}

export function leakyRelu(x: number, alpha = 0.01): number {
  return x > 0 ? x : alpha * x;
}

export function elu(x: number, alpha = 1): number {
  return x >= 0 ? x : alpha * (Math.exp(x) - 1);
}

// ============ 矩阵运算 ============

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

export function zeros3d(d1: number, d2: number, d3: number): Tensor3D {
  return Array.from({ length: d1 }, () => zeros(d2, d3));
}

export function randomMatrix(rows: number, cols: number, scale = 0.1): Matrix {
  // Xavier/Glorot 初始化
  const limit = Math.sqrt(6 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * limit * scale * 10),
  );
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const m = a.length, k = a[0].length, n = b[0].length;
  const result = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) sum += a[i][p] * b[p][j];
      result[i][j] = sum;
    }
  }
  return result;
}

export function matVec(a: Matrix, v: Vector): Vector {
  return a.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));
}

export function vecAdd(a: Vector, b: Vector): Vector {
  return a.map((x, i) => x + b[i]);
}

export function vecSub(a: Vector, b: Vector): Vector {
  return a.map((x, i) => x - b[i]);
}

export function vecScale(a: Vector, s: number): Vector {
  return a.map((x) => x * s);
}

export function vecDot(a: Vector, b: Vector): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

export function vecNorm(a: Vector): number {
  return Math.sqrt(a.reduce((s, x) => s + x * x, 0));
}

export function vecMean(a: Vector): number {
  return a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
}

export function vecStd(a: Vector): number {
  const m = vecMean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length));
}

export function transpose(a: Matrix): Matrix {
  const m = a.length, n = a[0].length;
  const t: Matrix = zeros(n, m);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) t[j][i] = a[i][j];
  return t;
}

// ============ 概率分布 ============

export function gaussianPdf(x: number, mu = 0, sigma = 1): number {
  const diff = x - mu;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
}

export function gaussianSample(mu = 0, sigma = 1): number {
  // Box-Muller 变换
  const u1 = Math.random() || EPS;
  const u2 = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function categoricalSample(probs: Vector): number {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i];
    if (r < cum) return i;
  }
  return probs.length - 1;
}

export function logSumExp(arr: Vector): number {
  const max = Math.max(...arr);
  return max + Math.log(arr.reduce((s, v) => s + Math.exp(v - max), 0));
}

// ============ 统计量 ============

export function mean(arr: Vector): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function variance(arr: Vector, sample = true): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - (sample ? 1 : 0));
}

export function std(arr: Vector): number {
  return Math.sqrt(variance(arr));
}

export function correlation(a: Vector, b: Vector): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return safeDiv(num, Math.sqrt(da * db));
}

export function quantile(arr: Vector, q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

// ============ 优化器 ============

export interface OptimizerState {
  step: number;
  m: Matrix;  // 一阶矩
  v: Matrix;  // 二阶矩
}

/** Adam 优化器 */
export function adam(
  param: Matrix,
  grad: Matrix,
  state: OptimizerState,
  lr = 0.001,
  beta1 = 0.9,
  beta2 = 0.999,
  eps = 1e-8,
): { param: Matrix; state: OptimizerState } {
  const m = param.map((row, i) => row.map((_, j) => beta1 * state.m[i][j] + (1 - beta1) * grad[i][j]));
  const v = param.map((row, i) => row.map((_, j) => beta2 * state.v[i][j] + (1 - beta2) * grad[i][j] ** 2));
  const newParam = param.map((row, i) =>
    row.map((p, j) => {
      const mh = m[i][j] / (1 - beta1 ** (state.step + 1));
      const vh = v[i][j] / (1 - beta2 ** (state.step + 1));
      return p - lr * mh / (Math.sqrt(vh) + eps);
    }),
  );
  return { param: newParam, state: { step: state.step + 1, m, v } };
}

export function initOptimizerState(rows: number, cols: number): OptimizerState {
  return { step: 0, m: zeros(rows, cols), v: zeros(rows, cols) };
}

// ============ 距离度量 ============

export function euclidean(a: Vector, b: Vector): number {
  return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
}

export function manhattan(a: Vector, b: Vector): number {
  return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
}

export function cosine(a: Vector, b: Vector): number {
  const dot = vecDot(a, b);
  const normA = vecNorm(a) * vecNorm(b);
  return safeDiv(dot, normA);
}

// ============ 数值稳定性工具 ============

export function normalizeProbs(probs: Vector): Vector {
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum === 0) return probs.map(() => 1 / probs.length);
  return probs.map((p) => p / sum);
}

export function logNormalize(logProbs: Vector): Vector {
  const lse = logSumExp(logProbs);
  return logProbs.map((lp) => Math.exp(lp - lse));
}

export function entropy(probs: Vector): number {
  return -probs.reduce((s, p) => s + (p > 0 ? p * safeLog(p) : 0), 0);
}
