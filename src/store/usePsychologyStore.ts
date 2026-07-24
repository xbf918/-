import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MoodType = "calm" | "greedy" | "fearful" | "fomo" | "hesitant" | "angry" | "overconfident";

export interface MoodRecord {
  id: string;
  timestamp: number;
  mood: MoodType;
  intensity: number; // 1-5
  note: string;
  tradeId?: string;
  symbol?: string;
  side?: "long" | "short";
  pnl?: number;
  pnlPercent?: number;
}

export interface DisciplineRules {
  enabled: boolean;
  maxConsecutiveLosses: number;
  dailyLossPausePercent: number;
  fomoPauseAfterConsecutiveWins: number;
  revengeTradeCooldownMinutes: number;
}

export interface PatternAnalysis {
  byMood: Record<
    MoodType,
    {
      count: number;
      wins: number;
      losses: number;
      winRate: number;
      totalPnl: number;
      avgPnl: number;
      avgPnlPercent: number;
    }
  >;
  summary: {
    bestMood: MoodType | null;
    worstMood: MoodType | null;
    fomoScore: number;
    revengeTradeRisk: "low" | "medium" | "high";
    recommendation: string;
  };
}

interface PsychologyState {
  records: MoodRecord[];
  rules: DisciplineRules;
  addRecord: (record: Omit<MoodRecord, "id" | "timestamp">) => void;
  updateRecordPnl: (id: string, pnl: number, pnlPercent: number) => void;
  removeRecord: (id: string) => void;
  setRules: (rules: Partial<DisciplineRules>) => void;
  analyzePatterns: (history?: Array<{ pnl: number; closeTime: number }>) => PatternAnalysis;
  checkDiscipline: (params: {
    consecutiveLosses: number;
    dailyPnlPercent: number;
    consecutiveWins: number;
    lastTradeTime?: number;
  }) => { triggered: boolean; reason?: string; level?: "warning" | "danger" };
}

export const MOOD_LABELS: Record<MoodType, { label: string; color: string; emoji: string }> = {
  calm: { label: "平静", color: "text-neon-green", emoji: "🧘" },
  greedy: { label: "贪婪", color: "text-yellow", emoji: "🤑" },
  fearful: { label: "恐惧", color: "text-blue", emoji: "😰" },
  fomo: { label: "FOMO", color: "text-orange", emoji: "🚀" },
  hesitant: { label: "犹豫", color: "text-ink-muted", emoji: "🤔" },
  angry: { label: "愤怒", color: "text-red", emoji: "😡" },
  overconfident: { label: "过度自信", color: "text-purple", emoji: "😎" },
};

const DEFAULT_RULES: DisciplineRules = {
  enabled: true,
  maxConsecutiveLosses: 3,
  dailyLossPausePercent: 5,
  fomoPauseAfterConsecutiveWins: 4,
  revengeTradeCooldownMinutes: 30,
};

export const usePsychologyStore = create<PsychologyState>()(
  persist(
    (set, get) => ({
      records: [],
      rules: { ...DEFAULT_RULES },

      addRecord: (record) => {
        const newRecord: MoodRecord = {
          ...record,
          id: `mood-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        };
        set((s) => ({ records: [newRecord, ...s.records] }));
      },

      updateRecordPnl: (id, pnl, pnlPercent) => {
        set((s) => ({
          records: s.records.map((r) =>
            r.id === id ? { ...r, pnl, pnlPercent } : r
          ),
        }));
      },

      removeRecord: (id) => {
        set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
      },

      setRules: (rules) => {
        set((s) => ({ rules: { ...s.rules, ...rules } }));
      },

      analyzePatterns: (history) => {
        const { records } = get();
        const recordsWithPnl = records.filter((r) => r.pnl !== undefined);

        const moods: MoodType[] = [
          "calm",
          "greedy",
          "fearful",
          "fomo",
          "hesitant",
          "angry",
          "overconfident",
        ];

        const byMood = {} as PatternAnalysis["byMood"];
        for (const mood of moods) {
          const subset = recordsWithPnl.filter((r) => r.mood === mood);
          const wins = subset.filter((r) => (r.pnl || 0) > 0).length;
          const losses = subset.filter((r) => (r.pnl || 0) < 0).length;
          const totalPnl = subset.reduce((sum, r) => sum + (r.pnl || 0), 0);
          byMood[mood] = {
            count: subset.length,
            wins,
            losses,
            winRate: subset.length > 0 ? wins / subset.length : 0,
            totalPnl,
            avgPnl: subset.length > 0 ? totalPnl / subset.length : 0,
            avgPnlPercent: subset.length > 0
              ? subset.reduce((sum, r) => sum + (r.pnlPercent || 0), 0) / subset.length
              : 0,
          };
        }

        // Find best/worst moods by win rate (min 3 samples)
        const qualified = moods.filter((m) => byMood[m].count >= 3);
        const bestMood = qualified.length > 0
          ? qualified.reduce((a, b) => (byMood[a].winRate > byMood[b].winRate ? a : b))
          : null;
        const worstMood = qualified.length > 0
          ? qualified.reduce((a, b) => (byMood[a].winRate < byMood[b].winRate ? a : b))
          : null;

        // FOMO score based on recent records
        const recentRecords = records.slice(0, 20);
        const fomoCount = recentRecords.filter((r) => r.mood === "fomo" || r.mood === "greedy").length;
        const fomoScore = recentRecords.length > 0 ? fomoCount / recentRecords.length : 0;

        // Revenge trade risk
        const recentLosses = records.slice(0, 10).filter((r) => (r.pnl || 0) < 0).length;
        let revengeTradeRisk: "low" | "medium" | "high" = "low";
        if (recentLosses >= 5) revengeTradeRisk = "high";
        else if (recentLosses >= 3) revengeTradeRisk = "medium";

        let recommendation = "保持良好状态，按计划执行。";
        if (fomoScore > 0.4) {
          recommendation = "近期 FOMO/贪婪情绪较高，建议降低仓位、等待回调。";
        } else if (revengeTradeRisk === "high") {
          recommendation = "连续亏损较多，暂停交易 30 分钟，避免报复性交易。";
        } else if (worstMood && byMood[worstMood].count >= 3) {
          recommendation = `在"${MOOD_LABELS[worstMood].label}"状态下表现较差，出现该情绪时建议观望。`;
        }

        return {
          byMood,
          summary: {
            bestMood,
            worstMood,
            fomoScore,
            revengeTradeRisk,
            recommendation,
          },
        };
      },

      checkDiscipline: ({ consecutiveLosses, dailyPnlPercent, consecutiveWins, lastTradeTime }) => {
        const { rules, records } = get();
        if (!rules.enabled) return { triggered: false };

        if (consecutiveLosses >= rules.maxConsecutiveLosses) {
          return {
            triggered: true,
            reason: `连续亏损 ${consecutiveLosses} 次，建议暂停交易冷静一下`,
            level: "danger",
          };
        }

        if (dailyPnlPercent <= -rules.dailyLossPausePercent) {
          return {
            triggered: true,
            reason: `日亏损已达 ${Math.abs(dailyPnlPercent).toFixed(2)}%，触发当日停止交易`,
            level: "danger",
          };
        }

        if (consecutiveWins >= rules.fomoPauseAfterConsecutiveWins) {
          return {
            triggered: true,
            reason: `连续盈利 ${consecutiveWins} 次，警惕过度自信/FOMO`,
            level: "warning",
          };
        }

        // Revenge trading: quick trade after a loss with angry/fearful mood
        const recentLossRecord = records.find((r) => (r.pnl || 0) < 0);
        if (
          recentLossRecord &&
          lastTradeTime &&
          lastTradeTime - recentLossRecord.timestamp < rules.revengeTradeCooldownMinutes * 60_000
        ) {
          const latestMood = records[0]?.mood;
          if (latestMood === "angry" || latestMood === "fearful") {
            return {
              triggered: true,
              reason: "亏损后不久又出现负面情绪交易，疑似报复性交易",
              level: "danger",
            };
          }
        }

        return { triggered: false };
      },
    }),
    {
      name: "trading-psychology-storage",
    }
  )
);
