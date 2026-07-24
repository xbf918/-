import { useState } from "react";
import { useMarketStore } from "@/store/useMarketStore";
import { formatPrice, formatPercent } from "@/lib/format";
import { Search, Star, TrendingUp, TrendingDown, Minus } from "lucide-react";

const HOT_PAIRS = [
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT", price: 67523.50, change: 2.35, volume: 12.5 },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT", price: 3521.80, change: 1.82, volume: 8.3 },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT", price: 178.50, change: -0.52, volume: 5.2 },
  { symbol: "BNBUSDT", base: "BNB", quote: "USDT", price: 612.30, change: 0.95, volume: 2.1 },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT", price: 0.5230, change: -1.23, volume: 4.8 },
  { symbol: "DOGEUSDT", base: "DOGE", quote: "USDT", price: 0.1780, change: 3.56, volume: 3.2 },
  { symbol: "AVAXUSDT", base: "AVAX", quote: "USDT", price: 35.80, change: 1.21, volume: 1.8 },
  { symbol: "LINKUSDT", base: "LINK", quote: "USDT", price: 14.20, change: -0.87, volume: 1.2 },
];

export function WatchlistPanel() {
  const { symbol, setSymbol } = useMarketStore();
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set(["BTCUSDT", "ETHUSDT"]));

  const filteredPairs = HOT_PAIRS.filter((p) =>
    p.base.toLowerCase().includes(search.toLowerCase()) ||
    p.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const toggleFavorite = (sym: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-panel-border/50">
        <span className="font-display text-[11px] font-bold text-ink">热门币种</span>
        <button className="p-0.5 hover:bg-neon-cyan/10 rounded">
          <Star className="h-3 w-3 text-neon-cyan" />
        </button>
      </div>

      <div className="px-2 py-1 border-b border-panel-border/30">
        <div className="flex items-center gap-1 rounded border border-panel-border/50 bg-void-200/50 px-1.5 py-1">
          <Search className="h-3 w-3 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索..."
            className="w-full bg-transparent text-[10px] text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredPairs.map((pair) => {
          const isSelected = pair.symbol === symbol;
          const isFav = favorites.has(pair.symbol);
          const isUp = pair.change >= 0;
          const isFlat = pair.change === 0;
          const DirIcon = isUp ? TrendingUp : isFlat ? Minus : TrendingDown;

          return (
            <button
              key={pair.symbol}
              onClick={() => setSymbol(pair.symbol, pair.base, pair.quote)}
              className={`w-full flex items-center justify-between px-2 py-1.5 transition-colors ${
                isSelected
                  ? "bg-neon-cyan/10 border-l-2 border-neon-cyan"
                  : "hover:bg-void-200/50 border-l-2 border-transparent"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(pair.symbol); }}
                  className={`p-0.5 rounded transition-colors ${isFav ? "text-neon-amber" : "text-ink-dim hover:text-neon-amber"}`}
                >
                  <Star className={`h-2.5 w-2.5 ${isFav ? "fill-current" : ""}`} />
                </button>
                <span className="font-display text-[11px] font-bold text-ink">{pair.base}</span>
                <span className="font-mono text-[9px] text-ink-dim">/{pair.quote}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink tabular-nums">
                  ${pair.price.toLocaleString()}
                </span>
                <div className={`flex items-center gap-0.5 font-mono text-[10px] ${
                  isUp ? "text-neon-green" : "text-neon-red"
                }`}>
                  <DirIcon className="h-2.5 w-2.5" />
                  <span>{isUp ? "+" : ""}{pair.change.toFixed(2)}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}