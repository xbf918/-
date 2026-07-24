import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useTradingStore } from "@/store/useTradingStore";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";

/** 获取某天的日期 key (YYYY-MM-DD) */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 获取月份天数和首日偏移 */
function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // 周日=0, 周一=1 ... 调整为周一开始
  const startOffset = (firstDay.getDay() + 6) % 7;
  return { daysInMonth, startOffset };
}

export function ProfitCalendarPanel() {
  const { t } = useTranslation();
  const history = useTradingStore((s) => s.history);
  const initialBalance = useTradingStore((s) => s.initialBalance);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // 按日聚合收益
  const dailyPnl = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number }>();
    for (const h of history) {
      const key = dayKey(h.closeTime);
      const existing = map.get(key) ?? { pnl: 0, trades: 0 };
      existing.pnl += h.pnl;
      existing.trades += 1;
      map.set(key, existing);
    }
    return map;
  }, [history]);

  // 月份汇总
  const monthSummary = useMemo(() => {
    let pnl = 0;
    let trades = 0;
    let winDays = 0;
    let lossDays = 0;
    for (const [key, val] of dailyPnl) {
      const d = new Date(key);
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        pnl += val.pnl;
        trades += val.trades;
        if (val.pnl > 0) winDays++;
        else if (val.pnl < 0) lossDays++;
      }
    }
    const pnlPercent = initialBalance > 0 ? (pnl / initialBalance) * 100 : 0;
    return { pnl, trades, winDays, lossDays, pnlPercent };
  }, [dailyPnl, viewYear, viewMonth, initialBalance]);

  const { daysInMonth, startOffset } = getMonthDays(viewYear, viewMonth);
  const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
  const monthNames = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月",
  ];

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const todayK = dayKey(Date.now());

  return (
    <Panel title={t("profit.calendarTitle")} icon={<Calendar className="h-3.5 w-3.5" />}>
      <div className="p-2">
        {/* 月份导航 */}
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="flex h-6 w-6 items-center justify-center rounded border border-panel-border text-ink-muted hover:border-neon-cyan/40 hover:text-neon-cyan"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-xs font-bold text-ink">
            {viewYear} {monthNames[viewMonth]}
          </span>
          <button
            onClick={nextMonth}
            className="flex h-6 w-6 items-center justify-center rounded border border-panel-border text-ink-muted hover:border-neon-cyan/40 hover:text-neon-cyan"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 月份汇总 */}
        <div className="mb-2 flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
          <div className="flex flex-col">
            <span className="font-mono text-[8px] text-ink-dim">{t("profit.monthPnl")}</span>
            <span className={cn("font-mono text-sm font-bold", monthSummary.pnl >= 0 ? "text-neon-green" : "text-neon-red")}>
              {monthSummary.pnl >= 0 ? "+" : ""}${monthSummary.pnl.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-mono text-[8px] text-ink-dim">{t("profit.monthReturn")}</span>
            <span className={cn("font-mono text-sm font-bold", monthSummary.pnlPercent >= 0 ? "text-neon-green" : "text-neon-red")}>
              {monthSummary.pnlPercent >= 0 ? "+" : ""}{monthSummary.pnlPercent.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 日历网格 */}
        <div className="grid grid-cols-7 gap-0.5">
          {/* 星期表头 */}
          {weekDays.map((d) => (
            <div key={d} className="text-center font-mono text-[8px] text-ink-dim">
              {d}
            </div>
          ))}

          {/* 空白填充 */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* 日期格子 */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const data = dailyPnl.get(key);
            const isToday = key === todayK;
            const pnl = data?.pnl ?? 0;
            const hasTrades = data !== undefined;

            return (
              <div
                key={day}
                className={cn(
                  "relative aspect-square rounded border p-0.5 text-center transition-colors",
                  isToday ? "border-neon-cyan/60" : "border-transparent",
                  !hasTrades && "bg-void-300/20",
                  hasTrades && pnl > 0 && "bg-neon-green/10 border-neon-green/20",
                  hasTrades && pnl < 0 && "bg-neon-red/10 border-neon-red/20",
                  hasTrades && pnl === 0 && "bg-void-300/40",
                )}
              >
                <div className={cn(
                  "font-mono text-[9px] leading-none",
                  isToday ? "font-bold text-neon-cyan" : "text-ink-muted",
                )}>
                  {day}
                </div>
                {hasTrades && (
                  <div className={cn(
                    "font-mono text-[7px] leading-none mt-0.5",
                    pnl > 0 ? "text-neon-green" : pnl < 0 ? "text-neon-red" : "text-ink-dim",
                  )}>
                    {pnl > 0 ? "+" : ""}{pnl.toFixed(1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 图例 */}
        <div className="mt-2 flex items-center justify-center gap-3 font-mono text-[8px] text-ink-dim">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-neon-green/20" /> {t("profit.profitDay")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-neon-red/20" /> {t("profit.lossDay")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-neon-cyan/40" /> {t("profit.today")}
          </span>
        </div>
      </div>
    </Panel>
  );
}
