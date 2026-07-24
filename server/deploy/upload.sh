#!/bin/bash

set -e

SERVER=$1
REMOTE_DIR="/root/trading-bot"

if [ -z "$SERVER" ]; then
    echo "Usage: ./upload.sh user@server-ip"
    echo "Example: ./upload.sh root@123.45.67.89"
    exit 1
fi

echo "Uploading files to $SERVER..."

ssh $SERVER "mkdir -p $REMOTE_DIR/server"

scp -r ../src $SERVER:$REMOTE_DIR/server/
scp -r ../package.json $SERVER:$REMOTE_DIR/server/
scp -r ../package-lock.json $SERVER:$REMOTE_DIR/server/ 2>/dev/null || true
scp -r ../tsconfig.json $SERVER:$REMOTE_DIR/server/
scp -r ./.env.prod $SERVER:$REMOTE_DIR/server/.env 2>/dev/null || true
scp -r ./deploy.sh $SERVER:$REMOTE_DIR/server/

echo ""
echo "Upload completed!"
echo ""
echo "Next steps:"
echo "  1. SSH into server: ssh $SERVER"
echo "  2. Go to server dir: cd $REMOTE_DIR/server"
echo "  3. Edit .env file: nano .env"
echo "  4. Run deploy: chmod +x deploy.sh && ./deploy.sh"
echo ""