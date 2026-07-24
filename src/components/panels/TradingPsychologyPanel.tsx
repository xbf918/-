import { useState, useMemo, useEffect } from 'react';
import { Brain, Plus, Trash2, AlertTriangle, Activity, Shield, Smile, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/Panel';
import { usePsychologyStore, MOOD_LABELS, type MoodType } from '@/store/usePsychologyStore';
import { useTradingStore } from '@/store/useTradingStore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';

const MOODS: MoodType[] = [
  "calm",
  "greedy",
  "fearful",
  "fomo",
  "hesitant",
  "angry",
  "overconfident",
];

const MOOD_COLORS: Record<MoodType, string> = {
  calm: "#22c55e",
  greedy: "#eab308",
  fearful: "#3b82f6",
  fomo: "#f97316",
  hesitant: "#6b7280",
  angry: "#ef4444",
  overconfident: "#a855f7",
};

export function TradingPsychologyPanel() {
  const { records, rules, addRecord, removeRecord, setRules, analyzePatterns, checkDiscipline } = usePsychologyStore();
  const history = useTradingStore((s) => s.history);
  const stats = useTradingStore((s) => s.stats);

  const [selectedMood, setSelectedMood] = useState<MoodType>("calm");
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const analysis = useMemo(() => analyzePatterns(), [records, analyzePatterns]);

  // 自动把最近的盈亏关联到没有 pnl 的情绪记录
  useEffect(() => {
    const unlinked = records.filter((r) => r.tradeId && r.pnl === undefined);
    if (unlinked.length === 0) return;
    for (const record of unlinked) {
      const trade = history.find((h) => h.id === record.tradeId);
      if (trade) {
        usePsychologyStore.getState().updateRecordPnl(record.id, trade.pnl, trade.pnlPercent);
      }
    }
  }, [records, history]);

  const handleAdd = () => {
    addRecord({
      mood: selectedMood,
      intensity,
      note,
    });
    setNote("");
    setIntensity(3);
    setShowForm(false);
  };

  const dailyPnlPercent = stats.totalPnlPercent;
  const discipline = checkDiscipline({
    consecutiveLosses: stats.consecutiveLosses || 0,
    dailyPnlPercent,
    consecutiveWins: stats.consecutiveWins || 0,
    lastTradeTime: history[0]?.closeTime ? history[0].closeTime * 1000 : undefined,
  });

  // 情绪-业绩数据
  const moodPerformanceData = useMemo(() => {
    return MOODS.map((mood) => ({
      mood: MOOD_LABELS[mood].label,
      count: analysis.byMood[mood].count,
      winRate: Math.round((analysis.byMood[mood].winRate || 0) * 100),
      avgPnl: analysis.byMood[mood].avgPnl || 0,
      totalPnl: analysis.byMood[mood].totalPnl || 0,
      color: MOOD_COLORS[mood],
    }));
  }, [analysis]);

  // 情绪变化趋势数据（最近 30 条，按时间正序）
  const moodTrendData = useMemo(() => {
    const chronological = [...records].reverse();
    const recent = chronological.slice(-30);
    return recent.map((r, idx) => ({
      idx,
      time: new Date(r.timestamp).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      intensity: r.intensity,
      mood: MOOD_LABELS[r.mood].label,
      color: MOOD_COLORS[r.mood],
      note: r.note,
      pnl: r.pnl,
    }));
  }, [records]);

  const hasPnlRecords = records.some((r) => r.pnl !== undefined);
  const hasTrendRecords = records.length > 1;

  return (
    <Panel title="交易心理学助手" icon={<Brain className="h-3.5 w-3.5 text-purple" />}>
      <div className="space-y-4 p-1">
        {/* 纪律提醒 */}
        {discipline.triggered && (
          <div
            className={cn(
              'flex items-start gap-2 rounded border p-2 font-mono text-[10px]',
              discipline.level === 'danger'
                ? 'border-neon-red/30 bg-neon-red/10 text-neon-red'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            )}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-bold">{discipline.level === 'danger' ? '纪律提醒' : '状态警告'}</div>
              <div>{discipline.reason}</div>
            </div>
          </div>
        )}

        {/* 情绪速览 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-void-200/50 p-2 text-center">
            <div className="font-mono text-lg font-bold text-purple">
              {Math.round(analysis.summary.fomoScore * 100)}%
            </div>
            <div className="font-mono text-[9px] text-ink-muted">FOMO/贪婪指数</div>
          </div>
          <div className="rounded bg-void-200/50 p-2 text-center">
            <div className={cn(
              'font-mono text-lg font-bold',
              analysis.summary.revengeTradeRisk === 'high' ? 'text-red' :
              analysis.summary.revengeTradeRisk === 'medium' ? 'text-yellow' : 'text-neon-green'
            )}>
              {analysis.summary.revengeTradeRisk === 'high' ? '高' :
               analysis.summary.revengeTradeRisk === 'medium' ? '中' : '低'}
            </div>
            <div className="font-mono text-[9px] text-ink-muted">报复交易风险</div>
          </div>
        </div>

        {/* 连胜/连败 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-void-200/50 p-2 text-center">
            <div className={cn(
              'font-mono text-lg font-bold',
              stats.consecutiveWins > 2 ? 'text-yellow' : 'text-neon-green'
            )}>
              {stats.consecutiveWins}
            </div>
            <div className="font-mono text-[9px] text-ink-muted">当前连胜</div>
          </div>
          <div className="rounded bg-void-200/50 p-2 text-center">
            <div className={cn(
              'font-mono text-lg font-bold',
              stats.consecutiveLosses >= rules.maxConsecutiveLosses ? 'text-red' :
              stats.consecutiveLosses > 1 ? 'text-yellow' : 'text-ink'
            )}>
              {stats.consecutiveLosses}
            </div>
            <div className="font-mono text-[9px] text-ink-muted">当前连败</div>
          </div>
        </div>

        {/* 建议 */}
        <div className="rounded bg-purple/5 border border-purple/20 p-2">
          <div className="mb-1 flex items-center gap-1 font-mono text-[10px] text-purple">
            <Smile className="h-3 w-3" />
            心理建议
          </div>
          <div className="font-mono text-[10px] text-ink">{analysis.summary.recommendation}</div>
        </div>

        {/* 添加记录 */}
        <div className="rounded bg-void-200/50 p-2">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex w-full items-center justify-center gap-1 rounded bg-purple/10 py-1.5 font-mono text-[10px] text-purple hover:bg-purple/20"
          >
            <Plus className="h-3 w-3" />
            {showForm ? '取消' : '记录当前情绪'}
          </button>

          {showForm && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-4 gap-1">
                {MOODS.map((mood) => {
                  const config = MOOD_LABELS[mood];
                  return (
                    <button
                      key={mood}
                      onClick={() => setSelectedMood(mood)}
                      className={cn(
                        'flex flex-col items-center gap-0.5 rounded border p-1 font-mono text-[9px] transition-colors',
                        selectedMood === mood
                          ? 'border-purple/50 bg-purple/10 text-purple'
                          : 'border-ink/10 bg-void-100 text-ink-muted hover:bg-void-200'
                      )}
                    >
                      <span>{config.emoji}</span>
                      <span>{config.label}</span>
                    </button>
                  );
                })}
              </div>
              <div>
                <div className="mb-1 flex justify-between font-mono text-[9px] text-ink-muted">
                  <span>强度</span>
                  <span>{intensity}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  className="w-full h-1 rounded-full bg-ink/20 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple"
                />
              </div>
              <textarea
                placeholder="写下你现在的想法..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-purple resize-none"
              />
              <button
                onClick={handleAdd}
                className="w-full rounded bg-neon-green/10 py-1.5 font-mono text-[10px] text-neon-green hover:bg-neon-green/20"
              >
                保存记录
              </button>
            </div>
          )}
        </div>

        {/* 情绪可视化分析 */}
        {(hasPnlRecords || hasTrendRecords) && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] text-ink-muted flex items-center gap-1">
              <BarChart3 className="h-3 w-3 text-blue" />
              情绪 - 业绩可视化
            </div>

            <div className="grid grid-cols-1 gap-2">
              {hasPnlRecords && (
                <div className="rounded bg-void-200/50 p-2">
                  <div className="mb-1 font-mono text-[9px] text-ink-muted">各情绪胜率对比 (%)</div>
                  <div className="h-[160px] w-full text-ink-muted">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moodPerformanceData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="mood" tick={{ fill: 'currentColor', fontSize: 9 }} interval={0} />
                        <YAxis tick={{ fill: 'currentColor', fontSize: 9 }} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0b0c15', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                          labelStyle={{ fontSize: 10, color: '#94a3b8' }}
                          formatter={(value: any, name: any, props: any) => [`${value}% (${props.payload.count}笔)`, '胜率']}
                        />
                        <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                        <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                          {moodPerformanceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {hasPnlRecords && (
                <div className="rounded bg-void-200/50 p-2">
                  <div className="mb-1 font-mono text-[9px] text-ink-muted">各情绪平均盈亏 ($)</div>
                  <div className="h-[160px] w-full text-ink-muted">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moodPerformanceData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="mood" tick={{ fill: 'currentColor', fontSize: 9 }} interval={0} />
                        <YAxis tick={{ fill: 'currentColor', fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0b0c15', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                          labelStyle={{ fontSize: 10, color: '#94a3b8' }}
                          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, '平均盈亏']}
                        />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                        <Bar dataKey="avgPnl" radius={[3, 3, 0, 0]}>
                          {moodPerformanceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.avgPnl >= 0 ? '#22c55e' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {hasTrendRecords && (
                <div className="rounded bg-void-200/50 p-2">
                  <div className="mb-1 font-mono text-[9px] text-ink-muted flex items-center gap-1">
                    <LineChartIcon className="h-3 w-3 text-purple" />
                    情绪变化趋势（最近 30 条）
                  </div>
                  <div className="h-[160px] w-full text-ink-muted">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={moodTrendData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="idx" tick={{ fill: 'currentColor', fontSize: 9 }} tickFormatter={(i) => moodTrendData[i]?.time ?? ''} />
                        <YAxis dataKey="intensity" tick={{ fill: 'currentColor', fontSize: 9 }} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0b0c15', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                          labelStyle={{ fontSize: 10, color: '#94a3b8' }}
                          formatter={(value: any, name: any, props: any) => {
                            const p = props.payload;
                            return [`强度 ${value} · ${p.mood}${p.pnl !== undefined ? ` · 盈亏 $${p.pnl.toFixed(2)}` : ''}`, '情绪'];
                          }}
                          labelFormatter={(label: any) => moodTrendData[label]?.time ?? ''}
                        />
                        <Line
                          type="monotone"
                          dataKey="intensity"
                          stroke="#a855f7"
                          strokeWidth={2}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (cx == null || cy == null) return null;
                            return <circle cx={cx} cy={cy} r={3} fill={payload.color} stroke="none" />;
                          }}
                          activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 模式识别 */}
        <div className="rounded bg-void-200/50 p-2">
          <div className="mb-2 flex items-center gap-1 font-mono text-[10px] text-ink-muted">
            <Activity className="h-3 w-3 text-blue" />
            情绪 - 业绩模式
          </div>
          <div className="space-y-1">
            {MOODS.filter((m) => analysis.byMood[m].count > 0).map((mood) => {
              const data = analysis.byMood[mood];
              const config = MOOD_LABELS[mood];
              return (
                <div key={mood} className="flex items-center justify-between rounded bg-void-100 px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">{config.emoji}</span>
                    <span className={cn('font-mono text-[9px]', config.color)}>{config.label}</span>
                    <span className="font-mono text-[9px] text-ink-muted">{data.count}次</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[9px]">
                    <span className={cn(data.winRate >= 0.5 ? 'text-neon-green' : 'text-red')}>
                      胜率 {(data.winRate * 100).toFixed(0)}%
                    </span>
                    <span className={cn(data.avgPnl >= 0 ? 'text-neon-green' : 'text-red')}>
                      均{data.avgPnl >= 0 ? '+' : ''}${data.avgPnl.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            })}
            {MOODS.every((m) => analysis.byMood[m].count === 0) && (
              <div className="text-center font-mono text-[10px] text-ink-muted py-2">
                记录带盈亏的情绪后自动分析
              </div>
            )}
          </div>
        </div>

        {/* 最近记录 */}
        <div className="rounded bg-void-200/50 p-2">
          <div className="mb-2 font-mono text-[10px] text-ink-muted">最近记录</div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {records.slice(0, 20).map((record) => {
              const config = MOOD_LABELS[record.mood];
              return (
                <div key={record.id} className="flex items-start justify-between rounded bg-void-100 px-2 py-1.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">{config.emoji}</span>
                      <span className={cn('font-mono text-[9px]', config.color)}>{config.label}</span>
                      <span className="font-mono text-[9px] text-ink-muted">
                        {new Date(record.timestamp).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {record.note && (
                      <div className="mt-0.5 font-mono text-[9px] text-ink-muted line-clamp-1">{record.note}</div>
                    )}
                    {record.pnl !== undefined && (
                      <div className={cn('font-mono text-[9px]', record.pnl >= 0 ? 'text-neon-green' : 'text-red')}>
                        {record.pnl >= 0 ? '+' : ''}${record.pnl.toFixed(2)} ({record.pnlPercent?.toFixed(2)}%)
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeRecord(record.id)}
                    className="ml-2 rounded bg-neon-red/10 p-1 text-neon-red hover:bg-neon-red/20"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {records.length === 0 && (
              <div className="text-center font-mono text-[10px] text-ink-muted py-2">暂无记录</div>
            )}
          </div>
        </div>

        {/* 纪律规则 */}
        <div className="rounded bg-void-200/50 p-2">
          <div className="mb-2 flex items-center gap-1 font-mono text-[10px] text-ink-muted">
            <Shield className="h-3 w-3 text-neon-green" />
            纪律规则
          </div>
          <div className="space-y-2">
            <RuleRow
              label="启用纪律提醒"
              value={rules.enabled}
              onChange={(v) => setRules({ enabled: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberRule
                label="最大连续亏损"
                value={rules.maxConsecutiveLosses}
                onChange={(v) => setRules({ maxConsecutiveLosses: v })}
                suffix="次"
              />
              <NumberRule
                label="日亏损暂停"
                value={rules.dailyLossPausePercent}
                onChange={(v) => setRules({ dailyLossPausePercent: v })}
                suffix="%"
              />
              <NumberRule
                label="连胜后提醒"
                value={rules.fomoPauseAfterConsecutiveWins}
                onChange={(v) => setRules({ fomoPauseAfterConsecutiveWins: v })}
                suffix="次"
              />
              <NumberRule
                label="报复交易冷却"
                value={rules.revengeTradeCooldownMinutes}
                onChange={(v) => setRules({ revengeTradeCooldownMinutes: v })}
                suffix="分"
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function RuleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-ink">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'h-4 w-7 rounded-full p-0.5 transition-colors',
          value ? 'bg-neon-green' : 'bg-ink/20'
        )}
      >
        <div className={cn(
          'h-3 w-3 rounded-full bg-white transition-transform',
          value ? 'translate-x-3' : 'translate-x-0'
        )} />
      </button>
    </div>
  );
}

function NumberRule({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9px] text-ink-muted">{label}</div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-purple"
        />
        <span className="font-mono text-[9px] text-ink-muted">{suffix}</span>
      </div>
    </div>
  );
}
