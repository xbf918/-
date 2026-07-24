import { History, TrendingUp, TrendingDown } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useTradingStore } from "@/store/useTradingStore";
import { formatPrice, formatCompact, formatRelativeTime } from "@/lib/format";
import { useTranslation } from "react-i18next";

interface TradeHistoryPanelProps {
  embedded?: boolean;
}

export function TradeHistoryPanel({ embedded = false }: TradeHistoryPanelProps) {
  const { t } = useTranslation();
  const history = useTradingStore((s) => s.history);
  const stats = useTradingStore((s) => s.stats);

  const getReasonLabel = (reason: string) => {
    const reasonMap: Record<string, string> = {
      manual: t("tradeHistory.manualOpen"),
      manual_close: t("tradeHistory.manualClose"),
      signal_open: t("tradeHistory.signalOpen"),
      signal_flip: t("tradeHistory.signalReverse"),
      take_profit: t("tradeHistory.takeProfit"),
      stop_loss: t("tradeHistory.stopLoss"),
      liquidation: t("tradeHistory.liquidated"),
      trailing_stop: t("tradeHistory.trailingStop"),
    };
    return reasonMap[reason] ?? reason;
  };

  const content = (
    <div className={embedded ? "p-1.5 h-full flex flex-col" : "p-3"}>
      {stats.totalTrades > 0 && (
        <div className="mb-1.5 grid grid-cols-4 gap-1 rounded border border-panel-border/50 bg-void-200/30 p-1.5 shrink-0">
          <Stat label={t("tradeHistory.totalTrades")} value={stats.totalTrades.toString()} />
          <Stat label={t("tradeHistory.winRate")} value={`${stats.winRate.toFixed(1)}%`} accent={stats.winRate >= 50} />
          <Stat label={t("tradeHistory.profitFactor")} value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} accent={stats.profitFactor >= 1} />
          <Stat label={t("tradeHistory.totalPnl")} value={`${stats.totalPnl >= 0 ? "+" : ""}${formatCompact(stats.totalPnl)}`} accent={stats.totalPnl >= 0} />
        </div>
      )}

      {history.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <History className="h-6 w-6 text-ink-dim/40" />
          <span className="font-mono text-[10px] text-ink-dim">{t("tradeHistory.empty")}</span>
        </div>
      ) : (
        <div className="space-y-1 flex-1 overflow-y-auto">
          {history.slice(0, 20).map((trade) => {
            const isProfit = trade.pnl > 0;
            return (
              <div
                key={trade.id}
                className="flex items-center gap-2 rounded border border-panel-border/30 bg-void-200/20 px-2 py-1.5"
              >
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                  trade.side === "long" ? "bg-neon-green/10" : "bg-neon-red/10"
                }`}>
                  {trade.side === "long" ? (
                    <TrendingUp className="h-3 w-3 text-neon-green" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-neon-red" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-[10px] font-semibold text-ink">
                      {trade.symbol}
                    </span>
                    <span className={`rounded px-1 py-0.5 font-mono text-[8px] ${
                      trade.side === "long"
                        ? "bg-neon-green/20 text-neon-green"
                        : "bg-neon-red/20 text-neon-red"
                    }`}>
                      {trade.side === "long" ? t("common.long") : t("common.short")} {trade.leverage}x
                    </span>
                    <span className="ml-auto font-mono text-[8px] text-ink-dim">
                      {getReasonLabel(trade.reason)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[8px] text-ink-dim">
                    <span>{formatPrice(trade.entryPrice)} → {formatPrice(trade.exitPrice)}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(trade.closeTime / 1000)}{t("common.ago")}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-mono text-[10px] font-bold num ${
                    isProfit ? "text-neon-green" : "text-neon-red"
                  }`}>
                    {isProfit ? "+" : ""}{formatCompact(trade.pnl)}
                  </div>
                  <div className={`font-mono text-[8px] ${
                    isProfit ? "text-neon-green/70" : "text-neon-red/70"
                  }`}>
                    {isProfit ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Panel title={t("tradeHistory.title")} icon={<History className="h-3.5 w-3.5" />}>
      {content}
    </Panel>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className="font-mono text-[8px] uppercase tracking-wider text-ink-dim">{label}</div>
      <div className={`font-mono text-[11px] font-bold num ${
        accent === undefined ? "text-ink" : accent ? "text-neon-green" : "text-neon-red"
      }`}>
        {value}
      </div>
    </div>
  );
}
