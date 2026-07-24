"""
网格交易策略
在震荡区间内自动低买高卖
"""
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

import numpy as np

from .base import BaseStrategy, Signal
from ..data.market_data import KlineData, get_market_data


@dataclass
class GridLevel:
    """网格档位"""
    price: float
    side: str  # "buy" / "sell"
    filled: bool = False


class GridTradingStrategy(BaseStrategy):
    """网格交易策略"""

    def __init__(self, params: Optional[Dict[str, Any]] = None):
        default_params = {
            "grid_count": 10,
            "upper_price": 0.0,
            "lower_price": 0.0,
            "order_size_pct": 0.1,
            "trend_filter": True,
        }
        super().__init__("grid_trading", {**default_params, **(params or {})})
        self.levels: List[GridLevel] = []

    def _validate_params(self):
        grid_count = self.params.get("grid_count", 10)
        if grid_count < 2 or grid_count > 200:
            raise ValueError("网格数量应在2-200之间")

    def generate_signal(self, kline: KlineData) -> Signal:
        md = get_market_data()
        grid_count = int(self.params["grid_count"])
        upper = float(self.params.get("upper_price", 0))
        lower = float(self.params.get("lower_price", 0))

        current_price = kline.last_price

        if upper <= 0 or lower <= 0:
            atr = md.calc_atr(kline, 14)
            if len(atr) > 0 and not np.isnan(atr[-1]):
                upper = current_price * 1.1
                lower = current_price * 0.9
            else:
                upper = current_price * 1.1
                lower = current_price * 0.9

        if upper <= lower:
            return Signal(direction="neutral", reason="网格上下界无效")

        self._build_grid(lower, upper, grid_count)

        direction = "neutral"
        strength = 0.0
        reason = ""

        prev_close = kline.close[-2] if kline.length > 1 else current_price

        buy_levels = [lvl for lvl in self.levels if lvl.side == "buy" and not lvl.filled]
        sell_levels = [lvl for lvl in self.levels if lvl.side == "sell" and not lvl.filled]

        nearest_buy = min(
            [lvl for lvl in buy_levels if lvl.price < current_price],
            key=lambda x: current_price - x.price,
            default=None
        )
        nearest_sell = min(
            [lvl for lvl in sell_levels if lvl.price > current_price],
            key=lambda x: x.price - current_price,
            default=None
        )

        if nearest_buy and prev_close > nearest_buy.price >= current_price:
            direction = "long"
            strength = 0.7
            reason = f"价格触及买单网格({nearest_buy.price:.2f})，网格买入"
        elif nearest_sell and prev_close < nearest_sell.price <= current_price:
            direction = "short"
            strength = 0.7
            reason = f"价格触及卖单网格({nearest_sell.price:.2f})，网格卖出"
        elif current_price < lower:
            direction = "long"
            strength = 0.9
            reason = f"价格跌破网格下界({lower:.2f})，触发加仓"
        elif current_price > upper:
            direction = "short"
            strength = 0.9
            reason = f"价格突破网格上界({upper:.2f})，触发减仓"
        else:
            mid = (upper + lower) / 2
            if current_price < mid:
                direction = "long"
                strength = 0.3
                reason = "网格中轨下方，偏多"
            else:
                direction = "short"
                strength = 0.3
                reason = "网格中轨上方，偏空"

        confidence = min(1.0, 0.6 + strength * 0.3)

        return Signal(
            direction=direction,
            strength=strength,
            confidence=confidence,
            reason=reason,
            entry_price=current_price,
            stop_loss=lower * 0.95,
            take_profit=upper * 1.05,
            indicators={
                "upper": upper,
                "lower": lower,
                "grid_count": grid_count,
                "active_buys": len(buy_levels),
                "active_sells": len(sell_levels),
            },
        )

    def _build_grid(self, lower: float, upper: float, count: int):
        """构建网格档位"""
        self.levels = []
        step = (upper - lower) / count

        for i in range(count + 1):
            price = lower + i * step
            if i < count:
                self.levels.append(GridLevel(price=price, side="buy"))
            if i > 0:
                self.levels.append(GridLevel(price=price, side="sell"))

    def get_grid_levels(self) -> List[GridLevel]:
        return self.levels.copy()
