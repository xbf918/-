/**
 * 自我批评与自我反思 (Self-Criticism & Self-Reflection)
 *
 * 自我批判：评估自己的决策，找出不足
 * 自我反思：从错误中学习，调整策略
 */

export interface SelfCritiqueResult {
  score: number;          // 总体质量分数 0-1
  biases: string[];       // 识别出的偏差
  weaknesses: string[];   // 识别出的弱点
  strengths: string[];    // 识别出的优点
  recommendations: string[]; // 改进建议
  confidence: number;     // 对本次批判的置信度
}

export interface ReflectionEntry {
  id: string;
  timestamp: number;
  context: string;
  originalDecision: string;
  outcome: "success" | "failure" | "partial";
  critique: SelfCritiqueResult;
  lessons: string[];
  actionItems: string[];
}

export interface SelfAwarenessConfig {
  historyLimit?: number;
  critiqueThreshold?: number;
  reflectionDepth?: "shallow" | "medium" | "deep";
}

/**
 * 自我意识模块：自我批评 + 自我反思
 */
export class SelfAwarenessModule {
  private history: ReflectionEntry[] = [];
  private historyLimit: number;
  private critiqueThreshold: number;
  private reflectionDepth: string;
  private patternMemory: Map<string, { count: number; successRate: number }> = new Map();

  constructor(config: SelfAwarenessConfig = {}) {
    this.historyLimit = config.historyLimit ?? 100;
    this.critiqueThreshold = config.critiqueThreshold ?? 0.5;
    this.reflectionDepth = config.reflectionDepth ?? "medium";
  }

  /**
   * 自我批判：分析一次决策质量
   */
  critique(
    decision: {
      action: string;
      confidence: number;
      reasoning: string[];
      features: number[];
      modelName: string;
    },
    groundTruth?: { correct: boolean; actualOutcome: number },
  ): SelfCritiqueResult {
    const biases: string[] = [];
    const weaknesses: string[] = [];
    const strengths: string[] = [];
    const recommendations: string[] = [];
    let score = 0.7;

    // 置信度校准检查
    if (decision.confidence > 0.9) {
      biases.push("过度自信偏差：置信度过高可能忽略风险");
      score -= 0.05;
      recommendations.push("建议降低置信度阈值，增加风险缓冲");
    }
    if (decision.confidence < 0.4 && decision.action !== "hold") {
      weaknesses.push("低置信度决策：在不确定情况下做出了明确行动");
      score -= 0.1;
      recommendations.push("低置信度时建议观望或减小仓位");
    }

    // 推理深度检查
    if (decision.reasoning.length < 2) {
      weaknesses.push("推理依据不足：支持决策的理由过少");
      score -= 0.05;
      recommendations.push("建议从多角度分析，至少准备2个以上核心理由");
    } else if (decision.reasoning.length >= 4) {
      strengths.push("多维度推理：考虑了多方面因素");
      score += 0.03;
    }

    // 特征质量检查（简化：特征值分布合理性）
    const fmean = decision.features.reduce((a, b) => a + b, 0) / (decision.features.length || 1);
    if (Math.abs(fmean) > 3) {
      weaknesses.push("特征尺度异常：部分特征值偏离正常范围");
      score -= 0.03;
      recommendations.push("建议检查特征归一化是否正确");
    }

    // 模型一致性检查
    const historical = this.patternMemory.get(decision.modelName);
    if (historical && historical.count > 5) {
      if (historical.successRate < 0.4) {
        weaknesses.push(`模型 ${decision.modelName} 历史成功率偏低 (${(historical.successRate * 100).toFixed(0)}%)`);
        score -= 0.05;
        recommendations.push(`考虑减少对 ${decision.modelName} 的依赖`);
      } else if (historical.successRate > 0.7) {
        strengths.push(`模型 ${decision.modelName} 历史表现良好 (${(historical.successRate * 100).toFixed(0)}%)`);
        score += 0.03;
      }
    }

    // 如果有真实结果，做更深入的批判
    if (groundTruth) {
      if (groundTruth.correct) {
        strengths.push("决策结果正确");
        score = Math.min(1, score + 0.15);
      } else {
        weaknesses.push("决策结果与实际不符");
        score = Math.max(0, score - 0.2);
        recommendations.push("深入分析错误原因，更新模型");
        // 识别偏差类型
        if (decision.confidence > 0.7) {
          biases.push("确认偏差：对自己的判断过于确信");
        }
        if (decision.reasoning.length <= 1) {
          biases.push("锚定效应：可能过度依赖单一信息源");
        }
      }
    }

    // 深度反思增加更多维度
    if (this.reflectionDepth === "deep") {
      // 检查近期决策一致性
      const recent = this.history.slice(-10);
      if (recent.length >= 5) {
        const actions = recent.map((r) => r.originalDecision);
        const uniqueActions = new Set(actions);
        if (uniqueActions.size <= 1) {
          biases.push("惯性偏差：近期决策过于一致，可能缺乏多样性");
          score -= 0.02;
        }
      }
    }

    score = Math.max(0, Math.min(1, score));

    return {
      score,
      biases,
      weaknesses,
      strengths,
      recommendations,
      confidence: 0.7 + Math.random() * 0.2,
    };
  }

  /**
   * 自我反思：从经验中学习并更新
   */
  reflect(
    decisionContext: string,
    decision: string,
    outcome: "success" | "failure" | "partial",
    features: number[],
    modelName: string,
  ): ReflectionEntry {
    const critique = this.critique(
      { action: decision, confidence: 0.7, reasoning: [decisionContext], features, modelName },
      { correct: outcome === "success", actualOutcome: outcome === "success" ? 1 : 0 },
    );

    const lessons: string[] = [];
    const actionItems: string[] = [];

    if (outcome === "failure") {
      lessons.push("失败案例：需要重新审视决策逻辑");
      if (critique.biases.length > 0) {
        lessons.push(`识别出 ${critique.biases.length} 种认知偏差`);
        actionItems.push("建立偏差检查清单，每次决策前回顾");
      }
      actionItems.push("将此案例加入负样本库用于模型再训练");
    } else if (outcome === "success") {
      lessons.push("成功案例：验证了当前策略的有效性");
      actionItems.push("总结成功模式，考虑推广到其他场景");
    } else {
      lessons.push("部分成功：策略有改进空间");
      actionItems.push("分析部分成功的原因，针对性优化");
    }

    if (critique.score < this.critiqueThreshold) {
      actionItems.push("触发深度反思：建议暂停并重新评估整体策略");
    }

    const entry: ReflectionEntry = {
      id: `reflection_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      context: decisionContext,
      originalDecision: decision,
      outcome,
      critique,
      lessons,
      actionItems,
    };

    this.history.push(entry);
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }

    // 更新模式记忆
    const key = modelName;
    const existing = this.patternMemory.get(key);
    if (existing) {
      const newCount = existing.count + 1;
      const newSuccess = (existing.successRate * existing.count + (outcome === "success" ? 1 : 0)) / newCount;
      this.patternMemory.set(key, { count: newCount, successRate: newSuccess });
    } else {
      this.patternMemory.set(key, { count: 1, successRate: outcome === "success" ? 1 : 0 });
    }

    return entry;
  }

  /** 获取反思摘要 */
  getSummary(): {
    totalReflections: number;
    successRate: number;
    topBiases: string[];
    averageScore: number;
    recentTrend: "improving" | "declining" | "stable";
  } {
    const total = this.history.length;
    if (total === 0) {
      return { totalReflections: 0, successRate: 0, topBiases: [], averageScore: 0, recentTrend: "stable" };
    }
    const successes = this.history.filter((r) => r.outcome === "success").length;
    const avgScore = this.history.reduce((s, r) => s + r.critique.score, 0) / total;

    const biasCount: Record<string, number> = {};
    for (const r of this.history) {
      for (const b of r.critique.biases) biasCount[b] = (biasCount[b] || 0) + 1;
    }
    const topBiases = Object.entries(biasCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([b]) => b);

    // 趋势
    const half = Math.floor(total / 2);
    const firstHalf = this.history.slice(0, half);
    const secondHalf = this.history.slice(half);
    const firstRate = firstHalf.length > 0 ? firstHalf.filter((r) => r.outcome === "success").length / firstHalf.length : 0;
    const secondRate = secondHalf.length > 0 ? secondHalf.filter((r) => r.outcome === "success").length / secondHalf.length : 0;
    let trend: "improving" | "declining" | "stable" = "stable";
    if (secondRate - firstRate > 0.1) trend = "improving";
    else if (firstRate - secondRate > 0.1) trend = "declining";

    return {
      totalReflections: total,
      successRate: successes / total,
      topBiases,
      averageScore: avgScore,
      recentTrend: trend,
    };
  }

  getHistory(limit?: number): ReflectionEntry[] {
    const h = [...this.history].reverse();
    return limit ? h.slice(0, limit) : h;
  }

  getPatternMemory(): Map<string, { count: number; successRate: number }> {
    return new Map(this.patternMemory);
  }

  clearHistory(): void {
    this.history = [];
    this.patternMemory.clear();
  }
}
