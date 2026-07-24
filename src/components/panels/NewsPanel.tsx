import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { useMarketStore } from "@/store/useMarketStore";
import { formatRelativeTime } from "@/lib/format";
import { Newspaper, ExternalLink, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ensureTranslations } from "@/services/news";
import type { FearGreedIndex, NewsItem } from "@/types";

export function NewsPanel() {
  const { t, i18n } = useTranslation();
  const news = useMarketStore((s) => s.news);
  const fearGreed = useMarketStore((s) => s.fearGreed);
  const status = useMarketStore((s) => s.status);
  const dataLoaded = status === "success" || status === "error";
  const isZh = i18n.language === "zh";

  const [translating, setTranslating] = useState(false);

  // 切换到中文时，确保翻译已完成
  useEffect(() => {
    if (!isZh || news.length === 0) return;
    const needsTranslation = news.some((n) => !n.titleZh);
    if (!needsTranslation) return;

    setTranslating(true);
    ensureTranslations(news).then((translated) => {
      useMarketStore.setState({ news: translated });
      setTranslating(false);
    }).catch(() => setTranslating(false));
  }, [isZh, news.length]);

  const displayTitle = (n: NewsItem) => {
    if (isZh && n.titleZh) return n.titleZh;
    return n.title;
  };

  return (
    <Panel
      title={t("news.title")}
      icon={<Newspaper className="h-3.5 w-3.5" />}
      action={
        translating ? (
          <div className="flex items-center gap-1 font-mono text-[9px] text-neon-cyan">
            <Languages className="h-3 w-3 animate-pulse" />
            {t("news.translating")}
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-[1fr_180px] gap-3 p-3">
        {/* 新闻流 */}
        <div className="min-h-0">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-dim">
            ▸ {t("news.latest")}
          </div>
          {news.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-1 font-mono text-[10px] text-ink-dim">
              {dataLoaded ? (
                <>
                  <span className="text-neon-red/70">⚠ {t("news.sourceUnavailable")}</span>
                  <span className="text-[9px] text-ink-dim/70">{t("news.apiRestricted")}</span>
                </>
              ) : (
                <span>{t("common.loading")}</span>
              )}
            </div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {news.slice(0, 12).map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded border border-panel-border/40 bg-void-200/40 px-2 py-1.5 transition-colors hover:border-neon-cyan/30 hover:bg-neon-cyan/5"
                >
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      n.sentiment === "positive"
                        ? "bg-neon-green"
                        : n.sentiment === "negative"
                          ? "bg-neon-red"
                          : "bg-neon-cyan"
                    }`}
                    style={{
                      boxShadow:
                        n.sentiment === "positive"
                          ? "0 0 6px #00ff88"
                          : n.sentiment === "negative"
                            ? "0 0 6px #ff3366"
                            : "0 0 6px #00d4ff",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="line-clamp-2 font-sans text-[11px] leading-snug text-ink group-hover:text-neon-cyan">
                        {displayTitle(n)}
                      </p>
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-ink-dim opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-ink-dim">
                      <span>{n.source}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(n.publishedOn)}{t("common.ago")}</span>
                      {n.categories[0] && (
                        <>
                          <span>·</span>
                          <span className="text-neon-cyan/60">{n.categories[0]}</span>
                        </>
                      )}
                      {isZh && n.titleZh && (
                        <>
                          <span>·</span>
                          <span className="text-neon-cyan/40 flex items-center gap-0.5">
                            <Languages className="h-2 w-2" />
                            AI
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 恐惧贪婪指数 */}
        <div className="border-l border-panel-border pl-3">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-dim">
            ▸ {t("news.fearGreed")}
          </div>
          {fearGreed ? <FearGreedGauge data={fearGreed} /> : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 font-mono text-[10px] text-ink-dim">
              {dataLoaded ? (
                <>
                  <span className="text-neon-red/70">⚠ {t("news.sentimentUnavailable")}</span>
                  <span className="text-[9px] text-ink-dim/70">{t("news.apiRestricted")}</span>
                </>
              ) : (
                <span>{t("common.loading")}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function FearGreedGauge({ data }: { data: FearGreedIndex }) {
  const { t } = useTranslation();
  const value = data.value;
  const angle = (value / 100) * 180 - 90;

  const color =
    value < 25 ? "#ff3366" : value < 45 ? "#ffaa00" : value < 55 ? "#00d4ff" : value < 75 ? "#88dd44" : "#00ff88";

  const classificationMap: Record<string, string> = {
    "Extreme Fear": t("news.extremeFear"),
    "Fear": t("news.fear"),
    "Greed": t("news.greed"),
    "Extreme Greed": t("news.extremeGreed"),
    "Neutral": t("news.neutral"),
  };
  const labelZh = classificationMap[data.classification] ?? data.classification;

  const arcPath = describeArc(50, 50, 38, -90, 90);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" className="w-full">
        <path d={arcPath} fill="none" stroke="#1f2940" strokeWidth="6" strokeLinecap="round" />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="119.4"
          strokeDashoffset={119.4 - (119.4 * value) / 100}
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dashoffset 0.8s ease" }}
        />
        <line
          x1="50"
          y1="50"
          x2={50 + 32 * Math.cos((angle - 90) * (Math.PI / 180))}
          y2={50 + 32 * Math.sin((angle - 90) * (Math.PI / 180))}
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
        <circle cx="50" cy="50" r="2.5" fill={color} />
        <text x="50" y="44" textAnchor="middle" className="font-mono" fontSize="14" fontWeight="700" fill={color}>
          {value}
        </text>
      </svg>
      <div className="mt-1 font-display text-xs font-bold" style={{ color }}>
        {labelZh}
      </div>
      <div className="mt-2 grid w-full grid-cols-3 gap-1 text-center font-mono text-[8px]">
        <div>
          <div className="text-ink-dim">{t("common.yesterday")}</div>
          <div className="text-ink-muted">{data.yesterday}</div>
        </div>
        <div>
          <div className="text-ink-dim">{t("common.lastWeek")}</div>
          <div className="text-ink-muted">{data.lastWeek}</div>
        </div>
        <div>
          <div className="text-ink-dim">{t("common.lastMonth")}</div>
          <div className="text-ink-muted">{data.lastMonth}</div>
        </div>
      </div>
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}
