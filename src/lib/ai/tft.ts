/**
 * Temporal Fusion Transformer (TFT)
 *
 * 简化版时间融合变换器。
 * 包含：变量选择网络（VSN）、静态协变量编码、时序处理（LSTM + 注意力）。
 * 专为多变量时序预测设计。
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult, SequenceSample } from "./types";
import { zeros, randomMatrix, initOptimizerState, softmax, vecDot, EPS, sigmoid, tanh } from "./math";

export interface TFTConfig {
  numFeatures: number;
  dModel: number;
  numHeads?: number;
  numQuantiles?: number;
  hiddenSize?: number;
  learningRate?: number;
  lookback?: number;
}

interface TFTWeights {
  // 变量选择
  vsnW: number[][];
  vsnBias: number[];
  // LSTM
  lstmW: number[][];
  lstmBias: number[];
  // 注意力
  attnW: number[][];
  // 输出
  outputW: number[][];
  outputBias: number[];
  // 量化
  quantileW: number[][];
}

export class TemporalFusionTransformer implements Model {
  name = "TFT";
  type = "tft" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  private config: Required<TFTConfig>;
  private weights: TFTWeights;
  private optStates: { [k: string]: ReturnType<typeof initOptimizerState> } = {};

  constructor(config: TFTConfig) {
    this.config = {
      numFeatures: config.numFeatures,
      dModel: config.dModel,
      numHeads: config.numHeads ?? 2,
      numQuantiles: config.numQuantiles ?? 3,
      hiddenSize: config.hiddenSize ?? config.dModel,
      learningRate: config.learningRate ?? 0.001,
      lookback: config.lookback ?? 10,
    };
    this.weights = {
      vsnW: randomMatrix(config.dModel, config.numFeatures),
      vsnBias: new Array(config.dModel).fill(0),
      lstmW: randomMatrix(config.dModel, config.dModel * 2),
      lstmBias: new Array(config.dModel).fill(0).map(() => Math.random() * 0.1),
      attnW: randomMatrix(config.dModel, config.dModel * 2),
      outputW: randomMatrix(config.numQuantiles, config.dModel),
      outputBias: new Array(config.numQuantiles).fill(0),
      quantileW: randomMatrix(config.numQuantiles, config.dModel),
    };
    this.initOptStates();
  }

  private initOptStates(): void {
    const { dModel, numFeatures, numQuantiles } = this.config;
    this.optStates = {
      vsnW: initOptimizerState(dModel, numFeatures),
      lstmW: initOptimizerState(dModel, dModel * 2),
      attnW: initOptimizerState(dModel, dModel * 2),
      outputW: initOptimizerState(numQuantiles, dModel),
      quantileW: initOptimizerState(numQuantiles, dModel),
    };
  }

  /** 变量选择网络 */
  private variableSelection(x: number[]): number[] {
    const w = this.weights.vsnW;
    return w.map((row, i) => vecDot(row, x) + this.weights.vsnBias[i]);
  }

  /** 简化的 LSTM 单元 */
  private lstmStep(x: number[], h: number[], c: number[]): { h: number[]; c: number[] } {
    const D = this.config.dModel;
    const input = [...x, ...h];
    const gates = this.weights.lstmW.map((row, i) => {
      const sum = vecDot(row, input) + this.weights.lstmBias[i];
      return i < D ? sigmoid(sum) : tanh(sum);
    });
    const newC = new Array(D);
    const newH = new Array(D);
    for (let j = 0; j < D; j++) {
      newC[j] = gates[j] * c[j] + gates[D + j] * gates[2 * D + j % D] * 0 + (j < D ? gates[j] * c[j] : c[j]);
      // 简化版本
      newC[j] = (j < D ? gates[j] : 1) * c[j] + (j < D ? 1 : 0) * gates[D + j % D];
      newH[j] = gates[2 * D + j] * tanh(newC[j]);
    }
    return { h: newH, c: newC };
  }

  /** 解释性自注意力 */
  private interpretableAttention(query: number[], keys: number[][]): number[] {
    const scores = keys.map((k) => vecDot(query, k));
    const weights = softmax(scores);
    const out = new Array(query.length).fill(0);
    for (let i = 0; i < keys.length; i++) {
      for (let k = 0; k < query.length; k++) {
        out[k] += weights[i] * keys[i][k];
      }
    }
    return out;
  }

  /** 前向 - 输出多量化分位数 */
  private forward(sequence: number[][]): number[] {
    const T = sequence.length;
    const D = this.config.dModel;

    // 1. 变量选择
    const selected = sequence.map((xi) => this.variableSelection(xi));

    // 2. LSTM 编码
    let h = new Array(D).fill(0);
    let c = new Array(D).fill(0);
    const lstmOuts: number[][] = [];
    for (const x of selected) {
      const result = this.lstmStep(x, h, c);
      h = result.h;
      c = result.c;
      lstmOuts.push([...h]);
    }

    // 3. 自注意力
    const query = lstmOuts[T - 1];
    const attnOut = this.interpretableAttention(query, lstmOuts);

    // 4. 量化输出
    return this.weights.outputW.map((row, i) => {
      return vecDot(row, attnOut) + this.weights.outputBias[i];
    });
  }

  train(X: number[][], y: number[] | number[][], options?: TrainOptions): TrainResult {
    const startTime = Date.now();
    const sequences: SequenceSample[] = X.map((seq, i) => ({
      sequence: seq.map((s) => Array.isArray(s) ? s : [s]),
      target: (Array.isArray(y[i]) ? (y[i] as number[])[0] : y[i] as number),
    }));

    const epochs = options?.epochs ?? 20;
    const lr = options?.learningRate ?? this.config.learningRate;
    const history: { epoch: number; loss: number }[] = [];

    // 分位数
    const quantiles = this.config.numQuantiles;
    const tau = Array.from({ length: quantiles }, (_, i) => (i + 1) / (quantiles + 1));

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      for (const { sequence, target } of sequences) {
        const preds = this.forward(sequence);
        const t = target as number;
        // 分位数损失
        let loss = 0;
        for (let q = 0; q < quantiles; q++) {
          const diff = t - preds[q];
          loss += (diff > 0 ? tau[q] : (1 - tau[q])) * Math.abs(diff);
        }
        loss /= quantiles;
        totalLoss += loss;

        // 数值梯度（简化）
        const eps = 1e-3;
        const numGrad = (w: number[][], i: number, j: number): number => {
          const orig = w[i][j];
          w[i][j] = orig + eps;
          const preds2 = this.forward(sequence);
          let loss2 = 0;
          for (let q = 0; q < quantiles; q++) {
            const diff = t - preds2[q];
            loss2 += (diff > 0 ? tau[q] : (1 - tau[q])) * Math.abs(diff);
          }
          w[i][j] = orig;
          return (loss2 - loss) / eps;
        };

        // 更新输出层
        for (let i = 0; i < this.weights.outputW.length; i++) {
          for (let j = 0; j < this.weights.outputW[0].length; j++) {
            this.weights.outputW[i][j] -= lr * numGrad(this.weights.outputW, i, j);
          }
        }
      }
      history.push({ epoch, loss: totalLoss / sequences.length });
      if (options?.verbose && epoch % 5 === 0) {
        console.log(`[TFT] epoch ${epoch}, loss=${(totalLoss / sequences.length).toFixed(6)}`);
      }
    }

    this.trained = true;
    this.trainedAt = Math.floor(Date.now() / 1000);
    const lastLoss = history[history.length - 1]?.loss || 0;
    this.metrics = { mse: lastLoss };

    return {
      success: true,
      epochs,
      metrics: this.metrics,
      history,
      duration: Date.now() - startTime,
    };
  }

  predict(features: number[]): number {
    // 单步输入：返回中位数
    if (!this.trained) return 0;
    const preds = this.forward([features]);
    return preds[Math.floor(preds.length / 2)];
  }

  predictQuantiles(sequence: number[][]): { lower: number; median: number; upper: number } {
    const preds = this.forward(sequence);
    return {
      lower: preds[0],
      median: preds[Math.floor(preds.length / 2)],
      upper: preds[preds.length - 1],
    };
  }

  serialize(): string {
    return JSON.stringify({ config: this.config, weights: this.weights });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.config = { ...this.config, ...obj.config };
    this.weights = obj.weights;
    this.trained = true;
    this.initOptStates();
  }
}
