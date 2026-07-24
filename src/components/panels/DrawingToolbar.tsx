import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Minus,
  TrendingUp,
  AlignJustify,
  Percent,
  Square,
  MousePointer,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  X,
  ChevronRight,
  Settings,
} from "lucide-react";
import { useDrawingStore, type DrawingType } from "@/store/useDrawingStore";
import { cn } from "@/lib/utils";

const DRAWING_TOOLS: { type: DrawingType; icon: React.ReactNode; labelKey: string }[] = [
  { type: "horizontal", icon: <Minus className="h-3.5 w-3.5" />, labelKey: "drawing.horizontal" },
  { type: "trend", icon: <TrendingUp className="h-3.5 w-3.5" />, labelKey: "drawing.trend" },
  { type: "ray", icon: <ChevronRight className="h-3.5 w-3.5" />, labelKey: "drawing.ray" },
  { type: "parallel", icon: <AlignJustify className="h-3.5 w-3.5" />, labelKey: "drawing.parallel" },
  { type: "fibonacci", icon: <Percent className="h-3.5 w-3.5" />, labelKey: "drawing.fibonacci" },
  { type: "rectangle", icon: <Square className="h-3.5 w-3.5" />, labelKey: "drawing.rectangle" },
];

const LINE_STYLES = [
  { value: "solid", label: "实线" },
  { value: "dashed", label: "虚线" },
  { value: "dotted", label: "点线" },
];

const LINE_WIDTHS = [1, 2, 3];

const COLORS = ["#00d4ff", "#ffd700", "#ff3366", "#00ff88", "#ff00ff", "#ff6600"];

export function DrawingToolbar() {
  const { t } = useTranslation();
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const cancelDrawing = useDrawingStore((s) => s.cancelDrawing);
  const clearAllDrawings = useDrawingStore((s) => s.clearAllDrawings);
  const settings = useDrawingStore((s) => s.settings);
  const updateSettings = useDrawingStore((s) => s.updateSettings);

  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setActiveTool(null)}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] transition-all",
          !activeTool
            ? "bg-neon-cyan/15 text-neon-cyan"
            : "text-ink-muted hover:bg-void-200 hover:text-ink"
        )}
        title={t("drawing.select")}
      >
        <MousePointer className="h-3.5 w-3.5" />
      </button>

      <div className="h-5 w-px bg-panel-border/50 mx-1" />

      {DRAWING_TOOLS.map((tool) => (
        <button
          key={tool.type}
          onClick={() => setActiveTool(activeTool === tool.type ? null : tool.type)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-all",
            activeTool === tool.type
              ? "bg-neon-cyan/15 text-neon-cyan"
              : "text-ink-muted hover:bg-void-200 hover:text-ink"
          )}
          title={t(tool.labelKey)}
        >
          {tool.icon}
        </button>
      ))}

      <div className="h-5 w-px bg-panel-border/50 mx-1" />

      <button
        onClick={() => setShowSettings(!showSettings)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-all",
          showSettings
            ? "bg-neon-cyan/15 text-neon-cyan"
            : "text-ink-muted hover:bg-void-200 hover:text-ink"
        )}
        title="样式设置"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {activeTool && (
        <button
          onClick={cancelDrawing}
          className="flex h-6 w-6 items-center justify-center rounded text-neon-red hover:bg-neon-red/10 transition-all"
          title={t("drawing.cancel")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        onClick={clearAllDrawings}
        className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:text-neon-red hover:bg-neon-red/10 transition-all"
        title={t("drawing.clearAll")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {showSettings && (
        <div className="absolute left-2 top-10 z-30 flex flex-col gap-1.5 rounded-lg border border-panel-border bg-void-100 p-2 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] text-ink-dim">颜色</span>
            <div className="flex gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateSettings({ color })}
                  className={cn(
                    "w-4 h-4 rounded-full transition-transform hover:scale-110",
                    settings.color === color && "ring-2 ring-neon-cyan ring-offset-1 ring-offset-void"
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] text-ink-dim">宽度</span>
            <div className="flex gap-0.5">
              {LINE_WIDTHS.map((width) => (
                <button
                  key={width}
                  onClick={() => updateSettings({ lineWidth: width })}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[9px] transition-all",
                    settings.lineWidth === width
                      ? "bg-neon-cyan/15 text-neon-cyan"
                      : "text-ink-muted hover:text-ink"
                  )}
                >
                  {width}px
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] text-ink-dim">样式</span>
            <div className="flex gap-0.5">
              {LINE_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => updateSettings({ lineStyle: style.value as "solid" | "dashed" | "dotted" })}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[9px] transition-all",
                    settings.lineStyle === style.value
                      ? "bg-neon-cyan/15 text-neon-cyan"
                      : "text-ink-muted hover:text-ink"
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DrawingList() {
  const { t } = useTranslation();
  const drawings = useDrawingStore((s) => s.drawings);
  const selectedDrawingId = useDrawingStore((s) => s.selectedDrawingId);
  const selectDrawing = useDrawingStore((s) => s.selectDrawing);
  const deleteDrawing = useDrawingStore((s) => s.deleteDrawing);
  const toggleDrawingVisibility = useDrawingStore((s) => s.toggleDrawingVisibility);
  const toggleDrawingLock = useDrawingStore((s) => s.toggleDrawingLock);

  if (drawings.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 bg-void/90 backdrop-blur-sm rounded-lg border border-panel-border/50 p-1">
      <div className="flex items-center justify-between px-1 py-0.5 border-b border-panel-border/50">
        <span className="font-mono text-[9px] text-ink-dim">{t("drawing.list")}</span>
        <span className="font-mono text-[9px] text-ink">{drawings.length}</span>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {drawings.map((d) => (
          <div
            key={d.id}
            onClick={() => selectDrawing(d.id)}
            className={cn(
              "flex items-center justify-between rounded px-1.5 py-0.5 cursor-pointer transition-all",
              selectedDrawingId === d.id
                ? "bg-neon-cyan/15 border border-neon-cyan/40"
                : "hover:bg-void-200/60"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
              <span className="font-mono text-[9px] text-ink">{t(`drawing.${d.type}`)}</span>
              {!d.visible && <EyeOff className="h-2.5 w-2.5 text-ink-dim" />}
              {d.locked && <Lock className="h-2.5 w-2.5 text-ink-dim" />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); toggleDrawingVisibility(d.id); }}
                className="p-0.5 rounded hover:bg-void-300"
                title={d.visible ? t("drawing.hide") : t("drawing.show")}
              >
                {d.visible ? <Eye className="h-2.5 w-2.5 text-ink-muted" /> : <EyeOff className="h-2.5 w-2.5 text-ink-dim" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleDrawingLock(d.id); }}
                className="p-0.5 rounded hover:bg-void-300"
                title={d.locked ? t("drawing.unlock") : t("drawing.lock")}
              >
                {d.locked ? <Lock className="h-2.5 w-2.5 text-ink-muted" /> : <Unlock className="h-2.5 w-2.5 text-ink-dim" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteDrawing(d.id); }}
                className="p-0.5 rounded text-ink-dim hover:bg-neon-red/20 hover:text-neon-red transition-all"
                title={t("drawing.delete")}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center pt-0.5 border-t border-panel-border/30">
        <span className="font-mono text-[8px] text-ink-dim">按 Delete 删除选中</span>
      </div>
    </div>
  );
}