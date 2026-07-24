import { useRef } from "react";
import { useMarketStore } from "@/store/useMarketStore";
import { formatPrice, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const HOT_PAIRS = [
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT", price: 67523.50, change: 2.35 },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT", price: 3521.80, change: 1.82 },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT", price: 178.50, change: -0.52 },
  { symbol: "BNBUSDT", base: "BNB", quote: "USDT", price: 612.30, change: 0.95 },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT", price: 0.5230, change: -1.23 },
  { symbol: "DOGEUSDT", base: "DOGE", quote: "USDT", price: 0.1780, change: 3.56 },
  { symbol: "AVAXUSDT", base: "AVAX", quote: "USDT", price: 35.80, change: 1.21 },
  { symbol: "LINKUSDT", base: "LINK", quote: "USDT", price: 14.20, change: -0.87 },
  { symbol: "ADAUSDT", base: "ADA", quote: "USDT", price: 0.4520, change: -0.34 },
  { symbol: "TRXUSDT", base: "TRX", quote: "USDT", price: 0.1240, change: 0.78 },
  { symbol: "TONUSDT", base: "TON", quote: "USDT", price: 7.32, change: -2.15 },
  { symbol: "MATICUSDT", base: "MATIC", quote: "USDT", price: 0.6120, change: 1.05 },
];

export function SymbolTickerBar() {
  const { symbol, setSymbol } = useMarketStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 200;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="flex items-center border-b border-panel-border/50 bg-void-100/60 px-1">
      <button
        onClick={() => scroll("left")}
        className="shrink-0 p-0.5 text-ink-dim hover:text-ink transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div
        ref={scrollRef}
        className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide py-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {HOT_PAIRS.map((pair) => {
          const isSelected = pair.symbol === symbol;
          const isUp = pair.change >= 0;

          return (
            <button
              key={pair.symbol}
              onClick={() => setSymbol(pair.symbol, pair.base, pair.quote)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded border px-2 py-1 transition-all",
                isSelected
                  ? "border-neon-cyan/50 bg-neon-cyan/10"
                  : "border-panel-border/30 bg-void-200/30 hover:border-panel-border/60 hover:bg-void-200/60"
              )}
            >
              <div className="flex flex-col items-start leading-none">
                <span className="font-display text-[10px] font-bold text-ink whitespace-nowrap">
                  {pair.base}/{pair.quote}
                </span>
                <span className="font-mono text-[9px] tabular-nums text-ink-dim">
                  {formatPrice(pair.price)}
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-[9px] whitespace-nowrap",
                  isUp ? "text-neon-green" : "text-neon-red"
                )}
              >
                {isUp ? "+" : ""}{pair.change.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => scroll("right")}
        className="shrink-0 p-0.5 text-ink-dim hover:text-ink transition-colors"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
