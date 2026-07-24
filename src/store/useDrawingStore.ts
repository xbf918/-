import { create } from "zustand";

export type DrawingType = "horizontal" | "trend" | "parallel" | "fibonacci" | "rectangle" | "ray";

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
  visible: boolean;
  locked: boolean;
  createdAt: number;
}

export interface DrawingSettings {
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
}

export interface DrawingState {
  drawings: Drawing[];
  activeTool: DrawingType | null;
  currentDrawing: Drawing | null;
  selectedDrawingId: string | null;
  editingPointIndex: number | null;
  hoveredDrawingId: string | null;
  settings: DrawingSettings;
}

export interface DrawingActions {
  setActiveTool: (tool: DrawingType | null) => void;
  addPoint: (time: number, price: number) => void;
  completeDrawing: () => void;
  cancelDrawing: () => void;
  selectDrawing: (id: string | null) => void;
  editPoint: (drawingId: string, pointIndex: number, time: number, price: number) => void;
  deleteDrawing: (id: string) => void;
  updateDrawing: (id: string, updates: Partial<Drawing>) => void;
  clearAllDrawings: () => void;
  toggleDrawingVisibility: (id: string) => void;
  toggleDrawingLock: (id: string) => void;
  setHoveredDrawing: (id: string | null) => void;
  setEditingPoint: (index: number | null) => void;
  updateSettings: (updates: Partial<DrawingSettings>) => void;
}

function generateId(): string {
  return `dw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createNewDrawing(type: DrawingType, settings: DrawingSettings): Drawing {
  return {
    id: generateId(),
    type,
    points: [],
    color: settings.color,
    lineWidth: settings.lineWidth,
    lineStyle: settings.lineStyle,
    visible: true,
    locked: false,
    createdAt: Date.now(),
  };
}

function getRequiredPoints(type: DrawingType): number {
  switch (type) {
    case "horizontal":
      return 1;
    case "trend":
    case "ray":
      return 2;
    case "parallel":
      return 3;
    case "fibonacci":
      return 2;
    case "rectangle":
      return 2;
    default:
      return 2;
  }
}

export const useDrawingStore = create<DrawingState & DrawingActions>((set, get) => ({
  drawings: [],
  activeTool: null,
  currentDrawing: null,
  selectedDrawingId: null,
  editingPointIndex: null,
  hoveredDrawingId: null,
  settings: {
    color: "#00d4ff",
    lineWidth: 2,
    lineStyle: "solid",
  },

  setActiveTool: (tool) => {
    const { settings } = get();
    set({
      activeTool: tool,
      currentDrawing: tool ? createNewDrawing(tool, settings) : null,
      selectedDrawingId: null,
      editingPointIndex: null,
    });
  },

  addPoint: (time, price) => {
    const { currentDrawing, activeTool, drawings } = get();
    if (!currentDrawing || !activeTool) return;
    if (!isFinite(time) || !isFinite(price)) return;

    const requiredPoints = getRequiredPoints(activeTool);
    const newPoints = [...currentDrawing.points, { time, price }];
    const updatedDrawing = { ...currentDrawing, points: newPoints };

    if (newPoints.length >= requiredPoints) {
      // 完成画线：直接添加到 drawings，清除 currentDrawing
      set({
        drawings: [...drawings, updatedDrawing],
        currentDrawing: null,
        activeTool: null,
        selectedDrawingId: updatedDrawing.id,
      });
    } else {
      // 继续画线：更新 currentDrawing
      set({ currentDrawing: updatedDrawing });
    }
  },

  completeDrawing: () => {
    const { currentDrawing, drawings } = get();
    if (!currentDrawing || currentDrawing.points.length === 0) return;

    set({
      drawings: [...drawings, currentDrawing],
      currentDrawing: null,
      activeTool: null,
      selectedDrawingId: currentDrawing.id,
    });
  },

  cancelDrawing: () => {
    set({
      currentDrawing: null,
      activeTool: null,
      editingPointIndex: null,
    });
  },

  selectDrawing: (id) => {
    set({ selectedDrawingId: id, activeTool: null, currentDrawing: null, editingPointIndex: null });
  },

  editPoint: (drawingId, pointIndex, time, price) => {
    set((s) => ({
      drawings: s.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        const newPoints = [...d.points];
        newPoints[pointIndex] = { time, price };
        return { ...d, points: newPoints };
      }),
    }));
  },

  deleteDrawing: (id) => {
    set((s) => ({
      drawings: s.drawings.filter((d) => d.id !== id),
      selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
      hoveredDrawingId: s.hoveredDrawingId === id ? null : s.hoveredDrawingId,
    }));
  },

  updateDrawing: (id, updates) => {
    set((s) => ({
      drawings: s.drawings.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    }));
  },

  clearAllDrawings: () => {
    set({ drawings: [], selectedDrawingId: null, currentDrawing: null, activeTool: null });
  },

  toggleDrawingVisibility: (id) => {
    set((s) => ({
      drawings: s.drawings.map((d) =>
        d.id === id ? { ...d, visible: !d.visible } : d
      ),
    }));
  },

  toggleDrawingLock: (id) => {
    set((s) => ({
      drawings: s.drawings.map((d) =>
        d.id === id ? { ...d, locked: !d.locked } : d
      ),
    }));
  },

  setHoveredDrawing: (id) => {
    set({ hoveredDrawingId: id });
  },

  setEditingPoint: (index) => {
    set({ editingPointIndex: index });
  },

  updateSettings: (updates) => {
    set((s) => ({ settings: { ...s.settings, ...updates } }));
  },
}));
