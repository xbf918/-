import { useMarketStore } from "@/store/useMarketStore";
import { formatPrice, formatPercent } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const MARKET_INDEXES = [
  { symbol: "BTC", label: "BTC", color: "#f7931a" },
  { symbol: "ETH", label: "ETH", color: "#627eea" },
  { symbol: "SOL", label: "SOL", color: "#00ffa3" },
  { symbol: "BNB", label: "BNB", color: "#f3ba2f" },
];

export function MarketIndexBar() {
  const ticker = useMarketStore((s) => s.ticker);
  const symbolInfo = useMarketStore((s) => s.symbolInfo);

  const change = ticker?.priceChangePercent ?? 0;
  const isUp = change >= 0;
  const isFlat = change === 0;
  const DirIcon = isUp ? TrendingUp : isFlat ? Minus : TrendingDown;

  return (
    <div className="flex items-center gap-1 border-b border-panel-border/50 bg-void-200/50 px-3 py-0.5">
      <div className="flex h-4 w-px bg-panel-border/50" />

      {MARKET_INDEXES.map((index) => (
        <div key={index.symbol} className="flex items-center gap-1">
          <span
            className="font-display text-[10px] font-bold"
            style={{ color: index.color }}
          >
            {index.label}
          </span>
          <span className="font-mono text-[10px] text-ink">{formatPrice(1000)}</span>
          <span className={`flex items-center gap-0.5 font-mono text-[10px] ${
            index.symbol === "BTC" && isUp ? "text-neon-green" :
            index.symbol === "BTC" && !isFlat ? "text-neon-red" : "text-ink-muted"
          }`}>
            {index.symbol === "BTC" && <DirIcon className="h-3 w-3" />}
            {index.symbol === "BTC" ? (isUp ? "+" : "") + formatPercent(change) : "+0.00%"}
          </span>
          <div className="flex h-4 w-px bg-panel-border/30" />
        </div>
      ))}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase text-ink-dim">VOL</span>
        <span className="font-mono text-[10px] text-ink">
          {ticker ? `${(ticker.quoteVolume / 1e9).toFixed(2)}B` : "--"}
        </span>
      </div>

      <div className="flex h-4 w-px bg-panel-border/50" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] uppercase text-ink-dim">CAP</span>
        <span className="font-mono text-[10px] text-ink">$2.8T</span>
      </div>

      <div className="flex h-4 w-px bg-panel-border/50" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] uppercase text-ink-dim">24H</span>
        <span className={`font-mono text-[10px] ${isUp ? "text-neon-green" : "text-neon-red"}`}>
          {isUp ? "+" : ""}{formatPercent(change)}
        </span>
      </div>
    </div>
  );
}