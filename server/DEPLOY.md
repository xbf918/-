# 交易机器人服务器部署指南

## 快速开始

### 方式一：PM2 部署（推荐，轻量）

#### 1. 上传文件到服务器

```bash
cd server/deploy
chmod +x upload.sh
./upload.sh root@你的服务器IP
```

#### 2. SSH 登录服务器

```bash
ssh root@你的服务器IP
cd /root/trading-bot/server
```

#### 3. 配置环境变量

```bash
nano .env
```

填入你的交易所 API Key：
```
BINANCE_API_KEY=你的币安API Key
BINANCE_API_SECRET=你的币安Secret
OKX_API_KEY=你的OKX API Key
OKX_API_SECRET=你的OKX Secret
OKX_PASSPHRASE=你的OKX密码
```

#### 4. 运行部署脚本

```bash
chmod +x deploy.sh
./deploy.sh
```

#### 5. 验证服务

```bash
curl http://localhost:3001/api/health
pm2 status
pm2 logs trading-bot
```

---

### 方式二：Docker 部署

#### 1. 上传文件到服务器

```bash
scp -r server root@你的服务器IP:/root/trading-bot/
```

#### 2. SSH 登录并配置

```bash
ssh root@你的服务器IP
cd /root/trading-bot/server
cp .env.prod .env
nano .env  # 填入 API Key
```

#### 3. 启动 Docker

```bash
docker-compose up -d --build
```

#### 4. 查看日志

```bash
docker-compose logs -f
```

---

## 服务器要求

### 最低配置
- CPU: 1核
- 内存: 1GB
- 硬盘: 10GB
- 系统: Ubuntu 20.04+ / CentOS 7+

### 推荐配置
- CPU: 2核
- 内存: 2GB
- 硬盘: 20GB SSD
- 系统: Ubuntu 22.04 LTS

---

## 常用运维命令

### PM2 命令

```bash
pm2 status                    # 查看状态
pm2 logs trading-bot          # 查看日志
pm2 restart trading-bot       # 重启服务
pm2 stop trading-bot          # 停止服务
pm2 start trading-bot         # 启动服务
pm2 delete trading-bot        # 删除服务
pm2 monit                     # 监控面板
```

### Docker 命令

```bash
docker-compose up -d          # 启动服务
docker-compose down           # 停止服务
docker-compose restart        # 重启服务
docker-compose logs -f        # 查看日志
docker-compose ps             # 查看状态
```

### 数据库操作

```bash
# 进入数据库
sqlite3 data/trading.db

# 查看表
.tables

# 查询交易记录
SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;

# 查询信号
SELECT * FROM signals ORDER BY created_at DESC LIMIT 10;

# 退出
.quit
```

---

## 安全建议

1. **API Key 权限**
   - 只开通合约交易权限
   - 不要开通提现权限
   - 设置 IP 白名单

2. **服务器安全**
   - 开启防火墙，只开放必要端口
   - 使用 SSH key 登录，禁用密码登录
   - 定期更新系统

3. **数据备份**
   - 定期备份数据库文件
   - 重要交易记录导出保存

---

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 3001 | API + WebSocket | 后端服务 |

---

## 更新部署

### PM2 更新

```bash
# 本地构建
cd server
npm run build

# 上传 dist 目录
scp -r dist root@服务器IP:/root/trading-bot/server/

# 重启服务
ssh root@服务器IP "pm2 restart trading-bot"
```

### Docker 更新

```bash
docker-compose pull
docker-compose up -d --build
```

---

## 故障排查

### 服务无法启动

```bash
pm2 logs trading-bot --lines 50
```

### 数据库错误

```bash
# 检查数据库文件权限
ls -la data/

# 修复数据库
sqlite3 data/trading.db "VACUUM;"
```

### API 请求失败

```bash
# 检查网络
curl https://api.binance.com/api/v3/ping

# 检查 API Key
curl -H "X-MBX-APIKEY: 你的KEY" https://api.binance.com/sapi/v1/account
```

---

## 联系支持

如有问题，请查看日志或检查 API Key 配置。