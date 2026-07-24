#!/bin/bash

set -e

echo "========================================="
echo "  Oracle Cloud Trading Bot Auto Deploy"
echo "========================================="
echo ""

APP_DIR="/home/ubuntu/trading-bot/server"

echo "[1/10] System update..."
sudo apt-get update -y

echo ""
echo "[2/10] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs sqlite3

echo ""
echo "[3/10] Installing PM2..."
sudo npm install -g pm2

echo ""
echo "[4/10] Creating directories..."
mkdir -p $APP_DIR/data
mkdir -p $APP_DIR/dist

echo ""
echo "[5/10] Please upload your project files now..."
echo "  Run this on your local machine:"
echo "  scp -r server/* ubuntu@YOUR_ORACLE_IP:$APP_DIR/"
echo ""
read -p "Press Enter after uploading files..."

echo ""
echo "[6/10] Installing dependencies..."
cd $APP_DIR
npm install

echo ""
echo "[7/10] Building project..."
npm run build

echo ""
echo "[8/10] Running database migration..."
node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('$APP_DIR/data/trading.db');
db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');
    db.run('CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, side TEXT NOT NULL, entry_price REAL NOT NULL, exit_price REAL, quantity REAL NOT NULL, leverage INTEGER NOT NULL, margin REAL NOT NULL, pnl REAL DEFAULT 0, pnl_percent REAL DEFAULT 0, status TEXT NOT NULL DEFAULT \"open\", reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, direction TEXT NOT NULL, strength REAL NOT NULL, confidence REAL NOT NULL, price REAL NOT NULL, signal_data TEXT, traded BOOLEAN DEFAULT FALSE, trade_id INTEGER, outcome TEXT, created_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, side TEXT NOT NULL, entry_price REAL NOT NULL, quantity REAL NOT NULL, leverage INTEGER NOT NULL, margin REAL NOT NULL, take_profit REAL, stop_loss REAL, liquidation_price REAL, exchange TEXT NOT NULL, external_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    db.run('CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)');
    db.run('CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol)');
    console.log('Database ready');
});
db.close();
"

echo ""
echo "[9/10] Configuring auto-start..."
pm2 delete trading-bot 2>/dev/null || true
pm2 start $APP_DIR/dist/index.js --name trading-bot
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save

echo ""
echo "[10/10] Opening firewall..."
sudo ufw allow 3001/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

echo ""
echo "========================================="
echo "  Deployment Complete!"
echo "========================================="
echo ""
echo "  API:     http://YOUR_IP:3001/api"
echo "  Health:  http://YOUR_IP:3001/api/health"
echo ""
echo "  Commands:"
echo "    pm2 status        - Check status"
echo "    pm2 logs          - View logs"
echo "    pm2 restart all   - Restart service"
echo ""
echo "  IMPORTANT: Open port 3001 in Oracle Console:"
echo "    1. Go to Oracle Cloud Console"
echo "    2. Networking > Virtual Cloud Networks"
echo "    3. Click your VCN"
echo "    4. Security Lists > Default Security List"
echo "    5. Add Ingress Rule:"
echo "       - Source CIDR: 0.0.0.0/0"
echo "       - Destination Port: 3001"
echo ""
