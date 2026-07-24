import { useState, useEffect, useCallback } from 'react';
import { Sliders, Play, RotateCcw, TrendingUp, Target, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuantStore } from '@/store/useQuantStore';
import { useMarketStore } from '@/store/useMarketStore';
import { runEnhancedBacktest } from '@/services/quant';

interface ParamConfig {
  name: string;
  key: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

const PARAM_CONFIGS: Record<string, ParamConfig[]> = {
  ma_trend: [
    { name: '短期均线', key: 'short_window', min: 5, max: 50, step: 1, defaultValue: 20 },
    { name: '长期均线', key: 'long_window', min: 20, max: 200, step: 5, defaultValue: 60 },
    { name: '突破阈值', key: 'breakout_threshold', min: 0.1, max: 5, step: 0.1, defaultValue: 0.5 },
  ],
  macd_momentum: [
    { name: '快速EMA', key: 'fast_period', min: 5, max: 30, step: 1, defaultValue: 12 },
    { name: '慢速EMA', key: 'slow_period', min: 10, max: 60, step: 1, defaultValue: 26 },
    { name: '信号周期', key: 'signal_period', min: 3, max: 20, step: 1, defaultValue: 9 },
  ],
  rsi_mean_reversion: [
    { name: 'RSI周期', key: 'rsi_period', min: 5, max: 30, step: 1, defaultValue: 14 },
    { name: '超卖阈值', key: 'oversold_threshold', min: 10, max: 45, step: 1, defaultValue: 30 },
    { name: '超买阈值', key: 'overbought_threshold', min: 55, max: 90, step: 1, defaultValue: 70 },
  ],
  bollinger_breakout: [
    { name: '均线周期', key: 'window', min: 10, max: 50, step: 2, defaultValue: 20 },
    { name: '标准差倍数', key: 'num_std', min: 1, max: 3, step: 0.1, defaultValue: 2 },
    { name: '带宽阈值', key: 'bandwidth_threshold', min: 0.01, max: 0.2, step: 0.01, defaultValue: 0.05 },
  ],
};

export function StrategyTuningPanel() {
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const strategies = useQuantStore((s) => s.strategies);
  const [selectedStrategy, setSelectedStrategy] = useState('ma_trend');
  const [params, setParams] = useState<Record<string, number>>({});
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const configs = PARAM_CONFIGS[selectedStrategy] || [];
    const defaultParams: Record<string, number> = {};
    configs.forEach((p) => {
      defaultParams[p.key] = p.defaultValue;
    });
    setParams(defaultParams);
    setBacktestResult(null);
  }, [selectedStrategy]);

  const handleParamChange = (key: string, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const runBacktest = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runEnhancedBacktest({
        symbol,
        timeframe: timeframe as any,
        strategy: selectedStrategy,
        params,
        initialCapital: 10000,
        limit: 500,
      });
      setBacktestResult(result);
    } catch (error) {
      console.error('回测失败:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, selectedStrategy, params]);

  const resetParams = () => {
    const configs = PARAM_CONFIGS[selectedStrategy] || [];
    const defaultParams: Record<string, number> = {};
    configs.forEach((p) => {
      defaultParams[p.key] = p.defaultValue;
    });
    setParams(defaultParams);
    setBacktestResult(null);
  };

  const configs = PARAM_CONFIGS[selectedStrategy] || [];
  const stats = backtestResult?.stats || {};

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">参数调优</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="rounded bg-void-200 border border-ink/20 px-2 py-0.5 font-mono text-[10px] text-ink focus:border-blue focus:outline-none"
          >
            {Object.entries(strategies).map(([key, s]) => (
              <option key={key} value={key}>
                {s.description || key}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {configs.map((param) => (
          <div key={param.key} className="rounded bg-void-200/50 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] text-ink">{param.name}</span>
              <span className="font-mono text-[10px] text-blue">
                {params[param.key]}{param.unit || ''}
              </span>
            </div>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={params[param.key]}
              onChange={(e) => handleParamChange(param.key, parseFloat(e.target.value))}
              className="w-full h-1 rounded-full bg-ink/20 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue"
            />
            <div className="flex justify-between font-mono text-[9px] text-ink-muted">
              <span>{param.min}</span>
              <span>{param.max}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={runBacktest}
          disabled={loading}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 rounded py-1.5 font-mono text-[10px] transition-colors',
            loading
              ? 'bg-ink/10 text-ink-muted'
              : 'bg-blue/20 text-blue hover:bg-blue/30',
          )}
        >
          {loading ? (
            <>
              <RotateCcw className="h-3 w-3 animate-spin" /> 回测中...
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> 运行回测
            </>
          )}
        </button>
        <button
          onClick={resetParams}
          className="rounded bg-ink/10 px-2 py-1.5 font-mono text-[10px] text-ink-muted hover:bg-ink/20 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {backtestResult && (
        <div className="rounded bg-void-200/50 p-2 space-y-2">
          <div className="font-mono text-[10px] font-bold text-ink mb-2">回测结果</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <TrendingUp className="h-4 w-4 mx-auto text-neon-green mb-1" />
              <div className={cn(
                'font-mono text-sm font-bold',
                stats.total_return >= 0 ? 'text-neon-green' : 'text-red',
              )}>
                {stats.total_return >= 0 ? '+' : ''}{stats.total_return?.toFixed(1)}%
              </div>
              <div className="font-mono text-[9px] text-ink-muted">总收益</div>
            </div>
            <div className="text-center">
              <Target className="h-4 w-4 mx-auto text-blue mb-1" />
              <div className={cn(
                'font-mono text-sm font-bold',
                stats.win_rate >= 50 ? 'text-neon-green' : 'text-yellow',
              )}>
                {stats.win_rate?.toFixed(1)}%
              </div>
              <div className="font-mono text-[9px] text-ink-muted">胜率</div>
            </div>
            <div className="text-center">
              <BarChart3 className="h-4 w-4 mx-auto text-yellow mb-1" />
              <div className="font-mono text-sm font-bold text-yellow">
                {stats.max_drawdown?.toFixed(1)}%
              </div>
              <div className="font-mono text-[9px] text-ink-muted">最大回撤</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="font-mono text-[10px]">
              <span className="text-ink-muted">总交易:</span>
              <span className="text-ink ml-1">{stats.total_trades}</span>
            </div>
            <div className="font-mono text-[10px]">
              <span className="text-ink-muted">盈亏比:</span>
              <span className="text-ink ml-1">{stats.profit_factor?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
