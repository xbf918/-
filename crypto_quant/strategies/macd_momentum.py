"""
MACD 动量策略
MACD金叉做多，死叉做空，柱状图变化确认
"""
from typing import Dict, Any, Optional

import numpy as np

from .base import BaseStrategy, Signal
from ..data.market_data import KlineData, get_market_data


class MACDMomentumStrategy(BaseStrategy):
    """MACD动量策略"""

    def __init__(self, params: Optional[Dict[str, Any]] = None):
        default_params = {
            "fast_period": 12,
            "slow_period": 26,
            "signal_period": 9,
            "hist_threshold": 0.0,
        }
        super().__init__("macd_momentum", {**default_params, **(params or {})})

    def generate_signal(self, kline: KlineData) -> Signal:
        md = get_market_data()
        macd_data = md.calc_macd(kline)

        macd = macd_data["macd"]
        signal = macd_data["signal"]
        hist = macd_data["histogram"]

        if kline.length < 35:
            return Signal(direction="neutral", reason="数据不足")

        if np.isnan(macd[-1]) or np.isnan(signal[-1]):
            return Signal(direction="neutral", reason="MACD未准备好")

        direction = "neutral"
        strength = 0.0
        reason = ""

        macd_cross_up = macd[-2] <= signal[-2] and macd[-1] > signal[-1]
        macd_cross_down = macd[-2] >= signal[-2] and macd[-1] < signal[-1]
        hist_increasing = hist[-1] > hist[-2] and hist[-2] > hist[-3]
        hist_decreasing = hist[-1] < hist[-2] and hist[-2] < hist[-3]

        if macd_cross_up and hist_increasing:
            direction = "long"
            strength = min(1.0, abs(macd[-1] - signal[-1]) / abs(signal[-1]) * 10 if signal[-1] != 0 else 0.5)
            reason = "MACD金叉且柱状图放大，动量做多"
        elif macd_cross_down and hist_decreasing:
            direction = "short"
            strength = min(1.0, abs(macd[-1] - signal[-1]) / abs(signal[-1]) * 10 if signal[-1] != 0 else 0.5)
            reason = "MACD死叉且柱状图缩小，动量做空"
        elif macd[-1] > signal[-1] and hist[-1] > 0:
            direction = "long"
            strength = 0.4 + min(0.3, abs(macd[-1] - signal[-1]) / abs(signal[-1]) * 5 if signal[-1] != 0 else 0.2)
            reason = "MACD在零轴上方运行，偏多"
        elif macd[-1] < signal[-1] and hist[-1] < 0:
            direction = "short"
            strength = 0.4 + min(0.3, abs(macd[-1] - signal[-1]) / abs(signal[-1]) * 5 if signal[-1] != 0 else 0.2)
            reason = "MACD在零轴下方运行，偏空"
        else:
            direction = "neutral"
            reason = "MACD方向不明"

        confidence = min(1.0, 0.5 + strength * 0.5)
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
                "macd": float(macd[-1]),
                "signal": float(signal[-1]),
                "histogram": float(hist[-1]),
            },
        )
