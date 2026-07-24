#!/bin/bash

set -e

echo "========================================="
echo "  Trading Bot Server Deployment Script"
echo "========================================="
echo ""

APP_DIR="/root/trading-bot/server"

echo "[1/6] Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

echo ""
echo "[2/6] Installing PM2..."
npm install -g pm2

echo ""
echo "[3/6] Installing dependencies..."
cd $APP_DIR
npm ci

echo ""
echo "[4/6] Building project..."
npm run build

echo ""
echo "[5/6] Running database migration..."
mkdir -p $APP_DIR/data
node -e "
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const dbPath = path.join('$APP_DIR', 'data', 'trading.db');
const db = new sqlite3.Database(dbPath);

db.serialize(function() {
    db.run('CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, side TEXT NOT NULL, entry_price REAL NOT NULL, exit_price REAL, quantity REAL NOT NULL, leverage INTEGER NOT NULL, margin REAL NOT NULL, pnl REAL DEFAULT 0, pnl_percent REAL DEFAULT 0, status TEXT NOT NULL DEFAULT \"open\", reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, direction TEXT NOT NULL, strength REAL NOT NULL, confidence REAL NOT NULL, price REAL NOT NULL, signal_data TEXT, traded BOOLEAN DEFAULT FALSE, trade_id INTEGER, outcome TEXT, created_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, side TEXT NOT NULL, entry_price REAL NOT NULL, quantity REAL NOT NULL, leverage INTEGER NOT NULL, margin REAL NOT NULL, take_profit REAL, stop_loss REAL, liquidation_price REAL, exchange TEXT NOT NULL, external_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS market_data (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, timeframe TEXT NOT NULL, open_time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, created_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS agent_results (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, symbol TEXT NOT NULL, result TEXT NOT NULL, confidence REAL NOT NULL, created_at INTEGER NOT NULL)');
    db.run('CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)');
    db.run('CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol)');
    db.run('CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)');
    console.log('Migration completed');
});

db.close();
"

echo ""
echo "[6/6] Starting service with PM2..."
pm2 delete trading-bot 2>/dev/null || true
pm2 start dist/index.js --name trading-bot -- --port 3001
pm2 save

echo ""
echo "========================================="
echo "  Deployment completed!"
echo "========================================="
echo ""
echo "  Server: http://localhost:3001"
echo "  API:    http://localhost:3001/api"
echo "  Health: http://localhost:3001/api/health"
echo ""
echo "  View logs: pm2 logs trading-bot"
echo "  Status:    pm2 status"
echo "  Restart:   pm2 restart trading-bot"
echo "  Stop:      pm2 stop trading-bot"
echo ""