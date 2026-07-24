/**
 * 统一 AI 模型面板 Store
 *
 * 管理所有 AI 模块的状态：
 * - 模型列表与状态
 * - 训练进度
 * - 最新预测结果
 * - RAG 知识库
 * - 知识图谱
 * - AI 辩论
 * - 自我意识 / 反思记录
 * - 敏感词检测状态
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SupervisedSample } from "@/lib/ai/types";
import { aiOrchestrator, type AIPrediction } from "@/lib/ai/orchestrator";
import { sensitiveFilter, type SensitiveCheckResult } from "@/lib/utils/sensitiveFilter";
import type { ReflectionEntry } from "@/lib/ai/selfAwareness";

export interface AIModelState {
  name: string;
  type: string;
  enabled: boolean;
  isTrained: boolean;
  metrics: { accuracy?: number; precision?: number; recall?: number; f1?: number };
  lastUsedAt: number | null;
}

export interface UnifiedAIState {
  // 基础状态
  isInitialized: boolean;
  isTraining: boolean;
  trainingProgress: number;
  lastPrediction: AIPrediction | null;
  predictionHistory: Array<{ time: number; prediction: AIPrediction }>;

  // 模型列表
  models: AIModelState[];
  activeTab: "overview" | "models" | "rag" | "kg" | "debate" | "self" | "settings";

  // RAG
  ragQuery: string;
  ragResults: Array<{ content: string; score: number; type: string }>;

  // 知识图谱
  kgCentralEntities: Array<{ name: string; type: string; degree: number; weightedDegree: number }>;

  // 辩论
  debateActive: boolean;
  debateRounds: number;
  debateConsensus: boolean;

  // 自我意识
  selfAwarenessSummary: {
    totalReflections: number;
    successRate: number;
    topBiases: string[];
    averageScore: number;
    recentTrend: string;
  };
  recentReflections: ReflectionEntry[];

  // 敏感词
  lastSensitiveCheck: SensitiveCheckResult | null;

  // 设置
  settings: {
    enabledModels: string[];
    ensembleMethod: string;
    useHMM: boolean;
    useDebate: boolean;
    useSelfAwareness: boolean;
    useRAG: boolean;
    useKnowledgeGraph: boolean;
    useOnlineLearning: boolean;
    sensitiveMode: "log_only" | "notify_only" | "full_pass";
  };
}

interface AIActions {
  initializeAI: () => void;
  trainModels: (samples: SupervisedSample[]) => void;
  runPrediction: (features: number[], context?: string) => AIPrediction | null;
  runDebate: (features: number[]) => void;
  setActiveTab: (tab: UnifiedAIState["activeTab"]) => void;
  toggleModel: (name: string) => void;
  updateSetting: <K extends keyof UnifiedAIState["settings"]>(key: K, value: UnifiedAIState["settings"][K]) => void;
  runRAGQuery: (query: string) => void;
  addReflection: (context: string, decision: string, outcome: "success" | "failure" | "partial", features: number[]) => void;
  checkSensitive: (text: string) => SensitiveCheckResult;
  refreshModelsState: () => void;
  resetPredictionHistory: () => void;
}

export const useUnifiedAIStore = create<UnifiedAIState & AIActions>()(
  persist(
    (set, get) => ({
      // ==== 初始状态 ====
      isInitialized: false,
      isTraining: false,
      trainingProgress: 0,
      lastPrediction: null,
      predictionHistory: [],

      models: [],
      activeTab: "overview",

      ragQuery: "",
      ragResults: [],

      kgCentralEntities: [],

      debateActive: false,
      debateRounds: 0,
      debateConsensus: false,

      selfAwarenessSummary: {
        totalReflections: 0,
        successRate: 0,
        topBiases: [],
        averageScore: 0,
        recentTrend: "stable",
      },
      recentReflections: [],

      lastSensitiveCheck: null,

      settings: {
        enabledModels: ["logistic", "xgboost", "lightgbm"],
        ensembleMethod: "weighted_voting",
        useHMM: true,
        useDebate: true,
        useSelfAwareness: true,
        useRAG: true,
        useKnowledgeGraph: true,
        useOnlineLearning: true,
        sensitiveMode: "notify_only",
      },

      // ==== Actions ====
      initializeAI: () => {
        const { settings } = get();
        aiOrchestrator["config"].enabledModels = settings.enabledModels;
        aiOrchestrator["config"].ensembleMethod = settings.ensembleMethod as any;
        aiOrchestrator["config"].useHMM = settings.useHMM;
        aiOrchestrator["config"].useDebate = settings.useDebate;
        aiOrchestrator["config"].useSelfAwareness = settings.useSelfAwareness;
        aiOrchestrator["config"].useRAG = settings.useRAG;
        aiOrchestrator["config"].useKnowledgeGraph = settings.useKnowledgeGraph;
        aiOrchestrator.initialize(10);

        // 知识图谱中心实体
        const central = aiOrchestrator.getKnowledgeGraph().getCentralEntities(10);
        const kgCentralEntities = central.map((c) => ({
          name: c.entity.name,
          type: c.entity.type,
          degree: c.degree,
          weightedDegree: c.weightedDegree,
        }));

        get().refreshModelsState();

        set({ isInitialized: true, kgCentralEntities });
      },

      trainModels: (samples: SupervisedSample[]) => {
        set({ isTraining: true, trainingProgress: 0 });
        try {
          aiOrchestrator.train(samples);
          set({ isTraining: false, trainingProgress: 100 });
          get().refreshModelsState();
        } catch (e) {
          console.error("训练失败:", e);
          set({ isTraining: false, trainingProgress: 0 });
        }
      },

      runPrediction: (features: number[], context = "") => {
        if (!get().isInitialized) get().initializeAI();
        const pred = aiOrchestrator.predict(features, context);
        const history = get().predictionHistory;
        const newHistory = [...history, { time: Date.now(), prediction: pred }].slice(-50);
        set({
          lastPrediction: pred,
          predictionHistory: newHistory,
          lastSensitiveCheck: pred.sensitiveCheck || null,
        });
        return pred;
      },

      runDebate: (features: number[]) => {
        if (!get().isInitialized) get().initializeAI();
        const result = aiOrchestrator.predictWithDebate(features);
        set({
          debateActive: true,
          debateRounds: result.debateResult.rounds.length,
          debateConsensus: result.debateResult.consensusReached,
          lastPrediction: result.prediction,
        });
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      toggleModel: (name) => {
        const models = get().models.map((m) =>
          m.name === name ? { ...m, enabled: !m.enabled } : m,
        );
        set({ models });
      },

      updateSetting: (key, value) => {
        const settings = { ...get().settings, [key]: value };
        set({ settings });
      },

      runRAGQuery: (query: string) => {
        if (!get().isInitialized) get().initializeAI();
        const results = aiOrchestrator.getRAG().search(query, 10);
        set({
          ragQuery: query,
          ragResults: results.map((r) => ({
            content: r.document.content,
            score: r.score,
            type: (r.document as any).type || "unknown",
          })),
        });
      },

      addReflection: (context, decision, outcome, features) => {
        if (!get().isInitialized) get().initializeAI();
        aiOrchestrator.reflect(context, decision, outcome, features);
        const summary = aiOrchestrator.getSelfAwareness().getSummary();
        const recent = aiOrchestrator.getSelfAwareness().getHistory(10);
        set({
          selfAwarenessSummary: summary,
          recentReflections: recent,
        });
      },

      checkSensitive: (text: string): SensitiveCheckResult => {
        const result = sensitiveFilter.check(text);
        set({ lastSensitiveCheck: result });
        return result;
      },

      refreshModelsState: () => {
        if (!aiOrchestrator.isReady()) return;
        const modelStates: AIModelState[] = [];
        for (const [name, model] of aiOrchestrator.getAllModels()) {
          modelStates.push({
            name,
            type: model.type as string,
            enabled: true,
            isTrained: model.isTrained,
            metrics: {
              accuracy: model.metrics.accuracy,
              precision: model.metrics.precision,
              recall: model.metrics.recall,
              f1: model.metrics.f1,
            },
            lastUsedAt: Date.now(),
          });
        }
        set({ models: modelStates });
      },

      resetPredictionHistory: () => {
        set({ predictionHistory: [], lastPrediction: null });
      },
    }),
    {
      name: "unified-ai-store",
      partialize: (state) => ({
        settings: state.settings,
        predictionHistory: state.predictionHistory,
      }),
    },
  ),
);
