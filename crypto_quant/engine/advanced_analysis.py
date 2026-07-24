"""
高级量化分析模块

功能：
1. Walk Forward Analysis（滚动前进分析）- 检验过拟合
2. 参数敏感性分析 - 参数热力图 + 稳健性检测
3. 多策略组合优化 - 相关性矩阵 + 最优资金分配
4. 蒙特卡洛模拟 - 最坏情况压力测试
5. Kelly公式仓位管理
"""
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from itertools import product
import copy

import numpy as np

from ..data.market_data import KlineData
from ..strategies.base import BaseStrategy
from ..strategies import get_strategy
from .backtest import BacktestEngine, BacktestResult
from ..utils.logger import logger


# ===================== Walk Forward Analysis =====================

@dataclass
class WFAResult:
    """Walk Forward 分析结果"""
    in_sample_results: List[Dict[str, Any]] = field(default_factory=list)
    out_of_sample_results: List[Dict[str, Any]] = field(default_factory=list)
    optimized_params: List[Dict[str, Any]] = field(default_factory=list)
    combined_oos_equity: List[float] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class WalkForwardAnalyzer:
    """滚动前进分析器

    原理：
    - 将数据分成 N 段，每段 = 训练窗口 + 测试窗口
    - 训练窗口内优化参数 → 测试窗口内用最优参数跑样本外
    - 滚动窗口，重复多次
    - 看样本外表现是否稳定
    """

    def __init__(
        self,
        kline: KlineData,
        strategy_name: str,
        param_grid: Dict[str, List[Any]],
        train_ratio: float = 0.75,
        num_windows: int = 5,
        optimize_metric: str = "sharpe_ratio",
        base_config: Optional[Dict[str, Any]] = None,
    ):
        self.kline = kline
        self.strategy_name = strategy_name
        self.param_grid = param_grid
        self.train_ratio = train_ratio
        self.num_windows = num_windows
        self.optimize_metric = optimize_metric
        self.base_config = base_config or {}

    def run(self) -> WFAResult:
        """执行 Walk Forward Analysis"""
        n = self.kline.length
        total_bars = n
        window_size = total_bars // (self.num_windows + 1)
        train_size = int(window_size * self.train_ratio)
        test_size = window_size - train_size

        logger.info(
            f"WFA开始: {self.num_windows}个窗口, "
            f"训练:{train_size}根, 测试:{test_size}根"
        )

        result = WFAResult()
        all_oos_returns = []
        all_is_returns = []

        for w in range(self.num_windows):
            start_idx = w * test_size
            train_end = start_idx + train_size
            test_end = train_end + test_size

            if test_end > n:
                break

            train_kline = self._slice_kline(start_idx, train_end)
            test_kline = self._slice_kline(train_end, test_end)

            logger.info(f"窗口 {w+1}/{self.num_windows}: 训练[{start_idx}:{train_end}], 测试[{train_end}:{test_end}]")

            best_params, best_is_result = self._optimize_params(train_kline)

            test_strategy = get_strategy(self.strategy_name, best_params)
            test_engine = BacktestEngine(
                kline=test_kline,
                strategy=test_strategy,
                initial_capital=self.base_config.get("initial_capital", 10000),
                commission_rate=self.base_config.get("commission_rate", 0.0004),
                slippage_rate=self.base_config.get("slippage_rate", 0.0002),
                leverage=self.base_config.get("leverage", 1),
                signal_lag=self.base_config.get("signal_lag", 1),
                slippage_model=self.base_config.get("slippage_model", "volatility_based"),
                atr_period=self.base_config.get("atr_period", 14),
                trailing_stop_atr=self.base_config.get("trailing_stop_atr", 0),
                time_stop_bars=self.base_config.get("time_stop_bars", 0),
                position_risk_pct=self.base_config.get("position_risk_pct", 0.02),
            )
            oos_result = test_engine.run()

            result.in_sample_results.append({
                "window": w,
                "return_pct": best_is_result.total_return_pct,
                "sharpe": best_is_result.sharpe_ratio,
                "win_rate": best_is_result.win_rate,
                "max_dd": best_is_result.max_drawdown_pct,
                "trades": best_is_result.total_trades,
            })
            result.out_of_sample_results.append({
                "window": w,
                "return_pct": oos_result.total_return_pct,
                "sharpe": oos_result.sharpe_ratio,
                "win_rate": oos_result.win_rate,
                "max_dd": oos_result.max_drawdown_pct,
                "trades": oos_result.total_trades,
            })
            result.optimized_params.append(best_params)

            all_is_returns.append(best_is_result.total_return_pct)
            all_oos_returns.append(oos_result.total_return_pct)

            if result.combined_oos_equity:
                last_eq = result.combined_oos_equity[-1]
                for eq in oos_result.equity_curve:
                    ratio = eq / oos_result.initial_capital
                    result.combined_oos_equity.append(last_eq * ratio)
            else:
                result.combined_oos_equity = list(oos_result.equity_curve)

        result.metrics = self._calc_wfa_metrics(all_is_returns, all_oos_returns, result)

        logger.info(
            f"WFA完成: 样本内平均收益 {np.mean(all_is_returns):.2f}%, "
            f"样本外平均收益 {np.mean(all_oos_returns):.2f}%, "
            f"稳定性 {result.metrics['stability_ratio']:.2f}"
        )

        return result

    def _optimize_params(self, train_kline: KlineData) -> Tuple[Dict[str, Any], BacktestResult]:
        """在训练集上优化参数"""
        param_names = list(self.param_grid.keys())
        param_values = list(self.param_grid.values())
        best_score = -float("inf")
        best_params = {}
        best_result = None

        for combo in product(*param_values):
            params = dict(zip(param_names, combo))
            strategy = get_strategy(self.strategy_name, params)
            engine = BacktestEngine(
                kline=train_kline,
                strategy=strategy,
                initial_capital=self.base_config.get("initial_capital", 10000),
                commission_rate=self.base_config.get("commission_rate", 0.0004),
                slippage_rate=self.base_config.get("slippage_rate", 0.0002),
                leverage=self.base_config.get("leverage", 1),
                signal_lag=self.base_config.get("signal_lag", 1),
                slippage_model=self.base_config.get("slippage_model", "volatility_based"),
                atr_period=self.base_config.get("atr_period", 14),
                trailing_stop_atr=self.base_config.get("trailing_stop_atr", 0),
                time_stop_bars=self.base_config.get("time_stop_bars", 0),
                position_risk_pct=self.base_config.get("position_risk_pct", 0.02),
            )
            result = engine.run()

            metric_value = getattr(result, self.optimize_metric, 0)
            if metric_value > best_score:
                best_score = metric_value
                best_params = params
                best_result = result

        return best_params, best_result

    def _slice_kline(self, start: int, end: int) -> KlineData:
        """切片K线数据"""
        return KlineData(
            symbol=self.kline.symbol,
            timeframe=self.kline.timeframe,
            timestamps=self.kline.timestamps[start:end],
            open=self.kline.open[start:end],
            high=self.kline.high[start:end],
            low=self.kline.low[start:end],
            close=self.kline.close[start:end],
            volume=self.kline.volume[start:end],
        )

    def _calc_wfa_metrics(
        self,
        is_returns: List[float],
        oos_returns: List[float],
        result: WFAResult,
    ) -> Dict[str, Any]:
        """计算WFA综合指标"""
        if not is_returns or not oos_returns:
            return {}

        avg_is = np.mean(is_returns)
        avg_oos = np.mean(oos_returns)
        stability_ratio = avg_oos / avg_is if avg_is != 0 else 0

        wins = sum(1 for oos in oos_returns if oos > 0)
        oos_win_rate = wins / len(oos_returns) if oos_returns else 0

        equity = result.combined_oos_equity
        total_return = (equity[-1] - equity[0]) / equity[0] * 100 if equity else 0

        returns = []
        for i in range(1, len(equity)):
            if equity[i - 1] > 0:
                returns.append((equity[i] - equity[i - 1]) / equity[i - 1])

        from ..utils.helpers import calc_sharpe_ratio, calc_max_drawdown
        sharpe = calc_sharpe_ratio(returns, periods=365 * 24) if returns else 0
        dd_info = calc_max_drawdown(equity)
        max_dd = abs(dd_info["max_drawdown"]) * 100

        oos_sharpes = [r["sharpe"] for r in result.out_of_sample_results]
        oos_winrates = [r["win_rate"] for r in result.out_of_sample_results]

        return {
            "avg_is_return": avg_is,
            "avg_oos_return": avg_oos,
            "stability_ratio": stability_ratio,
            "oos_win_rate": oos_win_rate,
            "combined_total_return": total_return,
            "combined_sharpe": sharpe,
            "combined_max_dd": max_dd,
            "oos_sharpe_std": float(np.std(oos_sharpes)) if oos_sharpes else 0,
            "oos_winrate_std": float(np.std(oos_winrates)) if oos_winrates else 0,
            "walk_forward_efficiency": avg_oos / abs(avg_is) * 100 if avg_is != 0 else 0,
        }


# ===================== 参数敏感性分析 =====================

@dataclass
class SensitivityResult:
    """参数敏感性分析结果"""
    param_grid: Dict[str, List[Any]]
    results: List[Dict[str, Any]] = field(default_factory=list)
    heatmap_data: Dict[str, Any] = field(default_factory=dict)
    robustness_score: float = 0.0
    plateau_ratio: float = 0.0


class ParameterSensitivityAnalyzer:
    """参数敏感性分析器

    检测策略对参数变化的稳健性：
    - 参数微调后收益是否暴跌？
    - 是否存在连续的"参数高原"？
    - 最优参数是不是孤立的尖峰？
    """

    def __init__(
        self,
        kline: KlineData,
        strategy_name: str,
        param_grid: Dict[str, List[Any]],
        base_config: Optional[Dict[str, Any]] = None,
    ):
        self.kline = kline
        self.strategy_name = strategy_name
        self.param_grid = param_grid
        self.base_config = base_config or {}

    def run(self) -> SensitivityResult:
        """执行参数敏感性分析"""
        param_names = list(self.param_grid.keys())
        param_values = list(self.param_grid.values())

        logger.info(f"参数敏感性分析: {len(list(product(*param_values)))}组参数组合")

        results = []
        for combo in product(*param_values):
            params = dict(zip(param_names, combo))
            strategy = get_strategy(self.strategy_name, params)
            engine = BacktestEngine(
                kline=self.kline,
                strategy=strategy,
                initial_capital=self.base_config.get("initial_capital", 10000),
                commission_rate=self.base_config.get("commission_rate", 0.0004),
                slippage_rate=self.base_config.get("slippage_rate", 0.0002),
                leverage=self.base_config.get("leverage", 1),
                signal_lag=self.base_config.get("signal_lag", 1),
                slippage_model=self.base_config.get("slippage_model", "volatility_based"),
                atr_period=self.base_config.get("atr_period", 14),
                trailing_stop_atr=self.base_config.get("trailing_stop_atr", 0),
                time_stop_bars=self.base_config.get("time_stop_bars", 0),
                position_risk_pct=self.base_config.get("position_risk_pct", 0.02),
            )
            result = engine.run()

            results.append({
                "params": params,
                "total_return": result.total_return_pct,
                "sharpe_ratio": result.sharpe_ratio,
                "win_rate": result.win_rate,
                "max_drawdown": result.max_drawdown_pct,
                "profit_factor": result.profit_factor,
                "total_trades": result.total_trades,
            })

        robustness_score = self._calc_robustness_score(results)
        plateau_ratio = self._calc_plateau_ratio(results)

        return SensitivityResult(
            param_grid=self.param_grid,
            results=results,
            heatmap_data=self._build_heatmap(results, param_names),
            robustness_score=robustness_score,
            plateau_ratio=plateau_ratio,
        )

    def _calc_robustness_score(self, results: List[Dict[str, Any]]) -> float:
        """计算稳健性分数

        分数越高 = 策略越稳健
        思路：盈利的参数组合占比 + 收益标准差的倒数
        """
        if not results:
            return 0.0

        returns = [r["total_return"] for r in results]
        positive_ratio = sum(1 for r in returns if r > 0) / len(returns)

        mean_ret = np.mean(returns)
        std_ret = np.std(returns)
        cv = std_ret / abs(mean_ret) if mean_ret != 0 else 999  # 变异系数

        stability = 1.0 / (1.0 + cv)  # 0~1 之间

        return round((positive_ratio * 0.6 + stability * 0.4), 4)

    def _calc_plateau_ratio(self, results: List[Dict[str, Any]]) -> float:
        """计算参数高原比例

        收益 >= 最优收益 50% 的参数组合占比
        比例越高 = 参数越不敏感 = 策略越稳健
        """
        if not results:
            return 0.0

        returns = [r["total_return"] for r in results]
        max_ret = max(returns)
        if max_ret <= 0:
            return 0.0

        threshold = max_ret * 0.5
        plateau_count = sum(1 for r in returns if r >= threshold)
        return round(plateau_count / len(returns), 4)

    def _build_heatmap(
        self, results: List[Dict[str, Any]], param_names: List[str],
    ) -> Dict[str, Any]:
        """构建热力图数据"""
        if len(param_names) == 0:
            return {}

        main_params = param_names[:2]
        values_x = sorted(set(r["params"][main_params[0]] for r in results))
        values_y = sorted(set(r["params"][main_params[1]] for r in results)) if len(main_params) > 1 else [0]

        matrix = []
        for y_val in values_y:
            row = []
            for x_val in values_x:
                match = [
                    r for r in results
                    if r["params"][main_params[0]] == x_val
                    and (len(main_params) < 2 or r["params"][main_params[1]] == y_val)
                ]
                row.append(match[0]["total_return"] if match else 0)
            matrix.append(row)

        return {
            "x_param": main_params[0],
            "y_param": main_params[1] if len(main_params) > 1 else None,
            "x_values": values_x,
            "y_values": values_y,
            "return_matrix": matrix,
        }


# ===================== 多策略组合优化 =====================

@dataclass
class PortfolioResult:
    """组合优化结果"""
    strategy_names: List[str]
    correlation_matrix: Dict[str, Dict[str, float]] = field(default_factory=dict)
    optimal_weights: Dict[str, float] = field(default_factory=dict)
    equal_weight_return: float = 0.0
    optimal_return: float = 0.0
    equal_weight_sharpe: float = 0.0
    optimal_sharpe: float = 0.0
    equal_weight_max_dd: float = 0.0
    optimal_max_dd: float = 0.0
    diversification_ratio: float = 0.0


class PortfolioOptimizer:
    """多策略组合优化器

    功能：
    - 计算策略间相关性矩阵
    - 均值方差优化（马科维茨）
    - 风险平价（Risk Parity）
    - 等权组合对比
    """

    def __init__(
        self,
        strategy_equity_curves: Dict[str, List[float]],
        risk_free_rate: float = 0.0,
    ):
        self.strategy_equity_curves = strategy_equity_curves
        self.risk_free_rate = risk_free_rate

    def run(self, method: str = "sharpe") -> PortfolioResult:
        """运行组合优化"""
        strategy_names = list(self.strategy_equity_curves.keys())
        returns_dict = {}

        for name, curve in self.strategy_equity_curves.items():
            rets = []
            for i in range(1, len(curve)):
                if curve[i - 1] > 0:
                    rets.append((curve[i] - curve[i - 1]) / curve[i - 1])
            returns_dict[name] = rets

        min_len = min(len(r) for r in returns_dict.values())
        aligned_returns = {}
        for name, rets in returns_dict.items():
            aligned_returns[name] = rets[-min_len:]

        corr_matrix = self._calc_correlation_matrix(aligned_returns)

        equal_weights = {name: 1.0 / len(strategy_names) for name in strategy_names}
        equal_portfolio = self._calc_portfolio_stats(aligned_returns, equal_weights)

        if method == "sharpe":
            opt_weights = self._max_sharpe_weights(aligned_returns)
        elif method == "risk_parity":
            opt_weights = self._risk_parity_weights(aligned_returns)
        else:
            opt_weights = equal_weights

        opt_portfolio = self._calc_portfolio_stats(aligned_returns, opt_weights)

        avg_corr = np.mean([
            corr_matrix[n1][n2]
            for n1 in strategy_names
            for n2 in strategy_names
            if n1 < n2
        ]) if len(strategy_names) > 1 else 0
        div_ratio = 1.0 / (1.0 + avg_corr) if avg_corr >= 0 else 1.0

        return PortfolioResult(
            strategy_names=strategy_names,
            correlation_matrix=corr_matrix,
            optimal_weights=opt_weights,
            equal_weight_return=equal_portfolio["return"] * 100,
            optimal_return=opt_portfolio["return"] * 100,
            equal_weight_sharpe=equal_portfolio["sharpe"],
            optimal_sharpe=opt_portfolio["sharpe"],
            equal_weight_max_dd=equal_portfolio["max_dd"] * 100,
            optimal_max_dd=opt_portfolio["max_dd"] * 100,
            diversification_ratio=round(div_ratio, 4),
        )

    def _calc_correlation_matrix(self, returns: Dict[str, List[float]]) -> Dict[str, Dict[str, float]]:
        """计算策略间相关性矩阵"""
        names = list(returns.keys())
        matrix = {}
        for n1 in names:
            matrix[n1] = {}
            for n2 in names:
                if n1 == n2:
                    matrix[n1][n2] = 1.0
                else:
                    r1 = np.array(returns[n1])
                    r2 = np.array(returns[n2])
                    if len(r1) > 1 and len(r2) > 1:
                        std1 = np.std(r1)
                        std2 = np.std(r2)
                        if std1 == 0 or std2 == 0:
                            corr = 0.0
                        else:
                            corr = float(np.corrcoef(r1, r2)[0, 1])
                        if np.isnan(corr) or np.isinf(corr):
                            corr = 0.0
                        matrix[n1][n2] = round(corr, 4)
                    else:
                        matrix[n1][n2] = 0.0
        return matrix

    def _calc_portfolio_stats(
        self, returns: Dict[str, List[float]], weights: Dict[str, float],
    ) -> Dict[str, float]:
        """计算组合收益统计"""
        names = list(returns.keys())
        min_len = min(len(returns[n]) for n in names)

        portfolio_rets = np.zeros(min_len)
        for name in names:
            w = weights.get(name, 0)
            rets = np.array(returns[name][-min_len:])
            portfolio_rets += w * rets

        total_ret = float(np.prod(1 + portfolio_rets) - 1)
        std = float(np.std(portfolio_rets))
        if std > 0:
            sharpe = float(np.mean(portfolio_rets) / std * np.sqrt(365 * 24))
        else:
            sharpe = 0.0
        if np.isnan(sharpe) or np.isinf(sharpe):
            sharpe = 0.0

        cum = np.cumprod(1 + portfolio_rets)
        peak = np.maximum.accumulate(cum)
        dd = (cum - peak) / peak
        max_dd = float(abs(np.min(dd))) if len(dd) > 0 else 0.0
        if np.isnan(max_dd) or np.isinf(max_dd):
            max_dd = 0.0

        vol = std * np.sqrt(365 * 24) if std > 0 else 0.0
        if np.isnan(vol) or np.isinf(vol):
            vol = 0.0

        return {
            "return": total_ret,
            "sharpe": sharpe,
            "max_dd": max_dd,
            "volatility": vol,
        }

    def _max_sharpe_weights(self, returns: Dict[str, List[float]]) -> Dict[str, float]:
        """最大化夏普比率的权重（简化版，无约束数值搜索）"""
        names = list(returns.keys())
        n = len(names)
        if n == 1:
            return {names[0]: 1.0}

        best_sharpe = -float("inf")
        best_weights = {}

        num_samples = 500
        for _ in range(num_samples):
            raw = np.random.exponential(1, n)
            weights = raw / raw.sum()
            weight_dict = dict(zip(names, weights))
            stats = self._calc_portfolio_stats(returns, weight_dict)
            if stats["sharpe"] > best_sharpe:
                best_sharpe = stats["sharpe"]
                best_weights = {k: round(float(v), 4) for k, v in weight_dict.items()}

        return best_weights

    def _risk_parity_weights(self, returns: Dict[str, List[float]]) -> Dict[str, float]:
        """风险平价权重（按波动反比例分配）"""
        names = list(returns.keys())
        vols = {}
        for name in names:
            rets = np.array(returns[name])
            vols[name] = float(np.std(rets)) if len(rets) > 1 else 0.01

        inv_vol = {n: 1.0 / max(v, 1e-8) for n, v in vols.items()}
        total = sum(inv_vol.values())
        return {n: round(v / total, 4) for n, v in inv_vol.items()}


# ===================== 蒙特卡洛模拟 =====================

@dataclass
class MonteCarloResult:
    """蒙特卡洛模拟结果"""
    num_simulations: int
    final_equity_mean: float
    final_equity_median: float
    final_equity_percentiles: Dict[str, float] = field(default_factory=dict)
    max_dd_percentiles: Dict[str, float] = field(default_factory=dict)
    ruin_probability: float = 0.0
    positive_probability: float = 0.0
    simulations: List[List[float]] = field(default_factory=list)


class MonteCarloSimulator:
    """蒙特卡洛模拟器

    通过打乱交易顺序，生成 N 条可能的权益曲线
    用来评估"最坏情况"有多坏
    """

    def __init__(
        self,
        trades: List[Any],
        initial_capital: float = 10000.0,
        num_simulations: int = 1000,
        ruin_threshold: float = 0.5,
    ):
        self.trades = trades
        self.initial_capital = initial_capital
        self.num_simulations = num_simulations
        self.ruin_threshold = ruin_threshold

    def run(self) -> MonteCarloResult:
        """执行蒙特卡洛模拟"""
        if not self.trades:
            return MonteCarloResult(
                num_simulations=self.num_simulations,
                final_equity_mean=self.initial_capital,
                final_equity_median=self.initial_capital,
            )

        pnl_pcts = []
        for t in self.trades:
            if isinstance(t, dict):
                pnl_pcts.append(t.get("pnl_percent", 0) / 100)
            else:
                pnl_pcts.append(getattr(t, "pnl_percent", 0) / 100)

        pnl_arr = np.array(pnl_pcts)
        n_trades = len(pnl_arr)

        final_equities = []
        max_drawdowns = []
        simulations = []

        for _ in range(self.num_simulations):
            shuffled = pnl_arr[np.random.permutation(n_trades)]
            equity = self.initial_capital
            equity_curve = [equity]
            peak = equity
            max_dd = 0.0

            for ret in shuffled:
                equity *= (1 + ret)
                equity_curve.append(equity)
                peak = max(peak, equity)
                dd = (peak - equity) / peak if peak > 0 else 0
                max_dd = max(max_dd, dd)

            final_equities.append(equity)
            max_drawdowns.append(max_dd)
            if len(simulations) < 50:
                simulations.append(equity_curve)

        final_arr = np.array(final_equities)
        dd_arr = np.array(max_drawdowns)

        ruin_prob = float(np.mean(dd_arr >= (1 - self.ruin_threshold)))
        positive_prob = float(np.mean(final_arr > self.initial_capital))

        percentiles = [5, 25, 50, 75, 95]
        eq_percentiles = {
            f"p{p}": float(np.percentile(final_arr, p)) for p in percentiles
        }
        dd_percentiles = {
            f"p{p}": float(np.percentile(dd_arr, p) * 100) for p in percentiles
        }

        return MonteCarloResult(
            num_simulations=self.num_simulations,
            final_equity_mean=float(np.mean(final_arr)),
            final_equity_median=float(np.median(final_arr)),
            final_equity_percentiles=eq_percentiles,
            max_dd_percentiles=dd_percentiles,
            ruin_probability=round(ruin_prob, 4),
            positive_probability=round(positive_prob, 4),
            simulations=simulations,
        )


# ===================== Kelly 仓位管理 =====================

def calc_kelly_fraction(
    win_rate: float,
    avg_win: float,
    avg_loss: float,
    fraction: float = 0.25,
) -> float:
    """计算Kelly仓位比例

    Args:
        win_rate: 胜率 (0~1)
        avg_win: 平均盈利金额（正数）
        avg_loss: 平均亏损金额（正数）
        fraction: Kelly分数，实盘建议 0.25~0.5

    Returns:
        建议的仓位比例 (0~1)
    """
    if win_rate <= 0 or win_rate >= 1:
        return 0.0
    if avg_loss <= 0:
        return 1.0

    b = avg_win / avg_loss
    kelly_full = (win_rate * b - (1 - win_rate)) / b
    kelly_fraction = max(0.0, min(1.0, kelly_full * fraction))

    return kelly_fraction


def calc_kelly_position_size(
    entry_price: float,
    stop_loss: float,
    win_rate: float,
    avg_win_pct: float,
    avg_loss_pct: float,
    capital: float,
    fraction: float = 0.25,
    leverage: int = 1,
) -> float:
    """计算Kelly仓位大小

    Args:
        entry_price: 入场价
        stop_loss: 止损价
        win_rate: 胜率
        avg_win_pct: 平均盈利百分比
        avg_loss_pct: 平均亏损百分比（正数）
        capital: 当前资金
        fraction: Kelly分数
        leverage: 杠杆

    Returns:
        建议仓位数量
    """
    kelly_pct = calc_kelly_fraction(win_rate, avg_win_pct, avg_loss_pct, fraction)
    risk_amount = capital * kelly_pct
    price_diff = abs(entry_price - stop_loss)

    if price_diff <= 0 or entry_price <= 0:
        return 0.0

    size = risk_amount / price_diff * leverage
    return size
