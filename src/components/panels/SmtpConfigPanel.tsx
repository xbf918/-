import { useState, useEffect } from "react";
import { Mail, Send, CheckCircle2, AlertCircle, Eye, EyeOff, Save, Zap, Server, Code2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { getEmailConfig, saveEmailConfig, testEmailConfig } from "@/services/email";
import type { EmailProvider } from "@/services/email";

const PRESET_SMTP = [
  { name: "QQ邮箱", host: "smtp.qq.com", port: 465, secure: true },
  { name: "163邮箱", host: "smtp.163.com", port: 465, secure: true },
  { name: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  { name: "Outlook", host: "smtp.office365.com", port: 587, secure: false },
];

const PROVIDER_OPTIONS: { value: EmailProvider; label: string; icon: any; desc: string }[] = [
  { value: "demo", label: "演示模式", icon: Code2, desc: "验证码显示在控制台，无需配置" },
  { value: "emailjs", label: "EmailJS", icon: Zap, desc: "第三方邮件服务，注册简单" },
  { value: "smtp", label: "SMTP", icon: Server, desc: "自建邮箱服务器，功能完整" },
];

export function SmtpConfigPanel() {
  const [provider, setProvider] = useState<EmailProvider>("demo");
  const [loading, setLoading] = useState(true);

  // SMTP 配置
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("CryptoPulse");
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // EmailJS 配置
  const [ejServiceId, setEjServiceId] = useState("");
  const [ejTemplateId, setEjTemplateId] = useState("");
  const [ejPublicKey, setEjPublicKey] = useState("");
  const [ejPrivateKey, setEjPrivateKey] = useState("");
  const [ejFromName, setEjFromName] = useState("CryptoPulse");
  const [ejFromEmail, setEjFromEmail] = useState("");
  const [showEjPrivateKey, setShowEjPrivateKey] = useState(false);

  // 测试
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
    type: null,
    message: "",
  });
  const [demoCode, setDemoCode] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await getEmailConfig();
      setProvider(result.provider);

      if (result.provider === "smtp" && result.config) {
        const c = result.config as any;
        setSmtpHost(c.host || "");
        setSmtpPort(String(c.port || 465));
        setSmtpSecure(c.secure ?? true);
        setSmtpUser(c.user || "");
        setSmtpFromName(c.fromName || "CryptoPulse");
      } else if (result.provider === "emailjs" && result.config) {
        const c = result.config as any;
        setEjServiceId(c.serviceId || "");
        setEjTemplateId(c.templateId || "");
        setEjPublicKey(c.publicKey || "");
        setEjFromName(c.fromName || "CryptoPulse");
        setEjFromEmail(c.fromEmail || "");
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus({ type: null, message: "" });
    setDemoCode(null);

    try {
      let config: Record<string, any> = {};

      if (provider === "smtp") {
        config = {
          host: smtpHost.trim(),
          port: parseInt(smtpPort, 10) || 465,
          secure: smtpSecure,
          user: smtpUser.trim(),
          pass: smtpPass,
          fromName: smtpFromName.trim() || "CryptoPulse",
        };
      } else if (provider === "emailjs") {
        config = {
          serviceId: ejServiceId.trim(),
          templateId: ejTemplateId.trim(),
          publicKey: ejPublicKey.trim(),
          privateKey: ejPrivateKey,
          fromName: ejFromName.trim() || "CryptoPulse",
          fromEmail: ejFromEmail.trim(),
        };
      }

      const result = await saveEmailConfig(provider, config);
      if (result.success) {
        setStatus({ type: "success", message: "配置已保存" });
      } else {
        setStatus({ type: "error", message: result.error || "保存失败" });
      }
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "保存失败" });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!testEmail) {
      setStatus({ type: "error", message: "请输入测试邮箱地址" });
      return;
    }
    setTesting(true);
    setStatus({ type: null, message: "" });
    setDemoCode(null);

    try {
      const result = await testEmailConfig(testEmail.trim());
      if (result.success) {
        if (result.demo && result.code) {
          setDemoCode(result.code);
          setStatus({ type: "success", message: "演示模式：验证码已生成（见下方）" });
        } else {
          setStatus({ type: "success", message: "测试邮件发送成功，请查收" });
        }
      } else {
        setStatus({ type: "error", message: result.error || "发送失败" });
      }
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "发送失败" });
    }
    setTesting(false);
  };

  const applySmtpPreset = (preset: typeof PRESET_SMTP[0]) => {
    setSmtpHost(preset.host);
    setSmtpPort(String(preset.port));
    setSmtpSecure(preset.secure);
  };

  const canSave =
    provider === "demo" ||
    (provider === "smtp" && smtpHost && smtpUser && smtpPass) ||
    (provider === "emailjs" && ejServiceId && ejTemplateId && ejPublicKey);

  return (
    <Panel title="邮件服务配置" icon={<Mail className="h-3.5 w-3.5" />}>
      <div className="p-2 space-y-3">
        {loading ? (
          <div className="py-4 text-center font-mono text-[10px] text-ink-dim">加载中...</div>
        ) : (
          <>
            {/* 服务选择 */}
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                邮件服务
              </label>
              <div className="grid grid-cols-3 gap-1">
                {PROVIDER_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = provider === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setProvider(opt.value)}
                      className={`flex flex-col items-center gap-1 rounded border px-1 py-2 transition-colors ${
                        active
                          ? "border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan"
                          : "border-panel-border bg-void-300/30 text-ink-muted hover:border-neon-cyan/30"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="font-mono text-[9px]">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 演示模式 */}
            {provider === "demo" && (
              <div className="rounded border border-neon-cyan/20 bg-neon-cyan/5 p-2">
                <p className="font-mono text-[10px] text-neon-cyan">
                  <Code2 className="mr-1 inline h-3 w-3" />
                  演示模式
                </p>
                <p className="mt-1 font-mono text-[9px] text-ink-dim leading-relaxed">
                  验证码将输出到开发服务器控制台，不会真实发送。
                  适合开发测试使用。
                </p>
              </div>
            )}

            {/* EmailJS 配置 */}
            {provider === "emailjs" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    Service ID (服务ID)
                  </label>
                  <input
                    type="text"
                    value={ejServiceId}
                    onChange={(e) => setEjServiceId(e.target.value)}
                    placeholder="service_xxx"
                    className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    Template ID (模板ID)
                  </label>
                  <input
                    type="text"
                    value={ejTemplateId}
                    onChange={(e) => setEjTemplateId(e.target.value)}
                    placeholder="template_xxx"
                    className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    Public Key (公钥)
                  </label>
                  <input
                    type="text"
                    value={ejPublicKey}
                    onChange={(e) => setEjPublicKey(e.target.value)}
                    placeholder="xxxxxxxxxxxxxx"
                    className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    Private Key (私钥，可选)
                  </label>
                  <div className="flex gap-1">
                    <input
                      type={showEjPrivateKey ? "text" : "password"}
                      value={ejPrivateKey}
                      onChange={(e) => setEjPrivateKey(e.target.value)}
                      placeholder="xxxxxxxxxxxxxx（可选）"
                      className="flex-1 rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEjPrivateKey(!showEjPrivateKey)}
                      className="rounded border border-panel-border bg-void-300 px-2 text-ink-muted transition-colors hover:text-ink"
                    >
                      {showEjPrivateKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                      发件人名称
                    </label>
                    <input
                      type="text"
                      value={ejFromName}
                      onChange={(e) => setEjFromName(e.target.value)}
                      placeholder="CryptoPulse"
                      className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                      发件人邮箱
                    </label>
                    <input
                      type="email"
                      value={ejFromEmail}
                      onChange={(e) => setEjFromEmail(e.target.value)}
                      placeholder="noreply@example.com"
                      className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded border border-neon-cyan/20 bg-neon-cyan/5 p-2">
                  <p className="font-mono text-[9px] text-ink-dim leading-relaxed">
                    💡 注册地址：<span className="text-neon-cyan">emailjs.com</span>
                    <br />
                    免费版每月 200 封邮件，足够个人使用。
                  </p>
                </div>
              </div>
            )}

            {/* SMTP 配置 */}
            {provider === "smtp" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    邮箱服务提供商
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {PRESET_SMTP.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => applySmtpPreset(p)}
                        className="rounded border border-panel-border bg-void-300/30 px-2 py-0.5 font-mono text-[9px] text-ink-muted transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                      SMTP 服务器
                    </label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                      className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                      端口
                    </label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      placeholder="465"
                      className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                      SSL
                    </label>
                    <div className="flex items-center h-[30px]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpSecure}
                          onChange={(e) => setSmtpSecure(e.target.checked)}
                          className="h-3 w-3 rounded border-panel-border bg-void-200 text-neon-cyan focus:ring-neon-cyan/20"
                        />
                        <span className="font-mono text-[9px] text-ink-muted">启用SSL</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    邮箱账号
                  </label>
                  <input
                    type="email"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="your-email@example.com"
                    className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    授权码 / 密码
                  </label>
                  <div className="flex gap-1">
                    <input
                      type={showSmtpPass ? "text" : "password"}
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="SMTP授权码"
                      className="flex-1 rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      className="rounded border border-panel-border bg-void-300 px-2 text-ink-muted transition-colors hover:text-ink"
                    >
                      {showSmtpPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="font-mono text-[8px] text-ink-dim">
                    注意：QQ邮箱/163邮箱需要使用「授权码」而非登录密码
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                    发件人名称
                  </label>
                  <input
                    type="text"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    placeholder="CryptoPulse"
                    className="w-full rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* 状态提示 */}
            {status.type && (
              <div
                className={`flex items-center gap-1.5 rounded border px-2 py-1.5 ${
                  status.type === "success"
                    ? "border-neon-green/30 bg-neon-green/10"
                    : "border-neon-red/30 bg-neon-red/10"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-neon-green" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neon-red" />
                )}
                <span
                  className={`font-mono text-[10px] ${
                    status.type === "success" ? "text-neon-green" : "text-neon-red"
                  }`}
                >
                  {status.message}
                </span>
              </div>
            )}

            {/* 演示模式验证码显示 */}
            {demoCode && (
              <div className="rounded border border-neon-cyan/40 bg-neon-cyan/10 p-2 text-center">
                <p className="font-mono text-[9px] text-neon-cyan">演示验证码</p>
                <p className="mt-1 font-mono text-xl font-bold tracking-widest text-neon-cyan">
                  {demoCode}
                </p>
              </div>
            )}

            {/* 保存按钮 */}
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-neon-cyan/40 bg-neon-cyan/10 py-1.5 font-mono text-[10px] font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/20 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {saving ? "保存中..." : "保存配置"}
            </button>

            {/* 测试发送 */}
            <div className="border-t border-panel-border pt-3 space-y-2">
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                  测试邮件发送
                </label>
                <div className="flex gap-1">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="收件邮箱地址"
                    className="flex-1 rounded border border-panel-border bg-void-200 px-2 py-1.5 font-mono text-[10px] text-ink placeholder:text-ink-dim focus:border-neon-cyan/50 focus:outline-none"
                  />
                  <button
                    onClick={handleTest}
                    disabled={testing || !testEmail}
                    className="flex shrink-0 items-center gap-1 rounded border border-neon-green/40 bg-neon-green/10 px-2 py-1.5 font-mono text-[10px] font-semibold text-neon-green transition-all hover:bg-neon-green/20 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    {testing ? "发送中..." : "测试"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
