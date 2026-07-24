import { useState, useEffect } from 'react';
import { Brain, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeSignal } from '@/services/server';
import { useMultiAgentStore } from '@/store/useMultiAgentStore';
import { useMarketStore } from '@/store/useMarketStore';

export function AISignalAnalysisCard() {
  const combinedSignal = useMultiAgentStore((s) => s.combinedSignal);
  const latestAnalysis = useMultiAgentStore((s) => s.latestAnalysis);
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('');

  useEffect(() => {
    if (combinedSignal && combinedSignal.direction !== 'neutral') {
      fetchAnalysis();
    }
  }, [combinedSignal]);

  const fetchAnalysis = async () => {
    if (!combinedSignal) return;
    setLoading(true);
    try {
      const entryPrice = combinedSignal.entryZone?.lower ?? 0;
      const marketData = {
        indicators: latestAnalysis?.data,
        symbol,
        timeframe,
        price: entryPrice,
      };
      const result = await analyzeSignal({
        signal: combinedSignal,
        marketData,
        strategyName: '综合策略',
      });
      setAnalysis(result.analysis);
      setModel(result.model);
    } catch (error) {
      console.error('AI分析失败:', error);
      setAnalysis('AI分析暂时不可用，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchAnalysis();
  };

  if (!combinedSignal || combinedSignal.direction === 'neutral') {
    return (
      <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain className="h-3.5 w-3.5 text-purple" />
          <span className="font-mono text-xs font-bold text-ink">AI信号解读</span>
        </div>
        <div className="font-mono text-[10px] text-ink-muted">等待信号生成...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-purple/20 bg-purple/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-purple" />
          <span className="font-mono text-xs font-bold text-ink">AI信号解读</span>
          <Sparkles className="h-3 w-3 text-yellow" />
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={cn(
            'rounded p-1 transition-colors',
            loading
              ? 'bg-ink/10 text-ink-muted cursor-not-allowed'
              : 'bg-purple/10 text-purple hover:bg-purple/20',
          )}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 text-purple animate-spin" />
          <span className="ml-2 font-mono text-[10px] text-ink-muted">AI分析中...</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded bg-void-200/50 p-2">
            <div className="font-mono text-[10px] leading-relaxed text-ink whitespace-pre-wrap">
              {analysis || '暂无分析结果'}
            </div>
          </div>
          <div className="flex items-center justify-between font-mono text-[9px]">
            <span className="text-ink-muted">模型: {model}</span>
            <span className="text-purple">AI驱动分析</span>
          </div>
        </div>
      )}
    </div>
  );
}
