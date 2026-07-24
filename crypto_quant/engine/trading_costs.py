"""
真实交易成本模型

功能：
1. 资金费率（Funding Rate）模拟 - 合约持仓的隐性成本
2. Maker/Taker 手续费区分 - 突破策略用taker，网格策略用maker
3. 跳空风险模拟 - 止损可能无法按预期价格成交
4. 冲击成本估算 - 大单对市场的价格冲击
5. 综合成本分析 - 量化所有隐性成本对策略的影响
"""
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

import numpy as np

from ..utils.logger import logger


class FeeTier(str, Enum):
    """交易所手续费等级"""
    REGULAR = "regular"
    VIP1 = "vip1"
    VIP2 = "vip2"
    VIP3 = "vip3"
    VIP4 = "vip4"
    VIP5 = "vip5"


# 各交易所手续费率表
FEE_SCHEDULES: Dict[str, Dict[FeeTier, Dict[str, float]]] = {
    "binance": {
        FeeTier.REGULAR: {"maker": 0.0002, "taker": 0.0005},
        FeeTier.VIP1: {"maker": 0.0002, "taker": 0.0004},
        FeeTier.VIP2: {"maker": 0.0001, "taker": 0.0004},
        FeeTier.VIP3: {"maker": 0.0001, "taker": 0.0003},
        FeeTier.VIP4: {"maker": 0.0, "taker": 0.0003},
        FeeTier.VIP5: {"maker": 0.0, "taker": 0.0002},
    },
    "okx": {
        FeeTier.REGULAR: {"maker": 0.0002, "taker": 0.0005},
        FeeTier.VIP1: {"maker": 0.0002, "taker": 0.0004},
        FeeTier.VIP2: {"maker": 0.0, "taker": 0.0003},
        FeeTier.VIP3: {"maker": 0.0, "taker": 0.0002},
        FeeTier.VIP4: {"maker": -0.0001, "taker": 0.0002},
        FeeTier.VIP5: {"maker": -0.0001, "taker": 0.0001},
    },
    "bybit": {
        FeeTier.REGULAR: {"maker": 0.0002, "taker": 0.0005},
        FeeTier.VIP1: {"maker": 0.0001, "taker": 0.0004},
        FeeTier.VIP2: {"maker": 0.0, "taker": 0.0003},
        FeeTier.VIP3: {"maker": -0.0001, "taker": 0.0002},
        FeeTier.VIP4: {"maker": -0.0001, "taker": 0.0002},
        FeeTier.VIP5: {"maker": -0.0002, "taker": 0.0001},
    },
}


class OrderExecutionType(str, Enum):
    """订单执行类型"""
    MAKER = "maker"  # 挂单成交（限价单）
    TAKER = "taker"  # 吃单成交（市价单）
    MIXED = "mixed"  # 混合（部分挂单部分吃单）


@dataclass
class FundingRateSimulator:
    """资金费率模拟器

    合约交易中，持仓需要支付/收取资金费率：
    - 正费率：多头付空头（看多的人多，做多要付钱）
    - 负费率：空头付多头（看空的人多，做空要付钱）
    - 每8小时结算一次

    趋势策略通常持仓时间长，资金费率累积可能吃掉大量利润
    """

    # 历史平均资金费率（BTC/USDT）
    avg_funding_rates: Dict[str, float] = field(default_factory=lambda: {
        "BTC/USDT": 0.0001,   # 0.01% per 8h
        "ETH/USDT": 0.0001,
        "SOL/USDT": 0.00015,
        "default": 0.0001,
    })

    # 当前资金费率（可以从API获取实时数据）
    current_rate: Optional[float] = None

    def calc_funding_cost(
        self,
        position_value: float,
        side: str,
        holding_bars: int,
        bars_per_funding: int = 24,  # 8小时=24根1h K线
        symbol: str = "BTC/USDT",
    ) -> float:
        """计算持仓期间的累积资金费率成本

        Args:
            position_value: 持仓名义价值
            side: 持仓方向 (long/short)
            holding_bars: 持仓K线数
            bars_per_funding: 多少根K线结算一次
            symbol: 交易对

        Returns:
            累积资金费率成本（正数=支出，负数=收入）
        """
        rate = self.current_rate or self.avg_funding_rates.get(
            symbol, self.avg_funding_rates["default"]
        )

        funding_count = holding_bars // bars_per_funding
        if funding_count == 0:
            return 0.0

        total_rate = rate * funding_count

        # 正费率：多头付，空头收
        # 负费率：空头付，多头收
        if side == "long":
            cost = position_value * total_rate
        else:
            cost = -position_value * total_rate

        return cost

    def estimate_annual_funding_impact(
        self,
        position_value: float,
        side: str,
        avg_holding_hours: float = 48,
        trades_per_year: int = 100,
        symbol: str = "BTC/USDT",
    ) -> Dict[str, float]:
        """估算年度资金费率影响

        Args:
            position_value: 平均持仓名义价值
            side: 通常持仓方向
            avg_holding_hours: 平均持仓时长(小时)
            trades_per_year: 年交易次数
            symbol: 交易对

        Returns:
            年度资金费率影响分析
        """
        rate = self.current_rate or self.avg_funding_rates.get(
            symbol, self.avg_funding_rates["default"]
        )

        funding_per_trade = avg_holding_hours / 8  # 每笔交易经历几次结算
        cost_per_trade = position_value * rate * funding_per_trade
        if side == "short":
            cost_per_trade = -cost_per_trade

        annual_cost = cost_per_trade * trades_per_year
        annual_pct = annual_cost / position_value * 100 if position_value > 0 else 0

        return {
            "funding_rate_per_8h": rate,
            "cost_per_trade": round(cost_per_trade, 2),
            "annual_cost": round(annual_cost, 2),
            "annual_pct": round(annual_pct, 2),
            "direction": "支出" if cost_per_trade > 0 else "收入",
        }


@dataclass
class GapRiskResult:
    """跳空风险分析结果"""
    gap_count: int
    gap_triggered_stops: int
    avg_slippage_on_stop: float
    worst_slippage: float
    total_extra_loss: float
    gap_distribution: Dict[str, int] = field(default_factory=dict)


class GapRiskSimulator:
    """跳空风险模拟器

    真实行情中，价格会跳空：
    - 重要数据发布时价格直接跳过止损位
    - 你的64500止损，实际可能在63000才成交
    - 跳空滑点 = 实际成交价 - 止损价的差额
    """

    def __init__(
        self,
        gap_probability: float = 0.05,
        max_gap_pct: float = 0.03,
    ):
        """
        Args:
            gap_probability: 每根K线发生跳空的概率
            max_gap_pct: 最大跳空幅度（百分比）
        """
        self.gap_probability = gap_probability
        self.max_gap_pct = max_gap_pct

    def simulate_gap_risk(
        self,
        trades: List[Dict[str, Any]],
        num_simulations: int = 100,
    ) -> GapRiskResult:
        """模拟跳空风险对止损的影响

        Args:
            trades: 交易列表（需要包含 entry_price, exit_price, stop_loss 等信息）
            num_simulations: 模拟次数
        """
        all_gap_counts = []
        all_stop_gaps = []
        all_slippages = []
        all_extra_loss = []

        for _ in range(num_simulations):
            gap_count = 0
            stop_gaps = 0
            slippages = []
            extra_loss = 0.0

            for t in trades:
                if np.random.random() > self.gap_probability:
                    continue

                gap_count += 1
                gap_pct = np.random.exponential(self.max_gap_pct * 0.3)
                gap_pct = min(gap_pct, self.max_gap_pct)

                stop_loss = t.get("stop_loss", 0)
                side = t.get("side", "long")
                entry_price = t.get("entry_price", 0)

                if stop_loss > 0 and entry_price > 0:
                    if side == "long":
                        actual_exit = stop_loss * (1 - gap_pct)
                        slippage = (stop_loss - actual_exit) / stop_loss * 100
                    else:
                        actual_exit = stop_loss * (1 + gap_pct)
                        slippage = (actual_exit - stop_loss) / stop_loss * 100

                    if slippage > 0.1:
                        stop_gaps += 1
                        slippages.append(slippage)
                        size = t.get("size", 1)
                        extra_loss += abs(actual_exit - stop_loss) * size

            all_gap_counts.append(gap_count)
            all_stop_gaps.append(stop_gaps)
            all_slippages.extend(slippages)
            all_extra_loss.append(extra_loss)

        gap_dist = {}
        for s in all_slippages:
            bucket = f"{int(s)}%-{int(s)+1}%"
            gap_dist[bucket] = gap_dist.get(bucket, 0) + 1

        return GapRiskResult(
            gap_count=int(np.mean(all_gap_counts)),
            gap_triggered_stops=int(np.mean(all_stop_gaps)),
            avg_slippage_on_stop=round(np.mean(all_slippages), 2) if all_slippages else 0,
            worst_slippage=round(max(all_slippages), 2) if all_slippages else 0,
            total_extra_loss=round(np.mean(all_extra_loss), 2),
            gap_distribution=gap_dist,
        )


class ImpactCostEstimator:
    """冲击成本估算器

    大额交易会对市场价格产生冲击：
    - 小资金（<1万U）：影响可忽略
    - 中等资金（1-10万U）：小币种有影响
    - 大资金（>10万U）：即使是BTC也有显著影响
    """

    DEFAULT_DEPTH: Dict[str, float] = {
        "BTC/USDT": 5_000_000,
        "ETH/USDT": 2_000_000,
        "SOL/USDT": 500_000,
        "DOGE/USDT": 200_000,
        "default": 100_000,
    }

    def __init__(self, depth_data: Optional[Dict[str, float]] = None):
        self.depth = depth_data or self.DEFAULT_DEPTH

    def estimate_impact(
        self,
        order_value: float,
        symbol: str = "BTC/USDT",
        order_pct_of_depth: Optional[float] = None,
    ) -> Dict[str, Any]:
        """估算冲击成本

        Args:
            order_value: 订单金额(USDT)
            symbol: 交易对
            order_pct_of_depth: 订单占深度的百分比（如果不提供则自动计算）

        Returns:
            冲击成本分析结果
        """
        depth = self.depth.get(symbol, self.depth["default"])

        if order_pct_of_depth is None:
            order_pct_of_depth = order_value / depth

        # 冲击成本模型：impact = k * sqrt(order_pct_of_depth)
        # k是市场冲击系数，通常在0.1~0.5之间
        k = 0.3
        impact_pct = k * np.sqrt(order_pct_of_depth)

        # 不同资金规模的冲击成本
        capital_levels = [1000, 5000, 10000, 50000, 100000, 500000, 1000000]
        impact_by_capital = {}
        for cap in capital_levels:
            pct = cap / depth
            imp = k * np.sqrt(pct) * 100
            impact_by_capital[str(cap)] = round(imp, 4)

        return {
            "order_value": order_value,
            "symbol": symbol,
            "order_pct_of_depth": round(order_pct_of_depth * 100, 4),
            "estimated_impact_pct": round(impact_pct * 100, 4),
            "estimated_impact_usdt": round(order_value * impact_pct, 2),
            "depth_usd": depth,
            "impact_by_capital": impact_by_capital,
        }


@dataclass
class CostAnalysisResult:
    """综合成本分析结果"""
    total_commission: float
    total_funding: float
    total_slippage: float
    total_impact: float
    total_gap_risk: float
    total_all_costs: float
    cost_breakdown_pct: Dict[str, float]
    net_return_after_costs: float
    cost_ratio: float  # 总成本 / 毛收益


class TradingCostAnalyzer:
    """综合交易成本分析器

    把所有隐性成本汇总分析：
    - 手续费（Maker/Taker区分）
    - 资金费率
    - 滑点
    - 冲击成本
    - 跳空风险
    """

    def __init__(
        self,
        exchange: str = "binance",
        fee_tier: FeeTier = FeeTier.REGULAR,
        execution_type: OrderExecutionType = OrderExecutionType.TAKER,
    ):
        self.exchange = exchange
        self.fee_tier = fee_tier
        self.execution_type = execution_type
        self.funding_sim = FundingRateSimulator()
        self.gap_sim = GapRiskSimulator()
        self.impact_est = ImpactCostEstimator()

    def get_fee_rate(self) -> Tuple[float, float]:
        """获取当前手续费率"""
        schedule = FEE_SCHEDULES.get(self.exchange, FEE_SCHEDULES["binance"])
        tier_rates = schedule.get(self.fee_tier, schedule[FeeTier.REGULAR])
        return tier_rates["maker"], tier_rates["taker"]

    def analyze_full_cost(
        self,
        trades: List[Dict[str, Any]],
        equity_curve: List[float],
        initial_capital: float,
        symbol: str = "BTC/USDT",
        timeframe: str = "1h",
    ) -> CostAnalysisResult:
        """综合分析所有交易成本

        Args:
            trades: 交易列表
            equity_curve: 权益曲线
            initial_capital: 初始资金
            symbol: 交易对
            timeframe: 时间周期
        """
        maker_rate, taker_rate = self.get_fee_rate()

        # 手续费
        total_commission = 0.0
        for t in trades:
            entry_price = t.get("entry_price", 0)
            exit_price = t.get("exit_price", 0)
            size = t.get("size", 0)

            if self.execution_type == OrderExecutionType.MAKER:
                fee = (entry_price * size * maker_rate) + (exit_price * size * maker_rate)
            elif self.execution_type == OrderExecutionType.TAKER:
                fee = (entry_price * size * taker_rate) + (exit_price * size * taker_rate)
            else:
                entry_fee = entry_price * size * taker_rate
                exit_fee = exit_price * size * maker_rate
                fee = entry_fee + exit_fee

            total_commission += fee

        # 资金费率
        total_funding = 0.0
        bars_per_funding = {"1m": 480, "5m": 96, "15m": 32, "1h": 8, "4h": 2, "1d": 0.33}
        bpf = bars_per_funding.get(timeframe, 8)

        for t in trades:
            side = t.get("side", "long")
            entry_price = t.get("entry_price", 0)
            size = t.get("size", 0)
            entry_time = t.get("entry_time", 0)
            exit_time = t.get("exit_time", 0)

            holding_bars = 0
            if exit_time and entry_time and isinstance(exit_time, (int, float)) and isinstance(entry_time, (int, float)):
                holding_bars = int((exit_time - entry_time) / (60 * 60)) if timeframe == "1h" else 10
            else:
                holding_bars = 10

            position_value = entry_price * size
            funding_cost = self.funding_sim.calc_funding_cost(
                position_value=position_value,
                side=side,
                holding_bars=holding_bars,
                bars_per_funding=bpf,
                symbol=symbol,
            )
            total_funding += funding_cost

        # 滑点
        total_slippage = sum(t.get("slippage_cost", 0) for t in trades)

        # 冲击成本（基于平均订单大小）
        avg_order_value = initial_capital * 0.5 if trades else 0
        impact_info = self.impact_est.estimate_impact(avg_order_value, symbol)
        total_impact = impact_info["estimated_impact_usdt"] * len(trades)

        # 跳空风险
        gap_result = self.gap_sim.simulate_gap_risk(trades)
        total_gap_risk = gap_result.total_extra_loss

        # 汇总
        total_all = total_commission + abs(total_funding) + total_slippage + total_impact + total_gap_risk

        # 毛收益
        gross_return = (equity_curve[-1] - equity_curve[0]) if equity_curve else 0
        net_return = gross_return - total_all

        # 成本占比
        if total_all > 0:
            breakdown = {
                "commission": round(total_commission / total_all * 100, 1),
                "funding": round(abs(total_funding) / total_all * 100, 1),
                "slippage": round(total_slippage / total_all * 100, 1),
                "impact": round(total_impact / total_all * 100, 1),
                "gap_risk": round(total_gap_risk / total_all * 100, 1),
            }
        else:
            breakdown = {"commission": 0, "funding": 0, "slippage": 0, "impact": 0, "gap_risk": 0}

        # 成本/收益比
        cost_ratio = total_all / abs(gross_return) if gross_return != 0 else 0

        return CostAnalysisResult(
            total_commission=round(total_commission, 2),
            total_funding=round(total_funding, 2),
            total_slippage=round(total_slippage, 2),
            total_impact=round(total_impact, 2),
            total_gap_risk=round(total_gap_risk, 2),
            total_all_costs=round(total_all, 2),
            cost_breakdown_pct=breakdown,
            net_return_after_costs=round(net_return, 2),
            cost_ratio=round(cost_ratio, 4),
        )
