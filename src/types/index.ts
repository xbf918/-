// ============ 基础行情类型 ============

export type Timeframe = "15m" | "1h" | "4h" | "1d";

export interface Candle {
  time: number; // 开盘时间 (秒)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
}

// ============ 技术指标类型 ============

export interface SupportResistance {
  price: number;
  type: "support" | "resistance";
  strength: number; // 1-5
  touches: number;
  lastTouch: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
  crossover?: "bullish" | "bearish";
}

export interface MACDSummary {
  current: MACDPoint;
  trend: "bullish" | "bearish" | "neutral";
  histogramRising: boolean;
  aboveZero: boolean;
  lastCrossover?: MACDPoint;
}

// RSI 指标类型
export interface RSIPoint {
  time: number;
  value: number;
}

export interface RSISummary {
  value: number;
  zone: "overbought" | "oversold" | "normal";
  rising: boolean;
  signal: "bullish" | "bearish" | "neutral";
}

// KDJ 指标类型
export interface KDJPoint {
  time: number;
  k: number;
  d: number;
  j: number;
  signal?: "overbought" | "oversold" | "golden_cross" | "death_cross";
}

export interface KDJSummary {
  current: KDJPoint;
  trend: "bullish" | "bearish" | "neutral";
  kRising: boolean;
  zone: "overbought" | "oversold" | "normal";
  lastCross?: { type: "golden" | "death"; point: KDJPoint };
}

// CVD 累积成交量差值类型
export interface CVDPoint {
  time: number;
  cvd: number;
  delta: number;
  volume: number;
}

export interface CVDSummary {
  current: CVDPoint;
  trend: "bullish" | "bearish" | "neutral";
  diverging: boolean;
  cvdRising: boolean;
}

// OI 持仓量类型
export interface OIDataPoint {
  time: number;
  openInterest: number;
  openInterestValue: number;
}

export interface OISummary {
  current: OIDataPoint;
  trend: "bullish" | "bearish" | "neutral";
  change24h: number;
  changePercent: number;
  rising: boolean;
  diverging: boolean;
}

export type DivergenceType =
  | "regular_bearish"
  | "regular_bullish"
  | "hidden_bearish"
  | "hidden_bullish";

export interface Divergence {
  type: DivergenceType;
  startTime: number;
  endTime: number;
  priceStart: number;
  priceEnd: number;
  indicatorStart: number;
  indicatorEnd: number;
  strength: "weak" | "medium" | "strong";
}

export interface Gap {
  type: "price_gap" | "fvg";
  startTime: number;
  endTime: number;
  topPrice: number;
  bottomPrice: number;
  filled: boolean;
}

// ============ K线形态类型 ============

export type CandlePatternType =
  // 单根K线 - 看涨
  | "hammer"
  | "inverted_hammer"
  | "bullish_marubozu"
  | "dragonfly_doji"
  // 单根K线 - 看跌
  | "shooting_star"
  | "hanging_man"
  | "bearish_marubozu"
  | "gravestone_doji"
  // 单根K线 - 中性
  | "doji"
  | "spinning_top"
  // 两根K线 - 看涨
  | "bullish_engulfing"
  | "piercing_pattern"
  | "bullish_harami"
  // 两根K线 - 看跌
  | "bearish_engulfing"
  | "dark_cloud_cover"
  | "bearish_harami"
  // 三根K线 - 看涨
  | "morning_star"
  | "three_white_soldiers"
  // 三根K线 - 看跌
  | "evening_star"
  | "three_black_crows";

export type ChartPatternType =
  | "head_and_shoulders_top"
  | "head_and_shoulders_bottom"
  | "double_top"
  | "double_bottom"
  | "ascending_triangle"
  | "descending_triangle"
  | "symmetrical_triangle"
  | "rising_wedge"
  | "falling_wedge"
  | "bull_flag"
  | "bear_flag";

export interface CandlePattern {
  type: CandlePatternType;
  direction: "bullish" | "bearish" | "neutral";
  strength: 1 | 2 | 3; // 形态强度 1-3
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
}

export interface ChartPattern {
  type: ChartPatternType;
  direction: "bullish" | "bearish" | "neutral";
  strength: 1 | 2 | 3;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  neckline?: number;
  targetPrice?: number;
}

export interface PatternSummary {
  candlePatterns: CandlePattern[];
  chartPatterns: ChartPattern[];
  bullishCount: number;
  bearishCount: number;
  score: number; // -100 ~ +100
}

export interface LiquidityZone {
  priceLow: number;
  priceHigh: number;
  side: "bid" | "ask";
  totalQty: number;
  notional: number;
  isWall: boolean;
  distancePct: number;
}

// ============ 多周期共振类型 ============

export type SignalDirection = "bullish" | "bearish" | "neutral";

export interface TimeframeSignal {
  timeframe: Timeframe;
  trend: SignalDirection;
  macdSignal: SignalDirection;
  rsiSignal: "overbought" | "oversold" | "neutral";
  priceVsEma: SignalDirection;
  resonance: number; // 0-100
}

// ============ 消息面类型 ============

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedOn: number;
  categories: string[];
  body?: string;
  titleZh?: string;
  bodyZh?: string;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number; // -100 to 100
}

export interface FearGreedIndex {
  value: number; // 0-100
  classification: string;
  timestamp: number;
  yesterday: number;
  lastWeek: number;
  lastMonth: number;
}

// ============ 综合评分类型 ============

export interface SignalScore {
  total: number; // 0-100
  direction: "long" | "short" | "neutral";
  confidence: number; // 0-100
  components: {
    technical: number;
    liquidity: number;
    divergence: number;
    sentiment: number;
    timeframe: number;
    patterns: number;
  };
  reasons: string[];
  timestamp: number;
}

// ============ 状态管理类型 ============

export type LoadingState = "idle" | "loading" | "success" | "error";

export interface SymbolInfo {
  symbol: string;
  base: string;
  quote: string;
}

// 评分权重配置
export interface ScoreWeights {
  technical: number;
  divergence: number;
  liquidity: number;
  timeframe: number;
  sentiment: number;
}

// 策略学习状态
export interface StrategyLearning {
  enabled: boolean;
  weights: ScoreWeights;
  dimensionStats: DimensionStats;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  learningHistory: LearningRecord[];
  riskMode: "normal" | "conservative" | "aggressive";
  lastAdjustmentTime: number | null;
}

// 各维度统计
export interface DimensionStats {
  technical: DimensionStat;
  divergence: DimensionStat;
  liquidity: DimensionStat;
  timeframe: DimensionStat;
  sentiment: DimensionStat;
  patterns: DimensionStat;
  volumeFlow: DimensionStat;
}

export interface DimensionStat {
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  recentWins: number;
  recentLosses: number;
}

// 学习记录
export interface LearningRecord {
  timestamp: number;
  reason: "win" | "loss" | "consecutive_loss" | "manual";
  dimension: keyof DimensionStats;
  oldWeight: number;
  newWeight: number;
  pnl: number;
  confidence: number;
}

// ============ 交易相关类型 ============

export type PositionSide = "long" | "short";
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";
export type OrderAction = "open" | "close";

export interface TradePosition {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  quantity: number;
  leverage: number;
  margin: number;
  takeProfit: number | null;
  stopLoss: number | null;
  liquidationPrice: number;
  openTime: number;
  closeTime?: number;
  closePrice?: number;
  pnl?: number;
  pnlPercent?: number;
  reason?: string;
}

export interface TradeOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  action: OrderAction;
  quantity: number;
  price: number;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
  status: OrderStatus;
  filledTime?: number;
  createTime: number;
  reason?: string;
}

export interface TradeHistory {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  openTime: number;
  closeTime: number;
  reason: string;
}

export interface AccountBalance {
  total: number;
  available: number;
  usedMargin: number;
  unrealizedPnl: number;
}

export interface TradingConfig {
  enabled: boolean;
  leverage: number;
  orderSizePercent: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  signalThreshold: number;
  maxOpenPositions: number;
  allowHedge: boolean;
  trailingStop: boolean;
  trailingStopPercent: number;
}

export interface TradingStats {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}
