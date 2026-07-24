"""
RSI 均值回归策略
RSI 超卖做多，超买做空
"""
from typing import Dict, Any, Optional

import numpy as np

from .base import BaseStrategy, Signal
from ..data.market_data import KlineData, get_market_data


class RSIMeanReversionStrategy(BaseStrategy):
    """RSI均值回归策略"""

    def __init__(self, params: Optional[Dict[str, Any]] = None):
        default_params = {
            "rsi_period": 14,
            "oversold": 30,
            "overbought": 70,
            "confirmation_bars": 2,
        }
        super().__init__("rsi_mean_reversion", {**default_params, **(params or {})})

    def _validate_params(self):
        os = self.params.get("oversold", 30)
        ob = self.params.get("overbought", 70)
        if os >= ob:
            raise ValueError("超卖阈值必须小于超买阈值")

    def generate_signal(self, kline: KlineData) -> Signal:
        md = get_market_data()
        period = int(self.params["rsi_period"])
        oversold = float(self.params["oversold"])
        overbought = float(self.params["overbought"])
        confirm = int(self.params["confirmation_bars"])

        rsi = md.calc_rsi(kline, period)

        if kline.length < period + confirm:
            return Signal(direction="neutral", reason="数据不足")

        if np.isnan(rsi[-1]):
            return Signal(direction="neutral", reason="RSI未准备好")

        direction = "neutral"
        strength = 0.0
        reason = ""

        current_rsi = rsi[-1]

        recent_rsis = rsi[-confirm - 1:]
        all_oversold = all(r <= oversold for r in recent_rsis if not np.isnan(r))
        all_overbought = all(r >= overbought for r in recent_rsis if not np.isnan(r))

        if all_oversold and current_rsi > oversold:
            direction = "long"
            strength = min(1.0, (oversold - min(recent_rsis)) / oversold)
            reason = f"RSI从超卖区({oversold})回升，均值回归做多"
        elif all_overbought and current_rsi < overbought:
            direction = "short"
            strength = min(1.0, (max(recent_rsis) - overbought) / (100 - overbought))
            reason = f"RSI从超买区({overbought})回落，均值回归做空"
        elif current_rsi < oversold:
            direction = "long"
            strength = 0.4 + (oversold - current_rsi) / oversold * 0.4
            reason = f"RSI({current_rsi:.1f})处于超卖区"
        elif current_rsi > overbought:
            direction = "short"
            strength = 0.4 + (current_rsi - overbought) / (100 - overbought) * 0.4
            reason = f"RSI({current_rsi:.1f})处于超买区"
        else:
            direction = "neutral"
            strength = 0.0
            reason = f"RSI({current_rsi:.1f})处于中性区"

        confidence = min(1.0, 0.5 + strength * 0.5)
        current_price = kline.last_price
        sl_pct = 0.015
        tp_pct = 0.03

        return Signal(
            direction=direction,
            strength=strength,
            confidence=confidence,
            reason=reason,
            entry_price=current_price,
            stop_loss=current_price * (1 - sl_pct) if direction == "long" else current_price * (1 + sl_pct),
            take_profit=current_price * (1 + tp_pct) if direction == "long" else current_price * (1 - tp_pct),
            indicators={
                "rsi": float(current_rsi),
                "oversold": oversold,
                "overbought": overbought,
            },
        )
