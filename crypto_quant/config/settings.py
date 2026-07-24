"""
配置管理模块
统一管理交易所、回测、风控等配置
"""
import os
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = BASE_DIR / "data_cache"
DATA_DIR.mkdir(exist_ok=True)


@dataclass
class ExchangeConfig:
    """交易所配置"""
    name: str = "binance"
    api_key: str = ""
    api_secret: str = ""
    passphrase: str = ""
    testnet: bool = True
    timeout: int = 30000
    enableRateLimit: bool = True


@dataclass
class BacktestConfig:
    """回测配置"""
    initial_capital: float = 10000.0
    commission_rate: float = 0.0004
    slippage_rate: float = 0.0002
    start_date: str = "2024-01-01"
    end_date: str = "2024-12-31"
    timeframe: str = "1h"
    symbol: str = "BTC/USDT"
    leverage: int = 1


@dataclass
class RiskConfig:
    """风控配置"""
    initial_capital: float = 10000.0
    max_position_pct: float = 0.3
    max_single_trade_pct: float = 0.1
    max_single_trade_loss_pct: float = 0.02
    max_position_loss_pct: float = 0.05
    max_total_exposure_pct: float = 0.8
    max_daily_loss_pct: float = 0.05
    max_drawdown_pct: float = 0.2
    stop_loss_pct: float = 0.03
    take_profit_pct: float = 0.06
    trailing_stop_pct: float = 0.02
    max_open_positions: int = 3
    max_positions: int = 3
    max_consecutive_losses: int = 5
    cooldown_seconds: int = 300


@dataclass
class StrategyConfig:
    """策略配置基类"""
    name: str = ""
    type: str = ""
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ServerConfig:
    """服务配置"""
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "INFO"


class Settings:
    """全局配置管理"""

    def __init__(self):
        self.exchange = self._load_exchange_config()
        self.backtest = self._load_backtest_config()
        self.risk = self._load_risk_config()
        self.server = self._load_server_config()

    def _load_exchange_config(self) -> ExchangeConfig:
        return ExchangeConfig(
            name=os.getenv("EXCHANGE_NAME", "binance"),
            api_key=os.getenv("EXCHANGE_API_KEY", ""),
            api_secret=os.getenv("EXCHANGE_API_SECRET", ""),
            passphrase=os.getenv("EXCHANGE_PASSPHRASE", ""),
            testnet=os.getenv("EXCHANGE_TESTNET", "true").lower() == "true",
        )

    def _load_backtest_config(self) -> BacktestConfig:
        return BacktestConfig(
            initial_capital=float(os.getenv("INITIAL_CAPITAL", "10000")),
            commission_rate=float(os.getenv("COMMISSION_RATE", "0.0004")),
            slippage_rate=float(os.getenv("SLIPPAGE_RATE", "0.0002")),
            timeframe=os.getenv("BACKTEST_TIMEFRAME", "1h"),
            symbol=os.getenv("BACKTEST_SYMBOL", "BTC/USDT"),
            leverage=int(os.getenv("BACKTEST_LEVERAGE", "1")),
        )

    def _load_risk_config(self) -> RiskConfig:
        return RiskConfig(
            initial_capital=float(os.getenv("INITIAL_CAPITAL", "10000")),
            max_position_pct=float(os.getenv("MAX_POSITION_PCT", "0.3")),
            max_single_trade_pct=float(os.getenv("MAX_SINGLE_TRADE_PCT", "0.1")),
            max_single_trade_loss_pct=float(os.getenv("MAX_SINGLE_TRADE_LOSS_PCT", "0.02")),
            max_position_loss_pct=float(os.getenv("MAX_POSITION_LOSS_PCT", "0.05")),
            max_total_exposure_pct=float(os.getenv("MAX_TOTAL_EXPOSURE_PCT", "0.8")),
            max_daily_loss_pct=float(os.getenv("MAX_DAILY_LOSS_PCT", "0.05")),
            max_drawdown_pct=float(os.getenv("MAX_DRAWDOWN_PCT", "0.2")),
            stop_loss_pct=float(os.getenv("STOP_LOSS_PCT", "0.03")),
            take_profit_pct=float(os.getenv("TAKE_PROFIT_PCT", "0.06")),
            trailing_stop_pct=float(os.getenv("TRAILING_STOP_PCT", "0.02")),
            max_open_positions=int(os.getenv("MAX_OPEN_POSITIONS", "3")),
            max_positions=int(os.getenv("MAX_POSITIONS", "3")),
            max_consecutive_losses=int(os.getenv("MAX_CONSECUTIVE_LOSSES", "5")),
            cooldown_seconds=int(os.getenv("COOLDOWN_SECONDS", "300")),
        )

    def _load_server_config(self) -> ServerConfig:
        return ServerConfig(
            host=os.getenv("SERVER_HOST", "127.0.0.1"),
            port=int(os.getenv("SERVER_PORT", "8000")),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "exchange": self.exchange.__dict__,
            "backtest": self.backtest.__dict__,
            "risk": self.risk.__dict__,
            "server": self.server.__dict__,
        }


settings = Settings()
