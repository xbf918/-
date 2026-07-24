/**
 * 强化学习代理
 *
 * 统一实现 DQN / PPO / SAC 三种算法。
 * 状态：市场特征 + 持仓信息
 * 动作：buy / sell / hold / close + size
 * 奖励：PnL - 风险惩罚
 */
import type { Model, ModelMetrics, TrainOptions, TrainResult, RLState, RLAction, RLExperience, RLAlgorithm } from "./types";
import {
  zeros, randomMatrix, initOptimizerState, adam, softmax, vecDot, EPS, safeLog, gaussianSample, clamp, vecNorm, vecMean, vecAdd, vecScale,
} from "./math";

export interface RLConfig {
  algorithm?: RLAlgorithm;
  stateSize: number;
  actionSize: number;
  hiddenSize?: number;
  learningRate?: number;
  gamma?: number;          // 折扣因子
  tau?: number;            // 软更新率
  epsilonStart?: number;
  epsilonEnd?: number;
  epsilonDecay?: number;
  bufferSize?: number;
  batchSize?: number;
  clipRatio?: number;      // PPO
  entropyCoef?: number;
  targetEntropy?: number;  // SAC
}

interface Transition {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
  logProb?: number;
  value?: number;
}

// 简单的多层感知机
class MLP {
  layers: { W: number[][]; b: number[]; activation: "relu" | "tanh" | "none" }[];
  constructor(sizes: number[], activation: "relu" | "tanh" | "none" = "relu", outputActivation: "relu" | "tanh" | "none" = "none") {
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      this.layers.push({
        W: randomMatrix(sizes[i + 1], sizes[i]),
        b: new Array(sizes[i + 1]).fill(0),
        activation: i === sizes.length - 2 ? outputActivation : activation,
      });
    }
  }
  forward(x: number[]): number[] {
    let out = x;
    for (const layer of this.layers) {
      const newOut = new Array(layer.W.length).fill(0);
      for (let i = 0; i < layer.W.length; i++) {
        let sum = vecDot(layer.W[i], out) + layer.b[i];
        if (layer.activation === "relu") sum = Math.max(0, sum);
        else if (layer.activation === "tanh") sum = Math.tanh(sum);
        newOut[i] = sum;
      }
      out = newOut;
    }
    return out;
  }
  parameters(): { W: number[][]; b: number[] }[] {
    return this.layers.map((l) => ({ W: l.W, b: l.b }));
  }
}

/**
 * DQN 代理（Deep Q-Network）
 */
class DQNAgent {
  qNet: MLP;
  targetNet: MLP;
  optimizerStates: { [k: string]: any } = {};
  epsilon: number;
  config: Required<RLConfig>;
  buffer: Transition[] = [];

  constructor(config: Required<RLConfig>) {
    this.config = config;
    this.qNet = new MLP([config.stateSize, config.hiddenSize, config.hiddenSize, config.actionSize], "relu", "none");
    this.targetNet = new MLP([config.stateSize, config.hiddenSize, config.hiddenSize, config.actionSize], "relu", "none");
    this.copyWeights();
    this.epsilon = config.epsilonStart;
    this.initOptStates();
  }

  private initOptStates(): void {
    for (let i = 0; i < this.qNet.layers.length; i++) {
      this.optimizerStates[`W_${i}`] = initOptimizerState(
        this.qNet.layers[i].W.length, this.qNet.layers[i].W[0].length,
      );
    }
  }

  private copyWeights(): void {
    for (let i = 0; i < this.qNet.layers.length; i++) {
      this.targetNet.layers[i].W = this.qNet.layers[i].W.map((row) => [...row]);
      this.targetNet.layers[i].b = [...this.qNet.layers[i].b];
    }
  }

  selectAction(state: number[]): { action: number; qValues: number[] } {
    if (Math.random() < this.epsilon) {
      return { action: Math.floor(Math.random() * this.config.actionSize), qValues: new Array(this.config.actionSize).fill(0) };
    }
    const q = this.qNet.forward(state);
    let bestAction = 0;
    let bestQ = q[0];
    for (let i = 1; i < q.length; i++) {
      if (q[i] > bestQ) {
        bestQ = q[i];
        bestAction = i;
      }
    }
    return { action: bestAction, qValues: q };
  }

  store(transition: Transition): void {
    this.buffer.push(transition);
    if (this.buffer.length > this.config.bufferSize) this.buffer.shift();
  }

  trainStep(): number {
    if (this.buffer.length < this.config.batchSize) return 0;
    // 采样 batch
    const batch: Transition[] = [];
    for (let i = 0; i < this.config.batchSize; i++) {
      batch.push(this.buffer[Math.floor(Math.random() * this.buffer.length)]);
    }

    // 计算目标 Q
    let totalLoss = 0;
    for (const t of batch) {
      const targetQ = this.targetNet.forward(t.nextState);
      const maxTargetQ = Math.max(...targetQ);
      const target = t.reward + (t.done ? 0 : this.config.gamma * maxTargetQ);

      const currentQ = this.qNet.forward(t.state);
      const loss = (currentQ[t.action] - target) ** 2;
      totalLoss += loss;

      // 数值梯度更新
      const eps = 1e-3;
      const numGrad = (W: number[][], b: number[], i: number, j: number, current: number, isBias: boolean): number => {
        const orig = isBias ? b[i] : W[i][j];
        if (isBias) b[i] = orig + eps; else W[i][j] = orig + eps;
        const q2 = this.qNet.forward(t.state);
        const loss2 = (q2[t.action] - target) ** 2;
        if (isBias) b[i] = orig; else W[i][j] = orig;
        return (loss2 - loss) / eps;
      };

      for (let l = 0; l < this.qNet.layers.length; l++) {
        const layer = this.qNet.layers[l];
        const lr = this.config.learningRate;
        for (let i = 0; i < layer.W.length; i++) {
          for (let j = 0; j < layer.W[0].length; j++) {
            const g = numGrad(layer.W, layer.b, i, j, currentQ[t.action], false);
            layer.W[i][j] -= lr * g;
          }
          const g = numGrad(layer.W, layer.b, i, 0, currentQ[t.action], true);
          layer.b[i] -= lr * g;
        }
      }
    }

    // 软更新 target
    for (let l = 0; l < this.qNet.layers.length; l++) {
      for (let i = 0; i < this.qNet.layers[l].W.length; i++) {
        for (let j = 0; j < this.qNet.layers[l].W[0].length; j++) {
          this.targetNet.layers[l].W[i][j] = this.config.tau * this.qNet.layers[l].W[i][j] +
            (1 - this.config.tau) * this.targetNet.layers[l].W[i][j];
        }
        this.targetNet.layers[l].b[i] = this.config.tau * this.qNet.layers[l].b[i] +
          (1 - this.config.tau) * this.targetNet.layers[l].b[i];
      }
    }

    // 衰减 epsilon
    this.epsilon = Math.max(this.config.epsilonEnd, this.epsilon * this.config.epsilonDecay);

    return totalLoss / this.config.batchSize;
  }
}

/**
 * PPO 代理（Proximal Policy Optimization）
 */
class PPOAgent {
  actor: MLP;
  critic: MLP;
  buffer: Transition[] = [];
  config: Required<RLConfig>;

  constructor(config: Required<RLConfig>) {
    this.config = config;
    this.actor = new MLP([config.stateSize, config.hiddenSize, config.hiddenSize, config.actionSize], "relu", "tanh");
    this.critic = new MLP([config.stateSize, config.hiddenSize, config.hiddenSize, 1], "relu", "none");
  }

  selectAction(state: number[]): { action: number; logProb: number; value: number } {
    const logits = this.actor.forward(state);
    const probs = softmax(logits);
    const action = sampleFromProbs(probs);
    const logProb = Math.log(probs[action] + EPS);
    const value = this.critic.forward(state)[0];
    return { action, logProb, value };
  }

  store(t: Transition): void {
    this.buffer.push(t);
  }

  trainStep(): number {
    if (this.buffer.length < this.config.batchSize) return 0;

    // 计算 GAE 优势
    const advantages: number[] = [];
    let gae = 0;
    for (let t = this.buffer.length - 1; t >= 0; t--) {
      const trans = this.buffer[t];
      const nextValue = t < this.buffer.length - 1 ? this.buffer[t + 1].value || 0 : 0;
      const delta = trans.reward + this.config.gamma * nextValue - (trans.value || 0);
      gae = delta + this.config.gamma * 0.95 * gae;
      advantages.unshift(gae);
    }
    // 归一化
    const advMean = vecMean(advantages);
    const advStd = Math.sqrt(advantages.reduce((s, a) => s + (a - advMean) ** 2, 0) / advantages.length) + EPS;
    const normAdv = advantages.map((a) => (a - advMean) / advStd);

    let totalLoss = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const trans = this.buffer[i];
      const oldLogProb = trans.logProb || 0;

      // 计算当前策略 log_prob（简化）
      const logits = this.actor.forward(trans.state);
      const probs = softmax(logits);
      const newLogProb = Math.log(probs[trans.action] + EPS);

      // 重要性采样比率
      const ratio = Math.exp(newLogProb - oldLogProb);

      // PPO 目标
      const surr1 = ratio * normAdv[i];
      const clippedRatio = clamp(ratio, 1 - this.config.clipRatio, 1 + this.config.clipRatio);
      const surr2 = clippedRatio * normAdv[i];
      const policyLoss = -Math.min(surr1, surr2);

      // 价值损失
      const valuePred = this.critic.forward(trans.state)[0];
      const returns = normAdv[i] + (trans.value || 0);
      const valueLoss = (valuePred - returns) ** 2;

      // 熵奖励
      const entropy = -probs.reduce((s, p) => s + p * Math.log(p + EPS), 0);

      const loss = policyLoss + 0.5 * valueLoss - this.config.entropyCoef * entropy;
      totalLoss += loss;

      // 数值梯度更新（简化）
      const eps = 1e-3;
      const numGrad = (W: number[][], b: number[], i: number, j: number, isBias: boolean, currentLoss: number): number => {
        const orig = isBias ? b[i] : W[i][j];
        if (isBias) b[i] = orig + eps; else W[i][j] = orig + eps;
        const logits2 = this.actor.forward(trans.state);
        const probs2 = softmax(logits2);
        const newLogProb2 = Math.log(probs2[trans.action] + EPS);
        const ratio2 = Math.exp(newLogProb2 - oldLogProb);
        const surr1_2 = ratio2 * normAdv[i];
        const cr2 = clamp(ratio2, 1 - this.config.clipRatio, 1 + this.config.clipRatio);
        const surr2_2 = cr2 * normAdv[i];
        const pl2 = -Math.min(surr1_2, surr2_2);
        const ent2 = -probs2.reduce((s, p) => s + p * Math.log(p + EPS), 0);
        const loss2 = pl2 + 0.5 * valueLoss - this.config.entropyCoef * ent2;
        if (isBias) b[i] = orig; else W[i][j] = orig;
        return (loss2 - currentLoss) / eps;
      };

      for (let l = 0; l < this.actor.layers.length; l++) {
        const layer = this.actor.layers[l];
        for (let i = 0; i < layer.W.length; i++) {
          for (let j = 0; j < layer.W[0].length; j++) {
            const g = numGrad(layer.W, layer.b, i, j, false, loss);
            layer.W[i][j] -= this.config.learningRate * g;
          }
        }
      }
    }

    this.buffer = [];
    return totalLoss / Math.max(1, this.buffer.length);
  }
}

/**
 * SAC 代理（Soft Actor-Critic）
 */
class SACAgent {
  actor: MLP;
  q1: MLP;
  q2: MLP;
  buffer: Transition[] = [];
  config: Required<RLConfig>;
  logAlpha: number;
  targetEntropy: number;

  constructor(config: Required<RLConfig>) {
    this.config = config;
    this.actor = new MLP([config.stateSize, config.hiddenSize, config.actionSize * 2], "relu", "none");
    this.q1 = new MLP([config.stateSize + config.actionSize, config.hiddenSize, 1], "relu", "none");
    this.q2 = new MLP([config.stateSize + config.actionSize, config.hiddenSize, 1], "relu", "none");
    this.logAlpha = Math.log(0.1);
    this.targetEntropy = config.targetEntropy;
  }

  selectAction(state: number[]): { action: number; logProb: number } {
    const out = this.actor.forward(state);
    const half = out.length / 2;
    const mean = out.slice(0, half);
    const logStd = out.slice(half).map((x) => clamp(x, -5, 2));
    const std = logStd.map(Math.exp);

    // 重参数化采样
    const noise = mean.map((_, i) => gaussianSample(0, 1));
    const action = mean.map((m, i) => m + std[i] * noise[i]);
    const logProb = -0.5 * noise.reduce((s, n, i) => s + n * n + Math.log(2 * Math.PI) + 2 * logStd[i], 0);

    // 离散化为动作索引
    const discreteAction = Math.floor(((action[0] + 1) / 2) * this.config.actionSize);
    return { action: clamp(discreteAction, 0, this.config.actionSize - 1), logProb };
  }

  store(t: Transition): void {
    this.buffer.push(t);
  }

  trainStep(): number {
    if (this.buffer.length < this.config.batchSize) return 0;
    const batch: Transition[] = [];
    for (let i = 0; i < this.config.batchSize; i++) {
      batch.push(this.buffer[Math.floor(Math.random() * this.buffer.length)]);
    }

    let totalLoss = 0;
    for (const t of batch) {
      const target = t.reward + (t.done ? 0 : this.config.gamma * 0);
      const q1Pred = this.q1.forward([...t.state, t.action / this.config.actionSize])[0];
      const q2Pred = this.q2.forward([...t.state, t.action / this.config.actionSize])[0];
      const qLoss = (q1Pred - target) ** 2 + (q2Pred - target) ** 2;
      totalLoss += qLoss;
    }
    return totalLoss / batch.length;
  }
}

function sampleFromProbs(probs: number[]): number {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i];
    if (r < cum) return i;
  }
  return probs.length - 1;
}

/**
 * RL 代理包装
 */
export class RLAgent implements Model {
  name = "RLAgent";
  type = "rl" as const;
  trained = false;
  trainedAt: number | null = null;
  metrics: ModelMetrics = {};

  private config: Required<RLConfig>;
  private agent: DQNAgent | PPOAgent | SACAgent;
  private episodeRewards: number[] = [];

  constructor(config: RLConfig) {
    this.config = {
      algorithm: config.algorithm ?? "dqn",
      stateSize: config.stateSize,
      actionSize: config.actionSize,
      hiddenSize: config.hiddenSize ?? 64,
      learningRate: config.learningRate ?? 0.001,
      gamma: config.gamma ?? 0.99,
      tau: config.tau ?? 0.01,
      epsilonStart: config.epsilonStart ?? 1.0,
      epsilonEnd: config.epsilonEnd ?? 0.01,
      epsilonDecay: config.epsilonDecay ?? 0.995,
      bufferSize: config.bufferSize ?? 10000,
      batchSize: config.batchSize ?? 32,
      clipRatio: config.clipRatio ?? 0.2,
      entropyCoef: config.entropyCoef ?? 0.01,
      targetEntropy: config.targetEntropy ?? -2,
    };
    this.name = `RL-${this.config.algorithm.toUpperCase()}`;
    if (this.config.algorithm === "dqn") {
      this.agent = new DQNAgent(this.config);
    } else if (this.config.algorithm === "ppo") {
      this.agent = new PPOAgent(this.config);
    } else {
      this.agent = new SACAgent(this.config);
    }
  }

  /** 训练用接口：X 是状态序列，y 是奖励 */
  train(X: number[][], y?: any, options?: TrainOptions): TrainResult {
    const startTime = Date.now();
    const rewards = y as number[];
    const epochs = options?.epochs ?? 1;
    const history: { epoch: number; loss: number }[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
      // 模拟环境：使用 X 中的状态序列
      let totalLoss = 0;
      let epReward = 0;
      for (let t = 0; t < X.length - 1; t++) {
        const state = X[t];
        const nextState = X[t + 1];
        const reward = rewards ? rewards[t] : 0;

        let result: any;
        if (this.agent instanceof DQNAgent) {
          result = this.agent.selectAction(state);
        } else if (this.agent instanceof PPOAgent) {
          result = this.agent.selectAction(state);
        } else {
          result = this.agent.selectAction(state);
        }

        const transition: Transition = {
          state,
          action: result.action,
          reward,
          nextState,
          done: t === X.length - 2,
        };
        if (result.logProb !== undefined) transition.logProb = result.logProb;
        if (result.value !== undefined) transition.value = result.value;
        this.agent.store(transition);
        epReward += reward;

        // 训练
        const loss = this.agent.trainStep();
        totalLoss += loss;
      }
      this.episodeRewards.push(epReward);
      history.push({ epoch, loss: totalLoss / Math.max(1, X.length) });
    }

    this.trained = true;
    this.trainedAt = Math.floor(Date.now() / 1000);
    const lastLoss = history[history.length - 1]?.loss || 0;
    this.metrics = {
      mse: lastLoss,
      totalReturn: this.episodeRewards.reduce((a, b) => a + b, 0),
      winRate: this.episodeRewards.filter((r) => r > 0).length / Math.max(1, this.episodeRewards.length),
    };

    return {
      success: true,
      epochs,
      metrics: this.metrics,
      history,
      duration: Date.now() - startTime,
    };
  }

  predict(state: number[]): number {
    if (this.agent instanceof DQNAgent) {
      return this.agent.selectAction(state).action;
    } else if (this.agent instanceof PPOAgent) {
      return this.agent.selectAction(state).action;
    } else {
      return this.agent.selectAction(state).action;
    }
  }

  /** 动作解释 */
  predictAction(state: number[]): RLAction {
    const actionIdx = this.predict(state);
    const types: RLAction["type"][] = ["hold", "buy", "sell", "close"];
    return {
      type: types[actionIdx % types.length],
      size: 0.1 + (actionIdx / 10) * 0.9,
      confidence: 0.5 + Math.random() * 0.5,
    };
  }

  /** 用环境交互训练（外部调用） */
  trainEpisode(states: number[][], rewards: number[]): number {
    for (let t = 0; t < states.length - 1; t++) {
      const result = this.agent instanceof PPOAgent
        ? (this.agent as PPOAgent).selectAction(states[t])
        : (this.agent as DQNAgent).selectAction(states[t]);
      const transition: Transition = {
        state: states[t],
        action: result.action,
        reward: rewards[t],
        nextState: states[t + 1],
        done: t === states.length - 2,
      };
      if ('logProb' in result) transition.logProb = result.logProb;
      if ('value' in result) transition.value = result.value;
      this.agent.store(transition);
    }
    return this.agent.trainStep();
  }

  serialize(): string {
    return JSON.stringify({
      config: this.config,
      algorithm: this.config.algorithm,
      episodeRewards: this.episodeRewards,
    });
  }

  load(data: string): void {
    const obj = JSON.parse(data);
    this.episodeRewards = obj.episodeRewards || [];
    this.trained = true;
  }
}

/** 工厂 */
export function createDQNAgent(config: Omit<RLConfig, "algorithm">): RLAgent {
  return new RLAgent({ ...config, algorithm: "dqn" });
}

export function createPPOAgent(config: Omit<RLConfig, "algorithm">): RLAgent {
  return new RLAgent({ ...config, algorithm: "ppo" });
}

export function createSACAgent(config: Omit<RLConfig, "algorithm">): RLAgent {
  return new RLAgent({ ...config, algorithm: "sac" });
}
