/**
 * Python 量化后端 API 客户端
 * 对接 crypto_quant FastAPI 服务
 */

const QUANT_API_BASE = import.meta.env.VITE_QUANT_API_URL || '/quant';

export interface StrategyInfo {
  name: string;
  class: string;
  description: string;
  default_params?: Record<string, any>;
}

export interface QuantSignal {
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  confidence: number;
  reason: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  indicators: Record<string, any>;
}

export interface QuantSignalResponse {
  status: string;
  signal: QuantSignal;
  strategy: string;
  symbol: string;
  timeframe: string;
}

export interface QuantIndicators {
  rsi: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  };
  atr: number | null;
  kdj: {
    k: number | null;
    d: number | null;
    j: number | null;
  };
  ma: {
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
  };
}

export interface QuantIndicatorsResponse {
  status: string;
  symbol: string;
  timeframe: string;
  price: number;
  indicators: QuantIndicators;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  strategy: string;
  params: Record<string, any>;
  initial_capital: number;
  final_capital: number;
  total_return_pct: number;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  winning_trades: number;
  losing_trades: number;
  total_commission: number;
  metrics: Record<string, any>;
  equity_curve: number[];
  drawdown_curve: number[];
  trades: Array<{
    id: number;
    symbol: string;
    side: string;
    entry_price: number;
    exit_price: number;
    size: number;
    pnl: number;
    pnl_percent: number;
    entry_time: number;
    exit_time: number;
    reason: string;
  }>;
}

export interface BacktestResponse {
  status: string;
  result: BacktestResult;
}

export interface PaperAccount {
  initial_capital: number;
  balance: number;
  equity: number;
  total_pnl: number;
  total_pnl_pct: number;
  open_positions: number;
  total_trades: number;
  win_rate: number;
  commission_rate: number;
}

export interface PaperPosition {
  symbol: string;
  side: string;
  entry_price: number;
  size: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${QUANT_API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Quant API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchQuantHealth(): Promise<{ status: string; service: string; version: string }> {
  return request('/health');
}

export async function fetchStrategies(): Promise<Record<string, StrategyInfo>> {
  return request('/strategies');
}

export async function fetchStrategyInfo(name: string): Promise<StrategyInfo & { default_params: Record<string, any> }> {
  return request(`/strategies/${name}`);
}

export async function fetchStrategySignal(
  symbol: string,
  timeframe: string,
  strategy: string,
  params: Record<string, any> = {},
  limit = 200,
): Promise<QuantSignalResponse> {
  return request('/signal', {
    method: 'POST',
    body: JSON.stringify({ symbol, timeframe, strategy, params, limit }),
  });
}

export async function fetchQuantIndicators(
  symbol: string,
  timeframe = '1h',
  limit = 200,
): Promise<QuantIndicatorsResponse> {
  return request(`/indicators?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`);
}

export async function runBacktest(
  symbol: string,
  timeframe: string,
  strategy: string,
  params: Record<string, any> = {},
  initialCapital = 10000,
  limit = 500,
): Promise<BacktestResponse> {
  return request('/backtest', {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      timeframe,
      strategy,
      params,
      initial_capital: initialCapital,
      limit,
    }),
  });
}

export interface MarketRegime {
  regime: 'bull_trend' | 'bear_trend' | 'bull_range' | 'bear_range' | 'sideways';
  trend: 'uptrend' | 'downtrend' | 'sideways';
  trend_strength: number;
  volatility: 'low' | 'normal' | 'high' | 'extreme';
  volatility_value: number;
  adx: number;
  price_position: number;
  ma_alignment: number;
  atr_ratio: number;
}

export interface MarketRegimeResponse {
  status: string;
  symbol: string;
  timeframe: string;
  regime: MarketRegime;
}

export interface StrategyVote {
  direction: string;
  weight: number;
  vote: number;
}

export interface MultiStrategySignal {
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  confidence: number;
  reason: string;
  strategy_votes: Record<string, StrategyVote>;
  regime?: string;
  agreement: number;
  market_state?: MarketRegime;
}

export interface MultiStrategySignalResponse {
  status: string;
  symbol: string;
  timeframe: string;
  combined_signal: MultiStrategySignal;
  strategy_signals: Record<string, QuantSignal>;
}

export interface MultiTimeframeSignalResponse {
  status: string;
  symbol: string;
  trend_timeframe: string;
  entry_timeframe: string;
  result: {
    aligned: boolean;
    direction: string;
    strength: number;
    confidence: number;
    filter_reason: string;
    trend_direction: string;
    entry_direction: string;
  };
  trend_signal: {
    direction: string;
    strength: number;
    confidence: number;
    reason: string;
  };
  entry_signal: {
    direction: string;
    strength: number;
    confidence: number;
    reason: string;
  };
}

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  strategy: string;
  params?: Record<string, any>;
  initialCapital?: number;
  limit?: number;
  leverage?: number;
  signal_lag?: number;
  slippage_model?: 'fixed' | 'atr_based' | 'volatility_based' | 'volume_based';
  slippage_rate?: number;
  commission_rate?: number;
  atr_period?: number;
  trailing_stop_atr?: number;
  time_stop_bars?: number;
  position_risk_pct?: number;
}

export async function fetchMarketRegime(
  symbol: string,
  timeframe = '1h',
  limit = 200,
): Promise<MarketRegimeResponse> {
  return request(
    `/market/regime?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
  );
}

export async function fetchMultiStrategySignal(
  symbol: string,
  timeframe: string,
  strategies: string[],
  params: Record<string, Record<string, any>> = {},
  useRegimeWeights = true,
  customWeights?: Record<string, number>,
  limit = 200,
): Promise<MultiStrategySignalResponse> {
  return request('/signal/multi', {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      timeframe,
      strategies,
      params,
      limit,
      use_regime_weights: useRegimeWeights,
      custom_weights: customWeights,
    }),
  });
}

export async function fetchMultiTimeframeSignal(
  symbol: string,
  trendTimeframe: string,
  entryTimeframe: string,
  strategy: string,
  params: Record<string, any> = {},
  limit = 200,
): Promise<MultiTimeframeSignalResponse> {
  return request('/signal/multi_timeframe', {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      trend_timeframe: trendTimeframe,
      entry_timeframe: entryTimeframe,
      strategy,
      params,
      limit,
    }),
  });
}

export interface SignalStats {
  total_signals: number;
  hit_tp_count: number;
  hit_sl_count: number;
  ongoing_count: number;
  timeout_count: number;
  accuracy_pct: number;
  avg_return_pct: number;
  avg_bars_to_result: number;
}

export interface SignalRecord {
  id: number;
  created_at: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  strength: number;
  market_regime: string;
  verified: number;
  outcome: string;
  max_profit_pct: number;
  max_loss_pct: number;
  final_return_pct: number;
  bars_elapsed: number;
  verified_at: string;
}

export interface TimeframeResonance {
  timeframes: Record<string, { direction: string; strength: number; confidence: number }>;
  is_resonance: boolean;
  resonance_direction: string;
  resonance_strength: number;
  aligned_count: number;
  total_count: number;
}

export async function fetchSignalStats(
  symbol: string,
  timeframe?: string,
  strategy?: string,
  days = 30,
): Promise<{ status: string; stats: SignalStats }> {
  const params = new URLSearchParams({ symbol, days: String(days) });
  if (timeframe) params.append('timeframe', timeframe);
  if (strategy) params.append('strategy', strategy);
  return request(`/signals/stats?${params.toString()}`);
}

export async function fetchSignalHistory(
  symbol: string,
  timeframe?: string,
  limit = 50,
  verified_only = false,
): Promise<{ status: string; signals: SignalRecord[] }> {
  const params = new URLSearchParams({ symbol, limit: String(limit) });
  if (timeframe) params.append('timeframe', timeframe);
  if (verified_only) params.append('verified_only', 'true');
  return request(`/signals/history?${params.toString()}`);
}

export async function fetchTimeframeResonance(
  symbol: string,
  strategy = 'ma_trend',
  timeframes = ['15m', '1h', '4h'],
): Promise<{ status: string; resonance: TimeframeResonance }> {
  const params = new URLSearchParams({ symbol, strategy });
  timeframes.forEach((tf) => params.append('timeframes', tf));
  return request(`/signals/resonance?${params.toString()}`);
}

export async function runEnhancedBacktest(config: BacktestConfig): Promise<BacktestResponse> {
  return request('/backtest', {
    method: 'POST',
    body: JSON.stringify({
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategy: config.strategy,
      params: config.params || {},
      initial_capital: config.initialCapital ?? 10000,
      limit: config.limit ?? 500,
      leverage: config.leverage ?? 1,
      signal_lag: config.signal_lag ?? 1,
      slippage_model: config.slippage_model ?? 'volatility_based',
      slippage_rate: config.slippage_rate ?? 0.0002,
      commission_rate: config.commission_rate ?? 0.0004,
      atr_period: config.atr_period ?? 14,
      trailing_stop_atr: config.trailing_stop_atr ?? 0,
      time_stop_bars: config.time_stop_bars ?? 0,
      position_risk_pct: config.position_risk_pct ?? 0.02,
    }),
  });
}

export async function fetchPaperAccount(): Promise<{ status: string; account: PaperAccount }> {
  return request('/paper/account');
}

export async function fetchPaperPositions(): Promise<{ status: string; positions: Record<string, PaperPosition> }> {
  return request('/paper/positions');
}

export async function placePaperOrder(
  symbol: string,
  side: 'buy' | 'sell',
  orderType: 'market' | 'limit',
  amount: number,
  price?: number,
): Promise<{ status: string; order: any }> {
  return request('/paper/order', {
    method: 'POST',
    body: JSON.stringify({ symbol, side, order_type: orderType, amount, price }),
  });
}

export async function closePaperPosition(
  symbol: string,
  reason = 'manual',
): Promise<{ status: string; trade?: any; msg?: string }> {
  return request(`/paper/close/${encodeURIComponent(symbol)}?reason=${reason}`, {
    method: 'POST',
  });
}

export async function fetchPaperTrades(limit = 50): Promise<{ status: string; trades: any[] }> {
  return request(`/paper/trades?limit=${limit}`);
}

export async function fetchExchangeTicker(symbol: string): Promise<{ status: string; ticker: any }> {
  return request(`/exchange/ticker?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchExchangeMarkets(): Promise<{ status: string; symbols: string[] }> {
  return request('/exchange/markets');
}

// ==================== 高级分析接口 ====================

export interface WalkForwardConfig {
  symbol: string;
  timeframe: string;
  strategy: string;
  paramGrid: Record<string, any[]>;
  baseConfig?: Record<string, any>;
  numWindows?: number;
  trainRatio?: number;
  optimizeMetric?: string;
  limit?: number;
}

export interface WalkForwardResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  in_sample: Array<{
    window: number;
    return_pct: number;
    sharpe: number;
    win_rate: number;
    max_dd: number;
    trades: number;
  }>;
  out_of_sample: Array<{
    window: number;
    return_pct: number;
    sharpe: number;
    win_rate: number;
    max_dd: number;
    trades: number;
  }>;
  optimized_params: Record<string, any>[];
  combined_oos_equity: number[];
  metrics: {
    avg_is_return: number;
    avg_oos_return: number;
    stability_ratio: number;
    oos_win_rate: number;
    combined_total_return: number;
    combined_sharpe: number;
    combined_max_dd: number;
    walk_forward_efficiency: number;
  };
}

export async function runWalkForwardAnalysis(config: WalkForwardConfig): Promise<WalkForwardResponse> {
  return request('/analysis/walk_forward', {
    method: 'POST',
    body: JSON.stringify({
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategy: config.strategy,
      param_grid: config.paramGrid,
      base_config: config.baseConfig || {},
      num_windows: config.numWindows ?? 4,
      train_ratio: config.trainRatio ?? 0.75,
      optimize_metric: config.optimizeMetric || 'sharpe_ratio',
      limit: config.limit ?? 800,
    }),
  });
}

export interface SensitivityConfig {
  symbol: string;
  timeframe: string;
  strategy: string;
  paramGrid: Record<string, any[]>;
  baseConfig?: Record<string, any>;
  limit?: number;
}

export interface SensitivityResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  robustness_score: number;
  plateau_ratio: number;
  heatmap: {
    x_param: string;
    y_param: string | null;
    x_values: any[];
    y_values: any[];
    return_matrix: number[][];
  };
  top_results: Array<{
    params: Record<string, any>;
    total_return: number;
    sharpe_ratio: number;
    win_rate: number;
    max_drawdown: number;
    profit_factor: number;
    total_trades: number;
  }>;
  total_combinations: number;
}

export async function runSensitivityAnalysis(config: SensitivityConfig): Promise<SensitivityResponse> {
  return request('/analysis/sensitivity', {
    method: 'POST',
    body: JSON.stringify({
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategy: config.strategy,
      param_grid: config.paramGrid,
      base_config: config.baseConfig || {},
      limit: config.limit ?? 500,
    }),
  });
}

export interface PortfolioConfig {
  symbol: string;
  timeframe: string;
  strategies: string[];
  params?: Record<string, Record<string, any>>;
  baseConfig?: Record<string, any>;
  method?: 'sharpe' | 'risk_parity' | 'equal';
  limit?: number;
}

export interface PortfolioResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategies: string[];
  method: string;
  correlation_matrix: Record<string, Record<string, number>>;
  optimal_weights: Record<string, number>;
  equal_weight: {
    return: number;
    sharpe: number;
    max_dd: number;
  };
  optimal: {
    return: number;
    sharpe: number;
    max_dd: number;
  };
  diversification_ratio: number;
}

export async function runPortfolioOptimization(config: PortfolioConfig): Promise<PortfolioResponse> {
  return request('/analysis/portfolio', {
    method: 'POST',
    body: JSON.stringify({
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategies: config.strategies,
      params: config.params || {},
      base_config: config.baseConfig || {},
      method: config.method || 'sharpe',
      limit: config.limit ?? 500,
    }),
  });
}

export interface MonteCarloConfig {
  symbol: string;
  timeframe: string;
  strategy: string;
  params?: Record<string, any>;
  baseConfig?: Record<string, any>;
  numSimulations?: number;
  ruinThreshold?: number;
  limit?: number;
}

export interface MonteCarloResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  num_simulations: number;
  final_equity: {
    mean: number;
    median: number;
    percentiles: Record<string, number>;
  };
  max_drawdown: {
    percentiles: Record<string, number>;
  };
  ruin_probability: number;
  positive_probability: number;
  sample_simulations: number[][];
  realized_trades: number;
}

export async function runMonteCarloSimulation(config: MonteCarloConfig): Promise<MonteCarloResponse> {
  return request('/analysis/monte_carlo', {
    method: 'POST',
    body: JSON.stringify({
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategy: config.strategy,
      params: config.params || {},
      base_config: config.baseConfig || {},
      num_simulations: config.numSimulations ?? 500,
      ruin_threshold: config.ruinThreshold ?? 0.5,
      limit: config.limit ?? 500,
    }),
  });
}

export interface KellyConfig {
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  fraction?: number;
  capital?: number;
  entryPrice?: number;
  stopLoss?: number;
  leverage?: number;
}

export interface KellyResponse {
  status: string;
  kelly_fraction_percent: number;
  fraction_type: string;
  risk_amount: number;
  position_size: number;
  leverage: number;
}

export async function calcKellyPosition(config: KellyConfig): Promise<KellyResponse> {
  return request('/analysis/kelly', {
    method: 'POST',
    body: JSON.stringify({
      win_rate: config.winRate,
      avg_win_pct: config.avgWinPct,
      avg_loss_pct: config.avgLossPct,
      fraction: config.fraction ?? 0.25,
      capital: config.capital ?? 10000,
      entry_price: config.entryPrice,
      stop_loss: config.stopLoss,
      leverage: config.leverage ?? 1,
    }),
  });
}

// ==================== 第三阶段：专业级功能 ====================

// 策略健康度诊断
export interface HealthDiagnosisResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  overall_score: number;
  grade: 'excellent' | 'good' | 'warning' | 'critical';
  equity_rsi: number | null;
  decay_rate: number;
  decay_status: string;
  recovery_trend: string;
  fatigue_level: number;
  regime_adaptability: number;
  details: Record<string, any>;
  recommendations: string[];
}

export async function runHealthDiagnosis(
  symbol: string,
  timeframe: string,
  strategy: string,
  limit = 500,
): Promise<HealthDiagnosisResponse> {
  return request(
    `/analysis/health?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&strategy=${strategy}&limit=${limit}`,
    { method: 'POST' },
  );
}

// 交易成本分析
export interface CostAnalysisResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  exchange: string;
  fee_tier: string;
  execution_type: string;
  costs: {
    total_commission: number;
    total_funding: number;
    total_slippage: number;
    total_impact: number;
    total_gap_risk: number;
    total_all_costs: number;
    cost_breakdown_pct: Record<string, number>;
    net_return_after_costs: number;
    cost_ratio: number;
  };
  funding_impact: {
    funding_rate_per_8h: number;
    cost_per_trade: number;
    annual_cost: number;
    annual_pct: number;
    direction: string;
  };
  impact_by_capital: Record<string, number>;
}

export async function runCostAnalysis(
  symbol: string,
  timeframe: string,
  strategy: string,
  exchange = 'binance',
  feeTier = 'regular',
  executionType = 'taker',
  limit = 500,
): Promise<CostAnalysisResponse> {
  return request(
    `/analysis/costs?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&strategy=${strategy}&exchange=${exchange}&fee_tier=${feeTier}&execution_type=${executionType}&limit=${limit}`,
    { method: 'POST' },
  );
}

// 贝叶斯优化
export interface BayesianOptConfig {
  symbol: string;
  timeframe: string;
  strategy: string;
  paramRanges: Record<string, any[]>;
  baseConfig?: Record<string, any>;
  maxEvaluations?: number;
  initialRandom?: number;
  optimizeMetric?: string;
  limit?: number;
}

export interface BayesianOptResponse {
  status: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  best_params: Record<string, any>;
  best_score: number;
  total_evaluations: number;
  convergence: number[];
  history: Array<{
    iteration: number;
    params: Record<string, any>;
    score: number;
    type: string;
  }>;
}

export async function runBayesianOptimization(config: BayesianOptConfig): Promise<BayesianOptResponse> {
  return request('/analysis/bayesian_optimize', {
    method: 'POST',
    body: JSON.stringify({
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategy: config.strategy,
      param_ranges: config.paramRanges,
      base_config: config.baseConfig || {},
      max_evaluations: config.maxEvaluations ?? 20,
      initial_random: config.initialRandom ?? 5,
      optimize_metric: config.optimizeMetric || 'sharpe_ratio',
      limit: config.limit ?? 500,
    }),
  });
}

// 历史回测数据查询
export async function queryBacktestHistory(
  strategy?: string,
  symbol?: string,
  limit = 20,
): Promise<{ status: string; results: any[]; count: number }> {
  const params = new URLSearchParams();
  if (strategy) params.set('strategy', strategy);
  if (symbol) params.set('symbol', symbol);
  params.set('limit', String(limit));
  return request(`/data/backtests?${params}`);
}

export async function getBacktestDetail(
  backtestId: number,
): Promise<{ status: string; result: any }> {
  return request(`/data/backtests/${backtestId}`);
}

export async function compareStrategyResults(
  symbol = 'BTC/USDT',
  timeframe = '1h',
  limit = 10,
): Promise<{ status: string; comparison: any[] }> {
  return request(`/data/compare?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`);
}
