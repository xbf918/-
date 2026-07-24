import { useState } from "react";
import { Settings, Power, Zap, Target, TrendingUp, Shield, RefreshCcw, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useTradingStore } from "@/store/useTradingStore";
import { formatPrice, formatPercent, formatCompact } from "@/lib/format";
import { useTranslation } from "react-i18next";

export function TradingConfigPanel() {
  const { t } = useTranslation();
  const config = useTradingStore((s) => s.config);
  const balance = useTradingStore((s) => s.balance);
  const stats = useTradingStore((s) => s.stats);
  const setConfig = useTradingStore((s) => s.setConfig);
  const toggleAutoTrading = useTradingStore((s) => s.toggleAutoTrading);
  const resetAccount = useTradingStore((s) => s.resetAccount);
  const [showReset, setShowReset] = useState(false);

  const leverageOptions = [1, 2, 5, 10, 20, 50, 100];

  return (
    <Panel title={t("tradingConfig.title")} icon={<Settings className="h-3.5 w-3.5" />}>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Power className={`h-4 w-4 ${config.enabled ? "text-neon-green" : "text-ink-dim"}`} />
            <span className="font-display text-[11px] font-semibold uppercase tracking-wider">
              {t("tradingConfig.autoTrade")}
            </span>
          </div>
          <button
            onClick={toggleAutoTrading}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              config.enabled ? "bg-neon-green/30" : "bg-void-300"
            }`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
                config.enabled
                  ? "left-[22px] bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.6)]"
                  : "left-0.5 bg-ink-muted"
              }`}
            />
          </button>
        </div>

        {config.enabled && (
          <div className="rounded border border-neon-green/30 bg-neon-green/5 px-2 py-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-neon-green">
              <Zap className="h-3 w-3" />
              <span>{t("tradingConfig.enabled")}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-panel-border pt-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-neon-cyan" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
              {t("tradingConfig.leverage")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {leverageOptions.map((lev) => (
              <button
                key={lev}
                onClick={() => setConfig({ leverage: lev })}
                className={`rounded border px-2 py-1 font-mono text-[10px] transition-colors ${
                  config.leverage === lev
                    ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan"
                    : "border-panel-border bg-void-200/50 text-ink-muted hover:border-neon-cyan/50 hover:text-ink"
                }`}
              >
                {lev}x
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-panel-border pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-neon-green" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                {t("tradingConfig.takeProfit", { percent: config.takeProfitPercent })}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="20"
              step="0.5"
              value={config.takeProfitPercent}
              onChange={(e) => setConfig({ takeProfitPercent: parseFloat(e.target.value) })}
              className="h-1 w-24 accent-neon-green"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-neon-red" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                {t("tradingConfig.stopLoss", { percent: config.stopLossPercent })}
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="10"
              step="0.1"
              value={config.stopLossPercent}
              onChange={(e) => setConfig({ stopLossPercent: parseFloat(e.target.value) })}
              className="h-1 w-24 accent-neon-red"
            />
          </div>
        </div>

        <div className="space-y-2 border-t border-panel-border pt-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-ink-dim">{t("tradingConfig.positionPercent")}</span>
            <span className="font-mono text-[10px] text-ink">{config.orderSizePercent}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={config.orderSizePercent}
            onChange={(e) => setConfig({ orderSizePercent: parseFloat(e.target.value) })}
            className="h-1 w-full accent-neon-cyan"
          />
          <div className="font-mono text-[9px] text-ink-dim">
            {t("tradingConfig.availableCalc", {
              balance: formatCompact(balance.available),
              percent: config.orderSizePercent,
              margin: formatCompact(balance.available * config.orderSizePercent / 100),
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-panel-border pt-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-ink-dim">{t("tradingConfig.signalThreshold")}</span>
            <span className="font-mono text-[10px] text-neon-cyan">{config.signalThreshold}</span>
          </div>
          <input
            type="range"
            min="40"
            max="90"
            step="5"
            value={config.signalThreshold}
            onChange={(e) => setConfig({ signalThreshold: parseFloat(e.target.value) })}
            className="h-1 w-full accent-neon-cyan"
          />
        </div>

        <div className="space-y-2 border-t border-panel-border pt-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
              <input
                type="checkbox"
                checked={config.trailingStop}
                onChange={(e) => setConfig({ trailingStop: e.target.checked })}
                className="accent-neon-cyan"
              />
              {t("tradingConfig.trailingStop")}
            </label>
            {config.trailingStop && (
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="0.2"
                  max="5"
                  step="0.1"
                  value={config.trailingStopPercent}
                  onChange={(e) => setConfig({ trailingStopPercent: parseFloat(e.target.value) })}
                  className="h-1 w-16 accent-neon-cyan"
                />
                <span className="font-mono text-[9px] text-ink-muted">{config.trailingStopPercent}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-panel-border pt-2">
          <StatBox label={t("tradingConfig.totalAssets")} value={`${formatCompact(balance.total)}`} unit="USDT" />
          <StatBox label={t("tradingConfig.unrealizedPnl")} value={`${balance.unrealizedPnl >= 0 ? "+" : ""}${formatCompact(balance.unrealizedPnl)}`} unit="USDT" positive={balance.unrealizedPnl >= 0} />
          <StatBox label={t("tradingConfig.winRate")} value={`${stats.winRate.toFixed(1)}%`} unit="" />
          <StatBox label={t("tradingConfig.totalPnl")} value={`${stats.totalPnl >= 0 ? "+" : ""}${formatCompact(stats.totalPnl)}`} unit="USDT" positive={stats.totalPnl >= 0} />
        </div>

        <div className="border-t border-panel-border pt-2">
          <button
            onClick={() => setShowReset(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-neon-red/30 bg-neon-red/5 py-1.5 font-mono text-[10px] text-neon-red/70 transition-colors hover:bg-neon-red/10 hover:text-neon-red"
          >
            <RefreshCcw className="h-3 w-3" />
            {t("tradingConfig.resetAccount")}
          </button>
        </div>
      </div>

      {showReset && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-void/80 backdrop-blur-sm">
          <div className="w-[80%] space-y-3 rounded-lg border border-neon-red/30 bg-panel p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-neon-red" />
              <span className="font-display text-sm font-semibold text-ink">{t("tradingConfig.confirmReset")}</span>
            </div>
            <p className="font-mono text-[10px] text-ink-dim">
              {t("tradingConfig.resetWarning")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReset(false)}
                className="flex-1 rounded border border-panel-border bg-void-200 py-1.5 font-mono text-[10px] text-ink-muted hover:bg-void-300"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  resetAccount();
                  setShowReset(false);
                }}
                className="flex-1 rounded border border-neon-red/50 bg-neon-red/10 py-1.5 font-mono text-[10px] text-neon-red hover:bg-neon-red/20"
              >
                {t("tradingConfig.confirmResetBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function StatBox({ label, value, unit, positive }: { label: string; value: string; unit: string; positive?: boolean }) {
  return (
    <div className="rounded border border-panel-border/50 bg-void-200/30 px-2 py-1.5">
      <div className="font-mono text-[8px] uppercase tracking-wider text-ink-dim">{label}</div>
      <div className={`font-mono text-[12px] font-bold num ${
        positive !== undefined
          ? positive
            ? "text-neon-green text-glow-green"
            : "text-neon-red text-glow-red"
          : "text-ink"
      }`}>
        {value} <span className="text-[9px] font-normal text-ink-dim">{unit}</span>
      </div>
    </div>
  );
}
