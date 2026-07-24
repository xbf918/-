"""
Crypto Quant - 加密货币量化交易系统
CLI入口 + FastAPI服务

功能：
- 回测
- 模拟盘
- 策略优化
- 策略列表
- 技术指标计算
"""
import sys
import os
import json
import argparse
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config.settings import settings
from .data.ccxt_client import get_ccxt_client
from .data.market_data import get_market_data, KlineData
from .strategies import get_strategy, list_strategies, STRATEGY_REGISTRY
from .engine.backtest import BacktestEngine, BacktestResult
from .engine.multi_strategy import MultiStrategyEngine, MarketStateAnalyzer
from .engine.advanced_analysis import (
    WalkForwardAnalyzer,
    ParameterSensitivityAnalyzer,
    PortfolioOptimizer,
    MonteCarloSimulator,
    calc_kelly_fraction,
    calc_kelly_position_size,
)
from .engine.strategy_health import StrategyHealthAnalyzer, HealthGrade
from .engine.trading_costs import (
    TradingCostAnalyzer,
    FundingRateSimulator,
    GapRiskSimulator,
    ImpactCostEstimator,
    FeeTier,
    OrderExecutionType,
    FEE_SCHEDULES,
)
from .engine.bayesian_optimizer import BayesianOptimizer
from .data.storage import (
    save_backtest_result,
    query_backtest_results,
    get_backtest_detail,
    save_optimization_result,
    compare_strategies,
    get_signal_history,
)
from .engine.signal_tracker import SignalTracker
from .execution.paper_trader import PaperTrader
from .execution.live_trader import LiveTrader
from .risk.risk_manager import RiskManager
from .utils.logger import logger
import numpy as np


def _safe_float(v) -> Optional[float]:
    """安全转换为float，处理NaN"""
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


app = FastAPI(title="Crypto Quant API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BacktestRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategy: str = "ma_trend"
    params: Dict[str, Any] = Field(default_factory=dict)
    initial_capital: float = 10000.0
    limit: int = 500
    leverage: int = 1
    signal_lag: int = 1
    slippage_model: str = "volatility_based"
    slippage_rate: float = 0.0002
    commission_rate: float = 0.0004
    atr_period: int = 14
    trailing_stop_atr: float = 0.0
    time_stop_bars: int = 0
    position_risk_pct: float = 0.02


class SignalRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategy: str = "ma_trend"
    params: Dict[str, Any] = Field(default_factory=dict)
    limit: int = 200


class MultiStrategySignalRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategies: List[str] = Field(default_factory=lambda: ["ma_trend", "rsi_mean_reversion", "macd_momentum"])
    params: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    limit: int = 200
    use_regime_weights: bool = True
    custom_weights: Optional[Dict[str, float]] = None


class MultiTimeframeRequest(BaseModel):
    symbol: str = "BTC/USDT"
    trend_timeframe: str = "4h"
    entry_timeframe: str = "1h"
    strategy: str = "ma_trend"
    params: Dict[str, Any] = Field(default_factory=dict)
    limit: int = 200


class WalkForwardRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategy: str = "ma_trend"
    param_grid: Dict[str, List[Any]] = Field(default_factory=dict)
    base_config: Dict[str, Any] = Field(default_factory=dict)
    num_windows: int = 4
    train_ratio: float = 0.75
    optimize_metric: str = "sharpe_ratio"
    limit: int = 800


class SensitivityRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategy: str = "ma_trend"
    param_grid: Dict[str, List[Any]] = Field(default_factory=dict)
    base_config: Dict[str, Any] = Field(default_factory=dict)
    limit: int = 500


class PortfolioRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategies: List[str] = Field(default_factory=lambda: ["ma_trend", "rsi_mean_reversion", "macd_momentum"])
    params: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    base_config: Dict[str, Any] = Field(default_factory=dict)
    method: str = "sharpe"
    limit: int = 500


class MonteCarloRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategy: str = "ma_trend"
    params: Dict[str, Any] = Field(default_factory=dict)
    base_config: Dict[str, Any] = Field(default_factory=dict)
    num_simulations: int = 500
    ruin_threshold: float = 0.5
    limit: int = 500


class KellyRequest(BaseModel):
    win_rate: float
    avg_win_pct: float
    avg_loss_pct: float
    fraction: float = 0.25
    capital: float = 10000.0
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    leverage: int = 1


class PaperTradeRequest(BaseModel):
    symbol: str = "BTC/USDT"
    side: str = "buy"
    order_type: str = "market"
    amount: float
    price: Optional[float] = None


paper_trader_instance: Optional[PaperTrader] = None
signal_tracker_instance: Optional[SignalTracker] = None


def get_paper_trader() -> PaperTrader:
    global paper_trader_instance
    if paper_trader_instance is None:
        paper_trader_instance = PaperTrader(
            initial_capital=settings.risk.initial_capital,
            commission_rate=0.0004,
        )
    return paper_trader_instance


def get_signal_tracker() -> SignalTracker:
    global signal_tracker_instance
    if signal_tracker_instance is None:
        signal_tracker_instance = SignalTracker()
    return signal_tracker_instance


@app.get("/")
def root():
    return {"status": "ok", "service": "crypto_quant", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/strategies")
def get_strategies_list():
    return list_strategies()


@app.get("/strategies/{name}")
def get_strategy_info(name: str):
    if name not in STRATEGY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"策略 {name} 不存在")
    cls = STRATEGY_REGISTRY[name]
    default_params = cls().params
    return {
        "name": name,
        "class": cls.__name__,
        "description": cls.__doc__ or "",
        "default_params": default_params,
    }


@app.post("/backtest")
def run_backtest(req: BacktestRequest):
    """运行回测"""
    try:
        strategy = get_strategy(req.strategy, req.params)

        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        engine = BacktestEngine(
            kline=kline,
            strategy=strategy,
            initial_capital=req.initial_capital,
            commission_rate=req.commission_rate,
            slippage_rate=req.slippage_rate,
            leverage=req.leverage,
            signal_lag=req.signal_lag,
            slippage_model=req.slippage_model,
            atr_period=req.atr_period,
            trailing_stop_atr=req.trailing_stop_atr,
            time_stop_bars=req.time_stop_bars,
            position_risk_pct=req.position_risk_pct,
        )
        result = engine.run()

        # 自动保存回测结果到数据库
        try:
            backtest_id = save_backtest_result(result)
        except Exception as save_err:
            logger.warning(f"回测结果保存失败（不影响返回）: {save_err}")
            backtest_id = None

        return {
            "status": "ok",
            "backtest_id": backtest_id,
            "result": {
                "symbol": result.symbol,
                "timeframe": result.timeframe,
                "strategy": result.strategy,
                "params": result.params,
                "initial_capital": result.initial_capital,
                "final_capital": result.final_capital,
                "total_return_pct": result.total_return_pct,
                "total_trades": result.total_trades,
                "win_rate": result.win_rate,
                "profit_factor": result.profit_factor,
                "sharpe_ratio": result.sharpe_ratio,
                "max_drawdown_pct": result.max_drawdown_pct,
                "max_drawdown_duration": result.max_drawdown_duration,
                "sortino_ratio": result.sortino_ratio,
                "calmar_ratio": result.calmar_ratio,
                "total_slippage": result.total_slippage,
                "winning_trades": result.winning_trades,
                "losing_trades": result.losing_trades,
                "total_commission": result.total_commission,
                "metrics": result.metrics,
                "equity_curve": result.equity_curve[-200:],
                "drawdown_curve": result.drawdown_curve[-200:],
                "trades": [
                    {
                        "id": t.id,
                        "symbol": t.symbol,
                        "side": t.side,
                        "entry_price": t.entry_price,
                        "exit_price": t.exit_price,
                        "size": t.size,
                        "pnl": t.pnl,
                        "pnl_percent": t.pnl_percent,
                        "entry_time": t.entry_time,
                        "exit_time": t.exit_time,
                        "reason": t.reason,
                    }
                    for t in result.trades[-50:]
                ],
            },
        }
    except Exception as e:
        logger.error(f"回测失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/signal")
def generate_signal(req: SignalRequest):
    """生成交易信号"""
    try:
        strategy = get_strategy(req.strategy, req.params)

        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        signal = strategy.generate_signal(kline)

        result = {
            "status": "ok",
            "signal": {
                "direction": signal.direction,
                "strength": signal.strength,
                "confidence": signal.confidence,
                "reason": signal.reason,
                "entry_price": signal.entry_price,
                "stop_loss": signal.stop_loss,
                "take_profit": signal.take_profit,
                "indicators": signal.indicators,
            },
            "strategy": req.strategy,
            "symbol": req.symbol,
            "timeframe": req.timeframe,
        }

        # 记录非 neutral 信号
        if signal.direction != "neutral":
            try:
                tracker = get_signal_tracker()
                tracker.record_signal(
                    symbol=req.symbol,
                    timeframe=req.timeframe,
                    strategy=req.strategy,
                    signal_dict=result["signal"],
                )
            except Exception as rec_err:
                logger.warning(f"信号记录失败（不影响返回）: {rec_err}")

        return result
    except Exception as e:
        logger.error(f"信号生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/indicators")
def get_indicators(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    limit: int = Query(200),
):
    """获取技术指标"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(symbol, timeframe, limit=limit)
        kline = md.parse_ohlcv(kline_data, symbol, timeframe)

        rsi = md.calc_rsi(kline, 14)
        macd = md.calc_macd(kline)
        boll = md.calc_bollinger(kline, 20)
        atr = md.calc_atr(kline, 14)
        kdj = md.calc_kdj(kline)
        ma5 = md.calc_ma(kline, 5)
        ma10 = md.calc_ma(kline, 10)
        ma20 = md.calc_ma(kline, 20)
        ma60 = md.calc_ma(kline, 60)

        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "price": kline.last_price,
            "indicators": {
                "rsi": _safe_float(rsi[-1]) if len(rsi) > 0 else None,
                "macd": {
                    "macd": _safe_float(macd["macd"][-1]) if len(macd["macd"]) > 0 else None,
                    "signal": _safe_float(macd["signal"][-1]) if len(macd["signal"]) > 0 else None,
                    "histogram": _safe_float(macd["histogram"][-1]) if len(macd["histogram"]) > 0 else None,
                },
                "bollinger": {
                    "upper": _safe_float(boll["upper"][-1]) if len(boll["upper"]) > 0 else None,
                    "middle": _safe_float(boll["middle"][-1]) if len(boll["middle"]) > 0 else None,
                    "lower": _safe_float(boll["lower"][-1]) if len(boll["lower"]) > 0 else None,
                },
                "atr": _safe_float(atr[-1]) if len(atr) > 0 else None,
                "kdj": {
                    "k": _safe_float(kdj["k"][-1]) if len(kdj["k"]) > 0 else None,
                    "d": _safe_float(kdj["d"][-1]) if len(kdj["d"]) > 0 else None,
                    "j": _safe_float(kdj["j"][-1]) if len(kdj["j"]) > 0 else None,
                },
                "ma": {
                    "ma5": _safe_float(ma5[-1]) if len(ma5) > 0 else None,
                    "ma10": _safe_float(ma10[-1]) if len(ma10) > 0 else None,
                    "ma20": _safe_float(ma20[-1]) if len(ma20) > 0 else None,
                    "ma60": _safe_float(ma60[-1]) if len(ma60) > 0 else None,
                },
            },
        }
    except Exception as e:
        logger.error(f"指标计算失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/market/regime")
def get_market_regime(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    limit: int = Query(200),
):
    """获取市场状态识别结果"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(symbol, timeframe, limit=limit)
        kline = md.parse_ohlcv(kline_data, symbol, timeframe)

        analyzer = MarketStateAnalyzer()
        state = analyzer.analyze(kline)

        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "regime": {
                "regime": state.regime,
                "trend": state.trend,
                "trend_strength": round(state.trend_strength, 4),
                "volatility": state.volatility,
                "volatility_value": round(state.volatility_value, 4),
                "adx": round(state.adx, 2),
                "price_position": round(state.price_position, 4),
                "ma_alignment": round(state.ma_alignment, 4),
                "atr_ratio": round(state.atr_ratio, 4),
            },
        }
    except Exception as e:
        logger.error(f"市场状态识别失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/signal/multi")
def generate_multi_strategy_signal(req: MultiStrategySignalRequest):
    """生成多策略组合信号（带市场状态动态权重）"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        all_signals = {}
        for strategy_name in req.strategies:
            if strategy_name not in STRATEGY_REGISTRY:
                continue
            params = req.params.get(strategy_name, {})
            strategy = get_strategy(strategy_name, params)
            signal = strategy.generate_signal(kline)
            all_signals[strategy_name] = {
                "direction": signal.direction,
                "strength": signal.strength,
                "confidence": signal.confidence,
                "reason": signal.reason,
                "entry_price": signal.entry_price,
                "stop_loss": signal.stop_loss,
                "take_profit": signal.take_profit,
                "indicators": signal.indicators,
            }

        engine = MultiStrategyEngine()
        regime = None
        if req.use_regime_weights:
            analyzer = MarketStateAnalyzer()
            state = analyzer.analyze(kline)
            regime = state.regime

        combined = engine.combine_signals(
            all_signals,
            regime=regime,
            custom_weights=req.custom_weights,
        )

        result = {
            "status": "ok",
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "combined_signal": combined,
            "strategy_signals": all_signals,
        }

        # 记录综合信号
        combined_signal = combined
        if combined_signal.get("direction") not in (None, "neutral"):
            try:
                tracker = get_signal_tracker()
                tracker.record_signal(
                    symbol=req.symbol,
                    timeframe=req.timeframe,
                    strategy="combined",
                    signal_dict=combined_signal,
                    market_regime=combined_signal.get("regime"),
                )
            except Exception as rec_err:
                logger.warning(f"综合信号记录失败（不影响返回）: {rec_err}")

        return result
    except Exception as e:
        logger.error(f"多策略信号生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/signal/multi_timeframe")
def generate_multi_timeframe_signal(req: MultiTimeframeRequest):
    """生成多时间周期确认信号（三重滤网）"""
    try:
        from .engine.multi_strategy import MultiTimeframeAnalyzer

        md = get_market_data()
        client = get_ccxt_client()

        trend_kline_data = client.fetch_ohlcv(req.symbol, req.trend_timeframe, limit=req.limit)
        trend_kline = md.parse_ohlcv(trend_kline_data, req.symbol, req.trend_timeframe)
        trend_strategy = get_strategy(req.strategy, req.params)
        trend_signal = trend_strategy.generate_signal(trend_kline)

        entry_kline_data = client.fetch_ohlcv(req.symbol, req.entry_timeframe, limit=req.limit)
        entry_kline = md.parse_ohlcv(entry_kline_data, req.symbol, req.entry_timeframe)
        entry_strategy = get_strategy(req.strategy, req.params)
        entry_signal = entry_strategy.generate_signal(entry_kline)

        analyzer = MultiTimeframeAnalyzer()
        result = analyzer.check_trend_alignment(
            {
                "direction": trend_signal.direction,
                "strength": trend_signal.strength,
                "confidence": trend_signal.confidence,
            },
            {
                "direction": entry_signal.direction,
                "strength": entry_signal.strength,
                "confidence": entry_signal.confidence,
            },
        )

        return {
            "status": "ok",
            "symbol": req.symbol,
            "trend_timeframe": req.trend_timeframe,
            "entry_timeframe": req.entry_timeframe,
            "result": result,
            "trend_signal": {
                "direction": trend_signal.direction,
                "strength": trend_signal.strength,
                "confidence": trend_signal.confidence,
                "reason": trend_signal.reason,
            },
            "entry_signal": {
                "direction": entry_signal.direction,
                "strength": entry_signal.strength,
                "confidence": entry_signal.confidence,
                "reason": entry_signal.reason,
            },
        }
    except Exception as e:
        logger.error(f"多周期信号生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analysis/walk_forward")
def run_walk_forward_analysis(req: WalkForwardRequest):
    """Walk Forward Analysis - 滚动前进分析，检验过拟合"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        analyzer = WalkForwardAnalyzer(
            kline=kline,
            strategy_name=req.strategy,
            param_grid=req.param_grid,
            train_ratio=req.train_ratio,
            num_windows=req.num_windows,
            optimize_metric=req.optimize_metric,
            base_config=req.base_config,
        )
        result = analyzer.run()

        return {
            "status": "ok",
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "strategy": req.strategy,
            "in_sample": result.in_sample_results,
            "out_of_sample": result.out_of_sample_results,
            "optimized_params": result.optimized_params,
            "combined_oos_equity": result.combined_oos_equity[-200:],
            "metrics": result.metrics,
        }
    except Exception as e:
        logger.error(f"WFA失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analysis/sensitivity")
def run_sensitivity_analysis(req: SensitivityRequest):
    """参数敏感性分析 - 参数热力图 + 稳健性检测"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        analyzer = ParameterSensitivityAnalyzer(
            kline=kline,
            strategy_name=req.strategy,
            param_grid=req.param_grid,
            base_config=req.base_config,
        )
        result = analyzer.run()

        top_results = sorted(result.results, key=lambda x: x["total_return"], reverse=True)[:20]

        return {
            "status": "ok",
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "strategy": req.strategy,
            "robustness_score": result.robustness_score,
            "plateau_ratio": result.plateau_ratio,
            "heatmap": result.heatmap_data,
            "top_results": top_results,
            "total_combinations": len(result.results),
        }
    except Exception as e:
        logger.error(f"参数敏感性分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analysis/portfolio")
def run_portfolio_optimization(req: PortfolioRequest):
    """多策略组合优化 - 相关性矩阵 + 最优资金分配"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        equity_curves = {}
        for strategy_name in req.strategies:
            if strategy_name not in STRATEGY_REGISTRY:
                continue
            params = req.params.get(strategy_name, {})
            strategy = get_strategy(strategy_name, params)
            engine = BacktestEngine(
                kline=kline,
                strategy=strategy,
                initial_capital=req.base_config.get("initial_capital", 10000),
                commission_rate=req.base_config.get("commission_rate", 0.0004),
                slippage_rate=req.base_config.get("slippage_rate", 0.0002),
                leverage=req.base_config.get("leverage", 1),
                signal_lag=req.base_config.get("signal_lag", 1),
                slippage_model=req.base_config.get("slippage_model", "volatility_based"),
                atr_period=req.base_config.get("atr_period", 14),
                trailing_stop_atr=req.base_config.get("trailing_stop_atr", 0),
                time_stop_bars=req.base_config.get("time_stop_bars", 0),
                position_risk_pct=req.base_config.get("position_risk_pct", 0.02),
            )
            result = engine.run()
            equity_curves[strategy_name] = result.equity_curve

        optimizer = PortfolioOptimizer(equity_curves)
        port_result = optimizer.run(method=req.method)

        return {
            "status": "ok",
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "strategies": req.strategies,
            "method": req.method,
            "correlation_matrix": port_result.correlation_matrix,
            "optimal_weights": port_result.optimal_weights,
            "equal_weight": {
                "return": port_result.equal_weight_return,
                "sharpe": port_result.equal_weight_sharpe,
                "max_dd": port_result.equal_weight_max_dd,
            },
            "optimal": {
                "return": port_result.optimal_return,
                "sharpe": port_result.optimal_sharpe,
                "max_dd": port_result.optimal_max_dd,
            },
            "diversification_ratio": port_result.diversification_ratio,
        }
    except Exception as e:
        logger.error(f"组合优化失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analysis/monte_carlo")
def run_monte_carlo_simulation(req: MonteCarloRequest):
    """蒙特卡洛模拟 - 打乱交易顺序，测最坏情况"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        strategy = get_strategy(req.strategy, req.params)
        engine = BacktestEngine(
            kline=kline,
            strategy=strategy,
            initial_capital=req.base_config.get("initial_capital", 10000),
            commission_rate=req.base_config.get("commission_rate", 0.0004),
            slippage_rate=req.base_config.get("slippage_rate", 0.0002),
            leverage=req.base_config.get("leverage", 1),
            signal_lag=req.base_config.get("signal_lag", 1),
            slippage_model=req.base_config.get("slippage_model", "volatility_based"),
            atr_period=req.base_config.get("atr_period", 14),
            trailing_stop_atr=req.base_config.get("trailing_stop_atr", 0),
            time_stop_bars=req.base_config.get("time_stop_bars", 0),
            position_risk_pct=req.base_config.get("position_risk_pct", 0.02),
        )
        bt_result = engine.run()

        sim = MonteCarloSimulator(
            trades=bt_result.trades,
            initial_capital=bt_result.initial_capital,
            num_simulations=req.num_simulations,
            ruin_threshold=req.ruin_threshold,
        )
        mc_result = sim.run()

        sample_simulations = [sim[-200:] for sim in mc_result.simulations]

        return {
            "status": "ok",
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "strategy": req.strategy,
            "num_simulations": mc_result.num_simulations,
            "final_equity": {
                "mean": mc_result.final_equity_mean,
                "median": mc_result.final_equity_median,
                "percentiles": mc_result.final_equity_percentiles,
            },
            "max_drawdown": {
                "percentiles": mc_result.max_dd_percentiles,
            },
            "ruin_probability": mc_result.ruin_probability,
            "positive_probability": mc_result.positive_probability,
            "sample_simulations": sample_simulations,
            "realized_trades": bt_result.total_trades,
        }
    except Exception as e:
        logger.error(f"蒙特卡洛模拟失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analysis/kelly")
def calc_kelly(req: KellyRequest):
    """Kelly公式仓位计算"""
    try:
        kelly_pct = calc_kelly_fraction(
            win_rate=req.win_rate,
            avg_win=req.avg_win_pct,
            avg_loss=req.avg_loss_pct,
            fraction=req.fraction,
        )

        position_size = 0.0
        if req.entry_price and req.stop_loss:
            position_size = calc_kelly_position_size(
                entry_price=req.entry_price,
                stop_loss=req.stop_loss,
                win_rate=req.win_rate,
                avg_win_pct=req.avg_win_pct,
                avg_loss_pct=req.avg_loss_pct,
                capital=req.capital,
                fraction=req.fraction,
                leverage=req.leverage,
            )

        return {
            "status": "ok",
            "kelly_fraction_percent": kelly_pct * 100,
            "fraction_type": f"{req.fraction}x Kelly",
            "risk_amount": req.capital * kelly_pct,
            "position_size": position_size,
            "leverage": req.leverage,
        }
    except Exception as e:
        logger.error(f"Kelly计算失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/paper/account")
def paper_account():
    """模拟盘账户信息"""
    pt = get_paper_trader()
    return {"status": "ok", "account": pt.get_summary()}


@app.get("/paper/positions")
def paper_positions():
    """模拟盘持仓"""
    pt = get_paper_trader()
    positions = {
        sym: {
            "symbol": pos.symbol,
            "side": pos.side,
            "entry_price": pos.entry_price,
            "size": pos.size,
            "unrealized_pnl": pos.unrealized_pnl,
            "unrealized_pnl_pct": pos.unrealized_pnl_pct,
        }
        for sym, pos in pt.get_all_positions().items()
    }
    return {"status": "ok", "positions": positions}


@app.post("/paper/order")
def paper_place_order(req: PaperTradeRequest):
    """模拟盘下单"""
    pt = get_paper_trader()
    order = pt.place_order(req.symbol, req.side, req.order_type, req.amount, req.price)
    return {
        "status": "ok",
        "order": {
            "id": order.id,
            "symbol": order.symbol,
            "side": order.side,
            "type": order.type,
            "price": order.price,
            "amount": order.amount,
            "status": order.status,
        },
    }


@app.post("/paper/close/{symbol}")
def paper_close_position(symbol: str, reason: str = "manual"):
    """模拟盘平仓"""
    pt = get_paper_trader()
    trade = pt.close_position(symbol, reason=reason)
    if trade:
        return {"status": "ok", "trade": {
            "id": trade.id,
            "symbol": trade.symbol,
            "side": trade.side,
            "pnl": trade.pnl,
            "pnl_percent": trade.pnl_percent,
            "reason": trade.reason,
        }}
    return {"status": "error", "msg": "无持仓"}


@app.get("/paper/trades")
def paper_trades(limit: int = 50):
    """模拟盘交易历史"""
    pt = get_paper_trader()
    trades = pt.get_trade_history()[-limit:]
    return {"status": "ok", "trades": [
        {
            "id": t.id,
            "symbol": t.symbol,
            "side": t.side,
            "pnl": t.pnl,
            "pnl_percent": t.pnl_percent,
            "entry_time": t.entry_time,
            "exit_time": t.exit_time,
            "reason": t.reason,
        }
        for t in trades
    ]}


@app.get("/exchange/markets")
def exchange_markets():
    """获取交易市场列表"""
    client = get_ccxt_client()
    markets = client.load_markets()
    if markets.get("status") == "error":
        raise HTTPException(status_code=500, detail=markets.get("msg", "未知错误"))
    return {"status": "ok", "symbols": list(markets.get("symbols", []))[:100]}


@app.get("/exchange/ticker")
def exchange_ticker(symbol: str = Query("BTC/USDT")):
    """获取行情"""
    client = get_ccxt_client()
    ticker = client.fetch_ticker(symbol)
    if ticker.get("status") == "error":
        raise HTTPException(status_code=500, detail=ticker.get("msg", "未知错误"))
    return {"status": "ok", "ticker": ticker}


# ==================== 策略健康度诊断 ====================

@app.post("/analysis/health")
def run_strategy_health_check(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    strategy: str = Query("ma_trend"),
    limit: int = Query(500),
):
    """策略健康度诊断 - 权益曲线RSI、收益衰变、策略老化"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(symbol, timeframe, limit=limit)
        kline = md.parse_ohlcv(kline_data, symbol, timeframe)

        strategy_obj = get_strategy(strategy)
        engine = BacktestEngine(kline=kline, strategy=strategy_obj)
        result = engine.run()

        analyzer = StrategyHealthAnalyzer()
        diagnosis = analyzer.analyze(
            equity_curve=result.equity_curve,
            trades=result.trades,
        )

        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "strategy": strategy,
            "overall_score": diagnosis.overall_score,
            "grade": diagnosis.grade.value,
            "equity_rsi": diagnosis.equity_rsi,
            "decay_rate": diagnosis.decay_rate,
            "decay_status": diagnosis.decay_status,
            "recovery_trend": diagnosis.recovery_speed_trend,
            "fatigue_level": diagnosis.fatigue_level,
            "regime_adaptability": diagnosis.regime_adaptability,
            "details": diagnosis.details,
            "recommendations": diagnosis.recommendations,
        }
    except Exception as e:
        logger.error(f"策略健康度诊断失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 真实交易成本分析 ====================

@app.post("/analysis/costs")
def run_trading_cost_analysis(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    strategy: str = Query("ma_trend"),
    exchange: str = Query("binance"),
    fee_tier: str = Query("regular"),
    execution_type: str = Query("taker"),
    limit: int = Query(500),
):
    """真实交易成本分析 - 手续费、资金费率、冲击成本、跳空风险"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(symbol, timeframe, limit=limit)
        kline = md.parse_ohlcv(kline_data, symbol, timeframe)

        strategy_obj = get_strategy(strategy)
        engine = BacktestEngine(kline=kline, strategy=strategy_obj)
        result = engine.run()

        # 构造交易列表
        trade_dicts = []
        for t in result.trades:
            trade_dicts.append({
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "size": t.size,
                "side": t.side,
                "pnl": t.pnl,
                "pnl_percent": t.pnl_percent,
                "entry_time": t.entry_time,
                "exit_time": t.exit_time,
                "reason": t.reason,
                "slippage_cost": abs(t.entry_price * t.size * 0.0002) + abs(t.exit_price * t.size * 0.0002),
                "stop_loss": t.entry_price * 0.97 if t.side == "long" else t.entry_price * 1.03,
            })

        ft = FeeTier(fee_tier)
        et = OrderExecutionType(execution_type)

        cost_analyzer = TradingCostAnalyzer(
            exchange=exchange,
            fee_tier=ft,
            execution_type=et,
        )
        cost_result = cost_analyzer.analyze_full_cost(
            trades=trade_dicts,
            equity_curve=result.equity_curve,
            initial_capital=result.initial_capital,
            symbol=symbol,
            timeframe=timeframe,
        )

        # 资金费率年度估算
        funding_sim = FundingRateSimulator()
        avg_pos_value = result.initial_capital * 0.5
        funding_impact = funding_sim.estimate_annual_funding_impact(
            position_value=avg_pos_value,
            side="long",
            avg_holding_hours=48,
            trades_per_year=100,
            symbol=symbol,
        )

        # 冲击成本估算
        impact_est = ImpactCostEstimator()
        impact_info = impact_est.estimate_impact(avg_pos_value, symbol)

        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "strategy": strategy,
            "exchange": exchange,
            "fee_tier": fee_tier,
            "execution_type": execution_type,
            "costs": {
                "total_commission": cost_result.total_commission,
                "total_funding": cost_result.total_funding,
                "total_slippage": cost_result.total_slippage,
                "total_impact": cost_result.total_impact,
                "total_gap_risk": cost_result.total_gap_risk,
                "total_all_costs": cost_result.total_all_costs,
                "cost_breakdown_pct": cost_result.cost_breakdown_pct,
                "net_return_after_costs": cost_result.net_return_after_costs,
                "cost_ratio": cost_result.cost_ratio,
            },
            "funding_impact": funding_impact,
            "impact_by_capital": impact_info.get("impact_by_capital", {}),
        }
    except Exception as e:
        logger.error(f"交易成本分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 贝叶斯参数优化 ====================

class BayesianOptRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    strategy: str = "ma_trend"
    param_ranges: Dict[str, List[Any]] = Field(default_factory=dict)
    base_config: Dict[str, Any] = Field(default_factory=dict)
    max_evaluations: int = 20
    initial_random: int = 5
    optimize_metric: str = "sharpe_ratio"
    limit: int = 500


@app.post("/analysis/bayesian_optimize")
def run_bayesian_optimization(req: BayesianOptRequest):
    """贝叶斯参数优化 - 比网格搜索快10x"""
    try:
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(req.symbol, req.timeframe, limit=req.limit)
        kline = md.parse_ohlcv(kline_data, req.symbol, req.timeframe)

        optimizer = BayesianOptimizer(
            kline=kline,
            strategy_name=req.strategy,
            param_ranges=req.param_ranges,
            optimize_metric=req.optimize_metric,
            base_config=req.base_config,
            max_evaluations=req.max_evaluations,
            initial_random=req.initial_random,
        )
        result = optimizer.run()

        # 保存优化结果
        try:
            save_optimization_result(
                symbol=req.symbol,
                timeframe=req.timeframe,
                strategy=req.strategy,
                method="bayesian",
                best_params=result.best_params,
                best_score=result.best_score,
                total_evaluations=result.total_evaluations,
                history=result.history,
            )
        except Exception as save_err:
            logger.warning(f"优化结果保存失败: {save_err}")

        return {
            "status": "ok",
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "strategy": req.strategy,
            "best_params": result.best_params,
            "best_score": result.best_score,
            "total_evaluations": result.total_evaluations,
            "convergence": result.convergence,
            "history": result.history,
        }
    except Exception as e:
        logger.error(f"贝叶斯优化失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 数据查询接口 ====================

@app.get("/data/backtests")
def query_backtests(
    strategy: Optional[str] = None,
    symbol: Optional[str] = None,
    limit: int = Query(20),
):
    """查询历史回测结果"""
    results = query_backtest_results(strategy=strategy, symbol=symbol, limit=limit)
    return {"status": "ok", "results": results, "count": len(results)}


@app.get("/data/backtests/{backtest_id}")
def get_backtest_by_id(backtest_id: int):
    """获取回测详情"""
    result = get_backtest_detail(backtest_id)
    if not result:
        raise HTTPException(status_code=404, detail="回测记录不存在")
    return {"status": "ok", "result": result}


@app.get("/data/compare")
def compare_strategy_results(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    limit: int = Query(10),
):
    """对比不同策略的回测表现"""
    results = compare_strategies(symbol=symbol, timeframe=timeframe, limit=limit)
    return {"status": "ok", "comparison": results}


# ==================== 信号追踪接口 ====================

@app.get("/signals/stats")
def signals_stats(
    symbol: Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None),
    strategy: Optional[str] = Query(None),
    days: int = Query(30),
):
    """获取信号统计信息

    先验证未验证信号，再返回统计
    """
    try:
        tracker = get_signal_tracker()
        md = get_market_data()
        client = get_ccxt_client()

        # 先更新未验证信号
        tracker.verify_pending_signals(md, client, symbol=symbol)

        # 获取统计
        stats = tracker.get_stats(
            symbol=symbol,
            timeframe=timeframe,
            strategy=strategy,
            days=days,
        )

        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "strategy": strategy,
            "days": days,
            "stats": stats,
        }
    except Exception as e:
        logger.error(f"信号统计获取失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/signals/history")
def signals_history(
    symbol: Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None),
    limit: int = Query(100),
    verified_only: bool = Query(False),
):
    """获取最近信号列表"""
    try:
        results = get_signal_history(
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
            verified_only=verified_only,
        )
        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "limit": limit,
            "verified_only": verified_only,
            "signals": results,
            "count": len(results),
        }
    except Exception as e:
        logger.error(f"信号历史获取失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/signals/resonance")
def signals_resonance(
    symbol: str = Query("BTC/USDT"),
    strategy: str = Query("ma_trend"),
    timeframes: List[str] = Query(["15m", "1h", "4h"]),
):
    """多时间框架共振分析

    获取每个 timeframe 的综合信号，判断是否共振
    """
    try:
        md = get_market_data()
        client = get_ccxt_client()

        directions = {}
        combined_details = {}

        for tf in timeframes:
            kline_data = client.fetch_ohlcv(symbol, tf, limit=200)
            kline = md.parse_ohlcv(kline_data, symbol, tf)

            all_signals = {}
            for strategy_name in list_strategies().keys():
                if strategy_name not in STRATEGY_REGISTRY:
                    continue
                strategy_obj = get_strategy(strategy_name)
                sig = strategy_obj.generate_signal(kline)
                all_signals[strategy_name] = {
                    "direction": sig.direction,
                    "strength": sig.strength,
                    "confidence": sig.confidence,
                    "reason": sig.reason,
                    "entry_price": sig.entry_price,
                    "stop_loss": sig.stop_loss,
                    "take_profit": sig.take_profit,
                    "indicators": sig.indicators,
                }

            engine = MultiStrategyEngine()
            analyzer = MarketStateAnalyzer()
            state = analyzer.analyze(kline)

            combined = engine.combine_signals(
                all_signals,
                regime=state.regime,
            )

            directions[tf] = combined.get("direction", "neutral")
            combined_details[tf] = {
                "direction": combined.get("direction", "neutral"),
                "strength": combined.get("strength", 0.0),
                "confidence": combined.get("confidence", 0.0),
            }

        # 判断共振：所有非 neutral 周期方向一致
        non_neutral = {tf: d for tf, d in directions.items() if d != "neutral"}
        if len(non_neutral) == 0:
            is_resonance = False
            resonance_direction = "neutral"
            resonance_strength = 0.0
        else:
            unique_dirs = set(non_neutral.values())
            is_resonance = len(unique_dirs) == 1
            resonance_direction = list(unique_dirs)[0] if is_resonance else "mixed"
            if is_resonance:
                resonance_strength = sum(
                    combined_details[tf]["strength"] for tf in non_neutral.keys()
                ) / len(non_neutral)
            else:
                resonance_strength = 0.0

        return {
            "status": "ok",
            "symbol": symbol,
            "strategy": strategy,
            "timeframes": timeframes,
            "directions": directions,
            "details": combined_details,
            "is_resonance": is_resonance,
            "resonance_direction": resonance_direction,
            "resonance_strength": round(resonance_strength, 4),
        }
    except Exception as e:
        logger.error(f"多周期共振分析失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def run_cli():
    """CLI 模式"""
    parser = argparse.ArgumentParser(description="Crypto Quant 量化交易系统")
    parser.add_argument("command", choices=["backtest", "strategies", "signal", "optimize", "serve"], help="命令")
    parser.add_argument("--symbol", default="BTC/USDT", help="交易对")
    parser.add_argument("--timeframe", default="1h", help="时间周期")
    parser.add_argument("--strategy", default="ma_trend", help="策略名称")
    parser.add_argument("--capital", type=float, default=10000, help="初始资金")
    parser.add_argument("--limit", type=int, default=500, help="K线数量")
    parser.add_argument("--params", type=str, default="{}", help="策略参数 JSON")
    parser.add_argument("--port", type=int, default=8001, help="API服务端口")
    parser.add_argument("--host", default="0.0.0.0", help="API服务监听地址")

    args = parser.parse_args()

    if args.command == "strategies":
        print("\n可用策略列表:")
        print("-" * 60)
        for name, info in list_strategies().items():
            print(f"  {name:<20} {info['description'][:50]}")
        print()
        return

    elif args.command == "signal":
        strategy = get_strategy(args.strategy, json.loads(args.params))
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(args.symbol, args.timeframe, limit=args.limit)
        kline = md.parse_ohlcv(kline_data, args.symbol, args.timeframe)

        signal = strategy.generate_signal(kline)
        print(f"\n策略信号: {args.strategy} on {args.symbol} {args.timeframe}")
        print(f"方向: {signal.direction}")
        print(f"强度: {signal.strength:.2f}")
        print(f"置信度: {signal.confidence:.2f}")
        print(f"原因: {signal.reason}")
        print(f"入场价: {signal.entry_price}")
        print(f"止损: {signal.stop_loss}")
        print(f"止盈: {signal.take_profit}")
        return

    elif args.command == "backtest":
        strategy = get_strategy(args.strategy, json.loads(args.params))
        md = get_market_data()
        client = get_ccxt_client()

        kline_data = client.fetch_ohlcv(args.symbol, args.timeframe, limit=args.limit)
        kline = md.parse_ohlcv(kline_data, args.symbol, args.timeframe)

        engine = BacktestEngine(kline=kline, strategy=strategy, initial_capital=args.capital)
        result = engine.run()

        print(f"\n{'='*60}")
        print(f"回测结果: {args.strategy} on {args.symbol} {args.timeframe}")
        print(f"{'='*60}")
        print(f"初始资金:     {result.initial_capital:.2f}")
        print(f"最终资金:     {result.final_capital:.2f}")
        print(f"总收益率:     {result.total_return_pct:.2f}%")
        print(f"总交易次数:   {result.total_trades}")
        print(f"胜率:         {result.win_rate*100:.1f}%")
        print(f"盈亏比:       {result.profit_factor:.2f}")
        print(f"夏普比率:     {result.sharpe_ratio:.2f}")
        print(f"最大回撤:     {result.max_drawdown_pct:.2f}%")
        print(f"盈利交易:     {result.winning_trades}")
        print(f"亏损交易:     {result.losing_trades}")
        print(f"总手续费:     {result.total_commission:.2f}")
        print(f"{'='*60}")
        return

    elif args.command == "serve":
        import uvicorn
        logger.info(f"启动 API 服务: {args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port)
        return


if __name__ == "__main__":
    run_cli()
