import axios from 'axios';

export async function fetchFearGreedIndex(limit = 7): Promise<any> {
  try {
    const resp = await axios.get(`https://api.alternative.me/fng/?limit=${limit}`);
    return resp.data;
  } catch (error: any) {
    throw new Error('Failed to fetch fear & greed index: ' + error.message);
  }
}

export async function fetchCryptoNews(currency = 'BTC'): Promise<any> {
  try {
    const resp = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${currency}&lang=EN`);
    return resp.data;
  } catch (error: any) {
    throw new Error('Failed to fetch crypto news: ' + error.message);
  }
}

export async function fetchOnchainData(coinId = 'bitcoin'): Promise<any> {
  try {
    const resp = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7&interval=daily`);
    return resp.data;
  } catch (error: any) {
    throw new Error('Failed to fetch onchain data: ' + error.message);
  }
}
