import { useState, useEffect } from 'react';
import { Bell, Send, MessageCircle, Mail, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/Panel';
import {
  fetchNotificationConfig,
  updateNotificationConfig,
  updateNotificationRules,
  testNotification,
  type NotificationConfig,
  type NotificationRule,
  type NotificationChannel,
  type NotificationEvent,
} from '@/services/server';

const EVENT_OPTIONS: { value: NotificationEvent; label: string }[] = [
  { value: 'price_alert', label: '价格告警' },
  { value: 'signal_generated', label: '交易信号' },
  { value: 'position_opened', label: '仓位开仓' },
  { value: 'position_closed', label: '仓位平仓' },
  { value: 'stop_loss', label: '止损触发' },
  { value: 'take_profit', label: '止盈触发' },
  { value: 'risk_triggered', label: '风控触发' },
  { value: 'drawdown_warning', label: '回撤警告' },
  { value: 'daily_loss_limit', label: '日亏损限制' },
  { value: 'custom', label: '自定义' },
];

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string; icon: typeof Bell }[] = [
  { value: 'browser', label: '浏览器', icon: Bell },
  { value: 'telegram', label: 'Telegram', icon: MessageCircle },
  { value: 'email', label: '邮件', icon: Mail },
];

export function NotificationSettingsPanel() {
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<NotificationChannel | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await fetchNotificationConfig();
      setConfig(data);
    } catch (e) {
      showMessage('加载配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const saveConfig = async (partial: Partial<NotificationConfig>) => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await updateNotificationConfig({ ...config, ...partial });
      setConfig(updated);
      showMessage('保存成功', 'success');
    } catch (e) {
      showMessage('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async (rules: NotificationRule[]) => {
    setSaving(true);
    try {
      const updated = await updateNotificationRules(rules);
      setConfig(updated);
      showMessage('规则保存成功', 'success');
    } catch (e) {
      showMessage('规则保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel: NotificationChannel) => {
    setTesting(channel);
    try {
      await testNotification('custom', { message: `测试 ${CHANNEL_OPTIONS.find((c) => c.value === channel)?.label} 通知` });
      showMessage('测试通知已发送', 'success');
    } catch (e) {
      showMessage('测试发送失败', 'error');
    } finally {
      setTesting(null);
    }
  };

  const addRule = () => {
    if (!config) return;
    const newRule: NotificationRule = {
      id: `rule-${Date.now()}`,
      name: '新规则',
      event: 'price_alert',
      channels: ['browser'],
      enabled: true,
      cooldownMinutes: 5,
    };
    saveRules([...config.rules, newRule]);
  };

  const updateRule = (id: string, patch: Partial<NotificationRule>) => {
    if (!config) return;
    const rules = config.rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setConfig({ ...config, rules });
  };

  const removeRule = (id: string) => {
    if (!config) return;
    saveRules(config.rules.filter((r) => r.id !== id));
  };

  const toggleChannel = (rule: NotificationRule, channel: NotificationChannel) => {
    const channels = rule.channels.includes(channel)
      ? rule.channels.filter((c) => c !== channel)
      : [...rule.channels, channel];
    updateRule(rule.id, { channels });
  };

  if (loading || !config) {
    return (
      <Panel title="通知设置" icon={<Bell className="h-3.5 w-3.5 text-blue" />}>
        <div className="p-4 text-center font-mono text-[10px] text-ink-muted">加载中...</div>
      </Panel>
    );
  }

  return (
    <Panel title="通知设置" icon={<Bell className="h-3.5 w-3.5 text-blue" />}>
      <div className="space-y-4 p-1">
        {message && (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded p-2 font-mono text-[10px]',
              message.type === 'success'
                ? 'border border-neon-green/30 bg-neon-green/10 text-neon-green'
                : 'border border-neon-red/30 bg-neon-red/10 text-neon-red'
            )}
          >
            {message.type === 'success' ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {message.text}
          </div>
        )}

        {/* 全局开关 */}
        <div className="rounded bg-void-200/50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs font-bold text-ink">全局通知</div>
              <div className="font-mono text-[9px] text-ink-muted">启用后系统才会发送任何通知</div>
            </div>
            <ToggleSwitch
              checked={config.globalEnabled}
              onChange={(v) => saveConfig({ globalEnabled: v })}
            />
          </div>
          <div className="mt-3">
            <label className="font-mono text-[9px] text-ink-muted">全局冷却（分钟）</label>
            <input
              type="number"
              min={0}
              value={config.globalCooldownMinutes}
              onChange={(e) => saveConfig({ globalCooldownMinutes: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
          </div>
        </div>

        {/* Telegram */}
        <div className="rounded bg-void-200/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5 text-blue" />
            <span className="font-mono text-xs font-bold text-ink">Telegram Bot</span>
          </div>
          <div className="space-y-2">
            <input
              placeholder="Bot Token"
              value={config.telegram.botToken}
              onChange={(e) => saveConfig({ telegram: { ...config.telegram, botToken: e.target.value } })}
              className="w-full rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <input
              placeholder="Chat ID"
              value={config.telegram.chatId}
              onChange={(e) => saveConfig({ telegram: { ...config.telegram, chatId: e.target.value } })}
              className="w-full rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <div className="flex items-center justify-between">
              <ToggleSwitch
                checked={config.telegram.enabled}
                onChange={(v) => saveConfig({ telegram: { ...config.telegram, enabled: v } })}
                label="启用"
              />
              <button
                onClick={() => handleTest('telegram')}
                disabled={testing === 'telegram' || saving}
                className="flex items-center gap-1 rounded bg-blue/10 px-2 py-1 font-mono text-[9px] text-blue hover:bg-blue/20 disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                {testing === 'telegram' ? '发送中' : '测试'}
              </button>
            </div>
          </div>
        </div>

        {/* Email */}
        <div className="rounded bg-void-200/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-blue" />
            <span className="font-mono text-xs font-bold text-ink">邮件 SMTP</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="SMTP 主机"
              value={config.email.smtpHost}
              onChange={(e) => saveConfig({ email: { ...config.email, smtpHost: e.target.value } })}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <input
              type="number"
              placeholder="端口"
              value={config.email.smtpPort}
              onChange={(e) => saveConfig({ email: { ...config.email, smtpPort: parseInt(e.target.value) || 0 } })}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <input
              placeholder="用户名"
              value={config.email.username}
              onChange={(e) => saveConfig({ email: { ...config.email, username: e.target.value } })}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <input
              type="password"
              placeholder="密码"
              value={config.email.password}
              onChange={(e) => saveConfig({ email: { ...config.email, password: e.target.value } })}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <input
              placeholder="发件人"
              value={config.email.from}
              onChange={(e) => saveConfig({ email: { ...config.email, from: e.target.value } })}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
            <input
              placeholder="收件人（逗号分隔）"
              value={config.email.to.join(',')}
              onChange={(e) => saveConfig({ email: { ...config.email, to: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })}
              className="rounded border border-ink/10 bg-void-100 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ToggleSwitch
                checked={config.email.enabled}
                onChange={(v) => saveConfig({ email: { ...config.email, enabled: v } })}
                label="启用"
              />
              <ToggleSwitch
                checked={config.email.secure}
                onChange={(v) => saveConfig({ email: { ...config.email, secure: v } })}
                label="SSL"
              />
            </div>
            <button
              onClick={() => handleTest('email')}
              disabled={testing === 'email' || saving}
              className="flex items-center gap-1 rounded bg-blue/10 px-2 py-1 font-mono text-[9px] text-blue hover:bg-blue/20 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              {testing === 'email' ? '发送中' : '测试'}
            </button>
          </div>
        </div>

        {/* 规则 */}
        <div className="rounded bg-void-200/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-ink">通知规则</span>
            <button
              onClick={addRule}
              className="flex items-center gap-1 rounded bg-neon-green/10 px-2 py-1 font-mono text-[9px] text-neon-green hover:bg-neon-green/20"
            >
              <Plus className="h-3 w-3" />
              添加
            </button>
          </div>
          <div className="space-y-2">
            {config.rules.map((rule) => (
              <div key={rule.id} className="rounded border border-ink/10 bg-void-100 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                    className="flex-1 rounded border border-ink/10 bg-void-200 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
                  />
                  <ToggleSwitch
                    checked={rule.enabled}
                    onChange={(v) => updateRule(rule.id, { enabled: v })}
                  />
                  <button
                    onClick={() => saveRules(config.rules.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled, name: rule.name } : r)))}
                    className="rounded bg-blue/10 p-1 text-blue hover:bg-blue/20"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="rounded bg-neon-red/10 p-1 text-neon-red hover:bg-neon-red/20"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <select
                    value={rule.event}
                    onChange={(e) => updateRule(rule.id, { event: e.target.value as NotificationEvent })}
                    className="rounded border border-ink/10 bg-void-200 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
                  >
                    {EVENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="冷却(分)"
                    value={rule.cooldownMinutes || 0}
                    onChange={(e) => updateRule(rule.id, { cooldownMinutes: parseFloat(e.target.value) || 0 })}
                    className="rounded border border-ink/10 bg-void-200 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
                  />
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {CHANNEL_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = rule.channels.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleChannel(rule, opt.value)}
                        className={cn(
                          'flex items-center gap-1 rounded px-2 py-1 font-mono text-[9px] transition-colors',
                          active ? 'bg-blue/20 text-blue' : 'bg-void-200 text-ink-muted hover:text-ink'
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {rule.event === 'signal_generated' && (
                  <input
                    type="number"
                    step={0.01}
                    max={1}
                    min={0}
                    placeholder="最小置信度 (0-1)"
                    value={rule.minConfidence || 0}
                    onChange={(e) => updateRule(rule.id, { minConfidence: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-ink/10 bg-void-200 px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-blue"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5"
    >
      <div
        className={cn(
          'h-4 w-7 rounded-full p-0.5 transition-colors',
          checked ? 'bg-neon-green' : 'bg-ink/20'
        )}
      >
        <div
          className={cn(
            'h-3 w-3 rounded-full bg-white transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0'
          )}
        />
      </div>
      {label && <span className="font-mono text-[9px] text-ink-muted">{label}</span>}
    </button>
  );
}
