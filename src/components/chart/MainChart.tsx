import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  CrosshairMode,
  MouseEventParams,
} from "lightweight-charts";
import { useMarketStore } from "@/store/useMarketStore";
import { useTradingStore } from "@/store/useTradingStore";
import { useDrawingStore, type DrawingType } from "@/store/useDrawingStore";
import { useQuantStore } from "@/store/useQuantStore";
import type { SupportResistance } from "@/types";
import { formatCompact } from "@/lib/format";
import { DrawingToolbar, DrawingList } from "@/components/panels/DrawingToolbar";
import { PATTERN_NAMES_ZH } from "@/lib/indicators/patterns";
import { removeChartWatermark } from "@/lib/chartWatermark";

const SUPPORT_COLORS: Record<string, string> = {
  support: "#00ff88",
  resistance: "#ff3366",
};

interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
  size?: number;
}

interface DrawingLineSeries {
  id: string;
  series: ISeriesApi<"Line">;
  type: DrawingType;
}

export function MainChart() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const quantLinesRef = useRef<IPriceLine[]>([]);
  const drawingSeriesRef = useRef<DrawingLineSeries[]>([]);
  const watermarkCleanupRef = useRef<(() => void) | null>(null);

  const candles = useMarketStore((s) => s.candles);
  const supportResistance = useMarketStore((s) => s.supportResistance);
  const ticker = useMarketStore((s) => s.ticker);
  const oiSummary = useMarketStore((s) => s.oiSummary);
  const cvdSummary = useMarketStore((s) => s.cvdSummary);
  const macdPoints = useMarketStore((s) => s.macdPoints);
  const rsiPoints = useMarketStore((s) => s.rsiPoints);
  const candlePatterns = useMarketStore((s) => s.candlePatterns);
  const symbol = useMarketStore((s) => s.symbol);

  const positions = useTradingStore((s) => s.positions);
  const history = useTradingStore((s) => s.history);

  // 量化信号
  const quantServerOnline = useQuantStore((s) => s.serverOnline);
  const strategySignals = useQuantStore((s) => s.strategySignals);
  const selectedStrategies = useQuantStore((s) => s.selectedStrategies);
  const timeframe = useMarketStore((s) => s.timeframe);

  const activeTool = useDrawingStore((s) => s.activeTool);
  const drawings = useDrawingStore((s) => s.drawings);
  const currentDrawing = useDrawingStore((s) => s.currentDrawing);
  const addPoint = useDrawingStore((s) => s.addPoint);
  const selectedDrawingId = useDrawingStore((s) => s.selectedDrawingId);
  const deleteDrawing = useDrawingStore((s) => s.deleteDrawing);
  const selectDrawing = useDrawingStore((s) => s.selectDrawing);
  const editPoint = useDrawingStore((s) => s.editPoint);
  const hoverPointRef = useRef<{ time: number; price: number } | null>(null);
  const dragStateRef = useRef<{ drawingId: string; pointIndex: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7390",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(31, 41, 64, 0.4)" },
        horzLines: { color: "rgba(31, 41, 64, 0.4)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(0, 212, 255, 0.4)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#00d4ff",
        },
        horzLine: {
          color: "rgba(0, 212, 255, 0.4)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#00d4ff",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(31, 41, 64, 0.6)",
        scaleMargins: { top: 0.08, bottom: 0.28 },
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

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00ff88",
      downColor: "#ff3366",
      borderUpColor: "#00ff88",
      borderDownColor: "#ff3366",
      wickUpColor: "#00ff88",
      wickDownColor: "#ff3366",
      priceLineColor: "rgba(0, 212, 255, 0.6)",
      priceLineStyle: 2,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

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
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
      quantLinesRef.current = [];
      drawingSeriesRef.current = [];
    };
  }, []);

  // 键盘删除选中的画线
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawingId) {
        deleteDrawing(selectedDrawingId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDrawingId, deleteDrawing]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    // 从鼠标参数中提取时间和价格
    const getTimePrice = (param: MouseEventParams): { time: number; price: number } | null => {
      if (!param.point) return null;
      // 价格：用 candleSeries 的坐标转换
      const price = candleSeriesRef.current!.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return null;
      // 时间：优先用 param.time
      let time: number | null = null;
      if (param.time !== undefined && param.time !== null) {
        if (typeof param.time === "number") {
          time = param.time;
        } else if (typeof param.time === "object" && (param.time as any).time !== undefined) {
          time = (param.time as any).time;
        }
      }
      if (time === null || !isFinite(time)) {
        // 用 X 坐标转换
        const t = chartRef.current!.timeScale().coordinateToTime(param.point.x);
        if (t !== null) {
          if (typeof t === "number") {
            time = t;
          } else if (typeof t === "object" && (t as any).time !== undefined) {
            time = (t as any).time;
          }
        }
      }
      if (time === null || !isFinite(time)) return null;
      return { time, price };
    };

    const handler = (param: MouseEventParams) => {
      if (activeTool) {
        // 画线模式：添加点位
        const tp = getTimePrice(param);
        if (!tp) return;
        addPoint(tp.time, tp.price);
      } else {
        // 选择模式：检测是否点击到了画线端点
        const tp = getTimePrice(param);
        if (!tp) return;
        let hit = false;
        for (const d of drawings) {
          if (!d.visible || d.locked) continue;
          if (d.type === "horizontal") {
            // 水平线：检测价格是否接近
            if (Math.abs(tp.price - d.points[0].price) / tp.price < 0.002) {
              selectDrawing(d.id);
              hit = true;
              break;
            }
          } else if (d.type === "trend" || d.type === "ray") {
            if (d.points.length >= 2) {
              // 检测是否点击到端点附近（2像素范围内）
              for (let i = 0; i < d.points.length; i++) {
                const p = d.points[i];
                const x = chartRef.current!.timeScale().timeToCoordinate(p.time as any);
                const y = candleSeriesRef.current!.priceToCoordinate(p.price);
                const px = param.point?.x ?? 0;
                const py = param.point?.y ?? 0;
                if (x !== null && y !== null && Math.abs(x - px) < 6 && Math.abs(y - py) < 6) {
                  selectDrawing(d.id);
                  dragStateRef.current = { drawingId: d.id, pointIndex: i };
                  hit = true;
                  break;
                }
              }
              if (hit) break;
            }
          }
        }
        if (!hit) {
          selectDrawing(null);
        }
      }
    };

    // 鼠标移动时实时更新预览
    const moveHandler = (param: MouseEventParams) => {
      // 拖动编辑模式
      if (dragStateRef.current) {
        const tp = getTimePrice(param);
        if (tp) {
          editPoint(dragStateRef.current.drawingId, dragStateRef.current.pointIndex, tp.time, tp.price);
        }
        return;
      }

      if (!activeTool || !currentDrawing) {
        hoverPointRef.current = null;
        return;
      }
      const tp = getTimePrice(param);
      if (!tp) {
        hoverPointRef.current = null;
        return;
      }
      hoverPointRef.current = tp;

      // 实时更新预览 series
      const currentSeries = drawingSeriesRef.current.find((ds) => ds.id === "current");
      if (currentSeries) {
        try {
          const pts = currentDrawing.points;
          if (currentDrawing.type === "horizontal" && pts.length === 0) {
            // 水平线工具：鼠标移动显示水平参考线
            if (candles.length >= 2) {
              currentSeries.series.setData([
                { time: candles[0].time as any, value: tp.price },
                { time: candles[candles.length - 1].time as any, value: tp.price },
              ]);
            }
          } else if (pts.length > 0) {
            // 其他类型：从最后一个点到鼠标位置画线，按时间升序
            const lastPt = pts[pts.length - 1];
            const [a, b] = lastPt.time <= tp.time
              ? [lastPt, tp]
              : [tp, lastPt];
            currentSeries.series.setData([
              { time: a.time as any, value: a.price },
              { time: b.time as any, value: b.price },
            ]);
          }
        } catch {}
      }
    };

    chartRef.current.subscribeClick(handler);
    chartRef.current.subscribeCrosshairMove(moveHandler);

    // 用 DOM 事件处理拖动（mousedown 开始拖动，mouseup 结束）
    const domNode = containerRef.current;
    const onMouseDown = (e: MouseEvent) => {
      if (activeTool || selectedDrawingId === null) return;
      const d = drawings.find((dw) => dw.id === selectedDrawingId);
      if (!d || d.locked) return;
      if (d.type !== "trend" && d.type !== "ray" && d.type !== "horizontal") return;
      const rect = domNode?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pts = d.points;
      for (let i = 0; i < pts.length; i++) {
        const px = chartRef.current!.timeScale().timeToCoordinate(pts[i].time as any);
        const py = candleSeriesRef.current!.priceToCoordinate(pts[i].price);
        if (px !== null && py !== null && Math.abs(px - x) < 8 && Math.abs(py - y) < 8) {
          dragStateRef.current = { drawingId: d.id, pointIndex: i };
          e.preventDefault();
          break;
        }
      }
    };
    const onMouseUp = () => {
      dragStateRef.current = null;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current) return;
      const rect = domNode?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const price = candleSeriesRef.current!.coordinateToPrice(y);
      const t = chartRef.current!.timeScale().coordinateToTime(x);
      let time: number | null = null;
      if (t !== null) {
        time = typeof t === "number" ? t : (t as any).time;
      }
      if (price !== null && isFinite(price) && time !== null && isFinite(time)) {
        editPoint(dragStateRef.current.drawingId, dragStateRef.current.pointIndex, time, price);
      }
    };
    domNode?.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);

    return () => {
      chartRef.current?.unsubscribeClick(handler);
      chartRef.current?.unsubscribeCrosshairMove(moveHandler);
      domNode?.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [activeTool, currentDrawing, addPoint, candles, drawings, selectedDrawingId, selectDrawing, editPoint]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    volumeSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open ? "rgba(0, 255, 136, 0.35)" : "rgba(255, 51, 102, 0.35)",
      })),
    );
    const ts = chartRef.current?.timeScale();
    if (ts) {
      ts.scrollToPosition(5, false);
    }
  }, [candles]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const markers: ChartMarker[] = [];
    const candleTimeMap = new Map<number, number>();
    candles.forEach((c, i) => candleTimeMap.set(c.time, i));

    for (const pt of macdPoints) {
      if (!pt.crossover) continue;
      const idx = candleTimeMap.get(pt.time);
      if (idx === undefined) continue;
      const isBull = pt.crossover === "bullish";
      markers.push({
        time: pt.time,
        position: isBull ? "belowBar" : "aboveBar",
        color: isBull ? "#ffd700" : "#ff6600",
        shape: isBull ? "arrowUp" : "arrowDown",
        text: isBull ? "金叉" : "死叉",
        size: 1,
      });
    }

    for (let i = 1; i < rsiPoints.length; i++) {
      const pt = rsiPoints[i];
      const prev = rsiPoints[i - 1];
      const idx = candleTimeMap.get(pt.time);
      if (idx === undefined) continue;

      if (pt.value > 70 && prev.value <= 70) {
        markers.push({
          time: pt.time,
          position: "aboveBar",
          color: "#ff00ff",
          shape: "square",
          text: "超买",
          size: 0.8,
        });
      }
      if (pt.value < 30 && prev.value >= 30) {
        markers.push({
          time: pt.time,
          position: "belowBar",
          color: "#00ffff",
          shape: "square",
          text: "超卖",
          size: 0.8,
        });
      }
    }

    for (const pattern of candlePatterns) {
      const idx = candleTimeMap.get(pattern.endTime);
      if (idx === undefined) continue;
      const isBull = pattern.direction === "bullish";
      markers.push({
        time: pattern.endTime,
        position: isBull ? "belowBar" : "aboveBar",
        color: isBull ? "#00ff88" : "#ff3366",
        shape: "circle",
        text: PATTERN_NAMES_ZH[pattern.type] || pattern.type.replace(/_/g, " "),
        size: 0.9,
      });
    }

    for (const h of history) {
      if (h.symbol !== symbol) continue;
      const openIdx = candleTimeMap.get(h.openTime);
      const closeIdx = candleTimeMap.get(h.closeTime);
      const isLong = h.side === "long";

      if (openIdx !== undefined) {
        markers.push({
          time: h.openTime,
          position: "belowBar",
          color: isLong ? "#00ff88" : "#ff3366",
          shape: "arrowUp",
          text: isLong ? "开多" : "开空",
          size: 1.2,
        });
      }

      if (closeIdx !== undefined) {
        markers.push({
          time: h.closeTime,
          position: "aboveBar",
          color: h.pnl >= 0 ? "#ffd700" : "#ff3366",
          shape: "arrowDown",
          text: h.pnl >= 0 ? "止盈" : "止损",
          size: 1.2,
        });
      }
    }

    for (const p of positions) {
      if (p.symbol !== symbol) continue;
      const idx = candleTimeMap.get(p.openTime);
      if (idx === undefined) continue;
      const isLong = p.side === "long";
      markers.push({
        time: p.openTime,
        position: "belowBar",
        color: isLong ? "#00ff88" : "#ff3366",
        shape: "arrowUp",
        text: isLong ? "开多" : "开空",
        size: 1.2,
      });
    }

    markers.sort((a, b) => a.time - b.time);

    candleSeriesRef.current.setMarkers(
      markers.map((m) => ({
        time: m.time as any,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })),
    );
  }, [candles, macdPoints, rsiPoints, candlePatterns, history, positions, symbol]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    priceLinesRef.current.forEach((pl) => candleSeriesRef.current?.removePriceLine(pl));
    priceLinesRef.current = [];
    for (const level of supportResistance) {
      const color = SUPPORT_COLORS[level.type];
      const pl = candleSeriesRef.current.createPriceLine({
        price: level.price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${level.type === "support" ? "S" : "R"}${level.strength} · ${level.touches}x`,
      });
      priceLinesRef.current.push(pl);
    }
  }, [supportResistance]);

  // 量化策略信号价格线（入场/止损/止盈）
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // 清除旧的量化信号线
    quantLinesRef.current.forEach((pl) => candleSeriesRef.current?.removePriceLine(pl));
    quantLinesRef.current = [];

    if (!quantServerOnline) return;

    // 收集所有已选策略的信号
    const allSignals = selectedStrategies
      .map((s) => {
        const key = `${s}_${symbol}_${timeframe}`;
        return strategySignals[key]?.signal;
      })
      .filter((sig) => sig && sig.direction !== "neutral" && sig.entry_price > 0);

    if (allSignals.length === 0) return;

    // 判断综合方向
    const longCount = allSignals.filter((s) => s.direction === "long").length;
    const shortCount = allSignals.filter((s) => s.direction === "short").length;
    const dir = longCount > shortCount ? "long" : shortCount > longCount ? "short" : null;
    if (!dir) return;

    // 过滤同方向的信号，加权计算共识价格
    const dirSignals = allSignals.filter((s) => s.direction === dir);
    let totalW = 0, wEntry = 0, wSL = 0, wTP = 0;
    for (const s of dirSignals) {
      const w = s.confidence * s.strength + 0.1;
      wEntry += s.entry_price * w;
      wSL += s.stop_loss * w;
      wTP += s.take_profit * w;
      totalW += w;
    }
    if (totalW === 0) return;
    const entry = wEntry / totalW;
    const stopLoss = wSL / totalW;
    const takeProfit = wTP / totalW;

    // 绘制三条价格线
    const lines: Array<{ price: number; color: string; title: string; lineWidth: 1 | 2; lineStyle: number }> = [
      { price: takeProfit, color: "#00ff88", title: `止盈 ${takeProfit.toFixed(2)}`, lineWidth: 2, lineStyle: 0 },
      { price: entry, color: "#00d4ff", title: `入场 ${entry.toFixed(2)}`, lineWidth: 2, lineStyle: 0 },
      { price: stopLoss, color: "#ff3366", title: `止损 ${stopLoss.toFixed(2)}`, lineWidth: 2, lineStyle: 0 },
    ];

    for (const line of lines) {
      const pl = candleSeriesRef.current.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: line.lineWidth,
        lineStyle: line.lineStyle,
        axisLabelVisible: true,
        title: line.title,
      });
      quantLinesRef.current.push(pl);
    }
  }, [quantServerOnline, strategySignals, selectedStrategies, symbol, timeframe]);

  useEffect(() => {
    if (!chartRef.current) return;

    // 清除旧的画线 series
    drawingSeriesRef.current.forEach((ds) => {
      try { chartRef.current?.removeSeries(ds.series); } catch {}
    });
    drawingSeriesRef.current = [];

    const firstTime = candles[0]?.time;
    const lastTime = candles[candles.length - 1]?.time;
    if (!firstTime || !lastTime) return;

    const toLineStyle = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 1 : 0;
    const safeTime = (t: number) => t as any;

    // 渲染已完成的画线
    for (const drawing of drawings) {
      if (!drawing.visible) continue;
      try {
        const ls = toLineStyle(drawing.lineStyle);
        const isSelected = selectedDrawingId === drawing.id;
        const lw = (isSelected ? drawing.lineWidth + 1 : drawing.lineWidth) as 1 | 2 | 3 | 4;

        const addLine = (data: { time: any; value: number }[], opts?: Partial<{ priceLineVisible: boolean; lineStyle: number; lineWidth: number }>) => {
          const series = chartRef.current!.addLineSeries({
            color: drawing.color,
            lineWidth: (opts?.lineWidth ?? lw) as 1 | 2 | 3 | 4,
            lineStyle: opts?.lineStyle ?? ls,
            crosshairMarkerVisible: true,
            priceLineVisible: opts?.priceLineVisible ?? true,
          });
          series.setData(data);
          return series;
        };

        switch (drawing.type) {
          case "horizontal": {
            if (drawing.points.length >= 1) {
              const price = drawing.points[0].price;
              const series = addLine([
                { time: safeTime(firstTime), value: price },
                { time: safeTime(lastTime), value: price },
              ]);
              drawingSeriesRef.current.push({ id: drawing.id, series, type: drawing.type });
            }
            break;
          }

          case "trend": {
            if (drawing.points.length >= 2) {
              const p0 = drawing.points[0];
              const p1 = drawing.points[1];
              // 线段：按时间升序排列，确保 lightweight-charts 正常渲染
              const [left, right] = p0.time <= p1.time ? [p0, p1] : [p1, p0];
              const series = addLine([
                { time: safeTime(left.time), value: left.price },
                { time: safeTime(right.time), value: right.price },
              ]);
              drawingSeriesRef.current.push({ id: drawing.id, series, type: drawing.type });
            }
            break;
          }

          case "ray": {
            if (drawing.points.length >= 2) {
              const p0 = drawing.points[0]; // 起点
              const p1 = drawing.points[1]; // 方向点
              const dx = p1.time - p0.time;
              const dy = p1.price - p0.price;
              // 射线从 p0 出发，经 p1 方向延伸
              // 计算延伸端点：根据 dx 正负向 firstTime 或 lastTime 之外延伸
              let extendTime: number;
              if (dx === 0) {
                // 垂直方向，时间加小偏移
                extendTime = p0.time + 1;
              } else if (dx > 0) {
                // 向右延伸
                extendTime = lastTime + Math.max(Math.abs(dx), 1);
              } else {
                // 向左延伸
                extendTime = firstTime - Math.max(Math.abs(dx), 1);
              }
              const extendFactor = dx === 0 ? 1 : (extendTime - p0.time) / dx;
              const endPrice = p0.price + dy * extendFactor;
              // 确保 setData 按时间升序
              const data = p0.time <= extendTime
                ? [{ time: safeTime(p0.time), value: p0.price }, { time: safeTime(extendTime), value: isFinite(endPrice) ? endPrice : p1.price }]
                : [{ time: safeTime(extendTime), value: isFinite(endPrice) ? endPrice : p1.price }, { time: safeTime(p0.time), value: p0.price }];
              const series = addLine(data);
              drawingSeriesRef.current.push({ id: drawing.id, series, type: drawing.type });
            }
            break;
          }

          case "parallel": {
            if (drawing.points.length >= 3) {
              const p0 = drawing.points[0];
              const p1 = drawing.points[1];
              const p2 = drawing.points[2];
              const [left, right] = p0.time <= p1.time ? [p0, p1] : [p1, p0];
              const baseSeries = addLine([
                { time: safeTime(left.time), value: left.price },
                { time: safeTime(right.time), value: right.price },
              ], { priceLineVisible: false });
              drawingSeriesRef.current.push({ id: `${drawing.id}-base`, series: baseSeries, type: drawing.type });

              const midPrice = (left.price + right.price) / 2;
              const offset = p2.price - midPrice;
              const channelSeries = addLine([
                { time: safeTime(left.time), value: left.price + offset },
                { time: safeTime(right.time), value: right.price + offset },
              ], { priceLineVisible: false, lineStyle: 2 });
              drawingSeriesRef.current.push({ id: `${drawing.id}-channel`, series: channelSeries, type: drawing.type });
            }
            break;
          }

          case "fibonacci": {
            if (drawing.points.length >= 2) {
              const high = Math.max(drawing.points[0].price, drawing.points[1].price);
              const low = Math.min(drawing.points[0].price, drawing.points[1].price);
              const diff = high - low;
              const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
              levels.forEach((level, i) => {
                const price = high - diff * level;
                const series = addLine([
                  { time: safeTime(firstTime), value: price },
                  { time: safeTime(lastTime), value: price },
                ], {
                  lineWidth: i === 0 || i === levels.length - 1 ? 2 : 1,
                  lineStyle: i === 2 || i === 4 ? 2 : i === 3 ? 0 : 1,
                });
                drawingSeriesRef.current.push({ id: `${drawing.id}-fib-${i}`, series, type: drawing.type });
              });
            }
            break;
          }

          case "rectangle": {
            if (drawing.points.length >= 2) {
              const high = Math.max(drawing.points[0].price, drawing.points[1].price);
              const low = Math.min(drawing.points[0].price, drawing.points[1].price);
              const leftTime = Math.min(drawing.points[0].time, drawing.points[1].time);
              const rightTime = Math.max(drawing.points[0].time, drawing.points[1].time);

              const topSeries = addLine([
                { time: safeTime(leftTime), value: high },
                { time: safeTime(rightTime), value: high },
              ]);
              drawingSeriesRef.current.push({ id: `${drawing.id}-top`, series: topSeries, type: drawing.type });

              const bottomSeries = addLine([
                { time: safeTime(leftTime), value: low },
                { time: safeTime(rightTime), value: low },
              ]);
              drawingSeriesRef.current.push({ id: `${drawing.id}-bottom`, series: bottomSeries, type: drawing.type });
            }
            break;
          }
        }
      } catch (e) {
        console.warn("Failed to render drawing:", drawing.id, e);
      }
    }

    // 渲染当前正在画的线（预览）
    if (currentDrawing && currentDrawing.points.length > 0) {
      try {
        const ls = toLineStyle(currentDrawing.lineStyle);
        const pts = currentDrawing.points;
        const series = chartRef.current.addLineSeries({
          color: currentDrawing.color,
          lineWidth: currentDrawing.lineWidth as 1 | 2 | 3 | 4,
          lineStyle: ls,
          crosshairMarkerVisible: true,
          priceLineVisible: true,
        });

        let data: { time: any; value: number }[] = [];

        if (currentDrawing.type === "horizontal") {
          const price = pts[0].price;
          data = [
            { time: safeTime(firstTime), value: price },
            { time: safeTime(lastTime), value: price },
          ];
        } else if (currentDrawing.type === "trend" || currentDrawing.type === "ray") {
          if (pts.length === 1) {
            // 只有一个点：画一条水平参考线
            data = [
              { time: safeTime(firstTime), value: pts[0].price },
              { time: safeTime(lastTime), value: pts[0].price },
            ];
          } else {
            // 两个点：按时间升序排列
            const [left, right] = pts[0].time <= pts[1].time ? [pts[0], pts[1]] : [pts[1], pts[0]];
            data = [
              { time: safeTime(left.time), value: left.price },
              { time: safeTime(right.time), value: right.price },
            ];
          }
        } else if (currentDrawing.type === "fibonacci" || currentDrawing.type === "rectangle") {
          if (pts.length === 1) {
            data = [
              { time: safeTime(firstTime), value: pts[0].price },
              { time: safeTime(lastTime), value: pts[0].price },
            ];
          } else {
            const [left, right] = pts[0].time <= pts[1].time ? [pts[0], pts[1]] : [pts[1], pts[0]];
            data = [
              { time: safeTime(left.time), value: left.price },
              { time: safeTime(right.time), value: right.price },
            ];
          }
        } else if (currentDrawing.type === "parallel") {
          if (pts.length === 1) {
            data = [
              { time: safeTime(firstTime), value: pts[0].price },
              { time: safeTime(lastTime), value: pts[0].price },
            ];
          } else if (pts.length === 2) {
            const [left, right] = pts[0].time <= pts[1].time ? [pts[0], pts[1]] : [pts[1], pts[0]];
            data = [
              { time: safeTime(left.time), value: left.price },
              { time: safeTime(right.time), value: right.price },
            ];
          } else {
            const [left, right] = pts[0].time <= pts[1].time ? [pts[0], pts[1]] : [pts[1], pts[0]];
            data = [
              { time: safeTime(left.time), value: left.price },
              { time: safeTime(right.time), value: right.price },
            ];
          }
        }

        if (data.length >= 2) {
          series.setData(data);
          drawingSeriesRef.current.push({ id: "current", series, type: currentDrawing.type });
        } else {
          chartRef.current.removeSeries(series);
        }
      } catch (e) {
        console.warn("Failed to render current drawing:", e);
      }
    }
  }, [drawings, currentDrawing, candles, selectedDrawingId]);

  useEffect(() => {
    if (ticker && candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        priceFormat: {
          type: "price",
          precision: ticker.lastPrice >= 100 ? 2 : 6,
          minMove: ticker.lastPrice >= 100 ? 0.01 : 0.000001,
        },
      });
    }
  }, [ticker]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* 顶部工具栏：画线工具 + 图例 */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-panel-border/30 bg-void/80 px-2 py-1 backdrop-blur-sm">
        <div className="flex items-center">
          <DrawingToolbar />
        </div>
        <div className="pointer-events-none flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ background: "#00ff88" }} />
            <span className="font-mono text-[9px] text-ink-dim">{t("chart.support")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ background: "#ff3366" }} />
            <span className="font-mono text-[9px] text-ink-dim">{t("chart.resistance")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px]" style={{ color: "#ffd700" }}>▲</span>
            <span className="font-mono text-[9px] text-ink-dim">金叉/开多</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px]" style={{ color: "#ff6600" }}>▼</span>
            <span className="font-mono text-[9px] text-ink-dim">死叉/开空</span>
          </div>
          {quantServerOnline && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="h-0.5 w-3" style={{ background: "#00d4ff" }} />
                <span className="font-mono text-[9px] text-ink-dim">入场</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-0.5 w-3" style={{ background: "#00ff88" }} />
                <span className="font-mono text-[9px] text-ink-dim">止盈</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-0.5 w-3" style={{ background: "#ff3366" }} />
                <span className="font-mono text-[9px] text-ink-dim">止损</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 画线列表 */}
      <div className="pointer-events-auto absolute left-3 bottom-3 z-10 flex flex-col gap-1">
        <DrawingList />
      </div>

      <div className="pointer-events-none absolute right-3 top-10 z-10 flex flex-col items-end gap-0.5">
        {oiSummary && oiSummary.current.openInterest > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-ink-dim">OI</span>
            <span className={`font-mono text-[9px] font-semibold ${
              oiSummary.rising ? "text-neon-green" : "text-neon-red"
            }`}>
              {formatCompact(oiSummary.current.openInterest)}
              <span className="ml-1 opacity-70">
                ({oiSummary.changePercent >= 0 ? "+" : ""}{oiSummary.changePercent.toFixed(2)}%)
              </span>
            </span>
          </div>
        )}
        {cvdSummary && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-ink-dim">CVD</span>
            <span className={`font-mono text-[9px] font-semibold ${
              cvdSummary.cvdRising ? "text-neon-green" : "text-neon-red"
            }`}>
              {cvdSummary.cvdRising ? `▲ ${t("chart.buyers")}` : `▼ ${t("chart.sellers")}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export type { SupportResistance };