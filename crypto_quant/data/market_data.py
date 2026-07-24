"""
市场数据管理模块
数据缓存、技术指标计算、模拟数据生成
"""
import json
import time
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from dataclasses import dataclass

import numpy as np
import pandas as pd

try:
    import talib
    HAS_TALIB = True
except ImportError:
    HAS_TALIB = False

from .ccxt_client import get_exchange
from ..config.settings import settings, DATA_DIR
from ..utils.logger import logger
from ..utils.helpers import hash_params


@dataclass
class KlineData:
    """K线数据"""
    symbol: str
    timeframe: str
    timestamps: np.ndarray
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray

    @property
    def df(self) -> pd.DataFrame:
        return pd.DataFrame({
            "timestamp": self.timestamps,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        })

    @property
    def length(self) -> int:
        return len(self.close)

    @property
    def last_price(self) -> float:
        return float(self.close[-1]) if len(self.close) > 0 else 0.0


class MarketDataManager:
    """市场数据管理器"""

    _instance: Optional["MarketDataManager"] = None

    def __init__(self):
        self._cache: Dict[str, KlineData] = {}
        self._cache_time: Dict[str, float] = {}
        self._cache_ttl = 60  # 缓存60秒
        self._cache_dir = DATA_DIR / "klines"
        self._cache_dir.mkdir(exist_ok=True)

    @classmethod
    def get_instance(cls) -> "MarketDataManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_klines(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 300,
        use_cache: bool = True,
    ) -> KlineData:
        """获取K线数据"""
        cache_key = f"{symbol}_{timeframe}_{limit}"

        if use_cache and cache_key in self._cache:
            if time.time() - self._cache_time.get(cache_key, 0) < self._cache_ttl:
                return self._cache[cache_key]

        data = self._fetch_klines(symbol, timeframe, limit)
        kline = self._parse_klines(symbol, timeframe, data)

        self._cache[cache_key] = kline
        self._cache_time[cache_key] = time.time()

        return kline

    def _fetch_klines(self, symbol: str, timeframe: str, limit: int) -> List[List[float]]:
        """从交易所获取K线"""
        exchange = get_exchange()

        file_key = hash_params({"symbol": symbol, "tf": timeframe, "limit": limit})
        file_path = self._cache_dir / f"{file_key}.json"

        if file_path.exists():
            try:
                with open(file_path, "r") as f:
                    cached = json.load(f)
                if time.time() - cached.get("fetched_at", 0) < self._cache_ttl:
                    return cached["data"]
            except Exception:
                pass

        data = exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

        try:
            with open(file_path, "w") as f:
                json.dump({"fetched_at": time.time(), "data": data}, f)
        except Exception:
            pass

        return data

    def _parse_klines(self, symbol: str, timeframe: str, data: List[List[float]]) -> KlineData:
        """解析K线数据为数组"""
        if not data:
            empty = np.array([])
            return KlineData(symbol, timeframe, empty, empty, empty, empty, empty, empty)

        arr = np.array(data)
        return KlineData(
            symbol=symbol,
            timeframe=timeframe,
            timestamps=arr[:, 0],
            open=arr[:, 1],
            high=arr[:, 2],
            low=arr[:, 3],
            close=arr[:, 4],
            volume=arr[:, 5],
        )

    def parse_ohlcv(self, data: List[List[float]], symbol: str, timeframe: str) -> KlineData:
        """解析OHLCV数据为KlineData对象（公共方法）"""
        return self._parse_klines(symbol, timeframe, data)

    def calc_ma(self, kline: KlineData, period: int = 20) -> np.ndarray:
        """计算移动平均线"""
        if HAS_TALIB:
            return talib.SMA(kline.close, timeperiod=period)
        return self._sma(kline.close, period)

    def calc_ema(self, kline: KlineData, period: int = 12) -> np.ndarray:
        """计算指数移动平均"""
        if HAS_TALIB:
            return talib.EMA(kline.close, timeperiod=period)
        return self._ema(kline.close, period)

    def calc_macd(self, kline: KlineData) -> Dict[str, np.ndarray]:
        """计算MACD"""
        if HAS_TALIB:
            macd, signal, hist = talib.MACD(kline.close, fastperiod=12, slowperiod=26, signalperiod=9)
            return {"macd": macd, "signal": signal, "histogram": hist}

        ema12 = self.calc_ema(kline, 12)
        ema26 = self.calc_ema(kline, 26)
        dif = ema12 - ema26
        dea = self._ema(dif, 9)
        hist = (dif - dea) * 2
        return {"macd": dif, "signal": dea, "histogram": hist}

    def calc_rsi(self, kline: KlineData, period: int = 14) -> np.ndarray:
        """计算RSI"""
        if HAS_TALIB:
            return talib.RSI(kline.close, timeperiod=period)
        return self._rsi(kline.close, period)

    def calc_bollinger(self, kline: KlineData, period: int = 20, std_dev: float = 2.0) -> Dict[str, np.ndarray]:
        """计算布林带"""
        if HAS_TALIB:
            upper, middle, lower = talib.BBANDS(kline.close, timeperiod=period, nbdevup=std_dev, nbdevdn=std_dev)
            return {"upper": upper, "middle": middle, "lower": lower}

        middle = self.calc_ma(kline, period)
        std = self._rolling_std(kline.close, period)
        return {
            "upper": middle + std_dev * std,
            "middle": middle,
            "lower": middle - std_dev * std,
        }

    def calc_kdj(self, kline: KlineData, n: int = 9, m1: int = 3, m2: int = 3) -> Dict[str, np.ndarray]:
        """计算KDJ"""
        low_min = self._rolling_min(kline.low, n)
        high_max = self._rolling_max(kline.high, n)
        rsv = (kline.close - low_min) / (high_max - low_min + 1e-10) * 100
        rsv = np.nan_to_num(rsv, nan=50.0, posinf=50.0, neginf=50.0)

        k = np.zeros_like(rsv)
        d = np.zeros_like(rsv)
        k[0] = 50
        d[0] = 50
        for i in range(1, len(rsv)):
            k[i] = (m1 - 1) / m1 * k[i - 1] + 1 / m1 * rsv[i]
            d[i] = (m2 - 1) / m2 * d[i - 1] + 1 / m2 * k[i]

        j = 3 * k - 2 * d
        return {"k": k, "d": d, "j": j}

    def calc_atr(self, kline: KlineData, period: int = 14) -> np.ndarray:
        """计算ATR"""
        if HAS_TALIB:
            return talib.ATR(kline.high, kline.low, kline.close, timeperiod=period)
        return self._atr(kline.high, kline.low, kline.close, period)

    def calc_support_resistance(self, kline: KlineData, lookback: int = 50, level_count: int = 3) -> Dict[str, List[float]]:
        """计算支撑阻力位"""
        close = kline.close
        high = kline.high
        low = kline.low

        if len(close) < lookback:
            lookback = len(close)

        highs = high[-lookback:]
        lows = low[-lookback:]

        resistances = []
        supports = []

        for i in range(2, len(highs) - 2):
            if highs[i] > highs[i - 1] and highs[i] > highs[i - 2] and highs[i] > highs[i + 1] and highs[i] > highs[i + 2]:
                resistances.append(float(highs[i]))
            if lows[i] < lows[i - 1] and lows[i] < lows[i - 2] and lows[i] < lows[i + 1] and lows[i] < lows[i + 2]:
                supports.append(float(lows[i]))

        resistances.sort(reverse=True)
        supports.sort()

        return {
            "resistance": resistances[:level_count],
            "support": supports[:level_count],
        }

    def _sma(self, data: np.ndarray, period: int) -> np.ndarray:
        """简单移动平均"""
        result = np.full_like(data, np.nan)
        if len(data) < period:
            return result
        cumsum = np.cumsum(np.insert(data, 0, 0))
        result[period - 1:] = (cumsum[period:] - cumsum[:-period]) / period
        return result

    def _ema(self, data: np.ndarray, period: int) -> np.ndarray:
        """指数移动平均"""
        result = np.full_like(data, np.nan)
        if len(data) < period:
            return result
        k = 2 / (period + 1)
        result[period - 1] = np.mean(data[:period])
        for i in range(period, len(data)):
            result[i] = data[i] * k + result[i - 1] * (1 - k)
        return result

    def _rsi(self, data: np.ndarray, period: int) -> np.ndarray:
        """RSI计算"""
        result = np.full_like(data, np.nan)
        if len(data) < period + 1:
            return result

        deltas = np.diff(data)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])

        if avg_loss == 0:
            result[period] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[period] = 100 - (100 / (1 + rs))

        for i in range(period + 1, len(data)):
            avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period
            if avg_loss == 0:
                result[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                result[i] = 100 - (100 / (1 + rs))

        return result

    def _rolling_std(self, data: np.ndarray, period: int) -> np.ndarray:
        """滚动标准差"""
        result = np.full_like(data, np.nan)
        for i in range(period - 1, len(data)):
            result[i] = np.std(data[i - period + 1:i + 1])
        return result

    def _rolling_max(self, data: np.ndarray, period: int) -> np.ndarray:
        """滚动最大值"""
        result = np.full_like(data, np.nan)
        for i in range(period - 1, len(data)):
            result[i] = np.max(data[i - period + 1:i + 1])
        return result

    def _rolling_min(self, data: np.ndarray, period: int) -> np.ndarray:
        """滚动最小值"""
        result = np.full_like(data, np.nan)
        for i in range(period - 1, len(data)):
            result[i] = np.min(data[i - period + 1:i + 1])
        return result

    def _atr(self, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int) -> np.ndarray:
        """ATR计算"""
        tr = np.zeros_like(high)
        tr[0] = high[0] - low[0]
        for i in range(1, len(high)):
            tr[i] = max(
                high[i] - low[i],
                abs(high[i] - close[i - 1]),
                abs(low[i] - close[i - 1]),
            )
        return self._sma(tr, period)


def get_market_data() -> MarketDataManager:
    return MarketDataManager.get_instance()
