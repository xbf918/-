import { useState } from 'react';
import { Zap, Wallet, Settings, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { openPosition, closePosition, fetchAccount, fetchPositions, type ServerAccount, type ServerPosition } from '@/services/server';
import { useMarketStore } from '@/store/useMarketStore';
import { useMultiAgentStore } from '@/store/useMultiAgentStore';

export function LiveTradePanel() {
  const symbol = useMarketStore((s) => s.symbol);
  const combinedSignal = useMultiAgentStore((s) => s.combinedSignal);
  const [account, setAccount] = useState<ServerAccount | null>(null);
  const [positions, setPositions] = useState<ServerPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [tradeResult, setTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [leverage, setLeverage] = useState(10);
  const [exchange, setExchange] = useState('binance');

  const loadAccount = async () => {
    try {
      const acc = await fetchAccount(exchange);
      setAccount(acc);
    } catch (error) {
      console.error('获取账户失败:', error);
    }
  };

  const loadPositions = async () => {
    try {
      const pos = await fetchPositions(exchange, symbol);
      setPositions(pos);
    } catch (error) {
      console.error('获取持仓失败:', error);
    }
  };

  const handleOpenPosition = async (direction: 'long' | 'short') => {
    if (!combinedSignal) return;
    setLoading(true);
    setTradeResult(null);
    try {
      const entryPrice = combinedSignal.entryZone?.lower ?? 0;
      const result = await openPosition(
        exchange,
        symbol,
        direction,
        entryPrice,
        leverage,
      );
      setTradeResult({ success: result.success, message: result.message });
      if (result.success) {
        loadAccount();
        loadPositions();
      }
    } catch (error: any) {
      setTradeResult({ success: false, message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClosePosition = async () => {
    setLoading(true);
    setTradeResult(null);
    try {
      const pos = positions[0];
      const result = await closePosition(
        exchange,
        symbol,
        pos?.side === 'LONG' ? 'long' : 'short',
      );
      setTradeResult({ success: result.success, message: result.message });
      if (result.success) {
        loadAccount();
        loadPositions();
      }
    } catch (error: any) {
      setTradeResult({ success: false, message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const currentPosition = positions[0];

  return (
    <div className="rounded-lg border border-blue/20 bg-blue/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">实盘交易</span>
        </div>
        <select
          value={exchange}
          onChange={(e) => {
            setExchange(e.target.value);
            loadAccount();
            loadPositions();
          }}
          className="rounded bg-void-200 border border-ink/20 px-2 py-0.5 font-mono text-[10px] text-ink focus:border-blue focus:outline-none"
        >
          <option value="binance">Binance</option>
          <option value="okx">OKX</option>
        </select>
      </div>

      {account && (
        <div className="rounded bg-void-200/50 p-2 mb-2">
          <div className="font-mono text-[10px] text-ink-muted mb-1">账户余额</div>
          <div className="font-mono text-lg font-bold text-neon-green">
            ${account.totalBalance.toLocaleString()}
          </div>
          <div className="flex justify-between font-mono text-[9px] mt-1">
            <span className="text-ink-muted">可用: ${account.availableBalance.toLocaleString()}</span>
            <span className="text-ink-muted">已用: ${account.usedMargin.toLocaleString()}</span>
          </div>
        </div>
      )}

      {currentPosition ? (
        <div className="rounded bg-void-200/50 p-2 space-y-2 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {currentPosition.side === 'LONG' ? (
                <TrendingUp className="h-3 w-3 text-neon-green" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red" />
              )}
              <span className={currentPosition.side === 'LONG' ? 'text-neon-green' : 'text-red'}>
                {currentPosition.side === 'LONG' ? '多头持仓' : '空头持仓'}
              </span>
            </div>
            <span className={cn(
              'font-mono text-[10px] font-bold',
              currentPosition.unrealizedPnl >= 0 ? 'text-neon-green' : 'text-red',
            )}>
              {currentPosition.unrealizedPnl >= 0 ? '+' : ''}${currentPosition.unrealizedPnl.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
            <div>
              <span className="text-ink-muted">入场价:</span>
              <span className="text-ink ml-1">{currentPosition.entryPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-ink-muted">数量:</span>
              <span className="text-ink ml-1">{currentPosition.quantity.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-ink-muted">杠杆:</span>
              <span className="text-ink ml-1">{currentPosition.leverage}x</span>
            </div>
            <div>
              <span className="text-ink-muted">保证金:</span>
              <span className="text-ink ml-1">${currentPosition.margin.toFixed(2)}</span>
            </div>
          </div>
          {currentPosition.takeProfit && (
            <div className="font-mono text-[10px]">
              <span className="text-neon-green">止盈:</span>
              <span className="text-ink ml-1">{currentPosition.takeProfit.toFixed(2)}</span>
            </div>
          )}
          {currentPosition.stopLoss && (
            <div className="font-mono text-[10px]">
              <span className="text-red">止损:</span>
              <span className="text-ink ml-1">{currentPosition.stopLoss.toFixed(2)}</span>
            </div>
          )}
          <button
            onClick={handleClosePosition}
            disabled={loading}
            className={cn(
              'w-full rounded py-1.5 font-mono text-[10px] transition-colors',
              loading
                ? 'bg-ink/10 text-ink-muted'
                : 'bg-red/20 text-red hover:bg-red/30',
            )}
          >
            {loading ? '平仓中...' : '一键平仓'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Settings className="h-3 w-3 text-ink-muted" />
            <span className="font-mono text-[10px] text-ink-muted">杠杆:</span>
            <select
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="rounded bg-void-200 border border-ink/20 px-2 py-0.5 font-mono text-[10px] text-ink focus:border-blue focus:outline-none"
            >
              {[1, 2, 5, 10, 20, 50].map((l) => (
                <option key={l} value={l}>{l}x</option>
              ))}
            </select>
          </div>

          {combinedSignal && combinedSignal.direction !== 'neutral' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleOpenPosition('long')}
                disabled={loading || combinedSignal.direction !== 'long'}
                className={cn(
                  'flex items-center justify-center gap-1 rounded py-2 font-mono text-xs font-bold transition-colors',
                  combinedSignal.direction === 'long'
                    ? 'bg-neon-green/20 text-neon-green hover:bg-neon-green/30'
                    : 'bg-ink/10 text-ink-muted cursor-not-allowed',
                )}
              >
                <TrendingUp className="h-4 w-4" /> 开多
              </button>
              <button
                onClick={() => handleOpenPosition('short')}
                disabled={loading || combinedSignal.direction !== 'short'}
                className={cn(
                  'flex items-center justify-center gap-1 rounded py-2 font-mono text-xs font-bold transition-colors',
                  combinedSignal.direction === 'short'
                    ? 'bg-red/20 text-red hover:bg-red/30'
                    : 'bg-ink/10 text-ink-muted cursor-not-allowed',
                )}
              >
                <TrendingDown className="h-4 w-4" /> 开空
              </button>
            </div>
          )}

          {!combinedSignal || combinedSignal.direction === 'neutral' ? (
            <div className="rounded bg-ink/5 p-2 text-center font-mono text-[10px] text-ink-muted">
              等待信号...
            </div>
          ) : (
            <div className="rounded bg-ink/5 p-2 font-mono text-[10px]">
              <div className="text-ink-muted mb-1">交易参数</div>
              <div className="flex justify-between">
                <span className="text-ink-muted">入场区间:</span>
                <span className="text-ink">${combinedSignal.entryZone?.lower?.toFixed(2)} - ${combinedSignal.entryZone?.upper?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red">止损:</span>
                <span className="text-ink">${combinedSignal.stopLoss?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neon-green">止盈:</span>
                <span className="text-ink">${combinedSignal.takeProfit?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-ink-muted">建议杠杆:</span>
                <span className="text-blue">{combinedSignal.recommendedLeverage}x</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tradeResult && (
        <div className={cn(
          'mt-2 rounded p-2 font-mono text-[10px] flex items-center gap-1',
          tradeResult.success ? 'bg-neon-green/10 text-neon-green' : 'bg-red/10 text-red',
        )}>
          {tradeResult.success ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {tradeResult.message}
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <button
          onClick={() => {
            loadAccount();
            loadPositions();
          }}
          className="font-mono text-[9px] text-blue hover:text-blue-light flex items-center gap-1"
        >
          <Wallet className="h-3 w-3" /> 刷新
        </button>
      </div>
    </div>
  );
}
