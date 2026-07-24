/**
 * 币种扫描器面板
 * 24小时持续自动扫描、倒计时、统计、自动开仓
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Radar,
  Play,
  Pause,
  Loader2,
  TrendingUp,
  TrendingDown,
  Zap,
  Settings,
  X,
  Plus,
  Clock,
  BarChart3,
  RotateCcw,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useScannerStore, type ScannerConfig } from "@/store/useScannerStore";
import { useMarketStore } from "@/store/useMarketStore";
import { useTradingStore } from "@/store/useTradingStore";
import { useExchangeStore } from "@/store/useExchangeStore";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { rankRotationSignals, selectBestSymbols } from "@/lib/risk/scannerAutoTrade";

export function ScannerPanel() {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const { config, results, scanning, lastScanTime, error, stats, nextScanIn } = useScannerStore();
  const agentAnalysisProgress = useScannerStore((s) => s.agentAnalysisProgress);
  const setConfig = useScannerStore((s) => s.setConfig);
  const toggleAutoScan = useScannerStore((s) => s.toggleAutoScan);
  const toggleAutoTrade = useScannerStore((s) => s.toggleAutoTrade);
  const scanOnce = useScannerStore((s) => s.scanOnce);
  const tickNextScan = useScannerStore((s) => s.tickNextScan);
  const resetStats = useScannerStore((s) => s.resetStats);

  const news = useMarketStore((s) => s.news);
  const fearGreed = useMarketStore((s) => s.fearGreed);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const loadAll = useMarketStore((s) => s.loadAll);

  // 倒计时计时器（每秒 tick）
  useEffect(() => {
    if (!config.autoScan || nextScanIn <= 0) return;
    const timer = setInterval(() => {
      tickNextScan();
    }, 1000);
    return () => clearInterval(timer);
  }, [config.autoScan, nextScanIn, tickNextScan]);

  // 自动扫描：倒计时到0时触发扫描
  const scanningRef = useRef(false);
  useEffect(() => {
    if (!config.autoScan) return;
    if (nextScanIn > 0) return;
    if (scanningRef.current) return;
    scanningRef.current = true;
    scanOnce(news, fearGreed).finally(() => {
      scanningRef.current = false;
    });
  }, [config.autoScan, nextScanIn, scanOnce, news, fearGreed]);

  // 启动时恢复自动扫描：如果是持久化的自动扫描状态，立即开始倒计时
  useEffect(() => {
    if (config.autoScan && nextScanIn === 0 && !scanning) {
      setConfig({ scanInterval: config.scanInterval });
      // 触发首次扫描
      const timer = setTimeout(() => {
        scanOnce(news, fearGreed);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // 自动交易 + 轮动
  const { positions, balance, config: tradingConfig, manualOpenPosition, liveMode, liveOpenPosition } = useTradingStore();
  const { mode, activeExchange } = useExchangeStore();
  const tradedSymbols = useScannerStore((s) => s.tradedSymbols);
  const addTraded = useScannerStore((s) => s.addTraded);

  useEffect(() => {
    if (!config.autoTrade) return;
    if (results.length === 0) return;

    const currentSymbols = positions.map((p) => p.symbol);
    const rankedSignals = rankRotationSignals(results);

    // 轮动模式：从排名中选取最优新标的
    if (config.rotationEnabled) {
      const availableSlots = Math.max(
        0,
        (config.maxRotationPositions || 3) - positions.length,
      );
      const bestSignals = selectBestSymbols(
        rankedSignals,
        currentSymbols,
        availableSlots,
        config.requireAgentConfirmation,
      );

      for (const signal of bestSignals) {
        if (tradedSymbols.has(signal.symbol)) continue;

        if (liveMode && activeExchange !== "paper") {
          liveOpenPosition(signal.symbol, signal.direction, signal.price, 1);
        } else {
          const tradeAmount = Math.min(
            balance.available / (config.maxRotationPositions || 3),
            balance.available * 0.1,
          );
          manualOpenPosition(signal.symbol, signal.direction, signal.price, tradeAmount);
        }
        addTraded(signal.symbol);
      }
    } else {
      // 非轮动模式：原始逻辑
      for (const result of results) {
        if (useTradingStore.getState().positions.length >= tradingConfig.maxOpenPositions) break;
        if (tradedSymbols.has(result.symbol)) continue;
        if (positions.some((p) => p.symbol === result.symbol)) continue;

        const dir = result.signal.direction;
        if (dir !== "long" && dir !== "short") continue;

        if (liveMode && activeExchange !== "paper") {
          liveOpenPosition(result.symbol, dir, result.price, 1);
        } else {
          manualOpenPosition(result.symbol, dir, result.price, balance.available);
        }
        addTraded(result.symbol);
      }
    }
  }, [results, config.autoTrade, config.rotationEnabled, config.requireAgentConfirmation, config.maxRotationPositions, tradingConfig.maxOpenPositions, positions, balance, liveMode, activeExchange, manualOpenPosition, liveOpenPosition, tradedSymbols, addTraded]);

  const handleScan = useCallback(() => {
    scanOnce(news, fearGreed);
  }, [scanOnce, news, fearGreed]);

  const handleClickSymbol = useCallback(
    (symbol: string) => {
      setSymbol(symbol);
      loadAll();
    },
    [setSymbol, loadAll],
  );

  const longResults = results.filter((r) => r.signal.direction === "long");
  const shortResults = results.filter((r) => r.signal.direction === "short");

  // 格式化倒计时 mm:ss
  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // 运行时长
  const uptime = stats.startTime
    ? Math.floor((Date.now() - stats.startTime) / 1000)
    : 0;
  const uptimeStr = uptime > 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : uptime > 60
      ? `${Math.floor(uptime / 60)}m`
      : `${uptime}s`;

  return (
    <Panel
      title={t("scanner.title")}
      icon={<Radar className="h-3.5 w-3.5" />}
      bodyClassName="overflow-y-auto"
      action={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowStats((v) => !v)}
            className={cn(
              "rounded p-1 transition-colors",
              showStats ? "text-neon-cyan" : "text-ink-dim hover:text-ink",
            )}
          >
            <BarChart3 className="h-3 w-3" />
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              "rounded p-1 transition-colors",
              showSettings ? "text-neon-cyan" : "text-ink-dim hover:text-ink",
            )}
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>
      }
    >
      <div className="space-y-2 p-2">
        {/* 控制按钮 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-neon-cyan/40 bg-neon-cyan/10 py-1.5 font-mono text-[10px] text-neon-cyan transition-colors hover:bg-neon-cyan/20 disabled:opacity-40"
          >
            {scanning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {scanning ? t("scanner.scanning") : t("scanner.scanNow")}
          </button>
          <button
            onClick={toggleAutoScan}
            className={cn(
              "flex items-center justify-center gap-1 rounded border px-2.5 py-1.5 font-mono text-[10px] transition-colors",
              config.autoScan
                ? "border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_0_8px_rgba(0,255,136,0.15)]"
                : "border-panel-border bg-void-200/50 text-ink-muted hover:border-neon-green/40",
            )}
            title={config.autoScan ? t("scanner.stopAutoScan") : t("scanner.autoScan")}
          >
            {config.autoScan ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button
            onClick={toggleAutoTrade}
            className={cn(
              "flex items-center justify-center gap-1 rounded border px-2 py-1.5 font-mono text-[10px] transition-colors",
              config.autoTrade
                ? "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
                : "border-panel-border bg-void-200/50 text-ink-muted hover:border-neon-amber/40",
            )}
            title={t("scanner.autoTrade")}
          >
            <Zap className="h-3 w-3" />
          </button>
        </div>

        {/* 持续扫描状态条 */}
        {config.autoScan && (
          <div className="flex items-center justify-between rounded-lg border border-neon-green/20 bg-neon-green/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-green opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-green" />
              </span>
              <span className="font-mono text-[9px] font-bold text-neon-green">
                {t("scanner.running")}
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <Clock className="h-2.5 w-2.5 text-neon-green" />
              <span className="text-neon-green font-bold">
                {scanning ? "--:--" : formatCountdown(nextScanIn)}
              </span>
            </div>
          </div>
        )}

        {/* 智能体分析进度 */}
        {agentAnalysisProgress && (
          <div className="rounded-lg border border-neon-purple/20 bg-neon-purple/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-purple opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-purple" />
              </span>
              <span className="font-mono text-[9px] font-bold text-neon-purple">
                智能体分析 {agentAnalysisProgress.current}/{agentAnalysisProgress.total}
              </span>
              <span className="ml-auto font-mono text-[9px] text-neon-purple/70">
                {agentAnalysisProgress.symbol}
              </span>
            </div>
          </div>
        )}

        {/* 状态信息 */}
        <div className="flex items-center justify-between font-mono text-[9px] text-ink-dim">
          <span>
            {t("scanner.lastScan")}: {lastScanTime ? new Date(lastScanTime).toLocaleTimeString() : "--"}
          </span>
          <span className="flex items-center gap-1.5">
            {config.scanAllMarket && (
              <span className="rounded bg-neon-cyan/10 px-1 text-[8px] text-neon-cyan">
                {t("scanner.scanAllMarket")}
              </span>
            )}
            {t("scanner.found")}: {results.length}
          </span>
        </div>

        {error && (
          <div className="rounded border border-neon-red/20 bg-neon-red/5 px-2 py-1 font-mono text-[9px] text-neon-red/80">
            {error}
          </div>
        )}

        {/* 统计面板 */}
        {showStats && (
          <div className="space-y-2 rounded border border-panel-border bg-void-200/50 p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                {t("scanner.stats")}
              </span>
              <button
                onClick={() => { resetStats(); }}
                className="text-ink-dim transition-colors hover:text-neon-cyan"
                title={t("scanner.resetStats")}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded bg-void-300/50 p-1.5 text-center">
                <div className="font-mono text-sm font-bold text-neon-cyan">
                  {stats.totalScans}
                </div>
                <div className="font-mono text-[8px] text-ink-dim">{t("scanner.totalScans")}</div>
              </div>
              <div className="rounded bg-void-300/50 p-1.5 text-center">
                <div className="font-mono text-sm font-bold text-neon-green">
                  {stats.longSignals}
                </div>
                <div className="font-mono text-[8px] text-ink-dim">{t("scanner.longCount")}</div>
              </div>
              <div className="rounded bg-void-300/50 p-1.5 text-center">
                <div className="font-mono text-sm font-bold text-neon-red">
                  {stats.shortSignals}
                </div>
                <div className="font-mono text-[8px] text-ink-dim">{t("scanner.shortCount")}</div>
              </div>
            </div>
            <div className="flex items-center justify-between font-mono text-[9px] text-ink-dim">
              <span>{t("scanner.uptime")}: {stats.startTime ? uptimeStr : "--"}</span>
              <span>{t("scanner.totalSignals")}: {stats.totalSignals}</span>
            </div>
          </div>
        )}

        {/* 设置面板 */}
        {showSettings && (
          <ScannerSettings
            config={config}
            setConfig={setConfig}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* 扫描结果 */}
        <div className="space-y-1.5">
          {results.length === 0 && !scanning && (
            <div className="py-4 text-center font-mono text-[10px] text-ink-dim">
              {t("scanner.empty")}
            </div>
          )}

          {longResults.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-neon-green">
                <TrendingUp className="h-2.5 w-2.5" />
                {t("scanner.longSignals")} ({longResults.length})
              </div>
              {longResults.map((r) => (
                <ResultRow
                  key={r.symbol}
                  result={r}
                  onClick={() => handleClickSymbol(r.symbol)}
                />
              ))}
            </div>
          )}

          {shortResults.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-neon-red">
                <TrendingDown className="h-2.5 w-2.5" />
                {t("scanner.shortSignals")} ({shortResults.length})
              </div>
              {shortResults.map((r) => (
                <ResultRow
                  key={r.symbol}
                  result={r}
                  onClick={() => handleClickSymbol(r.symbol)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 自动交易状态 */}
        {config.autoTrade && (
          <div className="rounded border border-neon-amber/20 bg-neon-amber/5 px-2 py-1">
            <div className="flex items-center gap-1 font-mono text-[9px] text-neon-amber">
              <Zap className="h-2.5 w-2.5" />
              <span>{t("scanner.autoTradeActive")}</span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** 单条扫描结果 */
function ResultRow({
  result,
  onClick,
}: {
  result: import("@/services/scanner").ScanResult;
  onClick: () => void;
}) {
  const isLong = result.signal.direction === "long";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded border px-2 py-1.5 font-mono text-[10px] transition-colors hover:bg-void-200/50",
        isLong
          ? "border-neon-green/20 bg-neon-green/[0.03]"
          : "border-neon-red/20 bg-neon-red/[0.03]",
      )}
    >
      <span className="w-12 shrink-0 font-bold text-ink">{result.base}</span>
      <span className={cn("shrink-0", isLong ? "text-neon-green" : "text-neon-red")}>
        {isLong ? "▲" : "▼"}
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-ink-muted">${formatCompact(result.price)}</span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "rounded px-1 text-[8px]",
              isLong ? "bg-neon-green/10 text-neon-green" : "bg-neon-red/10 text-neon-red",
            )}
          >
            {result.signal.confidence}%
          </span>
          {result.agentAnalysis && (
            <span
              className={cn(
                "rounded px-1 text-[8px]",
                result.agentAnalysis.direction === "long"
                  ? "bg-neon-purple/15 text-neon-purple"
                  : result.agentAnalysis.direction === "short"
                    ? "bg-neon-purple/15 text-neon-purple"
                    : "bg-void-300/50 text-ink-dim",
              )}
              title={result.agentAnalysis.summary}
            >
              AI {result.agentAnalysis.confidence.toFixed(0)}%
            </span>
          )}
          <span className="text-[8px] text-ink-dim">
            {result.changePercent > 0 ? "+" : ""}
            {result.changePercent.toFixed(2)}%
          </span>
        </div>
      </div>
    </button>
  );
}

/** 设置面板 */
function ScannerSettings({
  config,
  setConfig,
  onClose,
}: {
  config: ScannerConfig;
  setConfig: (config: Partial<ScannerConfig>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [newSymbol, setNewSymbol] = useState("");
  const removeSymbol = useScannerStore((s) => s.removeSymbol);
  const addSymbol = useScannerStore((s) => s.addSymbol);

  const handleAdd = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    const base = sym.replace("USDT", "");
    addSymbol(sym + (sym.endsWith("USDT") ? "" : "USDT"), base || sym);
    setNewSymbol("");
  };

  return (
    <div className="space-y-2 rounded border border-panel-border bg-void-200/50 p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("scanner.settings")}
        </span>
        <button onClick={onClose} className="text-ink-dim hover:text-ink">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1">
        <label className="font-mono text-[9px] text-ink-dim">
          {t("scanner.minConfidence")}: {config.minConfidence}%
        </label>
        <input
          type="range"
          min="40"
          max="90"
          step="5"
          value={config.minConfidence}
          onChange={(e) => setConfig({ minConfidence: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <label className="font-mono text-[9px] text-ink-dim">
          {t("scanner.interval")}: {config.scanInterval}s
        </label>
        <input
          type="range"
          min="60"
          max="600"
          step="30"
          value={config.scanInterval}
          onChange={(e) => setConfig({ scanInterval: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* 自动轮动开关 */}
      <div className="flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] font-semibold text-ink">
            自动轮动交易
          </span>
          <span className="font-mono text-[8px] text-ink-dim">
            按综合评分自动选择最优标的轮动开仓
          </span>
        </div>
        <button
          onClick={() => setConfig({ rotationEnabled: !config.rotationEnabled })}
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors",
            config.rotationEnabled ? "bg-neon-amber/60" : "bg-void-400",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
              config.rotationEnabled ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {config.rotationEnabled && (
        <>
          <div className="flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] font-semibold text-ink">
                需要智能体确认
              </span>
              <span className="font-mono text-[8px] text-ink-dim">
                只交易被多智能体确认方向的标的
              </span>
            </div>
            <button
              onClick={() => setConfig({ requireAgentConfirmation: !config.requireAgentConfirmation })}
              className={cn(
                "relative h-4 w-7 rounded-full transition-colors",
                config.requireAgentConfirmation ? "bg-neon-purple/60" : "bg-void-400",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                  config.requireAgentConfirmation ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          <div className="space-y-1">
            <label className="font-mono text-[9px] text-ink-dim">
              最大轮动持仓数: {config.maxRotationPositions}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={config.maxRotationPositions}
              onChange={(e) => setConfig({ maxRotationPositions: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </>
      )}

      {/* 全市场扫描开关 */}
      <div className="flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] font-semibold text-ink">
            {t("scanner.scanAllMarket")}
          </span>
          <span className="font-mono text-[8px] text-ink-dim">
            {t("scanner.scanAllMarketDesc")}
          </span>
        </div>
        <button
          onClick={() => setConfig({ scanAllMarket: !config.scanAllMarket })}
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors",
            config.scanAllMarket ? "bg-neon-cyan/60" : "bg-void-400",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
              config.scanAllMarket ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {/* 智能体分析开关 */}
      <div className="flex items-center justify-between rounded border border-panel-border bg-void-300/30 px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] font-semibold text-ink">
            多智能体深度分析
          </span>
          <span className="font-mono text-[8px] text-ink-dim">
            对 Top 候选币种运行全部智能体分析（含DeepSeek）
          </span>
        </div>
        <button
          onClick={() => setConfig({ useAgentAnalysis: !config.useAgentAnalysis })}
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors",
            config.useAgentAnalysis ? "bg-neon-purple/60" : "bg-void-400",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
              config.useAgentAnalysis ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {/* 智能体分析数量 */}
      {config.useAgentAnalysis && (
        <div className="space-y-1">
          <label className="font-mono text-[9px] text-ink-dim">
            智能体分析数量: Top {config.agentAnalysisCount}
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={config.agentAnalysisCount}
            onChange={(e) => setConfig({ agentAnalysisCount: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="font-mono text-[9px] text-ink-dim">
          {t("scanner.symbolList")} ({config.symbols.length})
        </label>
        <div className="flex flex-wrap gap-1">
          {config.symbols.map((s) => (
            <span
              key={s.symbol}
              className="flex items-center gap-0.5 rounded bg-void-300/50 px-1.5 py-0.5 font-mono text-[9px] text-ink-muted"
            >
              {s.base}
              <button
                onClick={() => removeSymbol(s.symbol)}
                className="text-neon-red/50 hover:text-neon-red"
              >
                <X className="h-2 w-2" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="BTC"
            className="flex-1 rounded border border-panel-border bg-void-300/50 px-1.5 py-1 font-mono text-[9px] text-ink placeholder:text-ink-dim/50 focus:border-neon-cyan/50 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            className="flex items-center justify-center rounded border border-panel-border bg-void-300/50 px-1.5 text-ink-muted hover:border-neon-cyan/40 hover:text-neon-cyan"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
