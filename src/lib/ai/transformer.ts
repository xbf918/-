/**
 * Transformer 编码器
 *
 * 实现自注意力机制 + 前馈网络，可用于时序预测。
 * 简化版：单头注意力，无位置编码（输入可包含位置特征）。
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult, SequenceSample } from "./types";
import {
  zeros, randomMatrix, initOptimizerState, softmax, vecDot, EPS, safeLog, sigmoid, tanh,
} from "./math";

export interface TransformerConfig {
  inputSize: number;
  dModel: number;          // 隐藏维度
  numHeads?: number;
  dFF?: number;            // 前馈维度
  numLayers?: number;
  outputSize?: number;
  learningRate?: number;
  dropout?: number;
}

interface AttentionWeights {
  Wq: number[][];
  Wk: number[][];
  Wv: number[][];
  Wo: number[][];
}

export class Transformer implements Model {
  name = "Transformer";
  type = "transformer" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  private config: Required<TransformerConfig>;
  private attentionLayers: AttentionWeights[] = [];
  private ffWeights: { W1: number[][]; W2: number[][]; b1: number[]; b2: number[] }[] = [];
  private outputWeight: number[][] = [];
  private outputBias: number[] = [];
  private optStates: { [k: string]: any } = {};

  constructor(config: TransformerConfig) {
    this.config = {
      inputSize: config.inputSize,
      dModel: config.dModel,
      numHeads: config.numHeads ?? 1,
      dFF: config.dFF ?? config.dModel * 4,
      numLayers: config.numLayers ?? 1,
      outputSize: config.outputSize ?? 1,
      learningRate: config.learningRate ?? 0.001,
      dropout: config.dropout ?? 0,
    };
    this.initWeights();
  }

  private initWeights(): void {
    const { dModel, dFF, numLayers, outputSize } = this.config;
    this.attentionLayers = [];
    this.ffWeights = [];
    for (let l = 0; l < numLayers; l++) {
      this.attentionLayers.push({
        Wq: randomMatrix(dModel, dModel),
        Wk: randomMatrix(dModel, dModel),
        Wv: randomMatrix(dModel, dModel),
        Wo: randomMatrix(dModel, dModel),
      });
      this.ffWeights.push({
        W1: randomMatrix(dFF, dModel),
        W2: randomMatrix(dModel, dFF),
        b1: new Array(dFF).fill(0),
        b2: new Array(dModel).fill(0),
      });
    }
    this.outputWeight = randomMatrix(outputSize, dModel);
    this.outputBias = new Array(outputSize).fill(0);
    this.initOptStates();
  }

  private initOptStates(): void {
    const { dModel, dFF, numLayers, outputSize } = this.config;
    this.optStates = {};
    for (let l = 0; l < numLayers; l++) {
      this.optStates[`Wq_${l}`] = initOptimizerState(dModel, dModel);
      this.optStates[`Wk_${l}`] = initOptimizerState(dModel, dModel);
      this.optStates[`Wv_${l}`] = initOptimizerState(dModel, dModel);
      this.optStates[`Wo_${l}`] = initOptimizerState(dModel, dModel);
      this.optStates[`ff_W1_${l}`] = initOptimizerState(dFF, dModel);
      this.optStates[`ff_W2_${l}`] = initOptimizerState(dModel, dFF);
    }
    this.optStates[`output`] = initOptimizerState(outputSize, dModel);
  }

  /** 自注意力（前向） */
  private attention(
    x: number[][],   // [T, dModel]
    W: AttentionWeights,
  ): { out: number[][]; scores: number[][] } {
    const T = x.length;
    const d = W.Wq.length;
    const Q = x.map((xi) => W.Wq.map((row) => vecDot(row, xi)));
    const K = x.map((xi) => W.Wk.map((row) => vecDot(row, xi)));
    const V = x.map((xi) => W.Wv.map((row) => vecDot(row, xi)));

    // scores = Q @ K^T / sqrt(d)
    const scale = 1 / Math.sqrt(d);
    const scores: number[][] = [];
    for (let i = 0; i < T; i++) {
      const row: number[] = [];
      for (let j = 0; j < T; j++) {
        row.push(vecDot(Q[i], K[j]) * scale);
      }
      scores.push(row);
    }

    // softmax 每行
    const attn = scores.map(softmax);

    // out = attn @ V
    const attnOut: number[][] = [];
    for (let i = 0; i < T; i++) {
      const row: number[] = new Array(d).fill(0);
      for (let j = 0; j < T; j++) {
        for (let k = 0; k < d; k++) {
          row[k] += attn[i][j] * V[j][k];
        }
      }
      attnOut.push(row);
    }

    // 投影 Wo
    const out = attnOut.map((xi) => W.Wo.map((row) => vecDot(row, xi)));
    return { out, scores: attn };
  }

  /** 前向传播 */
  private forward(sequence: number[][]): number[] {
    const T = sequence.length;
    // 投影到 dModel（如果 inputSize != dModel，简化为恒等 + 填充）
    let x: number[][] = sequence.map((xi) => {
      const padded = [...xi];
      while (padded.length < this.config.dModel) padded.push(0);
      return padded.slice(0, this.config.dModel);
    });

    for (let l = 0; l < this.config.numLayers; l++) {
      // 自注意力 + 残差
      const { out: attnOut } = this.attention(x, this.attentionLayers[l]);
      x = x.map((xi, i) => xi.map((v, k) => v + attnOut[i][k]));

      // FFN + 残差
      const ffOut: number[][] = x.map((xi) => {
        const hidden = this.ffWeights[l].W1.map((row) =>
          Math.max(0, vecDot(row, xi) + this.ffWeights[l].b1[this.ffWeights[l].W1.indexOf(row)]),
        );
        return this.ffWeights[l].W2.map((row, k) =>
          vecDot(row, hidden) + this.ffWeights[l].b2[k],
        );
      });
      x = x.map((xi, i) => xi.map((v, k) => v + ffOut[i][k]));
    }

    // 平均池化 + 输出
    const pooled = new Array(this.config.dModel).fill(0);
    for (const xi of x) for (let k = 0; k < this.config.dModel; k++) pooled[k] += xi[k] / T;

    return this.outputWeight.map((row) => vecDot(row, pooled) + this.outputBias[this.outputWeight.indexOf(row)]);
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

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      for (const { sequence, target } of sequences) {
        const out = this.forward(sequence);
        const t = target as number;
        const loss = (out[0] - t) ** 2;
        totalLoss += loss;

        // 简化为数值梯度（实际应实现完整反向传播）
        const eps = 1e-3;
        const numGrad = (w: number[][], i: number, j: number): number => {
          const orig = w[i][j];
          w[i][j] = orig + eps;
          const out2 = this.forward(sequence);
          const loss2 = (out2[0] - t) ** 2;
          w[i][j] = orig;
          return (loss2 - loss) / eps;
        };

        // 更新输出层
        for (let i = 0; i < this.outputWeight.length; i++) {
          for (let j = 0; j < this.outputWeight[0].length; j++) {
            this.outputWeight[i][j] -= lr * numGrad(this.outputWeight, i, j);
          }
        }
      }
      history.push({ epoch, loss: totalLoss / sequences.length });
      if (options?.verbose && epoch % 5 === 0) {
        console.log(`[Transformer] epoch ${epoch}, loss=${(totalLoss / sequences.length).toFixed(6)}`);
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
    if (!this.trained) return 0;
    const out = this.forward([features]);
    return out[0];
  }

  predictSequence(sequence: number[][]): number[] {
    return this.forward(sequence);
  }

  serialize(): string {
    return JSON.stringify({
      config: this.config,
      attentionLayers: this.attentionLayers,
      ffWeights: this.ffWeights,
      outputWeight: this.outputWeight,
      outputBias: this.outputBias,
    });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.config = { ...this.config, ...obj.config };
    this.attentionLayers = obj.attentionLayers;
    this.ffWeights = obj.ffWeights;
    this.outputWeight = obj.outputWeight;
    this.outputBias = obj.outputBias;
    this.trained = true;
    this.initOptStates();
  }
}
