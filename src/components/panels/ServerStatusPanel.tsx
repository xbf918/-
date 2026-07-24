import { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff, Activity, BarChart3, Clock, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchHealth, fetchStats, WebSocketClient } from '@/services/server';

interface ServerStats {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: string;
  totalPnl: string;
  totalSignals: number;
  tradedSignals: number;
}

export function ServerStatusPanel() {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const start = Date.now();
        await fetchHealth();
        setLatency(Date.now() - start);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      if (!connected) return;
      try {
        const s = await fetchStats();
        setStats(s);
        setLastUpdate(Date.now());
      } catch {
        // ignore
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  useEffect(() => {
    const ws = new WebSocketClient();
    ws.connect((data) => {
      if (data.type === 'signal') {
        console.log('Received signal:', data.signal);
      }
    });

    return () => ws.disconnect();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4" />
          <span className="font-mono text-xs text-ink">服务器状态</span>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono',
          connected ? 'bg-neon-green/20 text-neon-green' : 'bg-red/20 text-red'
        )}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? '在线' : '离线'}
        </div>
      </div>

      {connected && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-ink/5 rounded">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3 h-3 text-neon-green" />
              <span className="font-mono text-[10px] text-ink-muted">延迟</span>
            </div>
            <div className="font-mono text-sm">{latency}ms</div>
          </div>

          <div className="p-2 bg-ink/5 rounded">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3 h-3 text-blue" />
              <span className="font-mono text-[10px] text-ink-muted">更新</span>
            </div>
            <div className="font-mono text-sm">{Math.floor((Date.now() - lastUpdate) / 1000)}s</div>
          </div>

          <div className="p-2 bg-ink/5 rounded">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-3 h-3 text-yellow" />
              <span className="font-mono text-[10px] text-ink-muted">总交易</span>
            </div>
            <div className="font-mono text-sm">{stats?.totalTrades || 0}</div>
          </div>

          <div className="p-2 bg-ink/5 rounded">
            <div className="flex items-center gap-1.5 mb-1">
              <Database className="w-3 h-3 text-purple" />
              <span className="font-mono text-[10px] text-ink-muted">胜率</span>
            </div>
            <div className="font-mono text-sm">{stats?.winRate || '0'}%</div>
          </div>
        </div>
      )}

      {stats && (
        <div className="p-2 bg-ink/5 rounded">
          <div className="font-mono text-[10px] text-ink-muted mb-2">交易统计</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="font-mono text-xs">{stats.winTrades}</div>
              <div className="font-mono text-[9px] text-neon-green">盈利</div>
            </div>
            <div>
              <div className="font-mono text-xs">{stats.lossTrades}</div>
              <div className="font-mono text-[9px] text-red">亏损</div>
            </div>
            <div>
              <div className="font-mono text-xs">{stats.openTrades}</div>
              <div className="font-mono text-[9px] text-blue">持仓</div>
            </div>
            <div>
              <div className={`font-mono text-xs ${parseFloat(stats.totalPnl) >= 0 ? 'text-neon-green' : 'text-red'}`}>
                {stats.totalPnl}
              </div>
              <div className="font-mono text-[9px] text-ink-muted">盈亏</div>
            </div>
          </div>
        </div>
      )}

      {!connected && (
        <div className="p-3 bg-red/10 rounded border border-red/20">
          <div className="font-mono text-xs text-red mb-1">连接失败</div>
          <div className="font-mono text-[10px] text-ink-muted">
            请确保后端服务器已启动 (http://localhost:3001)
          </div>
        </div>
      )}
    </div>
  );
}