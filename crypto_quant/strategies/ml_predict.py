"""
ML 机器学习预测策略
使用逻辑回归/SVM/RandomForest 等模型预测价格走势
"""
import os
from typing import Dict, Any, Optional

import numpy as np
import pandas as pd

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

from .base import BaseStrategy, Signal
from ..data.market_data import KlineData, get_market_data
from ..utils.logger import logger


class MLPredictStrategy(BaseStrategy):
    """机器学习预测策略"""

    def __init__(self, params: Optional[Dict[str, Any]] = None):
        default_params = {
            "lookback": 20,
            "horizon": 5,
            "threshold": 0.6,
            "model_type": "random_forest",
            "min_samples": 200,
            "retrain_every": 100,
        }
        super().__init__("ml_predict", {**default_params, **(params or {})})
        self._model = None
        self._scaler = None
        self._trained = False
        self._last_train_idx = 0
        self._model_path = ""

    def generate_signal(self, kline: KlineData) -> Signal:
        if kline.length < 50:
            return Signal(direction="neutral", reason="数据不足")

        features = self._extract_features(kline)

        if features is None or len(features) < 30:
            return Signal(direction="neutral", reason="特征数据不足")

        if not self._trained:
            if not HAS_SKLEARN:
                return self._fallback_signal(kline)
            self._train(features)

        if not self._trained or self._model is None:
            return self._fallback_signal(kline)

        try:
            latest_features = features.iloc[-1:].values
            scaled = self._scaler.transform(latest_features)

            proba = self._model.predict_proba(scaled)[0]
            pred_class = int(np.argmax(proba))
            confidence = float(proba[pred_class])

            threshold = float(self.params["threshold"])

            if confidence >= threshold:
                if pred_class == 1:
                    direction = "long"
                    reason = f"ML预测上涨，置信度{confidence*100:.1f}%"
                elif pred_class == 2:
                    direction = "short"
                    reason = f"ML预测下跌，置信度{confidence*100:.1f}%"
                else:
                    direction = "neutral"
                    reason = f"ML预测震荡，置信度{confidence*100:.1f}%"
            else:
                direction = "neutral"
                reason = f"ML置信度{confidence*100:.1f}%低于阈值{threshold*100:.0f}%"

            strength = (confidence - 0.5) * 2
            strength = max(0.0, min(1.0, strength))

        except Exception as e:
            logger.warning(f"ML预测失败: {e}")
            return self._fallback_signal(kline)

        current_price = kline.last_price
        sl_pct = 0.02
        tp_pct = 0.04

        return Signal(
            direction=direction,
            strength=strength,
            confidence=confidence,
            reason=reason,
            entry_price=current_price,
            stop_loss=current_price * (1 - sl_pct) if direction == "long" else current_price * (1 + sl_pct),
            take_profit=current_price * (1 + tp_pct) if direction == "long" else current_price * (1 - tp_pct),
            indicators={
                "ml_confidence": confidence,
                "prediction": direction,
                "feature_count": features.shape[1],
            },
        )

    def _extract_features(self, kline: KlineData) -> Optional[pd.DataFrame]:
        """提取特征"""
        md = get_market_data()
        close = pd.Series(kline.close)

        if len(close) < 30:
            return None

        features = pd.DataFrame(index=range(len(close)))

        for period in [5, 10, 20, 50]:
            ma = close.rolling(period).mean()
            features[f"ma_{period}_ratio"] = (close / ma - 1) * 100

        for period in [7, 14, 21]:
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
            rs = gain / (loss + 1e-10)
            features[f"rsi_{period}"] = 100 - (100 / (1 + rs))

        for period in [12, 26, 9]:
            pass

        macd_data = md.calc_macd(kline)
        features["macd"] = macd_data["macd"] / kline.close * 1000
        features["macd_signal"] = macd_data["signal"] / kline.close * 1000
        features["macd_hist"] = macd_data["histogram"] / kline.close * 1000

        for period in [20]:
            boll = md.calc_bollinger(kline, period)
            features["boll_position"] = (kline.close - boll["lower"]) / (boll["upper"] - boll["lower"] + 1e-10)

        for period in [7, 14, 28]:
            high = pd.Series(kline.high).rolling(period).max()
            low = pd.Series(kline.low).rolling(period).min()
            features[f"stoch_k"] = (close - low) / (high - low + 1e-10) * 100

        vol = pd.Series(kline.volume)
        features["vol_change"] = vol.pct_change()
        features["vol_ma_ratio"] = vol / vol.rolling(20).mean()

        for i in range(1, 6):
            features[f"ret_{i}"] = close.pct_change(i) * 100

        kdj = md.calc_kdj(kline)
        features["kdj_k"] = kdj["k"]
        features["kdj_d"] = kdj["d"]
        features["kdj_j"] = kdj["j"]

        features = features.fillna(0)

        return features

    def _train(self, features: pd.DataFrame):
        """训练模型"""
        horizon = int(self.params["horizon"])
        min_samples = int(self.params["min_samples"])

        if len(features) < min_samples:
            return

        try:
            closes = features.get("ma_5_ratio", pd.Series(np.zeros(len(features))))

            returns = np.zeros(len(features))
            for i in range(len(features) - horizon):
                future_return = (closes.iloc[i + horizon] - closes.iloc[i]) if i + horizon < len(features) else 0
                if future_return > 0.005:
                    returns[i] = 1
                elif future_return < -0.005:
                    returns[i] = 2
                else:
                    returns[i] = 0

            valid = len(features) - horizon
            X = features.iloc[:valid].values
            y = returns[:valid]

            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                min_samples_leaf=5,
                random_state=42,
                n_jobs=-1,
            )
            model.fit(X_scaled, y)

            self._model = model
            self._scaler = scaler
            self._trained = True
            self._last_train_idx = len(features)

            logger.info(f"ML模型训练完成，样本数={valid}，特征数={features.shape[1]}")

        except Exception as e:
            logger.error(f"ML模型训练失败: {e}")
            self._trained = False

    def _fallback_signal(self, kline: KlineData) -> Signal:
        """回退信号（使用简单技术指标）"""
        md = get_market_data()
        rsi = md.calc_rsi(kline, 14)

        if len(rsi) < 15 or np.isnan(rsi[-1]):
            return Signal(direction="neutral", reason="ML未就绪且回退指标不足")

        rsi_val = float(rsi[-1])

        if rsi_val < 30:
            direction = "long"
            strength = 0.6
            reason = f"RSI超卖({rsi_val:.1f})，ML未就绪，使用回退信号"
        elif rsi_val > 70:
            direction = "short"
            strength = 0.6
            reason = f"RSI超买({rsi_val:.1f})，ML未就绪，使用回退信号"
        else:
            direction = "neutral"
            strength = 0.2
            reason = f"RSI中性({rsi_val:.1f})，ML未就绪"

        current_price = kline.last_price
        return Signal(
            direction=direction,
            strength=strength,
            confidence=0.5 + strength * 0.2,
            reason=reason,
            entry_price=current_price,
            stop_loss=current_price * 0.98,
            take_profit=current_price * 1.02,
            indicators={"fallback_rsi": rsi_val},
        )

    def is_trained(self) -> bool:
        return self._trained
