import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, TrendingDown, DollarSign, Percent, Target, Activity } from "lucide-react";
import { useTradingStore } from "@/store/useTradingStore";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";

/** 获取某天的日期 key (YYYY-MM-DD) */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 获取今天的日期 key */
function todayKey(): string {
  return dayKey(Date.now());
}

interface ProfitStatsPanelProps {
  embedded?: boolean;
}

export function ProfitStatsPanel({ embedded = false }: ProfitStatsPanelProps) {
  const { t } = useTranslation();
  const history = useTradingStore((s) => s.history);
  const balance = useTradingStore((s) => s.balance);
  const initialBalance = useTradingStore((s) => s.initialBalance);

  const stats = useMemo(() => {
    const today = todayKey();
    let todayPnl = 0;
    let todayTrades = 0;
    let totalPnl = 0;
    let winTrades = 0;
    let lossTrades = 0;

    for (const h of history) {
      totalPnl += h.pnl;
      if (h.pnl > 0) winTrades++;
      else if (h.pnl < 0) lossTrades++;

      if (dayKey(h.closeTime) === today) {
        todayPnl += h.pnl;
        todayTrades++;
      }
    }

    const todayPnlPercent = initialBalance > 0 ? (todayPnl / initialBalance) * 100 : 0;
    const totalPnlPercent = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;
    const winRate = history.length > 0 ? (winTrades / history.length) * 100 : 0;

    return {
      todayPnl,
      todayPnlPercent,
      todayTrades,
      totalPnl,
      totalPnlPercent,
      winTrades,
      lossTrades,
      winRate,
      totalTrades: history.length,
    };
  }, [history, initialBalance]);

  const content = (
    <div className={embedded ? "p-1.5 h-full flex flex-col gap-1.5" : ""}>
      <div className={`grid grid-cols-2 gap-1.5 ${embedded ? "" : "p-2"}`}>
        {/* 今日收益 */}
        <StatCard
          label={t("profit.todayPnl")}
          value={`$${stats.todayPnl.toFixed(2)}`}
          percent={`${stats.todayPnlPercent >= 0 ? "+" : ""}${stats.todayPnlPercent.toFixed(2)}%`}
          positive={stats.todayPnl >= 0}
          icon={stats.todayPnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          compact={embedded}
        />

        {/* 总收益 */}
        <StatCard
          label={t("profit.totalPnl")}
          value={`$${stats.totalPnl.toFixed(2)}`}
          percent={`${stats.totalPnlPercent >= 0 ? "+" : ""}${stats.totalPnlPercent.toFixed(2)}%`}
          positive={stats.totalPnl >= 0}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          compact={embedded}
        />

        {/* 胜率 */}
        <StatCard
          label={t("profit.winRate")}
          value={`${stats.winRate.toFixed(1)}%`}
          percent={`${stats.winTrades}W / ${stats.lossTrades}L`}
          positive={stats.winRate >= 50}
          icon={<Target className="h-3.5 w-3.5" />}
          compact={embedded}
        />

        {/* 总交易次数 */}
        <StatCard
          label={t("profit.totalTrades")}
          value={`${stats.totalTrades}`}
          percent={`${t("profit.todayTrades")}: ${stats.todayTrades}`}
          positive={true}
          icon={<Activity className="h-3.5 w-3.5" />}
          compact={embedded}
        />
      </div>

      {/* 账户余额 */}
      <div className={`border-t border-panel-border ${embedded ? "px-2 py-1.5 mt-auto" : "px-3 py-2"}`}>
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-ink-dim">{t("profit.accountBalance")}</span>
          <span className="font-bold text-ink">${balance.total.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-ink-dim">{t("profit.available")}</span>
          <span className="text-neon-cyan">${balance.available.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-ink-dim">{t("profit.unrealizedPnl")}</span>
          <span className={cn(balance.unrealizedPnl >= 0 ? "text-neon-green" : "text-neon-red")}>
            {balance.unrealizedPnl >= 0 ? "+" : ""}${balance.unrealizedPnl.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Panel title={t("profit.title")} icon={<DollarSign className="h-3.5 w-3.5" />}>
      {content}
    </Panel>
  );
}

function StatCard({
  label,
  value,
  percent,
  positive,
  icon,
  compact = false,
}: {
  label: string;
  value: string;
  percent: string;
  positive: boolean;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "rounded border border-panel-border bg-void-300/30",
      compact ? "p-1.5" : "p-2"
    )}>
      <div className="flex items-center gap-1 text-ink-dim">
        <span className={cn(positive ? "text-neon-green" : "text-neon-red")}>{icon}</span>
        <span className={cn("font-mono uppercase tracking-wider", compact ? "text-[8px]" : "text-[9px]")}>{label}</span>
      </div>
      <div className={cn(
        "mt-0.5 font-mono font-bold tabular-nums",
        compact ? "text-sm" : "text-lg",
        positive ? "text-neon-green" : "text-neon-red"
      )}>
        {value}
      </div>
      <div className={cn(
        "font-mono",
        compact ? "text-[8px]" : "text-[9px]",
        positive ? "text-neon-green/70" : "text-neon-red/70"
      )}>
        {percent}
      </div>
    </div>
  );
}
