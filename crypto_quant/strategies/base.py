"""
策略基类
所有交易策略继承此类
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..data.market_data import KlineData


@dataclass
class Signal:
    """交易信号"""
    direction: str  # "long" / "short" / "neutral"
    strength: float = 0.0  # 信号强度 0-1
    confidence: float = 0.0  # 置信度 0-1
    reason: str = ""
    entry_price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    indicators: Dict[str, Any] = field(default_factory=dict)


class BaseStrategy(ABC):
    """策略基类"""

    def __init__(self, name: str, params: Optional[Dict[str, Any]] = None):
        self.name = name
        self.params = params or {}
        self._validate_params()

    def _validate_params(self):
        """验证参数，子类可重写"""
        pass

    @abstractmethod
    def generate_signal(self, kline: KlineData) -> Signal:
        """生成交易信号"""
        ...

    def generate_signals(self, kline: KlineData) -> List[Signal]:
        """逐根K线生成信号（回测用）"""
        signals = []
        for i in range(50, kline.length):
            sub_kline = KlineData(
                symbol=kline.symbol,
                timeframe=kline.timeframe,
                timestamps=kline.timestamps[:i + 1],
                open=kline.open[:i + 1],
                high=kline.high[:i + 1],
                low=kline.low[:i + 1],
                close=kline.close[:i + 1],
                volume=kline.volume[:i + 1],
            )
            sig = self.generate_signal(sub_kline)
            signals.append(sig)
        return signals

    def optimize_params(self, kline: KlineData, param_ranges: Dict[str, List]) -> Dict[str, Any]:
        """参数优化（网格搜索）"""
        from ..engine.backtest import BacktestEngine
        best_params = None
        best_sharpe = -float("inf")

        def generate_combinations(ranges: Dict[str, List], keys: List[str], idx: int, current: Dict) -> List[Dict]:
            if idx == len(keys):
                return [current.copy()]
            results = []
            for v in ranges[keys[idx]]:
                current[keys[idx]] = v
                results.extend(generate_combinations(ranges, keys, idx + 1, current))
            return results

        keys = list(param_ranges.keys())
        combos = generate_combinations(param_ranges, keys, 0, {})

        for combo in combos:
            self.params.update(combo)
            self._validate_params()
            engine = BacktestEngine(kline, self)
            result = engine.run()
            sharpe = result.get("metrics", {}).get("sharpe_ratio", 0)
            if sharpe > best_sharpe:
                best_sharpe = sharpe
                best_params = combo.copy()

        if best_params:
            self.params.update(best_params)

        return best_params or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "params": self.params,
            "type": self.__class__.__name__,
        }
