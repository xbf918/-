import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createChart,
  ColorType,
  IChartApi,
  CrosshairMode,
} from "lightweight-charts";
import { useMarketStore } from "@/store/useMarketStore";
import { removeChartWatermark } from "@/lib/chartWatermark";

type IndicatorType = "rsi" | "kdj" | "cvd";

export function OscillatorChart() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const line1Ref = useRef<any>(null);
  const line2Ref = useRef<any>(null);
  const line3Ref = useRef<any>(null);
  const histRef = useRef<any>(null);
  const watermarkCleanupRef = useRef<(() => void) | null>(null);
  const [activeIndicator, setActiveIndicator] = useState<IndicatorType>("rsi");

  const rsiPoints = useMarketStore((s) => s.rsiPoints);
  const rsiSummary = useMarketStore((s) => s.rsiSummary);
  const kdjPoints = useMarketStore((s) => s.kdjPoints);
  const kdjSummary = useMarketStore((s) => s.kdjSummary);
  const cvdPoints = useMarketStore((s) => s.cvdPoints);
  const cvdSummary = useMarketStore((s) => s.cvdSummary);

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

    line1Ref.current = chart.addLineSeries({
      color: "#00d4ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    line2Ref.current = chart.addLineSeries({
      color: "#ffaa00",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    line3Ref.current = chart.addLineSeries({
      color: "#a855f7",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    histRef.current = chart.addHistogramSeries({
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
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
    if (!chartRef.current || !line1Ref.current || !line2Ref.current || !line3Ref.current || !histRef.current) return;

    if (activeIndicator === "rsi") {
      line1Ref.current.applyOptions({ color: "#00d4ff", lineWidth: 2 });
      line2Ref.current.applyOptions({ color: "rgba(107, 115, 144, 0.5)", lineWidth: 1, style: 2 });
      line3Ref.current.applyOptions({ color: "rgba(107, 115, 144, 0.5)", lineWidth: 1, style: 2 });
      histRef.current.applyOptions({ color: "rgba(0, 212, 255, 0)" });

      if (rsiPoints.length > 0) {
        line1Ref.current.setData(rsiPoints.map((p) => ({ time: p.time as any, value: p.value })));
        const firstTime = rsiPoints[0].time;
        const lastTime = rsiPoints[rsiPoints.length - 1].time;
        line2Ref.current.setData([
          { time: firstTime as any, value: 70 },
          { time: lastTime as any, value: 70 },
        ]);
        line3Ref.current.setData([
          { time: firstTime as any, value: 30 },
          { time: lastTime as any, value: 30 },
        ]);
        histRef.current.setData([]);
        chartRef.current.timeScale().scrollToPosition(5, false);
      }
    } else if (activeIndicator === "kdj") {
      line1Ref.current.applyOptions({ color: "#ffaa00", lineWidth: 2 });
      line2Ref.current.applyOptions({ color: "#00d4ff", lineWidth: 2 });
      line3Ref.current.applyOptions({ color: "#a855f7", lineWidth: 2 });
      histRef.current.applyOptions({ color: "rgba(0, 212, 255, 0)" });

      if (kdjPoints.length > 0) {
        line1Ref.current.setData(kdjPoints.map((p) => ({ time: p.time as any, value: p.k })));
        line2Ref.current.setData(kdjPoints.map((p) => ({ time: p.time as any, value: p.d })));
        line3Ref.current.setData(kdjPoints.map((p) => ({ time: p.time as any, value: p.j })));
        histRef.current.setData([]);
        chartRef.current.timeScale().scrollToPosition(5, false);
      }
    } else if (activeIndicator === "cvd") {
      line1Ref.current.applyOptions({ color: "#00ff88", lineWidth: 2 });
      line2Ref.current.applyOptions({ color: "rgba(107, 115, 144, 0)", lineWidth: 0 });
      line3Ref.current.applyOptions({ color: "rgba(107, 115, 144, 0)", lineWidth: 0 });

      if (cvdPoints.length > 0) {
        line1Ref.current.setData(cvdPoints.map((p) => ({ time: p.time as any, value: p.cvd })));
        histRef.current.setData(
          cvdPoints.map((p) => ({
            time: p.time as any,
            value: p.delta,
            color: p.delta >= 0 ? "rgba(0, 255, 136, 0.5)" : "rgba(255, 51, 102, 0.5)",
          })),
        );
        chartRef.current.timeScale().scrollToPosition(5, false);
      }
    }
  }, [activeIndicator, rsiPoints, kdjPoints, cvdPoints]);

  const indicators: { key: IndicatorType; label: string }[] = [
    { key: "rsi", label: "RSI" },
    { key: "kdj", label: "KDJ" },
    { key: "cvd", label: "CVD" },
  ];

  const getStatusText = () => {
    if (activeIndicator === "rsi" && rsiSummary) {
      return `${rsiSummary.value.toFixed(1)} · ${
        rsiSummary.zone === "overbought" ? t("oscillator.overbought") : rsiSummary.zone === "oversold" ? t("oscillator.oversold") :
        rsiSummary.signal === "bullish" ? t("oscillator.bullish") : rsiSummary.signal === "bearish" ? t("oscillator.bearish") : t("oscillator.neutral")
      }`;
    }
    if (activeIndicator === "kdj" && kdjSummary) {
      return `${kdjSummary.current.k.toFixed(1)}/${kdjSummary.current.d.toFixed(1)} · ${
        kdjSummary.trend === "bullish" ? t("chart.bullCrossover") : kdjSummary.trend === "bearish" ? t("chart.bearCrossover") : t("oscillator.neutral")
      }`;
    }
    if (activeIndicator === "cvd" && cvdSummary) {
      return `${cvdSummary.trend === "bullish" ? `▲ ${t("chart.buyerDominant")}` : cvdSummary.trend === "bearish" ? `▼ ${t("chart.sellerDominant")}` : `— ${t("chart.balanced")}`}`;
    }
    return "";
  };

  const getStatusColor = () => {
    if (activeIndicator === "rsi" && rsiSummary) {
      if (rsiSummary.zone === "overbought") return "text-neon-red";
      if (rsiSummary.zone === "oversold") return "text-neon-green";
      if (rsiSummary.signal === "bullish") return "text-neon-green";
      if (rsiSummary.signal === "bearish") return "text-neon-red";
    }
    if (activeIndicator === "kdj" && kdjSummary) {
      if (kdjSummary.trend === "bullish") return "text-neon-green";
      if (kdjSummary.trend === "bearish") return "text-neon-red";
    }
    if (activeIndicator === "cvd" && cvdSummary) {
      if (cvdSummary.trend === "bullish") return "text-neon-green";
      if (cvdSummary.trend === "bearish") return "text-neon-red";
    }
    return "text-ink-muted";
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1 font-mono text-[9px]">
          {indicators.map((ind) => (
            <button
              key={ind.key}
              onClick={() => setActiveIndicator(ind.key)}
              className={`pointer-events-auto rounded px-1.5 py-0.5 transition-colors ${
                activeIndicator === ind.key
                  ? "bg-neon-cyan/20 text-neon-cyan"
                  : "text-ink-dim hover:text-ink-muted"
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
        <span className={`font-mono text-[9px] ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>
    </div>
  );
}
