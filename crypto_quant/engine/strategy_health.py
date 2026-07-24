"""
策略健康度诊断模块

功能：
1. 权益曲线 RSI - 策略是否"超买"（连续盈利后容易亏损）
2. 收益衰变检测 - 策略是否在老化/失效
3. 回撤恢复分析 - 回撤恢复时间是否在变长
4. 策略疲劳检测 - 连续交易后的胜率变化
5. 市场环境适配度 - 策略在当前市场状态下是否还适用
6. 综合健康评分
"""
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

import numpy as np

from ..utils.logger import logger
from ..utils.helpers import calc_rsi, calc_sharpe_ratio


class HealthGrade(str, Enum):
    """健康度等级"""
    EXCELLENT = "excellent"
    GOOD = "good"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class HealthDiagnosis:
    """策略健康度诊断结果"""
    overall_score: float  # 0~100
    grade: HealthGrade
    equity_rsi: Optional[float] = None
    decay_rate: float = 0.0
    decay_status: str = "stable"
    recovery_speed_trend: str = "stable"
    fatigue_level: float = 0.0
    regime_adaptability: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)


class StrategyHealthAnalyzer:
    """策略健康度诊断器

    诊断策略是否还在"健康"状态：
    - 权益曲线 RSI > 70：策略"超买"，连赢之后容易回撤
    - 收益衰变率：最近交易 vs 早期交易的收益下降速度
    - 回撤恢复趋势：恢复时间是否在变长
    - 策略疲劳：连续交易后胜率是否下降
    """

    def __init__(self, lookback: int = 50):
        """
        Args:
            lookback: 回看窗口（交易笔数）
        """
        self.lookback = lookback

    def analyze(
        self,
        equity_curve: List[float],
        trades: Optional[List[Any]] = None,
        market_regime: Optional[str] = None,
        strategy_win_rates_by_regime: Optional[Dict[str, float]] = None,
    ) -> HealthDiagnosis:
        """执行策略健康度诊断

        Args:
            equity_curve: 权益曲线
            trades: 交易列表
            market_regime: 当前市场状态
            strategy_win_rates_by_regime: 策略在不同市场状态下的胜率
        """
        scores = {}
        details = {}
        recommendations = []

        # 1. 权益曲线 RSI
        eq_rsi, eq_score = self._analyze_equity_rsi(equity_curve)
        scores["equity_rsi"] = eq_score
        details["equity_rsi"] = eq_rsi

        # 2. 收益衰变检测
        decay_rate, decay_score, decay_status = self._analyze_decay(trades or [], equity_curve)
        scores["decay"] = decay_score
        details["decay_rate"] = decay_rate
        details["decay_status"] = decay_status

        # 3. 回撤恢复趋势
        recovery_trend, recovery_score = self._analyze_recovery_trend(equity_curve)
        scores["recovery"] = recovery_score
        details["recovery_trend"] = recovery_trend

        # 4. 策略疲劳
        fatigue, fatigue_score = self._analyze_fatigue(trades or [])
        scores["fatigue"] = fatigue_score
        details["fatigue_level"] = fatigue

        # 5. 波动率趋势
        vol_trend, vol_score = self._analyze_volatility_trend(equity_curve)
        scores["volatility"] = vol_score
        details["volatility_trend"] = vol_trend

        # 6. 市场适配度
        adapt_score = self._analyze_regime_adaptability(
            market_regime, strategy_win_rates_by_regime
        )
        scores["adaptability"] = adapt_score
        details["regime_adaptability"] = adapt_score

        # 综合评分
        weights = {
            "equity_rsi": 0.2,
            "decay": 0.25,
            "recovery": 0.15,
            "fatigue": 0.15,
            "volatility": 0.1,
            "adaptability": 0.15,
        }
        overall = sum(scores[k] * weights[k] for k in weights)

        # 确定等级
        if overall >= 80:
            grade = HealthGrade.EXCELLENT
        elif overall >= 60:
            grade = HealthGrade.GOOD
        elif overall >= 40:
            grade = HealthGrade.WARNING
        else:
            grade = HealthGrade.CRITICAL

        # 生成建议
        recommendations = self._generate_recommendations(
            eq_rsi, decay_status, recovery_trend, fatigue, overall
        )

        return HealthDiagnosis(
            overall_score=round(overall, 1),
            grade=grade,
            equity_rsi=eq_rsi,
            decay_rate=decay_rate,
            decay_status=decay_status,
            recovery_speed_trend=recovery_trend,
            fatigue_level=fatigue,
            regime_adaptability=adapt_score,
            details=details,
            recommendations=recommendations,
        )

    def _analyze_equity_rsi(self, equity_curve: List[float]) -> Tuple[Optional[float], float]:
        """分析权益曲线 RSI

        RSI > 70: 策略"超买"，连赢之后注意风险
        RSI < 30: 策略"超卖"，可能即将反弹
        RSI 40~60: 健康区间
        """
        if len(equity_curve) < 20:
            return None, 70.0

        returns = []
        for i in range(1, len(equity_curve)):
            if equity_curve[i - 1] > 0:
                returns.append((equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1])

        if len(returns) < 14:
            return None, 70.0

        rsi_values = calc_rsi(returns, 14)
        if rsi_values is None or len(rsi_values) == 0:
            return None, 70.0

        current_rsi = float(rsi_values[-1])
        if np.isnan(current_rsi) or np.isinf(current_rsi):
            return None, 70.0

        # 评分：RSI在40~60最健康
        if 40 <= current_rsi <= 60:
            score = 100
        elif 30 <= current_rsi < 40:
            score = 80
        elif 60 < current_rsi <= 70:
            score = 75
        elif 20 <= current_rsi < 30:
            score = 60
        elif 70 < current_rsi <= 80:
            score = 50
        elif current_rsi > 80:
            score = 25
        else:
            score = 40

        return round(current_rsi, 2), score

    def _analyze_decay(
        self, trades: List[Any], equity_curve: List[float]
    ) -> Tuple[float, float, str]:
        """检测收益衰变

        比较前半段 vs 后半段的收益表现
        衰变率 = (后半段日均收益 - 前半段日均收益) / 前半段日均收益
        """
        if len(equity_curve) < 50:
            return 0.0, 70.0, "insufficient_data"

        n = len(equity_curve)
        mid = n // 2

        first_half = equity_curve[:mid]
        second_half = equity_curve[mid:]

        first_return = (first_half[-1] - first_half[0]) / first_half[0] if first_half[0] > 0 else 0
        second_return = (second_half[-1] - second_half[0]) / second_half[0] if second_half[0] > 0 else 0

        # 也可以用交易数据
        if trades and len(trades) >= 10:
            trade_pnls = []
            for t in trades:
                if isinstance(t, dict):
                    trade_pnls.append(t.get("pnl_percent", 0))
                else:
                    trade_pnls.append(getattr(t, "pnl_percent", 0))

            tmid = len(trade_pnls) // 2
            first_avg = np.mean(trade_pnls[:tmid]) if tmid > 0 else 0
            second_avg = np.mean(trade_pnls[tmid:]) if tmid > 0 else 0

            if abs(first_avg) > 0.01:
                decay_rate = (second_avg - first_avg) / abs(first_avg)
            else:
                decay_rate = 0.0
        else:
            if abs(first_return) > 0.001:
                decay_rate = (second_return - first_return) / abs(first_return)
            else:
                decay_rate = 0.0

        # 评分
        if decay_rate > 0:
            status = "improving"
            score = min(100, 80 + decay_rate * 20)
        elif decay_rate > -0.2:
            status = "stable"
            score = 70
        elif decay_rate > -0.5:
            status = "decaying"
            score = 45
        else:
            status = "failing"
            score = 15

        return round(decay_rate, 4), score, status

    def _analyze_recovery_trend(self, equity_curve: List[float]) -> Tuple[str, float]:
        """分析回撤恢复速度趋势

        比较早期回撤和近期回撤的恢复时间
        恢复时间变长 = 策略在老化
        """
        if len(equity_curve) < 50:
            return "insufficient_data", 70.0

        peak = equity_curve[0]
        drawdowns = []
        in_dd = False
        dd_start = 0

        for i, eq in enumerate(equity_curve):
            if eq >= peak:
                if in_dd:
                    recovery_time = i - dd_start
                    drawdowns.append(recovery_time)
                    in_dd = False
                peak = eq
            else:
                if not in_dd:
                    dd_start = i
                    in_dd = True

        if len(drawdowns) < 3:
            return "insufficient_data", 70.0

        mid = len(drawdowns) // 2
        early_avg = np.mean(drawdowns[:mid])
        recent_avg = np.mean(drawdowns[mid:])

        if early_avg == 0:
            return "stable", 70.0

        ratio = recent_avg / early_avg

        if ratio < 0.8:
            trend = "improving"
            score = 90
        elif ratio < 1.2:
            trend = "stable"
            score = 75
        elif ratio < 1.5:
            trend = "slowing"
            score = 50
        elif ratio < 2.0:
            trend = "deteriorating"
            score = 30
        else:
            trend = "critical"
            score = 10

        return trend, score

    def _analyze_fatigue(self, trades: List[Any]) -> Tuple[float, float]:
        """分析策略疲劳度

        连续交易后胜率是否下降
        fatigue_level: 0~1，越高越疲劳
        """
        if len(trades) < 10:
            return 0.0, 70.0

        pnl_list = []
        for t in trades:
            if isinstance(t, dict):
                pnl_list.append(t.get("pnl", 0))
            else:
                pnl_list.append(getattr(t, "pnl", 0))

        # 窗口胜率趋势
        window_size = max(5, len(pnl_list) // 5)
        win_rates = []
        for i in range(0, len(pnl_list) - window_size + 1, window_size):
            window = pnl_list[i:i + window_size]
            wins = sum(1 for p in window if p > 0)
            win_rates.append(wins / len(window))

        if len(win_rates) < 2:
            return 0.0, 70.0

        # 胜率趋势
        early_wr = np.mean(win_rates[:len(win_rates) // 2])
        recent_wr = np.mean(win_rates[len(win_rates) // 2:])

        fatigue = max(0, early_wr - recent_wr)

        if fatigue < 0.05:
            score = 90
        elif fatigue < 0.1:
            score = 75
        elif fatigue < 0.2:
            score = 55
        elif fatigue < 0.3:
            score = 35
        else:
            score = 15

        return round(fatigue, 4), score

    def _analyze_volatility_trend(self, equity_curve: List[float]) -> Tuple[str, float]:
        """分析收益波动率趋势"""
        if len(equity_curve) < 50:
            return "stable", 70.0

        returns = []
        for i in range(1, len(equity_curve)):
            if equity_curve[i - 1] > 0:
                returns.append((equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1])

        if len(returns) < 20:
            return "stable", 70.0

        mid = len(returns) // 2
        early_vol = np.std(returns[:mid])
        recent_vol = np.std(returns[mid:])

        if early_vol == 0:
            return "stable", 70.0

        ratio = recent_vol / early_vol

        if ratio < 0.8:
            trend = "calming"
            score = 85
        elif ratio < 1.2:
            trend = "stable"
            score = 80
        elif ratio < 1.5:
            trend = "increasing"
            score = 55
        else:
            trend = "volatile"
            score = 30

        return trend, score

    def _analyze_regime_adaptability(
        self,
        market_regime: Optional[str],
        win_rates_by_regime: Optional[Dict[str, float]],
    ) -> float:
        """分析策略在当前市场状态下的适配度"""
        if not market_regime or not win_rates_by_regime:
            return 60.0

        current_wr = win_rates_by_regime.get(market_regime)
        if current_wr is None:
            return 50.0

        avg_wr = np.mean(list(win_rates_by_regime.values()))

        if current_wr >= avg_wr * 1.2:
            return 90.0
        elif current_wr >= avg_wr:
            return 75.0
        elif current_wr >= avg_wr * 0.8:
            return 55.0
        else:
            return 25.0

    def _generate_recommendations(
        self,
        rsi: Optional[float],
        decay_status: str,
        recovery_trend: str,
        fatigue: float,
        overall: float,
    ) -> List[str]:
        """生成策略调整建议"""
        recs = []

        if rsi is not None:
            if rsi > 70:
                recs.append("权益曲线RSI>70，策略处于'超买'状态，建议减少仓位或暂停交易，等待回撤后恢复")
            elif rsi < 30:
                recs.append("权益曲线RSI<30，策略处于'超卖'状态，当前可能处于低谷期，但不要轻易放弃")

        if decay_status == "failing":
            recs.append("收益衰变严重！后半段收益远低于前半段，策略可能已失效，建议重新评估或更换策略")
        elif decay_status == "decaying":
            recs.append("收益衰变明显，策略效果在下降，建议缩小仓位并密切监控")

        if recovery_trend == "deteriorating":
            recs.append("回撤恢复时间明显变长，策略在老化，建议降低风险敞口")
        elif recovery_trend == "critical":
            recs.append("回撤恢复极慢！可能面临资金曲线长期横盘，建议暂停策略寻找原因")

        if fatigue > 0.2:
            recs.append(f"策略疲劳度高({fatigue:.0%})，连续交易后胜率显著下降，建议降低交易频率")

        if overall < 40:
            recs.append("综合健康度低于40，建议暂停该策略，进行全面检查后再决定是否恢复")

        if not recs:
            recs.append("策略运行状态良好，继续按照既定规则执行")

        return recs
