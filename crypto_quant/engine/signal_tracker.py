"""
信号后验追踪模块

功能：
1. 记录交易信号到数据库
2. 定期验证未验证信号的实际走势结果
3. 提供信号统计信息
"""
import time
from datetime import datetime
from typing import Dict, List, Any, Optional

from ..data.storage import (
    save_signal_record,
    get_unverified_signals,
    update_signal_outcome,
    get_signal_stats,
    get_signal_history,
)
from ..data.market_data import MarketDataManager
from ..data.ccxt_client import ExchangeClient
from ..utils.logger import logger


class SignalTracker:
    """信号追踪器

    负责：
    - 保存信号到数据库
    - 验证未验证信号的实际走势结果
    - 提供信号统计
    """

    def __init__(self):
        pass

    def record_signal(
        self,
        symbol: str,
        timeframe: str,
        strategy: str,
        signal_dict: Dict[str, Any],
        market_regime: Optional[str] = None,
    ) -> Optional[int]:
        """保存信号到数据库

        Args:
            symbol: 交易对
            timeframe: 时间周期
            strategy: 策略名称
            signal_dict: 信号字典，包含 direction, strength, confidence, entry_price, stop_loss, take_profit
            market_regime: 市场状态（可选）

        Returns:
            signal_id 或 None（如果 direction 为 neutral）
        """
        direction = signal_dict.get("direction", "neutral")
        if direction == "neutral":
            return None

        entry_price = signal_dict.get("entry_price", 0.0)
        stop_loss = signal_dict.get("stop_loss", 0.0)
        take_profit = signal_dict.get("take_profit", 0.0)
        confidence = signal_dict.get("confidence", 0.0)
        strength = signal_dict.get("strength", 0.0)

        try:
            signal_id = save_signal_record(
                symbol=symbol,
                timeframe=timeframe,
                strategy=strategy,
                direction=direction,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                confidence=confidence,
                strength=strength,
                market_regime=market_regime,
            )
            logger.info(f"信号已记录: id={signal_id}, {symbol} {timeframe} {strategy} {direction}")
            return signal_id
        except Exception as e:
            logger.error(f"记录信号失败: {e}")
            return None

    def verify_pending_signals(
        self,
        md: MarketDataManager,
        client: ExchangeClient,
        symbol: Optional[str] = None,
    ) -> int:
        """遍历未验证的信号，获取最新K线数据，计算信号后的走势结果

        Args:
            md: 市场数据管理器
            client: 交易所客户端
            symbol: 可选，仅验证指定交易对

        Returns:
            验证的信号数量
        """
        pending = get_unverified_signals(symbol=symbol, limit=200)
        if not pending:
            return 0

        verified_count = 0
        for signal in pending:
            try:
                self._verify_single_signal(md, client, signal)
                verified_count += 1
            except Exception as e:
                logger.error(f"验证信号 {signal['id']} 失败: {e}")

        return verified_count

    def _verify_single_signal(
        self,
        md: MarketDataManager,
        client: ExchangeClient,
        signal: Dict[str, Any],
    ) -> None:
        """验证单个信号"""
        signal_id = signal["id"]
        symbol = signal["symbol"]
        timeframe = signal["timeframe"]
        direction = signal["direction"]
        entry_price = signal["entry_price"]
        stop_loss = signal["stop_loss"]
        take_profit = signal["take_profit"]
        created_at_str = signal["created_at"]

        # 解析创建时间
        try:
            created_dt = datetime.fromisoformat(created_at_str)
        except ValueError:
            created_dt = datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S")

        since_ms = int(created_dt.timestamp() * 1000)

        # 获取信号创建后的K线数据
        kline_data = client.fetch_ohlcv(symbol, timeframe, since=since_ms, limit=100)
        if not kline_data or len(kline_data) < 2:
            logger.warning(f"信号 {signal_id} 无法获取后续K线")
            return

        kline = md.parse_ohlcv(kline_data, symbol, timeframe)

        # 第一根K线可能是创建时间所在的那根，跳过它（因为信号是在这根K线结束后产生的）
        # 找到第一根 timestamp > since_ms 的K线索引
        start_idx = 0
        for i in range(len(kline.timestamps)):
            if kline.timestamps[i] > since_ms:
                start_idx = i
                break

        if start_idx >= len(kline.high):
            logger.warning(f"信号 {signal_id} 没有足够后续K线")
            return

        # 截取信号产生后的K线
        highs = kline.high[start_idx:]
        lows = kline.low[start_idx:]
        closes = kline.close[start_idx:]
        bars_elapsed = len(highs)

        if bars_elapsed == 0:
            return

        # 计算各项指标
        if direction == "long":
            max_price = float(max(highs))
            min_price = float(min(lows))
            current_price = float(closes[-1])

            max_profit_pct = (max_price - entry_price) / entry_price * 100 if entry_price > 0 else 0.0
            max_loss_pct = (min_price - entry_price) / entry_price * 100 if entry_price > 0 else 0.0
            final_return_pct = (current_price - entry_price) / entry_price * 100 if entry_price > 0 else 0.0

            hit_tp = max_price >= take_profit
            hit_sl = min_price <= stop_loss
        else:  # short
            max_price = float(max(highs))
            min_price = float(min(lows))
            current_price = float(closes[-1])

            max_profit_pct = (entry_price - min_price) / entry_price * 100 if entry_price > 0 else 0.0
            max_loss_pct = (entry_price - max_price) / entry_price * 100 if entry_price > 0 else 0.0
            final_return_pct = (entry_price - current_price) / entry_price * 100 if entry_price > 0 else 0.0

            hit_tp = min_price <= take_profit
            hit_sl = max_price >= stop_loss

        # 判断 outcome
        if hit_tp:
            outcome = "hit_tp"
        elif hit_sl:
            outcome = "hit_sl"
        elif bars_elapsed >= 20:
            outcome = "timeout"
        else:
            outcome = "ongoing"

        # 如果还是 ongoing，暂不更新为已验证（保持 verified=0）
        if outcome == "ongoing":
            return

        update_signal_outcome(
            signal_id=signal_id,
            outcome=outcome,
            max_profit_pct=round(max_profit_pct, 4),
            max_loss_pct=round(max_loss_pct, 4),
            final_return_pct=round(final_return_pct, 4),
            bars_elapsed=bars_elapsed,
        )
        logger.info(f"信号 {signal_id} 验证完成: {outcome}, 收益={final_return_pct:.2f}%, bars={bars_elapsed}")

    def get_stats(
        self,
        symbol: Optional[str] = None,
        timeframe: Optional[str] = None,
        strategy: Optional[str] = None,
        days: int = 30,
    ) -> Dict[str, Any]:
        """获取信号统计信息

        Returns:
            统计字典
        """
        return get_signal_stats(
            symbol=symbol,
            timeframe=timeframe,
            strategy=strategy,
            days=days,
        )
