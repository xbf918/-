import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    path: process.env.DB_PATH || './data/trading.db',
  },
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    testnet: process.env.BINANCE_TESTNET === 'true',
  },
  okx: {
    apiKey: process.env.OKX_API_KEY || '',
    apiSecret: process.env.OKX_API_SECRET || '',
    passphrase: process.env.OKX_PASSPHRASE || '',
    testnet: process.env.OKX_TESTNET === 'true',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};