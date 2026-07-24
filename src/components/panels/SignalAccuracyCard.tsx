import { useEffect } from 'react';
import { BarChart3, Target, Shield, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuantStore } from '@/store/useQuantStore';
import { useMarketStore } from '@/store/useMarketStore';

export function SignalAccuracyCard() {
  const symbol = useMarketStore((s) => s.symbol);
  const stats = useQuantStore((s) => s.signalStats);
  const loading = useQuantStore((s) => s.signalStatsLoading);
  const fetchStats = useQuantStore((s) => s.fetchSignalStats);

  useEffect(() => {
    fetchStats(symbol);
  }, [symbol, fetchStats]);

  if (loading) {
    return (
      <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
        <div className="font-mono text-[10px] text-ink-muted">信号准确率统计加载中...</div>
      </div>
    );
  }

  if (!stats || stats.total_signals === 0) {
    return (
      <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">信号准确率</span>
        </div>
        <div className="font-mono text-[10px] text-ink-muted">暂无足够历史信号数据（需至少一笔已验证信号）</div>
      </div>
    );
  }

  const { total_signals, hit_tp_count, hit_sl_count, ongoing_count, timeout_count, accuracy_pct, avg_return_pct, avg_bars_to_result } = stats;
  const verified = total_signals - ongoing_count;

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">信号后验追踪</span>
        </div>
        <span className="font-mono text-[9px] text-ink-muted">近30天 · {verified}笔已验证</span>
      </div>

      <div className="mb-2 grid grid-cols-4 gap-1.5">
        <div className="rounded bg-void-200/50 p-1.5 text-center">
          <div className={cn(
            'font-mono text-sm font-bold',
            accuracy_pct >= 50 ? 'text-neon-green' : 'text-yellow',
          )}>
            {accuracy_pct.toFixed(1)}%
          </div>
          <div className="font-mono text-[8px] text-ink-muted">胜率</div>
        </div>
        <div className="rounded bg-void-200/50 p-1.5 text-center">
          <div className={cn(
            'font-mono text-sm font-bold',
            avg_return_pct >= 0 ? 'text-neon-green' : 'text-red',
          )}>
            {avg_return_pct >= 0 ? '+' : ''}{avg_return_pct.toFixed(2)}%
          </div>
          <div className="font-mono text-[8px] text-ink-muted">均收益</div>
        </div>
        <div className="rounded bg-void-200/50 p-1.5 text-center">
          <div className="font-mono text-sm font-bold text-neon-green">{hit_tp_count}</div>
          <div className="font-mono text-[8px] text-ink-muted">止盈</div>
        </div>
        <div className="rounded bg-void-200/50 p-1.5 text-center">
          <div className="font-mono text-sm font-bold text-red">{hit_sl_count}</div>
          <div className="font-mono text-[8px] text-ink-muted">止损</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between font-mono text-[9px]">
          <span className="text-ink-muted">止盈率</span>
          <span className="text-neon-green">{((hit_tp_count / verified) * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-neon-green" style={{ width: `${(hit_tp_count / verified) * 100}%` }} />
        </div>

        <div className="flex items-center justify-between font-mono text-[9px]">
          <span className="text-ink-muted">止损率</span>
          <span className="text-red">{((hit_sl_count / verified) * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-red" style={{ width: `${(hit_sl_count / verified) * 100}%` }} />
        </div>

        <div className="flex items-center justify-between font-mono text-[9px]">
          <span className="text-ink-muted">平均验证周期</span>
          <span className="text-ink">{avg_bars_to_result.toFixed(1)} 根K线</span>
        </div>
      </div>
    </div>
  );
}
