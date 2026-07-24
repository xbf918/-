"""
布林带突破策略
价格突破上轨做多，突破下轨做空
"""
from typing import Dict, Any, Optional

import numpy as np

from .base import BaseStrategy, Signal
from ..data.market_data import KlineData, get_market_data


class BollingerBreakoutStrategy(BaseStrategy):
    """布林带突破策略"""

    def __init__(self, params: Optional[Dict[str, Any]] = None):
        default_params = {
            "period": 20,
            "std_dev": 2.0,
            "lookback": 3,
            "volatility_filter": True,
        }
        super().__init__("bollinger_breakout", {**default_params, **(params or {})})

    def generate_signal(self, kline: KlineData) -> Signal:
        md = get_market_data()
        period = int(self.params["period"])
        std_dev = float(self.params["std_dev"])
        lookback = int(self.params["lookback"])

        boll = md.calc_bollinger(kline, period, std_dev)

        if kline.length < period + lookback:
            return Signal(direction="neutral", reason="数据不足")

        if np.isnan(boll["upper"][-1]) or np.isnan(boll["lower"][-1]):
            return Signal(direction="neutral", reason="布林带未准备好")

        direction = "neutral"
        strength = 0.0
        reason = ""

        upper = boll["upper"]
        lower = boll["lower"]
        middle = boll["middle"]
        close = kline.close
        high = kline.high
        low = kline.low

        band_width = (upper[-1] - lower[-1]) / middle[-1] if middle[-1] > 0 else 0

        breakout_up = all(high[i] <= upper[i] for i in range(-lookback, -1)) and close[-1] > upper[-1]
        breakout_down = all(low[i] >= lower[i] for i in range(-lookback, -1)) and close[-1] < lower[-1]

        if breakout_up:
            direction = "long"
            strength = min(1.0, (close[-1] - upper[-1]) / upper[-1] * 50)
            reason = f"价格突破上轨，布林带宽度{band_width*100:.2f}%"
        elif breakout_down:
            direction = "short"
            strength = min(1.0, (lower[-1] - close[-1]) / lower[-1] * 50)
            reason = f"价格跌破下轨，布林带宽度{band_width*100:.2f}%"
        elif close[-1] > middle[-1]:
            direction = "long"
            strength = 0.3 + (close[-1] - middle[-1]) / (upper[-1] - middle[-1]) * 0.3 if upper[-1] > middle[-1] else 0.3
            reason = "价格在中轨上方运行"
        elif close[-1] < middle[-1]:
            direction = "short"
            strength = 0.3 + (middle[-1] - close[-1]) / (middle[-1] - lower[-1]) * 0.3 if middle[-1] > lower[-1] else 0.3
            reason = "价格在中轨下方运行"
        else:
            direction = "neutral"
            reason = "价格在中轨附近"

        confidence = min(1.0, 0.5 + strength * 0.5)
        current_price = close[-1]

        if direction == "long":
            stop_loss = lower[-1]
            take_profit = upper[-1] + (upper[-1] - middle[-1]) * 0.5
        elif direction == "short":
            stop_loss = upper[-1]
            take_profit = lower[-1] - (middle[-1] - lower[-1]) * 0.5
        else:
            stop_loss = current_price * 0.98
            take_profit = current_price * 1.02

        return Signal(
            direction=direction,
            strength=strength,
            confidence=confidence,
            reason=reason,
            entry_price=current_price,
            stop_loss=float(stop_loss),
            take_profit=float(take_profit),
            indicators={
                "upper": float(upper[-1]),
                "middle": float(middle[-1]),
                "lower": float(lower[-1]),
                "band_width_pct": float(band_width * 100),
            },
        )
