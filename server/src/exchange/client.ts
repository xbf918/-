import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';

export type ExchangeId = 'binance' | 'okx';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number;
  status: string;
  filledQuantity: number;
  createdAt: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  takeProfit?: number;
  stopLoss?: number;
}

export interface Account {
  totalBalance: number;
  availableBalance: number;
  usedMargin: number;
  unrealizedPnl: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class BinanceClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = config.binance.testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
    this.apiKey = config.binance.apiKey;
    this.apiSecret = config.binance.apiSecret;
  }

  private async signedRequest(method: string, endpoint: string, params: Record<string, any> = {}) {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({ ...params, timestamp: timestamp.toString() }).toString();
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');

    return axios({
      method,
      url: `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`,
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
  }

  private async publicRequest(method: string, endpoint: string, params: Record<string, any> = {}) {
    const queryString = new URLSearchParams(params).toString();
    return axios({
      method,
      url: `${this.baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`,
    });
  }

  async getCandles(symbol: string, interval: string, limit: number = 100): Promise<Candle[]> {
    const response = await this.publicRequest('GET', '/api/v3/klines', {
      symbol: symbol.toUpperCase(),
      interval,
      limit,
    });
    return response.data.map((c: any[]) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  async getPrice(symbol: string): Promise<number> {
    const response = await this.publicRequest('GET', '/api/v3/ticker/price', {
      symbol: symbol.toUpperCase(),
    });
    return parseFloat(response.data.price);
  }

  async getAccount(): Promise<Account> {
    const response = await this.signedRequest('GET', '/fapi/v2/account');
    const data = response.data;
    return {
      totalBalance: parseFloat(data.totalWalletBalance),
      availableBalance: parseFloat(data.availableBalance),
      usedMargin: parseFloat(data.marginBalance),
      unrealizedPnl: parseFloat(data.unrealizedProfit),
    };
  }

  async getPositions(symbol?: string): Promise<Position[]> {
    const response = await this.signedRequest('GET', '/fapi/v2/positionRisk');
    let positions = response.data
      .filter((p: any) => parseFloat(p.positionAmt) !== 0)
      .map((p: any) => ({
        id: `${p.symbol}-${p.positionSide}`,
        symbol: p.symbol,
        side: p.positionSide === 'LONG' ? 'LONG' : 'SHORT',
        entryPrice: parseFloat(p.entryPrice),
        quantity: Math.abs(parseFloat(p.positionAmt)),
        leverage: parseInt(p.leverage),
        margin: parseFloat(p.margin),
        unrealizedPnl: parseFloat(p.unrealizedProfit),
        liquidationPrice: parseFloat(p.liquidationPrice),
        takeProfit: parseFloat(p.takeProfit) || undefined,
        stopLoss: parseFloat(p.stopLoss) || undefined,
      }));

    if (symbol) {
      positions = positions.filter((p: Position) => p.symbol === symbol.toUpperCase());
    }

    return positions;
  }

  async placeOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: number,
    leverage: number,
    price?: number,
    takeProfitPrice?: number,
    stopLossPrice?: number,
  ): Promise<Order> {
    await this.signedRequest('POST', '/fapi/v1/leverage', {
      symbol: symbol.toUpperCase(),
      leverage,
    });

    const params: Record<string, any> = {
      symbol: symbol.toUpperCase(),
      side,
      type,
      quantity: quantity.toFixed(3),
      positionSide: 'BOTH',
    };

    if (price) params.price = price.toFixed(2);
    if (takeProfitPrice) params.takeProfitPrice = takeProfitPrice.toFixed(2);
    if (stopLossPrice) params.stopLossPrice = stopLossPrice.toFixed(2);

    const response = await this.signedRequest('POST', '/fapi/v1/order', params);
    const data = response.data;

    return {
      id: data.orderId.toString(),
      symbol: data.symbol,
      side: data.side as OrderSide,
      type: data.type as OrderType,
      quantity: parseFloat(data.origQty),
      price: parseFloat(data.price) || 0,
      status: data.status,
      filledQuantity: parseFloat(data.executedQty),
      createdAt: data.time,
    };
  }

  async closePosition(symbol: string, side?: 'LONG' | 'SHORT'): Promise<void> {
    const positions = await this.getPositions(symbol);
    for (const pos of positions) {
      if (side && pos.side !== side) continue;
      const orderSide: OrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
      await this.placeOrder(symbol, orderSide, 'MARKET', pos.quantity, pos.leverage);
    }
  }

  /**
   * 在 Binance 端设置止损/止盈单
   * 使用 STOP_MARKET 和 TAKE_PROFIT_MARKET 条件单
   */
  async setStopLossTakeProfit(
    symbol: string,
    side: 'LONG' | 'SHORT',
    stopLossPrice?: number,
    takeProfitPrice?: number,
    quantity?: number,
  ): Promise<{ stopLossOrderId?: string; takeProfitOrderId?: string }> {
    const positions = await this.getPositions(symbol);
    const pos = positions.find((p) => p.side === side);
    if (!pos) throw new Error(`No ${side} position for ${symbol}`);

    const qty = quantity || pos.quantity;
    const closeSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    const result: { stopLossOrderId?: string; takeProfitOrderId?: string } = {};

    if (stopLossPrice) {
      try {
        const resp = await this.signedRequest('POST', '/fapi/v1/order', {
          symbol: symbol.toUpperCase(),
          side: closeSide,
          type: 'STOP_MARKET',
          stopPrice: stopLossPrice.toFixed(2),
          quantity: qty.toFixed(3),
          positionSide: 'BOTH',
          reduceOnly: 'true',
          workingType: 'MARK_PRICE',
        });
        result.stopLossOrderId = resp.data.orderId?.toString();
      } catch (err: any) {
        throw new Error(`Binance SL order failed: ${err.response?.data?.msg || err.message}`);
      }
    }

    if (takeProfitPrice) {
      try {
        const resp = await this.signedRequest('POST', '/fapi/v1/order', {
          symbol: symbol.toUpperCase(),
          side: closeSide,
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: takeProfitPrice.toFixed(2),
          quantity: qty.toFixed(3),
          positionSide: 'BOTH',
          reduceOnly: 'true',
          workingType: 'MARK_PRICE',
        });
        result.takeProfitOrderId = resp.data.orderId?.toString();
      } catch (err: any) {
        throw new Error(`Binance TP order failed: ${err.response?.data?.msg || err.message}`);
      }
    }

    return result;
  }

  /**
   * 取消指定 symbol 的所有条件单（止损/止盈）
   */
  async cancelConditionalOrders(symbol: string): Promise<void> {
    const resp = await this.signedRequest('GET', '/fapi/v1/openOrders', {
      symbol: symbol.toUpperCase(),
    });
    const conditionalOrders = (resp.data as any[]).filter(
      (o) => o.type === 'STOP_MARKET' || o.type === 'TAKE_PROFIT_MARKET' || o.type === 'STOP' || o.type === 'TAKE_PROFIT',
    );
    for (const order of conditionalOrders) {
      await this.signedRequest('DELETE', '/fapi/v1/order', {
        symbol: symbol.toUpperCase(),
        orderId: order.orderId,
      });
    }
  }

  /**
   * 部分平仓：按指定数量市价平仓
   */
  async partialClose(symbol: string, side: 'LONG' | 'SHORT', quantity: number, leverage: number): Promise<void> {
    const closeSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    await this.placeOrder(symbol, closeSide, 'MARKET', quantity, leverage);
  }
}

export class OKXClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private passphrase: string;

  constructor() {
    this.baseUrl = config.okx.testnet
      ? 'https://www.okx.com'
      : 'https://www.okx.com';
    this.apiKey = config.okx.apiKey;
    this.apiSecret = config.okx.apiSecret;
    this.passphrase = config.okx.passphrase;
  }

  private async signedRequest(method: string, endpoint: string, params: Record<string, any> = {}) {
    const timestamp = new Date().toISOString();
    const body = method === 'POST' ? JSON.stringify(params) : '';
    const message = `${timestamp}${method}${endpoint}${body}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');

    const url = config.okx.testnet ? `${this.baseUrl}/api/v5` : `${this.baseUrl}/api/v5`;

    return axios({
      method,
      url: `${url}${endpoint}`,
      headers: {
        'OK-ACCESS-KEY': this.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.passphrase,
        'Content-Type': 'application/json',
        'x-simulated-trading': config.okx.testnet ? '1' : '0',
      },
      data: method === 'POST' ? params : undefined,
      params: method !== 'POST' ? params : undefined,
    });
  }

  async getCandles(symbol: string, interval: string, limit: number = 100): Promise<Candle[]> {
    const response = await this.signedRequest('GET', '/market/history-candles', {
      instId: symbol.toUpperCase().replace('/', '-'),
      bar: interval,
      limit,
    });
    const data = response.data.data;
    return data.map((c: any[]) => ({
      timestamp: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  async getPrice(symbol: string): Promise<number> {
    const response = await this.signedRequest('GET', '/market/ticker', {
      instId: symbol.toUpperCase().replace('/', '-'),
    });
    return parseFloat(response.data.data[0].last);
  }

  async getAccount(): Promise<Account> {
    const response = await this.signedRequest('GET', '/account/balance');
    const data = response.data.data[0];
    const usdt = data.details.find((d: any) => d.ccy === 'USDT');
    return {
      totalBalance: parseFloat(usdt?.eqBal || '0'),
      availableBalance: parseFloat(usdt?.availBal || '0'),
      usedMargin: parseFloat(usdt?.frozenBal || '0'),
      unrealizedPnl: 0,
    };
  }

  async getPositions(symbol?: string): Promise<Position[]> {
    const response = await this.signedRequest('GET', '/position/list', {
      instType: 'SWAP',
    });
    let positions = response.data.data
      .filter((p: any) => parseFloat(p.pos) !== 0)
      .map((p: any) => ({
        id: `${p.instId}-${p.posSide}`,
        symbol: p.instId,
        side: p.posSide === 'long' ? 'LONG' : 'SHORT',
        entryPrice: parseFloat(p.avgPx),
        quantity: Math.abs(parseFloat(p.pos)),
        leverage: parseInt(p.leverage),
        margin: parseFloat(p.margin),
        unrealizedPnl: parseFloat(p.unrealizedPnl),
        liquidationPrice: parseFloat(p.liqPx),
        takeProfit: parseFloat(p.takeProfit) || undefined,
        stopLoss: parseFloat(p.stopLoss) || undefined,
      }));

    if (symbol) {
      const upperSymbol = symbol.toUpperCase().replace('/', '-');
      positions = positions.filter((p: Position) => p.symbol === upperSymbol);
    }

    return positions;
  }

  async placeOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: number,
    leverage: number,
    price?: number,
    takeProfitPrice?: number,
    stopLossPrice?: number,
  ): Promise<Order> {
    const params: Record<string, any> = {
      instId: symbol.toUpperCase().replace('/', '-'),
      tdMode: 'isolated',
      side,
      ordType: type,
      sz: quantity.toFixed(3),
      leverage: leverage.toString(),
    };

    if (price) params.px = price.toFixed(2);
    if (takeProfitPrice) params.tpTriggerPx = takeProfitPrice.toFixed(2);
    if (stopLossPrice) params.slTriggerPx = stopLossPrice.toFixed(2);

    const response = await this.signedRequest('POST', '/trade/order', params);
    const data = response.data.data[0];

    return {
      id: data.ordId,
      symbol: data.instId,
      side: data.side as OrderSide,
      type: data.ordType as OrderType,
      quantity: parseFloat(data.sz),
      price: parseFloat(data.px) || 0,
      status: data.state,
      filledQuantity: parseFloat(data.filledSz) || 0,
      createdAt: parseInt(data.cTime),
    };
  }

  async closePosition(symbol: string, side?: 'LONG' | 'SHORT'): Promise<void> {
    const positions = await this.getPositions(symbol);
    for (const pos of positions) {
      if (side && pos.side !== side) continue;
      const orderSide: OrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
      await this.placeOrder(symbol, orderSide, 'MARKET', pos.quantity, pos.leverage);
    }
  }

  /**
   * 在 OKX 端设置止损/止盈单
   * 使用 OKX 的附带止盈止损下单接口 (attachAlgoOrds)
   */
  async setStopLossTakeProfit(
    symbol: string,
    side: 'LONG' | 'SHORT',
    stopLossPrice?: number,
    takeProfitPrice?: number,
    quantity?: number,
  ): Promise<{ stopLossOrderId?: string; takeProfitOrderId?: string }> {
    const positions = await this.getPositions(symbol);
    const pos = positions.find((p) => p.side === side);
    if (!pos) throw new Error(`No ${side} position for ${symbol}`);

    const closeSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    const okxSymbol = symbol.toUpperCase().replace('/', '-');
    const result: { stopLossOrderId?: string; takeProfitOrderId?: string } = {};

    // OKX 通过 algo order 接口设置止损/止盈
    const attachAlgoOrds: any[] = [];
    if (stopLossPrice) {
      attachAlgoOrds.push({
        attachAlgoClOrdId: `sl-${Date.now()}`,
        ordType: 'conditional',
        side: closeSide,
        sz: (quantity || pos.quantity).toFixed(3),
        triggerPx: stopLossPrice.toFixed(2),
        triggerPxType: 'last',
        ordKind: 'stop_loss',
        slOrdPx: '-1', // 市价
      });
    }
    if (takeProfitPrice) {
      attachAlgoOrds.push({
        attachAlgoClOrdId: `tp-${Date.now()}`,
        ordType: 'conditional',
        side: closeSide,
        sz: (quantity || pos.quantity).toFixed(3),
        triggerPx: takeProfitPrice.toFixed(2),
        triggerPxType: 'last',
        ordKind: 'take_profit',
        tpOrdPx: '-1', // 市价
      });
    }

    if (attachAlgoOrds.length > 0) {
      try {
        // 使用 algo order 接口单独下条件单
        for (const algo of attachAlgoOrds) {
          const params: Record<string, any> = {
            instId: okxSymbol,
            tdMode: 'isolated',
            side: algo.side,
            ordType: algo.ordKind === 'stop_loss' ? 'conditional' : 'conditional',
            sz: algo.sz,
            triggerPx: algo.triggerPx,
            triggerPxType: algo.triggerPxType,
            orderPx: '-1',
            leverage: pos.leverage.toString(),
          };
          const resp = await this.signedRequest('POST', '/trade/algo-order', params);
          const orderId = resp.data?.data?.[0]?.algoId;
          if (algo.ordKind === 'stop_loss') {
            result.stopLossOrderId = orderId;
          } else {
            result.takeProfitOrderId = orderId;
          }
        }
      } catch (err: any) {
        throw new Error(`OKX SL/TP order failed: ${err.response?.data?.msg || err.message}`);
      }
    }

    return result;
  }

  /**
   * 取消指定 symbol 的所有条件单（止损/止盈）
   */
  async cancelConditionalOrders(symbol: string): Promise<void> {
    const okxSymbol = symbol.toUpperCase().replace('/', '-');
    const resp = await this.signedRequest('GET', '/trade/orders-algo-pending', {
      instType: 'SWAP',
      instId: okxSymbol,
      ordType: 'conditional',
    });
    const orders = resp.data?.data || [];
    for (const order of orders) {
      await this.signedRequest('POST', '/trade/cancel-algos', {
        algoId: order.algoId,
      });
    }
  }

  /**
   * 部分平仓：按指定数量市价平仓
   */
  async partialClose(symbol: string, side: 'LONG' | 'SHORT', quantity: number, leverage: number): Promise<void> {
    const closeSide: OrderSide = side === 'LONG' ? 'SELL' : 'BUY';
    await this.placeOrder(symbol, closeSide, 'MARKET', quantity, leverage);
  }
}

export const exchanges: Record<ExchangeId, BinanceClient | OKXClient> = {
  binance: new BinanceClient(),
  okx: new OKXClient(),
};