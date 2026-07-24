"""
模拟盘交易器
- 模拟真实交易所的撮合逻辑
- 支持市价单、限价单
- 支持止损止盈
- 实时计算持仓盈亏
"""
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import time
import uuid

from ..data.market_data import KlineData
from ..strategies.base import Signal
from ..risk.risk_manager import RiskManager
from ..utils.logger import logger


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"


class OrderStatus(str, Enum):
    PENDING = "pending"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELED = "cancelled"
    REJECTED = "rejected"


@dataclass
class Order:
    """订单"""
    id: str
    symbol: str
    side: str
    type: str
    price: float
    amount: float
    filled: float = 0.0
    status: str = "pending"
    stop_price: float = 0.0
    created_at: float = 0.0
    filled_at: float = 0.0
    client_order_id: str = ""


@dataclass
class Position:
    """持仓"""
    symbol: str
    side: str  # long / short
    entry_price: float
    size: float
    leverage: int = 1
    stop_loss: float = 0.0
    take_profit: float = 0.0
    unrealized_pnl: float = 0.0
    unrealized_pnl_pct: float = 0.0
    opened_at: float = 0.0
    order_id: str = ""

    def update_pnl(self, current_price: float):
        if self.side == "long":
            self.unrealized_pnl = (current_price - self.entry_price) * self.size * self.leverage
        else:
            self.unrealized_pnl = (self.entry_price - current_price) * self.size * self.leverage

        self.unrealized_pnl_pct = self.unrealized_pnl / (self.entry_price * self.size / self.leverage) * 100 if self.entry_price > 0 else 0


@dataclass
class TradeRecord:
    """交易记录"""
    id: str
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    pnl_pct: float
    entry_time: float
    exit_time: float
    reason: str
    leverage: int = 1


class PaperTrader:
    """模拟盘交易器"""

    def __init__(
        self,
        initial_capital: float = 10000.0,
        commission_rate: float = 0.0004,
        slippage_rate: float = 0.0002,
        risk_manager: Optional[RiskManager] = None,
    ):
        self.initial_capital = initial_capital
        self.balance = initial_capital
        self.commission_rate = commission_rate
        self.slippage_rate = slippage_rate
        self.risk_manager = risk_manager or RiskManager()

        self._positions: Dict[str, Position] = {}
        self._orders: Dict[str, Order] = {}
        self._trade_history: List[TradeRecord] = []
        self._current_prices: Dict[str, float] = {}

    def update_price(self, symbol: str, price: float):
        """更新最新价格，触发止损止盈检查"""
        self._current_prices[symbol] = price

        if symbol in self._positions:
            pos = self._positions[symbol]
            pos.update_pnl(price)
            self._check_stop_loss_take_profit(pos, price)

        self._check_pending_orders(symbol, price)

    def _check_stop_loss_take_profit(self, position: Position, price: float):
        """检查止损止盈"""
        if position.side == "long":
            if position.take_profit > 0 and price >= position.take_profit:
                self.close_position(position.symbol, reason="take_profit")
                return
            if position.stop_loss > 0 and price <= position.stop_loss:
                self.close_position(position.symbol, reason="stop_loss")
                return
        else:
            if position.take_profit > 0 and price <= position.take_profit:
                self.close_position(position.symbol, reason="take_profit")
                return
            if position.stop_loss > 0 and price >= position.stop_loss:
                self.close_position(position.symbol, reason="stop_loss")
                return

    def _check_pending_orders(self, symbol: str, price: float):
        """检查挂单是否触发"""
        for order_id, order in list(self._orders.items()):
            if order.symbol != symbol or order.status != "pending":
                continue

            if order.type == OrderType.LIMIT.value:
                if order.side == OrderSide.BUY.value and price <= order.price:
                    self._fill_order(order, price)
                elif order.side == OrderSide.SELL.value and price >= order.price:
                    self._fill_order(order, price)
            elif order.type == OrderType.STOP.value:
                if order.side == OrderSide.BUY.value and price >= order.stop_price:
                    self._fill_order(order, price)
                elif order.side == OrderSide.SELL.value and price <= order.stop_price:
                    self._fill_order(order, price)

    def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        amount: float,
        price: float = 0.0,
        stop_price: float = 0.0,
    ) -> Order:
        """下单"""
        order_id = str(uuid.uuid4())[:12]

        current_price = self._current_prices.get(symbol, price)
        exec_price = price if order_type == OrderType.LIMIT.value else current_price

        risk_check = self.risk_manager.check_new_order(
            symbol=symbol,
            side=side,
            size=amount,
            entry_price=exec_price,
            stop_loss=stop_price,
            current_equity=self.get_equity(),
        )

        if not risk_check.passed:
            order = Order(
                id=order_id,
                symbol=symbol,
                side=side,
                type=order_type,
                price=price,
                amount=amount,
                status=OrderStatus.REJECTED.value,
                created_at=time.time(),
            )
            self._orders[order_id] = order
            logger.warning(f"订单被风控拒绝: {risk_check.reason}")
            return order

        order = Order(
            id=order_id,
            symbol=symbol,
            side=side,
            type=order_type,
            price=price,
            amount=amount,
            stop_price=stop_price,
            status=OrderStatus.PENDING.value,
            created_at=time.time(),
        )

        self._orders[order_id] = order

        if order_type == OrderType.MARKET.value:
            self._fill_order(order, current_price)
        else:
            logger.info(f"挂单: {side} {amount} {symbol} @ {price}")

        return order

    def _fill_order(self, order: Order, fill_price: float):
        """成交订单"""
        if order.status == OrderStatus.FILLED.value:
            return

        slippage = fill_price * self.slippage_rate
        if order.side == OrderSide.BUY.value:
            exec_price = fill_price + slippage
        else:
            exec_price = fill_price - slippage

        commission = exec_price * order.amount * self.commission_rate
        cost = exec_price * order.amount + commission

        if order.side == OrderSide.BUY.value:
            if cost > self.balance:
                order.status = OrderStatus.REJECTED.value
                logger.warning(f"余额不足，订单拒绝")
                return

            self.balance -= cost
            self._open_position(order.symbol, "long", exec_price, order.amount)
        else:
            if order.symbol not in self._positions:
                self.balance -= cost
                self._open_position(order.symbol, "short", exec_price, order.amount)
            else:
                self.balance += cost
                self._close_position_by_order(order.symbol, exec_price, order.amount, "order_filled")

        order.filled = order.amount
        order.status = OrderStatus.FILLED.value
        order.filled_at = time.time()

        logger.info(f"成交: {order.side} {order.amount} {order.symbol} @ {exec_price}")

    def _open_position(self, symbol: str, side: str, price: float, size: float):
        """开仓"""
        if symbol in self._positions:
            existing = self._positions[symbol]
            if existing.side == side:
                new_size = existing.size + size
                new_entry = (existing.entry_price * existing.size + price * size) / new_size
                existing.entry_price = new_entry
                existing.size = new_size
                return
            else:
                self.close_position(symbol, reason="reverse")

        position = Position(
            symbol=symbol,
            side=side,
            entry_price=price,
            size=size,
            opened_at=time.time(),
        )
        self._positions[symbol] = position
        self.risk_manager.on_position_opened(symbol, position)

    def _close_position_by_order(self, symbol: str, price: float, size: float, reason: str):
        """通过订单平仓"""
        if symbol not in self._positions:
            return

        pos = self._positions[symbol]

        if size >= pos.size:
            self.close_position(symbol, reason)
        else:
            pos.size -= size

    def close_position(self, symbol: str, reason: str = "manual") -> Optional[TradeRecord]:
        """平仓"""
        if symbol not in self._positions:
            return None

        pos = self._positions[symbol]
        current_price = self._current_prices.get(symbol, pos.entry_price)

        slippage = current_price * self.slippage_rate
        if pos.side == "long":
            exit_price = current_price - slippage
            pnl = (exit_price - pos.entry_price) * pos.size
        else:
            exit_price = current_price + slippage
            pnl = (pos.entry_price - exit_price) * pos.size

        commission = exit_price * pos.size * self.commission_rate
        pnl -= commission

        returned = pos.entry_price * pos.size + pnl
        self.balance += returned

        trade = TradeRecord(
            id=str(uuid.uuid4())[:12],
            symbol=symbol,
            side=pos.side,
            entry_price=pos.entry_price,
            exit_price=exit_price,
            size=pos.size,
            pnl=pnl,
            pnl_pct=pnl / (pos.entry_price * pos.size) * 100 if pos.entry_price > 0 else 0,
            entry_time=pos.opened_at,
            exit_time=time.time(),
            reason=reason,
            leverage=pos.leverage,
        )
        self._trade_history.append(trade)
        self.risk_manager.on_trade_closed(pnl, symbol)
        self.risk_manager.on_position_closed(symbol)

        del self._positions[symbol]
        logger.info(f"平仓 {symbol}: {reason}, PnL: {pnl:.2f} ({trade.pnl_pct:.2f}%)")

        return trade

    def execute_signal(self, signal: Signal, symbol: str, price: float):
        """根据信号执行交易"""
        self._current_prices[symbol] = price

        if signal.direction == "neutral":
            return None

        if signal.direction == "long":
            if symbol not in self._positions:
                return self.place_order(symbol, "buy", "market", signal.get("size", 100))
            elif self._positions[symbol].side == "short":
                self.close_position(symbol, reason="signal_reverse")
                return self.place_order(symbol, "buy", "market", signal.get("size", 100))
        elif signal.direction == "short":
            if symbol not in self._positions:
                return self.place_order(symbol, "sell", "market", signal.get("size", 100))
            elif self._positions[symbol].side == "long":
                self.close_position(symbol, reason="signal_reverse")
                return self.place_order(symbol, "sell", "market", signal.get("size", 100))

        return None

    def get_equity(self) -> float:
        """获取总权益"""
        total = self.balance
        for symbol, pos in self._positions.items():
            current_price = self._current_prices.get(symbol, pos.entry_price)
            pos.update_pnl(current_price)
            total += pos.unrealized_pnl
            total += pos.entry_price * pos.size / pos.leverage
        return total

    def get_position(self, symbol: str) -> Optional[Position]:
        return self._positions.get(symbol)

    def get_all_positions(self) -> Dict[str, Position]:
        return self._positions.copy()

    def get_order(self, order_id: str) -> Optional[Order]:
        return self._orders.get(order_id)

    def get_trade_history(self) -> List[TradeRecord]:
        return self._trade_history.copy()

    def cancel_order(self, order_id: str) -> bool:
        if order_id in self._orders and self._orders[order_id].status == "pending":
            self._orders[order_id].status = OrderStatus.CANCELED.value
            return True
        return False

    def get_summary(self) -> Dict[str, Any]:
        """获取账户摘要"""
        equity = self.get_equity()
        total_pnl = equity - self.initial_capital
        pnl_pct = total_pnl / self.initial_capital * 100 if self.initial_capital > 0 else 0

        total_trades = len(self._trade_history)
        winning = sum(1 for t in self._trade_history if t.pnl > 0)
        win_rate = winning / total_trades * 100 if total_trades > 0 else 0

        return {
            "initial_capital": self.initial_capital,
            "balance": self.balance,
            "equity": equity,
            "total_pnl": total_pnl,
            "total_pnl_pct": pnl_pct,
            "open_positions": len(self._positions),
            "total_trades": total_trades,
            "win_rate": win_rate,
            "commission_rate": self.commission_rate,
        }
