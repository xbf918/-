// 指数移动平均 EMA & 简单移动平均 SMA

/** 简单移动平均 SMA */
export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/** 指数移动平均 EMA
 *  使用种子值 = 前 period 个值的 SMA 启动，之后用 EMA 公式
 */
export function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  const k = 2 / (period + 1);
  // 种子
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  result[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    const v = values[i] * k + prev * (1 - k);
    result[i] = v;
    prev = v;
  }
  return result;
}

/** 单值 EMA（接收完整序列，返回最新 EMA 值） */
export function emaLast(values: number[], period: number): number | null {
  const arr = ema(values, period);
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
