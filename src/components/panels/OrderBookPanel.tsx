import { useState } from "react";
import { useMarketStore } from "@/store/useMarketStore";
import { useTradingStore } from "@/store/useTradingStore";
import { formatPrice, formatCompact } from "@/lib/format";
import { calculateOrderQuantity } from "@/lib/trading/engine";
import { ArrowUpRight, ArrowDownRight, Play, AlertTriangle, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

function generateOrderBook(price: number) {
  const tick = price > 1000 ? 5 : price > 100 ? 0.5 : 0.01;
  const bids = Array.from({ length: 5 }, (_, i) => {
    const p = price - (i + 1) * tick;
    const q = 0.3 + Math.random() * 1.2;
    return { price: p, quantity: q, amount: p * q };
  });
  const asks = Array.from({ length: 5 }, (_, i) => {
    const p = price + (i + 1) * tick;
    const q = 0.3 + Math.random() * 1.2;
    return { price: p, quantity: q, amount: p * q };
  });
  return { bids, asks };
}

export function OrderBookPanel() {
  const { t } = useTranslation();
  const ticker = useMarketStore((s) => s.ticker);
  const symbol = useMarketStore((s) => s.symbol);
  const config = useTradingStore((s) => s.config);
  const balance = useTradingStore((s) => s.balance);
  const positions = useTradingStore((s) => s.positions);
  const liveMode = useTradingStore((s) => s.liveMode);
  const manualOpenPosition = useTradingStore((s) => s.manualOpenPosition);
  const liveOpenPosition = useTradingStore((s) => s.liveOpenPosition);
  const [confirmSide, setConfirmSide] = useState<"long" | "short" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentPrice = ticker?.lastPrice ?? 67500;
  const change = ticker?.priceChangePercent ?? 2.35;
  const isUp = change >= 0;

  const orderBook = generateOrderBook(currentPrice);

  const estQty = currentPrice > 0
    ? calculateOrderQuantity(balance.available, currentPrice, config.leverage, config.orderSizePercent)
    : 0;

  const totalBids = orderBook.bids.reduce((acc, b) => acc + b.amount, 0);
  const totalAsks = orderBook.asks.reduce((acc, a) => acc + a.amount, 0);

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

  return (
    <div className="flex flex-col h-full">
      {/* 价格信息 */}
      <div className="border-b border-panel-border/50 p-2">
        <div className="flex items-center justify-between">
          <div className="text-right">
            <div className={`font-mono text-xl font-bold tabular-nums ${isUp ? "text-neon-green" : "text-neon-red"}`}>
              ${formatPrice(currentPrice)}
            </div>
            <div className={`flex items-center gap-1 font-mono text-[10px] ${isUp ? "text-neon-green" : "text-neon-red"}`}>
              <span>{isUp ? "+" : ""}{change.toFixed(2)}%</span>
              <span className="text-ink-dim">· 24H</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <div>
              <span className="text-ink-dim">H </span>
              <span className="font-mono text-neon-green">${formatPrice(ticker?.highPrice ?? 67600)}</span>
            </div>
            <div>
              <span className="text-ink-dim">L </span>
              <span className="font-mono text-neon-red">${formatPrice(ticker?.lowPrice ?? 67400)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 五档盘口 */}
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-3 text-center font-mono text-[8px] text-ink-dim border-b border-panel-border/30 px-1 py-0.5">
          <span>价格(USDT)</span>
          <span>数量</span>
          <span>金额(USDT)</span>
        </div>

        {/* 卖盘 */}
        <div className="flex flex-col-reverse">
          {orderBook.asks.map((ask, i) => (
            <div
              key={`ask-${i}`}
              className="grid grid-cols-3 text-center font-mono text-[9px] py-0.5 border-b border-panel-border/20"
              style={{ background: `rgba(255, 51, 102, ${0.08 - i * 0.015})` }}
            >
              <span className="text-neon-red">{ask.price.toFixed(2)}</span>
              <span className="text-ink">{ask.quantity.toFixed(3)}</span>
              <span className="text-ink-dim">{ask.amount.toFixed(0)}</span>
            </div>
          ))}
        </div>

        {/* 买盘 */}
        <div>
          {orderBook.bids.map((bid, i) => (
            <div
              key={`bid-${i}`}
              className="grid grid-cols-3 text-center font-mono text-[9px] py-0.5 border-b border-panel-border/20"
              style={{ background: `rgba(0, 255, 136, ${0.08 - i * 0.015})` }}
            >
              <span className="text-neon-green">{bid.price.toFixed(2)}</span>
              <span className="text-ink">{bid.quantity.toFixed(3)}</span>
              <span className="text-ink-dim">{bid.amount.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 盘口汇总 */}
      <div className="border-t border-panel-border/50 px-2 py-1.5">
        <div className="flex justify-between font-mono text-[9px]">
          <div className="flex items-center gap-2">
            <span className="text-ink-dim">买盘:</span>
            <span className="text-neon-green">{formatCompact(totalBids)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ink-dim">卖盘:</span>
            <span className="text-neon-red">{formatCompact(totalAsks)}</span>
          </div>
        </div>
      </div>

      {/* 交易操作 */}
      <div className="border-t border-panel-border/50 p-2">
        <div className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[8px] mb-2 ${
          liveMode
            ? "border border-neon-red/30 bg-neon-red/5 text-neon-red"
            : "border border-neon-green/30 bg-neon-green/5 text-neon-green"
        }`}>
          {liveMode ? <AlertTriangle className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          <span>{liveMode ? t("trade.liveMode") : t("trade.paperMode")}</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <button
            onClick={() => setConfirmSide("long")}
            disabled={submitting}
            className="flex items-center justify-center gap-1 rounded-lg border border-neon-green/30 bg-neon-green/10 py-2 font-display text-[11px] font-bold text-neon-green transition-all hover:bg-neon-green/20 disabled:opacity-40"
          >
            <ArrowUpRight className="h-4 w-4" />
            {t("trade.openLong")}
          </button>
          <button
            onClick={() => setConfirmSide("short")}
            disabled={submitting}
            className="flex items-center justify-center gap-1 rounded-lg border border-neon-red/30 bg-neon-red/10 py-2 font-display text-[11px] font-bold text-neon-red transition-all hover:bg-neon-red/20 disabled:opacity-40"
          >
            <ArrowDownRight className="h-4 w-4" />
            {t("trade.openShort")}
          </button>
        </div>

        {confirmSide && (
          <div className="space-y-1 rounded border border-panel-border bg-void-200/50 p-1.5">
            <div className="text-center font-mono text-[9px] text-ink-dim">
              {confirmSide === "long" ? t("trade.confirmLong", { symbol }) : t("trade.confirmShort", { symbol })}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setConfirmSide(null)}
                className="rounded border border-panel-border bg-void-300 py-1 font-mono text-[10px] text-ink-muted hover:bg-void-400"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleOpen(confirmSide)}
                className={`rounded border py-1 font-mono text-[10px] font-semibold ${
                  confirmSide === "long"
                    ? "border-neon-green/50 bg-neon-green/10 text-neon-green"
                    : "border-neon-red/50 bg-neon-red/10 text-neon-red"
                }`}
              >
                {t("trade.confirmOpen")}
              </button>
            </div>
          </div>
        )}

        {/* 参数 */}
        <div className="grid grid-cols-3 gap-1 mt-2 rounded border border-panel-border/30 bg-void-200/30 p-1.5">
          <div className="text-center">
            <div className="font-mono text-[7px] text-ink-dim">杠杆</div>
            <div className="font-mono text-[10px] font-bold text-neon-cyan">{config.leverage}x</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[7px] text-ink-dim">仓位</div>
            <div className="font-mono text-[10px] font-bold text-ink">{config.orderSizePercent}%</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[7px] text-ink-dim">数量</div>
            <div className="font-mono text-[10px] text-ink-muted">{estQty.toFixed(4)}</div>
          </div>
        </div>

        {/* 余额 */}
        <div className="flex justify-between mt-1 font-mono text-[8px]">
          <span className="text-ink-dim">{t("profit.accountBalance")}</span>
          <span className="text-ink">${balance.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}