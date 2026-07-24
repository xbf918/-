import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar, type ViewKey } from "@/components/layout/Sidebar";
import { MainChart } from "@/components/chart/MainChart";
import { MacdChart } from "@/components/chart/MacdChart";
import { OscillatorChart } from "@/components/chart/OscillatorChart";
import { SignalCard } from "@/components/panels/SignalCard";
import { TimeframeMatrix } from "@/components/panels/TimeframeMatrix";
import { PatternPanel } from "@/components/panels/PatternPanel";
import { PositionPanel } from "@/components/panels/PositionPanel";
import { TradeHistoryPanel } from "@/components/panels/TradeHistoryPanel";
import { ScannerPanel } from "@/components/panels/ScannerPanel";
import { ProfitStatsPanel } from "@/components/panels/ProfitStatsPanel";
import { TradingConfigPanel } from "@/components/panels/TradingConfigPanel";
import { StrategyLearningPanel } from "@/components/panels/StrategyLearningPanel";
import { NotificationSettingsPanel } from "@/components/panels/NotificationSettingsPanel";
import { ExchangePanel } from "@/components/panels/ExchangePanel";
import { AIStrategyPanel } from "@/components/panels/AIStrategyPanel";
import { MultiAgentPanel } from "@/components/panels/MultiAgentPanel";
import { QuantStrategyPanel } from "@/components/panels/QuantStrategyPanel";
import { StrategyLab } from "@/components/panels/StrategyLab";
import { PerformanceDashboard } from "@/components/panels/PerformanceDashboard";
import { TradingPsychologyPanel } from "@/components/panels/TradingPsychologyPanel";
import { OrderBookPanel } from "@/components/panels/OrderBookPanel";
import { SymbolTickerBar } from "@/components/panels/SymbolTickerBar";
import { ChartIndicatorTabs, type IndicatorTabKey } from "@/components/panels/ChartIndicatorTabs";
import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useAutoTrading } from "@/hooks/useAutoTrading";
import { useRealtimeAutoTrading } from "@/hooks/useRealtimeAutoTrading";
import { useNotifications } from "@/hooks/useNotifications";

class ErrorBoundary extends React.Component<{ children: React.ReactNode; name: string }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`Error in ${this.props.name}:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded border border-neon-red/50 bg-neon-red/10 p-3">
          <p className="font-mono text-xs text-neon-red">
            {this.props.name} 渲染错误: {this.state.error?.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Dashboard() {
  const { t } = useTranslation();
  const status = useMarketStore((s) => s.status);
  const error = useMarketStore((s) => s.error);
  const loadAll = useMarketStore((s) => s.loadAll);
  const [view, setView] = useState<ViewKey>("dashboard");

  useAutoRefresh();
  useAutoTrading();
  useRealtimeAutoTrading();
  useNotifications();

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void">
      {/* 左侧导航栏 */}
      <Sidebar active={view} onChange={setView} />

      {/* 主内容区 */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar />

        {error && status === "error" && (
          <div className="z-20 flex items-center gap-2 border-b border-neon-red/30 bg-neon-red/10 px-4 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-neon-red" />
            <span className="font-mono text-[11px] text-neon-red">{error}</span>
            <button
              onClick={() => loadAll()}
              className="ml-auto font-mono text-[10px] text-ink-muted underline hover:text-ink"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          {view === "dashboard" && <DashboardView status={status} />}
          {view === "scanner" && <ScannerView />}
          {view === "agents" && <AgentsView />}
          {view === "lab" && <StrategyLab />}
          {view === "performance" && <PerformanceView />}
          {view === "psychology" && <PsychologyView />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

/* ==========================================================
   经典三栏布局 - 专业金融交易软件
   左: 导航(已有) | 中: 主图表(最大化) | 右: AI信号+交易
   ========================================================== */
function DashboardView({ status }: { status: string }) {
  const [activeTab, setActiveTab] = useState<IndicatorTabKey>("macd");
  const [rightPanelTab, setRightPanelTab] = useState<"signal" | "quant" | "orderbook" | "positions">("signal");

  const renderIndicatorContent = () => {
    switch (activeTab) {
      case "macd":
        return (
          <Panel title="MACD" icon={<span className="h-3 w-3" />} className="h-full" bodyClassName="p-0 h-full" headerClassName="py-0.5 px-2">
            <MacdChart />
          </Panel>
        );
      case "kdj":
      case "rsi":
      case "cvd":
        return (
          <Panel title={activeTab.toUpperCase()} icon={<span className="h-3 w-3" />} className="h-full" bodyClassName="p-0 h-full" headerClassName="py-0.5 px-2">
            <OscillatorChart />
          </Panel>
        );
      case "positions":
        return <PositionPanel embedded />;
      case "history":
        return <TradeHistoryPanel embedded />;
      case "profit":
        return <ProfitStatsPanel embedded />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* ===== 中间：主图表区域（最大化） ===== */}
      <div className="flex min-w-0 flex-1 flex-col border-r border-panel-border/40">
        {/* 顶部交易对滚动条 */}
        <SymbolTickerBar />

        {/* 主K线图 - 占最大空间 */}
        <div className="relative flex-1 min-h-0">
          <MainChart />
          {status === "loading" && <LoadingOverlay />}
        </div>

        {/* 底部指标/交易 Tab */}
        <div className="h-[180px] shrink-0 flex flex-col border-t border-panel-border/40 bg-void-100/30">
          <ChartIndicatorTabs activeTab={activeTab} onChange={setActiveTab} />
          <div className="flex-1 overflow-hidden">
            {renderIndicatorContent()}
          </div>
        </div>
      </div>

      {/* ===== 右侧：AI信号 + 订单簿 + 交易（固定宽度 320px） ===== */}
      <div className="flex w-[320px] shrink-0 flex-col bg-void-100/40">
        {/* 右侧Tab切换 */}
        <div className="flex shrink-0 border-b border-panel-border/40">
          <RightTabButton active={rightPanelTab === "signal"} onClick={() => setRightPanelTab("signal")} label="AI信号" />
          <RightTabButton active={rightPanelTab === "quant"} onClick={() => setRightPanelTab("quant")} label="量化策略" />
          <RightTabButton active={rightPanelTab === "orderbook"} onClick={() => setRightPanelTab("orderbook")} label="订单簿" />
          <RightTabButton active={rightPanelTab === "positions"} onClick={() => setRightPanelTab("positions")} label="持仓" />
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {rightPanelTab === "signal" && <SignalCard />}
          {rightPanelTab === "quant" && (
            <div className="h-full overflow-y-auto p-2">
              <QuantStrategyPanel />
            </div>
          )}
          {rightPanelTab === "orderbook" && <OrderBookPanel />}
          {rightPanelTab === "positions" && <PositionPanel embedded />}
        </div>
      </div>
    </div>
  );
}

function RightTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 py-2 text-center font-mono text-[10px] font-semibold transition-colors ${
        active ? "text-neon-cyan" : "text-ink-muted hover:text-ink"
      }`}
    >
      {label}
      {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-neon-cyan" />}
    </button>
  );
}

/* ========== 扫描视图 ========== */
function ScannerView() {
  return (
    <div className="grid h-full grid-cols-12">
      <div className="col-span-9 flex min-h-0 flex-col gap-1.5 p-1.5">
        <ScannerPanel />
        <div className="grid grid-cols-2 gap-1.5">
          <PatternPanel />
          <TimeframeMatrix />
        </div>
      </div>
      <div className="col-span-3 border-l border-panel-border/50 bg-void-100/80 flex flex-col p-1.5 gap-1.5">
        <SignalCard />
        <PositionPanel />
        <TradeHistoryPanel />
      </div>
    </div>
  );
}

/* ========== 多智能体视图 ========== */
function AgentsView() {
  return (
    <div className="h-full bg-void">
      <ErrorBoundary name="MultiAgentPanel">
        <MultiAgentPanel />
      </ErrorBoundary>
    </div>
  );
}

/* ========== 绩效视图 ========== */
function PerformanceView() {
  return (
    <div className="h-full overflow-y-auto bg-void p-3">
      <ErrorBoundary name="PerformanceDashboard">
        <PerformanceDashboard />
      </ErrorBoundary>
    </div>
  );
}

/* ========== 交易心理视图 ========== */
function PsychologyView() {
  return (
    <div className="h-full overflow-y-auto bg-void p-3">
      <ErrorBoundary name="TradingPsychologyPanel">
        <TradingPsychologyPanel />
      </ErrorBoundary>
    </div>
  );
}

/* ========== 设置视图 ========== */
function SettingsView() {
  return (
    <div className="grid h-full grid-cols-12 bg-void">
      <div className="col-span-5 flex min-h-0 flex-col p-2 gap-2 overflow-y-auto">
        <ErrorBoundary name="TradingConfigPanel">
          <TradingConfigPanel />
        </ErrorBoundary>
        <ErrorBoundary name="ExchangePanel">
          <ExchangePanel />
        </ErrorBoundary>
      </div>
      <div className="col-span-5 flex min-h-0 flex-col p-2 gap-2 overflow-y-auto">
        <ErrorBoundary name="AIStrategyPanel">
          <AIStrategyPanel />
        </ErrorBoundary>
        <ErrorBoundary name="StrategyLearningPanel">
          <StrategyLearningPanel />
        </ErrorBoundary>
        <ErrorBoundary name="NotificationSettingsPanel">
          <NotificationSettingsPanel />
        </ErrorBoundary>
      </div>
      <div className="col-span-2 border-l border-panel-border/50 bg-void-100/80 flex flex-col p-2 gap-2 overflow-y-auto">
        <ErrorBoundary name="ProfitStatsPanel">
          <ProfitStatsPanel />
        </ErrorBoundary>
        <ErrorBoundary name="TradeHistoryPanel">
          <TradeHistoryPanel />
        </ErrorBoundary>
      </div>
    </div>
  );
}

function LoadingOverlay() {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-void/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
          {t("common.dataSyncing")}
        </span>
      </div>
    </div>
  );
}
