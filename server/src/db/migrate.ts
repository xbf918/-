import { db, run } from './index';
import fs from 'fs';
import path from 'path';

const dbDir = path.resolve(__dirname, '..', '..', 'data');

export async function migrate() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      email_verified INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange TEXT UNIQUE NOT NULL,
      apiKey TEXT NOT NULL,
      apiSecret TEXT NOT NULL,
      passphrase TEXT DEFAULT '',
      testnet INTEGER DEFAULT 0,
      validated INTEGER DEFAULT 0,
      permissions TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      quantity REAL NOT NULL,
      leverage INTEGER NOT NULL,
      margin REAL NOT NULL,
      pnl REAL DEFAULT 0,
      pnl_percent REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      strength REAL NOT NULL,
      confidence REAL NOT NULL,
      price REAL NOT NULL,
      signal_data TEXT,
      traded BOOLEAN DEFAULT FALSE,
      trade_id INTEGER,
      outcome TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity REAL NOT NULL,
      leverage INTEGER NOT NULL,
      margin REAL NOT NULL,
      take_profit REAL,
      stop_loss REAL,
      liquidation_price REAL,
      exchange TEXT NOT NULL,
      external_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS market_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      open_time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS agent_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      result TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)
  `);

  console.log('Database migration completed');
}

