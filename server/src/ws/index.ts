import WebSocket from 'ws';
import { getPrice, getPositions, checkStopLoss, checkTakeProfit } from '../services/trading';
import { type ExchangeId } from '../exchange/client';

const wss = new WebSocket.Server({ noServer: true });

const clients: Set<WebSocket> = new Set();
const subscriptions: Map<string, Set<WebSocket>> = new Map();

let priceUpdateInterval: ReturnType<typeof setInterval> | null = null;
let positionCheckInterval: ReturnType<typeof setInterval> | null = null;

export function initWebSocket(server: any) {
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('WebSocket client connected');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleMessage(ws, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      subscriptions.forEach((clientSet, key) => {
        clientSet.delete(ws);
        if (clientSet.size === 0) {
          subscriptions.delete(key);
        }
      });
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  server.on('upgrade', (request: any, socket: any, head: any) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  startAutoPriceUpdates();
  startPositionChecks();
}

function startAutoPriceUpdates() {
  if (priceUpdateInterval) clearInterval(priceUpdateInterval);
  
  priceUpdateInterval = setInterval(async () => {
    try {
      if (subscriptions.size === 0) return;

      for (const [key, clientSet] of subscriptions) {
        const [exchange, symbol] = key.split('-');
        try {
          const price = await getPrice(exchange as ExchangeId, symbol);
          const message = JSON.stringify({
            type: 'price_update',
            exchange,
            symbol,
            price,
            timestamp: Date.now(),
          });
          for (const client of clientSet) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          }
        } catch (error) {
          console.error(`Price update error for ${key}:`, error);
        }
      }
    } catch (error) {
      console.error('Auto price update error:', error);
    }
  }, 2000);
}

function startPositionChecks() {
  if (positionCheckInterval) clearInterval(positionCheckInterval);
  
  positionCheckInterval = setInterval(async () => {
    try {
      for (const exchange of ['binance', 'okx'] as ExchangeId[]) {
        await checkAndBroadcast(exchange);
      }
    } catch (error) {
      console.error('Position check error:', error);
    }
  }, 3000);
}

async function handleMessage(ws: WebSocket, data: any) {
  switch (data.type) {
    case 'subscribe':
      await handleSubscribe(ws, data);
      break;
    case 'unsubscribe':
      handleUnsubscribe(ws, data);
      break;
    case 'get_price':
      await handleGetPrice(ws, data);
      break;
    case 'get_positions':
      await handleGetPositions(ws, data);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
  }
}

async function handleSubscribe(ws: WebSocket, data: any) {
  const { exchange, symbol } = data;
  const subscriptionKey = `${exchange}-${symbol}`;
  
  if (!subscriptions.has(subscriptionKey)) {
    subscriptions.set(subscriptionKey, new Set());
  }
  subscriptions.get(subscriptionKey)!.add(ws);

  ws.send(JSON.stringify({
    type: 'subscribed',
    exchange,
    symbol,
    timestamp: Date.now(),
  }));

  try {
    const price = await getPrice(exchange as ExchangeId, symbol);
    ws.send(JSON.stringify({
      type: 'price_update',
      exchange,
      symbol,
      price,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Subscribe price error:', error);
  }
}

function handleUnsubscribe(ws: WebSocket, data: any) {
  const { exchange, symbol } = data;
  const subscriptionKey = `${exchange}-${symbol}`;
  
  const clientSet = subscriptions.get(subscriptionKey);
  if (clientSet) {
    clientSet.delete(ws);
    if (clientSet.size === 0) {
      subscriptions.delete(subscriptionKey);
    }
  }
}

async function handleGetPrice(ws: WebSocket, data: any) {
  try {
    const price = await getPrice(data.exchange as ExchangeId, data.symbol);
    ws.send(JSON.stringify({
      type: 'price',
      exchange: data.exchange,
      symbol: data.symbol,
      price,
      timestamp: Date.now(),
    }));
  } catch (error: any) {
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

async function handleGetPositions(ws: WebSocket, data: any) {
  try {
    const positions = await getPositions(data.exchange as ExchangeId, data.symbol);
    ws.send(JSON.stringify({
      type: 'positions',
      exchange: data.exchange,
      positions,
      timestamp: Date.now(),
    }));
  } catch (error: any) {
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

export async function broadcastPriceUpdate(exchange: ExchangeId, symbol: string, price: number) {
  const subscriptionKey = `${exchange}-${symbol}`;
  const clientSet = subscriptions.get(subscriptionKey);
  
  if (!clientSet) return;

  const message = JSON.stringify({
    type: 'price_update',
    exchange,
    symbol,
    price,
    timestamp: Date.now(),
  });

  for (const client of clientSet) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export async function broadcastSignal(signal: any) {
  const message = JSON.stringify({
    type: 'signal',
    signal,
    timestamp: Date.now(),
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export async function broadcastPositionUpdate(exchange: ExchangeId, positions: any[]) {
  const message = JSON.stringify({
    type: 'position_update',
    exchange,
    positions,
    timestamp: Date.now(),
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export async function checkAndBroadcast(exchange: ExchangeId) {
  try {
    const positions = await getPositions(exchange);
    
    if (positions.length > 0) {
      const [slTriggered, tpTriggered] = await Promise.all([
        checkStopLoss(exchange, positions),
        checkTakeProfit(exchange, positions),
      ]);

      if (slTriggered.length > 0) {
        broadcastPositionUpdate(exchange, slTriggered);
      }

      if (tpTriggered.length > 0) {
        broadcastPositionUpdate(exchange, tpTriggered);
      }
    }
  } catch (error) {
    console.error('Check and broadcast error:', error);
  }
}
