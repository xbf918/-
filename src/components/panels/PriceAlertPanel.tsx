import { useState, useEffect } from 'react';
import { Bell, BellOff, Plus, Trash2, AlertTriangle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchPriceAlerts,
  addPriceAlert,
  removePriceAlert,
  clearTriggeredAlerts,
  type PriceAlert,
} from '@/services/server';
import { useMarketStore } from '@/store/useMarketStore';

export function PriceAlertPanel() {
  const symbol = useMarketStore((s) => s.symbol);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newAlert, setNewAlert] = useState({
    targetPrice: '',
    direction: 'above' as 'above' | 'below',
    message: '',
  });
  const [currentPrice, setCurrentPrice] = useState(0);

  useEffect(() => {
    loadAlerts();
  }, [symbol]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', exchange: 'binance', symbol }));
    };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'price_update') {
        setCurrentPrice(data.price);
      }
      if (data.type === 'signal' && data.signal.type === 'price_alert') {
        showNotification(data.signal);
        loadAlerts();
      }
    };
    return () => ws.close();
  }, [symbol]);

  const loadAlerts = async () => {
    const data = await fetchPriceAlerts('binance', symbol);
    setAlerts(data);
  };

  const handleAddAlert = async () => {
    if (!newAlert.targetPrice || !newAlert.message) return;
    const alert: Omit<PriceAlert, 'triggered'> = {
      id: `alert-${Date.now()}`,
      exchange: 'binance',
      symbol,
      targetPrice: parseFloat(newAlert.targetPrice),
      direction: newAlert.direction,
      message: newAlert.message,
    };
    await addPriceAlert(alert);
    setNewAlert({ targetPrice: '', direction: 'above', message: '' });
    setIsAdding(false);
    loadAlerts();
  };

  const handleRemoveAlert = async (id: string) => {
    await removePriceAlert(id);
    loadAlerts();
  };

  const showNotification = (alert: any) => {
    if (Notification.permission === 'granted') {
      new Notification('价格告警', {
        body: `${alert.message}\n${alert.symbol}: $${alert.currentPrice.toLocaleString()}`,
        icon: '/favicon.ico',
      });
    }
    playAlertSound();
  };

  const playAlertSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const activeAlerts = alerts.filter((a) => !a.triggered);
  const triggeredAlerts = alerts.filter((a) => a.triggered);

  return (
    <div className="rounded-lg border border-ink/10 bg-void-200/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-blue" />
          <span className="font-mono text-xs font-bold text-ink">价格监控</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-ink-muted">
            当前: <span className="text-neon-green">${currentPrice.toLocaleString()}</span>
          </span>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="rounded bg-blue/10 p-1 text-blue hover:bg-blue/20 transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="mb-2 rounded bg-void-200/50 p-2 space-y-2">
          <input
            type="number"
            placeholder="目标价格"
            value={newAlert.targetPrice}
            onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
            className="w-full rounded bg-void-200 border border-ink/20 px-2 py-1 font-mono text-xs text-ink placeholder-ink-muted focus:border-blue focus:outline-none"
          />
          <div className="flex gap-1">
            <button
              onClick={() => setNewAlert({ ...newAlert, direction: 'above' })}
              className={cn(
                'flex-1 rounded px-2 py-1 font-mono text-[10px] transition-colors',
                newAlert.direction === 'above'
                  ? 'bg-neon-green/20 text-neon-green'
                  : 'bg-void-200 text-ink-muted hover:bg-void-100',
              )}
            >
              <ArrowUpCircle className="inline h-3 w-3" /> 突破
            </button>
            <button
              onClick={() => setNewAlert({ ...newAlert, direction: 'below' })}
              className={cn(
                'flex-1 rounded px-2 py-1 font-mono text-[10px] transition-colors',
                newAlert.direction === 'below'
                  ? 'bg-red/20 text-red'
                  : 'bg-void-200 text-ink-muted hover:bg-void-100',
              )}
            >
              <ArrowDownCircle className="inline h-3 w-3" /> 跌破
            </button>
          </div>
          <input
            type="text"
            placeholder="告警消息（如：触及止盈位）"
            value={newAlert.message}
            onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
            className="w-full rounded bg-void-200 border border-ink/20 px-2 py-1 font-mono text-xs text-ink placeholder-ink-muted focus:border-blue focus:outline-none"
          />
          <button
            onClick={handleAddAlert}
            className="w-full rounded bg-blue/20 py-1 font-mono text-[10px] text-blue hover:bg-blue/30 transition-colors"
          >
            添加告警
          </button>
        </div>
      )}

      {activeAlerts.length > 0 ? (
        <div className="space-y-1.5">
          {activeAlerts.map((alert) => {
            const distance = currentPrice > 0
              ? ((alert.targetPrice - currentPrice) / currentPrice * 100).toFixed(2)
              : '0';
            const isNear = Math.abs(parseFloat(distance)) < 0.5;
            return (
              <div
                key={alert.id}
                className={cn(
                  'rounded p-2 font-mono text-[10px]',
                  isNear ? 'bg-yellow/10 border border-yellow/30' : 'bg-void-200/50',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    {alert.direction === 'above' ? (
                      <ArrowUpCircle className="h-3 w-3 text-neon-green" />
                    ) : (
                      <ArrowDownCircle className="h-3 w-3 text-red" />
                    )}
                    <span className={alert.direction === 'above' ? 'text-neon-green' : 'text-red'}>
                      {alert.direction === 'above' ? '突破' : '跌破'}
                    </span>
                    <span className="text-ink">$ {alert.targetPrice.toLocaleString()}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveAlert(alert.id)}
                    className="text-ink-muted hover:text-red transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted truncate max-w-[120px]">{alert.message}</span>
                  <span className={isNear ? 'text-yellow' : 'text-ink-muted'}>
                    {parseFloat(distance) > 0 ? '+' : ''}{distance}%
                  </span>
                </div>
                {isNear && (
                  <div className="mt-1 flex items-center gap-1 text-yellow">
                    <AlertTriangle className="h-3 w-3" />
                    <span>价格接近目标！</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="font-mono text-[10px] text-ink-muted text-center py-2">
          <BellOff className="h-4 w-4 mx-auto mb-1 opacity-50" />
          暂无监控价位，点击 + 添加
        </div>
      )}

      {triggeredAlerts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-ink/10">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] text-ink-muted">已触发 ({triggeredAlerts.length})</span>
            <button
              onClick={clearTriggeredAlerts}
              className="font-mono text-[9px] text-blue hover:text-blue-light"
            >
              清除
            </button>
          </div>
          {triggeredAlerts.map((alert) => (
            <div key={alert.id} className="rounded bg-ink/5 p-1 font-mono text-[9px] text-ink-muted mb-1">
              {alert.message} - ${alert.targetPrice.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
