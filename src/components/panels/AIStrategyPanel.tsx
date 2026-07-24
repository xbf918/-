/**
 * AI 智能策略面板
 *
 * 展示 AI 三大功能：
 * 1. 市场环境识别（趋势/震荡/高波动）
 * 2. 动态调参优化
 * 3. 智能原因分析
 */
import { useTranslation } from "react-i18next";
import {
  Brain,
  Sparkles,
  TrendingUp,
  Activity,
  Zap,
  Target,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  RefreshCw,
  Settings2,
  Wrench,
} from "lucide-react";
import { useAIStrategyStore } from "@/store/useAIStrategyStore";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";
import type { ParamKey } from "@/lib/strategy/parameterOptimizer";
import type { MarketRegime } from "@/lib/strategy/marketRegime";
import { PARAM_LIBRARY } from "@/lib/strategy/parameterOptimizer";

const REGIME_META: Record<MarketRegime, { color: string; icon: typeof TrendingUp }> = {
  trending: { color: "text-neon-green border-neon-green/40 bg-neon-green/10", icon: TrendingUp },
  ranging: { color: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10", icon: Activity },
  volatile: { color: "text-neon-red border-neon-red/40 bg-neon-red/10", icon: Zap },
  unknown: { color: "text-ink-muted border-panel-border bg-void-300/30", icon: Brain },
};

const DIMENSION_LABELS: Record<string, { cn: string; en: string }> = {
  technical: { cn: "技术面", en: "Technical" },
  divergence: { cn: "背离", en: "Divergence" },
  liquidity: { cn: "流动性", en: "Liquidity" },
  timeframe: { cn: "多周期", en: "Timeframe" },
  sentiment: { cn: "情绪", en: "Sentiment" },
  patterns: { cn: "K线形态", en: "Patterns" },
  volumeFlow: { cn: "量能", en: "VolumeFlow" },
  regime: { cn: "市场环境", en: "Regime" },
  param: { cn: "参数", en: "Param" },
  execution: { cn: "执行", en: "Execution" },
  luck: { cn: "运气", en: "Luck" },
};

function dimLabel(key: string, lang: string): string {
  const meta = DIMENSION_LABELS[key];
  if (!meta) return key;
  return lang === "zh" ? meta.cn : meta.en;
}

export function AIStrategyPanel() {
  const { t, i18n } = useTranslation();
  const {
    enabled,
    autoApplyRegime,
    autoApplyParams,
    regime,
    regimeConfidence,
    regimeFeatures,
    regimeSummary,
    regimeAdjustments,
    appliedParamKeys,
    paramRecommendations,
    paramOverallConfidence,
    paramSummary,
    lastAttribution,
    batchAttribution,
    setEnabled,
    setAutoApplyRegime,
    setAutoApplyParams,
    applyRegimeWeights,
    applyParam,
    applyParamRecommendations,
    resetAIState,
  } = useAIStrategyStore();

  const RegimeIcon = REGIME_META[regime].icon;
  const hasParamRecs = paramRecommendations.some((r) => r.recommended !== null && r.recommended !== r.current);
  const totalTrades = batchAttribution ? batchAttribution.totalAnalyzed : 0;

  return (
    <Panel
      title={t("ai.title")}
      icon={<Sparkles className="h-3.5 w-3.5 text-neon-cyan" />}
    >
      <div className="p-2 space-y-3">
        {/* 总开关 */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-ink">{t("ai.enabled")}</span>
            <span className="font-mono text-[9px] text-ink-dim">{t("ai.enabledDesc")}</span>
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

        {/* 自动应用开关 */}
        {enabled && (
          <div className="space-y-1 rounded border border-panel-border bg-void-300/30 p-2">
            <label className="flex items-center gap-2 font-mono text-[9px] text-ink">
              <input
                type="checkbox"
                checked={autoApplyRegime}
                onChange={(e) => setAutoApplyRegime(e.target.checked)}
                className="h-3 w-3 accent-neon-cyan"
              />
              {t("ai.autoRegime")}
            </label>
            <label className="flex items-center gap-2 font-mono text-[9px] text-ink">
              <input
                type="checkbox"
                checked={autoApplyParams}
                onChange={(e) => setAutoApplyParams(e.target.checked)}
                className="h-3 w-3 accent-neon-cyan"
              />
              {t("ai.autoParams")}
            </label>
          </div>
        )}

        {/* 1. 市场环境识别 */}
        {enabled && (
          <div className="space-y-1.5 rounded border border-panel-border p-2">
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-neon-cyan" />
              <span className="font-mono text-[9px] font-bold text-ink">
                {t("ai.regime.title")}
              </span>
            </div>

            <div className={cn(
              "flex items-center justify-between rounded border px-2 py-1.5",
              REGIME_META[regime].color,
            )}>
              <div className="flex items-center gap-1.5">
                <RegimeIcon className="h-3.5 w-3.5" />
                <span className="font-mono text-xs font-bold">
                  {t(`ai.regime.${regime}`)}
                </span>
              </div>
              <span className="font-mono text-[9px]">
                {t("ai.regime.conffidence")} {regimeConfidence}%
              </span>
            </div>

            {regimeSummary && (
              <p className="font-mono text-[9px] text-ink-dim">{regimeSummary}</p>
            )}

            {/* 特征详情 */}
            {regimeFeatures && (
              <div className="grid grid-cols-3 gap-1 rounded bg-void-400/30 p-1.5">
                <FeatureCell label={t("ai.regime.adx")} value={regimeFeatures.adx.toFixed(0)} />
                <FeatureCell label={t("ai.regime.volatility")} value={regimeFeatures.volatility.toFixed(0)} />
                <FeatureCell label={t("ai.regime.slope")} value={regimeFeatures.trendSlope.toFixed(2)} />
                <FeatureCell label={t("ai.regime.rangePos")} value={regimeFeatures.rangePosition.toFixed(0)} />
                <FeatureCell label={t("ai.regime.bodyRatio")} value={(regimeFeatures.bodyRatio * 100).toFixed(0)} />
                <FeatureCell label={t("ai.regime.volExp")} value={`${regimeFeatures.volumeExpansion.toFixed(2)}x`} />
              </div>
            )}

            {/* 权重调整建议 */}
            {regimeAdjustments.length > 0 && (
              <div className="space-y-1">
                <p className="font-mono text-[9px] text-ink-dim">{t("ai.regime.adjustments")}:</p>
                {regimeAdjustments.slice(0, 3).map((adj, idx) => (
                  <div key={idx} className="flex items-center justify-between font-mono text-[8px]">
                    <span className="text-ink-muted">{dimLabel(adj.dimension, i18n.language)}</span>
                    <span className={cn(
                      adj.toWeight > adj.fromWeight ? "text-neon-green" : "text-neon-red",
                    )}>
                      {(adj.fromWeight * 100).toFixed(0)}% → {(adj.toWeight * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => applyRegimeWeights()}
                  className="w-full rounded border border-neon-cyan/40 bg-neon-cyan/10 py-1 font-mono text-[9px] text-neon-cyan transition-colors hover:bg-neon-cyan/20"
                >
                  {t("ai.regime.applyAdjustments")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2. 参数优化 */}
        {enabled && (
          <div className="space-y-1.5 rounded border border-panel-border p-2">
            <div className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-neon-yellow" />
              <span className="font-mono text-[9px] font-bold text-ink">
                {t("ai.params.title")}
              </span>
              {paramOverallConfidence > 0 && (
                <span className="ml-auto font-mono text-[8px] text-ink-dim">
                  {t("ai.params.confidence")} {paramOverallConfidence}%
                </span>
              )}
            </div>

            {paramSummary && (
              <p className="font-mono text-[9px] text-ink-dim">{paramSummary}</p>
            )}

            {paramRecommendations.length > 0 && (
              <div className="space-y-1">
                {paramRecommendations
                  .filter((r) => r.recommended !== null && r.recommended !== r.current)
                  .slice(0, 4)
                  .map((rec) => {
                    const def = PARAM_LIBRARY[rec.key as ParamKey];
                    const isApplied = appliedParamKeys.includes(rec.key as ParamKey);
                    return (
                      <div
                        key={rec.key}
                        className="flex items-center justify-between rounded bg-void-400/30 px-1.5 py-1"
                      >
                        <div className="flex flex-col">
                          <span className="font-mono text-[9px] text-ink">
                            {i18n.language === "zh" ? def.label : def.labelEn}
                          </span>
                          <span className="font-mono text-[8px] text-ink-dim">
                            {rec.current}{def.unit} → {rec.recommended}{def.unit}
                            <span className="ml-1 text-neon-green">↑{rec.improvementPct.toFixed(0)}%</span>
                          </span>
                        </div>
                        <button
                          onClick={() => applyParam(rec.key as ParamKey)}
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[8px] transition-colors",
                            isApplied
                              ? "bg-neon-green/20 text-neon-green"
                              : "border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10",
                          )}
                        >
                          {isApplied ? t("ai.params.applied") : t("ai.params.apply")}
                        </button>
                      </div>
                    );
                  })}

                {hasParamRecs && (
                  <button
                    onClick={() => applyParamRecommendations()}
                    className="w-full rounded border border-neon-yellow/40 bg-neon-yellow/10 py-1 font-mono text-[9px] text-neon-yellow transition-colors hover:bg-neon-yellow/20"
                  >
                    {t("ai.params.applyAll")}
                  </button>
                )}

                {!hasParamRecs && paramRecommendations.length > 0 && (
                  <div className="flex items-center justify-center gap-1 rounded bg-neon-green/10 py-1 font-mono text-[9px] text-neon-green">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("ai.params.noRecommendation")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. 智能归因 */}
        {enabled && (
          <div className="space-y-1.5 rounded border border-panel-border p-2">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-neon-purple" />
              <span className="font-mono text-[9px] font-bold text-ink">
                {t("ai.attribution.title")}
              </span>
              {totalTrades > 0 && (
                <span className="ml-auto font-mono text-[8px] text-ink-dim">
                  {totalTrades} 笔
                </span>
              )}
            </div>

            {lastAttribution ? (
              <div className="space-y-1.5">
                {/* 最近一笔归因 */}
                <div className="rounded bg-void-400/30 p-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px]">
                    <span className="text-ink-dim">{t("ai.attribution.lastTrade")}</span>
                    <span className={cn(
                      "font-bold",
                      lastAttribution.isWin ? "text-neon-green" : "text-neon-red",
                    )}>
                      {lastAttribution.pnlPercent >= 0 ? "+" : ""}
                      {lastAttribution.pnlPercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    <div className="font-mono text-[8px]">
                      <span className="text-ink-muted">{t("ai.attribution.primaryFactor")}: </span>
                      <span className="text-ink">
                        {dimLabel(lastAttribution.primaryFactor.dimension, i18n.language)}
                      </span>
                    </div>
                    <p className="font-mono text-[8px] text-ink-dim">
                      {lastAttribution.primaryFactor.description}
                    </p>
                    {lastAttribution.primaryFactor.suggestion && (
                      <p className="font-mono text-[8px] text-neon-cyan">
                        💡 {lastAttribution.primaryFactor.suggestion}
                      </p>
                    )}
                  </div>

                  <p className="mt-1 rounded bg-void-300/50 px-1.5 py-1 font-mono text-[8px] text-ink-dim">
                    {lastAttribution.lessonLearned}
                  </p>
                </div>

                {/* 批量分析 */}
                {batchAttribution && batchAttribution.totalAnalyzed >= 3 && (
                  <div className="rounded bg-void-400/30 p-1.5">
                    <div className="flex items-center justify-between font-mono text-[8px]">
                      <span className="text-ink-dim">{t("ai.attribution.batchTitle")}</span>
                      <span className="text-ink-muted">
                        <span className="text-neon-green">{batchAttribution.winCount}</span>
                        /
                        <span className="text-neon-red">{batchAttribution.lossCount}</span>
                      </span>
                    </div>
                    {batchAttribution.topHarmfulDimensions.length > 0 && (
                      <div className="mt-1">
                        <p className="font-mono text-[8px] text-ink-muted">
                          {t("ai.attribution.topHarmful")}:
                        </p>
                        {batchAttribution.topHarmfulDimensions.slice(0, 2).map((d) => (
                          <p key={d.dimension} className="font-mono text-[8px] text-neon-red">
                            • {dimLabel(d.dimension, i18n.language)} ({d.count}次)
                          </p>
                        ))}
                      </div>
                    )}
                    {batchAttribution.commonLesson && (
                      <p className="mt-1 font-mono text-[8px] text-neon-cyan">
                        {batchAttribution.commonLesson}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1 py-2 font-mono text-[9px] text-ink-muted">
                <AlertCircle className="h-3 w-3" />
                暂无归因数据
              </div>
            )}
          </div>
        )}

        {/* 重置按钮 */}
        {enabled && (
          <button
            onClick={resetAIState}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-panel-border py-1.5 font-mono text-[9px] text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
          >
            <RefreshCw className="h-3 w-3" />
            {t("ai.resetAI")}
          </button>
        )}
      </div>
    </Panel>
  );
}

function FeatureCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-[8px] text-ink-dim">{label}</span>
      <span className="font-mono text-[10px] font-bold text-ink">{value}</span>
    </div>
  );
}
