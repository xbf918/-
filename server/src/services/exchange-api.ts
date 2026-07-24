import axios from 'axios';
import crypto from 'crypto';
import { getCredentialsRaw } from './credentials';

async function getCreds(exchange: string) {
  const creds = await getCredentialsRaw();
  return creds.find(c => c.exchange === exchange);
}

function signBinance(params: Record<string, any>, secret: string): string {
  const queryString = new URLSearchParams(params).toString();
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

export async function testConnection(exchange: string, creds: any): Promise<{ success: boolean; error?: string; account?: any }> {
  try {
    if (exchange === 'binance') {
      const timestamp = Date.now();
      const signature = signBinance({ timestamp }, creds.apiSecret);
      const baseUrl = creds.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      
      const resp = await axios.get(`${baseUrl}/fapi/v2/account`, {
        headers: { 'X-MBX-APIKEY': creds.apiKey },
        params: { timestamp, signature },
      });
      return { success: true, account: resp.data };
    } else if (exchange === 'okx') {
      const timestamp = new Date().toISOString();
      const sign = crypto.createHmac('sha256', creds.apiSecret)
        .update(timestamp + 'GET' + '/api/v5/account/balance')
        .digest('base64');
      
      const baseUrl = creds.testnet ? 'https://www.okx.com' : 'https://www.okx.com';
      const resp = await axios.get(`${baseUrl}/api/v5/account/balance`, {
        headers: {
          'OK-ACCESS-KEY': creds.apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': creds.passphrase || '',
        },
      });
      return { success: true, account: resp.data };
    }
    return { success: false, error: 'Unsupported exchange' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getAccount(exchange: string): Promise<any> {
  const creds = await getCreds(exchange);
  if (!creds) throw new Error('No credentials found for ' + exchange);

  if (exchange === 'binance') {
    const timestamp = Date.now();
    const signature = signBinance({ timestamp }, creds.apiSecret);
    const baseUrl = creds.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const resp = await axios.get(`${baseUrl}/fapi/v2/account`, {
      headers: { 'X-MBX-APIKEY': creds.apiKey },
      params: { timestamp, signature },
    });
    return resp.data;
  }
  throw new Error('Unsupported exchange');
}

export async function getPositions(exchange: string, symbol?: string): Promise<any> {
  const creds = await getCreds(exchange);
  if (!creds) throw new Error('No credentials found for ' + exchange);

  if (exchange === 'binance') {
    const timestamp = Date.now();
    const params: any = { timestamp };
    if (symbol) params.symbol = symbol;
    const signature = signBinance(params, creds.apiSecret);
    const baseUrl = creds.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const resp = await axios.get(`${baseUrl}/fapi/v2/positionRisk`, {
      headers: { 'X-MBX-APIKEY': creds.apiKey },
      params: { ...params, signature },
    });
    return resp.data;
  }
  throw new Error('Unsupported exchange');
}

export async function placeOrder(exchange: string, order: any): Promise<any> {
  const creds = await getCreds(exchange);
  if (!creds) throw new Error('No credentials found for ' + exchange);

  if (exchange === 'binance') {
    const timestamp = Date.now();
    const params = { ...order, timestamp };
    const signature = signBinance(params, creds.apiSecret);
    const baseUrl = creds.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const resp = await axios.post(`${baseUrl}/fapi/v1/order`, null, {
      headers: { 'X-MBX-APIKEY': creds.apiKey },
      params: { ...params, signature },
    });
    return resp.data;
  }
  throw new Error('Unsupported exchange');
}

export async function closePosition(exchange: string, order: any): Promise<any> {
  return placeOrder(exchange, {
    ...order,
    side: order.side === 'BUY' ? 'SELL' : 'BUY',
    type: 'MARKET',
    reduceOnly: true,
  });
}

export async function cancelOrder(exchange: string, order: any): Promise<any> {
  const creds = await getCreds(exchange);
  if (!creds) throw new Error('No credentials found for ' + exchange);

  if (exchange === 'binance') {
    const timestamp = Date.now();
    const params = { ...order, timestamp };
    const signature = signBinance(params, creds.apiSecret);
    const baseUrl = creds.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const resp = await axios.delete(`${baseUrl}/fapi/v1/order`, {
      headers: { 'X-MBX-APIKEY': creds.apiKey },
      params: { ...params, signature },
    });
    return resp.data;
  }
  throw new Error('Unsupported exchange');
}

export async function setLeverage(exchange: string, params: any): Promise<any> {
  const creds = await getCreds(exchange);
  if (!creds) throw new Error('No credentials found for ' + exchange);

  if (exchange === 'binance') {
    const timestamp = Date.now();
    const reqParams = { ...params, timestamp };
    const signature = signBinance(reqParams, creds.apiSecret);
    const baseUrl = creds.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const resp = await axios.post(`${baseUrl}/fapi/v1/leverage`, null, {
      headers: { 'X-MBX-APIKEY': creds.apiKey },
      params: { ...reqParams, signature },
    });
    return resp.data;
  }
  throw new Error('Unsupported exchange');
}
