import unittest

from crypto_quant.config.settings import RiskConfig
from crypto_quant.risk.risk_manager import RiskManager


class RiskManagerTests(unittest.TestCase):
    def setUp(self):
        self.risk = RiskManager(RiskConfig(initial_capital=1000, max_total_exposure_pct=0.5))

    def test_candidate_order_is_included_in_total_exposure(self):
        self.risk.on_position_opened("BTC/USDT", {"value": 400})
        result = self.risk.check_new_order("ETH/USDT", "long", 2, 100, 95, current_equity=1000)
        self.assertFalse(result.passed)
        self.assertIn("总敞口", result.reason)

    def test_rejects_missing_or_invalid_order_data(self):
        result = self.risk.check_new_order("BTC/USDT", "long", 0, 100, 95)
        self.assertFalse(result.passed)


if __name__ == "__main__":
    unittest.main()
