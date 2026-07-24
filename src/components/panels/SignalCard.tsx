import { useMarketStore } from "@/store/useMarketStore";
import { useMultiAgentStore } from "@/store/useMultiAgentStore";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Minus, Zap, Bot, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface SignalDisplay {
  direction: "long" | "short" | "neutral";
  confidence: number;
  displayScore: number | string;
  components?: { key: string; label: string; value: number }[];
  reasons?: string[];
  signals?: Array<{ agentName: string; direction: "long" | "short" | "neutral" }>;
}

export function SignalCard() {
  const { t } = useTranslation();
  const marketScore = useMarketStore((s) => s.signalScore);
  const symbolInfo = useMarketStore((s) => s.symbolInfo);
  const multiAgentSignal = useMultiAgentStore((s) => s.combinedSignal);

  const isMultiAgent = !!multiAgentSignal;

  let display: SignalDisplay;
  if (multiAgentSignal) {
    display = {
      direction: multiAgentSignal.direction,
      confidence: multiAgentSignal.confidence,
      displayScore: Math.round(multiAgentSignal.strength * 100),
      signals: multiAgentSignal.signals.map((s) => ({
        agentName: s.agentName,
        direction: s.direction,
      })),
    };
  } else if (marketScore) {
    display = {
      direction: marketScore.direction,
      confidence: marketScore.confidence / 100,
      displayScore: marketScore.total,
      components: [
        { key: "technical", label: t("signal.technical"), value: marketScore.components.technical },
        { key: "divergence", label: t("signal.divergence"), value: marketScore.components.divergence },
        { key: "liquidity", label: t("signal.liquidity"), value: marketScore.components.liquidity },
        { key: "timeframe", label: t("signal.timeframe"), value: marketScore.components.timeframe },
        { key: "sentiment", label: t("signal.sentiment"), value: marketScore.components.sentiment },
        { key: "patterns", label: t("signal.patterns"), value: marketScore.components.patterns },
      ],
      reasons: marketScore.reasons,
    };
  } else {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <Zap className="h-6 w-6 animate-pulse text-ink-dim" />
        <span className="font-mono text-[10px] text-ink-dim">{t("signal.analyzing")}</span>
      </div>
    );
  }

  const isLong = display.direction === "long";
  const isShort = display.direction === "short";
  const dirColor = isLong ? "#00ff88" : isShort ? "#ff3366" : "#00d4ff";
  const DirIcon = isLong ? ArrowUp : isShort ? ArrowDown : Minus;
  const dirLabel = isLong ? t("signal.long") : isShort ? t("signal.short") : t("signal.neutral");
  const TrendIcon = isLong ? TrendingUp : isShort ? TrendingDown : Minus;

  const confidencePercent = Math.round(display.confidence * 100);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 信号头部 */}
      <div className="shrink-0 border-b border-panel-border/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {isMultiAgent && <Bot className="h-3 w-3 text-neon-purple" />}
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
              {isMultiAgent ? "AI综合信号" : t("signal.comprehensive")}
            </span>
          </div>
          <span className="font-mono text-[9px] text-ink-dim">
            {symbolInfo.base}/{symbolInfo.quote}
          </span>
        </div>

        {/* 方向 + 分数 */}
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
            style={{
              borderColor: dirColor,
              background: `${dirColor}15`,
            }}
          >
            <TrendIcon className="h-5 w-5" style={{ color: dirColor }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold" style={{ color: dirColor }}>
                {dirLabel}
              </span>
              <span className="font-mono text-xl font-bold" style={{ color: dirColor }}>
                {display.displayScore}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-mono text-[8px] uppercase text-ink-dim">{t("signal.confidence")}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-void-300">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${confidencePercent}%`,
                    background: dirColor,
                  }}
                />
              </div>
              <span className="font-mono text-[9px] font-bold" style={{ color: dirColor }}>
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 维度评分 */}
      {display.components && (
        <div className="shrink-0 border-b border-panel-border/30 p-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {display.components.map((c) => (
              <div key={c.key} className="flex items-center justify-between">
                <span className="font-mono text-[8px] text-ink-dim">{c.label}</span>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-10 overflow-hidden rounded-full bg-void-300">
                    <div
                      className="h-full rounded-full bg-neon-cyan/60"
                      style={{ width: `${Math.min(c.value * 10, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[8px] text-ink-muted w-4 text-right">{c.value.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI信号列表 */}
      {display.signals && display.signals.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          <div className="mb-1.5 font-mono text-[8px] uppercase tracking-wider text-ink-dim flex items-center gap-1">
            <Bot className="h-2.5 w-2.5 text-neon-purple" />
            智能体信号
          </div>
          <div className="space-y-0.5">
            {display.signals.map((sig, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded px-1.5 py-1"
                style={{
                  background:
                    sig.direction === "long"
                      ? "rgba(0,255,136,0.06)"
                      : sig.direction === "short"
                        ? "rgba(255,51,102,0.06)"
                        : "rgba(0,212,255,0.04)",
                }}
              >
                <span className="font-mono text-[9px] text-ink-muted truncate">{sig.agentName}</span>
                <span
                  className="font-mono text-[9px] font-bold"
                  style={{
                    color:
                      sig.direction === "long"
                        ? "#00ff88"
                        : sig.direction === "short"
                          ? "#ff3366"
                          : "#00d4ff",
                  }}
                >
                  {sig.direction === "long" ? "做多" : sig.direction === "short" ? "做空" : "观望"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 原因列表 */}
      {display.reasons && display.reasons.length > 0 && !display.signals && (
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          <div className="mb-1.5 font-mono text-[8px] uppercase tracking-wider text-ink-dim">
            {t("signal.keyReasons")}
          </div>
          <ul className="space-y-0.5">
            {display.reasons.slice(0, 5).map((r, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-neon-cyan text-[8px] mt-0.5">›</span>
                <span className="font-mono text-[9px] text-ink-muted leading-tight">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 风险提示 */}
      <div className="shrink-0 border-t border-panel-border/30 p-2">
        <div className="flex items-center gap-1 text-ink-dim">
          <AlertTriangle className="h-2.5 w-2.5" />
          <span className="font-mono text-[7px]">交易有风险，信号仅供参考</span>
        </div>
      </div>
    </div>
  );
}
