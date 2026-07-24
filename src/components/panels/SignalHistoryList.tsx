import { useEffect } from 'react';
import { History, TrendingUp, TrendingDown, Target, Shield, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuantStore } from '@/store/useQuantStore';
import { useMarketStore } from '@/store/useMarketStore';

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  hit_tp: { label: '止盈', color: 'text-neon-green' },
  hit_sl: { label: '止损', color: 'text-red' },
  timeout: { label: '超时', color: 'text-yellow' },
  ongoing: { label: '进行中', color: 'text-blue' },
};

export function SignalHistoryList() {
  const symbol = useMarketStore((s) => s.symbol);
  const history = useQuantStore((s) => s.signalHistory);
  const loading = useQuantStore((s) => s.signalHistoryLoading);
  const fetchHistory = useQuantStore((s) => s.fetchSignalHistory);

  useEffect(() => {
    fetchHistory(symbol, undefined, 20);
  }, [symbol, fetchHistory]);

  if (loading) {
    return (
      <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
        <div className="font-mono text-[10px] text-ink-muted">加载交易日志...</div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">交易日志</span>
        </div>
        <div className="font-mono text-[10px] text-ink-muted">暂无历史信号记录</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">交易日志</span>
        </div>
        <span className="font-mono text-[9px] text-ink-muted">最近 {history.length} 笔</span>
      </div>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
        {history.map((sig: any) => {
          const outcome = OUTCOME_LABELS[sig.outcome] || { label: '未知', color: 'text-ink-muted' };
          const isLong = sig.direction === 'long';
          const date = new Date(sig.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

          return (
            <div key={sig.id} className="rounded bg-void-200/50 p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {isLong ? (
                    <TrendingUp className="h-3 w-3 text-neon-green" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red" />
                  )}
                  <span className="font-mono text-[10px] font-bold text-ink">
                    {isLong ? '做多' : '做空'}
                  </span>
                  <span className="font-mono text-[9px] text-ink-muted">{date}</span>
                </div>
                <span className={cn('font-mono text-[10px] font-bold', outcome.color)}>
                  {outcome.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 font-mono text-[9px]">
                <div className="flex items-center gap-0.5">
                  <Target className="h-2.5 w-2.5 text-blue" />
                  <span className="text-ink-muted">入:</span>
                  <span className="text-ink">{sig.entry_price?.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Shield className="h-2.5 w-2.5 text-red" />
                  <span className="text-ink-muted">止:</span>
                  <span className="text-ink">{sig.stop_loss?.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Target className="h-2.5 w-2.5 text-neon-green" />
                  <span className="text-ink-muted">盈:</span>
                  <span className="text-ink">{sig.take_profit?.toFixed(1)}</span>
                </div>
              </div>

              {sig.final_return_pct !== null && sig.final_return_pct !== undefined && (
                <div className="mt-1 flex items-center justify-between font-mono text-[9px]">
                  <span className="text-ink-muted">
                    收益: <span className={sig.final_return_pct >= 0 ? 'text-neon-green' : 'text-red'}>
                      {sig.final_return_pct >= 0 ? '+' : ''}{sig.final_return_pct.toFixed(2)}%
                    </span>
                  </span>
                  <span className="text-ink-muted">{sig.bars_elapsed} 根K线</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
