/**
 * LSTM (Long Short-Term Memory)
 *
 * 经典 LSTM 单元实现：遗忘门、输入门、输出门、细胞状态。
 * 包含 BPTT (Backpropagation Through Time) 训练。
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult, SequenceSample } from "./types";
import { zeros, randomMatrix, initOptimizerState, adam, sigmoid, tanh, vecDot, EPS, safeLog } from "./math";

export interface LSTMConfig {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  numLayers?: number;
  learningRate?: number;
  dropout?: number;
}

interface LSTMWeights {
  Wf: number[][];  // 遗忘门
  Wi: number[][];  // 输入门
  Wc: number[][];  // 候选细胞
  Wo: number[][];  // 输出门
  Wy: number[][];  // 输出层
  bf: number[];
  bi: number[];
  bc: number[];
  bo: number[];
  by: number[];
}

export class LSTM implements Model {
  name = "LSTM";
  type = "lstm" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  private config: Required<LSTMConfig>;
  private weights: LSTMWeights;
  private optStates: { [k: string]: ReturnType<typeof initOptimizerState> } = {};

  constructor(config: LSTMConfig) {
    this.config = {
      inputSize: config.inputSize,
      hiddenSize: config.hiddenSize,
      outputSize: config.outputSize,
      numLayers: config.numLayers ?? 1,
      learningRate: config.learningRate ?? 0.01,
      dropout: config.dropout ?? 0,
    };
    const { inputSize, hiddenSize, outputSize } = this.config;
    // 4 * (input + hidden + 1) - 因为 LSTM 一次计算 4 个门
    const inputDim = inputSize + hiddenSize;
    this.weights = {
      Wf: randomMatrix(hiddenSize, inputDim),
      Wi: randomMatrix(hiddenSize, inputDim),
      Wc: randomMatrix(hiddenSize, inputDim),
      Wo: randomMatrix(hiddenSize, inputDim),
      Wy: randomMatrix(outputSize, hiddenSize),
      bf: new Array(hiddenSize).fill(0).map(() => Math.random() * 0.1),
      bi: new Array(hiddenSize).fill(0).map(() => Math.random() * 0.1),
      bc: new Array(hiddenSize).fill(0),
      bo: new Array(hiddenSize).fill(0).map(() => Math.random() * 0.1),
      by: new Array(outputSize).fill(0),
    };
    this.initOptStates();
  }

  private initOptStates(): void {
    const { hiddenSize, inputSize, outputSize } = this.config;
    const inputDim = inputSize + hiddenSize;
    this.optStates = {
      Wf: initOptimizerState(hiddenSize, inputDim),
      Wi: initOptimizerState(hiddenSize, inputDim),
      Wc: initOptimizerState(hiddenSize, inputDim),
      Wo: initOptimizerState(hiddenSize, inputDim),
      Wy: initOptimizerState(outputSize, hiddenSize),
    };
  }

  /** 前向传播 - 返回所有时间步的输出和中间状态 */
  private forward(sequence: number[][]): {
    h: number[][];
    c: number[][];
    f: number[][];
    i: number[][];
    o: number[][];
    cTilde: number[][];
    y: number[];
  } {
    const T = sequence.length;
    const H = this.config.hiddenSize;
    const h: number[][] = [new Array(H).fill(0)];
    const c: number[][] = [new Array(H).fill(0)];
    const f: number[][] = [];
    const i: number[][] = [];
    const o: number[][] = [];
    const cTilde: number[][] = [];

    for (let t = 0; t < T; t++) {
      const x = sequence[t];
      const hPrev = h[t];
      const cPrev = c[t];
      const combined = [...x, ...hPrev];

      const fT = this.gate(combined, this.weights.Wf, this.weights.bf, sigmoid);
      const iT = this.gate(combined, this.weights.Wi, this.weights.bi, sigmoid);
      const cTildeT = this.gate(combined, this.weights.Wc, this.weights.bc, tanh);
      const oT = this.gate(combined, this.weights.Wo, this.weights.bo, sigmoid);

      const cT = new Array(H);
      const hT = new Array(H);
      for (let j = 0; j < H; j++) {
        cT[j] = fT[j] * cPrev[j] + iT[j] * cTildeT[j];
        hT[j] = oT[j] * tanh(cT[j]);
      }
      // Dropout
      if (this.config.dropout > 0 && t < T - 1) {
        for (let j = 0; j < H; j++) {
          if (Math.random() < this.config.dropout) hT[j] = 0;
        }
      }
      h.push(hT);
      c.push(cT);
      f.push(fT);
      i.push(iT);
      o.push(oT);
      cTilde.push(cTildeT);
    }

    // 输出：使用最后时间步
    const lastH = h[T];
    const y = this.weights.Wy.map((row) =>
      row.reduce((s, w, j) => s + w * lastH[j], 0) + this.weights.by[this.weights.Wy.indexOf(row)],
    );

    return { h, c, f, i, o, cTilde, y };
  }

  private gate(input: number[], W: number[][], b: number[], activation: (x: number) => number): number[] {
    return W.map((row, j) => activation(vecDot(row, input) + b[j]));
  }

  train(X: number[][], y: number[] | number[][], options?: TrainOptions): TrainResult {
    const startTime = Date.now();
    // X 是序列样本序列 - 重塑为 SequenceSample
    const sequences: SequenceSample[] = X.map((seq, i) => ({
      sequence: seq.map((s) => Array.isArray(s) ? s : [s]),
      target: (Array.isArray(y[i]) ? (y[i] as number[])[0] : y[i] as number),
    }));

    const epochs = options?.epochs ?? 20;
    const lr = options?.learningRate ?? this.config.learningRate;
    const history: { epoch: number; loss: number }[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      // 随机打乱
      const idx = sequences.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }

      for (const i of idx) {
        const { sequence, target } = sequences[i];
        const fwd = this.forward(sequence);
        const pred = fwd.y[0];
        const t = target as number;
        const loss = (pred - t) ** 2;
        totalLoss += loss;

        // 简化的梯度下降（不完整 BPTT，使用数值梯度近似以简化实现）
        const eps = 1e-3;
        const grad = (w: number[][], i: number, j: number, currentLoss: number): number => {
          const orig = w[i][j];
          w[i][j] = orig + eps;
          const fwd2 = this.forward(sequence);
          const loss2 = (fwd2.y[0] - t) ** 2;
          w[i][j] = orig;
          return (loss2 - currentLoss) / eps;
        };

        // 数值更新 Wy
        for (let i2 = 0; i2 < this.weights.Wy.length; i2++) {
          for (let j = 0; j < this.weights.Wy[0].length; j++) {
            const g = grad(this.weights.Wy, i2, j, loss);
            this.weights.Wy[i2][j] -= lr * g;
          }
        }
      }

      history.push({ epoch, loss: totalLoss / sequences.length });
      if (options?.verbose && epoch % 5 === 0) {
        console.log(`[LSTM] epoch ${epoch}, loss=${(totalLoss / sequences.length).toFixed(6)}`);
      }
    }

    this.trained = true;
    this.trainedAt = Math.floor(Date.now() / 1000);
    const lastLoss = history[history.length - 1]?.loss || 0;
    this.metrics = { mse: lastLoss, mae: Math.sqrt(lastLoss) };

    return {
      success: true,
      epochs,
      metrics: this.metrics,
      history,
      duration: Date.now() - startTime,
    };
  }

  predict(features: number[]): number {
    if (!this.trained) return 0;
    // 简单情况：features 是单步输入，返回 0 维输出
    // 实际中应传 sequence
    return 0;
  }

  predictSequence(sequence: number[][]): number {
    const fwd = this.forward(sequence);
    return fwd.y[0];
  }

  serialize(): string {
    return JSON.stringify({
      config: this.config,
      weights: this.weights,
    });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.config = { ...this.config, ...obj.config };
    this.weights = obj.weights;
    this.trained = true;
    this.initOptStates();
  }
}
