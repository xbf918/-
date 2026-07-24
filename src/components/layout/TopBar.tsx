import { useState, useRef, useEffect } from "react";
import { Search, RefreshCw, Pause, Play, ChevronDown, Globe, LogOut, UserCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMarketStore } from "@/store/useMarketStore";
import { useAuthStore } from "@/store/useAuthStore";
import { TIMEFRAMES, EXCHANGES } from "@/lib/constants";
import { formatPrice, formatPercent, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types";

export function TopBar() {
  const { t, i18n } = useTranslation();
  const {
    symbolInfo,
    timeframe,
    ticker,
    status,
    autoRefresh,
    lastUpdated,
    searchResults,
    exchange,
    setTimeframe,
    setSymbol,
    setExchange,
    searchSymbol,
    refresh,
    toggleAutoRefresh,
  } = useMarketStore();

  const { user, logout } = useAuthStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      searchSymbol(keyword);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [keyword, searchSymbol]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const change = ticker?.priceChangePercent ?? 0;
  const isUp = change >= 0;

  const handleSelect = (symbol: string, base: string, quote: string) => {
    setSymbol(symbol, base, quote);
    setSearchOpen(false);
    setKeyword("");
  };

  const changeLang = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("lang", lng);
    setLangOpen(false);
  };

  return (
    <header className="relative z-30 flex h-10 min-w-0 items-center gap-2 border-b border-panel-border/60 bg-void-100/95 px-3 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-5 w-5 rounded bg-neon-cyan/20 flex items-center justify-center">
          <span className="text-neon-cyan font-bold text-[10px]">CP</span>
        </div>
      </div>

      <div className="h-4 w-px bg-panel-border/50 shrink-0" />

      {/* 交易对搜索 */}
      <div ref={searchRef} className="relative shrink-0">
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="flex items-center gap-1 rounded border border-panel-border/60 bg-void-200/60 px-2 py-0.5 transition-colors hover:border-neon-cyan/40"
        >
          <span className="font-display text-xs font-bold text-ink">
            {symbolInfo.base}<span className="text-ink-dim">/{symbolInfo.quote}</span>
          </span>
          <ChevronDown className="h-2.5 w-2.5 text-ink-muted" />
        </button>

        {searchOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-panel-border bg-void-100 p-2 shadow-2xl">
            <div className="mb-2 flex items-center gap-2 rounded border border-panel-border bg-void-200 px-2 py-1">
              <Search className="h-3 w-3 text-ink-muted" />
              <input
                autoFocus
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("topBar.searchPlaceholder")}
                className="w-full bg-transparent text-xs text-ink placeholder:text-ink-dim focus:outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {searchResults.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => handleSelect(s.symbol, s.base, s.quote)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left transition-colors hover:bg-neon-cyan/10"
                >
                  <span className="font-mono text-xs text-ink">
                    {s.base}<span className="text-ink-dim">/{s.quote}</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase text-ink-dim">{s.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 时间周期 */}
      <div className="flex items-center gap-0.5 rounded border border-panel-border/60 bg-void-200/60 p-0.5 shrink-0">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value as Timeframe)}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-all",
              timeframe === tf.value
                ? "bg-neon-cyan/20 text-neon-cyan"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* 交易所 */}
      <div className="hidden md:flex items-center gap-0.5 rounded border border-panel-border/60 bg-void-200/60 p-0.5 shrink-0">
        {(Object.keys(EXCHANGES) as (keyof typeof EXCHANGES)[]).map((ex) => (
          <button
            key={ex}
            onClick={() => setExchange(ex)}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-all",
              exchange === ex ? "text-white" : "text-ink-muted hover:text-ink",
              exchange === ex && ex === "binance" && "bg-[#f3ba2f]/20 text-[#f3ba2f]",
              exchange === ex && ex === "okx" && "bg-[#4f46e5]/20 text-[#4f46e5]",
            )}
          >
            {EXCHANGES[ex].nameCn}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0" />

      {/* 实时价格 - 突出显示 */}
      {ticker && (
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className={cn("font-mono text-base font-bold tabular-nums leading-tight", isUp ? "text-neon-green" : "text-neon-red")}>
              ${formatPrice(ticker.lastPrice)}
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <span className={cn("font-mono text-[9px]", isUp ? "text-neon-green" : "text-neon-red")}>
                {isUp ? "+" : ""}{change.toFixed(2)}%
              </span>
              <span className="text-ink-dim text-[9px]">24h</span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col text-[8px] font-mono text-ink-dim">
            <span>H <span className={cn(isUp ? "text-neon-green" : "text-ink-muted")}>${formatPrice(ticker.highPrice)}</span></span>
            <span>L <span className={cn(isUp ? "text-ink-muted" : "text-neon-red")}>${formatPrice(ticker.lowPrice)}</span></span>
          </div>
        </div>
      )}

      <div className="h-4 w-px bg-panel-border/50 shrink-0" />

      {/* 刷新控制 */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={toggleAutoRefresh}
          title={autoRefresh ? t("topBar.pauseRefresh") : t("topBar.resumeRefresh")}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border transition-colors",
            autoRefresh
              ? "border-neon-green/40 text-neon-green"
              : "border-panel-border/60 text-ink-muted hover:text-ink",
          )}
        >
          {autoRefresh ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
        </button>
        <button
          onClick={() => refresh()}
          title={t("topBar.manualRefresh")}
          disabled={status === "loading"}
          className="flex h-5 w-5 items-center justify-center rounded border border-panel-border/60 text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan disabled:opacity-40"
        >
          <RefreshCw className={cn("h-2.5 w-2.5", status === "loading" && "animate-spin")} />
        </button>
        <span className="hidden lg:block font-mono text-[8px] text-ink-dim">
          {lastUpdated ? `${formatRelativeTime(lastUpdated / 1000)}${t("common.ago")}` : "--"}
        </span>
      </div>

      {/* 语言 */}
      <div ref={langRef} className="relative shrink-0">
        <button
          onClick={() => setLangOpen((v) => !v)}
          className="flex h-5 items-center gap-1 rounded border border-neon-cyan/30 bg-neon-cyan/5 px-1.5 text-neon-cyan transition-colors hover:bg-neon-cyan/10"
        >
          <Globe className="h-2.5 w-2.5" />
          <span className="font-mono text-[10px] font-semibold">
            {i18n.language === "zh" ? "中" : "EN"}
          </span>
        </button>
        {langOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-28 overflow-hidden rounded-lg border border-panel-border bg-void-100 p-1 shadow-2xl">
            <button
              onClick={() => changeLang("zh")}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-neon-cyan/10",
                i18n.language === "zh" ? "text-neon-cyan" : "text-ink",
              )}
            >
              <span className="font-mono text-[10px]">中文</span>
              {i18n.language === "zh" && <span className="ml-auto text-neon-cyan">✓</span>}
            </button>
            <button
              onClick={() => changeLang("en")}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-neon-cyan/10",
                i18n.language === "en" ? "text-neon-cyan" : "text-ink",
              )}
            >
              <span className="font-mono text-[10px]">English</span>
              {i18n.language === "en" && <span className="ml-auto text-neon-cyan">✓</span>}
            </button>
          </div>
        )}
      </div>

      {/* 用户 */}
      {user && (
        <div ref={userRef} className="relative shrink-0">
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex h-5 items-center gap-1 rounded border border-panel-border/60 bg-void-200/60 px-1.5 text-ink transition-colors hover:border-neon-cyan/40"
          >
            <UserCircle className="h-2.5 w-2.5 text-neon-cyan" />
            <span className="font-mono text-[10px] font-semibold max-w-[50px] truncate">
              {user.username}
            </span>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-panel-border bg-void-100 shadow-2xl">
              <div className="border-b border-panel-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-neon-cyan/40 bg-neon-cyan/10">
                    <UserCircle className="h-4 w-4 text-neon-cyan" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-semibold text-ink">
                      {user.username}
                    </div>
                    <div className="truncate font-mono text-[8px] text-ink-dim">
                      {user.email}
                    </div>
                  </div>
                </div>
                {user.emailVerified && (
                  <div className="mt-1 flex items-center gap-1">
                    <ShieldCheck className="h-2 w-2 text-neon-green" />
                    <span className="font-mono text-[8px] text-neon-green">
                      {t("auth.verified")}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => { logout(); setUserOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neon-red transition-colors hover:bg-neon-red/10"
              >
                <LogOut className="h-2.5 w-2.5" />
                <span className="font-mono text-[10px]">{t("auth.logout")}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
