import { LayoutDashboard, Radar, Settings2, Bot, Palette, FlaskConical, BarChart3, Brain } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type ViewKey = "dashboard" | "scanner" | "agents" | "lab" | "performance" | "psychology" | "settings";

interface NavItem {
  key: ViewKey;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", icon: LayoutDashboard },
  { key: "scanner", icon: Radar },
  { key: "agents", icon: Bot },
  { key: "lab", icon: FlaskConical },
  { key: "performance", icon: BarChart3 },
  { key: "psychology", icon: Brain },
  { key: "settings", icon: Settings2 },
];

interface SidebarProps {
  active: ViewKey;
  onChange: (view: ViewKey) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <nav className="z-30 flex w-12 shrink-0 flex-col items-center gap-1 border-r border-panel-border bg-void-100/90 py-3 backdrop-blur-xl">
      {NAV_ITEMS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={t(`nav.${key}`)}
          className={cn(
            "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all",
            active === key
              ? "bg-neon-cyan/10 text-neon-cyan shadow-glow-cyan"
              : "text-ink-muted hover:bg-void-200 hover:text-ink",
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded border border-panel-border bg-void-100 px-2 py-1 font-mono text-[10px] text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {t(`nav.${key}`)}
          </span>
          {active === key && (
            <span className="absolute -left-3 h-6 w-0.5 rounded-full bg-neon-cyan" />
          )}
        </button>
      ))}

      <div className="flex-1" />

      <Link
        to="/layout-preview"
        title="布局预览"
        className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-all hover:bg-neon-purple/10 hover:text-neon-purple"
      >
        <Palette className="h-5 w-5" />
        <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded border border-panel-border bg-void-100 px-2 py-1 font-mono text-[10px] text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          布局预览
        </span>
      </Link>
    </nav>
  );
}