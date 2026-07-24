import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentId, AgentStatus, AgentMessage, AgentOutput, AgentInput } from "@/lib/agent/types";
import { AgentCoordinator } from "@/lib/agent/agentCoordinator";
import { combineAgentSignals, type CombinedSignal, AGENT_WEIGHTS as defaultWeights } from "@/lib/agent/signalCombiner";
import { useMarketStore } from "@/store/useMarketStore";
import { useTradingStore } from "@/store/useTradingStore";
import { saveSignal as serverSaveSignal } from "@/services/server";
import type { StopLossConfig, TakeProfitConfig } from "@/lib/risk/takeProfitStopLoss";
import { llmClient } from "@/lib/llm/llmClient";

export type StrategyPreset = "conservative" | "moderate" | "aggressive" | "trend" | "reversal";

export interface SignalHistoryEntry {
  id: string;
  time: number;
  symbol: string;
  direction: "long" | "short" | "neutral";
  strength: number;
  confidence: number;
  price: number;
  traded: boolean;
  tradeId?: string;
  outcome?: "win" | "loss" | "pending";
  pnlPercent?: number;
  checkedAt?: number;
}

export interface AgentAccuracy {
  agentId: AgentId;
  totalSignals: number;
  correctSignals: number;
  accuracy: number;
  currentWeight: number;
}

export interface AgentUIState {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  icon: string;
  enabled: boolean;
  status: "idle" | "processing" | "busy" | "error";
  lastActiveAt: number;
  tasksCompleted: number;
  avgResponseTime: number;
  errorRate: number;
  lastResult?: AgentOutput;
}

export interface MultiAgentState {
  isInitialized: boolean;
  isRunning: boolean;
  activeTab: "overview" | "agents" | "messages" | "results" | "settings";
  agents: AgentUIState[];
  messageLog: AgentMessage[];
  latestAnalysis: AgentOutput | null;
  analysisHistory: Array<{ time: number; result: AgentOutput; signal?: CombinedSignal }>;
  combinedSignal: CombinedSignal | null;
  autoTrading: boolean;
  lastTradeTime: number;
  tradeCooldown: number;
  selectedAgentId: AgentId | null;
  signalHistory: SignalHistoryEntry[];
  agentAccuracy: Record<AgentId, { total: number; correct: number }>;
  lastAnalysisTime: number;
  settings: {
    autoRun: boolean;
    runInterval: number;
    enabledAgents: AgentId[];
    showMessageLog: boolean;
    confidenceThreshold: number;
    autoTrade: boolean;
    minConfidence: number;
    minStrength: number;
    defaultLeverage: number;
    tradeAmount: number;
    agentWeights: Record<AgentId, number>;
    riskManagement: {
      maxOpenPositions: number;
      maxDailyLossPercent: number;
      requireConfirmation: boolean;
      sameDirectionCooldown: number;
      positionCooldown: number;
      dynamicWeights: boolean;
      maxDrawdownPercent: number;
      maxConsecutiveLosses: number;
      maxExposurePercent: number;
      useKellyCriterion: boolean;
      kellyFraction: number;
      riskPerTradePercent: number;
      stopLoss: StopLossConfig;
      takeProfit: TakeProfitConfig;
    };
    strategyPreset: StrategyPreset;
    notifications: {
      soundEnabled: boolean;
      browserEnabled: boolean;
      strongSignalOnly: boolean;
    };
    llm: {
      enabled: boolean;
      provider: "openai" | "deepseek" | "qwen" | "claude" | "ollama";
      apiKey: string;
      baseUrl: string;
      model: string;
      temperature: number;
      maxTokens: number;
    };
  };
}

interface MultiAgentActions {
  initializeAgents: () => Promise<void>;
  toggleAgent: (id: AgentId) => void;
  setActiveTab: (tab: MultiAgentState["activeTab"]) => void;
  selectAgent: (id: AgentId | null) => void;
  runAnalysis: (symbol: string) => Promise<void>;
  toggleAutoRun: () => void;
  toggleAutoTrade: () => void;
  updateSetting: <K extends keyof MultiAgentState["settings"]>(
    key: K,
    value: MultiAgentState["settings"][K],
  ) => void;
  updateLLMConfig: (config: Partial<MultiAgentState["settings"]["llm"]>) => void;
  updateAgentStatus: (status: AgentStatus) => void;
  syncAllAgentStatuses: () => void;
  addMessage: (msg: AgentMessage) => void;
  setLatestAnalysis: (result: AgentOutput) => void;
  applyStrategyPreset: (preset: StrategyPreset) => void;
  updateAgentWeight: (agentId: AgentId, weight: number) => void;
  checkSignalOutcomes: (currentPrice: number) => void;
  requestNotification: (title: string, body: string, type?: "signal" | "trade" | "alert") => void;
}

const STRATEGY_PRESETS: Record<StrategyPreset, {
  name: string;
  description: string;
  threshold: number;
  minStrength: number;
  minConfidence: number;
  leverage: number;
  weights: Partial<Record<AgentId, number>>;
}> = {
  conservative: {
    name: "保守型",
    description: "高置信度+低杠杆，只做高胜率机会",
    threshold: 0.75,
    minStrength: 0.3,
    minConfidence: 0.75,
    leverage: 2,
    weights: { "market-analyst": 0.3, "risk-manager": 0.12, "backtest-agent": 0.12 },
  },
  moderate: {
    name: "稳健型",
    description: "平衡收益与风险，适合大多数情况",
    threshold: 0.6,
    minStrength: 0.2,
    minConfidence: 0.65,
    leverage: 3,
    weights: {},
  },
  aggressive: {
    name: "激进型",
    description: "低门槛高杠杆，捕捉更多机会",
    threshold: 0.45,
    minStrength: 0.1,
    minConfidence: 0.5,
    leverage: 5,
    weights: { "sentiment-analyst": 0.18, "news-analyst": 0.15, "strategy-researcher": 0.15 },
  },
  trend: {
    name: "趋势跟踪",
    description: "技术面主导，顺势而为",
    threshold: 0.55,
    minStrength: 0.25,
    minConfidence: 0.6,
    leverage: 4,
    weights: { "market-analyst": 0.35, "onchain-analyst": 0.2, "macro-analyst": 0.1 },
  },
  reversal: {
    name: "反转交易",
    description: "情绪+基本面，抄底摸顶",
    threshold: 0.55,
    minStrength: 0.3,
    minConfidence: 0.6,
    leverage: 2,
    weights: { "sentiment-analyst": 0.25, "news-analyst": 0.2, "market-analyst": 0.2, "onchain-analyst": 0.15 },
  },
};

const AGENT_DEFS: Omit<AgentUIState, "lastActiveAt" | "tasksCompleted" | "avgResponseTime" | "errorRate">[] = [
  {
    id: "market-analyst",
    name: "市场分析代理",
    role: "技术分析师",
    description: "技术指标分析、图表模式识别、走势预测",
    icon: "📈",
    enabled: true,
    status: "idle",
  },
  {
    id: "onchain-analyst",
    name: "链上数据代理",
    role: "链上分析师",
    description: "链上指标分析、巨鲸监控、资金流向追踪",
    icon: "🐳",
    enabled: true,
    status: "idle",
  },
  {
    id: "news-analyst",
    name: "新闻分析代理",
    role: "新闻分析师",
    description: "新闻聚合、事件分类、影响评估",
    icon: "📰",
    enabled: true,
    status: "idle",
  },
  {
    id: "sentiment-analyst",
    name: "市场情绪代理",
    role: "情绪分析师",
    description: "社交媒体情绪分析、恐慌贪婪指数、情绪反转检测",
    icon: "😊",
    enabled: true,
    status: "idle",
  },
  {
    id: "macro-analyst",
    name: "宏观经济代理",
    role: "宏观分析师",
    description: "宏观数据监控、政策分析、相关性研究",
    icon: "🧠",
    enabled: true,
    status: "idle",
  },
  {
    id: "strategy-researcher",
    name: "策略研究代理",
    role: "策略研究员",
    description: "策略开发、参数优化、策略组合",
    icon: "⚙️",
    enabled: true,
    status: "idle",
  },
  {
    id: "backtest-agent",
    name: "回测代理",
    role: "回测工程师",
    description: "历史数据回测、性能评估、参数寻优",
    icon: "🧪",
    enabled: true,
    status: "idle",
  },
  {
    id: "risk-manager",
    name: "风险控制代理",
    role: "Risk Manager",
    description: "风险评估、仓位管理、合规审计",
    icon: "📊",
    enabled: true,
    status: "idle",
  },
  {
    id: "investment-advisor",
    name: "投资顾问代理",
    role: "投资顾问",
    description: "投资组合建议、资产配置、优化方案",
    icon: "💼",
    enabled: true,
    status: "idle",
  },
  {
    id: "execution-agent",
    name: "交易执行代理",
    role: "Execution Agent",
    description: "订单执行、仓位管理、止盈止损",
    icon: "🚀",
    enabled: true,
    status: "idle",
  },
  {
    id: "monitoring-agent",
    name: "监控代理",
    role: "Monitoring Agent",
    description: "实时监控、异常检测、预警通知",
    icon: "🔍",
    enabled: true,
    status: "idle",
  },
  {
    id: "performance-auditor",
    name: "日志分析代理",
    role: "绩效审核员",
    description: "交易日志分析、绩效审核、报告生成",
    icon: "📝",
    enabled: true,
    status: "idle",
  },
  {
    id: "llm-analyst",
    name: "AI智能分析代理",
    role: "AI分析师",
    description: "基于大语言模型的综合市场分析和决策建议",
    icon: "🤖",
    enabled: true,
    status: "idle",
  },
];

let coordinator: AgentCoordinator | null = null;

function getCoordinator(): AgentCoordinator {
  if (!coordinator) {
    coordinator = new AgentCoordinator();
  }
  return coordinator;
}

export const useMultiAgentStore = create<MultiAgentState & MultiAgentActions>()(
  persist(
    (set, get) => ({
      isInitialized: false,
      isRunning: false,
      activeTab: "overview",
      agents: AGENT_DEFS.map((a) => ({
        ...a,
        lastActiveAt: 0,
        tasksCompleted: 0,
        avgResponseTime: 0,
        errorRate: 0,
      })),
      messageLog: [],
      latestAnalysis: null,
      analysisHistory: [],
      combinedSignal: null,
      autoTrading: false,
      lastTradeTime: 0,
      tradeCooldown: 300000,
      selectedAgentId: null,
      settings: {
        autoRun: false,
        runInterval: 300000,
        enabledAgents: AGENT_DEFS.map((a) => a.id),
        showMessageLog: false,
        confidenceThreshold: 0.6,
        autoTrade: false,
        minConfidence: 0.65,
        minStrength: 0.2,
        defaultLeverage: 3,
        tradeAmount: 1000,
        agentWeights: { ...defaultWeights } as Record<AgentId, number>,
        riskManagement: {
          maxOpenPositions: 3,
          maxDailyLossPercent: 5,
          requireConfirmation: false,
          sameDirectionCooldown: 300000,
          positionCooldown: 600000,
          dynamicWeights: false,
          maxDrawdownPercent: 15,
          maxConsecutiveLosses: 3,
          maxExposurePercent: 50,
          useKellyCriterion: false,
          kellyFraction: 0.5,
          riskPerTradePercent: 2,
          stopLoss: {
            mode: "atr",
            fixedPercent: 5,
            atrMultiplier: 2,
            minStopDistancePercent: 1,
          },
          takeProfit: {
            mode: "partial",
            fixedPercent: 10,
            partialLevels: [
              { id: "tp1", profitPercent: 3, closeRatio: 0.3, moveToBreakEven: false, triggered: false },
              { id: "tp2", profitPercent: 6, closeRatio: 0.3, moveToBreakEven: true, triggered: false },
              { id: "tp3", profitPercent: 12, closeRatio: 0.4, moveToBreakEven: true, triggered: false },
            ],
            trailingActivationPercent: 5,
            trailingDistancePercent: 2,
            moveToBreakEvenAfterPercent: 3,
          },
        },
        strategyPreset: "moderate" as StrategyPreset,
        notifications: {
          soundEnabled: false,
          browserEnabled: false,
          strongSignalOnly: true,
        },
        llm: {
          enabled: false,
          provider: "deepseek",
          apiKey: "",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          temperature: 0.3,
          maxTokens: 2000,
        },
      },
      signalHistory: [],
      agentAccuracy: {} as Record<AgentId, { total: number; correct: number }>,
      lastAnalysisTime: 0,

      initializeAgents: async () => {
        if (get().isInitialized) return;
        try {
          const coord = getCoordinator();
          await coord.init();
          // 初始化后同步 LLM 设置
          const settings = get().settings;
          if (settings.llm?.enabled) {
            coord.setAllAgentsLLM(true);
          }
          set({ isInitialized: true });
        } catch (error) {
          console.error("Failed to initialize agents:", error);
        }
      },

      toggleAgent: (id) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, enabled: !a.enabled } : a,
          ),
          settings: {
            ...state.settings,
            enabledAgents: state.settings.enabledAgents.includes(id)
              ? state.settings.enabledAgents.filter((a) => a !== id)
              : [...state.settings.enabledAgents, id],
          },
        }));
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      selectAgent: (id) => set({ selectedAgentId: id }),

      runAnalysis: async (symbol) => {
        if (!get().isInitialized) {
          await get().initializeAgents();
        }
        if (get().isRunning) return;

        set({ isRunning: true });

        try {
          const coord = getCoordinator();

          // 从 useMarketStore 获取真实的 K 线数据、新闻数据和技术指标分析结果
          const marketState = useMarketStore.getState();
          const candles = marketState.candles || [];
          const news = marketState.news || [];
          const fearGreed = marketState.fearGreed || null;
          const ticker = marketState.ticker || null;
          const currentPrice = ticker?.lastPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : 0);

          // 获取已计算好的技术指标分析结果，避免智能体重复计算
          const techIndicators = {
            macdSummary: marketState.macdSummary,
            rsiSummary: marketState.rsiSummary,
            kdjSummary: marketState.kdjSummary,
            cvdSummary: marketState.cvdSummary,
            oiSummary: marketState.oiSummary,
            supportResistance: marketState.supportResistance,
            divergences: marketState.divergences,
            liquidityZones: marketState.liquidityZones,
            timeframeSignals: marketState.timeframeSignals,
            patternSummary: marketState.patternSummary,
            signalScore: marketState.signalScore,
            gaps: marketState.gaps,
          };

          // 逐个执行启用的代理，并实时同步 UI 状态
          const enabledIds = get().settings.enabledAgents;
          const results: Partial<Record<AgentId, AgentOutput>> = {};

          // 设置 LLM 分析师启用状态
          const settings = get().settings;
          try {
            const llmAgent = coord.getAgent("llm-analyst") as any;
            if (llmAgent?.setEnabled) {
              llmAgent.setEnabled(settings.llm.enabled);
            }
          } catch {
            // 忽略
          }

          // 定义分析流程：按类别串行，类别内可并行
          const phases: Array<{ name: string; agents: Array<{ id: AgentId; task: AgentInput }> }> = [
            {
              name: "分析阶段",
              agents: [
                { id: "market-analyst", task: { type: "ta-analysis", data: { candles, techIndicators } } },
                { id: "onchain-analyst", task: { type: "whale-tracking", data: { symbol } } },
                { id: "news-analyst", task: { type: "sentiment-analysis", data: { symbol, news } } },
                { id: "sentiment-analyst", task: { type: "fng-index", data: { symbol } } },
                { id: "macro-analyst", task: { type: "economic-indicators", data: {} } },
                { id: "llm-analyst", task: { type: "llm-comprehensive", data: { symbol, candles, fearGreedIndex: fearGreed?.value, techIndicators } } },
              ],
            },
            {
              name: "策略阶段",
              agents: [
                { id: "strategy-researcher", task: { type: "generate-strategy", data: { marketRegime: "trending", assetClass: "crypto", timeFrame: "4h", techIndicators } } },
                { id: "backtest-agent", task: { type: "run-backtest", data: { candles, strategy: "momentum", techIndicators } } },
              ],
            },
            {
              name: "执行阶段",
              agents: [
                { id: "risk-manager", task: { type: "assess-risk", data: { position: { symbol, side: "long", leverage: 5, stopLoss: true, size: 1, entryPrice: currentPrice }, marketConditions: { volatility: "normal", trend: "strong" } } } },
                { id: "execution-agent", task: { type: "get-positions", data: { symbol } } },
              ],
            },
            {
              name: "监控阶段",
              agents: [
                { id: "monitoring-agent", task: { type: "check-system", data: {} } },
                { id: "performance-auditor", task: { type: "generate-report", data: {} } },
              ],
            },
          ];

          for (const phase of phases) {
            const enabledAgents = phase.agents.filter((a) => enabledIds.includes(a.id));
            if (enabledAgents.length === 0) continue;

            // 将即将执行的代理标记为 processing
            set((state) => ({
              agents: state.agents.map((agent) => {
                if (enabledAgents.some((ea) => ea.id === agent.id)) {
                  return { ...agent, status: "processing" as const, lastActiveAt: Date.now() };
                }
                return agent;
              }),
            }));

            // 强制等待 300ms 让 UI 先渲染 processing 状态
            await new Promise((resolve) => setTimeout(resolve, 300));

            // 串行执行代理，每个间隔 200ms，营造依次工作的效果
            const phaseResults: Array<{ id: AgentId; result: AgentOutput }> = [];
            for (const ea of enabledAgents) {
              try {
                const result = await coord.executeTask(ea.id, ea.task);
                phaseResults.push({ id: ea.id, result });
              } catch (err) {
                phaseResults.push({
                  id: ea.id,
                  result: {
                    type: "error",
                    data: { error: err instanceof Error ? err.message : String(err) },
                    confidence: 0,
                  } as AgentOutput,
                });
              }
              // 每个代理执行完后更新状态
              const lastResult = phaseResults[phaseResults.length - 1];
              results[lastResult.id] = lastResult.result;
              const agentStatus = coord.getAgentStatus(lastResult.id);
              if (agentStatus) {
                get().updateAgentStatus(agentStatus);
              }
              set((state) => ({
                agents: state.agents.map((a) =>
                  a.id === lastResult.id ? { ...a, lastResult: lastResult.result } : a,
                ),
              }));
              get().addMessage({
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: lastResult.result.type === "error" ? "error" : "response",
                from: lastResult.id,
                to: "agent-coordinator" as AgentId,
                topic: phase.name,
                payload: lastResult.result.data,
                timestamp: Date.now(),
                priority: "normal",
              });
              // 间隔 200ms 再执行下一个
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }

          // 单独执行投资顾问代理（使用前面阶段的分析结果）
          if (enabledIds.includes("investment-advisor")) {
            set((state) => ({
              agents: state.agents.map((agent) => {
                if (agent.id === "investment-advisor") {
                  return { ...agent, status: "processing" as const, lastActiveAt: Date.now() };
                }
                return agent;
              }),
            }));
            await new Promise((resolve) => setTimeout(resolve, 300));
            
            const marketResult = results["market-analyst"];
            const onchainResult = results["onchain-analyst"];
            const sentimentResult = results["sentiment-analyst"];
            
            const advisorTask: AgentInput = {
              type: "investment-recommendation",
              data: {
                symbol,
                marketAnalysis: {
                  trend: marketResult?.data?.indicators?.trend,
                  supportLevel: marketResult?.data?.supportLevels?.[0]?.price,
                  resistanceLevel: marketResult?.data?.resistanceLevels?.[0]?.price,
                },
                sentiment: {
                  score: sentimentResult?.data?.value !== undefined ? sentimentResult.data.value / 100 : undefined,
                },
                onchainData: {
                  netflow: onchainResult?.data?.netFlow,
                },
              },
            };
            
            try {
              const advisorResult = await coord.executeTask("investment-advisor", advisorTask);
              results["investment-advisor"] = advisorResult;
              const agentStatus = coord.getAgentStatus("investment-advisor");
              if (agentStatus) {
                get().updateAgentStatus(agentStatus);
              }
              set((state) => ({
                agents: state.agents.map((a) =>
                  a.id === "investment-advisor" ? { ...a, lastResult: advisorResult } : a,
                ),
              }));
              get().addMessage({
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: advisorResult.type === "error" ? "error" : "response",
                from: "investment-advisor",
                to: "agent-coordinator" as AgentId,
                topic: "投资建议",
                payload: advisorResult.data,
                timestamp: Date.now(),
                priority: "normal",
              });
            } catch (err) {
              results["investment-advisor"] = {
                type: "error",
                data: { error: err instanceof Error ? err.message : String(err) },
                confidence: 0,
              } as AgentOutput;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          // 汇总分析结果
          const marketResult = results["market-analyst"];
          const onchainResult = results["onchain-analyst"];
          const newsResult = results["news-analyst"];
          const sentimentResult = results["sentiment-analyst"];
          const macroResult = results["macro-analyst"];

          const combinedResult: AgentOutput = {
            type: "combined-analysis",
            data: {
              symbol,
              market: marketResult?.data || null,
              onchain: onchainResult?.data || null,
              news: newsResult?.data || null,
              sentiment: sentimentResult?.data || null,
              macro: macroResult?.data || null,
              strategy: results["strategy-researcher"]?.data || null,
              risk: results["risk-manager"]?.data || null,
              recommendation: results["investment-advisor"]?.data || null,
              summary: generateAnalysisSummary(results),
            },
            confidence: calculateCombinedConfidence(Object.values(results)),
            sources: Object.keys(results),
          };

          // 计算综合信号
          const signal = combineAgentSignals(
            results as Partial<Record<AgentId, AgentOutput>>,
            currentPrice,
            settings.confidenceThreshold,
            settings.agentWeights,
          );

          // 记录信号历史
          const historyEntry: SignalHistoryEntry = {
            id: `sig_${Date.now()}`,
            time: Date.now(),
            symbol,
            direction: signal.direction,
            strength: signal.strength,
            confidence: signal.confidence,
            price: currentPrice,
            traded: false,
            outcome: "pending",
          };

          // 风控检查
          let tradeAllowed = true;
          let tradeBlockReason = "";

          const tradingStore = useTradingStore.getState();
          const openPositions = (tradingStore.positions || []).filter(
            (p: any) => p.status === "open",
          );

          if (openPositions.length >= settings.riskManagement.maxOpenPositions) {
            tradeAllowed = false;
            tradeBlockReason = "已达最大持仓数";
          }

          // 自动交易
          let traded = false;
          let tradeId: string | undefined;

          if (
            settings.autoTrade &&
            signal.shouldTrade &&
            signal.confidence >= settings.minConfidence &&
            signal.strength >= settings.minStrength &&
            Date.now() - get().lastTradeTime > get().tradeCooldown &&
            tradeAllowed
          ) {
            try {
              set({ autoTrading: true });
              const side = signal.direction === "long" ? "long" : "short";
              const leverage = Math.min(settings.defaultLeverage, signal.recommendedLeverage);
              const entryPrice = currentPrice > 0 ? currentPrice : 50000;
              const pos = tradingStore.manualOpenPosition
                ? tradingStore.manualOpenPosition(
                    symbol,
                    side as "long" | "short",
                    entryPrice,
                    settings.tradeAmount,
                  )
                : null;
              traded = true;
              tradeId = pos?.id;
              historyEntry.traded = true;
              historyEntry.tradeId = pos?.id;
              set({
                lastTradeTime: Date.now(),
                autoTrading: false,
              });
              get().addMessage({
                id: `trade_${Date.now()}`,
                type: "event",
                from: "agent-coordinator",
                to: "execution-agent",
                topic: "auto-trade",
                payload: { symbol, side, positionId: pos?.id, leverage, signal },
                timestamp: Date.now(),
                priority: "high",
              });
              get().requestNotification(
                `自动开${side === "long" ? "多" : "空"} - ${symbol}`,
                `价格 ${entryPrice.toFixed(2)}，${leverage}x，置信度 ${(signal.confidence * 100).toFixed(0)}%`,
                "trade",
              );
            } catch (tradeError) {
              console.error("Auto trade failed:", tradeError);
              set({ autoTrading: false });
            }
          } else if (!tradeAllowed && settings.autoTrade && signal.shouldTrade) {
            get().addMessage({
              id: `trade_blocked_${Date.now()}`,
              type: "event",
              from: "risk-manager",
              to: "agent-coordinator",
              topic: "risk-blocked",
              payload: { reason: tradeBlockReason, signal },
              timestamp: Date.now(),
              priority: "normal",
            });
          }

          // 强信号通知
          if (
            signal.direction !== "neutral" &&
            signal.strength >= 0.3 &&
            signal.confidence >= 0.7 &&
            !traded
          ) {
            get().requestNotification(
              `强${signal.direction === "long" ? "看涨" : "看跌"}信号 - ${symbol}`,
              `强度 ${(signal.strength * 100).toFixed(0)}%，置信度 ${(signal.confidence * 100).toFixed(0)}%`,
              "signal",
            );
          }

          set((state) => ({
            isRunning: false,
            latestAnalysis: combinedResult,
            combinedSignal: signal,
            lastAnalysisTime: Date.now(),
            signalHistory: [historyEntry, ...state.signalHistory.slice(0, 99)],
            analysisHistory: [
              { time: Date.now(), result: combinedResult, signal },
              ...state.analysisHistory.slice(0, 49),
            ],
          }));

          // 评估历史信号的盈亏
          get().checkSignalOutcomes(currentPrice);

          serverSaveSignal({
            symbol,
            direction: signal.direction,
            strength: signal.strength,
            confidence: signal.confidence,
            price: currentPrice,
          }).catch(() => {});
        } catch (error) {
          console.error("Analysis failed:", error);
          console.error("Error stack:", error instanceof Error ? error.stack : error);
          set({ isRunning: false });
          // 同步所有代理状态
          get().syncAllAgentStatuses();
        }
      },

      toggleAutoRun: () => {
        set((state) => ({
          settings: { ...state.settings, autoRun: !state.settings.autoRun },
        }));
      },

      toggleAutoTrade: () => {
        set((state) => ({
          settings: { ...state.settings, autoTrade: !state.settings.autoTrade },
        }));
      },

      applyStrategyPreset: (preset) => {
        const presetConfig = STRATEGY_PRESETS[preset];
        if (!presetConfig) return;
        set((state) => {
          const newWeights = { ...state.settings.agentWeights };
          for (const [k, v] of Object.entries(presetConfig.weights)) {
            if (v !== undefined) newWeights[k as AgentId] = v;
          }
          return {
            settings: {
              ...state.settings,
              strategyPreset: preset,
              confidenceThreshold: presetConfig.threshold,
              minConfidence: presetConfig.minConfidence,
              minStrength: presetConfig.minStrength,
              defaultLeverage: presetConfig.leverage,
              agentWeights: newWeights,
            },
          };
        });
      },

      updateAgentWeight: (agentId, weight) => {
        set((state) => ({
          settings: {
            ...state.settings,
            agentWeights: {
              ...state.settings.agentWeights,
              [agentId]: Math.max(0, Math.min(1, weight)),
            },
          },
        }));
      },

      checkSignalOutcomes: (currentPrice) => {
        set((state) => {
          const updated = state.signalHistory.map((entry) => {
            if (entry.outcome !== "pending") return entry;
            // 15 分钟后开始评估（太短容易误判，太长体验差）
            if (Date.now() - entry.time < 15 * 60 * 1000) return entry;

            const pnlPercent =
              entry.direction === "long"
                ? ((currentPrice - entry.price) / entry.price) * 100
                : entry.direction === "short"
                ? ((entry.price - currentPrice) / entry.price) * 100
                : 0;

            let outcome: "win" | "loss" | "pending" = "pending";
            let pnlToCompare = pnlPercent;

            // 4 小时后如果仍在±0.5%内，标记为"持平"按 loss 计（没赚钱就是亏了机会成本）
            const isExpired = Date.now() - entry.time > 4 * 3600 * 1000;

            if (pnlPercent > 0.5) {
              outcome = "win";
            } else if (pnlPercent < -0.5) {
              outcome = "loss";
            } else if (isExpired) {
              outcome = "loss";
            }

            return {
              ...entry,
              outcome,
              pnlPercent: pnlToCompare,
              checkedAt: Date.now(),
            };
          });
          return { signalHistory: updated };
        });
      },

      requestNotification: (title, body, type = "signal") => {
        const s = get().settings.notifications;

        // 强信号过滤
        if (s.strongSignalOnly && type === "signal") {
          // 这里只处理强信号，调用方已保证
        }

        // 浏览器通知
        if (s.browserEnabled && typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(title, { body, icon: "🤖" });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((p) => {
              if (p === "granted") new Notification(title, { body, icon: "🤖" });
            });
          }
        }

        // 声音提醒
        if (s.soundEnabled && typeof window !== "undefined") {
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = type === "trade" ? 880 : type === "alert" ? 440 : 660;
            osc.type = "sine";
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
          } catch {
            // 忽略音频错误
          }
        }
      },

      updateSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }));
      },

      updateLLMConfig: (config) => {
        set((state) => {
          const newConfig = { ...state.settings.llm, ...config };
          // 同步更新全局 LLM 客户端配置
          llmClient.updateConfig(newConfig);
          console.log("[LLM Config Updated]", {
            provider: newConfig.provider,
            model: newConfig.model,
            hasApiKey: !!newConfig.apiKey,
            baseUrl: newConfig.baseUrl,
            enabled: newConfig.enabled,
          });

          // 如果启用/禁用 LLM，同步到所有智能体
          if (config.enabled !== undefined && state.isInitialized) {
            try {
              getCoordinator().setAllAgentsLLM(config.enabled);
            } catch (e) {
              console.warn("[LLM] 同步智能体设置失败:", e);
            }
          }

          return {
            settings: { ...state.settings, llm: newConfig },
          };
        });
      },

      updateAgentStatus: (status) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === status.id
              ? {
                  ...a,
                  status: status.status,
                  lastActiveAt: status.lastActiveAt,
                  tasksCompleted: status.metrics.tasksCompleted,
                  avgResponseTime: status.metrics.avgResponseTime,
                  errorRate: status.metrics.errorRate,
                }
              : a,
          ),
        }));
      },

      syncAllAgentStatuses: () => {
        const coord = getCoordinator();
        const statuses = coord.getAllAgentStatuses();
        set((state) => ({
          agents: state.agents.map((a) => {
            const s = statuses.find((st) => st.id === a.id);
            if (!s) return a;
            return {
              ...a,
              status: s.status,
              lastActiveAt: s.lastActiveAt,
              tasksCompleted: s.metrics.tasksCompleted,
              avgResponseTime: s.metrics.avgResponseTime,
              errorRate: s.metrics.errorRate,
            };
          }),
        }));
      },

      addMessage: (msg) => {
        set((state) => ({
          messageLog: [msg, ...state.messageLog.slice(0, 99)],
        }));
      },

      setLatestAnalysis: (result) => {
        set((state) => ({
          latestAnalysis: result,
          analysisHistory: [
            { time: Date.now(), result },
            ...state.analysisHistory.slice(0, 49),
          ],
        }));
      },
    }),
    {
      name: "multi-agent-store",
      partialize: (state) => ({
        settings: state.settings,
      }),
      merge: (persistedState: any, currentState) => {
        return {
          ...currentState,
          settings: {
            ...currentState.settings,
            ...persistedState?.settings,
            riskManagement: {
              ...currentState.settings.riskManagement,
              ...persistedState?.settings?.riskManagement,
            },
            notifications: {
              ...currentState.settings.notifications,
              ...persistedState?.settings?.notifications,
            },
            llm: {
              ...currentState.settings.llm,
              ...persistedState?.settings?.llm,
            },
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        // 持久化恢复后，把 LLM 配置同步到全局单例 LLM 客户端
        if (state?.settings?.llm) {
          try {
            llmClient.updateConfig(state.settings.llm);
            console.log("[LLM Config Rehydrated]", {
              provider: state.settings.llm.provider,
              model: state.settings.llm.model,
              hasApiKey: !!state.settings.llm.apiKey,
              enabled: state.settings.llm.enabled,
            });
            // 如果已初始化且 LLM 已启用，同步到所有智能体
            if (state.isInitialized && state.settings.llm.enabled) {
              try {
                getCoordinator().setAllAgentsLLM(true);
              } catch { /* ignore */ }
            }
          } catch (e) {
            console.warn("[LLM Config Rehydrate Failed]", e);
          }
        }
      },
    },
  ),
);

function generateAnalysisSummary(results: Partial<Record<AgentId, AgentOutput>>): string {
  const parts: string[] = [];

  const market = results["market-analyst"];
  if (market?.data?.indicators?.trend) {
    parts.push(`技术面: ${market.data.indicators.trend === "up" ? "看涨" : market.data.indicators.trend === "down" ? "看跌" : "震荡"}`);
  }

  const onchain = results["onchain-analyst"];
  const netflow = onchain?.data?.netFlow ?? onchain?.data?.netflow;
  if (netflow) {
    parts.push(`链上: ${netflow === "inflow" || netflow > 0 ? "资金流入" : "资金流出"}`);
  }

  const sentiment = results["sentiment-analyst"];
  const sentimentScore = sentiment?.data?.value ?? sentiment?.data?.score;
  if (sentimentScore !== undefined) {
    const normalizedScore = typeof sentimentScore === "number" && sentimentScore > 10 ? sentimentScore / 100 : sentimentScore;
    parts.push(`情绪: ${normalizedScore > 0.6 ? "乐观" : normalizedScore < 0.3 ? "悲观" : "中性"}`);
  }

  const news = results["news-analyst"];
  if (news?.data?.totalArticles) {
    parts.push(`新闻: ${news.data.totalArticles}条相关`);
  }

  return parts.join("；") || "分析完成，暂无汇总数据";
}

function calculateCombinedConfidence(results: AgentOutput[]): number {
  const validConfidences = results.filter((r) => r?.confidence && r.confidence > 0).map((r) => r.confidence!);
  if (validConfidences.length === 0) return 0.5;

  const average = validConfidences.reduce((sum, c) => sum + c, 0) / validConfidences.length;
  const variance = validConfidences.reduce((sum, c) => sum + Math.pow(c - average, 2), 0) / validConfidences.length;
  const adjusted = average * (1 - variance * 0.5);

  return Number(Math.max(0.1, Math.min(0.99, adjusted)).toFixed(2));
}
