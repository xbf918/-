import type { ScanResult } from "@/services/scanner";

export interface RotationSignal {
  symbol: string;
  base: string;
  direction: "long" | "short";
  price: number;
  score: number;
  confidence: number;
  strength: number;
  agentConfirmed: boolean;
  source: "scanner";
}

export function calculateSignalScore(result: ScanResult): number {
  const signal = result.signal;
  let score = signal.confidence;

  // 智能体确认加分
  if (result.agentAnalysis && result.agentAnalysis.direction === signal.direction) {
    score += result.agentAnalysis.confidence * 0.3;
  }

  // 成交量加分（高流动性）
  const volumeScore = Math.min(10, Math.log10(result.volume + 1) / 2);
  score += volumeScore;

  // 涨跌幅适中加分（避免追高杀跌）
  const changeAbs = Math.abs(result.changePercent);
  if (changeAbs < 5) {
    score += 3;
  } else if (changeAbs < 10) {
    score += 1;
  } else {
    score -= 2;
  }

  return score;
}

export function rankRotationSignals(results: ScanResult[]): RotationSignal[] {
  return results
    .filter((r) => r.signal.direction === "long" || r.signal.direction === "short")
    .map((r) => ({
      symbol: r.symbol,
      base: r.base,
      direction: r.signal.direction as "long" | "short",
      price: r.price,
      score: calculateSignalScore(r),
      confidence: r.signal.confidence,
      strength: (r.signal as any).strength || r.signal.confidence / 100,
      agentConfirmed: !!(
        r.agentAnalysis &&
        r.agentAnalysis.direction === r.signal.direction &&
        r.agentAnalysis.confidence > 0.5
      ),
      source: "scanner" as const,
    }))
    .sort((a, b) => b.score - a.score);
}

export function selectBestSymbols(
  signals: RotationSignal[],
  currentSymbols: string[],
  maxNewPositions: number,
  requireAgentConfirmation: boolean,
): RotationSignal[] {
  const selected: RotationSignal[] = [];

  for (const signal of signals) {
    if (selected.length >= maxNewPositions) break;
    if (currentSymbols.includes(signal.symbol)) continue;
    if (requireAgentConfirmation && !signal.agentConfirmed) continue;
    selected.push(signal);
  }

  return selected;
}
