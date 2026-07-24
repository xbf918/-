/**
 * AI/ML 通用类型定义
 */

// 模型基础接口
export interface Model {
  name: string;
  type: ModelType;
  trained: boolean;
  trainedAt: number | null;
  metrics: ModelMetrics;
  predict(features: number[]): number | number[];
  train(X: number[][], y: number[] | number[][], options?: TrainOptions): TrainResult;
  serialize(): string;
  load(data: string): void;
}

export type ModelType =
  | "hmm"
  | "bayesian"
  | "gbdt"
  | "lstm"
  | "transformer"
  | "tft"
  | "rl"
  | "knn"
  | "linear"
  | "classification"
  | "regression"
  | "ensemble"
  | "online"
  | "automl";

/** 轻量模型接口（新模块可选使用） */
export interface SimpleModel {
  name: string;
  type: ModelType | string;
  isTrained: boolean;
  metrics: ModelMetrics;
  predict(features: number[]): number | number[];
  train(data: SupervisedSample[]): void;
}

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  mse?: number;
  mae?: number;
  r2?: number;
  sharpe?: number;
  totalReturn?: number;
  winRate?: number;
}

export interface TrainOptions {
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  validationSplit?: number;
  earlyStopping?: boolean;
  patience?: number;
  verbose?: boolean;
  [key: string]: any;
}

export interface TrainResult {
  success: boolean;
  epochs: number;
  metrics: ModelMetrics;
  history: { epoch: number; loss: number; valLoss?: number; [key: string]: any }[];
  duration: number;
  message?: string;
}

// 监督学习样本
export interface SupervisedSample {
  features: number[];
  label: number | number[];
  weight?: number;
  timestamp?: number;
}

// 时序样本
export interface SequenceSample {
  sequence: number[][];  // [seqLen, features]
  target: number | number[];
}

// ============ 集成学习 ============

export interface EnsembleConfig {
  strategy: "voting" | "averaging" | "stacking" | "boosting";
  models: Model[];
  weights?: number[];
  metaLearner?: Model;
}

export interface EnsemblePrediction {
  prediction: number | number[];
  votes?: Record<string, number | number[]>;
  confidence: number;
  agreement: number; // 模型间一致性
}

// ============ 元学习 ============

export interface MetaTask {
  id: string;
  name: string;
  X: number[][];
  y: number[] | number[][];
  domain: "trending" | "ranging" | "volatile" | "general";
  performance?: number;
}

export interface MetaKnowledge {
  taskPerformances: Map<string, ModelMetrics>;
  modelSpecialties: Map<string, string[]>; // model -> 擅长领域
  transferHistory: { from: string; to: string; gain: number }[];
}

// ============ 强化学习 ============

export type RLAlgorithm = "dqn" | "ppo" | "sac";

export interface RLState {
  features: number[];
  position: number;      // -1, 0, 1
  unrealizedPnl: number;
  timestamp: number;
}

export interface RLAction {
  type: "buy" | "sell" | "hold" | "close";
  size: number;
  confidence: number;
}

export interface RLExperience {
  state: RLState;
  action: RLAction;
  reward: number;
  nextState: RLState;
  done: boolean;
}

// ============ AutoML ============

export interface AutoMLConfig {
  searchSpace: Record<string, { type: "int" | "float" | "categorical"; min?: number; max?: number; values?: any[] }>;
  metric: "accuracy" | "sharpe" | "f1" | "custom";
  maxTrials: number;
  timeout: number;
  cv: number; // 交叉验证折数
}

export interface AutoMLResult {
  bestParams: Record<string, any>;
  bestScore: number;
  bestModel: Model | null;
  trials: { params: Record<string, any>; score: number; duration: number }[];
  totalDuration: number;
}

// ============ RAG ============

export interface RAGDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  source: "news" | "history" | "indicator" | "knowledge";
  timestamp: number;
}

export interface RAGQuery {
  query: string;
  topK?: number;
  filter?: Record<string, any>;
}

export interface RAGResult {
  documents: { doc: RAGDocument; score: number }[];
  answer: string;
  confidence: number;
}

// ============ 知识图谱 ============

export interface KGNode {
  id: string;
  type: "asset" | "indicator" | "event" | "concept";
  label: string;
  attributes: Record<string, any>;
}

export interface KGEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface KGQuery {
  start: string;
  relation?: string;
  end?: string;
  maxDepth?: number;
}

// ============ AI 辩论 ============

export interface DebateParticipant {
  name: string;
  model: Model | "rule" | "statistical";
  position: "bullish" | "bearish" | "neutral";
  confidence: number;
  argument: string;
  evidence: string[];
}

export interface DebateRound {
  round: number;
  participants: DebateParticipant[];
  rebuttals: { from: string; to: string; counter: string }[];
}

export interface DebateResult {
  topic: string;
  rounds: DebateRound[];
  finalVerdict: DebateParticipant;
  consensus: number; // 0-1
  numRounds: number;
}

// ============ 自我批评/反思 ============

export interface SelfEvaluation {
  decision: string;
  outcome: "good" | "bad" | "neutral";
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  evaluatedAt: number;
}

export interface ReflectionEntry {
  id: string;
  trigger: string;
  insight: string;
  actionItems: string[];
  relatedDecisions: string[];
  createdAt: number;
  impactScore: number;
}
