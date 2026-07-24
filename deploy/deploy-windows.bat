@echo off
chcp 65001 >nul
REM ============================================
REM 量化交易系统 - Windows 部署脚本
REM 适用：宝塔Windows面板 8.5.0
REM 架构：Vite(5173) → Node.js(3001) + Python(8001)
REM ============================================

echo ============================================
echo   量化交易系统部署脚本
echo ============================================
echo.

REM ---- 配置路径 ----
set BASE_DIR=C:\trading-bot
set SERVER_DIR=%BASE_DIR%\server
set QUANT_DIR=%BASE_DIR%\crypto_quant

REM ---- 1. 创建目录 ----
echo [1/9] 创建目录结构...
mkdir "%BASE_DIR%" 2>nul
mkdir "%SERVER_DIR%\data" 2>nul
echo 完成。
echo.

REM ---- 2. 检查 Node.js ----
echo [2/9] 检查 Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    echo 或在宝塔面板 → 软件商店 → Node.js版本管理器 中安装
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo Node.js 版本: %NODE_VER%
echo.

REM ---- 3. 检查 Python ----
echo [3/9] 检查 Python...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PY_VER=%%i
echo Python 版本: %PY_VER%
echo.

REM ---- 4. 安装 PM2 ----
echo [4/9] 检查 PM2...
call npm list -g pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo 安装 PM2 和 Windows 启动工具...
    call npm install -g pm2 pm2-windows-startup
    call pm2-startup install
)
echo 完成。
echo.

REM ---- 5. 安装前端依赖 ----
echo [5/9] 安装前端依赖...
cd /d "%BASE_DIR%"
call npm install
echo 完成。
echo.

REM ---- 6. 安装后端依赖并构建 ----
echo [6/9] 安装后端依赖...
cd /d "%SERVER_DIR%"
call npm install
echo 构建后端...
call npm run build
echo 运行数据库迁移...
call npm run migrate
echo 完成。
echo.

REM ---- 7. 安装 Python 依赖 ----
echo [7/9] 安装 Python 量化后端依赖...
cd /d "%QUANT_DIR%"
pip install -r requirements.txt
echo 完成。
echo.

REM ---- 8. 配置环境变量 ----
echo [8/9] 配置环境变量...
if not exist "%SERVER_DIR%\.env" (
    copy "%SERVER_DIR%\.env.prod" "%SERVER_DIR%\.env"
    echo 已从 .env.prod 创建 .env，请稍后编辑填入 API Key
)
echo 完成。
echo.

REM ---- 9. 启动服务 ----
echo [9/9] 启动服务...

REM 启动 Node.js 后端 (端口 3001)
cd /d "%SERVER_DIR%"
pm2 start dist/index.js --name trading-bot --env production
pm2 save

REM 启动 Python 量化后端 (端口 8001)
cd /d "%QUANT_DIR%"
pm2 start "python -m crypto_quant.main serve --host 0.0.0.0 --port 8001" --name quant-backend --interpreter python
pm2 save

REM 启动前端 Vite dev server (端口 5173)
REM 使用 --host 0.0.0.0 允许外部访问
cd /d "%BASE_DIR%"
pm2 start "npx vite --host 0.0.0.0 --port 5173" --name frontend
pm2 save

REM 设置开机自启
pm2 save
pm2-startup install

echo.
echo ============================================
echo   部署完成！
echo ============================================
echo.
echo 服务状态:
pm2 list
echo.
echo ====== 接下来请完成以下步骤 ======
echo.
echo 1. 编辑 C:\trading-bot\server\.env 填入:
echo    - BINANCE_API_KEY / BINANCE_API_SECRET
echo    - OKX_API_KEY / OKX_API_SECRET / OKX_PASSPHRASE
echo    - DEEPSEEK_API_KEY
echo.
echo 2. 重启后端:
echo    pm2 restart trading-bot
echo.
echo 3. 宝塔面板 → 网站 → 添加站点:
echo    - 域名: 你的IP或域名
echo    - 配置文件替换为 deploy/nginx-trading-bot.conf 内容
echo.
echo 4. 宝塔面板 → 安全 → 放行端口 80, 5173, 3001, 8001
echo.
echo 5. 浏览器访问 http://你的服务器IP 验证
echo.
echo 常用 PM2 命令:
echo    pm2 list          - 查看服务状态
echo    pm2 logs          - 查看日志
echo    pm2 restart all   - 重启所有服务
echo    pm2 stop all      - 停止所有服务
echo.
pause
