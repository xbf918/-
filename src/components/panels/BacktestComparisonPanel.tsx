import { useState, useMemo } from 'react';
import { BarChart3, Activity, Target, TrendingUp, TrendingDown, Minus, RotateCcw, Layers, Grid3X3, Dice5 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMarketStore } from '@/store/useMarketStore';
import { useQuantStore } from '@/store/useQuantStore';
import {
  runEnhancedBacktest,
  runSensitivityAnalysis,
  runMonteCarloSimulation,
  runPortfolioOptimization,
  type BacktestResult,
  type SensitivityResponse,
  type MonteCarloResponse,
  type PortfolioResponse,
} from '@/services/quant';

type SubTab = 'compare' | 'sensitivity' | 'monte_carlo';

const STRATEGY_NAMES: Record<string, string> = {
  ma_trend: '双均线趋势',
  rsi_mean_reversion: 'RSI均值回归',
  macd_momentum: 'MACD动量',
  bollinger_breakout: '布林带突破',
  grid_trading: '网格交易',
  ml_predict: 'ML预测',
};

const PARAM_RANGES: Record<string, Record<string, number[]>> = {
  ma_trend: {
    short_window: [5, 10, 15, 20, 30, 40, 50],
    long_window: [30, 40, 50, 60, 80, 100, 120, 150],
  },
  macd_momentum: {
    fast_period: [5, 8, 10, 12, 15, 20],
    slow_period: [15, 20, 26, 30, 40, 50],
  },
  rsi_mean_reversion: {
    rsi_period: [7, 10, 14, 18, 21, 25],
    oversold_threshold: [15, 20, 25, 30, 35, 40],
  },
  bollinger_breakout: {
    window: [10, 15, 20, 25, 30, 40],
    num_std: [1.2, 1.5, 1.8, 2.0, 2.2, 2.5],
  },
};

export function BacktestComparisonPanel() {
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const strategies = useQuantStore((s) => s.strategies);
  const [subTab, setSubTab] = useState<SubTab>('compare');
  const [loading, setLoading] = useState(false);

  const [compareResults, setCompareResults] = useState<BacktestResult[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(['ma_trend', 'rsi_mean_reversion']);

  const [sensitivityStrategy, setSensitivityStrategy] = useState('ma_trend');
  const [xParam, setXParam] = useState('short_window');
  const [yParam, setYParam] = useState('long_window');
  const [sensitivityResult, setSensitivityResult] = useState<SensitivityResponse | null>(null);

  const [monteStrategy, setMonteStrategy] = useState('ma_trend');
  const [monteResult, setMonteResult] = useState<MonteCarloResponse | null>(null);

  const [portfolioResult, setPortfolioResult] = useState<PortfolioResponse | null>(null);

  const strategyKeys = useMemo(() => Object.keys(strategies), [strategies]);

  const runComparison = async () => {
    setLoading(true);
    try {
      const results: BacktestResult[] = [];
      for (const strategy of selectedStrategies) {
        try {
          const res = await runEnhancedBacktest({
            symbol,
            timeframe: timeframe as any,
            strategy,
            params: {},
            initialCapital: 10000,
            limit: 500,
          });
          if (res.result) results.push(res.result);
        } catch (e) {
          console.error(`回测 ${strategy} 失败`, e);
        }
      }
      setCompareResults(results);

      if (selectedStrategies.length >= 2) {
        try {
          const portfolio = await runPortfolioOptimization({
            symbol,
            timeframe: timeframe as any,
            strategies: selectedStrategies,
            method: 'sharpe',
            limit: 500,
          });
          setPortfolioResult(portfolio);
        } catch (e) {
          console.error('组合优化失败', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const runSensitivity = async () => {
    setLoading(true);
    try {
      const ranges = PARAM_RANGES[sensitivityStrategy] || {};
      const paramGrid: Record<string, any[]> = {};
      if (ranges[xParam]) paramGrid[xParam] = ranges[xParam];
      if (yParam !== xParam && ranges[yParam]) paramGrid[yParam] = ranges[yParam];

      const res = await runSensitivityAnalysis({
        symbol,
        timeframe: timeframe as any,
        strategy: sensitivityStrategy,
        paramGrid,
        limit: 500,
      });
      setSensitivityResult(res);
    } finally {
      setLoading(false);
    }
  };

  const runMonteCarlo = async () => {
    setLoading(true);
    try {
      const res = await runMonteCarloSimulation({
        symbol,
        timeframe: timeframe as any,
        strategy: monteStrategy,
        numSimulations: 200,
        limit: 500,
      });
      setMonteResult(res);
    } finally {
      setLoading(false);
    }
  };

  const toggleStrategy = (key: string) => {
    setSelectedStrategies((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">策略回测对比</span>
        </div>
      </div>

      <div className="mb-3 flex border-b border-ink/10">
        <SubTabButton active={subTab === 'compare'} onClick={() => setSubTab('compare')} icon={Layers} label="多策略对比" />
        <SubTabButton active={subTab === 'sensitivity'} onClick={() => setSubTab('sensitivity')} icon={Grid3X3} label="敏感性热力图" />
        <SubTabButton active={subTab === 'monte_carlo'} onClick={() => setSubTab('monte_carlo')} icon={Dice5} label="蒙特卡洛" />
      </div>

      {subTab === 'compare' && (
        <div className="space-y-3">
          <div className="rounded bg-void-200/50 p-2">
            <div className="mb-2 font-mono text-[10px] text-ink-muted">选择要对比的策略</div>
            <div className="flex flex-wrap gap-1">
              {strategyKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => toggleStrategy(key)}
                  className={cn(
                    'rounded px-2 py-1 font-mono text-[9px] transition-colors',
                    selectedStrategies.includes(key)
                      ? 'bg-blue/20 text-blue border border-blue/30'
                      : 'bg-ink/5 text-ink-muted border border-transparent hover:bg-ink/10'
                  )}
                >
                  {STRATEGY_NAMES[key] || key}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runComparison}
            disabled={loading || selectedStrategies.length === 0}
            className={cn(
              'flex w-full items-center justify-center gap-1 rounded py-1.5 font-mono text-[10px] transition-colors',
              loading ? 'bg-ink/10 text-ink-muted' : 'bg-blue/20 text-blue hover:bg-blue/30'
            )}
          >
            {loading ? <RotateCcw className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
            {loading ? '运行中...' : '运行对比回测'}
          </button>

          {compareResults.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[9px]">
                  <thead>
                    <tr className="text-ink-muted border-b border-ink/10">
                      <th className="py-1 pr-2">策略</th>
                      <th className="py-1 pr-2">总收益</th>
                      <th className="py-1 pr-2">胜率</th>
                      <th className="py-1 pr-2">盈亏比</th>
                      <th className="py-1 pr-2">最大回撤</th>
                      <th className="py-1 pr-2">夏普</th>
                      <th className="py-1 pr-2">交易次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareResults.map((r) => (
                      <tr key={r.strategy} className="border-b border-ink/5">
                        <td className="py-1 pr-2 text-ink">{STRATEGY_NAMES[r.strategy] || r.strategy}</td>
                        <td className={cn('py-1 pr-2', r.total_return_pct >= 0 ? 'text-neon-green' : 'text-red')}>
                          {r.total_return_pct >= 0 ? '+' : ''}{r.total_return_pct.toFixed(1)}%
                        </td>
                        <td className="py-1 pr-2 text-ink">{r.win_rate.toFixed(1)}%</td>
                        <td className="py-1 pr-2 text-ink">{r.profit_factor.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-red">-{r.max_drawdown_pct.toFixed(1)}%</td>
                        <td className="py-1 pr-2 text-ink">{r.sharpe_ratio.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-ink">{r.total_trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {portfolioResult && (
                <div className="rounded bg-void-200/50 p-2">
                  <div className="mb-2 font-mono text-[10px] text-ink-muted">组合优化权重（夏普最大化）</div>
                  <div className="space-y-1">
                    {Object.entries(portfolioResult.optimal_weights).map(([strategy, weight]) => (
                      <div key={strategy} className="flex items-center justify-between font-mono text-[9px]">
                        <span className="text-ink">{STRATEGY_NAMES[strategy] || strategy}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-blue"
                              style={{ width: `${Math.round(weight * 100)}%` }}
                            />
                          </div>
                          <span className="text-blue w-8 text-right">{(weight * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <MetricBox label="组合收益" value={`${portfolioResult.optimal.return.toFixed(1)}%`} color="neon-green" />
                    <MetricBox label="组合夏普" value={portfolioResult.optimal.sharpe.toFixed(2)} color="blue" />
                    <MetricBox label="最大回撤" value={`-${portfolioResult.optimal.max_dd.toFixed(1)}%`} color="red" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'sensitivity' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <select
              value={sensitivityStrategy}
              onChange={(e) => {
                setSensitivityStrategy(e.target.value);
                const ranges = Object.keys(PARAM_RANGES[e.target.value] || {});
                if (ranges.length >= 2) {
                  setXParam(ranges[0]);
                  setYParam(ranges[1]);
                }
              }}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            >
              {strategyKeys.map((key) => (
                <option key={key} value={key}>{STRATEGY_NAMES[key] || key}</option>
              ))}
            </select>
            <select
              value={xParam}
              onChange={(e) => setXParam(e.target.value)}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            >
              {Object.keys(PARAM_RANGES[sensitivityStrategy] || {}).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={yParam}
              onChange={(e) => setYParam(e.target.value)}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            >
              {Object.keys(PARAM_RANGES[sensitivityStrategy] || {}).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <button
            onClick={runSensitivity}
            disabled={loading}
            className={cn(
              'flex w-full items-center justify-center gap-1 rounded py-1.5 font-mono text-[10px] transition-colors',
              loading ? 'bg-ink/10 text-ink-muted' : 'bg-blue/20 text-blue hover:bg-blue/30'
            )}
          >
            {loading ? <RotateCcw className="h-3 w-3 animate-spin" /> : <Grid3X3 className="h-3 w-3" />}
            {loading ? '计算中...' : '生成热力图'}
          </button>

          {sensitivityResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <MetricBox label="稳健性评分" value={sensitivityResult.robustness_score.toFixed(1)} color="blue" />
                <MetricBox label="高原占比" value={`${(sensitivityResult.plateau_ratio * 100).toFixed(0)}%`} color="neon-green" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-[9px]">
                  <thead>
                    <tr>
                      <th className="border border-ink/10 bg-void-100 p-1 text-ink-muted">{yParam} \ {xParam}</th>
                      {sensitivityResult.heatmap.x_values.map((v) => (
                        <th key={v} className="border border-ink/10 bg-void-100 p-1 text-ink-muted">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivityResult.heatmap.y_values.map((y, yIdx) => (
                      <tr key={y}>
                        <td className="border border-ink/10 bg-void-100 p-1 text-ink-muted">{y}</td>
                        {sensitivityResult.heatmap.return_matrix[yIdx]?.map((val, xIdx) => {
                          const max = Math.max(...sensitivityResult.heatmap.return_matrix.flat());
                          const min = Math.min(...sensitivityResult.heatmap.return_matrix.flat());
                          const ratio = max !== min ? (val - min) / (max - min) : 0.5;
                          const bg = val >= 0
                            ? `rgba(34, 197, 94, ${0.1 + ratio * 0.4})`
                            : `rgba(239, 68, 68, ${0.1 + (1 - ratio) * 0.4})`;
                          return (
                            <td
                              key={`${yIdx}-${xIdx}`}
                              className="border border-ink/10 p-1 text-center"
                              style={{ backgroundColor: bg }}
                            >
                              {val.toFixed(1)}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded bg-void-200/50 p-2">
                <div className="mb-1 font-mono text-[10px] text-ink-muted">Top 3 参数组合</div>
                <div className="space-y-1">
                  {sensitivityResult.top_results.slice(0, 3).map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between font-mono text-[9px]">
                      <span className="text-ink">{Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                      <span className={cn(r.total_return >= 0 ? 'text-neon-green' : 'text-red')}>
                        {r.total_return.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'monte_carlo' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={monteStrategy}
              onChange={(e) => setMonteStrategy(e.target.value)}
              className="flex-1 rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            >
              {strategyKeys.map((key) => (
                <option key={key} value={key}>{STRATEGY_NAMES[key] || key}</option>
              ))}
            </select>
            <button
              onClick={runMonteCarlo}
              disabled={loading}
              className={cn(
                'flex items-center justify-center gap-1 rounded px-3 py-1.5 font-mono text-[10px] transition-colors',
                loading ? 'bg-ink/10 text-ink-muted' : 'bg-blue/20 text-blue hover:bg-blue/30'
              )}
            >
              {loading ? <RotateCcw className="h-3 w-3 animate-spin" /> : <Dice5 className="h-3 w-3" />}
              {loading ? '模拟中...' : '运行'}
            </button>
          </div>

          {monteResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <MetricBox label="破产概率" value={`${(monteResult.ruin_probability * 100).toFixed(1)}%`} color="red" />
                <MetricBox label="盈利概率" value={`${(monteResult.positive_probability * 100).toFixed(1)}%`} color="neon-green" />
                <MetricBox label="均值终值" value={`$${monteResult.final_equity.mean.toFixed(0)}`} color="blue" />
                <MetricBox label="中位数终值" value={`$${monteResult.final_equity.median.toFixed(0)}`} color="blue" />
              </div>

              <div className="rounded bg-void-200/50 p-2">
                <div className="mb-2 font-mono text-[10px] text-ink-muted">最终权益分位数</div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
                  {Object.entries(monteResult.final_equity.percentiles).map(([p, v]) => (
                    <div key={p} className="flex justify-between rounded bg-void-100 px-2 py-1">
                      <span className="text-ink-muted">{p}</span>
                      <span className="text-ink">${v.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded bg-void-200/50 p-2">
                <div className="mb-2 font-mono text-[10px] text-ink-muted">最大回撤分位数</div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
                  {Object.entries(monteResult.max_drawdown.percentiles).map(([p, v]) => (
                    <div key={p} className="flex justify-between rounded bg-void-100 px-2 py-1">
                      <span className="text-ink-muted">{p}</span>
                      <span className="text-red">-{v.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {monteResult.sample_simulations.length > 0 && (
                <MiniEquityChart simulations={monteResult.sample_simulations} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubTabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] transition-colors relative',
        active ? 'text-blue' : 'text-ink-muted hover:text-ink'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
      {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue rounded-t" />}
    </button>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClass = color === 'neon-green' ? 'text-neon-green' : color === 'red' ? 'text-red' : 'text-blue';
  return (
    <div className="rounded bg-void-200/50 p-2 text-center">
      <div className={cn('font-mono text-sm font-bold', colorClass)}>{value}</div>
      <div className="font-mono text-[9px] text-ink-muted">{label}</div>
    </div>
  );
}

function MiniEquityChart({ simulations }: { simulations: number[][] }) {
  const width = 280;
  const height = 80;
  const padding = 5;
  const allValues = simulations.flat();
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const pathFor = (data: number[]) => {
    const stepX = (width - padding * 2) / (data.length - 1);
    return data
      .map((v, i) => {
        const x = padding + i * stepX;
        const y = height - padding - ((v - min) / range) * (height - padding * 2);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  return (
    <div className="rounded bg-void-200/50 p-2">
      <div className="mb-1 font-mono text-[10px] text-ink-muted">样本路径</div>
      <svg width={width} height={height} className="w-full">
        {simulations.slice(0, 10).map((sim, idx) => (
          <path
            key={idx}
            d={pathFor(sim)}
            fill="none"
            stroke={idx === 0 ? '#3b82f6' : '#94a3b8'}
            strokeWidth={idx === 0 ? 1.5 : 0.5}
            opacity={idx === 0 ? 1 : 0.4}
          />
        ))}
      </svg>
    </div>
  );
}
