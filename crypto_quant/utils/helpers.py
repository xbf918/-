"""
辅助工具函数
"""
import hashlib
import json
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

import numpy as np
import pandas as pd


def ts_to_str(timestamp: float) -> str:
    """时间戳转字符串"""
    if timestamp > 1e12:
        timestamp = timestamp / 1000
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def str_to_ts(s: str, fmt: str = "%Y-%m-%d %H:%M:%S") -> float:
    """字符串转时间戳"""
    dt = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000


def safe_float(v: Any, default: float = 0.0) -> float:
    """安全转float"""
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def safe_int(v: Any, default: int = 0) -> int:
    """安全转int"""
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def calc_sharpe_ratio(returns: List[float], risk_free_rate: float = 0.0, periods: int = 365) -> float:
    """计算夏普比率"""
    if len(returns) < 2:
        return 0.0
    arr = np.array(returns)
    excess = arr - risk_free_rate / periods
    std = np.std(excess)
    if std == 0:
        return 0.0
    return float(np.mean(excess) / std * np.sqrt(periods))


def calc_max_drawdown(equity_curve: List[float]) -> Dict[str, Any]:
    """计算最大回撤"""
    if len(equity_curve) < 2:
        return {"max_drawdown": 0.0, "peak_index": 0, "trough_index": 0, "duration": 0}

    arr = np.array(equity_curve)
    peak = np.maximum.accumulate(arr)
    drawdown = (arr - peak) / peak
    max_dd = float(np.min(drawdown))
    trough_idx = int(np.argmin(drawdown))
    peak_idx = int(np.argmax(arr[:trough_idx + 1]))

    recovery_idx = trough_idx
    for i in range(trough_idx, len(arr)):
        if arr[i] >= arr[peak_idx]:
            recovery_idx = i
            break
    duration = recovery_idx - peak_idx

    return {
        "max_drawdown": max_dd,
        "peak_index": peak_idx,
        "trough_index": trough_idx,
        "duration": duration,
    }


def calc_sma(data: List[float], period: int) -> np.ndarray:
    """计算简单移动平均线"""
    if len(data) < period:
        return np.array([])
    arr = np.array(data, dtype=float)
    sma = np.convolve(arr, np.ones(period) / period, mode="valid")
    result = np.full(len(arr), np.nan)
    result[period - 1:] = sma
    return result


def calc_atr(high: List[float], low: List[float], close: List[float], period: int = 14) -> np.ndarray:
    """计算平均真实波幅（ATR）"""
    n = len(high)
    if n < period + 1:
        return np.array([])

    high_arr = np.array(high, dtype=float)
    low_arr = np.array(low, dtype=float)
    close_arr = np.array(close, dtype=float)

    tr = np.zeros(n)
    tr[0] = high_arr[0] - low_arr[0]
    for i in range(1, n):
        tr[i] = max(
            high_arr[i] - low_arr[i],
            abs(high_arr[i] - close_arr[i - 1]),
            abs(low_arr[i] - close_arr[i - 1]),
        )

    atr = np.zeros(n)
    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, n):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period

    return atr


def calc_rsi(close: List[float], period: int = 14) -> np.ndarray:
    """计算RSI"""
    if len(close) < period + 1:
        return np.array([])

    arr = np.array(close, dtype=float)
    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.zeros(len(arr))
    avg_loss = np.zeros(len(arr))
    avg_gain[period] = np.mean(gains[:period])
    avg_loss[period] = np.mean(losses[:period])

    for i in range(period + 1, len(arr)):
        avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i - 1]) / period
        avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i - 1]) / period

    rsi = np.zeros(len(arr))
    for i in range(period, len(arr)):
        if avg_loss[i] == 0:
            rsi[i] = 100.0
        else:
            rs = avg_gain[i] / avg_loss[i]
            rsi[i] = 100 - 100 / (1 + rs)

    return rsi


def calc_win_rate(trades: List[Any]) -> float:
    """计算胜率"""
    if not trades:
        return 0.0
    wins = 0
    for t in trades:
        pnl = t.get("pnl", 0) if isinstance(t, dict) else getattr(t, "pnl", 0)
        if pnl > 0:
            wins += 1
    return wins / len(trades)


def calc_profit_factor(trades: List[Any]) -> float:
    """计算盈亏比"""
    if not trades:
        return 0.0
    gross_profit = 0.0
    gross_loss = 0.0
    for t in trades:
        pnl = t.get("pnl", 0) if isinstance(t, dict) else getattr(t, "pnl", 0)
        if pnl > 0:
            gross_profit += pnl
        elif pnl < 0:
            gross_loss += abs(pnl)
    if gross_loss == 0:
        return float("inf") if gross_profit > 0 else 0.0
    return gross_profit / gross_loss


def hash_params(params: Dict[str, Any]) -> str:
    """参数哈希，用于缓存"""
    s = json.dumps(params, sort_keys=True, default=str)
    return hashlib.md5(s.encode()).hexdigest()[:16]


def round_price(price: float, tick_size: float = 0.01) -> float:
    """按最小价位取整价格"""
    if tick_size <= 0:
        return price
    return round(price / tick_size) * tick_size


def format_number(n: float, decimals: int = 2) -> str:
    """格式化数字"""
    if abs(n) >= 1e9:
        return f"{n/1e9:.2f}B"
    if abs(n) >= 1e6:
        return f"{n/1e6:.2f}M"
    if abs(n) >= 1e3:
        return f"{n/1e3:.2f}K"
    return f"{n:.{decimals}f}"


class Stopwatch:
    """计时工具"""

    def __init__(self, name: str = ""):
        self.name = name
        self._start = 0.0
        self._elapsed = 0.0

    def start(self):
        self._start = time.time()
        return self

    def stop(self) -> float:
        self._elapsed = time.time() - self._start
        return self._elapsed

    @property
    def elapsed_ms(self) -> float:
        return self._elapsed * 1000

    def __enter__(self):
        return self.start()

    def __exit__(self, *args):
        self.stop()
