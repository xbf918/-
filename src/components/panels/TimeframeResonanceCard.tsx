import { useEffect } from 'react';
import { Activity, CheckCircle2, XCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuantStore } from '@/store/useQuantStore';
import { useMarketStore } from '@/store/useMarketStore';

const TF_LABELS: Record<string, string> = {
  '15m': '15分',
  '1h': '1小时',
  '4h': '4小时',
  '1d': '日线',
};

export function TimeframeResonanceCard() {
  const symbol = useMarketStore((s) => s.symbol);
  const resonance = useQuantStore((s) => s.timeframeResonance);
  const loading = useQuantStore((s) => s.timeframeResonanceLoading);
  const fetchResonance = useQuantStore((s) => s.fetchTimeframeResonance);

  useEffect(() => {
    fetchResonance(symbol);
  }, [symbol, fetchResonance]);

  if (loading || !resonance) {
    return (
      <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">多周期共振</span>
        </div>
        <div className="font-mono text-[10px] text-ink-muted">加载中...</div>
      </div>
    );
  }

  const { timeframes, is_resonance, resonance_direction, resonance_strength, aligned_count, total_count } = resonance;

  return (
    <div className={cn(
      'rounded-lg border p-3',
      is_resonance
        ? resonance_direction === 'long'
          ? 'border-neon-green/30 bg-neon-green/5'
          : 'border-red/30 bg-red/5'
        : 'border-ink/10 bg-void-200/30',
    )}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">多周期共振</span>
        </div>
        {is_resonance ? (
          <div className={cn(
            'flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold',
            resonance_direction === 'long' ? 'bg-neon-green/20 text-neon-green' : 'bg-red/20 text-red',
          )}>
            <CheckCircle2 className="h-3 w-3" />
            共振 {resonance_direction === 'long' ? '看多' : '看空'}
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded bg-ink/10 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
            <XCircle className="h-3 w-3" />
            未共振
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {Object.entries(timeframes as Record<string, { direction: string; confidence: number }>).map(([tf, data]) => {
          const dir = data.direction;
          return (
            <div key={tf} className="flex items-center justify-between rounded bg-void-200/50 px-2 py-1">
              <span className="font-mono text-[10px] text-ink-muted">{TF_LABELS[tf] || tf}</span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'font-mono text-[10px] font-bold',
                  dir === 'long' ? 'text-neon-green' : dir === 'short' ? 'text-red' : 'text-ink-muted',
                )}>
                  {dir === 'long' ? '做多' : dir === 'short' ? '做空' : '观望'}
                </span>
                <div className="h-1 w-12 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      dir === 'long' ? 'bg-neon-green' : dir === 'short' ? 'bg-red' : 'bg-ink-muted',
                    )}
                    style={{ width: `${Math.min(100, (data.confidence || 0) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-ink-muted">
        <span>一致周期: {aligned_count}/{total_count}</span>
        <span>共振强度: {(resonance_strength * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
