import { useEffect, useRef } from "react";
import { useMarketStore } from "@/store/useMarketStore";
import { REFRESH_INTERVAL } from "@/lib/constants";

/** 自动刷新 Hook：根据 autoRefresh 状态定时拉取数据 */
export function useAutoRefresh() {
  const autoRefresh = useMarketStore((s) => s.autoRefresh);
  const refresh = useMarketStore((s) => s.refresh);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = window.setInterval(() => {
      refresh();
    }, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [autoRefresh, refresh]);
}
