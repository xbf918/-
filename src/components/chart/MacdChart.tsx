import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  createChart,
  ColorType,
  IChartApi,
  CrosshairMode,
} from "lightweight-charts";
import { useMarketStore } from "@/store/useMarketStore";
import { removeChartWatermark } from "@/lib/chartWatermark";

export function MacdChart() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const histSeriesRef = useRef<any>(null);
  const macdLineRef = useRef<any>(null);
  const signalLineRef = useRef<any>(null);
  const watermarkCleanupRef = useRef<(() => void) | null>(null);

  const macdPoints = useMarketStore((s) => s.macdPoints);
  const macdSummary = useMarketStore((s) => s.macdSummary);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7390",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(31, 41, 64, 0.3)" },
        horzLines: { color: "rgba(31, 41, 64, 0.3)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(0, 212, 255, 0.3)", width: 1, style: 2 },
        horzLine: { color: "rgba(0, 212, 255, 0.3)", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "rgba(31, 41, 64, 0.6)",
      },
      timeScale: {
        borderColor: "rgba(31, 41, 64, 0.6)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
      },
      handleScale: true,
      handleScroll: true,
    });
    chartRef.current = chart;

    histSeriesRef.current = chart.addHistogramSeries({
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    macdLineRef.current = chart.addLineSeries({
      color: "#00d4ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    signalLineRef.current = chart.addLineSeries({
      color: "#ffaa00",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const resize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);

    // 移除 TradingView 水印/logo（持续监控）
    if (containerRef.current) {
      watermarkCleanupRef.current = removeChartWatermark(containerRef.current);
    }

    return () => {
      ro.disconnect();
      watermarkCleanupRef.current?.();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!histSeriesRef.current || !macdLineRef.current || !signalLineRef.current || macdPoints.length === 0)
      return;
    histSeriesRef.current.setData(
      macdPoints.map((p) => ({
        time: p.time as any,
        value: p.histogram,
        color:
          p.histogram >= 0
            ? p.crossover === "bullish"
              ? "#00ff88"
              : "rgba(0, 255, 136, 0.6)"
            : p.crossover === "bearish"
              ? "#ff3366"
              : "rgba(255, 51, 102, 0.6)",
      })),
    );
    macdLineRef.current.setData(
      macdPoints.map((p) => ({ time: p.time as any, value: p.macd })),
    );
    signalLineRef.current.setData(
      macdPoints.map((p) => ({ time: p.time as any, value: p.signal })),
    );
    chartRef.current?.timeScale().scrollToPosition(5, false);
  }, [macdPoints]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* MACD 状态标注 */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-center gap-3 font-mono text-[9px]">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3" style={{ background: "#00d4ff" }} />
          <span className="text-ink-dim">MACD</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3" style={{ background: "#ffaa00" }} />
          <span className="text-ink-dim">{t("chart.signal")}</span>
        </span>
        {macdSummary && (
          <span
            className={
              macdSummary.trend === "bullish"
                ? "text-neon-green"
                : macdSummary.trend === "bearish"
                  ? "text-neon-red"
                  : "text-ink-muted"
            }
          >
            {macdSummary.trend === "bullish" ? `▲ ${t("chart.bullish")}` : macdSummary.trend === "bearish" ? `▼ ${t("chart.bearish")}` : `● ${t("common.neutral")}`}
          </span>
        )}
      </div>
    </div>
  );
}
