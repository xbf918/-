/**
 * 实时自动交易控制面板
 * 实时监控信号变化，毫秒级响应自动交易
 */
import { useState, useEffect } from 'react';
import { Zap, ZapOff, TrendingUp, TrendingDown, Shield, AlertTriangle, Activity, Play, Pause, Settings, CheckCircle, XCircle, BarChart3, TrendingDown as DrawdownIcon, Percent, Layers, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMultiAgentStore } from '@/store/useMultiAgentStore';
import { useMarketStore } from '@/store/useMarketStore';
import { useRealtimeAutoTrading } from '@/hooks/useRealtimeAutoTrading';
import { useExchangeStore } from '@/store/useExchangeStore';
import type { RiskState } from '@/lib/risk/advancedRiskManager';

export function RealtimeAutoTradePanel() {
  const combinedSignal = useMultiAgentStore((s) => s.combinedSignal);
  const settings = useMultiAgentStore((s) => s.settings);
  const updateSetting = useMultiAgentStore((s) => s.updateSetting);
  const ticker = useMarketStore((s) => s.ticker);
  const symbol = useMarketStore((s) => s.symbol);
  const exchangeMode = useExchangeStore((s) => s.mode);
  const activeExchange = useExchangeStore((s) => s.activeExchange);

  const [activeTab, setActiveTab] = useState<'overview' | 'risk'>('overview');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [riskState, setRiskState] = useState<RiskState | null>(null);

  const { lastTradeTime, tradeCount, getRiskState, resumeTrading } = useRealtimeAutoTrading();

  useEffect(() => {
    const timer = setInterval(() => {
      setRiskState(getRiskState());
    }, 1000);
    return () => clearInterval(timer);
  }, [getRiskState]);

  useEffect(() => {
    if (lastTradeTime <= 0) return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastTradeTime;
      const remaining = Math.max(0, settings.riskManagement.positionCooldown - elapsed);
      setCountdown(Math.ceil(remaining / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastTradeTime, settings.riskManagement.positionCooldown]);

  const signalDirection = combinedSignal?.direction || 'neutral';
  const signalConfidence = combinedSignal?.confidence || 0;
  const signalStrength = combinedSignal?.strength || 0;
  const canTrade = signalDirection !== 'neutral' &&
    signalConfidence >= settings.minConfidence &&
    signalStrength >= settings.minStrength;

  const toggleAutoTrade = () => {
    updateSetting('autoTrade', !settings.autoTrade);
  };

  const updateRiskSetting = (key: string, value: any) => {
    updateSetting('riskManagement', {
      ...settings.riskManagement,
      [key]: value,
    });
  };

  const getStrengthColor = (strength: number) => {
    if (strength >= 0.4) return 'text-neon-green';
    if (strength >= 0.2) return 'text-yellow';
    return 'text-ink-muted';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-neon-green';
    if (confidence >= 0.5) return 'text-yellow';
    return 'text-red';
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'safe': return 'text-neon-green';
      case 'warning': return 'text-yellow';
      case 'danger': return 'text-red';
      default: return 'text-ink-muted';
    }
  };

  const getRiskLevelBg = (level: string) => {
    switch (level) {
      case 'safe': return 'bg-neon-green/20 text-neon-green';
      case 'warning': return 'bg-yellow/20 text-yellow';
      case 'danger': return 'bg-red/20 text-red';
      default: return 'bg-ink/10 text-ink-muted';
    }
  };

  const ProgressBar = ({ value, max, colorClass }: { value: number; max: number; colorClass?: string }) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass || (pct >= 80 ? 'bg-red' : pct >= 50 ? 'bg-yellow' : 'bg-neon-green'))}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {settings.autoTrade ? (
            <Zap className="h-3.5 w-3.5 text-yellow animate-pulse" />
          ) : (
            <ZapOff className="h-3.5 w-3.5 text-ink-muted" />
          )}
          <span className="font-mono text-xs font-bold text-ink">实时自动交易</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'px-2 py-0.5 rounded font-mono text-[9px]',
            exchangeMode === 'live'
              ? 'bg-neon-green/20 text-neon-green'
              : 'bg-blue/20 text-blue'
          )}>
            {exchangeMode === 'live' ? '实盘' : '模拟'}
          </span>
          <button
            onClick={toggleAutoTrade}
            className={cn(
              'flex items-center gap-1 px-3 py-1 rounded font-mono text-[10px] font-bold transition-all',
              settings.autoTrade
                ? 'bg-neon-green/20 text-neon-green border border-neon-green/50 hover:bg-neon-green/30'
                : 'bg-ink/10 text-ink-muted border border-ink/20 hover:bg-ink/20'
            )}
          >
            {settings.autoTrade ? (
              <><Zap className="h-3 w-3" />运行中</>
            ) : (
              <><Play className="h-3 w-3" />已暂停</>
            )}
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 mb-3 p-1 rounded bg-ink/5">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1 rounded font-mono text-[10px] font-bold transition-all',
            activeTab === 'overview' ? 'bg-void-200 text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          )}
        >
          <Activity className="h-3 w-3" />
          概览
        </button>
        <button
          onClick={() => setActiveTab('risk')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1 rounded font-mono text-[10px] font-bold transition-all',
            activeTab === 'risk' ? 'bg-void-200 text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          )}
        >
          <Shield className="h-3 w-3" />
          风控
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* 状态指示灯 */}
          <div className="flex items-center gap-4 mb-3 p-2 rounded bg-ink/5">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'w-2 h-2 rounded-full',
                settings.autoTrade && canTrade ? 'bg-neon-green animate-pulse' : 'bg-ink/30'
              )} />
              <span className="font-mono text-[9px] text-ink-muted">信号监听</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'w-2 h-2 rounded-full',
                countdown <= 0 ? 'bg-neon-green' : 'bg-yellow'
              )} />
              <span className="font-mono text-[9px] text-ink-muted">
                {countdown > 0 ? `冷却 ${countdown}s` : '就绪'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-blue" />
              <span className="font-mono text-[9px] text-ink-muted">
                今日 {tradeCount} 笔
              </span>
            </div>
          </div>

          {/* 当前信号状态 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-ink-muted">当前信号</span>
              <div className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold',
                signalDirection === 'long'
                  ? 'bg-neon-green/20 text-neon-green'
                  : signalDirection === 'short'
                    ? 'bg-red/20 text-red'
                    : 'bg-ink/10 text-ink-muted'
              )}>
                {signalDirection === 'long' && <TrendingUp className="h-3 w-3" />}
                {signalDirection === 'short' && <TrendingDown className="h-3 w-3" />}
                {signalDirection === 'long' ? '看涨' : signalDirection === 'short' ? '看跌' : '观望'}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono text-[9px] text-ink-muted">强度</span>
                  <span className={cn('font-mono text-[9px]', getStrengthColor(signalStrength))}>
                    {(signalStrength * 100).toFixed(0)}% {signalStrength >= settings.minStrength ? '✓' : '✗'}
                  </span>
                </div>
                <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      signalStrength >= 0.4 ? 'bg-neon-green' : signalStrength >= 0.2 ? 'bg-yellow' : 'bg-ink/30'
                    )}
                    style={{ width: `${signalStrength * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono text-[9px] text-ink-muted">置信度</span>
                  <span className={cn('font-mono text-[9px]', getConfidenceColor(signalConfidence))}>
                    {(signalConfidence * 100).toFixed(0)}% {signalConfidence >= settings.minConfidence ? '✓' : '✗'}
                  </span>
                </div>
                <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      signalConfidence >= 0.7 ? 'bg-neon-green' : signalConfidence >= 0.5 ? 'bg-yellow' : 'bg-red'
                    )}
                    style={{ width: `${signalConfidence * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className={cn(
              'mt-2 p-1.5 rounded font-mono text-[10px] text-center',
              canTrade
                ? 'bg-neon-green/10 text-neon-green'
                : 'bg-ink/5 text-ink-muted'
            )}>
              {canTrade ? (
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  满足交易条件
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {signalDirection === 'neutral' ? '等待信号' : '未达阈值'}
                </div>
              )}
            </div>
          </div>

          {/* 风控设置 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-blue" />
                <span className="font-mono text-[10px] text-ink-muted">风控参数</span>
              </div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="p-0.5 rounded hover:bg-ink/10"
              >
                <Settings className="h-3 w-3 text-ink-muted" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">最小置信度:</span>
                <span className="text-ink">{(settings.minConfidence * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">最小强度:</span>
                <span className="text-ink">{(settings.minStrength * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">杠杆:</span>
                <span className="text-blue">{settings.defaultLeverage}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">冷却:</span>
                <span className="text-ink">{settings.riskManagement.positionCooldown / 60000}分钟</span>
              </div>
            </div>

            {showAdvanced && (
              <div className="mt-2 pt-2 border-t border-ink/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-ink-muted">置信度阈值</span>
                  <input
                    type="range"
                    min={0.5}
                    max={0.9}
                    step={0.05}
                    value={settings.minConfidence}
                    onChange={(e) => updateSetting('minConfidence', parseFloat(e.target.value))}
                    className="w-24 h-1"
                  />
                  <span className="font-mono text-[9px] text-ink w-8 text-right">
                    {(settings.minConfidence * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-ink-muted">强度阈值</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.5}
                    step={0.05}
                    value={settings.minStrength}
                    onChange={(e) => updateSetting('minStrength', parseFloat(e.target.value))}
                    className="w-24 h-1"
                  />
                  <span className="font-mono text-[9px] text-ink w-8 text-right">
                    {(settings.minStrength * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-ink-muted">杠杆倍数</span>
                  <select
                    value={settings.defaultLeverage}
                    onChange={(e) => updateSetting('defaultLeverage', parseInt(e.target.value))}
                    className="bg-void-200 border border-ink/20 rounded px-2 py-0.5 font-mono text-[9px] text-ink"
                  >
                    {[1, 2, 3, 5, 10, 20].map(l => (
                      <option key={l} value={l}>{l}x</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 交易建议 */}
          {combinedSignal && canTrade && ticker && (
            <div className={cn(
              'rounded p-2 mb-3 border',
              signalDirection === 'long'
                ? 'bg-neon-green/5 border-neon-green/30'
                : 'bg-red/5 border-red/30'
            )}>
              <div className="font-mono text-[10px] text-ink-muted mb-1">交易计划</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className={cn(
                    'font-mono text-sm font-bold',
                    signalDirection === 'long' ? 'text-neon-green' : 'text-red'
                  )}>
                    {signalDirection === 'long' ? '开多' : '开空'}
                  </div>
                  <div className="font-mono text-[9px] text-ink-muted">方向</div>
                </div>
                <div>
                  <div className="font-mono text-sm font-bold text-ink">
                    ${combinedSignal.entryZone?.lower?.toFixed(2) || ticker.lastPrice.toFixed(2)}
                  </div>
                  <div className="font-mono text-[9px] text-ink-muted">入场价</div>
                </div>
                <div>
                  <div className="font-mono text-sm font-bold text-blue">
                    {settings.defaultLeverage}x
                  </div>
                  <div className="font-mono text-[9px] text-ink-muted">杠杆</div>
                </div>
              </div>
            </div>
          )}

          {!settings.autoTrade && (
            <div className="flex items-start gap-1.5 rounded border border-yellow/30 bg-yellow/10 p-2">
              <AlertTriangle className="h-3 w-3 shrink-0 text-yellow mt-0.5" />
              <div className="font-mono text-[9px] text-yellow-200">
                自动交易已暂停，信号满足条件时不会自动执行交易
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 风控状态总览 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-blue" />
                <span className="font-mono text-[10px] text-ink-muted">风控状态</span>
              </div>
              {riskState?.tradingPaused ? (
                <button
                  onClick={resumeTrading}
                  className="flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-neon-green/20 text-neon-green hover:bg-neon-green/30"
                >
                  <Play className="h-3 w-3" />
                  恢复交易
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-neon-green/20 text-neon-green">
                  运行中
                </span>
              )}
            </div>

            {riskState?.tradingPaused ? (
              <div className="flex items-start gap-1.5 rounded border border-red/30 bg-red/10 p-2 mb-2">
                <AlertTriangle className="h-3 w-3 shrink-0 text-red mt-0.5" />
                <div className="font-mono text-[9px] text-red-200">
                  {riskState.pauseReason || '交易已暂停'}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-mono text-sm font-bold text-ink">
                  ${riskState?.currentEquity.toFixed(2) || '0.00'}
                </div>
                <div className="font-mono text-[9px] text-ink-muted">当前权益</div>
              </div>
              <div>
                <div className={cn(
                  'font-mono text-sm font-bold',
                  (riskState?.dailyPnl || 0) >= 0 ? 'text-neon-green' : 'text-red'
                )}>
                  {riskState?.dailyPnlPercent >= 0 ? '+' : ''}
                  {(riskState?.dailyPnlPercent || 0).toFixed(2)}%
                </div>
                <div className="font-mono text-[9px] text-ink-muted">今日盈亏</div>
              </div>
              <div>
                <div className={cn(
                  'font-mono text-sm font-bold',
                  (riskState?.currentDrawdownPercent || 0) > 10 ? 'text-red' : 'text-yellow'
                )}>
                  {(riskState?.currentDrawdownPercent || 0).toFixed(2)}%
                </div>
                <div className="font-mono text-[9px] text-ink-muted">当前回撤</div>
              </div>
            </div>
          </div>

          {/* 回撤监控 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center gap-1 mb-2">
              <DrawdownIcon className="h-3 w-3 text-red" />
              <span className="font-mono text-[10px] text-ink-muted">回撤监控</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[9px] text-ink-muted">
                当前 {riskState?.currentDrawdownPercent.toFixed(1) || 0}% / 上限 {settings.riskManagement.maxDrawdownPercent || 15}%
              </span>
              <span className={cn('font-mono text-[9px]', getRiskLevelColor(
                (riskState?.currentDrawdownPercent || 0) >= (settings.riskManagement.maxDrawdownPercent || 15) ? 'danger' :
                  (riskState?.currentDrawdownPercent || 0) >= (settings.riskManagement.maxDrawdownPercent || 15) * 0.7 ? 'warning' : 'safe'
              ))}>
                {(riskState?.currentDrawdownPercent || 0) >= (settings.riskManagement.maxDrawdownPercent || 15) ? '危险' :
                  (riskState?.currentDrawdownPercent || 0) >= (settings.riskManagement.maxDrawdownPercent || 15) * 0.7 ? '警告' : '安全'}
              </span>
            </div>
            <ProgressBar
              value={riskState?.currentDrawdownPercent || 0}
              max={settings.riskManagement.maxDrawdownPercent || 15}
            />
            <div className="grid grid-cols-2 gap-2 mt-2 text-[9px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">峰值权益:</span>
                <span className="text-ink">${riskState?.peakEquity.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">最大回撤:</span>
                <span className="text-red">{riskState?.maxDrawdownPercent.toFixed(1) || 0}%</span>
              </div>
            </div>
          </div>

          {/* 日盈亏监控 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center gap-1 mb-2">
              <BarChart3 className="h-3 w-3 text-neon-green" />
              <span className="font-mono text-[10px] text-ink-muted">日盈亏监控</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[9px] text-ink-muted">
                {riskState?.dailyPnlPercent.toFixed(1) || 0}% / -{settings.riskManagement.maxDailyLossPercent || 5}% 上限
              </span>
              <span className={cn('font-mono text-[9px]', getRiskLevelColor(
                Math.abs(riskState?.dailyPnlPercent || 0) >= (settings.riskManagement.maxDailyLossPercent || 5) ? 'danger' :
                  Math.abs(riskState?.dailyPnlPercent || 0) >= (settings.riskManagement.maxDailyLossPercent || 5) * 0.7 ? 'warning' : 'safe'
              ))}>
                {Math.abs(riskState?.dailyPnlPercent || 0) >= (settings.riskManagement.maxDailyLossPercent || 5) ? '危险' :
                  Math.abs(riskState?.dailyPnlPercent || 0) >= (settings.riskManagement.maxDailyLossPercent || 5) * 0.7 ? '警告' : '安全'}
              </span>
            </div>
            <ProgressBar
              value={Math.abs(riskState?.dailyPnlPercent || 0)}
              max={settings.riskManagement.maxDailyLossPercent || 5}
            />
            <div className="grid grid-cols-2 gap-2 mt-2 text-[9px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">今日交易:</span>
                <span className="text-ink">{riskState?.totalTradesToday || 0} 笔</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">今日胜率:</span>
                <span className={cn(
                  (riskState?.winTradesToday || 0) >= (riskState?.lossTradesToday || 0) ? 'text-neon-green' : 'text-red'
                )}>
                  {riskState?.totalTradesToday ? ((riskState?.winTradesToday || 0) / riskState.totalTradesToday * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* 连续盈亏 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center gap-1 mb-2">
              <TrendingUp className="h-3 w-3 text-blue" />
              <span className="font-mono text-[10px] text-ink-muted">连续盈亏</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded bg-neon-green/10 p-2">
                <div className="font-mono text-sm font-bold text-neon-green">{riskState?.consecutiveWins || 0}</div>
                <div className="font-mono text-[9px] text-ink-muted">连续盈利</div>
              </div>
              <div className={cn(
                'rounded p-2',
                (riskState?.consecutiveLosses || 0) >= (settings.riskManagement.maxConsecutiveLosses || 3) ? 'bg-red/20' : 'bg-red/10'
              )}>
                <div className={cn(
                  'font-mono text-sm font-bold',
                  (riskState?.consecutiveLosses || 0) >= (settings.riskManagement.maxConsecutiveLosses || 3) ? 'text-red' : 'text-red/80'
                )}>
                  {riskState?.consecutiveLosses || 0}
                </div>
                <div className="font-mono text-[9px] text-ink-muted">
                  连续亏损 / {settings.riskManagement.maxConsecutiveLosses || 3}
                </div>
              </div>
            </div>
          </div>

          {/* 仓位敞口 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center gap-1 mb-2">
              <Layers className="h-3 w-3 text-purple" />
              <span className="font-mono text-[10px] text-ink-muted">仓位敞口</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[9px] text-ink-muted">
                敞口 {riskState?.exposurePercent.toFixed(1) || 0}% / {settings.riskManagement.maxExposurePercent || 50}% 上限
              </span>
              <span className="font-mono text-[9px] text-ink">
                {riskState?.openPositionsCount || 0} / {settings.riskManagement.maxOpenPositions || 3} 持仓
              </span>
            </div>
            <ProgressBar
              value={riskState?.exposurePercent || 0}
              max={settings.riskManagement.maxExposurePercent || 50}
            />
            <div className="flex justify-between mt-2 text-[9px]">
              <span className="text-ink-muted">敞口金额:</span>
              <span className="text-ink">${riskState?.totalExposure.toFixed(2) || '0.00'}</span>
            </div>
          </div>

          {/* 风控设置 */}
          <div className="rounded bg-void-200/50 p-2 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Settings className="h-3 w-3 text-blue" />
                <span className="font-mono text-[10px] text-ink-muted">风控设置</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">最大回撤 %</span>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={settings.riskManagement.maxDrawdownPercent || 15}
                  onChange={(e) => updateRiskSetting('maxDrawdownPercent', parseInt(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="font-mono text-[9px] text-ink w-8 text-right">
                  {settings.riskManagement.maxDrawdownPercent || 15}%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">日亏损上限 %</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={settings.riskManagement.maxDailyLossPercent || 5}
                  onChange={(e) => updateRiskSetting('maxDailyLossPercent', parseFloat(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="font-mono text-[9px] text-ink w-8 text-right">
                  {settings.riskManagement.maxDailyLossPercent || 5}%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">最大连续亏损</span>
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={1}
                  value={settings.riskManagement.maxConsecutiveLosses || 3}
                  onChange={(e) => updateRiskSetting('maxConsecutiveLosses', parseInt(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="font-mono text-[9px] text-ink w-8 text-right">
                  {settings.riskManagement.maxConsecutiveLosses || 3}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">最大持仓数</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={settings.riskManagement.maxOpenPositions || 3}
                  onChange={(e) => updateRiskSetting('maxOpenPositions', parseInt(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="font-mono text-[9px] text-ink w-8 text-right">
                  {settings.riskManagement.maxOpenPositions || 3}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">最大敞口 %</span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={settings.riskManagement.maxExposurePercent || 50}
                  onChange={(e) => updateRiskSetting('maxExposurePercent', parseInt(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="font-mono text-[9px] text-ink w-8 text-right">
                  {settings.riskManagement.maxExposurePercent || 50}%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">单笔风险 %</span>
                <input
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={settings.riskManagement.riskPerTradePercent || 2}
                  onChange={(e) => updateRiskSetting('riskPerTradePercent', parseFloat(e.target.value))}
                  className="w-20 h-1"
                />
                <span className="font-mono text-[9px] text-ink w-8 text-right">
                  {settings.riskManagement.riskPerTradePercent || 2}%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-ink-muted">凯利公式</span>
                <button
                  onClick={() => updateRiskSetting('useKellyCriterion', !settings.riskManagement.useKellyCriterion)}
                  className={cn(
                    'px-2 py-0.5 rounded font-mono text-[9px] font-bold transition-all',
                    settings.riskManagement.useKellyCriterion
                      ? 'bg-neon-green/20 text-neon-green'
                      : 'bg-ink/10 text-ink-muted'
                  )}
                >
                  {settings.riskManagement.useKellyCriterion ? '启用' : '关闭'}
                </button>
              </div>

              {settings.riskManagement.useKellyCriterion && (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-ink-muted">凯利分数</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.1}
                    value={settings.riskManagement.kellyFraction || 0.5}
                    onChange={(e) => updateRiskSetting('kellyFraction', parseFloat(e.target.value))}
                    className="w-20 h-1"
                  />
                  <span className="font-mono text-[9px] text-ink w-8 text-right">
                    {settings.riskManagement.kellyFraction || 0.5}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
