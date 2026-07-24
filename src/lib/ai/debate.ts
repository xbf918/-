/**
 * AI 辩论 (Multi-Agent Debate)
 *
 * 多个模型/代理针对同一问题分别给出观点，
 * 通过多轮辩论迭代，最终得到更稳健的结论。
 */
import type { Model, SupervisedSample } from "./types";

export interface DebateAgent {
  id: string;
  name: string;
  model: Model;
  role: "bull" | "bear" | "neutral" | "technical" | "fundamental" | "risk";
  position: string;
  strength: number; // 0-1 立场强度
}

export interface DebateRound {
  round: number;
  arguments: Array<{ agentId: string; content: string; confidence: number; prediction: number }>;
  consensus?: number;
}

export interface DebateConfig {
  agents?: DebateAgent[];
  maxRounds?: number;
  consensusThreshold?: number;
  influenceDecay?: number;
}

/**
 * 多模型辩论系统
 * - 每个代理基于自己的模型和角色给出观点
 * - 各代理在后续轮次中受到其他代理的影响
 * - 达到共识或达到最大轮数时停止
 */
export class AIDebate {
  private agents: DebateAgent[];
  private maxRounds: number;
  private consensusThreshold: number;
  private influenceDecay: number;
  private history: DebateRound[] = [];

  constructor(config: DebateConfig = {}) {
    this.agents = config.agents || [];
    this.maxRounds = config.maxRounds ?? 3;
    this.consensusThreshold = config.consensusThreshold ?? 0.8;
    this.influenceDecay = config.influenceDecay ?? 0.7;
  }

  addAgent(agent: DebateAgent): void {
    this.agents.push(agent);
  }

  /** 执行辩论 */
  run(features: number[], context?: string): {
    finalPrediction: number;
    finalConfidence: number;
    rounds: DebateRound[];
    consensusReached: boolean;
  } {
    this.history = [];
    let currentPredictions: Record<string, number> = {};
    let currentConfidences: Record<string, number> = {};
    let consensusReached = false;
    let finalPrediction = 0.5;
    let finalConfidence = 0;

    // 初始化：第一轮各代理独立预测
    for (const agent of this.agents) {
      const pred = agent.model.predict(features);
      const predVal = Array.isArray(pred) ? (pred as number[])[1] ?? 0.5 : pred as number;
      currentPredictions[agent.id] = this.applyBias(predVal, agent.role);
      currentConfidences[agent.id] = 0.6 + Math.random() * 0.3;
    }

    for (let round = 0; round < this.maxRounds; round++) {
      const roundArgs: DebateRound["arguments"] = this.agents.map((agent) => ({
        agentId: agent.id,
        content: this.generateArgument(agent, currentPredictions[agent.id], currentConfidences[agent.id]),
        confidence: currentConfidences[agent.id],
        prediction: currentPredictions[agent.id],
      }));

      // 计算共识
      const consensus = this.computeConsensus(Object.values(currentPredictions));

      const roundResult: DebateRound = { round, arguments: roundArgs, consensus };
      this.history.push(roundResult);

      if (consensus >= this.consensusThreshold) {
        consensusReached = true;
        break;
      }

      // 更新预测：各代理受其他代理影响
      if (round < this.maxRounds - 1) {
        const newPredictions: Record<string, number> = { ...currentPredictions };
        for (const agent of this.agents) {
          const others = this.agents.filter((a) => a.id !== agent.id);
          let influenceSum = 0;
          let weightSum = 0;
          for (const other of others) {
            const influence = currentConfidences[other.id] * this.influenceDecay;
            influenceSum += currentPredictions[other.id] * influence;
            weightSum += influence;
          }
          if (weightSum > 0) {
            const selfWeight = currentConfidences[agent.id];
            newPredictions[agent.id] =
              (currentPredictions[agent.id] * selfWeight + influenceSum) / (selfWeight + weightSum);
          }
        }
        currentPredictions = newPredictions;
        // 置信度逐步收敛
        for (const id of Object.keys(currentConfidences)) {
          currentConfidences[id] = Math.min(0.95, currentConfidences[id] * 1.05);
        }
      }
    }

    // 最终聚合
    let totalWeight = 0;
    let weightedSum = 0;
    for (const agent of this.agents) {
      const w = currentConfidences[agent.id];
      weightedSum += currentPredictions[agent.id] * w;
      totalWeight += w;
    }
    finalPrediction = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
    finalConfidence = this.computeConfidence(currentPredictions);

    return {
      finalPrediction,
      finalConfidence,
      rounds: this.history,
      consensusReached,
    };
  }

  private applyBias(pred: number, role: string): number {
    switch (role) {
      case "bull": return Math.min(0.95, pred * 1.2 + 0.05);
      case "bear": return Math.max(0.05, pred * 0.8 - 0.05);
      case "risk": return Math.max(0.05, pred * 0.9);
      case "technical": return pred;
      case "fundamental": return pred;
      default: return pred;
    }
  }

  private computeConsensus(predictions: number[]): number {
    if (predictions.length < 2) return 1;
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    const variance = predictions.reduce((s, p) => s + (p - mean) ** 2, 0) / predictions.length;
    const std = Math.sqrt(variance);
    return Math.max(0, 1 - std * 3);
  }

  private computeConfidence(predictions: Record<string, number>): number {
    const vals = Object.values(predictions);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.abs(mean - 0.5) * 2;
  }

  private generateArgument(agent: DebateAgent, prediction: number, confidence: number): string {
    const direction = prediction > 0.5 ? "看涨" : "看跌";
    const strength = confidence > 0.8 ? "强烈" : confidence > 0.6 ? "适度" : "谨慎";
    return `[${agent.name}] ${strength}${direction}，置信度 ${(confidence * 100).toFixed(0)}%，预测概率 ${(prediction * 100).toFixed(1)}%`;
  }

  getHistory(): DebateRound[] {
    return [...this.history];
  }

  getAgents(): DebateAgent[] {
    return [...this.agents];
  }
}
