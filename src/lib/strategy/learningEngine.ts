import type { DimensionStats, DimensionStat, LearningRecord, ScoreWeights, TradeHistory, SignalScore } from "@/types";
import { DEFAULT_WEIGHTS } from "@/lib/constants";

const DIMENSIONS: (keyof DimensionStats)[] = [
  "technical",
  "divergence",
  "liquidity",
  "timeframe",
  "sentiment",
  "patterns",
  "volumeFlow",
];

function createDefaultStat(): DimensionStat {
  return {
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnl: 0,
    avgPnl: 0,
    recentWins: 0,
    recentLosses: 0,
  };
}

function createDefaultStats(): DimensionStats {
  const stats: DimensionStats = {} as DimensionStats;
  for (const dim of DIMENSIONS) {
    stats[dim] = createDefaultStat();
  }
  return stats;
}

function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? (wins / total) * 100 : 0;
}

export function createInitialLearning(): { weights: ScoreWeights; stats: DimensionStats } {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    stats: createDefaultStats(),
  };
}

export function updateStats(
  stats: DimensionStats,
  trade: TradeHistory,
  signal: SignalScore | null,
): DimensionStats {
  const newStats: DimensionStats = { ...stats };
  const isWin = trade.pnl >= 0;
  const recentWindow = 5;

  for (const dim of DIMENSIONS) {
    const stat = { ...stats[dim] };
    
    if (isWin) {
      stat.wins++;
      stat.recentWins = Math.min(recentWindow, stat.recentWins + 1);
      stat.recentLosses = 0;
    } else {
      stat.losses++;
      stat.recentLosses = Math.min(recentWindow, stat.recentLosses + 1);
      stat.recentWins = 0;
    }

    stat.totalPnl += trade.pnl;
    stat.winRate = calculateWinRate(stat.wins, stat.losses);
    stat.avgPnl = stat.wins + stat.losses > 0 ? stat.totalPnl / (stat.wins + stat.losses) : 0;

    newStats[dim] = stat;
  }

  return newStats;
}

export function adjustWeights(
  weights: ScoreWeights,
  stats: DimensionStats,
  trade: TradeHistory,
  signal: SignalScore | null,
): { newWeights: ScoreWeights; records: LearningRecord[] } {
  const newWeights = { ...weights };
  const records: LearningRecord[] = [];
  const isWin = trade.pnl >= 0;
  const pnl = trade.pnl;
  const confidence = signal?.confidence ?? 50;

  const baseAdjustment = isWin ? 0.015 : 0.01;
  const recentStreakWeight = 0.008;

  for (const dim of DIMENSIONS) {
    const stat = stats[dim];
    const currentWeight = getWeightForDim(weights, dim);
    
    let adjustment = 0;

    if (isWin) {
      if (stat.recentWins >= 2) {
        adjustment += recentStreakWeight * stat.recentWins;
      }
      if (stat.winRate > 55) {
        adjustment += baseAdjustment;
      }
    } else {
      if (stat.recentLosses >= 2) {
        adjustment -= recentStreakWeight * stat.recentLosses;
      }
      if (stat.winRate < 45) {
        adjustment -= baseAdjustment;
      }
    }

    if (Math.abs(adjustment) > 0.005) {
      let newWeight = currentWeight + adjustment;
      newWeight = Math.max(0.05, Math.min(0.4, newWeight));

      if (newWeight !== currentWeight) {
        setWeightForDim(newWeights, dim, newWeight);
        records.push({
          timestamp: Math.floor(Date.now() / 1000),
          reason: isWin ? "win" : "loss",
          dimension: dim,
          oldWeight: currentWeight,
          newWeight,
          pnl,
          confidence,
        });
      }
    }
  }

  normalizeWeights(newWeights);

  return { newWeights, records };
}

export function handleConsecutiveLosses(
  weights: ScoreWeights,
  stats: DimensionStats,
  consecutiveLosses: number,
): { newWeights: ScoreWeights; records: LearningRecord[]; riskMode: "normal" | "conservative" | "aggressive" } {
  const newWeights = { ...weights };
  const records: LearningRecord[] = [];
  let riskMode: "normal" | "conservative" | "aggressive" = "normal";

  if (consecutiveLosses >= 2 && consecutiveLosses < 4) {
    riskMode = "conservative";
    for (const dim of DIMENSIONS) {
      const currentWeight = getWeightForDim(newWeights, dim);
      const newWeight = currentWeight * 0.95;
      if (newWeight !== currentWeight) {
        setWeightForDim(newWeights, dim, newWeight);
        records.push({
          timestamp: Math.floor(Date.now() / 1000),
          reason: "consecutive_loss",
          dimension: dim,
          oldWeight: currentWeight,
          newWeight,
          pnl: 0,
          confidence: 0,
        });
      }
    }
    normalizeWeights(newWeights);
  } else if (consecutiveLosses >= 4) {
    riskMode = "conservative";
    for (const dim of DIMENSIONS) {
      const currentWeight = getWeightForDim(newWeights, dim);
      const stat = stats[dim];
      if (stat.winRate < 40) {
        const newWeight = currentWeight * 0.85;
        if (newWeight !== currentWeight) {
          setWeightForDim(newWeights, dim, newWeight);
          records.push({
            timestamp: Math.floor(Date.now() / 1000),
            reason: "consecutive_loss",
            dimension: dim,
            oldWeight: currentWeight,
            newWeight,
            pnl: 0,
            confidence: 0,
          });
        }
      }
    }
    normalizeWeights(newWeights);
  }

  return { newWeights, records, riskMode };
}

function getWeightForDim(weights: ScoreWeights, dim: keyof DimensionStats): number {
  switch (dim) {
    case "technical": return weights.technical;
    case "divergence": return weights.divergence;
    case "liquidity": return weights.liquidity;
    case "timeframe": return weights.timeframe;
    case "sentiment": return weights.sentiment;
    case "patterns": return 0.15;
    case "volumeFlow": return 0.15;
    default: return 0.1;
  }
}

function setWeightForDim(weights: ScoreWeights, dim: keyof DimensionStats, value: number): void {
  switch (dim) {
    case "technical": weights.technical = value; break;
    case "divergence": weights.divergence = value; break;
    case "liquidity": weights.liquidity = value; break;
    case "timeframe": weights.timeframe = value; break;
    case "sentiment": weights.sentiment = value; break;
  }
}

function normalizeWeights(weights: ScoreWeights): void {
  const total = weights.technical + weights.divergence + weights.liquidity + weights.timeframe + weights.sentiment;
  const targetTotal = 1 - 0.3;
  if (total !== targetTotal) {
    const ratio = targetTotal / total;
    weights.technical *= ratio;
    weights.divergence *= ratio;
    weights.liquidity *= ratio;
    weights.timeframe *= ratio;
    weights.sentiment *= ratio;
  }
}

export function calculateRiskThreshold(
  consecutiveLosses: number,
  riskMode: "normal" | "conservative" | "aggressive",
): number {
  let threshold = 50;
  if (riskMode === "conservative") {
    threshold += consecutiveLosses * 5;
  } else if (riskMode === "aggressive") {
    threshold -= 10;
  }
  return Math.min(90, Math.max(40, threshold));
}

export function shouldPauseTrading(
  consecutiveLosses: number,
  maxConsecutiveLosses: number,
): boolean {
  return consecutiveLosses >= maxConsecutiveLosses;
}

export function resetAfterWin(weights: ScoreWeights): ScoreWeights {
  return { ...DEFAULT_WEIGHTS };
}

export function getDimensionDisplayName(dim: keyof DimensionStats): string {
  const names: Record<keyof DimensionStats, string> = {
    technical: "technical",
    divergence: "divergence",
    liquidity: "liquidity",
    timeframe: "timeframe",
    sentiment: "sentiment",
    patterns: "patterns",
    volumeFlow: "volumeFlow",
  };
  return names[dim];
}
