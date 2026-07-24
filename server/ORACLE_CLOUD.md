# Oracle Cloud 永久免费服务器部署指南

## 1. 注册 Oracle Cloud

1. 访问 https://www.oracle.com/cloud/free/
2. 使用邮箱注册（支持国内邮箱）
3. 填写信用卡验证（不会扣费，仅验证）
4. 选择区域：**亚太-新加坡 (Singapore)** 或 **亚太-东京 (Tokyo)**

## 2. 创建免费实例

1. 登录 Oracle Cloud Console
2. 点击左上角菜单 → **Compute** → **Instances**
3. 点击 **Create Instance**
4. 配置：
   - Name: trading-bot
   - Compartment: 默认
   - Placement: 默认
   - Image: **Canonical Ubuntu 22.04**
   - Shape: **VM.Standard.A1.Flex** (ARM, 永久免费)
     - OCPUs: **2**
     - Memory: **12 GB** (免费额度内)
   - Networking: 创建新的 VCN
   - Add SSH keys: 生成新密钥对，下载私钥
   - Boot volume: 默认 50GB

5. 点击 **Create**

## 3. 配置安全组（开放端口）

**重要：必须手动开放端口！**

1. 左侧菜单 → **Networking** → **Virtual Cloud Networks**
2. 点击你创建的 VCN
3. 点击 **Security Lists** → **Default Security List**
4. 点击 **Add Ingress Rules**
5. 添加以下规则：

| 来源 CIDR | 协议 | 目标端口 | 说明 |
|-----------|------|----------|------|
| 0.0.0.0/0 | TCP | 22 | SSH |
| 0.0.0.0/0 | TCP | 3001 | 交易API |
| 0.0.0.0/0 | TCP | 80 | HTTP |
| 0.0.0.0/0 | TCP | 443 | HTTPS |

## 4. SSH 连接服务器

```bash
# 修改私钥权限
chmod 600 ~/Downloads/ssh-key.key

# 连接（替换为你的公网IP）
ssh -i ~/Downloads/ssh-key.key ubuntu@YOUR_ORACLE_IP
```

## 5. 上传项目文件

在本地终端执行：

```bash
# 压缩项目
cd /path/to/your/project
tar -czf trading-bot.tar.gz server/

# 上传到服务器
scp -i ~/Downloads/ssh-key.key trading-bot.tar.gz ubuntu@YOUR_ORACLE_IP:/home/ubuntu/

# SSH 登录解压
ssh -i ~/Downloads/ssh-key.key ubuntu@YOUR_ORACLE_IP
tar -xzf trading-bot.tar.gz
```

## 6. 运行部署脚本

```bash
cd /home/ubuntu/server/deploy
chmod +x oracle-cloud-full.sh
./oracle-cloud-full.sh
```

## 7. 配置环境变量

```bash
nano /home/ubuntu/trading-bot/server/.env
```

填入你的交易所 API Key：
```
PORT=3001
NODE_ENV=production

BINANCE_API_KEY=你的币安API Key
BINANCE_API_SECRET=你的币安Secret
BINANCE_TESTNET=false

OKX_API_KEY=你的OKX API Key
OKX_API_SECRET=你的OKX Secret
OKX_PASSPHRASE=你的OKX密码
OKX_TESTNET=false

DB_PATH=/home/ubuntu/trading-bot/server/data/trading.db
```

## 8. 启动服务

```bash
cd /home/ubuntu/trading-bot/server
npm run build
pm2 start dist/index.js --name trading-bot
pm2 save
```

## 9. 验证部署

```bash
# 本地测试
curl http://YOUR_ORACLE_IP:3001/api/health

# 查看日志
pm2 logs
```

## 10. 设置域名（可选）

如果使用域名，配置 Nginx 反向代理：

```bash
sudo apt-get install -y nginx

# 编辑配置
sudo nano /etc/nginx/sites-available/trading-bot
```

添加：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用：
```bash
sudo ln -s /etc/nginx/sites-available/trading-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 运维命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs trading-bot

# 重启
pm2 restart trading-bot

# 停止
pm2 stop trading-bot

# 监控
pm2 monit

# 数据库查询
sqlite3 /home/ubuntu/trading-bot/server/data/trading.db "SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;"
```

## 常见问题

**Q: 无法访问 3001 端口？**
A: 检查 Oracle Cloud 安全组是否开放端口，参考步骤 3

**Q: ARM 架构兼容问题？**
A: Node.js 18+ 完全支持 ARM，无需额外配置

**Q: 内存不足？**
A: Oracle 免费版提供 12GB 内存，足够运行。如不足可添加 Swap：
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

**Q: 连接断开？**
A: 配置 SSH 保持连接：
```bash
echo "ClientAliveInterval 60" >> ~/.ssh/config
```
