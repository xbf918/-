import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2, Settings, Activity, Zap, Clock, Target, Shield, Award, DollarSign, AlertTriangle, Bell, BellOff, LayoutGrid, Radio, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuantStore } from '@/store/useQuantStore';
import { useMarketStore } from '@/store/useMarketStore';
import { Panel } from '@/components/ui/Panel';
import { TimeframeResonanceCard } from './TimeframeResonanceCard';
import { SignalAccuracyCard } from './SignalAccuracyCard';
import { SignalHistoryList } from './SignalHistoryList';
import { PriceAlertPanel } from './PriceAlertPanel';
import { AISignalAnalysisCard } from './AISignalAnalysisCard';
import { StrategyTuningPanel } from './StrategyTuningPanel';
import { BacktestComparisonPanel } from './BacktestComparisonPanel';
import { LiveTradePanel } from './LiveTradePanel';
import { RealtimeAutoTradePanel } from './RealtimeAutoTradePanel';
import {
  fetchMarketRegime,
  fetchMultiStrategySignal,
  type MarketRegime,
  type MultiStrategySignal,
  type BacktestResult,
} from '@/services/quant';

const STRATEGY_NAMES: Record<string, string> = {
  ma_trend: '双均线趋势',
  rsi_mean_reversion: 'RSI均值回归',
  macd_momentum: 'MACD动量',
  bollinger_breakout: '布林带突破',
  grid_trading: '网格交易',
  ml_predict: 'ML预测',
};

function SignalBadge({ direction, strength }: { direction: string; strength: number }) {
  if (direction === 'long') {
    return (
      <div className="flex items-center gap-1 px-2 py-0.5 bg-neon-green/20 text-neon-green rounded">
        <TrendingUp className="w-3 h-3" />
        <span className="font-mono text-[10px]">做多 {(strength * 100).toFixed(0)}%</span>
      </div>
    );
  }
  if (direction === 'short') {
    return (
      <div className="flex items-center gap-1 px-2 py-0.5 bg-red/20 text-red rounded">
        <TrendingDown className="w-3 h-3" />
        <span className="font-mono text-[10px]">做空 {(strength * 100).toFixed(0)}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 bg-ink/20 text-ink-muted rounded">
      <Minus className="w-3 h-3" />
      <span className="font-mono text-[10px]">观望</span>
    </div>
  );
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = pct > 60 ? 'bg-neon-green' : pct > 30 ? 'bg-yellow' : 'bg-ink-muted';
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="font-mono text-[9px] text-ink-muted">{label}</span>
        <span className="font-mono text-[9px] text-ink">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-ink/10 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TradingPlanCard({
  direction,
  signals,
  confidence,
  backtestResult,
}: {
  direction: 'long' | 'short' | 'neutral' | string;
  signals: Array<{ strategy: string; name: string; signal: any; loading: boolean }>;
  confidence: number;
  backtestResult: BacktestResult | null;
}) {
  const activeSignals = signals.filter((s) => s.signal && s.signal.direction === direction && s.signal.entry_price > 0);

  if (activeSignals.length === 0) return null;

  const isLong = direction === 'long';

  // 计算共识价格（加权平均）
  let totalWeight = 0;
  let weightedEntry = 0;
  let weightedSL = 0;
  let weightedTP = 0;

  activeSignals.forEach((s) => {
    const w = s.signal.confidence * s.signal.strength + 0.1;
    weightedEntry += s.signal.entry_price * w;
    weightedSL += s.signal.stop_loss * w;
    weightedTP += s.signal.take_profit * w;
    totalWeight += w;
  });

  const entry = weightedEntry / totalWeight;
  const stopLoss = weightedSL / totalWeight;
  const takeProfit = weightedTP / totalWeight;

  // 风险收益比
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const rrRatio = risk > 0 ? reward / risk : 0;

  // 建议仓位（基于风险2%原则，假设10000U本金）
  const capital = 10000;
  const riskAmount = capital * 0.02;
  const positionSize = risk > 0 ? riskAmount / risk : 0;
  const positionValue = positionSize * entry;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border p-3',
        isLong
          ? 'border-neon-green/40 bg-gradient-to-br from-neon-green/10 to-transparent'
          : 'border-red/40 bg-gradient-to-br from-red/10 to-transparent',
      )}
    >
      {/* 顶部标题 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target className={cn('h-4 w-4', isLong ? 'text-neon-green' : 'text-red')} />
          <span className="font-mono text-xs font-bold text-ink">交易计划</span>
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold',
            isLong ? 'bg-neon-green/20 text-neon-green' : 'bg-red/20 text-red',
          )}
        >
          {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isLong ? '做多' : '做空'}
        </div>
      </div>

      {/* 价格目标三档 */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-neon-green" />
            <span className="font-mono text-[10px] text-ink-muted">止盈目标</span>
          </div>
          <span className="font-mono text-sm font-bold text-neon-green">{takeProfit.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-blue" />
            <span className="font-mono text-[10px] text-ink-muted">入场价格</span>
          </div>
          <span className="font-mono text-sm font-bold text-blue">{entry.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-red" />
            <span className="font-mono text-[10px] text-ink-muted">止损价格</span>
          </div>
          <span className="font-mono text-sm font-bold text-red">{stopLoss.toFixed(2)}</span>
        </div>
      </div>

      {/* 风险收益比 + 盈亏比 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded bg-void-200/50 p-2 text-center">
          <div className="font-mono text-lg font-bold text-amber-400">{rrRatio.toFixed(2)}</div>
          <div className="font-mono text-[9px] text-ink-muted">盈亏比 R:R</div>
        </div>
        <div className="rounded bg-void-200/50 p-2 text-center">
          <div className="font-mono text-lg font-bold text-neon-green">
            +{((reward / entry) * 100).toFixed(2)}%
          </div>
          <div className="font-mono text-[9px] text-ink-muted">目标收益</div>
        </div>
      </div>

      {/* 建议仓位 */}
      <div className="rounded bg-void-200/50 p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-[10px] text-ink-muted">建议仓位 (2%风险)</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-base font-bold text-ink">{positionSize.toFixed(4)}</span>
          <span className="font-mono text-[10px] text-ink-muted">≈ ${positionValue.toFixed(0)}</span>
        </div>
        <div className="mt-1 font-mono text-[9px] text-ink-muted">
          风险金额: ${riskAmount.toFixed(0)} · 置信度: {(confidence * 100).toFixed(0)}%
        </div>
      </div>

      {/* 历史战绩 */}
      {backtestResult && backtestResult.total_trades > 0 && (
        <div className="mt-2 rounded bg-void-200/50 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5 text-blue" />
            <span className="font-mono text-[10px] text-ink-muted">历史回测战绩</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div>
              <div className={cn(
                'font-mono text-sm font-bold',
                backtestResult.win_rate >= 0.5 ? 'text-neon-green' : 'text-yellow',
              )}>
                {(backtestResult.win_rate * 100).toFixed(1)}%
              </div>
              <div className="font-mono text-[9px] text-ink-muted">胜率</div>
            </div>
            <div>
              <div className="font-mono text-sm font-bold text-ink">
                {backtestResult.profit_factor.toFixed(2)}
              </div>
              <div className="font-mono text-[9px] text-ink-muted">盈亏比</div>
            </div>
            <div>
              <div className={cn(
                'font-mono text-sm font-bold',
                backtestResult.total_return_pct >= 0 ? 'text-neon-green' : 'text-red',
              )}>
                {backtestResult.total_return_pct >= 0 ? '+' : ''}
                {backtestResult.total_return_pct.toFixed(1)}%
              </div>
              <div className="font-mono text-[9px] text-ink-muted">总收益</div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-ink-muted">
            <span>交易次数: {backtestResult.total_trades}</span>
            <span>最大回撤: {backtestResult.max_drawdown_pct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* 警告 */}
      {confidence < 0.4 && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 p-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
          <span className="font-mono text-[9px] text-amber-300">
            置信度较低，建议轻仓或等待更明确的信号
          </span>
        </div>
      )}

      {rrRatio < 1.5 && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-orange-500/30 bg-orange-500/10 p-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-orange-400" />
          <span className="font-mono text-[9px] text-orange-300">
            盈亏比低于 1.5，不划算，建议等更好的入场机会
          </span>
        </div>
      )}
    </div>
  );
}

function RegimeBadge({ regime }: { regime: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    bull_trend: { label: '牛市趋势', color: 'text-neon-green', bg: 'bg-neon-green/20 border-neon-green/30' },
    bear_trend: { label: '熊市趋势', color: 'text-red', bg: 'bg-red/20 border-red/30' },
    bull_range: { label: '牛市震荡', color: 'text-yellow', bg: 'bg-yellow/20 border-yellow/30' },
    bear_range: { label: '熊市震荡', color: 'text-orange', bg: 'bg-orange/20 border-orange/30' },
    sideways: { label: '横盘整理', color: 'text-ink-muted', bg: 'bg-ink/20 border-ink/30' },
  };
  const c = config[regime] || config.sideways;
  return (
    <div className={cn('px-2 py-0.5 rounded border font-mono text-[10px]', c.color, c.bg)}>
      {c.label}
    </div>
  );
}

function VolatilityBadge({ vol }: { vol: string }) {
  const config: Record<string, { label: string; color: string }> = {
    low: { label: '低波动', color: 'text-neon-green' },
    normal: { label: '正常波动', color: 'text-yellow' },
    high: { label: '高波动', color: 'text-orange' },
    extreme: { label: '极端波动', color: 'text-red' },
  };
  const c = config[vol] || config.normal;
  return <span className={cn('font-mono text-[10px]', c.color)}>{c.label}</span>;
}

type TabType = 'signals' | 'autotrade' | 'alerts' | 'tuning' | 'backtest' | 'ai' | 'trading';

const TABS: Array<{ key: TabType; label: string; icon: typeof LayoutGrid }> = [
  { key: 'signals', label: '策略信号', icon: Activity },
  { key: 'autotrade', label: '自动交易', icon: Radio },
  { key: 'alerts', label: '价格监控', icon: Bell },
  { key: 'tuning', label: '参数调优', icon: LayoutGrid },
  { key: 'backtest', label: '回测对比', icon: GitCompare },
  { key: 'ai', label: 'AI解读', icon: Zap },
  { key: 'trading', label: '实盘交易', icon: DollarSign },
];

export function QuantStrategyPanel() {
  const {
    serverOnline,
    strategies,
    strategySignals,
    signalsLoading,
    selectedStrategies,
    backtestResult,
    checkServer,
    loadStrategies,
    fetchAllStrategySignals,
    toggleStrategy,
  } = useQuantStore();

  const { symbol, timeframe } = useMarketStore();
  const [activeTab, setActiveTab] = useState<TabType>('signals');
  const [showSettings, setShowSettings] = useState(false);
  const [marketRegime, setMarketRegime] = useState<MarketRegime | null>(null);
  const [combinedSignal, setCombinedSignal] = useState<MultiStrategySignal | null>(null);
  const [regimeLoading, setRegimeLoading] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'long' | 'short' } | null>(null);
  const prevDirectionRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkServer();
    loadStrategies();
  }, []);

  useEffect(() => {
    if (serverOnline && symbol) {
      fetchAllStrategySignals(symbol, timeframe);
      loadMarketRegime();
      loadCombinedSignal();
    }
  }, [symbol, timeframe, serverOnline]);

  const loadMarketRegime = async () => {
    try {
      setRegimeLoading(true);
      const res = await fetchMarketRegime(symbol, timeframe);
      setMarketRegime(res.regime);
    } catch (e) {
      console.error('Failed to load market regime:', e);
    } finally {
      setRegimeLoading(false);
    }
  };

  const loadCombinedSignal = async () => {
    try {
      const res = await fetchMultiStrategySignal(
        symbol,
        timeframe,
        selectedStrategies,
        {},
        true,
      );
      setCombinedSignal(res.combined_signal);
    } catch (e) {
      console.error('Failed to load combined signal:', e);
    }
  };

  const handleRefresh = () => {
    fetchAllStrategySignals(symbol, timeframe);
    loadMarketRegime();
    loadCombinedSignal();
  };

  // 信号方向变化检测 + 提醒
  useEffect(() => {
    if (!combinedSignal || !alertsEnabled) return;
    const dir = combinedSignal.direction;
    if (dir === 'neutral') {
      prevDirectionRef.current = dir;
      return;
    }
    const prev = prevDirectionRef.current;
    if (prev !== null && prev !== dir) {
      // 方向变化！触发提醒
      const msg = dir === 'long'
        ? `${symbol} 做多信号 · 置信度 ${(combinedSignal.confidence * 100).toFixed(0)}%`
        : `${symbol} 做空信号 · 置信度 ${(combinedSignal.confidence * 100).toFixed(0)}%`;

      // Toast 提醒
      setToast({ msg, type: dir as 'long' | 'short' });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 6000);

      // 声音提醒（Web Audio API，无需外部文件）
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = dir === 'long' ? 880 : 440;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {}

      // 浏览器通知
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('交易信号提醒', { body: msg });
      } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    prevDirectionRef.current = dir;
  }, [combinedSignal, alertsEnabled, symbol]);

  const signals = selectedStrategies.map((s) => {
    const key = `${s}_${symbol}_${timeframe}`;
    return {
      strategy: s,
      name: STRATEGY_NAMES[s] || s,
      signal: strategySignals[key]?.signal,
      loading: signalsLoading[key] || false,
    };
  });

  const longCount = signals.filter((s) => s.signal?.direction === 'long').length;
  const shortCount = signals.filter((s) => s.signal?.direction === 'short').length;
  const neutralCount = signals.filter((s) => s.signal?.direction === 'neutral').length;

  let overallDirection: 'long' | 'short' | 'neutral' = 'neutral';
  let overallStrength = 0;
  if (longCount > shortCount && longCount > neutralCount) {
    overallDirection = 'long';
    overallStrength = longCount / signals.length;
  } else if (shortCount > longCount && shortCount > neutralCount) {
    overallDirection = 'short';
    overallStrength = shortCount / signals.length;
  }

  return (
    <Panel
      title="量化策略"
      icon={<BarChart2 className="w-4 h-4" />}
      action={
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              serverOnline ? 'bg-neon-green animate-pulse' : 'bg-red',
            )}
          />
          <button
            onClick={() => setAlertsEnabled(!alertsEnabled)}
            className={cn(
              'p-1 rounded transition-colors',
              alertsEnabled ? 'text-yellow hover:bg-yellow/10' : 'text-ink-muted hover:bg-ink/10',
            )}
            title={alertsEnabled ? '关闭信号提醒' : '开启信号提醒'}
          >
            {alertsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 hover:bg-ink/10 rounded transition-colors"
            title="刷新"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', Object.values(signalsLoading).some(Boolean) && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-ink/10 rounded transition-colors"
            title="策略设置"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      }
    >
      <div className="flex border-b border-ink/10 mb-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] transition-colors relative',
                activeTab === tab.key
                  ? 'text-blue'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {activeTab === 'signals' && (
          <>
            {!serverOnline && (
              <div className="p-3 bg-red/10 rounded border border-red/20">
                <div className="font-mono text-xs text-red mb-1">量化服务未连接</div>
                <div className="font-mono text-[10px] text-ink-muted">
                  请启动 Python 量化后端 (端口 8001)
                </div>
              </div>
            )}

            {serverOnline && (
              <>
                {marketRegime && (
                  <div className="p-3 bg-gradient-to-br from-blue/5 to-purple/5 rounded-lg border border-blue/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-blue" />
                        <span className="font-mono text-xs text-ink-muted">市场状态</span>
                      </div>
                      <RegimeBadge regime={marketRegime.regime} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">波动率</span>
                        <VolatilityBadge vol={marketRegime.volatility} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">ADX</span>
                        <span className="font-mono text-ink">{marketRegime.adx.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">ATR比例</span>
                        <span className="font-mono text-ink">{marketRegime.atr_ratio.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">价格位置</span>
                        <span className="font-mono text-ink">{(marketRegime.price_position * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-gradient-to-br from-ink/5 to-ink/2 rounded-lg border border-ink/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow" />
                      <span className="font-mono text-xs text-ink-muted">综合信号 (动态权重)</span>
                    </div>
                    <SignalBadge
                      direction={combinedSignal?.direction || 'neutral'}
                      strength={combinedSignal?.strength || 0}
                    />
                  </div>
                  {combinedSignal && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center mb-2">
                        <div className="p-1.5 bg-neon-green/10 rounded">
                          <div className="font-mono text-sm text-neon-green">
                            {Object.values(combinedSignal.strategy_votes).filter(v => v.direction === 'long').length}
                          </div>
                          <div className="font-mono text-[9px] text-ink-muted">做多</div>
                        </div>
                        <div className="p-1.5 bg-ink/10 rounded">
                          <div className="font-mono text-sm text-ink">
                            {Object.values(combinedSignal.strategy_votes).filter(v => v.direction === 'neutral').length}
                          </div>
                          <div className="font-mono text-[9px] text-ink-muted">观望</div>
                        </div>
                        <div className="p-1.5 bg-red/10 rounded">
                          <div className="font-mono text-sm text-red">
                            {Object.values(combinedSignal.strategy_votes).filter(v => v.direction === 'short').length}
                          </div>
                          <div className="font-mono text-[9px] text-ink-muted">做空</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-ink-muted">一致性</span>
                        <span className="font-mono text-ink">{(combinedSignal.agreement * 100).toFixed(0)}%</span>
                      </div>
                      <ConfidenceBar value={combinedSignal.confidence} label="综合置信度" />
                    </>
                  )}
                </div>

                <TimeframeResonanceCard />

                {combinedSignal && combinedSignal.direction !== 'neutral' && (
                  <TradingPlanCard
                    direction={combinedSignal.direction}
                    signals={signals}
                    confidence={combinedSignal.confidence}
                    backtestResult={backtestResult}
                  />
                )}

                <SignalAccuracyCard />

                <div className="space-y-2">
                  {signals.map(({ strategy, name, signal, loading }) => (
                    <div
                      key={strategy}
                      className="p-2.5 bg-ink/[0.03] hover:bg-ink/[0.06] rounded-lg border border-ink/5 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs font-medium">{name}</span>
                          {combinedSignal?.strategy_votes?.[strategy] && (
                            <span className="font-mono text-[9px] text-blue/70">
                              ×{combinedSignal.strategy_votes[strategy].weight.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {loading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-ink-muted" />
                        ) : signal ? (
                          <SignalBadge direction={signal.direction} strength={signal.strength} />
                        ) : (
                          <span className="font-mono text-[10px] text-ink-muted">--</span>
                        )}
                      </div>

                      {signal && (
                        <>
                          <ConfidenceBar value={signal.confidence} label="置信度" />
                          <div className="mt-1.5 font-mono text-[10px] text-ink-muted line-clamp-1">
                            {signal.reason}
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                            <div>
                              <div className="font-mono text-[10px] text-ink">
                                {signal.entry_price.toFixed(2)}
                              </div>
                              <div className="font-mono text-[9px] text-ink-muted">入场</div>
                            </div>
                            <div>
                              <div className="font-mono text-[10px] text-red">
                                {signal.stop_loss?.toFixed(2)}
                              </div>
                              <div className="font-mono text-[9px] text-ink-muted">止损</div>
                            </div>
                            <div>
                              <div className="font-mono text-[10px] text-neon-green">
                                {signal.take_profit?.toFixed(2)}
                              </div>
                              <div className="font-mono text-[9px] text-ink-muted">止盈</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <SignalHistoryList />

                {showSettings && (
                  <div className="p-2.5 bg-ink/5 rounded-lg border border-ink/10">
                    <div className="font-mono text-xs text-ink mb-2">选择策略</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.keys(strategies).map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleStrategy(s)}
                          className={cn(
                            'px-2 py-1.5 rounded font-mono text-[10px] text-left transition-colors',
                            selectedStrategies.includes(s)
                              ? 'bg-blue/20 text-blue border border-blue/30'
                              : 'bg-ink/5 text-ink-muted border border-transparent hover:bg-ink/10',
                          )}
                        >
                          {STRATEGY_NAMES[s] || s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'autotrade' && <RealtimeAutoTradePanel />}

        {activeTab === 'alerts' && <PriceAlertPanel />}

        {activeTab === 'tuning' && <StrategyTuningPanel />}

        {activeTab === 'backtest' && <BacktestComparisonPanel />}

        {activeTab === 'ai' && <AISignalAnalysisCard />}

        {activeTab === 'trading' && <LiveTradePanel />}
      </div>

      {/* 信号变化 Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2',
            toast.type === 'long'
              ? 'border-neon-green/40 bg-neon-green/10'
              : 'border-red/40 bg-red/10',
          )}
        >
          {toast.type === 'long'
            ? <TrendingUp className="h-5 w-5 text-neon-green" />
            : <TrendingDown className="h-5 w-5 text-red" />}
          <div>
            <div className="font-mono text-xs font-bold text-ink">{toast.msg}</div>
            <div className="font-mono text-[10px] text-ink-muted">
              {toast.type === 'long' ? '做多机会' : '做空机会'} · 信号方向已变化
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
