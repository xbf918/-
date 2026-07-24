import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, Play, Zap, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { useTradingStore } from "@/store/useTradingStore";
import { useExchangeStore } from "@/store/useExchangeStore";
import { formatPrice, formatCompact } from "@/lib/format";
import { calculateOrderQuantity } from "@/lib/trading/engine";
import { useTranslation } from "react-i18next";

export function ManualTradePanel() {
  const { t } = useTranslation();
  const ticker = useMarketStore((s) => s.ticker);
  const symbol = useMarketStore((s) => s.symbol);
  const signalScore = useMarketStore((s) => s.signalScore);
  const config = useTradingStore((s) => s.config);
  const balance = useTradingStore((s) => s.balance);
  const positions = useTradingStore((s) => s.positions);
  const liveMode = useTradingStore((s) => s.liveMode);
  const manualOpenPosition = useTradingStore((s) => s.manualOpenPosition);
  const liveOpenPosition = useTradingStore((s) => s.liveOpenPosition);
  const { mode, connections, activeExchange } = useExchangeStore();
  const [confirmSide, setConfirmSide] = useState<"long" | "short" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentPrice = ticker?.lastPrice ?? 0;
  const sameSymbolPositions = positions.filter((p) => p.symbol === symbol);
  const hasLong = sameSymbolPositions.some((p) => p.side === "long");
  const hasShort = sameSymbolPositions.some((p) => p.side === "short");

  const estQty = currentPrice > 0
    ? calculateOrderQuantity(balance.available, currentPrice, config.leverage, config.orderSizePercent)
    : 0;

  const handleOpen = async (side: "long" | "short") => {
    if (currentPrice <= 0) return;
    setSubmitting(true);
    if (liveMode) {
      await liveOpenPosition(symbol, side, currentPrice, config.leverage);
    } else {
      manualOpenPosition(symbol, side, currentPrice, balance.available);
    }
    setSubmitting(false);
    setConfirmSide(null);
  };

  const isConnected = connections[activeExchange]?.connected ?? false;
  const canTrade = !liveMode || (liveMode && isConnected);

  return (
    <Panel title={t("trade.title")} icon={<Play className="h-3.5 w-3.5" />}>
      <div className="space-y-2 p-2.5">
        {/* 价格 + 信号 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[8px] uppercase text-ink-dim">{t("trade.currentPrice")}</div>
            <div className="font-mono text-sm font-bold num text-ink">
              {ticker ? formatPrice(currentPrice) : "--"}
            </div>
          </div>
          {signalScore && (
            <div className="text-right">
              <div className="font-mono text-[8px] uppercase text-ink-dim">{t("trade.signalDirection")}</div>
              <div className={`font-mono text-[11px] font-bold ${
                signalScore.direction === "long" ? "text-neon-green" :
                signalScore.direction === "short" ? "text-neon-red" : "text-neon-cyan"
              }`}>
                {signalScore.direction === "long" ? t("common.long") :
                 signalScore.direction === "short" ? t("common.short") : t("trade.wait")}
                <span className="ml-0.5 text-[9px] opacity-70">({signalScore.confidence.toFixed(0)}%)</span>
              </div>
            </div>
          )}
        </div>

        {/* 模式指示 */}
        <div className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[8px] ${
          liveMode
            ? "border border-neon-red/30 bg-neon-red/5 text-neon-red"
            : "border border-neon-green/30 bg-neon-green/5 text-neon-green"
        }`}>
          {liveMode ? <AlertTriangle className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          <span>{liveMode ? t("trade.liveMode") : t("trade.paperMode")}</span>
          {liveMode && <span className="opacity-60">· {activeExchange}</span>}
        </div>

        {/* 参数 */}
        <div className="grid grid-cols-4 gap-1 rounded border border-panel-border/50 bg-void-200/30 p-1.5">
          <div className="text-center">
            <div className="font-mono text-[7px] uppercase text-ink-dim">{t("trade.leverage")}</div>
            <div className="font-mono text-[11px] font-bold text-neon-cyan">{config.leverage}x</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[7px] uppercase text-ink-dim">{t("trade.position")}</div>
            <div className="font-mono text-[11px] font-bold text-ink">{config.orderSizePercent}%</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[7px] uppercase text-ink-dim">{t("trade.estQuantity")}</div>
            <div className="font-mono text-[10px] text-ink-muted">{estQty.toFixed(4)}</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[7px] uppercase text-ink-dim">{t("trade.notional")}</div>
            <div className="font-mono text-[10px] text-ink-muted">{formatCompact(estQty * currentPrice)}</div>
          </div>
        </div>

        {/* 未连接警告 */}
        {liveMode && !isConnected && (
          <div className="flex items-center gap-1 rounded border border-neon-red/30 bg-neon-red/5 px-1.5 py-1 font-mono text-[9px] text-neon-red">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            <span>{t("trade.notConnected")}</span>
          </div>
        )}

        {/* 开仓按钮 */}
        {confirmSide ? (
          <div className="space-y-1.5 rounded border border-panel-border bg-void-200/50 p-1.5">
            <div className="text-center font-mono text-[9px] text-ink-dim">
              {confirmSide === "long" ? t("trade.confirmLong", { symbol }) : t("trade.confirmShort", { symbol })}
            </div>
            {liveMode && (
              <div className="rounded border border-neon-red/20 bg-neon-red/5 px-1.5 py-0.5 font-mono text-[8px] text-neon-red/80">
                ⚠ {t("trade.liveWarning")}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setConfirmSide(null)}
                disabled={submitting}
                className="rounded border border-panel-border bg-void-300 py-1 font-mono text-[10px] text-ink-muted hover:bg-void-400 disabled:opacity-40"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleOpen(confirmSide)}
                disabled={submitting || !canTrade}
                className={`rounded border py-1 font-mono text-[10px] font-semibold ${
                  confirmSide === "long"
                    ? "border-neon-green/50 bg-neon-green/10 text-neon-green hover:bg-neon-green/20"
                    : "border-neon-red/50 bg-neon-red/10 text-neon-red hover:bg-neon-red/20"
                } disabled:opacity-40`}
              >
                {submitting ? t("trade.submitting") : t("trade.confirmOpen")}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setConfirmSide("long")}
              disabled={(hasLong && !config.allowHedge) || !canTrade}
              className="flex items-center justify-center gap-1 rounded border border-neon-green/30 bg-neon-green/10 py-1.5 font-display text-[10px] font-bold text-neon-green transition-all hover:bg-neon-green/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {t("trade.openLong")}
            </button>
            <button
              onClick={() => setConfirmSide("short")}
              disabled={(hasShort && !config.allowHedge) || !canTrade}
              className="flex items-center justify-center gap-1 rounded border border-neon-red/30 bg-neon-red/10 py-1.5 font-display text-[10px] font-bold text-neon-red transition-all hover:bg-neon-red/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowDownRight className="h-3.5 w-3.5" />
              {t("trade.openShort")}
            </button>
          </div>
        )}

        {/* 自动交易状态 */}
        {config.enabled && signalScore && (
          <div className="flex items-center gap-1 rounded border border-neon-cyan/20 bg-neon-cyan/5 px-1.5 py-1 font-mono text-[8px] text-neon-cyan">
            <Zap className="h-2.5 w-2.5" />
            <span>{t("trade.autoEnabled", { threshold: config.signalThreshold })}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}