/**
 * AI Orchestrator - 统一调度所有 AI 模型
 *
 * 整合：
 * - 概率模型：HMM（市场状态识别）、贝叶斯网络
 * - 梯度提升树：XGBoost / LightGBM / CatBoost
 * - 神经网络：LSTM / Transformer / TFT
 * - 强化学习：DQN / PPO / SAC
 * - 优化算法：遗传算法、贝叶斯优化
 * - 元学习层：集成学习、在线学习、AutoML、元学习
 * - 知识层：知识图谱、RAG、AI 辩论
 * - 自我意识：自我批评、自我反思
 */
import type { SupervisedSample } from "./types";
import { GaussianHMM } from "./hmm";
import { BayesianNetwork, createTradingBayesianNet } from "./bayesianNetwork";
import { createXGBoost, createLightGBM, createCatBoost } from "./gradientBoosting";
import { LSTM } from "./lstm";
import { Transformer } from "./transformer";
import { TemporalFusionTransformer } from "./tft";
import { createDQNAgent, createPPOAgent, createSACAgent } from "./reinforcementLearning";
import { GeneticAlgorithm } from "./geneticAlgorithm";
import { BayesianOptimizer } from "./bayesianOptimization";
import { TradingEnsemble, LogisticRegression } from "./ensemble";
import { OnlineLearner } from "./onlineLearning";
import { AutoML, MetaLearner } from "./automl";
import { KnowledgeGraph } from "./knowledgeGraph";
import { RAGRetriever } from "./rag";
import { AIDebate } from "./debate";
import { SelfAwarenessModule } from "./selfAwareness";
import { sensitiveFilter, type SensitiveCheckResult } from "../utils/sensitiveFilter";

export interface AIPrediction {
  direction: "up" | "down" | "neutral";
  probability: number;
  confidence: number;
  modelScores: Record<string, number>;
  marketRegime?: string;
  rationale: string[];
  warning?: string;
  sensitiveCheck?: SensitiveCheckResult;
}

export interface AIConfig {
  enabledModels?: string[];
  ensembleMethod?: "weighted_voting" | "voting" | "averaging" | "stacking";
  useHMM?: boolean;
  useRL?: boolean;
  useDebate?: boolean;
  useSelfAwareness?: boolean;
  useRAG?: boolean;
  useKnowledgeGraph?: boolean;
  useAutoML?: boolean;
  sensitiveMode?: "log_only" | "notify_only" | "full_pass";
}

type AnyModel = {
  name: string;
  type: string;
  trained?: boolean;
  isTrained?: boolean;
  metrics: { accuracy?: number; precision?: number; recall?: number; f1?: number };
  predict(features: number[]): number | number[];
  train?(...args: any[]): any;
  [key: string]: any;
};

/**
 * AI 总控器
 */
export class AIOrchestrator {
  private config: Required<AIConfig>;
  private models: Map<string, AnyModel> = new Map();
  private hmm: GaussianHMM | null = null;
  private bayesianNet: BayesianNetwork | null = null;
  private ensemble: TradingEnsemble | null = null;
  private onlineLearner: OnlineLearner | null = null;
  private automl: AutoML | null = null;
  private metaLearner: MetaLearner;
  private knowledgeGraph: KnowledgeGraph;
  private rag: RAGRetriever;
  private debate: AIDebate;
  private selfAwareness: SelfAwarenessModule;
  private dqn: any = null;
  private ppo: any = null;
  private sac: any = null;
  private isInitialized = false;

  constructor(config: AIConfig = {}) {
    this.config = {
      enabledModels: config.enabledModels ?? ["logistic", "xgboost", "lightgbm"],
      ensembleMethod: config.ensembleMethod ?? "weighted_voting",
      useHMM: config.useHMM ?? true,
      useRL: config.useRL ?? false,
      useDebate: config.useDebate ?? true,
      useSelfAwareness: config.useSelfAwareness ?? true,
      useRAG: config.useRAG ?? true,
      useKnowledgeGraph: config.useKnowledgeGraph ?? true,
      useAutoML: config.useAutoML ?? false,
      sensitiveMode: config.sensitiveMode ?? "notify_only",
    };
    this.metaLearner = new MetaLearner();
    this.knowledgeGraph = KnowledgeGraph.buildFromTradingData(
      ["BTC", "ETH", "SOL"],
      ["双底", "双顶", "三角形", "头肩顶", "头肩底"],
      ["RSI", "MACD", "布林带", "KDJ"],
    );
    this.rag = new RAGRetriever({ topK: 5 });
    this.debate = new AIDebate({ maxRounds: 3 });
    this.selfAwareness = new SelfAwarenessModule({ reflectionDepth: "medium" });
    this.initDefaultKnowledge();
  }

  private initDefaultKnowledge(): void {
    const docs = [
      { id: "doc_001", content: "双底形态出现在下跌趋势末期，通常预示趋势反转向上，成功率约65%", type: "pattern", metadata: { reliability: 0.65 } },
      { id: "doc_002", content: "双顶形态出现在上涨趋势末期，是典型的见顶信号，后续下跌概率较高", type: "pattern", metadata: { reliability: 0.6 } },
      { id: "doc_003", content: "RSI超过70视为超买，可能出现回调；低于30视为超卖，可能出现反弹", type: "indicator", metadata: { reliability: 0.55 } },
      { id: "doc_004", content: "在趋势市中，趋势跟踪策略表现更好；在震荡市中，均值回归策略更有效", type: "strategy", metadata: { reliability: 0.7 } },
      { id: "doc_005", content: "高波动环境下应降低仓位，严格止损；低波动环境可适当提高仓位", type: "risk", metadata: { reliability: 0.8 } },
    ];
    for (const d of docs) {
      this.rag.addDocument({ id: d.id, content: d.content, type: d.type as any, metadata: d.metadata });
    }
  }

  initialize(featureDim = 10): void {
    if (this.isInitialized) return;

    if (this.config.enabledModels.includes("logistic")) {
      const lr = new LogisticRegression();
      this.models.set("LogisticRegression", lr as any);
    }
    if (this.config.enabledModels.includes("xgboost")) {
      const xgb = createXGBoost({ numEstimators: 50, maxDepth: 4, learningRate: 0.1 });
      this.models.set("XGBoost", xgb as any);
    }
    if (this.config.enabledModels.includes("lightgbm")) {
      const lgb = createLightGBM({ numEstimators: 50, maxDepth: 4, learningRate: 0.1, numLeaves: 31 });
      this.models.set("LightGBM", lgb as any);
    }
    if (this.config.enabledModels.includes("catboost")) {
      const cat = createCatBoost({ numEstimators: 50, maxDepth: 4, learningRate: 0.1 });
      this.models.set("CatBoost", cat as any);
    }
    if (this.config.enabledModels.includes("lstm")) {
      const lstm = new LSTM({ inputSize: featureDim, hiddenSize: 32, outputSize: 1 });
      this.models.set("LSTM", lstm as any);
    }
    if (this.config.enabledModels.includes("transformer")) {
      const tf = new Transformer({ inputSize: featureDim, dModel: 32, numHeads: 2, numLayers: 2, outputSize: 1 });
      this.models.set("Transformer", tf as any);
    }

    this.ensemble = new TradingEnsemble({
      method: this.config.ensembleMethod,
      baseModels: Array.from(this.models.values()) as any,
    });

    if (this.models.has("LogisticRegression")) {
      this.onlineLearner = new OnlineLearner({
        baseModel: this.models.get("LogisticRegression") as any,
        windowSize: 200,
        decayRate: 0.99,
      });
    }

    if (this.config.useHMM) {
      this.hmm = new GaussianHMM({ numStates: 3, numObs: featureDim, maxIterations: 50 } as any);
    }

    this.bayesianNet = createTradingBayesianNet();

    if (this.config.useRL) {
      this.dqn = createDQNAgent({ stateDim: featureDim, actionDim: 3 } as any);
      this.ppo = createPPOAgent({ stateDim: featureDim, actionDim: 3 } as any);
      this.sac = createSACAgent({ stateDim: featureDim, actionDim: 3 } as any);
    }

    if (this.config.useAutoML) {
      this.automl = new AutoML({ maxTrials: 10 } as any);
    }

    this.initDebateAgents();
    this.isInitialized = true;
  }

  private initDebateAgents(): void {
    const roles = [
      { id: "bull_agent", name: "多头分析师", role: "bull" as const },
      { id: "bear_agent", name: "空头分析师", role: "bear" as const },
      { id: "tech_agent", name: "技术分析师", role: "technical" as const },
      { id: "risk_agent", name: "风险控制员", role: "risk" as const },
    ];
    const defaultModel = new LogisticRegression();
    for (const r of roles) {
      this.debate.addAgent({
        id: r.id, name: r.name, model: defaultModel as any, role: r.role, position: r.role, strength: 0.7,
      });
    }
  }

  train(data: SupervisedSample[]): void {
    if (!this.isInitialized) this.initialize(data[0]?.features.length || 10);
    const X = data.map((d) => d.features);
    const y = data.map((d) => d.label as number);

    for (const [name, model] of this.models) {
      try {
        if (model.train && typeof model.train === "function") {
          if ("isTrained" in model) {
            model.train(data);
          } else {
            model.train(X, y);
          }
        }
      } catch (e) {
        console.warn(`[AI] ${name} 训练失败:`, e);
      }
    }

    if (this.ensemble) {
      try { (this.ensemble as any).train(data); } catch (e) { console.warn("[AI] Ensemble 训练失败:", e); }
    }

    if (this.hmm) {
      try {
        this.hmm.train(X);
      } catch (e) { console.warn("[AI] HMM 训练失败:", e); }
    }
  }

  predict(features: number[], context = ""): AIPrediction {
    if (!this.isInitialized) this.initialize(features.length);

    const modelScores: Record<string, number> = {};
    const rationale: string[] = [];

    for (const [name, model] of this.models) {
      try {
        const pred = model.predict(features);
        const score = Array.isArray(pred) ? (pred[1] ?? pred[0] ?? 0.5) : (pred as number);
        modelScores[name] = Math.max(0, Math.min(1, score));
      } catch {
        modelScores[name] = 0.5;
      }
    }

    let ensembleScore = 0.5;
    if (this.ensemble) {
      try {
        const ep = (this.ensemble as any).predict(features);
        ensembleScore = Array.isArray(ep) ? (ep[1] ?? 0.5) : (ep as number);
        modelScores["Ensemble"] = ensembleScore;
      } catch {
        modelScores["Ensemble"] = 0.5;
      }
    }

    let marketRegime = "unknown";
    if (this.hmm && this.hmm.trained) {
      try {
        const state = (this.hmm as any).predict(features);
        const regimes = ["trending", "ranging", "volatile"];
        marketRegime = regimes[state] || "unknown";
        modelScores["MarketRegime"] = state === 0 ? 0.7 : state === 1 ? 0.5 : 0.3;
        rationale.push(`当前市场状态: ${marketRegime === "trending" ? "趋势市" : marketRegime === "ranging" ? "震荡市" : "高波动市"}`);
      } catch {
        // ignore
      }
    }

    if (this.bayesianNet && this.bayesianNet.trained) {
      try {
        const bayesResult = (this.bayesianNet as any).inference("decision", {
          trend: features[0] > 0 ? "up" : "down",
          volume: features[1] > 0.5 ? "high" : "low",
          volatility: features[2] > 0.5 ? "high" : "low",
        });
        modelScores["Bayesian"] = bayesResult?.["long"] ?? 0.5;
      } catch {
        modelScores["Bayesian"] = 0.5;
      }
    }

    if (this.config.useRAG && context) {
      const ragResult = this.rag.search(context, 3);
      if (ragResult.length > 0) {
        rationale.push(`参考知识: ${ragResult[0].document.content.slice(0, 60)}...`);
      }
    }

    const scores = Object.values(modelScores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const finalScore = ensembleScore * 0.5 + avgScore * 0.5;

    const direction = finalScore > 0.55 ? "up" : finalScore < 0.45 ? "down" : "neutral";
    const confidence = Math.abs(finalScore - 0.5) * 2;

    rationale.push(`综合得分: ${(finalScore * 100).toFixed(1)}%`);
    rationale.push(`模型一致性: ${this.computeAgreement(scores).toFixed(2)}`);

    let warning: string | undefined;
    if (confidence < 0.3) {
      const critique = this.selfAwareness.critique({
        action: direction, confidence, reasoning: rationale, features, modelName: "Ensemble",
      });
      if (critique.weaknesses.length > 0) {
        warning = `警告: ${critique.weaknesses[0]}`;
      }
    }

    let sensitiveCheck: SensitiveCheckResult | undefined;
    if (context) {
      sensitiveCheck = sensitiveFilter.check(context);
    }

    return { direction, probability: finalScore, confidence, modelScores, marketRegime, rationale, warning, sensitiveCheck };
  }

  predictWithDebate(features: number[]): { prediction: AIPrediction; debateResult: any } {
    const basePred = this.predict(features);
    const debateResult = this.debate.run(features);
    return {
      prediction: {
        ...basePred,
        probability: debateResult.finalPrediction,
        confidence: debateResult.finalConfidence,
        direction: debateResult.finalPrediction > 0.55 ? "up" : debateResult.finalPrediction < 0.45 ? "down" : "neutral",
        rationale: [...basePred.rationale, `辩论共识: ${debateResult.consensusReached ? "已达成" : "未达成"}`],
      },
      debateResult,
    };
  }

  updateOnline(features: number[], label: number): { drift: boolean; accuracy: number } {
    if (!this.onlineLearner) return { drift: false, accuracy: 0 };
    const result = this.onlineLearner.update(features, label);
    return { drift: result.drift, accuracy: this.onlineLearner.getRecentAccuracy() };
  }

  reflect(context: string, decision: string, outcome: "success" | "failure" | "partial", features: number[]): void {
    this.selfAwareness.reflect(context, decision, outcome, features, "Ensemble");
  }

  optimizeHyperparams(
    objective: (params: Record<string, number>) => number,
    params: Array<{ name: string; min: number; max: number; type: "int" | "float" }>,
    iterations = 15,
  ): { bestParams: Record<string, number>; bestValue: number } {
    const bo = new BayesianOptimizer({ bounds: params, objective, numIterations: iterations, numInitialPoints: 5, acquisition: "ei" });
    const result = bo.run();
    return { bestParams: result.bestParams, bestValue: result.bestValue };
  }

  private computeAgreement(scores: number[]): number {
    if (scores.length < 2) return 1;
    const m = scores.reduce((a, b) => a + b, 0) / scores.length;
    const v = scores.reduce((s, x) => s + (x - m) ** 2, 0) / scores.length;
    return Math.max(0, 1 - Math.sqrt(v) * 3);
  }

  getModel(name: string): AnyModel | undefined { return this.models.get(name); }
  getAllModels(): [string, AnyModel][] { return Array.from(this.models.entries()); }
  getEnsemble(): TradingEnsemble | null { return this.ensemble; }
  getHMM(): GaussianHMM | null { return this.hmm; }
  getKnowledgeGraph(): KnowledgeGraph { return this.knowledgeGraph; }
  getRAG(): RAGRetriever { return this.rag; }
  getDebate(): AIDebate { return this.debate; }
  getSelfAwareness(): SelfAwarenessModule { return this.selfAwareness; }
  getMetaLearner(): MetaLearner { return this.metaLearner; }
  getOnlineLearner(): OnlineLearner | null { return this.onlineLearner; }
  getModelNames(): string[] { return Array.from(this.models.keys()); }
  isReady(): boolean { return this.isInitialized; }
}

export const aiOrchestrator = new AIOrchestrator({
  enabledModels: ["logistic", "xgboost", "lightgbm"],
  ensembleMethod: "weighted_voting",
  useHMM: true,
  useDebate: true,
  useSelfAwareness: true,
  useRAG: true,
  useKnowledgeGraph: true,
  useRL: false,
  useAutoML: false,
});
