import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import routes from './api/routes';
import { config } from './config';
import { migrate } from './db/migrate';
import { initWebSocket } from './ws';
import http from 'http';

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

// 代理 /quant 到 Python 量化服务
app.use('/quant', (req, res, next) => {
  const options = {
    hostname: 'quant-engine',
    port: 8001,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'quant-engine:8001' },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('Quant proxy error:', err.message);
    res.status(502).json({ error: 'Quant backend unavailable', message: err.message });
  });
  req.pipe(proxyReq);
});

const distPath = path.resolve(__dirname, '..', '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/quant/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
initWebSocket(wss);

async function start() {
  console.log('DEBUG: start() called');
  try {
    await migrate();
    console.log('DEBUG: migrate() completed');

    httpServer.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`API: http://0.0.0.0:${config.port}/api`);
      if (fs.existsSync(distPath)) {
        console.log(`Frontend: http://0.0.0.0:${config.port}`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
