"""
双均线趋势跟踪策略
快线金叉慢线做多，死叉做空
"""
from typing import Dict, Any, Optional

import numpy as np

from .base import BaseStrategy, Signal
from ..data.market_data import KlineData, get_market_data


class MATrendStrategy(BaseStrategy):
    """双均线趋势跟踪策略"""

    def __init__(self, params: Optional[Dict[str, Any]] = None):
        default_params = {
            "fast_period": 10,
            "slow_period": 30,
            "signal_period": 5,
        }
        super().__init__("ma_trend", {**default_params, **(params or {})})

    def _validate_params(self):
        fast = self.params.get("fast_period", 10)
        slow = self.params.get("slow_period", 30)
        if fast >= slow:
            raise ValueError("快线周期必须小于慢线周期")

    def generate_signal(self, kline: KlineData) -> Signal:
        md = get_market_data()
        fast = int(self.params["fast_period"])
        slow = int(self.params["slow_period"])

        ma_fast = md.calc_ma(kline, fast)
        ma_slow = md.calc_ma(kline, slow)

        if kline.length < slow + 2:
            return Signal(direction="neutral", reason="数据不足")

        direction = "neutral"
        strength = 0.0
        reason = ""

        last_diff = ma_fast[-1] - ma_slow[-1]
        prev_diff = ma_fast[-2] - ma_slow[-2]

        if np.isnan(ma_fast[-1]) or np.isnan(ma_slow[-1]) or np.isnan(ma_slow[-2]):
            return Signal(direction="neutral", reason="均线未准备好")

        if prev_diff <= 0 and last_diff > 0:
            direction = "long"
            strength = min(1.0, abs(last_diff) / kline.last_price * 100)
            reason = f"快线({fast}MA上穿慢线({slow}MA)，金叉做多"
        elif prev_diff >= 0 and last_diff < 0:
            direction = "short"
            strength = min(1.0, abs(last_diff) / kline.last_price * 100)
            reason = f"快线({fast}MA)下穿慢线({slow}MA)，死叉做空"
        elif last_diff > 0:
            direction = "long"
            strength = 0.3 + min(0.4, abs(last_diff) / kline.last_price * 50)
            reason = "均线上方运行，趋势偏多"
        elif last_diff < 0:
            direction = "short"
            strength = 0.3 + min(0.4, abs(last_diff) / kline.last_price * 50)
            reason = "均线下方运行，趋势偏空"

        confidence = min(1.0, 0.5 + strength)

        current_price = kline.last_price
        sl_pct = 0.02
        tp_pct = 0.04

        return Signal(
            direction=direction,
            strength=strength,
            confidence=confidence,
            reason=reason,
            entry_price=current_price,
            stop_loss=current_price * (1 - sl_pct) if direction == "long" else current_price * (1 + sl_pct),
            take_profit=current_price * (1 + tp_pct) if direction == "long" else current_price * (1 - tp_pct),
            indicators={
                "ma_fast": float(ma_fast[-1]),
                "ma_slow": float(ma_slow[-1]),
                "diff": float(last_diff),
            },
        )
