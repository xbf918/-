"""
市场状态识别 + 动态策略权重分配 + 多策略组合引擎

核心功能：
1. 自动识别市场状态（趋势/震荡、牛/熊、波动率高低）
2. 根据市场状态动态分配策略权重
3. 多策略信号融合（加权投票）
4. 多时间周期确认
"""
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

import numpy as np

from ..data.market_data import KlineData
from ..utils.helpers import calc_atr, calc_sma, calc_rsi
from ..utils.logger import logger


class MarketTrend(str, Enum):
    UPTREND = "uptrend"
    DOWNTREND = "downtrend"
    SIDEWAYS = "sideways"


class VolatilityRegime(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    EXTREME = "extreme"


class MarketRegime(str, Enum):
    BULL_TREND = "bull_trend"
    BEAR_TREND = "bear_trend"
    BULL_RANGE = "bull_range"
    BEAR_RANGE = "bear_range"
    SIDEWAYS = "sideways"


@dataclass
class MarketState:
    """市场状态"""
    trend: str
    trend_strength: float
    volatility: str
    volatility_value: float
    regime: str
    atr_ratio: float
    adx: float
    price_position: float
    ma_alignment: float


# 各市场状态下的默认策略权重
STRATEGY_WEIGHTS_BY_REGIME: Dict[str, Dict[str, float]] = {
    "bull_trend": {
        "ma_trend": 1.5,
        "macd_momentum": 1.3,
        "ml_predict": 1.0,
        "bollinger_breakout": 1.2,
        "rsi_mean_reversion": 0.3,
        "grid_trading": 0.2,
    },
    "bear_trend": {
        "ma_trend": 1.5,
        "macd_momentum": 1.3,
        "ml_predict": 1.0,
        "bollinger_breakout": 1.2,
        "rsi_mean_reversion": 0.3,
        "grid_trading": 0.2,
    },
    "bull_range": {
        "rsi_mean_reversion": 1.3,
        "bollinger_breakout": 1.0,
        "grid_trading": 1.2,
        "ma_trend": 0.5,
        "macd_momentum": 0.6,
        "ml_predict": 0.8,
    },
    "bear_range": {
        "rsi_mean_reversion": 1.3,
        "bollinger_breakout": 1.0,
        "grid_trading": 1.2,
        "ma_trend": 0.5,
        "macd_momentum": 0.6,
        "ml_predict": 0.8,
    },
    "sideways": {
        "grid_trading": 1.5,
        "rsi_mean_reversion": 1.3,
        "bollinger_breakout": 0.8,
        "ma_trend": 0.3,
        "macd_momentum": 0.4,
        "ml_predict": 0.7,
    },
}


class MarketStateAnalyzer:
    """市场状态分析器"""

    def __init__(self, fast_period: int = 20, slow_period: int = 60, atr_period: int = 14):
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.atr_period = atr_period

    def analyze(self, kline: KlineData) -> MarketState:
        """分析市场状态"""
        close = kline.close
        high = kline.high
        low = kline.low
        n = len(close)

        if n < max(self.slow_period, self.atr_period) + 10:
            return MarketState(
                trend=MarketTrend.SIDEWAYS.value,
                trend_strength=0.0,
                volatility=VolatilityRegime.NORMAL.value,
                volatility_value=0.0,
                regime=MarketRegime.SIDEWAYS.value,
                atr_ratio=0.0,
                adx=0.0,
                price_position=0.5,
                ma_alignment=0.0,
            )

        ma_fast = calc_sma(close, self.fast_period)
        ma_slow = calc_sma(close, self.slow_period)
        atr_values = calc_atr(high, low, close, self.atr_period)
        rsi = calc_rsi(close, 14)

        last_close = close[-1]
        last_ma_fast = ma_fast[-1] if len(ma_fast) > 0 and not np.isnan(ma_fast[-1]) else last_close
        last_ma_slow = ma_slow[-1] if len(ma_slow) > 0 and not np.isnan(ma_slow[-1]) else last_close
        last_atr = atr_values[-1] if len(atr_values) > 0 else 0

        atr_ratio = last_atr / last_close * 100 if last_close > 0 else 0

        ma_alignment = 0.0
        if last_ma_slow > 0:
            ma_alignment = (last_ma_fast - last_ma_slow) / last_ma_slow * 100

        if last_ma_fast > last_ma_slow and last_close > last_ma_fast:
            trend = MarketTrend.UPTREND.value
        elif last_ma_fast < last_ma_slow and last_close < last_ma_fast:
            trend = MarketTrend.DOWNTREND.value
        else:
            trend = MarketTrend.SIDEWAYS.value

        trend_strength = abs(ma_alignment)

        recent_high = max(high[-self.slow_period:]) if n >= self.slow_period else max(high)
        recent_low = min(low[-self.slow_period:]) if n >= self.slow_period else min(low)
        price_range = recent_high - recent_low
        price_position = (last_close - recent_low) / price_range if price_range > 0 else 0.5

        if atr_ratio < 0.5:
            vol = VolatilityRegime.LOW.value
        elif atr_ratio < 1.5:
            vol = VolatilityRegime.NORMAL.value
        elif atr_ratio < 3.0:
            vol = VolatilityRegime.HIGH.value
        else:
            vol = VolatilityRegime.EXTREME.value

        adx = self._calc_adx(high, low, close, 14)

        if trend == MarketTrend.UPTREND.value and adx > 25:
            regime = MarketRegime.BULL_TREND.value
        elif trend == MarketTrend.DOWNTREND.value and adx > 25:
            regime = MarketRegime.BEAR_TREND.value
        elif trend == MarketTrend.UPTREND.value and adx <= 25:
            regime = MarketRegime.BULL_RANGE.value
        elif trend == MarketTrend.DOWNTREND.value and adx <= 25:
            regime = MarketRegime.BEAR_RANGE.value
        else:
            regime = MarketRegime.SIDEWAYS.value

        return MarketState(
            trend=trend,
            trend_strength=trend_strength,
            volatility=vol,
            volatility_value=atr_ratio,
            regime=regime,
            atr_ratio=atr_ratio,
            adx=adx,
            price_position=price_position,
            ma_alignment=ma_alignment,
        )

    def _calc_adx(self, high: List[float], low: List[float], close: List[float], period: int = 14) -> float:
        """计算ADX（平均趋向指数）"""
        n = len(high)
        if n < period * 2:
            return 0.0

        plus_dm = np.zeros(n)
        minus_dm = np.zeros(n)
        tr = np.zeros(n)

        for i in range(1, n):
            up_move = high[i] - high[i - 1]
            down_move = low[i - 1] - low[i]

            if up_move > down_move and up_move > 0:
                plus_dm[i] = up_move
            if down_move > up_move and down_move > 0:
                minus_dm[i] = down_move

            tr[i] = max(
                high[i] - low[i],
                abs(high[i] - close[i - 1]),
                abs(low[i] - close[i - 1]),
            )

        atr = np.zeros(n)
        plus_di = np.zeros(n)
        minus_di = np.zeros(n)

        atr[period] = np.mean(tr[1:period + 1])
        plus_di[period] = np.mean(plus_dm[1:period + 1])
        minus_di[period] = np.mean(minus_dm[1:period + 1])

        for i in range(period + 1, n):
            atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
            plus_di[i] = (plus_di[i - 1] * (period - 1) + plus_dm[i]) / period
            minus_di[i] = (minus_di[i - 1] * (period - 1) + minus_dm[i]) / period

        dx = np.zeros(n)
        for i in range(period, n):
            denom = plus_di[i] + minus_di[i]
            if denom > 0:
                dx[i] = abs(plus_di[i] - minus_di[i]) / denom * 100

        adx_values = np.zeros(n)
        if n > period * 2:
            adx_values[period * 2] = np.mean(dx[period:period * 2 + 1])
            for i in range(period * 2 + 1, n):
                adx_values[i] = (adx_values[i - 1] * (period - 1) + dx[i]) / period

        return float(adx_values[-1]) if adx_values[-1] > 0 else 0.0


class MultiStrategyEngine:
    """多策略组合引擎

    功能：
    - 动态策略权重分配
    - 加权投票信号融合
    - 信号强度加权计算
    """

    def __init__(self, strategy_weights: Optional[Dict[str, float]] = None):
        self.strategy_weights = strategy_weights or {}
        self.analyzer = MarketStateAnalyzer()

    def get_weights_for_regime(self, regime: str) -> Dict[str, float]:
        """获取对应市场状态的策略权重"""
        return STRATEGY_WEIGHTS_BY_REGIME.get(regime, {}).copy()

    def combine_signals(
        self,
        signals: Dict[str, Any],
        regime: Optional[str] = None,
        custom_weights: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        融合多个策略的信号

        Args:
            signals: {strategy_name: {direction, strength, confidence, ...}}
            regime: 市场状态（可选，用于自动加权）
            custom_weights: 自定义权重（可选，优先级最高）

        Returns:
            综合信号 {direction, strength, confidence, reason, strategy_votes}
        """
        if not signals:
            return {
                "direction": "neutral",
                "strength": 0.0,
                "confidence": 0.0,
                "reason": "无有效策略信号",
                "strategy_votes": {},
            }

        weights = custom_weights.copy() if custom_weights else {}

        if regime and not weights:
            regime_weights = self.get_weights_for_regime(regime)
            for name in signals.keys():
                if name in regime_weights:
                    weights[name] = regime_weights[name]
                else:
                    weights[name] = 1.0

        if not weights:
            weights = {name: 1.0 for name in signals.keys()}

        long_score = 0.0
        short_score = 0.0
        total_weight = 0.0
        strategy_votes = {}

        for name, sig in signals.items():
            weight = weights.get(name, 1.0)
            direction = sig.get("direction", "neutral")
            strength = sig.get("strength", 0.0)
            confidence = sig.get("confidence", 0.5)

            vote_strength = strength * confidence * weight

            if direction == "long":
                long_score += vote_strength
                strategy_votes[name] = {"direction": "long", "weight": weight, "vote": vote_strength}
            elif direction == "short":
                short_score += vote_strength
                strategy_votes[name] = {"direction": "short", "weight": weight, "vote": vote_strength}
            else:
                strategy_votes[name] = {"direction": "neutral", "weight": weight, "vote": 0.0}

            total_weight += weight

        if total_weight == 0:
            return {
                "direction": "neutral",
                "strength": 0.0,
                "confidence": 0.0,
                "reason": "权重总和为0",
                "strategy_votes": strategy_votes,
            }

        net_score = long_score - short_score
        max_possible = total_weight

        if abs(net_score) < max_possible * 0.1:
            direction = "neutral"
            strength = 0.0
        elif net_score > 0:
            direction = "long"
            strength = min(1.0, net_score / max_possible)
        else:
            direction = "short"
            strength = min(1.0, abs(net_score) / max_possible)

        avg_confidence = np.mean([
            sig.get("confidence", 0.5) for sig in signals.values()
        ]) if signals else 0.0

        agreement = 0.0
        active_strategies = [s for s in signals.values() if s.get("direction") != "neutral"]
        if active_strategies:
            long_count = sum(1 for s in active_strategies if s.get("direction") == "long")
            short_count = sum(1 for s in active_strategies if s.get("direction") == "short")
            majority = max(long_count, short_count)
            agreement = majority / len(active_strategies)

        confidence = (avg_confidence + agreement) / 2

        reason_parts = []
        if regime:
            reason_parts.append(f"市场状态: {regime}")
        reason_parts.append(f"多头票数: {long_score:.2f}, 空头票数: {short_score:.2f}")
        reason_parts.append(f"一致性: {agreement*100:.0f}%")
        reason = "; ".join(reason_parts)

        return {
            "direction": direction,
            "strength": round(strength, 4),
            "confidence": round(confidence, 4),
            "reason": reason,
            "strategy_votes": strategy_votes,
            "regime": regime,
            "agreement": round(agreement, 4),
        }

    def analyze_and_combine(
        self,
        kline: KlineData,
        signals: Dict[str, Any],
    ) -> Dict[str, Any]:
        """分析市场状态并融合信号"""
        state = self.analyzer.analyze(kline)
        combined = self.combine_signals(signals, regime=state.regime)
        combined["market_state"] = {
            "regime": state.regime,
            "trend": state.trend,
            "trend_strength": round(state.trend_strength, 4),
            "volatility": state.volatility,
            "volatility_value": round(state.volatility_value, 4),
            "adx": round(state.adx, 2),
            "price_position": round(state.price_position, 4),
            "ma_alignment": round(state.ma_alignment, 4),
        }
        return combined


class MultiTimeframeAnalyzer:
    """多时间周期分析器

    三重滤网思想：
    - 大周期定方向（趋势）
    - 中周期找回调（入场时机）
    - 小周期精确入场
    """

    def __init__(self, trend_period_ratio: int = 4, entry_period_ratio: int = 1):
        self.trend_period_ratio = trend_period_ratio
        self.entry_period_ratio = entry_period_ratio

    def check_trend_alignment(
        self,
        trend_signal: Dict[str, Any],
        entry_signal: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        检查大小周期信号是否对齐

        Returns:
            {aligned, direction, strength, filter_reason}
        """
        trend_dir = trend_signal.get("direction", "neutral")
        entry_dir = entry_signal.get("direction", "neutral")

        aligned = (trend_dir == entry_dir) and trend_dir != "neutral"

        if trend_dir == "neutral":
            filter_reason = "大周期无明确趋势，信号过滤"
            direction = "neutral"
            strength = 0.0
        elif not aligned:
            filter_reason = f"大周期{trend_dir}，小周期{entry_dir}，方向不一致，过滤"
            direction = "neutral"
            strength = 0.0
        else:
            filter_reason = "大小周期方向一致，信号确认"
            direction = trend_dir
            trend_strength = trend_signal.get("strength", 0.5)
            entry_strength = entry_signal.get("strength", 0.5)
            strength = (trend_strength * 0.6 + entry_strength * 0.4)

        trend_conf = trend_signal.get("confidence", 0.5)
        entry_conf = entry_signal.get("confidence", 0.5)
        confidence = (trend_conf * 0.5 + entry_conf * 0.5) if aligned else min(trend_conf, entry_conf)

        return {
            "aligned": aligned,
            "direction": direction,
            "strength": round(strength, 4),
            "confidence": round(confidence, 4),
            "filter_reason": filter_reason,
            "trend_direction": trend_dir,
            "entry_direction": entry_dir,
        }
