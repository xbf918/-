"""
CCXT 统一交易所客户端
封装 Binance、OKX 等交易所的统一访问接口
"""
import time
from typing import Dict, List, Optional, Any, Tuple
from contextlib import contextmanager

try:
    import ccxt
    HAS_CCXT = True
except ImportError:
    HAS_CCXT = False

from ..config.settings import settings
from ..utils.logger import logger


class ExchangeClient:
    """统一交易所客户端"""

    _instance: Optional["ExchangeClient"] = None

    def __init__(self):
        self._exchange = None
        self._exchange_name = ""
        self._initialized = False

    @classmethod
    def get_instance(cls) -> "ExchangeClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def init(self, exchange_name: Optional[str] = None) -> bool:
        """初始化交易所"""
        if not HAS_CCXT:
            logger.warning("ccxt 未安装，使用模拟数据模式")
            self._initialized = True
            return False

        name = exchange_name or settings.exchange.name
        try:
            exchange_class = getattr(ccxt, name)
            config = {
                "apiKey": settings.exchange.api_key,
                "secret": settings.exchange.api_secret,
                "enableRateLimit": settings.exchange.enableRateLimit,
                "timeout": settings.exchange.timeout,
            }

            if name == "okx" and settings.exchange.passphrase:
                config["password"] = settings.exchange.passphrase

            if settings.exchange.testnet:
                config.setdefault("options", {})
                config["options"]["defaultType"] = "swap"

            self._exchange = exchange_class(config)

            if settings.exchange.testnet:
                self._exchange.set_sandbox_mode(True)

            self._exchange_name = name
            self._initialized = True
            logger.info(f"交易所 {name} 初始化成功 (testnet={settings.exchange.testnet})")
            return True

        except Exception as e:
            logger.error(f"交易所初始化失败: {e}")
            self._initialized = False
            return False

    @property
    def exchange(self):
        if not self._initialized:
            self.init()
        return self._exchange

    @property
    def is_ready(self) -> bool:
        return self._initialized and self._exchange is not None

    @property
    def name(self) -> str:
        return self._exchange_name or settings.exchange.name

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        since: Optional[int] = None,
        limit: int = 300,
    ) -> List[List[float]]:
        """获取K线数据"""
        if not self.is_ready:
            return self._mock_ohlcv(symbol, timeframe, limit)

        try:
            data = self._exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=limit)
            return data
        except Exception as e:
            logger.error(f"获取K线失败 {symbol} {timeframe}: {e}")
            return self._mock_ohlcv(symbol, timeframe, limit)

    def fetch_ticker(self, symbol: str) -> Dict[str, Any]:
        """获取行情数据"""
        if not self.is_ready:
            return self._mock_ticker(symbol)

        try:
            ticker = self._exchange.fetch_ticker(symbol)
            return {
                "symbol": ticker["symbol"],
                "last": ticker["last"],
                "high": ticker["high"],
                "low": ticker["low"],
                "open": ticker["open"],
                "volume": ticker["baseVolume"],
                "quoteVolume": ticker["quoteVolume"],
                "change": ticker["percentage"],
                "timestamp": ticker["timestamp"],
            }
        except Exception as e:
            logger.error(f"获取行情失败 {symbol}: {e}")
            return self._mock_ticker(symbol)

    def fetch_order_book(self, symbol: str, limit: int = 20) -> Dict[str, Any]:
        """获取订单簿"""
        if not self.is_ready:
            return self._mock_order_book(symbol, limit)

        try:
            ob = self._exchange.fetch_order_book(symbol, limit=limit)
            return {
                "bids": ob["bids"][:limit],
                "asks": ob["asks"][:limit],
                "timestamp": ob["timestamp"],
            }
        except Exception as e:
            logger.error(f"获取订单簿失败 {symbol}: {e}")
            return self._mock_order_book(symbol, limit)

    def fetch_balance(self) -> Dict[str, Any]:
        """获取余额"""
        if not self.is_ready:
            return {"USDT": {"free": 10000.0, "used": 0.0, "total": 10000.0}}

        try:
            balance = self._exchange.fetch_balance()
            result = {}
            for coin, info in balance.items():
                if isinstance(info, dict) and "free" in info:
                    result[coin] = {
                        "free": info.get("free", 0),
                        "used": info.get("used", 0),
                        "total": info.get("total", 0),
                    }
            return result
        except Exception as e:
            logger.error(f"获取余额失败: {e}")
            return {}

    def create_order(
        self,
        symbol: str,
        type: str,
        side: str,
        amount: float,
        price: Optional[float] = None,
        params: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """创建订单"""
        if not self.is_ready:
            logger.info(f"[模拟] 创建订单 {side} {amount} {symbol} @ {price}")
            return self._mock_order(symbol, type, side, amount, price)

        try:
            order = self._exchange.create_order(symbol, type, side, amount, price, params or {})
            return {
                "id": str(order.get("id", "")),
                "symbol": order.get("symbol"),
                "type": order.get("type"),
                "side": order.get("side"),
                "amount": order.get("amount"),
                "price": order.get("price"),
                "status": order.get("status"),
                "timestamp": order.get("timestamp"),
            }
        except Exception as e:
            logger.error(f"创建订单失败 {symbol}: {e}")
            raise

    def cancel_order(self, order_id: str, symbol: str) -> bool:
        """取消订单"""
        if not self.is_ready:
            logger.info(f"[模拟] 取消订单 {order_id}")
            return True

        try:
            self._exchange.cancel_order(order_id, symbol)
            return True
        except Exception as e:
            logger.error(f"取消订单失败 {order_id}: {e}")
            return False

    def fetch_positions(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取持仓"""
        if not self.is_ready:
            return []

        try:
            positions = self._exchange.fetch_positions([symbol] if symbol else None)
            return [
                {
                    "symbol": p.get("symbol"),
                    "side": p.get("side"),
                    "amount": p.get("contracts", 0),
                    "entryPrice": p.get("entryPrice"),
                    "markPrice": p.get("markPrice"),
                    "pnl": p.get("unrealizedPnl", 0),
                    "pnlPercent": p.get("percentage", 0),
                    "leverage": p.get("leverage", 1),
                    "liquidationPrice": p.get("liquidationPrice"),
                }
                for p in positions if p.get("contracts", 0) != 0
            ]
        except Exception as e:
            logger.error(f"获取持仓失败: {e}")
            return []

    def _mock_ohlcv(self, symbol: str, timeframe: str, limit: int) -> List[List[float]]:
        """生成模拟K线数据"""
        import random
        import numpy as np

        tf_minutes = {
            "1m": 1, "5m": 5, "15m": 15, "30m": 30,
            "1h": 60, "2h": 120, "4h": 240, "1d": 1440,
        }
        mins = tf_minutes.get(timeframe, 60)
        base_price = {
            "BTC/USDT": 65000, "BTCUSDT": 65000,
            "ETH/USDT": 3500, "ETHUSDT": 3500,
            "SOL/USDT": 150, "SOLUSDT": 150,
            "BNB/USDT": 600, "BNBUSDT": 600,
            "XRP/USDT": 0.5, "XRPUSDT": 0.5,
        }.get(symbol, 100)

        now = int(time.time() * 1000)
        step = mins * 60 * 1000
        data = []
        price = base_price

        for i in range(limit):
            ts = now - (limit - i) * step
            volatility = base_price * 0.005
            open_price = price
            high = price + random.random() * volatility
            low = price - random.random() * volatility
            close = low + random.random() * (high - low)
            volume = random.random() * 1000 + 100
            data.append([ts, open_price, high, low, close, volume])
            price = close

        return data

    def _mock_ticker(self, symbol: str) -> Dict[str, Any]:
        """生成模拟行情"""
        import random
        base = {
            "BTC/USDT": 65000, "BTCUSDT": 65000,
            "ETH/USDT": 3500, "ETHUSDT": 3500,
            "SOL/USDT": 150, "SOLUSDT": 150,
            "BNB/USDT": 600, "BNBUSDT": 600,
            "XRP/USDT": 0.5, "XRPUSDT": 0.5,
        }.get(symbol, 100)
        change = (random.random() - 0.5) * 0.1
        return {
            "symbol": symbol,
            "last": base * (1 + change),
            "high": base * 1.03,
            "low": base * 0.97,
            "open": base,
            "volume": random.random() * 100000,
            "quoteVolume": random.random() * 1e9,
            "change": change * 100,
            "timestamp": int(time.time() * 1000),
        }

    def _mock_order_book(self, symbol: str, limit: int) -> Dict[str, Any]:
        """生成模拟订单簿"""
        import random
        base = {
            "BTC/USDT": 65000, "BTCUSDT": 65000,
            "ETH/USDT": 3500, "ETHUSDT": 3500,
            "SOL/USDT": 150, "SOLUSDT": 150,
            "BNB/USDT": 600, "BNBUSDT": 600,
            "XRP/USDT": 0.5, "XRPUSDT": 0.5,
        }.get(symbol, 100)
        tick = base * 0.0005

        bids = []
        asks = []
        for i in range(limit):
            bid_price = base - tick * (i + 1)
            ask_price = base + tick * (i + 1)
            bid_qty = random.random() * 2 + 0.1
            ask_qty = random.random() * 2 + 0.1
            bids.append([bid_price, bid_qty, bid_price * bid_qty])
            asks.append([ask_price, ask_qty, ask_price * ask_qty])

        return {
            "bids": bids,
            "asks": asks,
            "timestamp": int(time.time() * 1000),
        }

    def _mock_order(self, symbol: str, type: str, side: str, amount: float, price: Optional[float]) -> Dict[str, Any]:
        """生成模拟订单"""
        base = {
            "BTC/USDT": 65000, "BTCUSDT": 65000,
            "ETH/USDT": 3500, "ETHUSDT": 3500,
            "SOL/USDT": 150, "SOLUSDT": 150,
            "BNB/USDT": 600, "BNBUSDT": 600,
            "XRP/USDT": 0.5, "XRPUSDT": 0.5,
        }.get(symbol, 100)
        return {
            "id": f"mock_{int(time.time() * 1000)}",
            "symbol": symbol,
            "type": type,
            "side": side,
            "amount": amount,
            "price": price or base,
            "status": "closed",
            "timestamp": int(time.time() * 1000),
        }


def get_ccxt_client() -> ExchangeClient:
    return ExchangeClient.get_instance()


def get_exchange() -> ExchangeClient:
    return ExchangeClient.get_instance()
