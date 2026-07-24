"""
风控管理 - 多层风控检查
- 单笔最大亏损
- 单日最大亏损
- 仓位限制
- 连续亏损次数限制
- 风险敞口限制
"""
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import time

from ..config.settings import settings
from ..utils.logger import logger


class RiskLevel(str, Enum):
    """风险等级"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskCheckResult:
    """风控检查结果"""
    def __init__(self, passed: bool, level: RiskLevel = RiskLevel.LOW, reason: str = "", details: Dict = None):
        self.passed = passed
        self.level = level
        self.reason = reason
        self.details = details or {}

    def __repr__(self):
        return f"RiskCheckResult(passed={self.passed}, level={self.level}, reason='{self.reason}')"


@dataclass
class DailyStats:
    """每日统计"""
    date: str = ""
    pnl: float = 0.0
    trade_count: int = 0
    win_count: int = 0
    loss_count: int = 0
    consecutive_losses: int = 0
    peak_equity: float = 0.0


class RiskManager:
    """多层风控管理器"""

    def __init__(self, config=None):
        self.config = config or settings.risk
        self._daily_stats: DailyStats = DailyStats()
        self._open_positions: Dict[str, Any] = {}
        self._equity_history: List[float] = []
        self._trade_history: List[Dict] = []
        self._total_equity = self.config.initial_capital

    def check_new_order(
        self,
        symbol: str,
        side: str,
        size: float,
        entry_price: float,
        stop_loss: float = 0.0,
        take_profit: float = 0.0,
        current_equity: float = 0.0,
    ) -> RiskCheckResult:
        """检查新订单是否符合风控要求"""
        self.reset_daily_stats()
        if current_equity > 0:
            self._total_equity = current_equity

        if size <= 0 or entry_price <= 0:
            return RiskCheckResult(False, RiskLevel.HIGH, "订单数量和价格必须大于 0")
        if side not in ("long", "short"):
            return RiskCheckResult(False, RiskLevel.HIGH, "订单方向必须为 long 或 short")

        checks = [
            ("single_trade_loss", self._check_single_trade_loss),
            ("position_size", self._check_position_size),
            ("total_exposure", self._check_total_exposure),
            ("daily_loss_limit", self._check_daily_loss_limit),
            ("consecutive_losses", self._check_consecutive_losses),
            ("max_positions", self._check_max_positions),
        ]

        for name, check_fn in checks:
            result = check_fn(
                symbol=symbol,
                side=side,
                size=size,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
            )
            if not result.passed:
                logger.warning(f"风控未通过 [{name}]: {result.reason}")
                return result

        return RiskCheckResult(passed=True, level=RiskLevel.LOW, reason="风控通过")

    def _check_single_trade_loss(
        self, symbol: str, side: str, size: float, entry_price: float,
        stop_loss: float, take_profit: float, **kwargs
    ) -> RiskCheckResult:
        """单笔交易最大亏损检查"""
        if stop_loss <= 0:
            max_loss_pct = self.config.max_position_loss_pct
            stop_loss = entry_price * (1 - max_loss_pct) if side == "long" else entry_price * (1 + max_loss_pct)

        if side == "long":
            loss_amount = (entry_price - stop_loss) * size
        else:
            loss_amount = (stop_loss - entry_price) * size

        max_loss = self._total_equity * self.config.max_single_trade_loss_pct

        if loss_amount > max_loss:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.HIGH,
                reason=f"单笔亏损 {loss_amount:.2f} 超过限制 {max_loss:.2f} ({self.config.max_single_trade_loss_pct*100:.1f}%)",
                details={"loss_amount": loss_amount, "max_loss": max_loss},
            )

        return RiskCheckResult(passed=True, reason="单笔亏损检查通过")

    def _check_position_size(
        self, symbol: str, side: str, size: float, entry_price: float, **kwargs
    ) -> RiskCheckResult:
        """单仓位大小检查"""
        position_value = entry_price * size
        max_value = self._total_equity * self.config.max_position_pct

        if position_value > max_value:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.MEDIUM,
                reason=f"仓位价值 {position_value:.2f} 超过限制 {max_value:.2f} ({self.config.max_position_pct*100:.1f}%)",
                details={"position_value": position_value, "max_value": max_value},
            )

        return RiskCheckResult(passed=True, reason="仓位大小检查通过")

    def _check_total_exposure(self, entry_price: float, size: float, **kwargs) -> RiskCheckResult:
        """总风险敞口检查"""
        existing_exposure = sum(
            pos.get("value", 0) for pos in self._open_positions.values()
        )
        # The order being evaluated must be included; otherwise several rapid
        # orders can each pass independently while exceeding the account limit.
        total_exposure = existing_exposure + entry_price * size
        max_exposure = self._total_equity * self.config.max_total_exposure_pct

        if total_exposure > max_exposure:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.HIGH,
                reason=f"总敞口 {total_exposure:.2f} 超过限制 {max_exposure:.2f} ({self.config.max_total_exposure_pct*100:.1f}%)",
                details={"total_exposure": total_exposure, "max_exposure": max_exposure},
            )

        return RiskCheckResult(passed=True, reason="敞口检查通过")

    def _check_daily_loss_limit(self, **kwargs) -> RiskCheckResult:
        """单日最大亏损检查"""
        daily_loss_pct = abs(self._daily_stats.pnl) / self._total_equity if self._total_equity > 0 else 0

        if daily_loss_pct >= self.config.max_daily_loss_pct and self._daily_stats.pnl < 0:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.CRITICAL,
                reason=f"当日亏损 {daily_loss_pct*100:.2f}% 超过限制 {self.config.max_daily_loss_pct*100:.1f}%，停止开仓",
                details={"daily_loss_pct": daily_loss_pct},
            )

        return RiskCheckResult(passed=True, reason="日亏损检查通过")

    def _check_consecutive_losses(self, **kwargs) -> RiskCheckResult:
        """连续亏损次数检查"""
        if self._daily_stats.consecutive_losses >= self.config.max_consecutive_losses:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.HIGH,
                reason=f"连续亏损 {self._daily_stats.consecutive_losses} 次，超过限制 {self.config.max_consecutive_losses} 次",
                details={"consecutive_losses": self._daily_stats.consecutive_losses},
            )

        return RiskCheckResult(passed=True, reason="连续亏损检查通过")

    def _check_max_positions(self, **kwargs) -> RiskCheckResult:
        """最大持仓数量检查"""
        if len(self._open_positions) >= self.config.max_positions:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.MEDIUM,
                reason=f"持仓数量 {len(self._open_positions)} 达到上限 {self.config.max_positions}",
                details={"open_positions": len(self._open_positions)},
            )

        return RiskCheckResult(passed=True, reason="持仓数量检查通过")

    def on_trade_closed(self, pnl: float, symbol: str):
        """交易平仓回调"""
        self._daily_stats.trade_count += 1
        self._daily_stats.pnl += pnl

        if pnl > 0:
            self._daily_stats.win_count += 1
            self._daily_stats.consecutive_losses = 0
        else:
            self._daily_stats.loss_count += 1
            self._daily_stats.consecutive_losses += 1

        self._trade_history.append({
            "time": time.time(),
            "symbol": symbol,
            "pnl": pnl,
        })

    def on_position_opened(self, symbol: str, position: Any):
        """开仓回调"""
        self._open_positions[symbol] = position

    def on_position_closed(self, symbol: str):
        """平仓回调"""
        if symbol in self._open_positions:
            del self._open_positions[symbol]

    def update_equity(self, equity: float):
        """更新权益"""
        self._total_equity = equity
        self._equity_history.append(equity)

        if equity > self._daily_stats.peak_equity:
            self._daily_stats.peak_equity = equity

    def reset_daily_stats(self):
        """重置每日统计"""
        today = time.strftime("%Y-%m-%d")
        if self._daily_stats.date != today:
            self._daily_stats = DailyStats(date=today, peak_equity=self._total_equity)

    def get_risk_summary(self) -> Dict[str, Any]:
        """获取风险摘要"""
        total_exposure = sum(pos.get("value", 0) for pos in self._open_positions.values())
        exposure_pct = total_exposure / self._total_equity if self._total_equity > 0 else 0

        return {
            "total_equity": self._total_equity,
            "total_exposure": total_exposure,
            "exposure_pct": exposure_pct,
            "open_positions": len(self._open_positions),
            "daily_pnl": self._daily_stats.pnl,
            "daily_trades": self._daily_stats.trade_count,
            "daily_win_rate": self._daily_stats.win_count / self._daily_stats.trade_count if self._daily_stats.trade_count > 0 else 0,
            "consecutive_losses": self._daily_stats.consecutive_losses,
            "max_drawdown_today": (self._daily_stats.peak_equity - min(self._equity_history[-100:] if self._equity_history else [0])) / self._daily_stats.peak_equity if self._daily_stats.peak_equity > 0 else 0,
        }

    def calculate_position_size(
        self,
        entry_price: float,
        stop_loss: float,
        risk_pct: float = 0.02,
    ) -> float:
        """基于风险百分比计算仓位大小"""
        if stop_loss <= 0 or entry_price <= 0:
            return 0.0

        risk_pct = min(max(risk_pct, 0.0), self.config.max_single_trade_loss_pct)
        risk_amount = self._total_equity * risk_pct
        price_diff = abs(entry_price - stop_loss)

        if price_diff <= 0:
            return 0.0

        size = risk_amount / price_diff
        return size
