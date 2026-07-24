import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SignalDirection } from "@/types";

function dirCell(dir: SignalDirection, t: (key: string) => string) {
  if (dir === "bullish")
    return { label: t("common.long"), cls: "bg-neon-green/20 text-neon-green border-neon-green/40" };
  if (dir === "bearish")
    return { label: t("common.short"), cls: "bg-neon-red/20 text-neon-red border-neon-red/40" };
  return { label: t("common.neutral"), cls: "bg-ink-dim/20 text-ink-muted border-panel-border" };
}

function rsiCell(signal: "overbought" | "oversold" | "neutral", t: (key: string) => string) {
  if (signal === "overbought")
    return { label: t("common.overbought"), cls: "bg-neon-amber/20 text-neon-amber border-neon-amber/40" };
  if (signal === "oversold")
    return { label: t("common.oversold"), cls: "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40" };
  return { label: t("common.neutral"), cls: "bg-ink-dim/20 text-ink-muted border-panel-border" };
}

export function TimeframeMatrix() {
  const { t } = useTranslation();
  const signals = useMarketStore((s) => s.timeframeSignals);

  return (
    <Panel title={t("timeframe.title")} icon={<span className="font-mono text-[10px]">⌗</span>}>
      <div className="p-3">
        {signals.length === 0 ? (
          <div className="flex h-32 items-center justify-center font-mono text-xs text-ink-dim">
            {t("common.loading")}
          </div>
        ) : (
          <div className="space-y-2">
            {/* 表头 */}
            <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_70px] gap-1.5 px-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">{t("timeframe.period")}</span>
              <span className="text-center font-mono text-[9px] uppercase tracking-wider text-ink-dim">{t("timeframe.trend")}</span>
              <span className="text-center font-mono text-[9px] uppercase tracking-wider text-ink-dim">MACD</span>
              <span className="text-center font-mono text-[9px] uppercase tracking-wider text-ink-dim">RSI</span>
              <span className="text-center font-mono text-[9px] uppercase tracking-wider text-ink-dim">{t("timeframe.price")}</span>
              <span className="text-right font-mono text-[9px] uppercase tracking-wider text-ink-dim">{t("timeframe.resonance")}</span>
            </div>

            {signals.map((sig) => {
              const trendCell = dirCell(sig.trend, t);
              const macdCell = dirCell(sig.macdSignal, t);
              const rsi = rsiCell(sig.rsiSignal, t);
              const priceCell = dirCell(sig.priceVsEma, t);
              return (
                <div
                  key={sig.timeframe}
                  className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_70px] items-center gap-1.5 rounded border border-panel-border/50 bg-void-200/40 px-1 py-1.5"
                >
                  <span className="font-mono text-xs font-bold text-ink">{sig.timeframe}</span>
                  <div className="flex justify-center">
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold", trendCell.cls)}>
                      {trendCell.label}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold", macdCell.cls)}>
                      {macdCell.label}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold", rsi.cls)}>
                      {rsi.label}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold", priceCell.cls)}>
                      {priceCell.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <div className="h-1.5 w-8 overflow-hidden rounded-full bg-void-300">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${sig.resonance}%`,
                          background:
                            sig.trend === "bullish"
                              ? "#00ff88"
                              : sig.trend === "bearish"
                                ? "#ff3366"
                                : "#00d4ff",
                        }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-ink-muted">{sig.resonance}</span>
                  </div>
                </div>
              );
            })}

            {/* 共振汇总 */}
            <div className="mt-3 border-t border-panel-border pt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                  {t("timeframe.directionAlignment")}
                </span>
                <ResonanceSummary signals={signals} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ResonanceSummary({ signals }: { signals: ReturnType<typeof useMarketStore.getState>["timeframeSignals"] }) {
  const { t } = useTranslation();
  const bull = signals.filter((s) => s.trend === "bullish").length;
  const bear = signals.filter((s) => s.trend === "bearish").length;
  const total = signals.length;
  if (bull === total) {
    return <span className="font-mono text-xs font-bold signal-bull">{t("timeframe.allBull")}</span>;
  }
  if (bear === total) {
    return <span className="font-mono text-xs font-bold signal-bear">{t("timeframe.allBear")}</span>;
  }
  return (
    <span className="font-mono text-xs text-ink-muted">
      {t("timeframe.mixed", { bull, bear, neutral: total - bull - bear })}
    </span>
  );
}
