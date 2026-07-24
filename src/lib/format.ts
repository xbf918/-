// 格式化与通用工具函数

/** 格式化价格，根据数量级自动选择小数位 */
export function formatPrice(value: number): string {
  if (!isFinite(value)) return "--";
  const abs = Math.abs(value);
  let digits: number;
  if (abs >= 10000) digits = 2;
  else if (abs >= 1000) digits = 2;
  else if (abs >= 100) digits = 2;
  else if (abs >= 1) digits = 4;
  else if (abs >= 0.01) digits = 6;
  else digits = 8;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 格式化百分比 */
export function formatPercent(value: number, digits = 2): string {
  if (!isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** 格式化大数字（K/M/B） */
export function formatCompact(value: number): string {
  if (!isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

/** 相对时间 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() / 1000 - timestamp;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** 标准时间格式 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 限制数值范围 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 拆分交易对符号 BTCUSDT -> BTC/USDT */
export function splitSymbol(symbol: string): { base: string; quote: string } {
  const quotes = ["USDT", "USDC", "BUSD", "BTC", "ETH", "BNB"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) {
      return { base: symbol.slice(0, -q.length), quote: q };
    }
  }
  return { base: symbol, quote: "" };
}

/** 方向颜色映射 */
export function directionColor(dir: "bullish" | "bearish" | "neutral"): string {
  if (dir === "bullish") return "#00ff88";
  if (dir === "bearish") return "#ff3366";
  return "#00d4ff";
}

/** 中文方向标签 */
export function directionLabel(dir: "bullish" | "bearish" | "neutral"): string {
  if (dir === "bullish") return "看涨";
  if (dir === "bearish") return "看跌";
  return "中性";
}
