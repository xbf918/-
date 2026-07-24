"""
实盘交易器 - CCXT 封装
对接真实交易所API进行交易
"""
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import os
import time
import uuid

from ..data.ccxt_client import get_ccxt_client
from ..config.settings import settings
from ..utils.logger import logger
from ..risk.risk_manager import RiskManager


@dataclass
class LivePosition:
    """实盘持仓"""
    symbol: str
    side: str
    entry_price: float
    size: float
    leverage: int
    unrealized_pnl: float = 0.0
    unrealized_pnl_pct: float = 0.0


class LiveTrader:
    """实盘交易器（CCXT实现）"""

    def __init__(self, exchange_id: str = None, risk_manager: Optional[RiskManager] = None):
        self.client = get_ccxt_client(exchange_id)
        self.risk_manager = risk_manager or RiskManager()
        self._trade_history: List[Dict] = []
        self._positions_cache: Dict[str, LivePosition] = {}

    def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        amount: float,
        price: Optional[float] = None,
        params: Optional[Dict] = None,
    ) -> Dict:
        """下单"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            if side not in ("buy", "sell"):
                return {"status": "error", "msg": "订单方向必须为 buy 或 sell"}
            if order_type not in ("market", "limit") or amount <= 0:
                return {"status": "error", "msg": "订单类型或数量无效"}
            if order_type == "limit" and (price is None or price <= 0):
                return {"status": "error", "msg": "限价单必须提供大于 0 的价格"}

            params = params or {}
            is_reduce_only = bool(params.get("reduceOnly") or params.get("reduce_only"))
            # Production trading must be explicitly enabled. Testnet remains the
            # default safe mode in settings.
            if not settings.exchange.testnet and os.getenv("EXCHANGE_ALLOW_LIVE", "false").lower() != "true":
                return {"status": "error", "msg": "实盘交易未启用；请设置 EXCHANGE_ALLOW_LIVE=true"}

            reference_price = price
            if reference_price is None:
                ticker = self.client.exchange.fetch_ticker(symbol)
                reference_price = ticker.get("last") or ticker.get("ask") or ticker.get("bid")
            if not reference_price or reference_price <= 0:
                return {"status": "error", "msg": "无法取得有效市场价格，拒绝下单"}

            if not is_reduce_only:
                stop_loss = float(params.get("stopLossPrice") or params.get("stop_loss") or 0)
                take_profit = float(params.get("takeProfitPrice") or params.get("take_profit") or 0)
                if stop_loss <= 0:
                    return {"status": "error", "msg": "开仓必须设置止损价"}
                risk_side = "long" if side == "buy" else "short"
                balance = self.fetch_balance()
                equity = 0.0
                if balance["status"] == "ok":
                    raw_balance = balance["balance"]
                    equity = raw_balance.get("total", {}).get("USDT", 0) or raw_balance.get("USDT", {}).get("total", 0)
                risk_check = self.risk_manager.check_new_order(
                    symbol, risk_side, amount, float(reference_price), stop_loss, take_profit, equity
                )
                if not risk_check.passed:
                    return {"status": "error", "msg": f"风控拒绝下单: {risk_check.reason}", "risk": risk_check.details}

            if order_type == "market":
                order = self.client.exchange.create_market_order(symbol, side, amount, params=params)
            elif order_type == "limit":
                order = self.client.exchange.create_limit_order(symbol, side, amount, price, params=params)
            else:
                return {"status": "error", "msg": f"不支持的订单类型: {order_type}"}

            logger.info(f"实盘下单: {side} {order_type} {amount} {symbol}")
            if not is_reduce_only:
                self.risk_manager.on_position_opened(symbol, {"value": float(reference_price) * amount})
            return {"status": "ok", "order": order}

        except Exception as e:
            logger.error(f"下单失败: {e}")
            return {"status": "error", "msg": str(e)}

    def cancel_order(self, order_id: str, symbol: str) -> Dict:
        """撤单"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            result = self.client.exchange.cancel_order(order_id, symbol)
            logger.info(f"撤单: {order_id} {symbol}")
            return {"status": "ok", "result": result}

        except Exception as e:
            logger.error(f"撤单失败: {e}")
            return {"status": "error", "msg": str(e)}

    def fetch_order(self, order_id: str, symbol: str) -> Dict:
        """查询订单"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            order = self.client.exchange.fetch_order(order_id, symbol)
            return {"status": "ok", "order": order}

        except Exception as e:
            logger.error(f"查询订单失败: {e}")
            return {"status": "error", "msg": str(e)}

    def fetch_open_orders(self, symbol: Optional[str] = None) -> Dict:
        """获取挂单列表"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            orders = self.client.exchange.fetch_open_orders(symbol)
            return {"status": "ok", "orders": orders}

        except Exception as e:
            logger.error(f"获取挂单失败: {e}")
            return {"status": "error", "msg": str(e)}

    def fetch_balance(self) -> Dict:
        """获取账户余额"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            balance = self.client.exchange.fetch_balance()
            return {"status": "ok", "balance": balance}

        except Exception as e:
            logger.error(f"获取余额失败: {e}")
            return {"status": "error", "msg": str(e)}

    def fetch_positions(self, symbols: Optional[List[str]] = None) -> Dict:
        """获取持仓"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            if hasattr(self.client.exchange, "fetch_positions"):
                positions = self.client.exchange.fetch_positions(symbols)
            else:
                positions = []

            self._positions_cache.clear()
            for p in positions:
                if abs(p.get("contracts", 0)) > 0:
                    pos = LivePosition(
                        symbol=p["symbol"],
                        side=p.get("side", "long"),
                        entry_price=p.get("entryPrice", 0),
                        size=p.get("contracts", 0),
                        leverage=p.get("leverage", 1),
                        unrealized_pnl=p.get("unrealizedPnl", 0),
                        unrealized_pnl_pct=p.get("percentage", 0),
                    )
                    self._positions_cache[pos.symbol] = pos

            return {"status": "ok", "positions": positions}

        except Exception as e:
            logger.error(f"获取持仓失败: {e}")
            return {"status": "error", "msg": str(e)}

    def fetch_my_trades(self, symbol: Optional[str] = None, limit: int = 50) -> Dict:
        """获取成交记录"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            trades = self.client.exchange.fetch_my_trades(symbol, limit=limit)
            return {"status": "ok", "trades": trades}

        except Exception as e:
            logger.error(f"获取成交记录失败: {e}")
            return {"status": "error", "msg": str(e)}

    def set_leverage(self, leverage: int, symbol: Optional[str] = None) -> Dict:
        """设置杠杆"""
        try:
            if not self.client.exchange:
                return {"status": "error", "msg": "交易所未连接"}

            if hasattr(self.client.exchange, "set_leverage"):
                result = self.client.exchange.set_leverage(leverage, symbol)
                return {"status": "ok", "result": result}
            else:
                return {"status": "error", "msg": "交易所不支持设置杠杆"}

        except Exception as e:
            logger.error(f"设置杠杆失败: {e}")
            return {"status": "error", "msg": str(e)}

    def close_position(self, symbol: str, params: Optional[Dict] = None) -> Dict:
        """平仓"""
        try:
            positions = self.fetch_positions([symbol])
            if positions["status"] != "ok":
                return positions

            if not positions["positions"]:
                return {"status": "error", "msg": "无持仓"}

            pos = positions["positions"][0]
            side = "sell" if pos.get("side") == "long" else "buy"
            amount = pos.get("contracts", 0)

            if amount <= 0:
                return {"status": "error", "msg": "持仓数量为0"}

            close_params = {**(params or {}), "reduceOnly": True}
            result = self.place_order(symbol, side, "market", amount, params=close_params)
            if result["status"] == "ok":
                self.risk_manager.on_position_closed(symbol)
            return result

        except Exception as e:
            logger.error(f"平仓失败: {e}")
            return {"status": "error", "msg": str(e)}

    def get_account_summary(self) -> Dict:
        """获取账户摘要"""
        balance = self.fetch_balance()
        positions = self.fetch_positions()

        total_equity = 0
        if balance["status"] == "ok":
            total_equity = balance["balance"].get("total", {}).get("USDT", 0) or balance["balance"].get("USDT", {}).get("total", 0)

        return {
            "equity": total_equity,
            "open_positions": len(self._positions_cache),
            "balance": balance.get("balance", {}),
            "positions": list(self._positions_cache.keys()),
        }
