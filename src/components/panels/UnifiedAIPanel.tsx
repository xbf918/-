/**
 * 统一 AI 模型面板
 *
 * 整合展示所有 AI 模块：
 * - 概览：综合预测结果
 * - 模型：各模型状态与指标
 * - RAG：知识检索
 * - KG：知识图谱
 * - 辩论：AI 多代理辩论
 * - 自我意识：自我批评与反思
 * - 设置：配置项
 *
 * 敏感词策略：检测到敏感词只做轻微提示，不拦截任何操作
 */
import { useState, useCallback } from "react";
import {
  Brain,
  Sparkles,
  BarChart3,
  Database,
  Network,
  MessageSquare,
  Search,
  Settings,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { useUnifiedAIStore } from "@/store/useUnifiedAIStore";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";
import { sensitiveFilter } from "@/lib/utils/sensitiveFilter";

const TABS = [
  { id: "overview", label: "概览", icon: Sparkles },
  { id: "models", label: "模型", icon: BarChart3 },
  { id: "rag", label: "RAG 检索", icon: Database },
  { id: "kg", label: "知识图谱", icon: Network },
  { id: "debate", label: "AI 辩论", icon: MessageSquare },
  { id: "self", label: "自我意识", icon: Search },
  { id: "settings", label: "设置", icon: Settings },
] as const;

const DIRECTION_META = {
  up: { color: "text-neon-green", icon: TrendingUp, label: "看涨" },
  down: { color: "text-neon-red", icon: TrendingDown, label: "看跌" },
  neutral: { color: "text-ink-muted", icon: Minus, label: "观望" },
};

export function UnifiedAIPanel() {
  const {
    isInitialized,
    isTraining,
    lastPrediction,
    predictionHistory,
    models,
    activeTab,
    ragQuery,
    ragResults,
    kgCentralEntities,
    debateActive,
    debateRounds,
    debateConsensus,
    selfAwarenessSummary,
    recentReflections,
    lastSensitiveCheck,
    settings,
    initializeAI,
    trainModels,
    runPrediction,
    runDebate,
    setActiveTab,
    runRAGQuery,
    addReflection,
    checkSensitive,
    updateSetting,
  } = useUnifiedAIStore();

  const [queryInput, setQueryInput] = useState("");
  const [demoFeatures, setDemoFeatures] = useState<number[]>(
    new Array(10).fill(0).map(() => Math.random()),
  );
  const [contextText, setContextText] = useState("");
  const [sensitiveTipVisible, setSensitiveTipVisible] = useState(false);

  const handleInit = useCallback(() => {
    initializeAI();
  }, [initializeAI]);

  const handleTrainDemo = useCallback(() => {
    const samples = Array.from({ length: 200 }, () => {
      const features = new Array(10).fill(0).map(() => Math.random() * 2 - 1);
      const sum = features.reduce((a, b) => a + b, 0);
      const label = sum > 0 ? 1 : 0;
      return { features, label };
    });
    trainModels(samples);
  }, [trainModels]);

  const handlePredict = useCallback(() => {
    if (contextText.trim()) {
      const checkResult = checkSensitive(contextText);
      if (checkResult.containsSensitive) {
        setSensitiveTipVisible(true);
        setTimeout(() => setSensitiveTipVisible(false), 3000);
      }
    }
    runPrediction(demoFeatures, contextText);
  }, [demoFeatures, contextText, runPrediction, checkSensitive]);

  const handleRAGSearch = useCallback(() => {
    if (!queryInput.trim()) return;
    const checkResult = sensitiveFilter.check(queryInput);
    if (checkResult.containsSensitive) {
      setSensitiveTipVisible(true);
      setTimeout(() => setSensitiveTipVisible(false), 3000);
    }
    runRAGQuery(queryInput);
  }, [queryInput, runRAGQuery]);

  const handleAddReflection = useCallback(() => {
    addReflection(
      "测试交易决策",
      lastPrediction?.direction || "neutral",
      Math.random() > 0.5 ? "success" : "failure",
      demoFeatures,
    );
  }, [addReflection, lastPrediction, demoFeatures]);

  const handleContextChange = useCallback((val: string) => {
    setContextText(val);
    if (val.length > 0 && val.length % 10 === 0) {
      checkSensitive(val);
    }
  }, [checkSensitive]);

  return (
    <Panel title="AI 模型中心" icon={<Brain className="h-3.5 w-3.5" />} className="h-full flex flex-col">
      {/* 敏感词轻微提示横幅 */}
      {sensitiveTipVisible && lastSensitiveCheck?.containsSensitive && (
        <div className="px-4 py-2 bg-neon-yellow/10 border-b border-neon-yellow/30 text-neon-yellow text-xs flex items-center gap-2 animate-pulse">
          <ShieldAlert size={14} />
          <span>{lastSensitiveCheck.message}</span>
          <span className="ml-auto opacity-60">（已放行，不拦截）</span>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="flex gap-1 p-2 border-b border-panel-border overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all",
                active
                  ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40"
                  : "text-ink-muted hover:text-ink hover:bg-panel-light",
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 概览 Tab */}
        {activeTab === "overview" && (
          <OverviewTab
            isInitialized={isInitialized}
            isTraining={isTraining}
            lastPrediction={lastPrediction}
            predictionHistory={predictionHistory}
            models={models}
            onInit={handleInit}
            onTrain={handleTrainDemo}
            onPredict={handlePredict}
            onDebate={() => runDebate(demoFeatures)}
            contextText={contextText}
            onContextChange={handleContextChange}
            lastSensitiveCheck={lastSensitiveCheck}
          />
        )}

        {/* 模型 Tab */}
        {activeTab === "models" && <ModelsTab models={models} />}

        {/* RAG Tab */}
        {activeTab === "rag" && (
          <RAGTab
            query={queryInput}
            onQueryChange={setQueryInput}
            onSearch={handleRAGSearch}
            results={ragResults}
          />
        )}

        {/* KG Tab */}
        {activeTab === "kg" && <KGTab entities={kgCentralEntities} />}

        {/* 辩论 Tab */}
        {activeTab === "debate" && (
          <DebateTab
            active={debateActive}
            rounds={debateRounds}
            consensus={debateConsensus}
            prediction={lastPrediction}
            onRunDebate={() => runDebate(demoFeatures)}
          />
        )}

        {/* 自我意识 Tab */}
        {activeTab === "self" && (
          <SelfAwarenessTab
            summary={selfAwarenessSummary}
            reflections={recentReflections}
            onAddReflection={handleAddReflection}
          />
        )}

        {/* 设置 Tab */}
        {activeTab === "settings" && (
          <SettingsTab settings={settings} onUpdate={updateSetting} />
        )}
      </div>
    </Panel>
  );
}

// ==================== 概览 ====================
function OverviewTab({
  isInitialized,
  isTraining,
  lastPrediction,
  predictionHistory,
  models,
  onInit,
  onTrain,
  onPredict,
  onDebate,
  contextText,
  onContextChange,
  lastSensitiveCheck,
}: {
  isInitialized: boolean;
  isTraining: boolean;
  lastPrediction: any;
  predictionHistory: any[];
  models: any[];
  onInit: () => void;
  onTrain: () => void;
  onPredict: () => void;
  onDebate: () => void;
  contextText: string;
  onContextChange: (v: string) => void;
  lastSensitiveCheck: any;
}) {
  const dir = lastPrediction
    ? DIRECTION_META[lastPrediction.direction as keyof typeof DIRECTION_META]
    : null;

  return (
    <div className="space-y-4">
      {!isInitialized && (
        <div className="p-4 rounded-xl bg-void-200/50 border border-panel-border text-center">
          <Brain className="mx-auto mb-2 text-neon-cyan" size={32} />
          <p className="text-sm text-ink mb-3">AI 模型尚未初始化</p>
          <button
            onClick={onInit}
            className="px-4 py-2 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 rounded-lg text-sm hover:bg-neon-cyan/30 transition-colors"
          >
            <Play size={14} className="inline mr-1.5" />
            初始化 AI 系统
          </button>
        </div>
      )}

      {isInitialized && (
        <>
          {/* 综合预测卡片 */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-void-200 to-void-100 border border-panel-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-ink-muted">综合预测</span>
              <div className="flex gap-1">
                <button
                  onClick={onTrain}
                  disabled={isTraining}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-neon-cyan hover:bg-neon-cyan/10 transition-colors disabled:opacity-50"
                  title="训练模型"
                >
                  <RefreshCw size={14} className={isTraining ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={onPredict}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-neon-green hover:bg-neon-green/10 transition-colors"
                  title="运行预测"
                >
                  <Play size={14} />
                </button>
              </div>
            </div>

            {lastPrediction ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {dir && (
                    <>
                      <div className={cn("p-3 rounded-xl bg-void-300/50", dir.color)}>
                        <dir.icon size={28} />
                      </div>
                      <div>
                        <div className={cn("text-2xl font-bold", dir.color)}>
                          {dir.label}
                        </div>
                        <div className="text-xs text-ink-muted">
                          置信度 {(lastPrediction.confidence * 100).toFixed(1)}%
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {lastPrediction.marketRegime && (
                  <div className="text-xs text-ink-muted">
                    市场状态:{" "}
                    <span className="text-neon-cyan">
                      {lastPrediction.marketRegime === "trending"
                        ? "趋势市"
                        : lastPrediction.marketRegime === "ranging"
                          ? "震荡市"
                          : lastPrediction.marketRegime === "volatile"
                            ? "高波动"
                            : "未知"}
                    </span>
                  </div>
                )}

                {/* 模型分数条 */}
                <div className="space-y-1.5">
                  {Object.entries(lastPrediction.modelScores || {}).map(
                    ([name, score]: [string, any]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-xs text-ink-muted w-28 truncate">
                          {name}
                        </span>
                        <div className="flex-1 h-2 bg-void-300 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              score >= 0.6
                                ? "bg-neon-green"
                                : score <= 0.4
                                  ? "bg-neon-red"
                                  : "bg-neon-yellow",
                            )}
                            style={{ width: `${(score * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-muted w-10 text-right">
                          {(score * 100).toFixed(0)}%
                        </span>
                      </div>
                    ),
                  )}
                </div>

                {lastPrediction.warning && (
                  <div className="p-2 rounded-lg bg-neon-yellow/10 border border-neon-yellow/30 text-neon-yellow text-xs flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{lastPrediction.warning}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-ink-muted text-sm text-center py-6">点击运行预测按钮开始分析</p>
            )}
          </div>

          {/* 上下文输入 */}
          <div className="space-y-2">
            <label className="text-xs text-ink-muted flex items-center gap-1.5">
              <Eye size={12} /> 分析上下文（可选）
            </label>
            <textarea
              value={contextText}
              onChange={(e) => onContextChange(e.target.value)}
              placeholder="输入市场分析、新闻摘要等上下文..."
              className="w-full h-20 px-3 py-2 rounded-lg bg-void-200 border border-panel-border text-ink text-sm resize-none focus:outline-none focus:border-neon-cyan/50 placeholder-ink-muted"
            />
            <p className="text-xs text-ink-muted">
              预测历史: {predictionHistory.length} 条
            </p>
          </div>

          {/* 快捷操作 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPredict}
              className="p-3 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-sm hover:bg-neon-cyan/20 transition-colors"
            >
              <Sparkles size={16} className="inline mr-1.5" />
              运行预测
            </button>
            <button
              onClick={onDebate}
              className="p-3 rounded-xl bg-neon-purple/10 border border-neon-purple/30 text-neon-purple text-sm hover:bg-neon-purple/20 transition-colors"
            >
              <MessageSquare size={16} className="inline mr-1.5" />
              AI 辩论
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== 模型列表 ====================
function ModelsTab({ models }: { models: any[] }) {
  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-ink-muted text-sm">
        暂无模型，请先初始化 AI 系统
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {models.map((m) => (
        <div
          key={m.name}
          className="p-3 rounded-xl bg-void-200/50 border border-panel-border"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  m.isTrained ? "bg-neon-green" : "bg-ink-muted animate-pulse",
                )}
              />
              <span className="text-sm text-ink font-medium">{m.name}</span>
              <span className="text-xs text-ink-muted px-1.5 py-0.5 rounded bg-void-300">
                {m.type}
              </span>
            </div>
          </div>
          {m.isTrained && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-neon-cyan text-sm font-medium">
                  {(m.metrics.accuracy * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-ink-muted">准确率</div>
              </div>
              <div>
                <div className="text-neon-green text-sm font-medium">
                  {(m.metrics.precision * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-ink-muted">精确率</div>
              </div>
              <div>
                <div className="text-neon-yellow text-sm font-medium">
                  {(m.metrics.recall * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-ink-muted">召回率</div>
              </div>
              <div>
                <div className="text-neon-purple text-sm font-medium">
                  {(m.metrics.f1 * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-ink-muted">F1</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ==================== RAG ====================
function RAGTab({
  query,
  onQueryChange,
  onSearch,
  results,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  results: Array<{ content: string; score: number; type: string }>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="输入查询内容..."
          className="flex-1 px-3 py-2 rounded-lg bg-void-200 border border-panel-border text-ink text-sm focus:outline-none focus:border-neon-cyan/50 placeholder-ink-muted"
        />
        <button
          onClick={onSearch}
          className="px-4 py-2 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 rounded-lg text-sm hover:bg-neon-cyan/30 transition-colors"
        >
          检索
        </button>
      </div>

      {results.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">找到 {results.length} 条相关知识</p>
          {results.map((r, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-void-200/50 border border-panel-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neon-cyan px-1.5 py-0.5 rounded bg-neon-cyan/10">
                  {r.type}
                </span>
                <span className="text-xs text-ink-muted">
                  相关度 {(r.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-sm text-ink">{r.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-ink-muted text-sm">
          <Database className="mx-auto mb-2 opacity-50" size={32} />
          输入关键词检索知识库
        </div>
      )}
    </div>
  );
}

// ==================== 知识图谱 ====================
function KGTab({
  entities,
}: {
  entities: Array<{ name: string; type: string; degree: number; weightedDegree: number }>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">核心实体（按重要性排序）</p>
      {entities.length > 0 ? (
        <div className="space-y-2">
          {entities.map((e, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-void-200/50 border border-panel-border flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-neon-cyan/20 flex items-center justify-center text-neon-cyan text-sm font-bold">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm text-ink">{e.name}</div>
                <div className="text-xs text-ink-muted">类型: {e.type}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-neon-green">{e.degree}</div>
                <div className="text-xs text-ink-muted">关联数</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-ink-muted text-sm">
          <Network className="mx-auto mb-2 opacity-50" size={32} />
          知识图谱尚未初始化
        </div>
      )}
    </div>
  );
}

// ==================== AI 辩论 ====================
function DebateTab({
  active,
  rounds,
  consensus,
  prediction,
  onRunDebate,
}: {
  active: boolean;
  rounds: number;
  consensus: boolean;
  prediction: any;
  onRunDebate: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onRunDebate}
        className="w-full p-4 rounded-xl bg-neon-purple/10 border border-neon-purple/30 text-neon-purple text-sm hover:bg-neon-purple/20 transition-colors"
      >
        <MessageSquare size={18} className="inline mr-2" />
        启动多代理辩论
      </button>

      {active && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-void-200/50 border border-panel-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-ink">辩论状态</span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  consensus
                    ? "bg-neon-green/20 text-neon-green"
                    : "bg-neon-yellow/20 text-neon-yellow",
                )}
              >
                {consensus ? "已达成共识" : "未达成共识"}
              </span>
            </div>
            <div className="text-xs text-ink-muted">辩论轮次: {rounds}</div>
          </div>

          {prediction && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-neon-purple/10 to-neon-cyan/10 border border-neon-purple/30">
              <div className="text-xs text-ink-muted mb-1">辩论最终结论</div>
              <div className="text-xl font-bold text-ink">
                {prediction.direction === "up"
                  ? "看涨"
                  : prediction.direction === "down"
                    ? "看跌"
                    : "观望"}
              </div>
              <div className="text-xs text-ink-muted mt-1">
                置信度 {(prediction.confidence * 100).toFixed(1)}%
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-void-200/30 border border-panel-border/50">
            <p className="text-xs text-ink-muted mb-2">参与代理</p>
            <div className="grid grid-cols-2 gap-2">
              {["多头分析师", "空头分析师", "技术分析师", "风险控制员"].map((name) => (
                <div
                  key={name}
                  className="px-2 py-1.5 rounded-lg bg-void-300/50 text-xs text-ink text-center"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!active && (
        <div className="text-center py-8 text-ink-muted text-sm">
          <MessageSquare className="mx-auto mb-2 opacity-50" size={32} />
          点击上方按钮启动辩论
        </div>
      )}
    </div>
  );
}

// ==================== 自我意识 ====================
function SelfAwarenessTab({
  summary,
  reflections,
  onAddReflection,
}: {
  summary: {
    totalReflections: number;
    successRate: number;
    topBiases: string[];
    averageScore: number;
    recentTrend: string;
  };
  reflections: any[];
  onAddReflection: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onAddReflection}
        className="w-full p-3 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-sm hover:bg-neon-cyan/20 transition-colors"
      >
        <Search size={16} className="inline mr-1.5" />
        记录一次反思
      </button>

      {/* 统计摘要 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-void-200/50 border border-panel-border text-center">
          <div className="text-2xl font-bold text-neon-cyan">{summary.totalReflections}</div>
          <div className="text-xs text-ink-muted">反思次数</div>
        </div>
        <div className="p-3 rounded-xl bg-void-200/50 border border-panel-border text-center">
          <div className="text-2xl font-bold text-neon-green">
            {(summary.successRate * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-ink-muted">成功率</div>
        </div>
        <div className="p-3 rounded-xl bg-void-200/50 border border-panel-border text-center">
          <div className="text-2xl font-bold text-neon-yellow">
            {(summary.averageScore * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-ink-muted">平均质量分</div>
        </div>
        <div className="p-3 rounded-xl bg-void-200/50 border border-panel-border text-center">
          <div
            className={cn(
              "text-lg font-bold",
              summary.recentTrend === "improving"
                ? "text-neon-green"
                : summary.recentTrend === "declining"
                  ? "text-neon-red"
                  : "text-ink-muted",
            )}
          >
            {summary.recentTrend === "improving"
              ? "上升"
              : summary.recentTrend === "declining"
                ? "下降"
                : "稳定"}
          </div>
          <div className="text-xs text-ink-muted">近期趋势</div>
        </div>
      </div>

      {/* 常见偏差 */}
      {summary.topBiases.length > 0 && (
        <div className="p-3 rounded-xl bg-void-200/50 border border-panel-border">
          <p className="text-xs text-ink-muted mb-2">识别到的常见偏差</p>
          <div className="space-y-1">
            {summary.topBiases.map((b, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-neon-yellow"
              >
                <AlertTriangle size={12} />
                {b}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近反思 */}
      {reflections.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">最近反思记录</p>
          {reflections.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="p-3 rounded-xl bg-void-200/50 border border-panel-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    r.outcome === "success"
                      ? "bg-neon-green/20 text-neon-green"
                      : r.outcome === "failure"
                        ? "bg-neon-red/20 text-neon-red"
                        : "bg-neon-yellow/20 text-neon-yellow",
                  )}
                >
                  {r.outcome === "success"
                    ? "成功"
                    : r.outcome === "failure"
                      ? "失败"
                      : "部分成功"}
                </span>
                <span className="text-xs text-ink-muted">
                  质量分 {(r.critique.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm text-ink">{r.originalDecision}</p>
              {r.lessons.length > 0 && (
                <p className="text-xs text-ink-muted mt-1">
                  教训: {r.lessons[0]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== 设置 ====================
function SettingsTab({
  settings,
  onUpdate,
}: {
  settings: any;
  onUpdate: (key: string, value: any) => void;
}) {
  const toggleItems = [
    { key: "useHMM", label: "市场状态识别 (HMM)", desc: "自动识别趋势/震荡/高波动" },
    { key: "useDebate", label: "AI 多代理辩论", desc: "多视角辩论得出稳健结论" },
    { key: "useSelfAwareness", label: "自我意识模块", desc: "自我批评与反思学习" },
    { key: "useRAG", label: "RAG 知识检索", desc: "基于知识库增强决策" },
    { key: "useKnowledgeGraph", label: "知识图谱", desc: "实体关联与推理" },
    { key: "useOnlineLearning", label: "在线学习", desc: "实时更新模型" },
  ];

  return (
    <div className="space-y-4">
      {/* 模型选择 */}
      <div className="space-y-2">
        <p className="text-xs text-ink-muted font-medium">启用模型</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "logistic", label: "逻辑回归" },
            { key: "xgboost", label: "XGBoost" },
            { key: "lightgbm", label: "LightGBM" },
            { key: "catboost", label: "CatBoost" },
          ].map((m) => {
            const enabled = settings.enabledModels.includes(m.key);
            return (
              <button
                key={m.key}
                onClick={() => {
                  const current = settings.enabledModels as string[];
                  const next = enabled
                    ? current.filter((k) => k !== m.key)
                    : [...current, m.key];
                  onUpdate("enabledModels", next);
                }}
                className={cn(
                  "p-2 rounded-lg text-xs text-left transition-all",
                  enabled
                    ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40"
                    : "bg-void-200 text-ink-muted border border-panel-border hover:border-ink-muted",
                )}
              >
                {enabled ? <CheckCircle2 size={12} className="inline mr-1" /> : <XCircle size={12} className="inline mr-1" />}
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 集成方法 */}
      <div className="space-y-2">
        <p className="text-xs text-ink-muted font-medium">集成方法</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "weighted_voting", label: "加权投票" },
            { key: "voting", label: "多数投票" },
            { key: "averaging", label: "平均" },
            { key: "stacking", label: "Stacking" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => onUpdate("ensembleMethod", m.key)}
              className={cn(
                "p-2 rounded-lg text-xs transition-all",
                settings.ensembleMethod === m.key
                  ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40"
                  : "bg-void-200 text-ink-muted border border-panel-border hover:border-ink-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 功能开关 */}
      <div className="space-y-2">
        <p className="text-xs text-ink-muted font-medium">功能模块</p>
        {toggleItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-3 rounded-xl bg-void-200/50 border border-panel-border"
          >
            <div>
              <div className="text-sm text-ink">{item.label}</div>
              <div className="text-xs text-ink-muted">{item.desc}</div>
            </div>
            <button
              onClick={() => onUpdate(item.key, !settings[item.key])}
              className={cn(
                "w-11 h-6 rounded-full transition-all relative",
                settings[item.key] ? "bg-neon-cyan" : "bg-void-300",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                  settings[item.key] ? "left-5" : "left-0.5",
                )}
              />
            </button>
          </div>
        ))}
      </div>

      {/* 敏感词设置 */}
      <div className="space-y-2">
        <p className="text-xs text-ink-muted font-medium flex items-center gap-1.5">
          <ShieldAlert size={12} /> 敏感词检测模式
        </p>
        <div className="p-3 rounded-xl bg-void-200/50 border border-panel-border">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { key: "log_only", label: "仅日志" },
              { key: "notify_only", label: "提示不拦截" },
              { key: "full_pass", label: "完全放行" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => onUpdate("sensitiveMode", m.key)}
                className={cn(
                  "p-2 rounded-lg text-xs transition-all",
                  settings.sensitiveMode === m.key
                    ? "bg-neon-yellow/20 text-neon-yellow border border-neon-yellow/40"
                    : "bg-void-300 text-ink-muted border border-transparent hover:border-ink-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            当前模式：
            <span className="text-neon-yellow">
              {settings.sensitiveMode === "log_only"
                ? "仅在控制台输出警告日志，页面无提示"
                : settings.sensitiveMode === "notify_only"
                  ? "检测到敏感词时显示轻微提示横幅，不拦截任何操作"
                  : "完全关闭检测，不做任何处理"}
            </span>
          </p>
          <p className="text-xs text-neon-green mt-1">
            ✓ 所有模式均不拦截操作，仅做不同程度的提示
          </p>
        </div>
      </div>
    </div>
  );
}
