import React, { useState, useEffect } from "react";
import {
  Activity,
  TrendingUp,
  DollarSign,
  Cpu,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart2,
  PieChart,
  Zap,
  Clock,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import {
  runHealthDiagnosis,
  runCostAnalysis,
  runBayesianOptimization,
  queryBacktestHistory,
  compareStrategyResults,
  type HealthDiagnosisResponse,
  type CostAnalysisResponse,
  type BayesianOptResponse,
} from "@/services/quant";
import { useMarketStore } from "@/store/useMarketStore";

type LabTab = "health" | "cost" | "bayesian" | "history" | "compare";

const TABS: { key: LabTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "health", label: "策略体检", icon: <Activity className="h-4 w-4" />, desc: "6维度诊断策略健康度" },
  { key: "cost", label: "成本分析", icon: <DollarSign className="h-4 w-4" />, desc: "真实交易成本全量化" },
  { key: "bayesian", label: "智能寻参", icon: <Cpu className="h-4 w-4" />, desc: "贝叶斯优化 10x 效率" },
  { key: "history", label: "历史回测", icon: <Database className="h-4 w-4" />, desc: "所有回测记录归档" },
  { key: "compare", label: "策略对比", icon: <BarChart2 className="h-4 w-4" />, desc: "多策略横向对比" },
];

const STRATEGY_OPTIONS = [
  { value: "ma_trend", label: "MA 趋势追踪" },
  { value: "rsi_mean_reversion", label: "RSI 均值回归" },
  { value: "macd_momentum", label: "MACD 动量" },
  { value: "bollinger_breakout", label: "布林带突破" },
];

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  excellent: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "优秀" },
  good: { color: "text-blue-400", bg: "bg-blue-500/10", label: "良好" },
  warning: { color: "text-amber-400", bg: "bg-amber-500/10", label: "警戒" },
  critical: { color: "text-rose-400", bg: "bg-rose-500/10", label: "危险" },
};

export function StrategyLab() {
  const [activeTab, setActiveTab] = useState<LabTab>("health");
  const [selectedStrategy, setSelectedStrategy] = useState("ma_trend");
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);

  return (
    <div className="flex h-full w-full overflow-hidden bg-void">
      {/* 左侧Tab导航 */}
      <div className="w-52 shrink-0 border-r border-panel-border/40 bg-void-100/30 p-3">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="font-mono text-sm font-semibold text-ink">策略实验室</span>
        </div>
        <p className="mb-4 font-mono text-[10px] text-ink-muted">
          当前: {symbol} · {timeframe}
        </p>
        <div className="space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                activeTab === tab.key
                  ? "bg-neon-blue/15 text-neon-blue"
                  : "text-ink-muted hover:bg-panel-hover/40 hover:text-ink"
              }`}
            >
              <span className={activeTab === tab.key ? "text-neon-blue" : "text-ink-muted"}>
                {tab.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs font-medium">{tab.label}</div>
                <div className="truncate font-mono text-[9px] opacity-70">{tab.desc}</div>
              </div>
              <ChevronRight
                className={`h-3 w-3 shrink-0 ${
                  activeTab === tab.key ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold text-ink">
              {TABS.find((t) => t.key === activeTab)?.label}
            </h2>
            <p className="font-mono text-xs text-ink-muted">
              {TABS.find((t) => t.key === activeTab)?.desc}
            </p>
          </div>
          {activeTab !== "history" && activeTab !== "compare" && (
            <div className="flex items-center gap-2">
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="rounded border border-panel-border bg-void-200 px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:border-neon-blue/50"
              >
                {STRATEGY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {activeTab === "health" && (
          <HealthTab strategy={selectedStrategy} symbol={symbol} timeframe={timeframe} />
        )}
        {activeTab === "cost" && (
          <CostTab strategy={selectedStrategy} symbol={symbol} timeframe={timeframe} />
        )}
        {activeTab === "bayesian" && (
          <BayesianTab strategy={selectedStrategy} symbol={symbol} timeframe={timeframe} />
        )}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "compare" && <CompareTab symbol={symbol} timeframe={timeframe} />}
      </div>
    </div>
  );
}

// ==================== 健康度诊断 Tab ====================

function HealthTab({
  strategy,
  symbol,
  timeframe,
}: {
  strategy: string;
  symbol: string;
  timeframe: string;
}) {
  const [data, setData] = useState<HealthDiagnosisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    runHealthDiagnosis(symbol, timeframe, strategy, 500)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [strategy, symbol, timeframe]);

  const grade = data ? GRADE_CONFIG[data.grade] : GRADE_CONFIG.good;

  return (
    <div className="space-y-4">
      <Panel
        title="综合评分"
        icon={<Activity className="h-3.5 w-3.5" />}
        action={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] text-ink-muted hover:bg-panel-hover/40 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        }
      >
        {loading && !data ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-neon-blue" />
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 gap-4">
            {/* 综合分数 */}
            <div className={`rounded-lg border border-panel-border ${grade.bg} p-4`}>
              <div className="mb-2 font-mono text-xs text-ink-muted">综合健康分</div>
              <div className={`font-mono text-5xl font-bold ${grade.color}`}>
                {data.overall_score}
                <span className="text-xl text-ink-muted">/100</span>
              </div>
              <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${grade.color} ${grade.bg} border border-current/20`}>
                {grade.label}
              </div>
            </div>

            {/* 6项指标 */}
            <div className="space-y-2">
              <HealthBar label="权益RSI" value={data.equity_rsi ?? 50} max={100} unit="" />
              <HealthBar
                label="收益衰变"
                value={Math.max(0, Math.min(100, (1 - data.decay_rate) * 50 + 50))}
                max={100}
                unit=""
                status={data.decay_status}
              />
              <HealthBar
                label="恢复速度"
                value={data.recovery_trend === "improving" ? 90 : data.recovery_trend === "stable" ? 70 : data.recovery_trend === "slowing" ? 50 : 25}
                max={100}
                unit=""
                status={data.recovery_trend}
              />
              <HealthBar
                label="策略疲劳"
                value={Math.max(0, 100 - data.fatigue_level * 200)}
                max={100}
                unit=""
              />
              <HealthBar label="市场适配" value={data.regime_adaptability} max={100} unit="%" />
            </div>
          </div>
        ) : null}
      </Panel>

      {/* 建议 */}
      {data && data.recommendations.length > 0 && (
        <Panel title="诊断建议" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}>
          <div className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/5 p-2"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                <span className="font-mono text-xs text-ink">{rec}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function HealthBar({
  label,
  value,
  max,
  unit,
  status,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  status?: string;
}) {
  const pct = (value / max) * 100;
  const color =
    pct >= 70
      ? "bg-emerald-400"
      : pct >= 40
        ? "bg-amber-400"
        : "bg-rose-400";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] text-ink-muted">{label}</span>
        <span className="font-mono text-[10px] text-ink">
          {Math.round(value)}
          {unit}
          {status && <span className="ml-1 text-ink-muted">({status})</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-panel-border/30">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ==================== 成本分析 Tab ====================

function CostTab({
  strategy,
  symbol,
  timeframe,
}: {
  strategy: string;
  symbol: string;
  timeframe: string;
}) {
  const [data, setData] = useState<CostAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchange, setExchange] = useState("binance");
  const [feeTier, setFeeTier] = useState("regular");
  const [execType, setExecType] = useState("taker");

  const load = () => {
    setLoading(true);
    runCostAnalysis(symbol, timeframe, strategy, exchange, feeTier, execType, 500)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [strategy, symbol, timeframe, exchange, feeTier, execType]);

  return (
    <div className="space-y-4">
      {/* 配置栏 */}
      <Panel title="交易环境配置" icon={<DollarSign className="h-3.5 w-3.5" />}>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] text-ink-muted">交易所</label>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="rounded border border-panel-border bg-void-200 px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:border-neon-blue/50"
            >
              <option value="binance">Binance</option>
              <option value="okx">OKX</option>
              <option value="bybit">Bybit</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-ink-muted">费率等级</label>
            <select
              value={feeTier}
              onChange={(e) => setFeeTier(e.target.value)}
              className="rounded border border-panel-border bg-void-200 px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:border-neon-blue/50"
            >
              <option value="regular">Regular</option>
              <option value="vip1">VIP 1</option>
              <option value="vip2">VIP 2</option>
              <option value="vip3">VIP 3</option>
              <option value="vip4">VIP 4</option>
              <option value="vip5">VIP 5</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-ink-muted">执行方式</label>
            <select
              value={execType}
              onChange={(e) => setExecType(e.target.value)}
              className="rounded border border-panel-border bg-void-200 px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:border-neon-blue/50"
            >
              <option value="taker">Taker (市价)</option>
              <option value="maker">Maker (限价)</option>
              <option value="mixed">Mixed (混合)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1 rounded bg-neon-blue/20 px-3 py-1 font-mono text-xs text-neon-blue hover:bg-neon-blue/30 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              重新计算
            </button>
          </div>
        </div>
      </Panel>

      {loading && !data ? (
        <Panel>
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-neon-blue" />
          </div>
        </Panel>
      ) : data ? (
        <>
          {/* 总成本概览 */}
          <Panel title="成本明细" icon={<PieChart className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-3 gap-3">
              <CostItem label="手续费" value={data.costs.total_commission} pct={data.costs.cost_breakdown_pct.commission} color="text-blue-400" />
              <CostItem label="资金费率" value={data.costs.total_funding} pct={data.costs.cost_breakdown_pct.funding} color="text-amber-400" />
              <CostItem label="滑点" value={data.costs.total_slippage} pct={data.costs.cost_breakdown_pct.slippage} color="text-purple-400" />
              <CostItem label="冲击成本" value={data.costs.total_impact} pct={data.costs.cost_breakdown_pct.impact} color="text-rose-400" />
              <CostItem label="跳空风险" value={data.costs.total_gap_risk} pct={data.costs.cost_breakdown_pct.gap_risk} color="text-orange-400" />
              <CostItem label="总成本" value={data.costs.total_all_costs} pct={100} color="text-ink" highlight />
            </div>
          </Panel>

          {/* 年度资金费率影响 */}
          <Panel title="年度资金费率影响" icon={<Clock className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 font-mono text-[10px] text-ink-muted">每8小时费率</div>
                <div className="font-mono text-lg font-bold text-amber-400">
                  {(data.funding_impact.funding_rate_per_8h * 100).toFixed(4)}%
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-[10px] text-ink-muted">年度费率成本</div>
                <div className="font-mono text-lg font-bold text-rose-400">
                  {data.funding_impact.annual_cost.toFixed(2)} USDT
                  <span className="ml-1 text-sm text-ink-muted">
                    ({data.funding_impact.annual_pct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </Panel>

          {/* 不同资金规模冲击成本 */}
          <Panel title="资金规模冲击成本" icon={<TrendingUp className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              {Object.entries(data.impact_by_capital).map(([cap, imp]) => (
                <div key={cap} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-[11px] text-ink-muted text-right">
                    {parseInt(cap).toLocaleString()} USDT
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-panel-border/30">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
                      style={{ width: `${Math.min(100, imp * 50)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 font-mono text-[11px] text-ink">
                    {imp.toFixed(4)}%
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function CostItem({
  label,
  value,
  pct,
  color,
  highlight,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-md border border-panel-border p-2.5 ${highlight ? "bg-void-200/50" : ""}`}>
      <div className="mb-1 font-mono text-[10px] text-ink-muted">{label}</div>
      <div className={`font-mono text-base font-bold ${color}`}>
        {Math.abs(value).toFixed(2)} <span className="text-xs text-ink-muted">USDT</span>
      </div>
      <div className="mt-1 font-mono text-[9px] text-ink-muted">占比 {pct.toFixed(1)}%</div>
    </div>
  );
}

// ==================== 贝叶斯优化 Tab ====================

function BayesianTab({
  strategy,
  symbol,
  timeframe,
}: {
  strategy: string;
  symbol: string;
  timeframe: string;
}) {
  const [data, setData] = useState<BayesianOptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [maxEvals, setMaxEvals] = useState(12);
  const [paramConfig, setParamConfig] = useState<Record<string, number[]>>({
    fast_period: [5, 10, 20],
    slow_period: [30, 50, 80],
  });

  useEffect(() => {
    if (strategy === "rsi_mean_reversion") {
      setParamConfig({ rsi_period: [7, 14, 21], oversold: [25, 30, 35], overbought: [65, 70, 75] });
    } else if (strategy === "macd_momentum") {
      setParamConfig({ fast: [8, 12, 16], slow: [20, 26, 32], signal: [6, 9, 12] });
    } else if (strategy === "bollinger_breakout") {
      setParamConfig({ period: [14, 20, 26], std_dev: [1.5, 2, 2.5] });
    } else {
      setParamConfig({ fast_period: [5, 10, 20], slow_period: [30, 50, 80] });
    }
  }, [strategy]);

  const run = () => {
    setLoading(true);
    runBayesianOptimization({
      symbol,
      timeframe,
      strategy,
      paramRanges: paramConfig,
      maxEvaluations: maxEvals,
      initialRandom: Math.max(3, Math.floor(maxEvals / 4)),
      limit: 400,
    })
      .then(setData)
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-4">
      <Panel title="贝叶斯参数优化" icon={<Cpu className="h-3.5 w-3.5" />}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] text-ink-muted">评估次数</label>
            <select
              value={maxEvals}
              onChange={(e) => setMaxEvals(Number(e.target.value))}
              className="rounded border border-panel-border bg-void-200 px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:border-neon-blue/50"
            >
              <option value={8}>8 次（快速）</option>
              <option value={12}>12 次（平衡）</option>
              <option value={20}>20 次（精确）</option>
              <option value={30}>30 次（深度）</option>
            </select>
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 rounded bg-gradient-to-r from-purple-500/30 to-neon-blue/30 px-4 py-1.5 font-mono text-xs font-medium text-ink hover:from-purple-500/40 hover:to-neon-blue/40 disabled:opacity-50"
          >
            <Cpu className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "优化中..." : "开始优化"}
          </button>
          {data && (
            <span className="ml-2 font-mono text-[11px] text-ink-muted">
              已执行 {data.total_evaluations} 次评估
            </span>
          )}
        </div>

        {!data && !loading && (
          <div className="rounded border border-dashed border-panel-border p-8 text-center">
            <Cpu className="mx-auto mb-2 h-8 w-8 text-ink-muted opacity-50" />
            <p className="font-mono text-sm text-ink-muted">点击"开始优化"运行贝叶斯参数搜索</p>
            <p className="mt-1 font-mono text-[10px] text-ink-muted/70">
              比网格搜索快 10x，自动聚焦最优参数区域
            </p>
          </div>
        )}

        {loading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-neon-blue" />
            <span className="ml-3 font-mono text-sm text-ink-muted">贝叶斯优化中...</span>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* 最优结果 */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span className="font-mono text-sm font-bold text-emerald-400">最优参数</span>
                <span className="ml-auto font-mono text-xs text-ink-muted">
                  夏普: {data.best_score.toFixed(4)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.best_params).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300"
                  >
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>

            {/* 收敛曲线 */}
            {data.convergence.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-xs text-ink-muted">收敛曲线</div>
                <div className="flex h-12 items-end gap-0.5">
                  {data.convergence.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-neon-blue/50 to-neon-blue"
                      style={{
                        height: `${Math.max(5, ((v - data.convergence[0]) / (data.best_score - data.convergence[0] + 0.01)) * 100)}%`,
                      }}
                      title={`迭代 ${i + 1}: ${v.toFixed(4)}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 优化历史 */}
            <div>
              <div className="mb-2 font-mono text-xs text-ink-muted">优化历史</div>
              <div className="max-h-64 overflow-auto rounded border border-panel-border">
                <table className="w-full font-mono text-[11px]">
                  <thead className="sticky top-0 bg-void-200">
                    <tr>
                      <th className="px-2 py-1 text-left text-ink-muted">#</th>
                      <th className="px-2 py-1 text-left text-ink-muted">类型</th>
                      <th className="px-2 py-1 text-left text-ink-muted">参数</th>
                      <th className="px-2 py-1 text-right text-ink-muted">分数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => (
                      <tr key={i} className="border-t border-panel-border/30 hover:bg-panel-hover/20">
                        <td className="px-2 py-1 text-ink-muted">{i + 1}</td>
                        <td className="px-2 py-1">
                          <span
                            className={
                              h.type === "bayesian"
                                ? "text-neon-blue"
                                : "text-ink-muted"
                            }
                          >
                            {h.type === "bayesian" ? "★ 贝叶斯" : "● 随机"}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-ink">
                          {Object.entries(h.params)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ")}
                        </td>
                        <td
                          className={`px-2 py-1 text-right ${
                            h.score === data.best_score ? "text-emerald-400 font-bold" : "text-ink"
                          }`}
                        >
                          {h.score.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ==================== 历史回测 Tab ====================

function HistoryTab() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStrategy, setFilterStrategy] = useState<string>("");

  const load = () => {
    setLoading(true);
    queryBacktestHistory(filterStrategy || undefined, undefined, 50)
      .then((d) => setResults(d.results))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterStrategy]);

  return (
    <div className="space-y-4">
      <Panel title="历史回测记录" icon={<Database className="h-3.5 w-3.5" />}>
        <div className="mb-3 flex items-center gap-2">
          <input
            placeholder="按策略过滤..."
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            className="rounded border border-panel-border bg-void-200 px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:border-neon-blue/50"
          />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] text-ink-muted hover:bg-panel-hover/40 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neon-blue" />
          </div>
        ) : results.length === 0 ? (
          <div className="rounded border border-dashed border-panel-border p-6 text-center">
            <Database className="mx-auto mb-2 h-6 w-6 text-ink-muted opacity-50" />
            <p className="font-mono text-xs text-ink-muted">暂无回测记录</p>
            <p className="mt-1 font-mono text-[10px] text-ink-muted/70">
              运行回测后结果会自动保存在这里
            </p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-auto rounded border border-panel-border">
            <table className="w-full font-mono text-[11px]">
              <thead className="sticky top-0 bg-void-200 z-10">
                <tr>
                  <th className="px-2 py-1.5 text-left text-ink-muted">ID</th>
                  <th className="px-2 py-1.5 text-left text-ink-muted">策略</th>
                  <th className="px-2 py-1.5 text-left text-ink-muted">交易对</th>
                  <th className="px-2 py-1.5 text-right text-ink-muted">收益</th>
                  <th className="px-2 py-1.5 text-right text-ink-muted">夏普</th>
                  <th className="px-2 py-1.5 text-right text-ink-muted">胜率</th>
                  <th className="px-2 py-1.5 text-right text-ink-muted">最大回撤</th>
                  <th className="px-2 py-1.5 text-right text-ink-muted">交易数</th>
                  <th className="px-2 py-1.5 text-left text-ink-muted">时间</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t border-panel-border/30 hover:bg-panel-hover/20">
                    <td className="px-2 py-1.5 text-ink-muted">#{r.id}</td>
                    <td className="px-2 py-1.5 text-ink">{r.strategy}</td>
                    <td className="px-2 py-1.5 text-ink-muted">{r.symbol}</td>
                    <td
                      className={`px-2 py-1.5 text-right font-medium ${
                        r.total_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {r.total_return_pct >= 0 ? "+" : ""}
                      {r.total_return_pct.toFixed(2)}%
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink">{r.sharpe_ratio.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right text-ink-muted">
                      {(r.win_rate * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 py-1.5 text-right text-rose-400/80">
                      {r.max_drawdown_pct.toFixed(2)}%
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink-muted">{r.total_trades}</td>
                    <td className="px-2 py-1.5 text-[10px] text-ink-muted">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ==================== 策略对比 Tab ====================

function CompareTab({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    compareStrategyResults(symbol, timeframe, 10)
      .then((d) => setData(d.comparison))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [symbol, timeframe]);

  if (loading) {
    return (
      <Panel>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neon-blue" />
        </div>
      </Panel>
    );
  }

  if (data.length === 0) {
    return (
      <Panel title="策略对比" icon={<BarChart2 className="h-3.5 w-3.5" />}>
        <div className="rounded border border-dashed border-panel-border p-8 text-center">
          <BarChart2 className="mx-auto mb-2 h-8 w-8 text-ink-muted opacity-50" />
          <p className="font-mono text-sm text-ink-muted">暂无对比数据</p>
          <p className="mt-1 font-mono text-[10px] text-ink-muted/70">
            先运行几个策略的回测，结果会自动出现在这里
          </p>
        </div>
      </Panel>
    );
  }

  const bestSharpe = Math.max(...data.map((d) => d.avg_sharpe));
  const bestReturn = Math.max(...data.map((d) => d.avg_return));
  const bestWinrate = Math.max(...data.map((d) => d.avg_winrate));
  const lowestDD = Math.min(...data.map((d) => d.avg_dd));

  return (
    <Panel
      title="策略横向对比"
      icon={<BarChart2 className="h-3.5 w-3.5" />}
      action={
        <button
          onClick={load}
          className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] text-ink-muted hover:bg-panel-hover/40 hover:text-ink"
        >
          <RefreshCw className="h-3 w-3" /> 刷新
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-panel-border">
              <th className="py-2 text-left text-ink-muted">策略</th>
              <th className="py-2 text-right text-ink-muted">平均收益</th>
              <th className="py-2 text-right text-ink-muted">平均夏普</th>
              <th className="py-2 text-right text-ink-muted">平均胜率</th>
              <th className="py-2 text-right text-ink-muted">平均回撤</th>
              <th className="py-2 text-right text-ink-muted">运行次数</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.strategy} className="border-b border-panel-border/30 hover:bg-panel-hover/20">
                <td className="py-2 font-medium text-ink">{row.strategy}</td>
                <td
                  className={`py-2 text-right ${
                    row.avg_return === bestReturn ? "text-emerald-400 font-bold" : "text-ink"
                  }`}
                >
                  {row.avg_return >= 0 ? "+" : ""}
                  {row.avg_return.toFixed(2)}%
                  {row.avg_return === bestReturn && (
                    <CheckCircle className="ml-1 inline h-3 w-3 text-emerald-400" />
                  )}
                </td>
                <td
                  className={`py-2 text-right ${
                    row.avg_sharpe === bestSharpe ? "text-emerald-400 font-bold" : "text-ink"
                  }`}
                >
                  {row.avg_sharpe.toFixed(2)}
                  {row.avg_sharpe === bestSharpe && (
                    <CheckCircle className="ml-1 inline h-3 w-3 text-emerald-400" />
                  )}
                </td>
                <td
                  className={`py-2 text-right ${
                    row.avg_winrate === bestWinrate ? "text-emerald-400 font-bold" : "text-ink"
                  }`}
                >
                  {(row.avg_winrate * 100).toFixed(1)}%
                  {row.avg_winrate === bestWinrate && (
                    <CheckCircle className="ml-1 inline h-3 w-3 text-emerald-400" />
                  )}
                </td>
                <td
                  className={`py-2 text-right ${
                    row.avg_dd === lowestDD ? "text-emerald-400 font-bold" : "text-rose-400/80"
                  }`}
                >
                  {row.avg_dd.toFixed(2)}%
                  {row.avg_dd === lowestDD && (
                    <CheckCircle className="ml-1 inline h-3 w-3 text-emerald-400" />
                  )}
                </td>
                <td className="py-2 text-right text-ink-muted">{row.run_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <span className="font-mono text-[11px] text-ink">
          各项指标最优的策略已标记为绿色
        </span>
      </div>
    </Panel>
  );
}
