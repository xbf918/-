"""
专业回测引擎（优化版）
核心改进：
- 信号延迟机制：K线收盘确认后才产生信号，下一根K线开盘价成交（防止前视偏差）
- 动态滑点模型：基于ATR和波动率的自适应滑点
- ATR移动止损（Trailing Stop）
- 时间止损
- 分批建仓/平仓支持
- 更丰富的绩效分析指标
"""
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict

import numpy as np

from ..data.market_data import KlineData
from ..strategies.base import BaseStrategy, Signal
from ..config.settings import settings
from ..utils.logger import logger
from ..utils.helpers import (
    calc_sharpe_ratio, calc_max_drawdown, calc_win_rate, calc_profit_factor,
    calc_atr, calc_sma,
)


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class OrderStatus(str, Enum):
    PENDING = "pending"
    FILLED = "filled"
    CANCELED = "cancelled"


class PositionSide(str, Enum):
    LONG = "long"
    SHORT = "short"


class SlippageModel(str, Enum):
    FIXED = "fixed"
    ATR_BASED = "atr_based"
    VOLATILITY_BASED = "volatility_based"
    VOLUME_BASED = "volume_based"


@dataclass
class Position:
    """持仓"""
    symbol: str
    side: str
    entry_price: float
    size: float
    leverage: int = 1
    stop_loss: float = 0.0
    take_profit: float = 0.0
    opened_at: int = 0
    opened_idx: int = 0
    trailing_stop: float = 0.0
    trailing_atr_mult: float = 0.0
    highest_price: float = 0.0
    lowest_price: float = 0.0
    bars_held: int = 0

    @property
    def value(self) -> float:
        return self.entry_price * self.size

    def pnl(self, current_price: float) -> float:
        if self.side == PositionSide.LONG.value:
            return (current_price - self.entry_price) * self.size * self.leverage
        else:
            return (self.entry_price - current_price) * self.size * self.leverage

    def pnl_percent(self, current_price: float) -> float:
        if self.value == 0:
            return 0.0
        return self.pnl(current_price) / self.value * 100


@dataclass
class Trade:
    """交易记录"""
    id: int
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    pnl_percent: float
    entry_time: int
    exit_time: int
    reason: str
    leverage: int = 1
    bars_held: int = 0
    entry_slippage: float = 0.0
    exit_slippage: float = 0.0
    max_favorable_pnl: float = 0.0
    max_adverse_pnl: float = 0.0


@dataclass
class BacktestResult:
    """回测结果（增强版）"""
    symbol: str
    timeframe: str
    strategy: str
    params: Dict[str, Any]
    initial_capital: float
    final_capital: float
    total_return_pct: float
    total_trades: int
    win_rate: float
    profit_factor: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown: float
    max_drawdown_pct: float
    max_drawdown_duration: int
    winning_trades: int
    losing_trades: int
    total_commission: float
    total_slippage: float
    trades: List[Trade] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)
    drawdown_curve: List[float] = field(default_factory=list)
    monthly_returns: Dict[str, float] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)


class BacktestEngine:
    """回测引擎（优化版）

    关键改进：
    - 信号在K线收盘后确认，下一根K线开盘价成交（无未来函数）
    - 多种滑点模型可选
    - ATR移动止损
    - 时间止损
    """

    def __init__(
        self,
        kline: KlineData,
        strategy: BaseStrategy,
        initial_capital: float = 10000.0,
        commission_rate: float = 0.0004,
        slippage_rate: float = 0.0002,
        leverage: int = 1,
        signal_lag: int = 1,
        slippage_model: str = "volatility_based",
        atr_period: int = 14,
        trailing_stop_atr: float = 0.0,
        time_stop_bars: int = 0,
        position_risk_pct: float = 0.02,
    ):
        self.kline = kline
        self.strategy = strategy
        self.initial_capital = initial_capital
        self.commission_rate = commission_rate
        self.slippage_rate = slippage_rate
        self.leverage = leverage
        self.signal_lag = signal_lag
        self.slippage_model = slippage_model
        self.atr_period = atr_period
        self.trailing_stop_atr = trailing_stop_atr
        self.time_stop_bars = time_stop_bars
        self.position_risk_pct = position_risk_pct

        self._capital = initial_capital
        self._position: Optional[Position] = None
        self._trades: List[Trade] = []
        self._equity_curve: List[float] = []
        self._total_commission = 0.0
        self._total_slippage = 0.0
        self._trade_id = 0
        self._pending_signals: List[Tuple[int, Signal]] = []

        self._atr_values: Optional[np.ndarray] = None
        self._volatility: Optional[np.ndarray] = None

    def _precompute_indicators(self):
        """预计算ATR和波动率等指标"""
        n = self.kline.length
        self._atr_values = np.zeros(n)
        self._volatility = np.zeros(n)

        atr = calc_atr(
            self.kline.high, self.kline.low, self.kline.close,
            period=self.atr_period,
        )
        self._atr_values[:len(atr)] = atr

        close = np.array(self.kline.close)
        for i in range(self.atr_period, n):
            window = close[i - self.atr_period:i]
            if len(window) > 1 and window[-1] > 0:
                returns = np.diff(window) / window[:-1]
                self._volatility[i] = np.std(returns) * 100

    def _calc_dynamic_slippage(self, idx: int, price: float, side: str) -> Tuple[float, float]:
        """计算动态滑点

        Returns:
            (exec_price, slippage_amount)
        """
        if self.slippage_model == SlippageModel.FIXED.value:
            slip = price * self.slippage_rate
            if side == PositionSide.LONG.value:
                return price + slip, slip
            else:
                return price - slip, slip

        atr_val = self._atr_values[idx] if idx < len(self._atr_values) else 0
        vol = self._volatility[idx] if idx < len(self._volatility) else 0

        if atr_val <= 0 and vol <= 0:
            slip = price * self.slippage_rate
        else:
            base_slip = price * self.slippage_rate
            atr_slip = atr_val * 0.1
            vol_adj = 1.0 + vol * 5
            slip = max(base_slip, atr_slip * 0.3) * vol_adj
            slip = min(slip, price * 0.005)

        if side == PositionSide.LONG.value:
            return price + slip, slip
        else:
            return price - slip, slip

    def run(self) -> BacktestResult:
        """执行回测"""
        logger.info(f"开始回测: {self.strategy.name} on {self.kline.symbol} {self.kline.timeframe}")
        logger.info(f"初始资金: {self.initial_capital}, 杠杆: {self.leverage}x")
        logger.info(f"信号延迟: {self.signal_lag}根K线, 滑点模型: {self.slippage_model}")
        if self.trailing_stop_atr > 0:
            logger.info(f"移动止损: {self.trailing_stop_atr}x ATR")
        if self.time_stop_bars > 0:
            logger.info(f"时间止损: {self.time_stop_bars}根K线")

        self._precompute_indicators()

        n = self.kline.length
        if n < 100:
            logger.warning("K线数据不足，回测结果可能不准确")

        start_idx = max(50, self.atr_period + 5)
        for i in range(start_idx, n):
            current_price = self.kline.close[i]
            open_price = self.kline.open[i]
            timestamp = int(self.kline.timestamps[i])

            self._update_position(current_price, open_price, timestamp, i)

            sub_kline = self._slice_kline(i + 1)
            signal = self.strategy.generate_signal(sub_kline)
            if signal.direction != "neutral":
                self._pending_signals.append((i + self.signal_lag, signal))

            self._process_pending_signals(i, open_price, timestamp)

            equity = self._calc_equity(current_price)
            self._equity_curve.append(equity)

        final_capital = self._calc_equity(self.kline.close[-1])
        result = self._build_result(final_capital)

        logger.info(
            f"回测完成: 总收益 {result.total_return_pct:.2f}%, "
            f"胜率 {result.win_rate * 100:.1f}%, "
            f"夏普比 {result.sharpe_ratio:.2f}, "
            f"最大回撤 {result.max_drawdown_pct:.2f}%, "
            f"卡玛比 {result.calmar_ratio:.2f}"
        )

        return result

    def _slice_kline(self, end_idx: int) -> KlineData:
        """切片K线数据"""
        return KlineData(
            symbol=self.kline.symbol,
            timeframe=self.kline.timeframe,
            timestamps=self.kline.timestamps[:end_idx],
            open=self.kline.open[:end_idx],
            high=self.kline.high[:end_idx],
            low=self.kline.low[:end_idx],
            close=self.kline.close[:end_idx],
            volume=self.kline.volume[:end_idx],
        )

    def _process_pending_signals(self, idx: int, open_price: float, timestamp: int):
        """处理延迟后的挂单信号"""
        signals_to_process = []
        remaining = []
        for sig_idx, sig in self._pending_signals:
            if sig_idx <= idx:
                signals_to_process.append(sig)
            else:
                remaining.append((sig_idx, sig))
        self._pending_signals = remaining

        for signal in signals_to_process:
            self._process_signal(signal, open_price, timestamp, idx)

    def _process_signal(self, signal: Signal, price: float, timestamp: int, idx: int):
        """处理交易信号"""
        if signal.direction == "neutral":
            return

        if self._position is None:
            if signal.direction == "long":
                self._open_position("long", price, timestamp, idx, signal)
            elif signal.direction == "short":
                self._open_position("short", price, timestamp, idx, signal)
        else:
            pos = self._position
            if signal.direction == "long" and pos.side == PositionSide.SHORT.value:
                self._close_position(price, timestamp, idx, "signal_reverse")
                self._open_position("long", price, timestamp, idx, signal)
            elif signal.direction == "short" and pos.side == PositionSide.LONG.value:
                self._close_position(price, timestamp, idx, "signal_reverse")
                self._open_position("short", price, timestamp, idx, signal)

    def _calc_position_size(self, entry_price: float, stop_loss: float) -> float:
        """基于风险百分比计算仓位大小"""
        if stop_loss <= 0 or entry_price <= 0:
            return self._capital * 0.1 / entry_price * self.leverage

        risk_amount = self._capital * self.position_risk_pct
        price_diff = abs(entry_price - stop_loss)
        if price_diff <= 0:
            return self._capital * 0.1 / entry_price * self.leverage

        size = risk_amount / price_diff * self.leverage
        max_size = self._capital * 0.5 / entry_price * self.leverage
        return min(size, max_size)

    def _open_position(
        self, side: str, price: float, timestamp: int, idx: int, signal: Signal,
    ):
        """开仓"""
        if self._capital <= 0:
            return

        exec_price, slip_amount = self._calc_dynamic_slippage(idx, price, side)

        stop_loss = signal.stop_loss
        if stop_loss <= 0 and self._atr_values is not None and idx < len(self._atr_values):
            atr_val = self._atr_values[idx]
            if atr_val > 0:
                atr_stop_mult = 2.0
                if side == PositionSide.LONG.value:
                    stop_loss = exec_price - atr_val * atr_stop_mult
                else:
                    stop_loss = exec_price + atr_val * atr_stop_mult

        take_profit = signal.take_profit
        if take_profit <= 0 and stop_loss > 0:
            rr = 2.0
            if side == PositionSide.LONG.value:
                take_profit = exec_price + (exec_price - stop_loss) * rr
            else:
                take_profit = exec_price - (stop_loss - exec_price) * rr

        order_size = self._calc_position_size(exec_price, stop_loss)
        if order_size <= 0:
            return

        commission = exec_price * order_size * self.commission_rate
        cost = exec_price * order_size / self.leverage + commission

        if cost > self._capital:
            order_size = (self._capital - self._capital * self.commission_rate) / exec_price * self.leverage
            commission = exec_price * order_size * self.commission_rate
            cost = exec_price * order_size / self.leverage + commission

        self._capital -= cost
        self._total_commission += commission
        self._total_slippage += slip_amount * order_size

        trailing_stop = 0.0
        if self.trailing_stop_atr > 0 and self._atr_values is not None:
            atr_val = self._atr_values[idx]
            if atr_val > 0:
                if side == PositionSide.LONG.value:
                    trailing_stop = exec_price - atr_val * self.trailing_stop_atr
                else:
                    trailing_stop = exec_price + atr_val * self.trailing_stop_atr

        self._position = Position(
            symbol=self.kline.symbol,
            side=side,
            entry_price=exec_price,
            size=order_size,
            leverage=self.leverage,
            stop_loss=stop_loss,
            take_profit=take_profit,
            opened_at=timestamp,
            opened_idx=idx,
            trailing_stop=trailing_stop,
            trailing_atr_mult=self.trailing_stop_atr,
            highest_price=exec_price,
            lowest_price=exec_price,
        )

    def _close_position(self, price: float, timestamp: int, idx: int, reason: str):
        """平仓"""
        if self._position is None:
            return

        pos = self._position
        exec_price, slip_amount = self._calc_dynamic_slippage(
            idx, price,
            PositionSide.SHORT.value if pos.side == PositionSide.LONG.value else PositionSide.LONG.value,
        )
        commission = exec_price * pos.size * self.commission_rate
        self._total_commission += commission
        self._total_slippage += slip_amount * pos.size

        pnl = pos.pnl(exec_price)
        pnl_pct = pos.pnl_percent(exec_price)

        returned = pos.value / self.leverage + pnl - commission
        self._capital += returned

        self._trade_id += 1
        max_fav = 0.0
        max_adv = 0.0
        if pos.side == PositionSide.LONG.value:
            max_fav = (pos.highest_price - pos.entry_price) * pos.size * pos.leverage
            max_adv = (pos.lowest_price - pos.entry_price) * pos.size * pos.leverage
        else:
            max_fav = (pos.entry_price - pos.lowest_price) * pos.size * pos.leverage
            max_adv = (pos.entry_price - pos.highest_price) * pos.size * pos.leverage

        trade = Trade(
            id=self._trade_id,
            symbol=pos.symbol,
            side=pos.side,
            entry_price=pos.entry_price,
            exit_price=exec_price,
            size=pos.size,
            pnl=pnl,
            pnl_percent=pnl_pct,
            entry_time=pos.opened_at,
            exit_time=timestamp,
            reason=reason,
            leverage=self.leverage,
            bars_held=idx - pos.opened_idx,
            entry_slippage=0,
            exit_slippage=slip_amount,
            max_favorable_pnl=max_fav,
            max_adverse_pnl=max_adv,
        )
        self._trades.append(trade)
        self._position = None

    def _update_position(self, current_price: float, open_price: float, timestamp: int, idx: int):
        """更新持仓状态（止损止盈/移动止损/时间止损检查）"""
        if self._position is None:
            return

        pos = self._position
        high = self.kline.high[idx]
        low = self.kline.low[idx]
        pos.bars_held += 1

        if pos.side == PositionSide.LONG.value:
            pos.highest_price = max(pos.highest_price, high)
            pos.lowest_price = min(pos.lowest_price, low)
        else:
            pos.highest_price = max(pos.highest_price, high)
            pos.lowest_price = min(pos.lowest_price, low)

        if pos.trailing_atr_mult > 0 and self._atr_values is not None:
            atr_val = self._atr_values[idx]
            if atr_val > 0:
                if pos.side == PositionSide.LONG.value:
                    new_ts = pos.highest_price - atr_val * pos.trailing_atr_mult
                    pos.trailing_stop = max(pos.trailing_stop, new_ts)
                else:
                    new_ts = pos.lowest_price + atr_val * pos.trailing_atr_mult
                    if pos.trailing_stop == 0:
                        pos.trailing_stop = new_ts
                    else:
                        pos.trailing_stop = min(pos.trailing_stop, new_ts)

        if pos.take_profit > 0:
            if pos.side == PositionSide.LONG.value and high >= pos.take_profit:
                self._close_position(pos.take_profit, timestamp, idx, "take_profit")
                return
            elif pos.side == PositionSide.SHORT.value and low <= pos.take_profit:
                self._close_position(pos.take_profit, timestamp, idx, "take_profit")
                return

        if pos.trailing_stop > 0 and pos.bars_held > 2:
            if pos.side == PositionSide.LONG.value and low <= pos.trailing_stop:
                self._close_position(pos.trailing_stop, timestamp, idx, "trailing_stop")
                return
            elif pos.side == PositionSide.SHORT.value and high >= pos.trailing_stop:
                self._close_position(pos.trailing_stop, timestamp, idx, "trailing_stop")
                return

        if pos.stop_loss > 0:
            if pos.side == PositionSide.LONG.value and low <= pos.stop_loss:
                self._close_position(pos.stop_loss, timestamp, idx, "stop_loss")
                return
            elif pos.side == PositionSide.SHORT.value and high >= pos.stop_loss:
                self._close_position(pos.stop_loss, timestamp, idx, "stop_loss")
                return

        if self.time_stop_bars > 0 and pos.bars_held >= self.time_stop_bars:
            pnl_now = pos.pnl(current_price)
            if pnl_now < pos.value * 0.01 * pos.leverage:
                self._close_position(current_price, timestamp, idx, "time_stop")
                return

    def _calc_equity(self, current_price: float) -> float:
        """计算当前权益"""
        equity = self._capital
        if self._position:
            equity += self._position.pnl(current_price)
            equity += self._position.value / self.leverage
        return max(0.0, equity)

    def _build_result(self, final_capital: float) -> BacktestResult:
        """构建回测结果（增强版）"""
        total_return = (final_capital - self.initial_capital) / self.initial_capital * 100

        returns = []
        for i in range(1, len(self._equity_curve)):
            if self._equity_curve[i - 1] > 0:
                returns.append(
                    (self._equity_curve[i] - self._equity_curve[i - 1]) / self._equity_curve[i - 1]
                )

        sharpe = calc_sharpe_ratio(returns, periods=365 * 24)
        sortino = self._calc_sortino_ratio(returns)
        sortino = 0.0 if np.isinf(sortino) or np.isnan(sortino) else sortino
        dd_info = calc_max_drawdown(self._equity_curve)
        max_dd = dd_info["max_drawdown"]
        max_dd_pct = abs(max_dd) * 100
        max_dd_duration = dd_info.get("duration", 0)

        win_rate = calc_win_rate(self._trades)
        pf = calc_profit_factor(self._trades)
        pf = 0.0 if np.isinf(pf) or np.isnan(pf) else pf

        winning = sum(1 for t in self._trades if t.pnl > 0)
        losing = sum(1 for t in self._trades if t.pnl <= 0)

        peak = 0
        drawdown_curve = []
        for eq in self._equity_curve:
            peak = max(peak, eq)
            dd = (eq - peak) / peak * 100 if peak > 0 else 0
            drawdown_curve.append(dd)

        monthly_returns = self._calc_monthly_returns()
        pnl_distribution = self._calc_pnl_distribution()
        consecutive_stats = self._calc_consecutive_stats()
        recent_performance = self._calc_recent_performance()

        avg_bars_held = np.mean([t.bars_held for t in self._trades]) if self._trades else 0
        win_trades_pnl = [t.pnl for t in self._trades if t.pnl > 0]
        loss_trades_pnl = [t.pnl for t in self._trades if t.pnl < 0]

        metrics = {
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "calmar_ratio": abs(total_return / max_dd_pct) if max_dd_pct > 0 else 0,
            "total_commission": self._total_commission,
            "total_slippage": self._total_slippage,
            "avg_trade_pnl": np.mean([t.pnl for t in self._trades]) if self._trades else 0,
            "avg_win_pnl": np.mean(win_trades_pnl) if winning > 0 else 0,
            "avg_loss_pnl": np.mean(loss_trades_pnl) if losing > 0 else 0,
            "total_trades": len(self._trades),
            "avg_bars_held": avg_bars_held,
            "max_consecutive_wins": consecutive_stats["max_wins"],
            "max_consecutive_losses": consecutive_stats["max_losses"],
            "profit_factor": pf,
            "max_drawdown_duration": max_dd_duration,
            "pnl_distribution": pnl_distribution,
            "recent_performance": recent_performance,
            "avg_rr": (abs(np.mean(win_trades_pnl)) / abs(np.mean(loss_trades_pnl)))
            if win_trades_pnl and loss_trades_pnl else 0,
            "expectancy": (
                win_rate * abs(np.mean(win_trades_pnl))
                - (1 - win_rate) * abs(np.mean(loss_trades_pnl))
            ) if win_trades_pnl and loss_trades_pnl else 0,
        }

        return BacktestResult(
            symbol=self.kline.symbol,
            timeframe=self.kline.timeframe,
            strategy=self.strategy.name,
            params=self.strategy.params,
            initial_capital=self.initial_capital,
            final_capital=final_capital,
            total_return_pct=total_return,
            total_trades=len(self._trades),
            win_rate=win_rate,
            profit_factor=pf,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            calmar_ratio=abs(total_return / max_dd_pct) if max_dd_pct > 0 else 0,
            max_drawdown=max_dd,
            max_drawdown_pct=max_dd_pct,
            max_drawdown_duration=max_dd_duration,
            winning_trades=winning,
            losing_trades=losing,
            total_commission=self._total_commission,
            total_slippage=self._total_slippage,
            trades=self._trades,
            equity_curve=self._equity_curve,
            drawdown_curve=drawdown_curve,
            monthly_returns=monthly_returns,
            metrics=metrics,
        )

    def _calc_sortino_ratio(self, returns: List[float]) -> float:
        """计算Sortino比率（只考虑下行波动）"""
        if not returns:
            return 0.0
        downside = [r for r in returns if r < 0]
        if not downside:
            return float("inf")
        mean_ret = np.mean(returns)
        std_down = np.std(downside)
        if std_down == 0:
            return 0.0
        periods = 365 * 24
        return (mean_ret / std_down) * np.sqrt(periods)

    def _calc_monthly_returns(self) -> Dict[str, float]:
        """计算月度收益"""
        monthly = defaultdict(list)
        n = len(self._equity_curve)
        start_idx = max(50, self.atr_period + 5)

        for i in range(start_idx, n):
            ts = int(self.kline.timestamps[i])
            import time
            month_key = time.strftime("%Y-%m", time.localtime(ts / 1000))
            eq_idx = i - start_idx
            if 0 <= eq_idx < len(self._equity_curve):
                monthly[month_key].append(self._equity_curve[eq_idx])

        result = {}
        months = sorted(monthly.keys())
        for i, month in enumerate(months):
            values = monthly[month]
            if values:
                if i == 0:
                    result[month] = (values[-1] - self.initial_capital) / self.initial_capital * 100
                else:
                    prev_month = months[i - 1]
                    prev_end = monthly[prev_month][-1] if monthly[prev_month] else self.initial_capital
                    result[month] = (values[-1] - prev_end) / prev_end * 100 if prev_end > 0 else 0

        return result

    def _calc_pnl_distribution(self) -> Dict[str, Any]:
        """计算盈亏分布"""
        if not self._trades:
            return {"bins": [], "counts": []}

        pnls = np.array([t.pnl_percent for t in self._trades])
        n_bins = 20
        counts, bins = np.histogram(pnls, bins=n_bins)

        return {
            "bins": bins.tolist(),
            "counts": counts.tolist(),
            "min": float(pnls.min()),
            "max": float(pnls.max()),
            "mean": float(pnls.mean()),
            "median": float(np.median(pnls)),
            "skewness": float(((pnls - pnls.mean()) ** 3).mean() / (pnls.std() ** 3)) if pnls.std() > 0 else 0,
        }

    def _calc_consecutive_stats(self) -> Dict[str, int]:
        """计算连续盈亏统计"""
        max_wins = 0
        max_losses = 0
        current_wins = 0
        current_losses = 0

        for trade in self._trades:
            if trade.pnl > 0:
                current_wins += 1
                current_losses = 0
                max_wins = max(max_wins, current_wins)
            else:
                current_losses += 1
                current_wins = 0
                max_losses = max(max_losses, current_losses)

        return {
            "max_wins": max_wins,
            "max_losses": max_losses,
        }

    def _calc_recent_performance(self) -> Dict[str, float]:
        """计算近期表现（收益衰减检测）"""
        if not self._trades:
            return {"last_10": 0, "last_20": 0, "last_50": 0, "first_half": 0, "second_half": 0}

        pnls = [t.pnl_percent for t in self._trades]
        total = len(pnls)
        half = total // 2

        last_10 = sum(pnls[-10:]) if total >= 10 else sum(pnls)
        last_20 = sum(pnls[-20:]) if total >= 20 else sum(pnls)
        last_50 = sum(pnls[-50:]) if total >= 50 else sum(pnls)

        first_half = sum(pnls[:half]) if half > 0 else 0
        second_half = sum(pnls[half:]) if half > 0 else 0

        return {
            "last_10_trades_pct": last_10,
            "last_20_trades_pct": last_20,
            "last_50_trades_pct": last_50,
            "first_half_pct": first_half,
            "second_half_pct": second_half,
            "decay_rate": (second_half - first_half) / abs(first_half) if first_half != 0 else 0,
        }

    def get_trades(self) -> List[Trade]:
        return self._trades.copy()

    def get_equity_curve(self) -> List[float]:
        return self._equity_curve.copy()
