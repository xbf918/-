import { useTranslation } from "react-i18next";
import { Brain, TrendingUp, TrendingDown, AlertTriangle, RotateCcw, Shield, Zap, Target } from "lucide-react";
import { useStrategyLearningStore } from "@/store/useStrategyLearningStore";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";
import type { DimensionStats } from "@/types";

const DIMENSION_NAMES: Record<keyof DimensionStats, { cn: string; en: string }> = {
  technical: { cn: "技术面", en: "Technical" },
  divergence: { cn: "背离", en: "Divergence" },
  liquidity: { cn: "流动性", en: "Liquidity" },
  timeframe: { cn: "多周期", en: "Timeframe" },
  sentiment: { cn: "情绪", en: "Sentiment" },
  patterns: { cn: "K线形态", en: "Patterns" },
  volumeFlow: { cn: "量能", en: "VolumeFlow" },
};

export function StrategyLearningPanel() {
  const { t, i18n } = useTranslation();
  const {
    enabled,
    weights,
    dimensionStats,
    consecutiveLosses,
    maxConsecutiveLosses,
    learningHistory,
    riskMode,
    pauseTrading,
    setEnabled,
    setRiskMode,
    setMaxConsecutiveLosses,
    resetWeights,
    getEffectiveThreshold,
  } = useStrategyLearningStore();

  const threshold = getEffectiveThreshold();

  return (
    <Panel title={t("learning.title")} icon={<Brain className="h-3.5 w-3.5" />}>
      <div className="p-2 space-y-3">
        {/* 开关和风险模式 */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-ink">{t("learning.enabled")}</span>
            <span className="font-mono text-[9px] text-ink-dim">{t("learning.enabledDesc")}</span>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              enabled ? "bg-neon-cyan/60" : "bg-void-400",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                enabled ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>

        {/* 风险模式 */}
        <div className="flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-ink-muted" />
            <span className="font-mono text-[9px] text-ink-dim">{t("learning.riskMode")}</span>
          </div>
          <div className="flex items-center gap-1">
            {(["conservative", "normal", "aggressive"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setRiskMode(mode)}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[8px] transition-colors",
                  riskMode === mode
                    ? mode === "conservative"
                      ? "bg-neon-red/20 text-neon-red"
                      : mode === "normal"
                      ? "bg-neon-cyan/20 text-neon-cyan"
                      : "bg-neon-green/20 text-neon-green"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {t(`learning.risk.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {/* 风控状态 */}
        <div className={cn(
          "rounded border px-2 py-1.5",
          pauseTrading ? "border-neon-red/40 bg-neon-red/10" :
          consecutiveLosses >= 2 ? "border-neon-yellow/40 bg-neon-yellow/10" :
          "border-panel-border bg-void-300/30",
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {pauseTrading && <AlertTriangle className="h-3.5 w-3.5 text-neon-red" />}
              {consecutiveLosses >= 2 && !pauseTrading && <TrendingDown className="h-3.5 w-3.5 text-neon-yellow" />}
              {consecutiveLosses < 2 && <TrendingUp className="h-3.5 w-3.5 text-neon-green" />}
              <span className="font-mono text-[9px] text-ink">{t("learning.riskStatus")}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn(
                "font-mono text-xs font-bold",
                pauseTrading ? "text-neon-red" :
                consecutiveLosses >= 2 ? "text-neon-yellow" : "text-neon-green",
              )}>
                {t("learning.consecutiveLosses")}: {consecutiveLosses}/{maxConsecutiveLosses}
              </span>
            </div>
          </div>
          {pauseTrading && (
            <div className="mt-1 font-mono text-[8px] text-neon-red">
              {t("learning.tradingPaused")}
            </div>
          )}
        </div>

        {/* 当前信号阈值 */}
        <div className="flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-ink-muted" />
            <span className="font-mono text-[9px] text-ink-dim">{t("learning.effectiveThreshold")}</span>
          </div>
          <span className="font-mono text-xs font-bold text-neon-cyan">{threshold}%</span>
        </div>

        {/* 维度权重 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-ink-muted" />
            <span className="font-mono text-[9px] text-ink">{t("learning.dimensionWeights")}</span>
          </div>
          <div className="space-y-1">
            {(Object.keys(DIMENSION_NAMES) as (keyof DimensionStats)[]).map((dim) => {
              const stat = dimensionStats[dim];
              const weight = useStrategyLearningStore.getState().getWeightForDimension(dim);
              const isHighWinRate = stat.winRate > 55;
              const isLowWinRate = stat.winRate < 45;
              return (
                <div key={dim} className="flex items-center gap-2">
                  <span className="w-16 font-mono text-[8px] text-ink-muted truncate">
                    {i18n.language === "zh" ? DIMENSION_NAMES[dim].cn : DIMENSION_NAMES[dim].en}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-void-400 overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        isHighWinRate ? "bg-neon-green" : isLowWinRate ? "bg-neon-red" : "bg-neon-cyan",
                      )}
                      style={{ width: `${weight * 100}%` }}
                    />
                  </div>
                  <span className={cn(
                    "w-10 font-mono text-[8px] text-right",
                    isHighWinRate ? "text-neon-green" : isLowWinRate ? "text-neon-red" : "text-ink-muted",
                  )}>
                    {(weight * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={resetWeights}
            className="flex-1 flex items-center justify-center gap-1.5 rounded border border-panel-border py-1.5 font-mono text-[9px] text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
          >
            <RotateCcw className="h-3 w-3" />
            {t("learning.resetWeights")}
          </button>
        </div>
      </div>
    </Panel>
  );
}
