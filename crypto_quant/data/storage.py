"""
数据持久化模块

用 SQLite 存储回测结果和交易历史，支持：
1. 回测结果存储和查询
2. 交易历史记录
3. 策略优化记录
4. 性能基准对比
"""
import os
import json
import sqlite3
from typing import Dict, List, Any, Optional
from datetime import datetime

from ..utils.logger import logger


# 数据库路径
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "quant.db")


def _get_db() -> sqlite3.Connection:
    """获取数据库连接"""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """初始化数据库表"""
    conn = _get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS backtest_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                strategy TEXT NOT NULL,
                params TEXT NOT NULL DEFAULT '{}',
                initial_capital REAL NOT NULL,
                final_capital REAL NOT NULL,
                total_return_pct REAL NOT NULL,
                total_trades INTEGER NOT NULL,
                win_rate REAL NOT NULL,
                profit_factor REAL NOT NULL,
                sharpe_ratio REAL NOT NULL,
                sortino_ratio REAL NOT NULL,
                calmar_ratio REAL NOT NULL,
                max_drawdown_pct REAL NOT NULL,
                max_drawdown_duration INTEGER NOT NULL DEFAULT 0,
                total_commission REAL NOT NULL DEFAULT 0,
                total_slippage REAL NOT NULL DEFAULT 0,
                config TEXT NOT NULL DEFAULT '{}',
                equity_curve TEXT,
                metrics TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                backtest_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                size REAL NOT NULL,
                pnl REAL NOT NULL,
                pnl_percent REAL NOT NULL,
                entry_time REAL NOT NULL,
                exit_time REAL NOT NULL,
                reason TEXT NOT NULL DEFAULT 'signal_reverse',
                FOREIGN KEY (backtest_id) REFERENCES backtest_results(id)
            );

            CREATE TABLE IF NOT EXISTS optimization_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                strategy TEXT NOT NULL,
                method TEXT NOT NULL,
                best_params TEXT NOT NULL,
                best_score REAL NOT NULL,
                total_evaluations INTEGER NOT NULL,
                history TEXT NOT NULL DEFAULT '[]'
            );

            CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy);
            CREATE INDEX IF NOT EXISTS idx_backtest_symbol ON backtest_results(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_backtest ON trades(backtest_id);
            CREATE INDEX IF NOT EXISTS idx_optimization_strategy ON optimization_results(strategy);

            CREATE TABLE IF NOT EXISTS signal_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                strategy TEXT NOT NULL,
                direction TEXT NOT NULL,
                entry_price REAL NOT NULL,
                stop_loss REAL NOT NULL,
                take_profit REAL NOT NULL,
                confidence REAL NOT NULL,
                strength REAL NOT NULL,
                market_regime TEXT,
                verified INTEGER DEFAULT 0,
                outcome TEXT,
                max_profit_pct REAL,
                max_loss_pct REAL,
                final_return_pct REAL,
                bars_elapsed INTEGER,
                verified_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_signal_symbol ON signal_records(symbol);
            CREATE INDEX IF NOT EXISTS idx_signal_verified ON signal_records(verified);
        """)
        conn.commit()
    finally:
        conn.close()


def save_backtest_result(result: Any) -> int:
    """保存回测结果到数据库

    Args:
        result: BacktestResult 对象

    Returns:
        backtest_id
    """
    conn = _get_db()
    try:
        cursor = conn.execute("""
            INSERT INTO backtest_results (
                created_at, symbol, timeframe, strategy, params,
                initial_capital, final_capital, total_return_pct,
                total_trades, win_rate, profit_factor, sharpe_ratio,
                sortino_ratio, calmar_ratio, max_drawdown_pct,
                max_drawdown_duration, total_commission, total_slippage,
                config, equity_curve, metrics
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(),
            result.symbol,
            result.timeframe,
            result.strategy,
            json.dumps(result.params),
            result.initial_capital,
            result.final_capital,
            result.total_return_pct,
            result.total_trades,
            result.win_rate,
            result.profit_factor,
            result.sharpe_ratio,
            result.sortino_ratio,
            result.calmar_ratio,
            result.max_drawdown_pct,
            result.max_drawdown_duration,
            result.total_commission,
            result.total_slippage,
            json.dumps({}),
            json.dumps(result.equity_curve[-500:]),
            json.dumps(result.metrics),
        ))
        backtest_id = cursor.lastrowid

        # 保存交易记录
        for t in result.trades:
            conn.execute("""
                INSERT INTO trades (
                    backtest_id, symbol, side, entry_price, exit_price,
                    size, pnl, pnl_percent, entry_time, exit_time, reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                backtest_id,
                t.symbol,
                t.side,
                t.entry_price,
                t.exit_price,
                t.size,
                t.pnl,
                t.pnl_percent,
                t.entry_time,
                t.exit_time,
                t.reason,
            ))

        conn.commit()
        logger.info(f"回测结果已保存: id={backtest_id}, 策略={result.strategy}, 收益={result.total_return_pct:.2f}%")
        return backtest_id
    except Exception as e:
        conn.rollback()
        logger.error(f"保存回测结果失败: {e}")
        raise
    finally:
        conn.close()


def query_backtest_results(
    strategy: Optional[str] = None,
    symbol: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """查询回测结果"""
    conn = _get_db()
    try:
        query = "SELECT * FROM backtest_results WHERE 1=1"
        params = []

        if strategy:
            query += " AND strategy = ?"
            params.append(strategy)
        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        results = []
        for row in rows:
            r = dict(row)
            r["params"] = json.loads(r.get("params", "{}"))
            r["metrics"] = json.loads(r.get("metrics", "{}"))
            results.append(r)

        return results
    finally:
        conn.close()


def get_backtest_detail(backtest_id: int) -> Optional[Dict[str, Any]]:
    """获取回测详情（含交易记录）"""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM backtest_results WHERE id = ?", (backtest_id,)
        ).fetchone()

        if not row:
            return None

        result = dict(row)
        result["params"] = json.loads(result.get("params", "{}"))
        result["metrics"] = json.loads(result.get("metrics", "{}"))

        trades = conn.execute(
            "SELECT * FROM trades WHERE backtest_id = ? ORDER BY entry_time", (backtest_id,)
        ).fetchall()
        result["trades"] = [dict(t) for t in trades]

        return result
    finally:
        conn.close()


def save_optimization_result(
    symbol: str,
    timeframe: str,
    strategy: str,
    method: str,
    best_params: Dict[str, Any],
    best_score: float,
    total_evaluations: int,
    history: List[Dict[str, Any]],
) -> int:
    """保存优化结果"""
    conn = _get_db()
    try:
        cursor = conn.execute("""
            INSERT INTO optimization_results (
                created_at, symbol, timeframe, strategy, method,
                best_params, best_score, total_evaluations, history
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(),
            symbol,
            timeframe,
            strategy,
            method,
            json.dumps(best_params),
            best_score,
            total_evaluations,
            json.dumps(history[-50:]),
        ))
        conn.commit()
        return cursor.lastrowid
    except Exception as e:
        conn.rollback()
        logger.error(f"保存优化结果失败: {e}")
        raise
    finally:
        conn.close()


def compare_strategies(
    symbol: str = "BTC/USDT",
    timeframe: str = "1h",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """对比不同策略的最新回测结果"""
    conn = _get_db()
    try:
        rows = conn.execute("""
            SELECT strategy,
                   AVG(total_return_pct) as avg_return,
                   AVG(sharpe_ratio) as avg_sharpe,
                   AVG(win_rate) as avg_winrate,
                   AVG(max_drawdown_pct) as avg_dd,
                   COUNT(*) as run_count
            FROM backtest_results
            WHERE symbol = ? AND timeframe = ?
            GROUP BY strategy
            ORDER BY avg_sharpe DESC
            LIMIT ?
        """, (symbol, timeframe, limit)).fetchall()

        return [dict(r) for r in rows]
    finally:
        conn.close()


def save_signal_record(
    symbol: str,
    timeframe: str,
    strategy: str,
    direction: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    confidence: float,
    strength: float,
    market_regime: Optional[str] = None,
) -> int:
    """保存信号记录到数据库

    Args:
        symbol: 交易对
        timeframe: 时间周期
        strategy: 策略名称
        direction: 方向 long/short/neutral
        entry_price: 入场价
        stop_loss: 止损价
        take_profit: 止盈价
        confidence: 置信度
        strength: 信号强度
        market_regime: 市场状态（可选）

    Returns:
        signal_id
    """
    conn = _get_db()
    try:
        cursor = conn.execute(
            """
            INSERT INTO signal_records (
                created_at, symbol, timeframe, strategy, direction,
                entry_price, stop_loss, take_profit, confidence,
                strength, market_regime
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(),
                symbol,
                timeframe,
                strategy,
                direction,
                entry_price,
                stop_loss,
                take_profit,
                confidence,
                strength,
                market_regime,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    except Exception as e:
        conn.rollback()
        logger.error(f"保存信号记录失败: {e}")
        raise
    finally:
        conn.close()


def get_unverified_signals(symbol: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """获取未验证的信号记录"""
    conn = _get_db()
    try:
        query = "SELECT * FROM signal_records WHERE verified = 0"
        params = []
        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_signal_outcome(
    signal_id: int,
    outcome: str,
    max_profit_pct: float,
    max_loss_pct: float,
    final_return_pct: float,
    bars_elapsed: int,
) -> None:
    """更新信号验证结果"""
    conn = _get_db()
    try:
        conn.execute(
            """
            UPDATE signal_records
            SET verified = 1,
                outcome = ?,
                max_profit_pct = ?,
                max_loss_pct = ?,
                final_return_pct = ?,
                bars_elapsed = ?,
                verified_at = ?
            WHERE id = ?
            """,
            (
                outcome,
                max_profit_pct,
                max_loss_pct,
                final_return_pct,
                bars_elapsed,
                datetime.now().isoformat(),
                signal_id,
            ),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"更新信号结果失败: {e}")
        raise
    finally:
        conn.close()


def get_signal_stats(
    symbol: Optional[str] = None,
    timeframe: Optional[str] = None,
    strategy: Optional[str] = None,
    days: int = 30,
) -> Dict[str, Any]:
    """获取信号统计信息

    Returns:
        {
            total_signals,
            hit_tp_count,
            hit_sl_count,
            ongoing_count,
            timeout_count,
            accuracy_pct,
            avg_return_pct,
            avg_bars_to_result
        }
    """
    conn = _get_db()
    try:
        query = """
            SELECT
                COUNT(*) as total_signals,
                SUM(CASE WHEN outcome = 'hit_tp' THEN 1 ELSE 0 END) as hit_tp_count,
                SUM(CASE WHEN outcome = 'hit_sl' THEN 1 ELSE 0 END) as hit_sl_count,
                SUM(CASE WHEN outcome = 'ongoing' THEN 1 ELSE 0 END) as ongoing_count,
                SUM(CASE WHEN outcome = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
                AVG(final_return_pct) as avg_return_pct,
                AVG(bars_elapsed) as avg_bars_to_result
            FROM signal_records
            WHERE created_at >= datetime('now', '-{} days')
        """.format(days)
        params = []

        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)
        if timeframe:
            query += " AND timeframe = ?"
            params.append(timeframe)
        if strategy:
            query += " AND strategy = ?"
            params.append(strategy)

        row = conn.execute(query, params).fetchone()
        if not row:
            return {
                "total_signals": 0,
                "hit_tp_count": 0,
                "hit_sl_count": 0,
                "ongoing_count": 0,
                "timeout_count": 0,
                "accuracy_pct": 0.0,
                "avg_return_pct": 0.0,
                "avg_bars_to_result": 0.0,
            }

        total_signals = row["total_signals"] or 0
        hit_tp_count = row["hit_tp_count"] or 0
        hit_sl_count = row["hit_sl_count"] or 0
        ongoing_count = row["ongoing_count"] or 0
        timeout_count = row["timeout_count"] or 0

        accuracy_pct = 0.0
        if total_signals > 0:
            accuracy_pct = (hit_tp_count / total_signals) * 100

        return {
            "total_signals": total_signals,
            "hit_tp_count": hit_tp_count,
            "hit_sl_count": hit_sl_count,
            "ongoing_count": ongoing_count,
            "timeout_count": timeout_count,
            "accuracy_pct": round(accuracy_pct, 2),
            "avg_return_pct": round(row["avg_return_pct"] or 0.0, 4),
            "avg_bars_to_result": round(row["avg_bars_to_result"] or 0.0, 2),
        }
    finally:
        conn.close()


def get_signal_history(
    symbol: Optional[str] = None,
    timeframe: Optional[str] = None,
    strategy: Optional[str] = None,
    limit: int = 100,
    verified_only: bool = False,
) -> List[Dict[str, Any]]:
    """获取信号历史记录"""
    conn = _get_db()
    try:
        query = "SELECT * FROM signal_records WHERE 1=1"
        params = []

        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)
        if timeframe:
            query += " AND timeframe = ?"
            params.append(timeframe)
        if strategy:
            query += " AND strategy = ?"
            params.append(strategy)
        if verified_only:
            query += " AND verified = 1"

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# 初始化数据库
init_db()
