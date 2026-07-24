"""
交易策略模块
"""
from .base import BaseStrategy, Signal
from .ma_trend import MATrendStrategy
from .rsi_mean_reversion import RSIMeanReversionStrategy
from .macd_momentum import MACDMomentumStrategy
from .bollinger_breakout import BollingerBreakoutStrategy
from .grid_trading import GridTradingStrategy
from .ml_predict import MLPredictStrategy

STRATEGY_REGISTRY = {
    "ma_trend": MATrendStrategy,
    "rsi_mean_reversion": RSIMeanReversionStrategy,
    "macd_momentum": MACDMomentumStrategy,
    "bollinger_breakout": BollingerBreakoutStrategy,
    "grid_trading": GridTradingStrategy,
    "ml_predict": MLPredictStrategy,
}


def get_strategy(name: str, params=None) -> BaseStrategy:
    """获取策略实例"""
    if name not in STRATEGY_REGISTRY:
        raise ValueError(f"未知策略: {name}，可用: {list(STRATEGY_REGISTRY.keys())}")
    return STRATEGY_REGISTRY[name](params=params)


def list_strategies() -> dict:
    """列出所有策略"""
    return {
        name: {
            "name": name,
            "class": cls.__name__,
            "description": cls.__doc__ or "",
        }
        for name, cls in STRATEGY_REGISTRY.items()
    }
