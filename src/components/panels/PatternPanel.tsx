import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { useTranslation } from "react-i18next";
import { TrendingUp, TrendingDown, Minus, Hexagon } from "lucide-react";
import { PATTERN_NAMES_ZH, PATTERN_NAMES_EN } from "@/lib/indicators/patterns";
import { CHART_PATTERN_NAMES_ZH, CHART_PATTERN_NAMES_EN } from "@/lib/indicators/chartPatterns";
import type { CandlePattern, ChartPattern } from "@/types";

export function PatternPanel() {
  const { t, i18n } = useTranslation();
  const patternSummary = useMarketStore((s) => s.patternSummary);
  const candlePatterns = useMarketStore((s) => s.candlePatterns);
  const chartPatterns = useMarketStore((s) => s.chartPatterns);

  const isZh = i18n.language === "zh";

  const getCandlePatternName = (type: string) => {
    return isZh ? PATTERN_NAMES_ZH[type as keyof typeof PATTERN_NAMES_ZH] || type : PATTERN_NAMES_EN[type as keyof typeof PATTERN_NAMES_EN] || type;
  };

  const getChartPatternName = (type: string) => {
    return isZh ? CHART_PATTERN_NAMES_ZH[type as keyof typeof CHART_PATTERN_NAMES_ZH] || type : CHART_PATTERN_NAMES_EN[type as keyof typeof CHART_PATTERN_NAMES_EN] || type;
  };

  const getDirectionColor = (dir: string) => {
    if (dir === "bullish") return "#00ff88";
    if (dir === "bearish") return "#ff3366";
    return "#00d4ff";
  };

  const getDirectionLabel = (dir: string) => {
    if (dir === "bullish") return t("pattern.bullish");
    if (dir === "bearish") return t("pattern.bearish");
    return t("pattern.neutral");
  };

  const renderStrength = (strength: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-2 w-1 rounded-sm"
            style={{
              background: i <= strength ? "#00d4ff" : "rgba(0, 212, 255, 0.2)",
              boxShadow: i <= strength ? "0 0 4px #00d4ff" : "none",
            }}
          />
        ))}
      </div>
    );
  };

  const bullishCandles = candlePatterns.filter((p) => p.direction === "bullish");
  const bearishCandles = candlePatterns.filter((p) => p.direction === "bearish");
  const neutralCandles = candlePatterns.filter((p) => p.direction === "neutral");

  return (
    <Panel title={t("pattern.title")} icon={<Hexagon className="h-3.5 w-3.5" />}>
      <div className="p-3">
        {!patternSummary || (candlePatterns.length === 0 && chartPatterns.length === 0) ? (
          <div className="flex h-32 items-center justify-center font-mono text-xs text-ink-dim">
            {t("pattern.noPattern")}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 形态评分概览 */}
            <div className="flex items-center justify-between rounded-lg bg-panel-bg/50 p-2">
              <div className="flex items-center gap-2">
                {patternSummary.score > 0 ? (
                  <TrendingUp className="h-4 w-4 text-neon-green" />
                ) : patternSummary.score < 0 ? (
                  <TrendingDown className="h-4 w-4 text-neon-red" />
                ) : (
                  <Minus className="h-4 w-4 text-neon-cyan" />
                )}
                <span className="font-mono text-[10px] uppercase text-ink-dim">
                  {t("pattern.score")}
                </span>
              </div>
              <span
                className="font-mono text-sm font-bold"
                style={{ color: getDirectionColor(patternSummary.score > 0 ? "bullish" : patternSummary.score < 0 ? "bearish" : "neutral") }}
              >
                {patternSummary.score > 0 ? "+" : ""}{patternSummary.score}
              </span>
            </div>

            {/* 统计 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-neon-green/20 bg-neon-green/5 p-2 text-center">
                <div className="font-mono text-lg font-bold text-neon-green">
                  {patternSummary.bullishCount}
                </div>
                <div className="font-mono text-[9px] uppercase text-ink-dim">
                  {t("pattern.bullishCount")}
                </div>
              </div>
              <div className="rounded-md border border-neon-red/20 bg-neon-red/5 p-2 text-center">
                <div className="font-mono text-lg font-bold text-neon-red">
                  {patternSummary.bearishCount}
                </div>
                <div className="font-mono text-[9px] uppercase text-ink-dim">
                  {t("pattern.bearishCount")}
                </div>
              </div>
            </div>

            {/* 看涨K线形态 */}
            {bullishCandles.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase text-neon-green">
                  <TrendingUp className="h-3 w-3" />
                  {t("pattern.bullishCandle")}
                </div>
                <div className="space-y-1">
                  {bullishCandles.slice(0, 3).map((p: CandlePattern, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded bg-panel-bg/50 px-2 py-1">
                      <span className="font-mono text-[11px] text-ink-muted">
                        {getCandlePatternName(p.type)}
                      </span>
                      {renderStrength(p.strength)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 看跌K线形态 */}
            {bearishCandles.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase text-neon-red">
                  <TrendingDown className="h-3 w-3" />
                  {t("pattern.bearishCandle")}
                </div>
                <div className="space-y-1">
                  {bearishCandles.slice(0, 3).map((p: CandlePattern, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded bg-panel-bg/50 px-2 py-1">
                      <span className="font-mono text-[11px] text-ink-muted">
                        {getCandlePatternName(p.type)}
                      </span>
                      {renderStrength(p.strength)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 中性K线形态 */}
            {neutralCandles.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase text-neon-cyan">
                  <Minus className="h-3 w-3" />
                  {t("pattern.neutralCandle")}
                </div>
                <div className="space-y-1">
                  {neutralCandles.slice(0, 2).map((p: CandlePattern, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded bg-panel-bg/50 px-2 py-1">
                      <span className="font-mono text-[11px] text-ink-muted">
                        {getCandlePatternName(p.type)}
                      </span>
                      {renderStrength(p.strength)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 图表形态 */}
            {chartPatterns.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[9px] uppercase text-neon-cyan">
                  ◆ {t("pattern.chartPattern")}
                </div>
                <div className="space-y-1">
                  {chartPatterns.slice(0, 3).map((p: ChartPattern, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded bg-panel-bg/50 px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: getDirectionColor(p.direction) }}
                        />
                        <span className="font-mono text-[11px] text-ink-muted">
                          {getChartPatternName(p.type)}
                        </span>
                      </div>
                      <span
                        className="font-mono text-[9px]"
                        style={{ color: getDirectionColor(p.direction) }}
                      >
                        {getDirectionLabel(p.direction)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
