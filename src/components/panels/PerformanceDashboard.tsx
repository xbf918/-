/**
 * 交易绩效仪表盘
 * 展示交易日记、收益曲线、胜率/盈亏比分析、策略归因分析
 */
import { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, PieChart, Clock, Award, AlertCircle, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/store/useTradingStore';
import {
  buildTradeJournal,
  calculatePerformanceMetrics,
  calculateEquityCurve,
  calculateAttribution,
  generateWeeklyReport,
} from '@/lib/performance/analytics';

type TabKey = 'overview' | 'journal' | 'equity' | 'attribution' | 'report';

export function PerformanceDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const history = useTradingStore((s) => s.history);
  const initialBalance = useTradingStore((s) => s.initialBalance);

  const metrics = useMemo(() => calculatePerformanceMetrics(history, initialBalance), [history, initialBalance]);
  const equityCurve = useMemo(() => calculateEquityCurve(history, initialBalance), [history, initialBalance]);
  const attribution = useMemo(() => calculateAttribution(history), [history]);
  const journal = useMemo(() => buildTradeJournal(history), [history]);
  const weeklyReport = useMemo(() => generateWeeklyReport(history, initialBalance), [history, initialBalance]);

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString();
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const TabButton = ({ tab, icon: Icon, label }: { tab: TabKey; icon: any; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] font-bold transition-all',
        activeTab === tab ? 'bg-blue/20 text-blue' : 'text-ink-muted hover:text-ink'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">交易绩效仪表盘</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        <TabButton tab="overview" icon={PieChart} label="总览" />
        <TabButton tab="journal" icon={BookOpen} label="交易日记" />
        <TabButton tab="equity" icon={TrendingUp} label="收益曲线" />
        <TabButton tab="attribution" icon={PieChart} label="归因分析" />
        <TabButton tab="report" icon={Calendar} label="周复盘" />
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="总收益"
              value={`${metrics.totalPnl >= 0 ? '+' : ''}$${metrics.totalPnl.toFixed(2)}`}
              subValue={`${metrics.totalPnl >= 0 ? '+' : ''}${metrics.totalPnlPercent.toFixed(2)}%`}
              positive={metrics.totalPnl >= 0}
            />
            <MetricCard
              label="胜率"
              value={`${(metrics.winRate * 100).toFixed(0)}%`}
              subValue={`${metrics.winTrades} 胜 / ${metrics.lossTrades} 负`}
              positive={metrics.winRate >= 0.5}
            />
            <MetricCard
              label="盈亏比"
              value={metrics.profitFactor.toFixed(2)}
              subValue={`平均盈 ${metrics.avgWin.toFixed(1)} / 亏 ${metrics.avgLoss.toFixed(1)}`}
              positive={metrics.profitFactor >= 1}
            />
            <MetricCard
              label="最大回撤"
              value={`-${metrics.maxDrawdownPercent.toFixed(2)}%`}
              subValue={`$${metrics.maxDrawdown.toFixed(2)}`}
              positive={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-void-200/50 p-2">
              <div className="font-mono text-[9px] text-ink-muted mb-1">做多表现</div>
              <div className={cn('font-mono text-sm font-bold', metrics.longPnl >= 0 ? 'text-neon-green' : 'text-red')}>
                {metrics.longPnl >= 0 ? '+' : ''}${metrics.longPnl.toFixed(2)}
              </div>
              <div className="font-mono text-[9px] text-ink-muted">
                胜率 {(metrics.longWinRate * 100).toFixed(0)}%
              </div>
            </div>
            <div className="rounded bg-void-200/50 p-2">
              <div className="font-mono text-[9px] text-ink-muted mb-1">做空表现</div>
              <div className={cn('font-mono text-sm font-bold', metrics.shortPnl >= 0 ? 'text-neon-green' : 'text-red')}>
                {metrics.shortPnl >= 0 ? '+' : ''}${metrics.shortPnl.toFixed(2)}
              </div>
              <div className="font-mono text-[9px] text-ink-muted">
                胜率 {(metrics.shortWinRate * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="rounded bg-void-200/50 p-2">
            <div className="font-mono text-[10px] text-ink-muted mb-2">风险指标</div>
            <div className="grid grid-cols-3 gap-2 text-center text-[9px]">
              <div>
                <div className="font-mono text-sm font-bold text-ink">{metrics.sharpeRatio.toFixed(2)}</div>
                <div className="text-ink-muted">夏普比率</div>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-ink">{metrics.calmarRatio.toFixed(2)}</div>
                <div className="text-ink-muted">卡玛比率</div>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-ink">{formatDuration(metrics.avgTradeDuration)}</div>
                <div className="text-ink-muted">平均持仓</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'journal' && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {journal.length === 0 ? (
            <div className="text-center font-mono text-[10px] text-ink-muted py-4">暂无交易记录</div>
          ) : (
            journal.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  'rounded border p-2 text-[9px]',
                  entry.pnl >= 0 ? 'border-neon-green/20 bg-neon-green/5' : 'border-red/20 bg-red/5'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-ink">{entry.symbol}</span>
                  <span className={cn('font-mono font-bold', entry.pnl >= 0 ? 'text-neon-green' : 'text-red')}>
                    {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-ink-muted">
                  <span>方向: {entry.side === 'long' ? '多' : '空'}</span>
                  <span>杠杆: {entry.leverage}x</span>
                  <span>入场: ${entry.entryPrice.toFixed(2)}</span>
                  <span>出场: ${entry.exitPrice.toFixed(2)}</span>
                  <span>盈亏: {entry.pnlPercent.toFixed(2)}%</span>
                  <span>时长: {formatDuration(entry.durationSeconds)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-ink-muted">
                  <Clock className="h-2.5 w-2.5" />
                  {formatTime(entry.closeTime)}
                  <span className="ml-auto px-1.5 rounded bg-ink/10">{entry.reason}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'equity' && (
        <div className="space-y-3">
          <div className="rounded bg-void-200/50 p-2">
            <div className="font-mono text-[10px] text-ink-muted mb-2">权益曲线</div>
            <EquityChart data={equityCurve} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <div className="rounded bg-void-200/50 p-2">
              <div className="text-ink-muted">初始资金</div>
              <div className="font-mono text-sm font-bold text-ink">${initialBalance.toFixed(2)}</div>
            </div>
            <div className="rounded bg-void-200/50 p-2">
              <div className="text-ink-muted">当前权益</div>
              <div className={cn('font-mono text-sm font-bold', metrics.totalPnl >= 0 ? 'text-neon-green' : 'text-red')}>
                ${(initialBalance + metrics.totalPnl).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attribution' && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          <AttributionSection title="按交易对" data={attribution.bySymbol} labelKey="symbol" />
          <AttributionSection title="按方向" data={attribution.byDirection} labelKey="direction" />
          <AttributionSection title="按出场原因" data={attribution.byReason} labelKey="reason" />
        </div>
      )}

      {activeTab === 'report' && (
        <div className="space-y-3">
          <div className="rounded bg-void-200/50 p-3">
            <div className="flex items-center gap-1 mb-2">
              <Calendar className="h-3 w-3 text-blue" />
              <span className="font-mono text-[10px] font-bold text-ink">本周复盘 ({weeklyReport.weekStart} 起)</span>
            </div>
            <p className="font-mono text-[10px] text-ink-muted mb-3">{weeklyReport.summary}</p>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">交易笔数:</span>
                <span className="text-ink">{weeklyReport.trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">胜率:</span>
                <span className="text-ink">{(weeklyReport.winRate * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">盈亏:</span>
                <span className={cn(weeklyReport.pnl >= 0 ? 'text-neon-green' : 'text-red')}>
                  {weeklyReport.pnl >= 0 ? '+' : ''}${weeklyReport.pnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">最大回撤:</span>
                <span className="text-red">-{weeklyReport.maxDrawdownPercent.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div className="rounded bg-void-200/50 p-2">
            <div className="font-mono text-[10px] text-ink-muted mb-2">改进建议</div>
            <ul className="space-y-1 font-mono text-[9px] text-ink-muted">
              {metrics.profitFactor < 1.5 && (
                <li className="flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 text-yellow shrink-0" />
                  盈亏比偏低，建议优化止盈止损比例，让盈利奔跑
                </li>
              )}
              {metrics.winRate < 0.45 && (
                <li className="flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 text-yellow shrink-0" />
                  胜率不足 45%，建议提高入场信号过滤条件
                </li>
              )}
              {metrics.maxDrawdownPercent > 15 && (
                <li className="flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 text-red shrink-0" />
                  回撤过大，建议降低仓位或收紧风控
                </li>
              )}
              {metrics.sharpeRatio < 1 && (
                <li className="flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 text-yellow shrink-0" />
                  夏普比率偏低，收益风险比有待提升
                </li>
              )}
              {metrics.totalTrades === 0 && (
                <li className="flex items-start gap-1">
                  <Award className="h-3 w-3 text-blue shrink-0" />
                  暂无交易数据，开始交易后将生成复盘建议
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, subValue, positive }: { label: string; value: string; subValue: string; positive: boolean }) {
  return (
    <div className="rounded bg-void-200/50 p-2">
      <div className="font-mono text-[9px] text-ink-muted mb-1">{label}</div>
      <div className={cn('font-mono text-sm font-bold', positive ? 'text-neon-green' : 'text-red')}>
        {value}
      </div>
      <div className="font-mono text-[9px] text-ink-muted">{subValue}</div>
    </div>
  );
}

function AttributionSection({ title, data, labelKey }: { title: string; data: any[]; labelKey: string }) {
  if (data.length === 0) return null;
  return (
    <div className="rounded bg-void-200/50 p-2">
      <div className="font-mono text-[10px] text-ink-muted mb-2">{title}</div>
      <div className="space-y-1">
        {data.slice(0, 5).map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-[9px]">
            <span className="text-ink">{item[labelKey]}</span>
            <div className="flex items-center gap-2">
              <span className={cn(item.pnl >= 0 ? 'text-neon-green' : 'text-red')}>
                {item.pnl >= 0 ? '+' : ''}${item.pnl.toFixed(1)}
              </span>
              <span className="text-ink-muted">{(item.winRate * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquityChart({ data }: { data: Array<{ time: number; equity: number }> }) {
  if (data.length < 2) {
    return <div className="h-32 flex items-center justify-center font-mono text-[9px] text-ink-muted">数据不足</div>;
  }

  const width = 320;
  const height = 120;
  const padding = 10;

  const minEquity = Math.min(...data.map((d) => d.equity));
  const maxEquity = Math.max(...data.map((d) => d.equity));
  const range = maxEquity - minEquity || 1;

  const getX = (i: number) => padding + (i / (data.length - 1)) * (width - padding * 2);
  const getY = (equity: number) => height - padding - ((equity - minEquity) / range) * (height - padding * 2);

  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.equity)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      <defs>
        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathD} L ${getX(data.length - 1)} ${height - padding} L ${getX(0)} ${height - padding} Z`}
        fill="url(#equityGradient)"
      />
      <path d={pathD} fill="none" stroke="#00ff88" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={getX(i)} cy={getY(d.equity)} r="2" fill="#00ff88" />
      ))}
    </svg>
  );
}
