#!/bin/bash

set -e

echo "========================================="
echo "  Oracle Cloud Trading Bot Deployment"
echo "========================================="
echo ""

# Oracle Cloud 永久免费版配置
APP_DIR="/home/ubuntu/trading-bot"
PORT=3001

echo "[1/8] Updating system..."
sudo apt-get update && sudo apt-get upgrade -y

echo ""
echo "[2/8] Installing dependencies..."
sudo apt-get install -y curl build-essential sqlite3

echo ""
echo "[3/8] Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ""
echo "[4/8] Installing PM2..."
sudo npm install -g pm2

echo ""
echo "[5/8] Creating app directory..."
mkdir -p $APP_DIR/server/data
cd $APP_DIR

echo ""
echo "[6/8] Cloning project..."
# 如果使用 git
git clone https://github.com/your-repo/trading-bot.git . 2>/dev/null || echo "Please upload files manually"

echo ""
echo "[7/8] Installing dependencies..."
cd $APP_DIR/server
npm ci --production 2>/dev/null || npm install

echo ""
echo "[8/8] Configuring firewall..."
# Oracle Cloud 需要在控制台开放端口，这里配置 UFW
sudo ufw allow $PORT/tcp 2>/dev/null || true
sudo ufw allow OpenSSH
sudo ufw --force enable 2>/dev/null || true

echo ""
echo "========================================="
echo "  Setup completed!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Upload your project files to $APP_DIR"
echo "  2. Edit .env file: nano $APP_DIR/server/.env"
echo "  3. Run: cd $APP_DIR/server && npm run build"
echo "  4. Start: pm2 start dist/index.js --name trading-bot"
echo ""
echo "  Important: Open port $PORT in Oracle Cloud Console"
echo "    Networking > Virtual Cloud Networks > Security Lists"
echo ""
