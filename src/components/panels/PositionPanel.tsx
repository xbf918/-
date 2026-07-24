import { Briefcase, X, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useTradingStore } from "@/store/useTradingStore";
import { useMarketStore } from "@/store/useMarketStore";
import { calculatePnl } from "@/lib/trading/engine";
import { formatPrice, formatPercent, formatCompact } from "@/lib/format";
import { useTranslation } from "react-i18next";
import { useState } from "react";

interface PositionPanelProps {
  embedded?: boolean;
}

export function PositionPanel({ embedded = false }: PositionPanelProps) {
  const { t } = useTranslation();
  const positions = useTradingStore((s) => s.positions);
  const liveMode = useTradingStore((s) => s.liveMode);
  const ticker = useMarketStore((s) => s.ticker);
  const manualClosePosition = useTradingStore((s) => s.manualClosePosition);
  const liveClosePosition = useTradingStore((s) => s.liveClosePosition);
  const [closing, setClosing] = useState<string | null>(null);

  const currentPrice = ticker?.lastPrice ?? 0;

  const handleClose = async (pos: typeof positions[0]) => {
    const price = pos.symbol === ticker?.symbol ? currentPrice : pos.entryPrice;
    setClosing(pos.id);

    if (liveMode) {
      await liveClosePosition(pos.id, pos.symbol);
    } else {
      manualClosePosition(pos.id, price, "manual_close");
    }

    setClosing(null);
  };

  const totalPnl = positions.reduce((acc, pos) => {
    const price = pos.symbol === ticker?.symbol ? currentPrice : pos.entryPrice;
    const { pnl } = calculatePnl(pos.entryPrice, price, pos.quantity, pos.side, pos.leverage);
    return acc + pnl;
  }, 0);

  const totalPnlPercent = positions.length > 0
    ? (totalPnl / positions.reduce((acc, pos) => acc + pos.margin, 0)) * 100
    : 0;

  const content = (
    <div className={embedded ? "p-1.5 h-full flex flex-col" : "p-2"}>
      {positions.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <Briefcase className="h-5 w-5 text-ink-dim/40" />
          <span className="font-mono text-[10px] text-ink-dim">{t("position.empty")}</span>
        </div>
      ) : (
        <>
          {positions.length > 1 && (
            <div className="mb-1.5 rounded border border-panel-border/30 bg-panel/50 px-2 py-1 shrink-0">
              <div className="flex items-center justify-between font-mono">
                <span className="text-[9px] text-ink-dim">
                  {t("position.totalPositions")}: <span className="text-ink">{positions.length}</span>
                </span>
                <span className={`text-[10px] font-bold ${totalPnl >= 0 ? "text-neon-green" : "text-neon-red"}`}>
                  {totalPnl >= 0 ? "+" : ""}{formatCompact(totalPnl)} USDT
                  <span className="ml-1 text-[8px] font-normal">
                    ({totalPnl >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}%)
                  </span>
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1 flex-1 overflow-y-auto">
            {positions.map((pos) => {
              const price = pos.symbol === ticker?.symbol ? currentPrice : pos.entryPrice;
              const { pnl, pnlPercent } = calculatePnl(
                pos.entryPrice,
                price,
                pos.quantity,
                pos.side,
                pos.leverage,
              );
              const isProfit = pnl >= 0;

              return (
                <div
                  key={pos.id}
                  className={`rounded border p-1.5 ${
                    pos.side === "long"
                      ? "border-neon-green/20 bg-neon-green/[0.03]"
                      : "border-neon-red/20 bg-neon-red/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1">
                      {pos.side === "long" ? (
                        <TrendingUp className="h-2.5 w-2.5 text-neon-green" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5 text-neon-red" />
                      )}
                      <span className="font-display text-[10px] font-bold text-ink">
                        {pos.symbol}
                      </span>
                      <span className={`rounded px-0.5 py-0.5 font-mono text-[7px] ${
                        pos.side === "long"
                          ? "bg-neon-green/20 text-neon-green"
                          : "bg-neon-red/20 text-neon-red"
                      }`}>
                        {pos.side === "long" ? t("common.long") : t("common.short")} {pos.leverage}x
                      </span>
                      {pos.reason === "live" && (
                        <span className="rounded border border-neon-cyan/30 bg-neon-cyan/5 px-0.5 py-0.5 font-mono text-[7px] text-neon-cyan">
                          LIVE
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleClose(pos)}
                      disabled={closing === pos.id}
                      className="rounded border border-panel-border/50 p-0.5 text-ink-dim transition-colors hover:border-neon-red/50 hover:bg-neon-red/10 hover:text-neon-red disabled:opacity-40"
                      title={t("position.close")}
                    >
                      {closing === pos.id ? (
                        <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </div>

                  <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[8px]">
                    <div>
                      <span className="text-ink-dim/60">{t("position.entryPrice")}</span>
                      <span className="ml-0.5 text-ink">{formatPrice(pos.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-ink-dim/60">{t("position.quantity")}</span>
                      <span className="ml-0.5 text-ink">{formatCompact(pos.quantity)}</span>
                    </div>
                    <div>
                      <span className="text-ink-dim/60">{t("position.margin")}</span>
                      <span className="ml-0.5 text-ink">{formatCompact(pos.margin)}</span>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between border-t border-panel-border/20 pt-1">
                    <span className="font-mono text-[8px] text-ink-dim/60">
                      {t("position.liquidation")}: <span className="text-neon-red/70">{formatPrice(pos.liquidationPrice)}</span>
                    </span>
                    {pos.takeProfit && (
                      <span className="font-mono text-[7px] text-neon-green">
                        TP: {formatPrice(pos.takeProfit)}
                      </span>
                    )}
                    {pos.stopLoss && (
                      <span className="font-mono text-[7px] text-neon-red">
                        SL: {formatPrice(pos.stopLoss)}
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-[8px] text-ink-dim">{t("position.unrealizedPnl")}</span>
                    <span className={`font-mono text-[10px] font-bold ${
                      isProfit ? "text-neon-green" : "text-neon-red"
                    }`}>
                      {isProfit ? "+" : ""}{formatCompact(pnl)}
                      <span className="ml-0.5 text-[7px] font-normal">
                        ({isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Panel title={t("position.title")} icon={<Briefcase className="h-3.5 w-3.5" />}>
      {content}
    </Panel>
  );
}
