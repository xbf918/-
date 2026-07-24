import { useState, useEffect } from "react";
import {
  KeyRound,
  Plug,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useExchangeStore } from "@/store/useExchangeStore";
import { useTradingStore } from "@/store/useTradingStore";
import { EXCHANGES } from "@/lib/exchangeConstants";
import { getAllCredentials } from "@/services/exchange";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { useTranslation } from "react-i18next";
import type { ExchangeId, TradeMode } from "@/types/exchange";

type ToastType = "success" | "error" | "warning";

// 将交易所 API 错误信息翻译为用户友好的提示
function translateError(error: string, t: (key: string) => string): string {
  const lower = error.toLowerCase();
  if (lower.includes("does not match current environment")) {
    return t("exchange.errEnvMismatch");
  }
  if (lower.includes("invalid sign")) {
    return t("exchange.errInvalidSign");
  }
  if (lower.includes("invalid apikey") || lower.includes("invalid api key")) {
    return t("exchange.errInvalidKey");
  }
  if (lower.includes("passphrase")) {
    return t("exchange.errPassphrase");
  }
  if (lower.includes("permission") || lower.includes("no permissions")) {
    return t("exchange.errPermission");
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return t("exchange.errRateLimit");
  }
  if (lower.includes("timeout")) {
    return t("exchange.errTimeout");
  }
  return error;
}

export function ExchangePanel() {
  const { t } = useTranslation();
  const {
    mode,
    activeExchange,
    credentials,
    connections,
    account,
    setMode,
    setActiveExchange,
    saveCredentials,
    removeCredentials,
    testConnection,
    refreshAccount,
  } = useExchangeStore();

  const { setLiveMode, syncLivePositions } = useTradingStore();

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [testnet, setTestnet] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(label);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      setToast({ type: "error", msg: t("exchange.copyFailed") });
    }
  };

  // 初始化 - 加载已保存的凭证
  useEffect(() => {
    useExchangeStore.getState().init();
  }, []);

  // 当切换交易所时，加载已保存的凭证到输入框
  const cred = credentials[activeExchange];
  useEffect(() => {
    if (cred && cred.apiKey) {
      setApiKey(cred.apiKey);
      // apiSecret 在服务端是脱敏存储的，不回填到输入框
      setApiSecret("");
      setPassphrase(cred.passphrase ?? "");
      setTestnet(cred.testnet ?? true);
    } else {
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
      setTestnet(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExchange, cred]);

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 处理交易模式切换
  const handleSetMode = (m: TradeMode) => {
    setMode(m);
    setLiveMode(m === "live");
    if (m === "live") {
      if (activeExchange === "paper") {
        setActiveExchange("binance");
      }
      setToast({ type: "warning", msg: t("exchange.autoTradingLive") });
      syncLivePositions();
    }
  };

  // 处理保存
  const handleSave = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    setSaving(true);
    const ok = await saveCredentials({
      exchange: activeExchange,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      passphrase: EXCHANGES[activeExchange].requiresPassphrase
        ? passphrase.trim()
        : undefined,
      testnet,
      permissions: [],
    });
    setSaving(false);
    setToast({
      type: ok ? "success" : "error",
      msg: ok ? t("exchange.saveSuccess") : t("exchange.saveFailed"),
    });
  };

  // 处理测试连接
  const handleTest = async () => {
    if (!apiKey.trim()) {
      setToast({ type: "error", msg: t("exchange.enterApiKey") });
      return;
    }
    // 如果 secret 为空但已保存过凭证，用已保存的凭证测试
    if (!apiSecret.trim()) {
      if (cred && cred.apiKey) {
        const result = await testConnection(activeExchange);
        const connState = useExchangeStore.getState().connections[activeExchange];
        setToast({
          type: result ? "success" : "error",
          msg: result
            ? t("exchange.testSuccess")
            : connState?.error
              ? `${t("exchange.testFailed")}: ${translateError(connState.error, t)}`
              : t("exchange.testFailed"),
        });
        if (result) refreshAccount();
        return;
      }
      setToast({ type: "error", msg: t("exchange.enterApiSecret") });
      return;
    }
    if (EXCHANGES[activeExchange].requiresPassphrase && !passphrase.trim()) {
      setToast({ type: "error", msg: t("exchange.enterPassphrase") });
      return;
    }
    const result = await testConnection(activeExchange, {
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      passphrase: passphrase.trim() || undefined,
      testnet,
    });
    const connState = useExchangeStore.getState().connections[activeExchange];
    setToast({
      type: result ? "success" : "error",
      msg: result
        ? t("exchange.testSuccess")
        : connState?.error
          ? `${t("exchange.testFailed")}: ${translateError(connState.error, t)}`
          : t("exchange.testFailed"),
    });
    if (result) {
      refreshAccount();
    }
  };

  // 处理删除
  const handleDelete = async () => {
    if (!window.confirm(t("exchange.confirmDelete"))) return;
    await removeCredentials(activeExchange);
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
    setTestnet(true);
  };

  const conn = connections[activeExchange];
  const exInfo = EXCHANGES[activeExchange];
  const isLive = mode === "live";

  const toastStyles: Record<ToastType, string> = {
    success: "border-neon-green/40 bg-neon-green/10 text-neon-green",
    error: "border-neon-red/40 bg-neon-red/10 text-neon-red",
    warning: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  };

  return (
    <Panel
      title={t("exchange.title")}
      icon={<KeyRound className="h-3.5 w-3.5" />}
      bodyClassName="overflow-y-auto"
    >
      <div className="space-y-3 p-3">
        {/* Toast 提示 */}
        {toast && (
          <div
            className={cn(
              "rounded border px-2 py-1.5 font-mono text-[10px]",
              toastStyles[toast.type],
            )}
          >
            {toast.msg}
          </div>
        )}

        {/* 交易模式切换 */}
        <div className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            {t("exchange.mode")}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSetMode("paper")}
              className={cn(
                "rounded border px-2 py-1.5 font-mono text-[10px] transition-colors",
                mode === "paper"
                  ? "border-neon-green/60 bg-neon-green/10 text-neon-green"
                  : "border-panel-border bg-void-200/50 text-ink-muted hover:border-neon-green/40",
              )}
            >
              {t("exchange.paper")}
            </button>
            <button
              onClick={() => handleSetMode("live")}
              className={cn(
                "rounded border px-2 py-1.5 font-mono text-[10px] transition-colors",
                mode === "live"
                  ? "border-neon-red/60 bg-neon-red/10 text-neon-red"
                  : "border-panel-border bg-void-200/50 text-ink-muted hover:border-neon-red/40",
              )}
            >
              {t("exchange.live")}
            </button>
          </div>
        </div>

        {/* Live 模式风险警告 */}
        {isLive && (
          <div className="rounded border border-neon-red/30 bg-neon-red/5 px-2 py-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-neon-red">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{t("exchange.liveWarning")}</span>
            </div>
          </div>
        )}

        {/* Paper 模式说明 / Live 模式配置 */}
        {mode === "paper" ? (
          <div className="rounded border border-neon-green/20 bg-neon-green/[0.03] px-2 py-2">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-neon-green">
              <CheckCircle2 className="h-3 w-3" />
              <span className="font-semibold">{t("exchange.paper")}</span>
            </div>
            <div className="mt-1 font-mono text-[9px] text-ink-dim">
              {t("exchange.paperDesc")}
            </div>
          </div>
        ) : (
          <>
            {/* 交易所选择 */}
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                {t("exchange.selectExchange")}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["binance", "okx"] as ExchangeId[]).map((ex) => {
                  const info = EXCHANGES[ex];
                  const selected = activeExchange === ex;
                  return (
                    <button
                      key={ex}
                      onClick={() => setActiveExchange(ex)}
                      className={cn(
                        "rounded border px-2 py-2 transition-all",
                        selected
                          ? "border-2"
                          : "border-panel-border bg-void-200/50 hover:border-neon-cyan/40",
                      )}
                      style={
                        selected
                          ? {
                              borderColor: info.color,
                              backgroundColor: `${info.color}1A`,
                            }
                          : undefined
                      }
                    >
                      <div
                        className="font-display text-[11px] font-bold"
                        style={selected ? { color: info.color } : undefined}
                      >
                        {info.name}
                      </div>
                      <div className="font-mono text-[8px] text-ink-dim">
                        {info.nameCn}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* API Key 输入区 */}
            <div className="space-y-2 border-t border-panel-border pt-2">
              {/* API Key */}
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                  {t("exchange.apiKey")}
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("exchange.enterApiKey")}
                  className="w-full rounded border border-panel-border bg-void-200/50 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim/50 focus:border-neon-cyan/50 focus:outline-none"
                />
              </div>

              {/* Secret Key */}
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                  {t("exchange.apiSecret")}
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder={cred?.apiKey ? t("exchange.secretSaved") : t("exchange.enterApiSecret")}
                    className="w-full rounded border border-panel-border bg-void-200/50 px-2 py-1.5 pr-12 font-mono text-[10px] text-ink placeholder:text-ink-dim/50 focus:border-neon-cyan/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[8px] text-ink-dim transition-colors hover:text-ink"
                  >
                    {showSecret ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>

              {/* Passphrase (OKX only) */}
              {exInfo.requiresPassphrase && (
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    {t("exchange.passphrase")}
                  </label>
                  <input
                    type={showSecret ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={t("exchange.enterPassphrase")}
                    className="w-full rounded border border-panel-border bg-void-200/50 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim/50 focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>
              )}

              {/* Testnet 开关 */}
              {exInfo.testnetSupported && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ink-dim">
                      {t("exchange.testnet")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTestnet((v) => !v)}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        testnet ? "bg-neon-cyan/30" : "bg-void-300",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full transition-all",
                          testnet
                            ? "left-[18px] bg-neon-cyan shadow-[0_0_6px_rgba(0,255,255,0.6)]"
                            : "left-0.5 bg-ink-muted",
                        )}
                      />
                    </button>
                  </div>
                  <div className="rounded border border-neon-amber/20 bg-neon-amber/5 px-1.5 py-1">
                    <span className="font-mono text-[9px] leading-tight text-neon-amber/80">
                      {testnet ? t("exchange.testnetHint") : t("exchange.mainnetHint")}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 连接状态 + 账户信息 */}
            <div className="space-y-1.5 border-t border-panel-border pt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                  {t("exchange.connected")}
                </span>
                <div className="flex items-center gap-1.5">
                  {conn?.testing ? (
                    <Loader2 className="h-3 w-3 animate-spin text-neon-cyan" />
                  ) : conn?.connected ? (
                    <CheckCircle2 className="h-3 w-3 text-neon-green" />
                  ) : (
                    <XCircle className="h-3 w-3 text-neon-red/60" />
                  )}
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      conn?.testing
                        ? "text-neon-cyan"
                        : conn?.connected
                          ? "text-neon-green"
                          : "text-ink-dim",
                    )}
                  >
                    {conn?.testing
                      ? t("exchange.testing")
                      : conn?.connected
                        ? t("exchange.connected")
                        : t("exchange.disconnected")}
                  </span>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      conn?.testing
                        ? "animate-pulse bg-neon-cyan"
                        : conn?.connected
                          ? "bg-neon-green"
                          : "bg-neon-red/60",
                    )}
                  />
                </div>
              </div>

              {/* 错误详情 */}
              {conn?.error && !conn.connected && (
                <div className="rounded border border-neon-red/20 bg-neon-red/5 px-2 py-1.5">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-neon-red" />
                    <span className="font-mono text-[9px] leading-tight text-neon-red/80">
                      {translateError(conn.error, t)}
                    </span>
                  </div>
                </div>
              )}

              {/* 账户信息 */}
              {conn?.connected && account ? (
                <div className="grid grid-cols-3 gap-1.5">
                  <AccountBox
                    label={t("exchange.totalBalance")}
                    value={formatCompact(account.totalWalletBalance)}
                    unit="USDT"
                  />
                  <AccountBox
                    label={t("exchange.available")}
                    value={formatCompact(account.availableBalance)}
                    unit="USDT"
                  />
                  <AccountBox
                    label={t("exchange.unrealizedPnl")}
                    value={`${account.unrealizedProfit >= 0 ? "+" : ""}${formatCompact(account.unrealizedProfit)}`}
                    unit="USDT"
                    positive={account.unrealizedProfit >= 0}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 py-2 font-mono text-[9px] text-ink-dim">
                  <Plug className="h-3 w-3" />
                  <span>{t("exchange.noConnection")}</span>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="space-y-1.5 border-t border-panel-border pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !apiKey.trim() || !apiSecret.trim()}
                  className="flex items-center justify-center gap-1.5 rounded border border-neon-cyan/40 bg-neon-cyan/10 py-1.5 font-mono text-[10px] text-neon-cyan transition-colors hover:bg-neon-cyan/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <KeyRound className="h-3 w-3" />
                  )}
                  {t("exchange.save")}
                </button>
                <button
                  onClick={handleTest}
                  disabled={conn?.testing || !cred}
                  className="flex items-center justify-center gap-1.5 rounded border border-neon-green/40 bg-neon-green/10 py-1.5 font-mono text-[10px] text-neon-green transition-colors hover:bg-neon-green/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {conn?.testing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plug className="h-3 w-3" />
                  )}
                  {conn?.testing ? t("exchange.testing") : t("exchange.test")}
                </button>
              </div>

              {cred && (
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center justify-center gap-1.5 rounded border border-neon-red/30 bg-neon-red/5 py-1.5 font-mono text-[10px] text-neon-red/70 transition-colors hover:bg-neon-red/10 hover:text-neon-red"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("exchange.delete")}
                </button>
              )}

              {/* 获取 API Key */}
              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                  {t("exchange.getApiKey")}
                </div>

                {/* 主网链接 */}
                <div className="flex items-center gap-1.5">
                  <a
                    href={exInfo.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center gap-1.5 truncate rounded border border-panel-border/50 bg-void-200/30 px-2 py-1.5 font-mono text-[10px] text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{exInfo.name} · {t("exchange.mainnet")}</span>
                  </a>
                  <button
                    onClick={() => copyToClipboard(exInfo.apiKeyUrl, "mainnet")}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded border border-panel-border/50 bg-void-200/30 text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
                    title={t("exchange.copyLink")}
                  >
                    {copiedUrl === "mainnet" ? (
                      <Check className="h-3 w-3 text-neon-green" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {/* 测试网链接 */}
                {exInfo.testnetApiKeyUrl && (
                  <div className="flex items-center gap-1.5">
                    <a
                      href={exInfo.testnetApiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center gap-1.5 truncate rounded border border-panel-border/50 bg-void-200/30 px-2 py-1.5 font-mono text-[10px] text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{exInfo.name} · {t("exchange.testnet")}</span>
                    </a>
                    <button
                      onClick={() => copyToClipboard(exInfo.testnetApiKeyUrl!, "testnet")}
                      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded border border-panel-border/50 bg-void-200/30 text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
                      title={t("exchange.copyLink")}
                    >
                      {copiedUrl === "testnet" ? (
                        <Check className="h-3 w-3 text-neon-green" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                )}

                {/* 网络提示 */}
                <div className="flex items-start gap-1 rounded border border-neon-amber/20 bg-neon-amber/5 px-1.5 py-1">
                  <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-neon-amber" />
                  <span className="font-mono text-[9px] leading-tight text-ink-dim">
                    {t("exchange.networkHint")}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function AccountBox({
  label,
  value,
  unit,
  positive,
}: {
  label: string;
  value: string;
  unit: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded border border-panel-border/50 bg-void-200/30 px-1.5 py-1.5">
      <div className="font-mono text-[8px] uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[11px] font-bold num",
          positive !== undefined
            ? positive
              ? "text-neon-green text-glow-green"
              : "text-neon-red text-glow-red"
            : "text-ink",
        )}
      >
        {value}{" "}
        <span className="text-[8px] font-normal text-ink-dim">{unit}</span>
      </div>
    </div>
  );
}
