import { useState, useCallback, useEffect, useRef } from "react";
import { llmClient } from "@/lib/llm/llmClient";
import {
  Bot,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  MessageSquare,
  BarChart3,
  Settings,
  LayoutGrid,
  Users,
  Eye,
  Shield,
  Activity,
  FileText,
  ChevronRight,
  Power,
  Gauge,
  Layers,
  AlertCircle,
  Volume2,
  Bell,
  Sliders,
  TrendingUp,
  Target,
  Brain,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { useMultiAgentStore } from "@/store/useMultiAgentStore";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";
import { backgroundScheduler } from "@/lib/scheduler";
import type { AgentId } from "@/lib/agent/types";

const TABS = [
  { id: "overview", label: "总览", icon: LayoutGrid },
  { id: "agents", label: "代理管理", icon: Users },
  { id: "messages", label: "消息总线", icon: MessageSquare },
  { id: "results", label: "分析记录", icon: BarChart3 },
  { id: "settings", label: "系统设置", icon: Settings },
] as const;

const STATUS_META = {
  idle: { color: "text-ink-muted", bg: "bg-ink-muted/20", dot: "bg-ink-muted", label: "空闲" },
  processing: { color: "text-neon-cyan", bg: "bg-neon-cyan/15", dot: "bg-neon-cyan", label: "处理中" },
  busy: { color: "text-neon-yellow", bg: "bg-neon-yellow/15", dot: "bg-neon-yellow", label: "繁忙" },
  error: { color: "text-neon-red", bg: "bg-neon-red/15", dot: "bg-neon-red", label: "异常" },
};

const ROLE_COLORS: Record<string, string> = {
  "技术分析师": "text-neon-cyan",
  "链上分析师": "text-neon-blue",
  "新闻分析师": "text-neon-yellow",
  "情绪分析师": "text-neon-pink",
  "宏观分析师": "text-neon-purple",
  "策略研究员": "text-neon-orange",
  "回测工程师": "text-neon-green",
  "Risk Manager": "text-neon-red",
  "投资顾问": "text-neon-cyan",
  "Execution Agent": "text-neon-green",
  "Monitoring Agent": "text-neon-yellow",
  "绩效审核员": "text-neon-purple",
  "AI分析师": "text-neon-purple",
};

const AGENT_CATEGORIES = [
  { name: "分析类", ids: ["market-analyst", "onchain-analyst", "news-analyst", "sentiment-analyst", "macro-analyst", "llm-analyst"] },
  { name: "策略类", ids: ["strategy-researcher", "backtest-agent"] },
  { name: "执行类", ids: ["risk-manager", "investment-advisor", "execution-agent"] },
  { name: "监控类", ids: ["monitoring-agent", "performance-auditor"] },
];

export function MultiAgentPanel() {
  const {
    isInitialized,
    isRunning,
    activeTab,
    agents,
    messageLog,
    latestAnalysis,
    analysisHistory,
    combinedSignal,
    selectedAgentId,
    settings,
    initializeAgents,
    toggleAgent,
    setActiveTab,
    selectAgent,
    runAnalysis,
    toggleAutoRun,
    toggleAutoTrade,
    updateSetting,
    applyStrategyPreset,
    updateAgentWeight,
    signalHistory,
    lastAnalysisTime,
    updateLLMConfig,
  } = useMultiAgentStore();

  const [symbolInput, setSymbolInput] = useState("BTCUSDT");

  useEffect(() => {
    if (!isInitialized) {
      initializeAgents();
    }
  }, [isInitialized, initializeAgents]);

  useEffect(() => {
    backgroundScheduler.start();

    const runFn = () => {
      if (!isRunning && isInitialized && settings.autoRun) {
        runAnalysis(symbolInput);
      }
    };

    if (settings.autoRun) {
      backgroundScheduler.register("multi-agent-analysis", runFn, settings.runInterval);
    } else {
      backgroundScheduler.unregister("multi-agent-analysis");
    }

    return () => {
      backgroundScheduler.unregister("multi-agent-analysis");
    };
  }, [settings.autoRun, settings.runInterval, isRunning, isInitialized, runAnalysis, symbolInput]);

  const handleRunAnalysis = useCallback(() => {
    runAnalysis(symbolInput);
  }, [runAnalysis, symbolInput]);

  const enabledCount = agents.filter((a) => a.enabled).length;
  const processingCount = agents.filter((a) => a.status === "processing" || a.status === "busy").length;
  const errorCount = agents.filter((a) => a.status === "error").length;
  const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const avgResponseTime = agents.length > 0
    ? agents.reduce((sum, a) => sum + a.avgResponseTime, 0) / agents.length
    : 0;

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const renderOverview = () => (
    <div className="grid h-full grid-cols-12 gap-2">
      {/* 左侧：统计 + 控制 + 分类代理列表 */}
      <div className="col-span-4 flex min-h-0 flex-col gap-2">
        {/* 顶部统计卡片 */}
        <div className="grid grid-cols-2 gap-1.5 shrink-0">
          <StatCard
            icon={Users}
            label="活跃代理"
            value={`${enabledCount}/12`}
            color="cyan"
          />
          <StatCard
            icon={Activity}
            label="运行中"
            value={processingCount.toString()}
            color="yellow"
          />
          <StatCard
            icon={Zap}
            label="累计任务"
            value={totalTasks.toString()}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="平均响应"
            value={`${avgResponseTime.toFixed(0)}ms`}
            color="purple"
          />
        </div>

        {/* 分析控制区 */}
        <div className="shrink-0 rounded-lg border border-panel-border bg-void-100/50 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-neon-cyan" />
              <span className="font-mono text-[11px] text-ink">快速分析</span>
            </div>
            <button
              onClick={toggleAutoRun}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] transition-all",
                settings.autoRun
                  ? "bg-neon-green/20 text-neon-green"
                  : "bg-void-200 text-ink-muted hover:text-ink",
              )}
            >
              {settings.autoRun ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
              {settings.autoRun ? "自动中" : "自动"}
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              placeholder="交易对"
              className="flex-1 rounded border border-panel-border bg-void px-2 py-1 font-mono text-[11px] text-ink placeholder-ink-muted focus:border-neon-cyan/50 focus:outline-none"
            />
            <button
              onClick={handleRunAnalysis}
              disabled={isRunning}
              className="flex items-center gap-1 rounded bg-neon-cyan/20 px-2.5 py-1 font-mono text-[11px] text-neon-cyan transition-all hover:bg-neon-cyan/30 disabled:opacity-50"
            >
              {isRunning ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              {isRunning ? "分析中" : "运行"}
            </button>
          </div>
        </div>

        {/* 分类代理列表 */}
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-0.5">
          {AGENT_CATEGORIES.map((cat) => (
            <div key={cat.name} className="rounded-lg border border-panel-border bg-void-100/30">
              <div className="flex items-center gap-1.5 border-b border-panel-border/50 px-2 py-1.5">
                <Layers className="h-3 w-3 text-neon-cyan/70" />
                <span className="font-mono text-[10px] text-ink-muted">{cat.name}</span>
                <span className="ml-auto font-mono text-[9px] text-ink-muted/70">
                  {cat.ids.filter((id) => agents.find((a) => a.id === id)?.enabled).length}/{cat.ids.length}
                </span>
              </div>
              <div className="p-1.5 flex flex-col gap-1">
                {cat.ids.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  if (!agent) return null;
                  const statusMeta = STATUS_META[agent.status];
                  return (
                    <button
                      key={agent.id}
                      onClick={() => selectAgent(agent.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all",
                        agent.enabled
                          ? "hover:bg-void-200/70"
                          : "opacity-40",
                        selectedAgentId === agent.id && "bg-neon-cyan/10 ring-1 ring-neon-cyan/30",
                      )}
                    >
                      <span className="text-base leading-none">{agent.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10.5px] text-ink truncate">{agent.name}</div>
                        <div className={cn("font-mono text-[9px]", ROLE_COLORS[agent.role] || "text-ink-muted")}>
                          {agent.role}
                        </div>
                      </div>
                      <div className={cn("h-2 w-2 shrink-0 rounded-full", statusMeta.dot)} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 中间：代理状态网格 + 最新分析 */}
      <div className="col-span-5 flex min-h-0 flex-col gap-2">
        {/* 代理状态大网格 */}
        <div className="rounded-lg border border-panel-border bg-void-100/30 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-neon-cyan" />
            <span className="font-mono text-[11px] text-ink">代理状态面板</span>
            <span className="ml-auto font-mono text-[9px] text-ink-muted">
              点击查看详情
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {agents.map((agent) => {
              const statusMeta = STATUS_META[agent.status];
              return (
                <button
                  key={agent.id}
                  onClick={() => selectAgent(agent.id)}
                  className={cn(
                    "group relative flex flex-col items-center rounded-lg border p-2 transition-all",
                    agent.enabled
                      ? "border-panel-border bg-void-100/60 hover:border-neon-cyan/40 hover:bg-void-100"
                      : "border-panel-border/30 bg-void/30 opacity-40",
                    selectedAgentId === agent.id && "border-neon-cyan/50 bg-neon-cyan/5 ring-1 ring-neon-cyan/20",
                  )}
                >
                  <span className="text-xl leading-none">{agent.icon}</span>
                  <div className="mt-1 font-mono text-[9.5px] text-ink text-center leading-tight truncate w-full">
                    {agent.name.replace("代理", "").replace("分析", "")}
                  </div>
                  <div className={cn("mt-1 flex items-center gap-1 font-mono text-[8.5px]", statusMeta.color)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                    {statusMeta.label}
                  </div>
                  {agent.tasksCompleted > 0 && (
                    <div className="mt-1 font-mono text-[8px] text-ink-muted/70">
                      {agent.tasksCompleted} 任务
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 综合信号面板 */}
        <div className="flex-1 min-h-0 rounded-lg border border-panel-border bg-void-100/30 flex flex-col">
          <div className="flex items-center gap-1.5 border-b border-panel-border/50 px-2.5 py-1.5 shrink-0">
            <Gauge className="h-3.5 w-3.5 text-neon-cyan" />
            <span className="font-mono text-[11px] text-ink">综合交易信号</span>
            {analysisHistory[0] && (
              <span className="ml-auto font-mono text-[9px] text-ink-muted">
                {new Date(analysisHistory[0].time).toLocaleTimeString()}
              </span>
            )}
            {settings.autoTrade && (
              <span className="ml-1 flex items-center gap-1 rounded bg-neon-green/15 px-1.5 py-0.5 font-mono text-[9px] text-neon-green">
                <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" />
                自动交易
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2.5">
            {!combinedSignal ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Gauge className="mb-2 h-10 w-10 text-ink-muted/30" />
                <p className="font-mono text-[11px] text-ink-muted/70">暂无信号</p>
                <p className="mt-1 font-mono text-[10px] text-ink-muted/50">点击"运行"开始多代理协作分析</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 方向指示 */}
                <div className={cn(
                  "rounded-lg p-4 text-center",
                  combinedSignal.direction === "long"
                    ? "bg-neon-green/10 border border-neon-green/30"
                    : combinedSignal.direction === "short"
                    ? "bg-neon-red/10 border border-neon-red/30"
                    : "bg-void-200/50 border border-panel-border",
                )}>
                  <div className={cn(
                    "font-mono text-3xl font-bold",
                    combinedSignal.direction === "long" ? "text-neon-green" :
                    combinedSignal.direction === "short" ? "text-neon-red" : "text-ink-muted",
                  )}>
                    {combinedSignal.direction === "long" ? "做多" :
                     combinedSignal.direction === "short" ? "做空" : "观望"}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-ink-muted">
                    信号强度 {(combinedSignal.strength * 100).toFixed(0)}%
                  </div>
                  {combinedSignal.shouldTrade ? (
                    <div className="mt-2 inline-flex items-center gap-1 rounded bg-neon-cyan/20 px-2 py-0.5 font-mono text-[10px] text-neon-cyan">
                      <Zap className="h-3 w-3" />
                      可交易
                    </div>
                  ) : (
                    <div className="mt-2 inline-flex items-center gap-1 rounded bg-ink-muted/10 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
                      <Shield className="h-3 w-3" />
                      信号不足，建议观望
                    </div>
                  )}
                </div>

                {/* 关键指标 */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-md bg-void/40 p-2">
                    <div className="font-mono text-[9px] text-ink-muted">置信度</div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <div className="flex-1 h-1.5 rounded-full bg-void-200">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            combinedSignal.confidence >= 0.7 ? "bg-neon-green" :
                            combinedSignal.confidence >= 0.5 ? "bg-neon-yellow" : "bg-neon-red",
                          )}
                          style={{ width: `${(combinedSignal.confidence * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-ink">
                        {(combinedSignal.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="rounded-md bg-void/40 p-2">
                    <div className="font-mono text-[9px] text-ink-muted">风险等级</div>
                    <div className={cn(
                      "mt-0.5 font-mono text-[11px]",
                      combinedSignal.riskLevel === "low" ? "text-neon-green" :
                      combinedSignal.riskLevel === "high" ? "text-neon-red" : "text-neon-yellow",
                    )}>
                      {combinedSignal.riskLevel === "low" ? "低风险" :
                       combinedSignal.riskLevel === "high" ? "高风险" : "中风险"}
                    </div>
                  </div>
                  <div className="rounded-md bg-void/40 p-2">
                    <div className="font-mono text-[9px] text-ink-muted">建议杠杆</div>
                    <div className="mt-0.5 font-mono text-[11px] text-neon-cyan">
                      {combinedSignal.recommendedLeverage}x
                    </div>
                  </div>
                  <div className="rounded-md bg-void/40 p-2">
                    <div className="font-mono text-[9px] text-ink-muted">多空投票</div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px]">
                      <span className="text-neon-green">{combinedSignal.bullishVotes}多</span>
                      <span className="text-ink-muted">/</span>
                      <span className="text-neon-red">{combinedSignal.bearishVotes}空</span>
                      <span className="text-ink-muted">/</span>
                      <span className="text-ink-muted">{combinedSignal.neutralVotes}中</span>
                    </div>
                  </div>
                </div>

                {/* 交易参数 */}
                {combinedSignal.direction !== "neutral" && (
                  <div className="rounded-md bg-void/40 p-2.5">
                    <div className="mb-1.5 font-mono text-[10px] text-ink-muted">交易参数建议</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {combinedSignal.entryZone && (
                        <div>
                          <div className="font-mono text-[9px] text-ink-muted">入场区间</div>
                          <div className="font-mono text-[10px] text-ink">
                            {combinedSignal.entryZone.lower.toFixed(2)} ~ {combinedSignal.entryZone.upper.toFixed(2)}
                          </div>
                        </div>
                      )}
                      {combinedSignal.stopLoss && (
                        <div>
                          <div className="font-mono text-[9px] text-ink-muted">止损</div>
                          <div className="font-mono text-[10px] text-neon-red">
                            {combinedSignal.stopLoss.toFixed(2)}
                          </div>
                        </div>
                      )}
                      {combinedSignal.takeProfit && (
                        <div>
                          <div className="font-mono text-[9px] text-ink-muted">止盈</div>
                          <div className="font-mono text-[10px] text-neon-green">
                            {combinedSignal.takeProfit.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 五维雷达图 */}
                <div>
                  <div className="mb-1.5 font-mono text-[10px] text-ink-muted">五维信号雷达</div>
                  <div className="flex justify-center">
                    {(() => {
                      const dims = [
                        { label: "技术面", key: "technical" },
                        { label: "链上数据", key: "onchain" },
                        { label: "情绪面", key: "sentiment" },
                        { label: "基本面", key: "fundamental" },
                        { label: "新闻事件", key: "news" },
                      ];
                      const dimMap: Record<string, number> = {
                        technical: 0,
                        onchain: 0,
                        sentiment: 0,
                        fundamental: 0,
                        news: 0,
                      };
                      for (const sig of combinedSignal.signals) {
                        const val = sig.strength * (sig.direction === "long" ? 1 : sig.direction === "short" ? -1 : 0) * 0.5 + 0.5;
                        if (sig.agentId === "market-analyst" || sig.agentId === "strategy-researcher" || sig.agentId === "backtest-agent") {
                          dimMap.technical = Math.max(dimMap.technical, val);
                        } else if (sig.agentId === "onchain-analyst") {
                          dimMap.onchain = val;
                        } else if (sig.agentId === "sentiment-analyst") {
                          dimMap.sentiment = val;
                        } else if (sig.agentId === "macro-analyst" || sig.agentId === "investment-advisor") {
                          dimMap.fundamental = Math.max(dimMap.fundamental, val);
                        } else if (sig.agentId === "news-analyst") {
                          dimMap.news = val;
                        }
                      }
                      const size = 160;
                      const cx = size / 2;
                      const cy = size / 2;
                      const r = 60;
                      const points = dims.map((d, i) => {
                        const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                        const val = dimMap[d.key] || 0.3;
                        const pr = r * val;
                        return {
                          x: cx + pr * Math.cos(angle),
                          y: cy + pr * Math.sin(angle),
                        };
                      });
                      const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
                      const gridLevels = [0.25, 0.5, 0.75, 1];
                      const axisPoints = dims.map((_, i) => {
                        const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
                      });
                      const labelPoints = dims.map((d, i) => {
                        const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                        const lr = r + 14;
                        return {
                          x: cx + lr * Math.cos(angle),
                          y: cy + lr * Math.sin(angle),
                          label: d.label,
                        };
                      });
                      return (
                        <svg width={size} height={size}>
                          {gridLevels.map((lv, i) => {
                            const pts = dims
                              .map((_, j) => {
                                const angle = (Math.PI * 2 * j) / dims.length - Math.PI / 2;
                                const pr = r * lv;
                                return `${cx + pr * Math.cos(angle)},${cy + pr * Math.sin(angle)}`;
                              })
                              .join(" ");
                            return (
                              <polygon
                                key={i}
                                points={pts}
                                fill="none"
                                stroke="rgba(255,255,255,0.08)"
                                strokeWidth="1"
                              />
                            );
                          })}
                          {axisPoints.map((p, i) => (
                            <line
                              key={i}
                              x1={cx}
                              y1={cy}
                              x2={p.x}
                              y2={p.y}
                              stroke="rgba(255,255,255,0.06)"
                              strokeWidth="1"
                            />
                          ))}
                          <polygon
                            points={polyPoints}
                            fill={combinedSignal.direction === "long" ? "rgba(0,255,136,0.25)" : combinedSignal.direction === "short" ? "rgba(255,71,87,0.25)" : "rgba(0,212,255,0.2)"}
                            stroke={combinedSignal.direction === "long" ? "#00ff88" : combinedSignal.direction === "short" ? "#ff4757" : "#00d4ff"}
                            strokeWidth="1.5"
                          />
                          {points.map((p, i) => (
                            <circle
                              key={i}
                              cx={p.x}
                              cy={p.y}
                              r="3"
                              fill={combinedSignal.direction === "long" ? "#00ff88" : combinedSignal.direction === "short" ? "#ff4757" : "#00d4ff"}
                            />
                          ))}
                          {labelPoints.map((p, i) => (
                            <text
                              key={i}
                              x={p.x}
                              y={p.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="rgba(255,255,255,0.5)"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              {p.label}
                            </text>
                          ))}
                        </svg>
                      );
                    })()}
                  </div>
                </div>

                {/* 各代理信号 */}
                <div>
                  <div className="mb-1.5 font-mono text-[10px] text-ink-muted">各代理信号</div>
                  <div className="space-y-1">
                    {combinedSignal.signals.map((sig) => (
                      <div key={sig.agentId} className="flex items-center gap-2 rounded-md bg-void/30 px-2 py-1.5">
                        <span className="font-mono text-[10px] text-ink w-16 shrink-0">{sig.agentName}</span>
                        <div className={cn(
                          "w-10 text-center rounded font-mono text-[9px] py-0.5 shrink-0",
                          sig.direction === "long" ? "bg-neon-green/20 text-neon-green" :
                          sig.direction === "short" ? "bg-neon-red/20 text-neon-red" :
                          "bg-ink-muted/10 text-ink-muted",
                        )}>
                          {sig.direction === "long" ? "多" : sig.direction === "short" ? "空" : "中"}
                        </div>
                        <div className="flex-1 h-1 rounded-full bg-void-200">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              sig.direction === "long" ? "bg-neon-green" :
                              sig.direction === "short" ? "bg-neon-red" : "bg-ink-muted",
                            )}
                            style={{ width: `${(sig.strength * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-ink-muted w-10 text-right shrink-0">
                          {(sig.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 总结 */}
                <div className="rounded-md bg-neon-cyan/5 border border-neon-cyan/20 p-2">
                  <div className="font-mono text-[10px] text-neon-cyan">{combinedSignal.summary}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧：选中代理详情 */}
      <div className="col-span-3 flex min-h-0 flex-col">
        <div className="flex-1 min-h-0 rounded-lg border border-panel-border bg-void-100/30 flex flex-col">
          <div className="flex items-center gap-1.5 border-b border-panel-border/50 px-2.5 py-1.5 shrink-0">
            <Eye className="h-3.5 w-3.5 text-neon-cyan" />
            <span className="font-mono text-[11px] text-ink">代理详情</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5">
            {!selectedAgent ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Bot className="mb-2 h-8 w-8 text-ink-muted/30" />
                <p className="font-mono text-[11px] text-ink-muted/70">选择一个代理</p>
                <p className="mt-1 font-mono text-[10px] text-ink-muted/50">查看详细信息和指标</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 代理头部 */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-void-200/60 text-2xl">
                    {selectedAgent.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] text-ink">{selectedAgent.name}</div>
                    <div className={cn("font-mono text-[10px]", ROLE_COLORS[selectedAgent.role] || "text-ink-muted")}>
                      {selectedAgent.role}
                    </div>
                  </div>
                  <span className={cn(
                    "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px]",
                    STATUS_META[selectedAgent.status].bg,
                    STATUS_META[selectedAgent.status].color,
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[selectedAgent.status].dot)} />
                    {STATUS_META[selectedAgent.status].label}
                  </span>
                </div>

                {/* 描述 */}
                <p className="font-mono text-[10.5px] text-ink-muted leading-relaxed">
                  {selectedAgent.description}
                </p>

                {/* 开关 */}
                <div className="flex items-center justify-between rounded-md bg-void/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <Power className="h-3.5 w-3.5 text-ink-muted" />
                    <span className="font-mono text-[10.5px] text-ink">启用代理</span>
                  </div>
                  <button
                    onClick={() => toggleAgent(selectedAgent.id)}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      selectedAgent.enabled ? "bg-neon-cyan" : "bg-void-200",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                        selectedAgent.enabled ? "left-4" : "left-0.5",
                      )}
                    />
                  </button>
                </div>

                {/* 性能指标 */}
                <div className="space-y-2">
                  <div className="font-mono text-[10px] text-ink-muted">性能指标</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <MetricItem icon={Zap} label="完成任务" value={selectedAgent.tasksCompleted.toString()} color="green" />
                    <MetricItem icon={Clock} label="平均响应" value={`${selectedAgent.avgResponseTime.toFixed(0)}ms`} color="cyan" />
                    <MetricItem icon={Shield} label="错误率" value={`${(selectedAgent.errorRate * 100).toFixed(1)}%`} color="red" />
                    <MetricItem icon={Activity} label="最后活跃" value={selectedAgent.lastActiveAt > 0 ? "刚刚" : "—"} color="yellow" />
                  </div>
                </div>

                {/* 最近结果 */}
                {selectedAgent.lastResult && (
                  <div className="space-y-1.5">
                    <div className="font-mono text-[10px] text-ink-muted">最近输出</div>
                    <div className="rounded-md bg-void/40 p-2 font-mono text-[10px] text-ink break-all max-h-32 overflow-y-auto">
                      {JSON.stringify(selectedAgent.lastResult.data, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAgents = () => (
    <div className="h-full flex flex-col gap-2">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-2 rounded-lg border border-panel-border bg-void-100/30 px-2.5 py-2">
        <Users className="h-4 w-4 text-neon-cyan" />
        <span className="font-mono text-[12px] text-ink">代理管理</span>
        <span className="font-mono text-[10px] text-ink-muted">共 {agents.length} 个代理</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] text-ink-muted">已启用 {enabledCount}</span>
          <span className={cn("font-mono text-[10px]", processingCount > 0 ? "text-neon-yellow" : "text-ink-muted")}>
            运行中 {processingCount}
          </span>
          {errorCount > 0 && (
            <span className="font-mono text-[10px] text-neon-red">异常 {errorCount}</span>
          )}
        </div>
      </div>

      {/* 代理卡片网格 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {agents.map((agent) => {
            const statusMeta = STATUS_META[agent.status];
            return (
              <div
                key={agent.id}
                className={cn(
                  "rounded-lg border transition-all",
                  agent.enabled
                    ? "border-panel-border bg-void-100/40 hover:border-neon-cyan/30"
                    : "border-panel-border/30 bg-void/20 opacity-50",
                )}
              >
                <div className="p-3">
                  {/* 头部 */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-void-200/60 text-xl">
                      {agent.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] text-ink">{agent.name}</span>
                      </div>
                      <div className={cn("mt-0.5 font-mono text-[10px]", ROLE_COLORS[agent.role] || "text-ink-muted")}>
                        {agent.role}
                      </div>
                    </div>
                    <span className={cn(
                      "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] shrink-0",
                      statusMeta.bg,
                      statusMeta.color,
                    )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* 描述 */}
                  <p className="mt-2 font-mono text-[10.5px] text-ink-muted/80 leading-relaxed line-clamp-2">
                    {agent.description}
                  </p>

                  {/* 指标 */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1">
                    <div className="rounded bg-void/30 p-1.5 text-center">
                      <div className="font-mono text-[11px] text-neon-green">{agent.tasksCompleted}</div>
                      <div className="font-mono text-[8.5px] text-ink-muted">任务</div>
                    </div>
                    <div className="rounded bg-void/30 p-1.5 text-center">
                      <div className="font-mono text-[11px] text-neon-cyan">{agent.avgResponseTime.toFixed(0)}ms</div>
                      <div className="font-mono text-[8.5px] text-ink-muted">响应</div>
                    </div>
                    <div className="rounded bg-void/30 p-1.5 text-center">
                      <div className="font-mono text-[11px] text-neon-red">{(agent.errorRate * 100).toFixed(0)}%</div>
                      <div className="font-mono text-[8.5px] text-ink-muted">错误</div>
                    </div>
                  </div>

                  {/* 底部操作 */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-panel-border/50 pt-2">
                    <button className="flex items-center gap-1 font-mono text-[10px] text-ink-muted hover:text-neon-cyan transition-colors">
                      <ChevronRight className="h-3 w-3" />
                      查看详情
                    </button>
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        agent.enabled ? "bg-neon-cyan" : "bg-void-200",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                          agent.enabled ? "left-4" : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderMessages = () => (
    <div className="h-full flex flex-col gap-2">
      <div className="shrink-0 flex items-center gap-2 rounded-lg border border-panel-border bg-void-100/30 px-2.5 py-2">
        <MessageSquare className="h-4 w-4 text-neon-cyan" />
        <span className="font-mono text-[12px] text-ink">消息总线</span>
        <span className="font-mono text-[10px] text-ink-muted">{messageLog.length} 条消息</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1 font-mono text-[9px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" /> 请求
          </span>
          <span className="flex items-center gap-1 font-mono text-[9px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-green" /> 响应
          </span>
          <span className="flex items-center gap-1 font-mono text-[9px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-yellow" /> 事件
          </span>
          <span className="flex items-center gap-1 font-mono text-[9px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-red" /> 错误
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-panel-border bg-void-100/20">
        {messageLog.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare className="mb-2 h-10 w-10 text-ink-muted/20" />
            <p className="font-mono text-[12px] text-ink-muted/60">暂无消息记录</p>
            <p className="mt-1 font-mono text-[10px] text-ink-muted/40">运行分析后将显示代理间通信消息</p>
          </div>
        ) : (
          <div className="divide-y divide-panel-border/50">
            {messageLog.map((msg) => {
              const typeColor = msg.type === "error" ? "neon-red" :
                msg.type === "response" ? "neon-green" :
                msg.type === "event" ? "neon-yellow" : "neon-cyan";
              return (
                <div key={msg.id} className="px-3 py-2 hover:bg-void-100/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-mono text-[10.5px] text-", typeColor)}>{msg.from}</span>
                    <ChevronRight className="h-3 w-3 text-ink-muted/50" />
                    <span className="font-mono text-[10.5px] text-neon-yellow">{msg.to}</span>
                    <span className="ml-auto font-mono text-[9.5px] text-ink-muted/70">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded bg-void-200/60 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-muted">
                      {msg.topic}
                    </span>
                    <span className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[9px] bg-",
                      typeColor,
                      "/15 text-",
                      typeColor,
                    )}>
                      {msg.type}
                    </span>
                    {msg.priority === "high" && (
                      <span className="rounded bg-neon-orange/15 px-1.5 py-0.5 font-mono text-[9px] text-neon-orange">
                        高优先级
                      </span>
                    )}
                    {msg.priority === "critical" && (
                      <span className="rounded bg-neon-red/15 px-1.5 py-0.5 font-mono text-[9px] text-neon-red">
                        紧急
                      </span>
                    )}
                  </div>
                  {Object.keys(msg.payload || {}).length > 0 && (
                    <div className="mt-1.5 rounded bg-void/40 p-1.5 font-mono text-[9.5px] text-ink-muted/80 max-h-16 overflow-y-auto">
                      {JSON.stringify(msg.payload).slice(0, 200)}
                      {JSON.stringify(msg.payload).length > 200 && "..."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="h-full flex flex-col gap-2">
      <div className="shrink-0 flex items-center gap-2 rounded-lg border border-panel-border bg-void-100/30 px-2.5 py-2">
        <FileText className="h-4 w-4 text-neon-cyan" />
        <span className="font-mono text-[12px] text-ink">分析记录</span>
        <span className="font-mono text-[10px] text-ink-muted">{analysisHistory.length} 条记录</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {analysisHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <BarChart3 className="mb-2 h-10 w-10 text-ink-muted/20" />
            <p className="font-mono text-[12px] text-ink-muted/60">暂无分析记录</p>
            <p className="mt-1 font-mono text-[10px] text-ink-muted/40">点击"运行分析"开始多代理协作分析</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {analysisHistory.map((entry, index) => (
              <div key={index} className="rounded-lg border border-panel-border bg-void-100/30 p-3 hover:border-neon-cyan/30 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neon-cyan/10">
                    <span className="font-mono text-[10px] text-neon-cyan">#{analysisHistory.length - index}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] text-ink">综合分析报告</div>
                    <div className="font-mono text-[9.5px] text-ink-muted">
                      {new Date(entry.time).toLocaleString()}
                    </div>
                  </div>
                  {entry.result.confidence !== undefined && (
                    <div className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[10px]",
                      entry.result.confidence >= 0.7
                        ? "bg-neon-green/15 text-neon-green"
                        : entry.result.confidence >= 0.5
                        ? "bg-neon-yellow/15 text-neon-yellow"
                        : "bg-neon-red/15 text-neon-red",
                    )}>
                      {(entry.result.confidence * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {Object.entries(entry.result.data || {}).slice(0, 4).map(([key, value]) => (
                    <div key={key} className="rounded bg-void/40 p-1.5 min-w-0">
                      <div className="font-mono text-[9px] text-ink-muted truncate">{key}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-ink truncate">
                        {typeof value === "object"
                          ? Object.keys(value).length + " 项数据"
                          : String(value).slice(0, 20)}
                      </div>
                    </div>
                  ))}
                </div>
                {entry.result.sources && entry.result.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-panel-border/50 pt-2">
                    {entry.result.sources.slice(0, 4).map((src) => (
                      <span key={src} className="rounded bg-void-200/50 px-1.5 py-0.5 font-mono text-[8.5px] text-ink-muted">
                        {src}
                      </span>
                    ))}
                    {entry.result.sources.length > 4 && (
                      <span className="rounded bg-void-200/50 px-1.5 py-0.5 font-mono text-[8.5px] text-ink-muted">
                        +{entry.result.sources.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="h-full flex items-start justify-center overflow-y-auto py-6">
      <div className="w-full max-w-2xl space-y-3">
        {/* 策略模板 */}
        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-neon-purple" />
            <span className="font-mono text-[12px] text-ink">策略模板</span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {(
              [
                { id: "conservative", name: "保守", color: "neon-green" },
                { id: "moderate", name: "稳健", color: "neon-cyan" },
                { id: "aggressive", name: "激进", color: "neon-yellow" },
                { id: "trend", name: "趋势", color: "neon-purple" },
                { id: "reversal", name: "反转", color: "neon-red" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => applyStrategyPreset(p.id)}
                className={cn(
                  "rounded-md border px-2 py-2 font-mono text-[10px] transition-all",
                  settings.strategyPreset === p.id
                    ? `border-${p.color} bg-${p.color}/10 text-${p.color}`
                    : "border-panel-border bg-void/50 text-ink-muted hover:border-ink-muted/40",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-2 font-mono text-[9.5px] text-ink-muted/70">
            当前: {settings.strategyPreset === "conservative" ? "保守型 - 高置信度低杠杆" :
              settings.strategyPreset === "moderate" ? "稳健型 - 平衡收益风险" :
              settings.strategyPreset === "aggressive" ? "激进型 - 低门槛高杠杆" :
              settings.strategyPreset === "trend" ? "趋势跟踪 - 技术面主导" :
              "反转交易 - 情绪+基本面"}
          </div>
        </div>

        {/* 代理权重配置 */}
        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-neon-cyan" />
            <span className="font-mono text-[12px] text-ink">代理权重</span>
            {settings.riskManagement.dynamicWeights && (
              <span className="ml-1 flex items-center gap-1 rounded bg-neon-green/15 px-1.5 py-0.5 font-mono text-[9px] text-neon-green">
                <RefreshCw className="h-3 w-3" />
                动态调整
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {agents
              .filter((a) => settings.enabledAgents.includes(a.id))
              .slice(0, 8)
              .map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 font-mono text-[10px] text-ink truncate">
                    {a.name.replace("代理", "")}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={settings.agentWeights[a.id] ?? 0.1}
                    onChange={(e) => updateAgentWeight(a.id, Number(e.target.value))}
                    className="flex-1 accent-neon-cyan"
                  />
                  <span className="w-10 text-right font-mono text-[10px] text-neon-cyan">
                    {Math.round((settings.agentWeights[a.id] ?? 0.1) * 100)}%
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* 风险控制 */}
        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-neon-red" />
            <span className="font-mono text-[12px] text-ink">风险控制</span>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">最大持仓数</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">同时持有的最大仓位数量</div>
              </div>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.riskManagement.maxOpenPositions}
                onChange={(e) =>
                  updateSetting("riskManagement", {
                    ...settings.riskManagement,
                    maxOpenPositions: Math.max(1, Math.min(10, Number(e.target.value))),
                  })
                }
                className="w-16 rounded border border-panel-border bg-void px-2 py-1 font-mono text-[11px] text-ink text-right focus:border-neon-red/50 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">最大日亏损 (%)</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">单日亏损达到则停止自动交易</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={settings.riskManagement.maxDailyLossPercent}
                  onChange={(e) =>
                    updateSetting("riskManagement", {
                      ...settings.riskManagement,
                      maxDailyLossPercent: Number(e.target.value),
                    })
                  }
                  className="w-24 accent-neon-red"
                />
                <span className="w-8 text-right font-mono text-[10px] text-neon-red">
                  {settings.riskManagement.maxDailyLossPercent}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">动态权重调整</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">根据历史准确率自动调整权重</div>
              </div>
              <button
                onClick={() =>
                  updateSetting("riskManagement", {
                    ...settings.riskManagement,
                    dynamicWeights: !settings.riskManagement.dynamicWeights,
                  })
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.riskManagement.dynamicWeights ? "bg-neon-green" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.riskManagement.dynamicWeights ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 通知提醒 */}
        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-neon-yellow" />
            <span className="font-mono text-[12px] text-ink">通知提醒</span>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 text-ink-muted" />
                <div>
                  <div className="font-mono text-[11px] text-ink">声音提醒</div>
                  <div className="font-mono text-[9.5px] text-ink-muted/70">信号触发时播放提示音</div>
                </div>
              </div>
              <button
                onClick={() =>
                  updateSetting("notifications", {
                    ...settings.notifications,
                    soundEnabled: !settings.notifications.soundEnabled,
                  })
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.notifications.soundEnabled ? "bg-neon-yellow" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.notifications.soundEnabled ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-ink-muted" />
                <div>
                  <div className="font-mono text-[11px] text-ink">浏览器通知</div>
                  <div className="font-mono text-[9.5px] text-ink-muted/70">强信号和交易时推送通知</div>
                </div>
              </div>
              <button
                onClick={() =>
                  updateSetting("notifications", {
                    ...settings.notifications,
                    browserEnabled: !settings.notifications.browserEnabled,
                  })
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.notifications.browserEnabled ? "bg-neon-cyan" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.notifications.browserEnabled ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">仅强信号通知</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">只在高强度信号时提醒</div>
              </div>
              <button
                onClick={() =>
                  updateSetting("notifications", {
                    ...settings.notifications,
                    strongSignalOnly: !settings.notifications.strongSignalOnly,
                  })
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.notifications.strongSignalOnly ? "bg-neon-green" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.notifications.strongSignalOnly ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        {/* AI 大模型设置 */}
        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-neon-purple" />
            <span className="font-mono text-[12px] text-ink">AI 大模型分析</span>
            <button
              onClick={() => updateLLMConfig({ enabled: !settings.llm.enabled })}
              className={cn(
                "ml-auto relative h-5 w-9 rounded-full transition-colors",
                settings.llm.enabled ? "bg-neon-purple" : "bg-void-200",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                  settings.llm.enabled ? "left-4" : "left-0.5",
                )}
              />
            </button>
          </div>

          {settings.llm.enabled && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="font-mono text-[11px] text-ink-muted mb-1.5">模型提供商</div>
                <div className="grid grid-cols-5 gap-1">
                  {(
                    [
                      { id: "deepseek", name: "DeepSeek" },
                      { id: "openai", name: "GPT" },
                      { id: "qwen", name: "通义" },
                      { id: "claude", name: "Claude" },
                      { id: "ollama", name: "本地" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => updateLLMConfig({ provider: p.id })}
                      className={cn(
                        "rounded-md border px-1 py-1.5 font-mono text-[9.5px] transition-all",
                        settings.llm.provider === p.id
                          ? "border-neon-purple/50 bg-neon-purple/10 text-neon-purple"
                          : "border-panel-border text-ink-muted hover:border-ink-muted/30",
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {settings.llm.provider !== "ollama" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] text-ink-muted">API Key</span>
                    <KeyRound className="h-3 w-3 text-ink-muted/50" />
                  </div>
                  <input
                    type="password"
                    value={settings.llm.apiKey}
                    onChange={(e) => updateLLMConfig({ apiKey: e.target.value })}
                    placeholder="输入 API Key..."
                    className="w-full rounded-md border border-panel-border bg-void/50 px-2.5 py-2 font-mono text-[11px] text-ink placeholder:text-ink-muted/40 focus:border-neon-purple/40 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <div className="font-mono text-[11px] text-ink-muted mb-1.5">模型名称</div>
                <input
                  type="text"
                  value={settings.llm.model}
                  onChange={(e) => updateLLMConfig({ model: e.target.value })}
                  className="w-full rounded-md border border-panel-border bg-void/50 px-2.5 py-2 font-mono text-[11px] text-ink placeholder:text-ink-muted/40 focus:border-neon-purple/40 focus:outline-none"
                />
              </div>

              {settings.llm.provider !== "ollama" && (
                <div>
                  <div className="font-mono text-[11px] text-ink-muted mb-1.5">API 地址</div>
                  <input
                    type="text"
                    value={settings.llm.baseUrl}
                    onChange={(e) => updateLLMConfig({ baseUrl: e.target.value })}
                    className="w-full rounded-md border border-panel-border bg-void/50 px-2.5 py-2 font-mono text-[11px] text-ink placeholder:text-ink-muted/40 focus:border-neon-purple/40 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] text-ink-muted">温度</span>
                    <span className="font-mono text-[10px] text-neon-purple">
                      {settings.llm.temperature.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.llm.temperature}
                    onChange={(e) => updateLLMConfig({ temperature: parseFloat(e.target.value) })}
                    className="w-full accent-neon-purple"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] text-ink-muted">最大token</span>
                    <span className="font-mono text-[10px] text-neon-purple">
                      {settings.llm.maxTokens}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="8000"
                    step="500"
                    value={settings.llm.maxTokens}
                    onChange={(e) => updateLLMConfig({ maxTokens: parseInt(e.target.value) })}
                    className="w-full accent-neon-purple"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-md bg-neon-purple/5 px-2 py-1.5">
                <Sparkles className="h-3 w-3 text-neon-purple" />
                <span className="font-mono text-[9.5px] text-ink-muted">
                  开启后 AI 将参与市场分析，提供更智能的决策建议
                </span>
              </div>

              {/* 测试连接按钮 */}
              {settings.llm.apiKey && (
                <button
                  onClick={async () => {
                    const btn = document.getElementById("llm-test-btn");
                    if (btn) btn.textContent = "测试中...";
                    try {
                      const res = await llmClient.analyze("请用中文回复'连接成功'", "你是一个测试助手");
                      if (btn) btn.textContent = `✓ 成功 (${res.content.slice(0, 30)})`;
                      setTimeout(() => { if (btn) btn.textContent = "测试连接"; }, 5000);
                    } catch (e: any) {
                      if (btn) btn.textContent = `✗ 失败: ${e?.message?.slice(0, 40) || "未知错误"}`;
                      setTimeout(() => { if (btn) btn.textContent = "测试连接"; }, 8000);
                    }
                  }}
                  id="llm-test-btn"
                  className="w-full rounded-md border border-neon-purple/30 bg-neon-purple/10 px-2.5 py-1.5 font-mono text-[10px] text-neon-purple transition-colors hover:bg-neon-purple/20"
                >
                  测试连接
                </button>
              )}
            </div>
          )}
        </div>

        {/* 信号历史统计 */}
        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-neon-green" />
            <span className="font-mono text-[12px] text-ink">信号历史统计</span>
            <span className="ml-auto font-mono text-[10px] text-ink-muted">
              共 {signalHistory.length} 条记录
            </span>
            <button
              onClick={() => {
                const last = useMultiAgentStore.getState().signalHistory[0];
                const price = last?.price || 0;
                useMultiAgentStore.getState().checkSignalOutcomes(price);
              }}
              className="ml-2 rounded border border-panel-border px-1.5 py-0.5 font-mono text-[9px] text-ink-muted transition-colors hover:border-neon-purple/40 hover:text-neon-purple"
              title="立即评估待评估的信号"
            >
              立即评估
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-md bg-void/50 p-2 text-center">
              <div className="font-mono text-[14px] text-ink">
                {signalHistory.filter((s) => s.outcome === "win").length}
              </div>
              <div className="font-mono text-[9px] text-neon-green">盈利</div>
            </div>
            <div className="rounded-md bg-void/50 p-2 text-center">
              <div className="font-mono text-[14px] text-ink">
                {signalHistory.filter((s) => s.outcome === "loss").length}
              </div>
              <div className="font-mono text-[9px] text-neon-red">亏损</div>
            </div>
            <div className="rounded-md bg-void/50 p-2 text-center">
              <div className="font-mono text-[14px] text-ink">
                {signalHistory.filter((s) => s.outcome === "pending").length}
              </div>
              <div className="font-mono text-[9px] text-ink-muted">待评估</div>
            </div>
            <div className="rounded-md bg-void/50 p-2 text-center">
              <div className="font-mono text-[14px] text-neon-cyan">
                {signalHistory.filter((s) => s.traded).length}
              </div>
              <div className="font-mono text-[9px] text-ink-muted">已交易</div>
            </div>
          </div>
          {signalHistory.filter((s) => s.outcome !== "pending").length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[10px] text-ink-muted">总胜率</span>
              <div className="flex-1 h-1.5 rounded-full bg-void-200">
                <div
                  className="h-full rounded-full bg-neon-green"
                  style={{
                    width: `${
                      (signalHistory.filter((s) => s.outcome === "win").length /
                        Math.max(
                          1,
                          signalHistory.filter((s) => s.outcome !== "pending").length,
                        )) *
                      100
                    }%`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] text-neon-green">
                {(
                  (signalHistory.filter((s) => s.outcome === "win").length /
                    Math.max(
                      1,
                      signalHistory.filter((s) => s.outcome !== "pending").length,
                    )) *
                  100
                ).toFixed(0)}
                %
              </span>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-neon-cyan" />
            <span className="font-mono text-[12px] text-ink">自动运行</span>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">启用自动分析</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">按设定间隔自动运行多代理分析</div>
              </div>
              <button
                onClick={toggleAutoRun}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.autoRun ? "bg-neon-cyan" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.autoRun ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">运行间隔</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">每次自动分析的时间间隔</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={settings.runInterval / 60000}
                  onChange={(e) => updateSetting("runInterval", Math.max(1, Number(e.target.value)) * 60000)}
                  className="w-16 rounded border border-panel-border bg-void px-2 py-1 font-mono text-[11px] text-ink text-right focus:border-neon-cyan/50 focus:outline-none"
                />
                <span className="font-mono text-[10px] text-ink-muted">分钟</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-neon-green" />
            <span className="font-mono text-[12px] text-ink">自动交易</span>
            {settings.autoTrade && (
              <span className="ml-1 flex items-center gap-1 rounded bg-neon-green/15 px-1.5 py-0.5 font-mono text-[9px] text-neon-green">
                <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" />
                已启用
              </span>
            )}
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">启用自动开仓</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">信号达标后自动执行交易下单</div>
              </div>
              <button
                onClick={toggleAutoTrade}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.autoTrade ? "bg-neon-green" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.autoTrade ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">最低置信度</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">低于此值不自动交易</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="40"
                  max="90"
                  step="5"
                  value={settings.minConfidence * 100}
                  onChange={(e) => updateSetting("minConfidence", Number(e.target.value) / 100)}
                  className="w-24 accent-neon-green"
                />
                <span className="w-10 text-right font-mono text-[10px] text-neon-green">
                  {(settings.minConfidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">最低信号强度</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">强度不足不自动交易</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="5"
                  value={settings.minStrength * 100}
                  onChange={(e) => updateSetting("minStrength", Number(e.target.value) / 100)}
                  className="w-24 accent-neon-green"
                />
                <span className="w-10 text-right font-mono text-[10px] text-neon-green">
                  {(settings.minStrength * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">默认杠杆</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">自动开仓使用的杠杆倍数</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  max="125"
                  value={settings.defaultLeverage}
                  onChange={(e) => updateSetting("defaultLeverage", Math.max(1, Math.min(125, Number(e.target.value))))}
                  className="w-16 rounded border border-panel-border bg-void px-2 py-1 font-mono text-[11px] text-ink text-right focus:border-neon-green/50 focus:outline-none"
                />
                <span className="font-mono text-[10px] text-ink-muted">x</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">交易金额 (USDT)</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">每次自动开仓的本金</div>
              </div>
              <input
                type="number"
                min="10"
                value={settings.tradeAmount}
                onChange={(e) => updateSetting("tradeAmount", Math.max(10, Number(e.target.value)))}
                className="w-24 rounded border border-panel-border bg-void px-2 py-1 font-mono text-[11px] text-ink text-right focus:border-neon-green/50 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-neon-cyan" />
            <span className="font-mono text-[12px] text-ink">置信度阈值</span>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="95"
                step="5"
                value={settings.confidenceThreshold * 100}
                onChange={(e) => updateSetting("confidenceThreshold", Number(e.target.value) / 100)}
                className="flex-1 accent-neon-cyan"
              />
              <span className="w-12 text-right font-mono text-[12px] text-neon-cyan">
                {(settings.confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] text-ink-muted/70">
              低于此阈值的分析结果将标记为低置信度，建议人工复核
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-neon-cyan" />
            <span className="font-mono text-[12px] text-ink">显示设置</span>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-ink">显示消息日志</div>
                <div className="font-mono text-[9.5px] text-ink-muted/70">在总览页显示代理间通信消息</div>
              </div>
              <button
                onClick={() => updateSetting("showMessageLog", !settings.showMessageLog)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  settings.showMessageLog ? "bg-neon-cyan" : "bg-void-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    settings.showMessageLog ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-panel-border bg-void-100/40 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-neon-yellow" />
            <span className="font-mono text-[12px] text-ink">系统状态</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded bg-void/40 p-2.5">
              <div className="font-mono text-[10px] text-ink-muted">初始化状态</div>
              <div className={cn("mt-0.5 font-mono text-[12px]", isInitialized ? "text-neon-green" : "text-neon-yellow")}>
                {isInitialized ? "已就绪" : "初始化中"}
              </div>
            </div>
            <div className="rounded bg-void/40 p-2.5">
              <div className="font-mono text-[10px] text-ink-muted">代理版本</div>
              <div className="mt-0.5 font-mono text-[12px] text-ink">v1.0.0</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return renderOverview();
      case "agents":
        return renderAgents();
      case "messages":
        return renderMessages();
      case "results":
        return renderResults();
      case "settings":
        return renderSettings();
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col bg-void">
      {/* Tab 栏 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-panel-border bg-void-100/60 px-3 py-1.5 backdrop-blur-sm">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] transition-all",
                activeTab === tab.id
                  ? "bg-neon-cyan/15 text-neon-cyan shadow-sm"
                  : "text-ink-muted hover:bg-void-200/60 hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 rounded bg-neon-red/15 px-2 py-0.5 font-mono text-[10px] text-neon-red">
              <AlertCircle className="h-3 w-3" />
              {errorCount} 个异常
            </span>
          )}
          <span className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px]",
            isInitialized
              ? "bg-neon-green/15 text-neon-green"
              : "bg-neon-yellow/15 text-neon-yellow",
          )}>
            {isInitialized ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <RefreshCw className="h-3 w-3 animate-spin" />
            )}
            {isInitialized ? "系统就绪" : "初始化中"}
          </span>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 p-2">
        {renderContent()}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: "cyan" | "yellow" | "green" | "purple" | "red";
}) {
  const colorMap = {
    cyan: "text-neon-cyan",
    yellow: "text-neon-yellow",
    green: "text-neon-green",
    purple: "text-neon-purple",
    red: "text-neon-red",
  };
  return (
    <div className="rounded-lg border border-panel-border bg-void-100/40 p-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", colorMap[color])} />
        <span className="font-mono text-[9.5px] text-ink-muted">{label}</span>
      </div>
      <div className="mt-1 font-mono text-lg text-ink">{value}</div>
    </div>
  );
}

function MetricItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: "cyan" | "yellow" | "green" | "purple" | "red";
}) {
  const colorMap = {
    cyan: "text-neon-cyan",
    yellow: "text-neon-yellow",
    green: "text-neon-green",
    purple: "text-neon-purple",
    red: "text-neon-red",
  };
  return (
    <div className="rounded-md bg-void/40 p-2">
      <div className="flex items-center gap-1">
        <Icon className={cn("h-3 w-3", colorMap[color])} />
        <span className="font-mono text-[9px] text-ink-muted">{label}</span>
      </div>
      <div className={cn("mt-0.5 font-mono text-[11px]", colorMap[color])}>{value}</div>
    </div>
  );
}
