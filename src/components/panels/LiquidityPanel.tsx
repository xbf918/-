import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { useTranslation } from "react-i18next";
import { liquiditySummary } from "@/lib/liquidity/analyze";
import { formatPrice, formatCompact, formatPercent } from "@/lib/format";
import { Droplets, TrendingUp, TrendingDown } from "lucide-react";

export function LiquidityPanel() {
  const { t } = useTranslation();
  const zones = useMarketStore((s) => s.liquidityZones);
  const gaps = useMarketStore((s) => s.gaps);
  const ticker = useMarketStore((s) => s.ticker);
  const currentPrice = ticker?.lastPrice ?? 0;

  const summary = liquiditySummary(zones);
  const bidZones = zones.filter((z) => z.side === "bid").slice(0, 8);
  const askZones = zones.filter((z) => z.side === "ask").slice(0, 8);
  const maxNotional = Math.max(
    ...bidZones.map((z) => z.notional),
    ...askZones.map((z) => z.notional),
    1,
  );

  const imbalancePositive = summary.imbalance >= 0;

  return (
    <Panel
      title={t("liquidity.title")}
      icon={<Droplets className="h-3.5 w-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          {imbalancePositive ? (
            <TrendingUp className="h-3 w-3 text-neon-green" />
          ) : (
            <TrendingDown className="h-3 w-3 text-neon-red" />
          )}
          <span
            className={`font-mono text-[10px] font-bold ${
              imbalancePositive ? "text-neon-green" : "text-neon-red"
            }`}
          >
            {formatPercent(summary.imbalance, 1)}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 p-3">
        {/* 订单簿深度 */}
        <div className="col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
              {t("liquidity.orderBook")}
            </span>
            <span className="font-mono text-[9px] text-ink-dim">
              {t("liquidity.buySell", { buy: `$${formatCompact(summary.bidPressure)}`, sell: `$${formatCompact(summary.askPressure)}` })}
            </span>
          </div>

          {/* 卖单墙（从上到下，距当前价由近到远） */}
          <div className="space-y-0.5">
            {askZones.slice().reverse().map((z, i) => (
              <DepthBar key={`a${i}`} zone={z} max={maxNotional} side="ask" currentPrice={currentPrice} />
            ))}
          </div>

          {/* 当前价格分隔线 */}
          <div className="my-1 flex items-center gap-2 border-y border-panel-border py-1">
            <div className="h-px flex-1 bg-neon-cyan/30" />
            <span className="font-mono text-[10px] font-bold text-neon-cyan">
              ${formatPrice(currentPrice)}
            </span>
            <div className="h-px flex-1 bg-neon-cyan/30" />
          </div>

          {/* 买单墙 */}
          <div className="space-y-0.5">
            {bidZones.map((z, i) => (
              <DepthBar key={`b${i}`} zone={z} max={maxNotional} side="bid" currentPrice={currentPrice} />
            ))}
          </div>
        </div>

        {/* 买卖墙 */}
        {summary.walls.length > 0 && (
          <div className="col-span-2 border-t border-panel-border pt-2">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-dim">
              ▸ {t("liquidity.keyWalls")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.walls.slice(0, 6).map((w, i) => (
                <span
                  key={i}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                    w.side === "bid"
                      ? "border-neon-green/40 bg-neon-green/10 text-neon-green"
                      : "border-neon-red/40 bg-neon-red/10 text-neon-red"
                  }`}
                >
                  {w.side === "bid" ? t("common.buy") : t("common.sell")} ${formatPrice((w.priceLow + w.priceHigh) / 2)}
                  <span className="ml-1 text-ink-dim">{formatPercent(w.distancePct, 1)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 缺口列表 */}
        <div className="col-span-2 border-t border-panel-border pt-2">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-dim">
            ▸ {t("liquidity.unfilledGaps", { count: gaps.length })}
          </div>
          {gaps.length === 0 ? (
            <div className="font-mono text-[10px] text-ink-dim">{t("liquidity.noGaps")}</div>
          ) : (
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {gaps.slice(0, 6).map((g, i) => {
                const isUp = g.topPrice > currentPrice;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border border-panel-border/50 bg-void-200/40 px-2 py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase ${
                          g.type === "fvg"
                            ? "bg-neon-purple/20 text-neon-purple"
                            : "bg-neon-amber/20 text-neon-amber"
                        }`}
                      >
                        {g.type === "fvg" ? "FVG" : "GAP"}
                      </span>
                      <span
                        className={`font-mono text-[10px] ${isUp ? "text-neon-red" : "text-neon-green"}`}
                      >
                        ${formatPrice(g.bottomPrice)} → ${formatPrice(g.topPrice)}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] text-ink-dim">
                      {isUp ? t("liquidity.above") : t("liquidity.below")} {formatPercent(((g.topPrice - currentPrice) / currentPrice) * 100, 1)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DepthBar({
  zone,
  max,
  side,
  currentPrice,
}: {
  zone: ReturnType<typeof useMarketStore.getState>["liquidityZones"][0];
  max: number;
  side: "bid" | "ask";
  currentPrice: number;
}) {
  const pct = Math.max(2, (zone.notional / max) * 100);
  const color = side === "bid" ? "#00ff88" : "#ff3366";
  const midPrice = (zone.priceLow + zone.priceHigh) / 2;
  return (
    <div className="relative flex items-center justify-between rounded px-1.5 py-0.5">
      <div
        className="absolute inset-y-0 rounded"
        style={{
          background: `${color}15`,
          width: `${pct}%`,
          [side === "bid" ? "left" : "right"]: 0,
          borderRight: side === "bid" ? `1px solid ${color}50` : undefined,
          borderLeft: side === "ask" ? `1px solid ${color}50` : undefined,
        }}
      />
      <span className="relative z-10 font-mono text-[9px] text-ink-muted">
        {side === "bid" ? "BID" : "ASK"} {formatPercent(zone.distancePct, 2)}
      </span>
      <div className="relative z-10 flex items-center gap-1.5">
        {zone.isWall && (
          <span className="rounded px-1 font-mono text-[8px] font-bold" style={{ background: color, color: "#0a0e1a" }}>
            WALL
          </span>
        )}
        <span className="font-mono text-[9px] font-bold" style={{ color }}>
          ${formatCompact(zone.notional)}
        </span>
      </div>
      <span className="relative z-10 font-mono text-[9px] text-ink-dim">{formatPrice(midPrice)}</span>
    </div>
  );
}
