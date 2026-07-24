import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "@/lib/format";
import { Split } from "lucide-react";
import type { Divergence, DivergenceType } from "@/types";

const DIV_INFO: Record<DivergenceType, { color: string; sign: "bull" | "bear" }> = {
  regular_bullish: { color: "#00ff88", sign: "bull" },
  regular_bearish: { color: "#ff3366", sign: "bear" },
  hidden_bullish: { color: "#00d4ff", sign: "bull" },
  hidden_bearish: { color: "#ffaa00", sign: "bear" },
};

const DIV_LABEL_KEY: Record<DivergenceType, string> = {
  regular_bullish: "divergence.regularBull",
  regular_bearish: "divergence.regularBear",
  hidden_bullish: "divergence.hiddenBull",
  hidden_bearish: "divergence.hiddenBear",
};

const STRENGTH_LABEL_KEY = { weak: "divergence.strengthWeak", medium: "divergence.strengthMedium", strong: "divergence.strengthStrong" } as const;

export function DivergencePanel() {
  const { t } = useTranslation();
  const divergences = useMarketStore((s) => s.divergences);

  return (
    <Panel
      title={t("divergence.title")}
      icon={<Split className="h-3.5 w-3.5" />}
      action={
        <span className="font-mono text-[9px] text-ink-dim">
          {t("divergence.signalCount", { count: divergences.length })}
        </span>
      }
    >
      <div className="p-3">
        {divergences.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1">
            <div className="h-8 w-8 rounded-full border border-neon-cyan/30 bg-neon-cyan/5" />
            <div className="font-mono text-[10px] text-ink-dim">{t("divergence.noDivergence")}</div>
            <div className="font-mono text-[9px] text-ink-dim/60">{t("divergence.noDivergenceDesc")}</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {divergences.slice(0, 8).map((d, i) => (
              <DivergenceRow key={i} d={d} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function DivergenceRow({ d }: { d: Divergence }) {
  const { t } = useTranslation();
  const info = DIV_INFO[d.type];
  const isBull = info.sign === "bull";
  return (
    <div
      className="relative overflow-hidden rounded border bg-void-200/40 px-2 py-1.5"
      style={{ borderColor: `${info.color}40` }}
    >
      <div
        className="absolute left-0 top-0 h-full w-0.5"
        style={{ background: info.color, boxShadow: `0 0 8px ${info.color}` }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold"
            style={{ background: `${info.color}20`, color: info.color }}
          >
            {isBull ? "▲" : "▼"} {t(DIV_LABEL_KEY[d.type])}
          </span>
          <span
            className="rounded border px-1 py-0.5 font-mono text-[8px] uppercase"
            style={{
              borderColor: `${info.color}40`,
              color: d.strength === "strong" ? info.color : "#6b7390",
            }}
          >
            {t(STRENGTH_LABEL_KEY[d.strength])}
          </span>
        </div>
        <span className="font-mono text-[9px] text-ink-dim">
          {formatRelativeTime(d.endTime)}{t("common.ago")}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[9px]">
        <span className="text-ink-muted">
          {t("divergence.price")} {d.priceStart.toFixed(2)} → {d.priceEnd.toFixed(2)}
        </span>
        <span className="text-ink-dim">
          {t("divergence.indicator")} {d.indicatorStart.toFixed(4)} → {d.indicatorEnd.toFixed(4)}
        </span>
      </div>
      <div className="mt-1 font-mono text-[9px] text-ink-dim">
        {d.type.startsWith("regular")
          ? isBull
            ? t("divergence.descRegularBull")
            : t("divergence.descRegularBear")
          : isBull
            ? t("divergence.descHiddenBull")
            : t("divergence.descHiddenBear")}
      </div>
    </div>
  );
}
