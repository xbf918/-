import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Activity, BarChart3, TrendingUp, History, Wallet, Briefcase } from "lucide-react";
import { useTranslation } from "react-i18next";

export type IndicatorTabKey = "macd" | "kdj" | "rsi" | "cvd" | "positions" | "history" | "profit";

interface TabItem {
  key: IndicatorTabKey;
  label: string;
  icon: ReactNode;
  type: "indicator" | "trade";
}

interface ChartIndicatorTabsProps {
  activeTab: IndicatorTabKey;
  onChange: (tab: IndicatorTabKey) => void;
}

export function ChartIndicatorTabs({ activeTab, onChange }: ChartIndicatorTabsProps) {
  const { t } = useTranslation();

  const tabs: TabItem[] = [
    { key: "macd", label: "MACD", icon: <BarChart3 className="h-3 w-3" />, type: "indicator" },
    { key: "kdj", label: "KDJ", icon: <Activity className="h-3 w-3" />, type: "indicator" },
    { key: "rsi", label: "RSI", icon: <TrendingUp className="h-3 w-3" />, type: "indicator" },
    { key: "cvd", label: "CVD", icon: <Activity className="h-3 w-3" />, type: "indicator" },
    { key: "positions", label: t("position.title"), icon: <Briefcase className="h-3 w-3" />, type: "trade" },
    { key: "history", label: t("trade.history"), icon: <History className="h-3 w-3" />, type: "trade" },
    { key: "profit", label: t("profit.title"), icon: <Wallet className="h-3 w-3" />, type: "trade" },
  ];

  return (
    <div className="flex items-center border-t border-panel-border/50 bg-void-100/60 px-1 overflow-x-auto scrollbar-hide">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1 px-3 py-1.5 font-display text-[10px] font-medium transition-all",
              isActive
                ? "text-neon-cyan"
                : "text-ink-muted hover:text-ink",
              tab.type === "trade" && "border-l border-panel-border/30"
            )}
          >
            {tab.icon}
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-neon-cyan" />
            )}
          </button>
        );
      })}
    </div>
  );
}
