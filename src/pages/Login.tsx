import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Activity,
  User,
  Lock,
  LogIn,
  UserPlus,
  AlertCircle,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
  Send,
  CheckCircle2,
  Info,
  ArrowLeft,
  RefreshCw,
  Globe,
  ChevronDown,
} from "lucide-react";

type AuthMode = "login" | "register" | "reset_step1" | "reset_step2";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const {
    login,
    register,
    sendVerificationCode,
    resetPassword,
    error,
    clearError,
    setError,
  } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const changeLang = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("lang", lng);
    setLangOpen(false);
  };

  useEffect(() => {
    clearError();
    setSentSuccess(false);
    setCode("");
    setResetSuccess(false);
    setConfirmPassword("");
  }, [mode, clearError]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = useCallback(async (type: "register" | "reset") => {
    if (countdown > 0) return;
    setSubmitting(true);
    setDemoCode(null);
    const result = await sendVerificationCode(email, type);
    setSubmitting(false);
    if (result.success) {
      setCountdown(60);
      setSentSuccess(true);
      if (result.demo && result.code) {
        setDemoCode(result.code);
      }
    }
  }, [email, countdown, sendVerificationCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    if (mode === "login") {
      login(username, password);
      setSubmitting(false);
    } else if (mode === "register") {
      const ok = await register(username, email, password, code);
      setSubmitting(false);
      if (!ok) {
        // 注册失败，保持在注册页面
      }
    } else if (mode === "reset_step2") {
      if (password !== confirmPassword) {
        setError("auth.errPasswordMismatch");
        setSubmitting(false);
        return;
      }
      const ok = await resetPassword(email, code, password);
      setSubmitting(false);
      if (ok) {
        setResetSuccess(true);
      }
    }
  };

  const errorText = error ? t(error) : null;

  const renderResetStep1 = () => (
    <form onSubmit={(e) => { e.preventDefault(); handleSendCode("reset"); }} className="space-y-4">
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.email")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <Mail className="h-4 w-4 text-ink-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      {errorText && (
        <div className="flex items-center gap-2 rounded-lg border border-neon-red/30 bg-neon-red/10 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neon-red" />
          <span className="font-mono text-[11px] text-neon-red">{errorText}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !email}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 py-2.5 font-mono text-sm font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/20 hover:shadow-glow-cyan disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {t("auth.sendResetCode")}
      </button>

      <button
        type="button"
        onClick={() => setMode("login")}
        className="flex w-full items-center justify-center gap-1 py-2 font-mono text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("auth.backToLogin")}
      </button>
    </form>
  );

  const renderResetStep2 = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.email")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3">
          <Mail className="h-4 w-4 text-ink-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.verificationCode")}
        </label>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
            <ShieldCheck className="h-4 w-4 text-ink-muted" />
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("auth.codePlaceholder")}
              className="w-full bg-transparent py-2.5 font-mono text-sm tracking-widest text-ink placeholder:text-ink-dim focus:outline-none"
              maxLength={6}
            />
          </div>
          <button
            type="button"
            onClick={() => handleSendCode("reset")}
            disabled={countdown > 0 || !email}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 font-mono text-xs font-semibold transition-all ${
              countdown > 0 || !email
                ? "border border-panel-border bg-void-200 text-ink-dim"
                : "border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20"
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {countdown > 0 ? `${countdown}s` : t("auth.resend")}
          </button>
        </div>

        {sentSuccess && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-neon-green/30 bg-neon-green/10 px-3 py-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-green" />
            <div className="flex-1">
              <p className="font-mono text-[10px] font-semibold text-neon-green">
                {t("auth.codeSent")}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-dim">
                {t("auth.codeSentHint")}
              </p>
              {demoCode && (
                <div className="mt-2 rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1.5 text-center">
                  <p className="font-mono text-[9px] text-neon-cyan">演示模式验证码</p>
                  <p className="font-mono text-lg font-bold tracking-widest text-neon-cyan">
                    {demoCode}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.newPassword")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <Lock className="h-4 w-4 text-ink-muted" />
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-ink-muted transition-colors hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.confirmPassword")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <Lock className="h-4 w-4 text-ink-muted" />
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      {errorText && (
        <div className="flex items-center gap-2 rounded-lg border border-neon-red/30 bg-neon-red/10 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neon-red" />
          <span className="font-mono text-[11px] text-neon-red">{errorText}</span>
        </div>
      )}

      {resetSuccess ? (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-neon-green/30 bg-neon-green/10 px-3 py-4">
            <CheckCircle2 className="h-6 w-6 text-neon-green" />
            <div className="text-center">
              <p className="font-mono text-sm font-semibold text-neon-green">
                {t("auth.resetSuccess")}
              </p>
              <p className="mt-1 font-mono text-[10px] text-ink-dim">
                {t("auth.resetSuccessHint")}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMode("login")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 py-2.5 font-mono text-sm font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/20"
          >
            <LogIn className="h-4 w-4" />
            {t("auth.login")}
          </button>
        </div>
      ) : (
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 py-2.5 font-mono text-sm font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/20 hover:shadow-glow-cyan disabled:opacity-50"
        >
          {submitting ? (
            <span className="animate-pulse">{t("auth.processing")}</span>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              {t("auth.resetPassword")}
            </>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={() => setMode("reset_step1")}
        className="flex w-full items-center justify-center gap-1 py-2 font-mono text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("auth.back")}
      </button>
    </form>
  );

  const renderLoginForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.usernameOrEmail")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <User className="h-4 w-4 text-ink-muted" />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("auth.loginPlaceholder")}
            autoComplete="username"
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.password")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <Lock className="h-4 w-4 text-ink-muted" />
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            autoComplete="current-password"
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-ink-muted transition-colors hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMode("reset_step1")}
        className="w-full text-right font-mono text-xs text-neon-cyan transition-colors hover:text-neon-green"
      >
        {t("auth.forgotPassword")}
      </button>

      {errorText && (
        <div className="flex items-center gap-2 rounded-lg border border-neon-red/30 bg-neon-red/10 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neon-red" />
          <span className="font-mono text-[11px] text-neon-red">{errorText}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 py-2.5 font-mono text-sm font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/20 hover:shadow-glow-cyan disabled:opacity-50"
      >
        {submitting ? (
          <span className="animate-pulse">{t("auth.processing")}</span>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            {t("auth.login")}
          </>
        )}
      </button>
    </form>
  );

  const renderRegisterForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.username")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <User className="h-4 w-4 text-ink-muted" />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("auth.usernamePlaceholder")}
            autoComplete="username"
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.email")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <Mail className="h-4 w-4 text-ink-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.verificationCode")}
        </label>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
            <ShieldCheck className="h-4 w-4 text-ink-muted" />
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("auth.codePlaceholder")}
              className="w-full bg-transparent py-2.5 font-mono text-sm tracking-widest text-ink placeholder:text-ink-dim focus:outline-none"
              maxLength={6}
            />
          </div>
          <button
            type="button"
            onClick={() => handleSendCode("register")}
            disabled={countdown > 0 || !email}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 font-mono text-xs font-semibold transition-all ${
              countdown > 0 || !email
                ? "border border-panel-border bg-void-200 text-ink-dim"
                : "border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20 hover:shadow-glow-cyan"
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            {countdown > 0 ? `${countdown}s` : t("auth.sendCode")}
          </button>
        </div>

        {sentSuccess && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-neon-green/30 bg-neon-green/10 px-3 py-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-green" />
            <div className="flex-1">
              <p className="font-mono text-[10px] font-semibold text-neon-green">
                {t("auth.codeSent")}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-dim">
                {t("auth.codeSentHint")}
              </p>
              {demoCode && (
                <div className="mt-2 rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1.5 text-center">
                  <p className="font-mono text-[9px] text-neon-cyan">演示模式验证码</p>
                  <p className="font-mono text-lg font-bold tracking-widest text-neon-cyan">
                    {demoCode}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t("auth.password")}
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-void-200 px-3 transition-colors focus-within:border-neon-cyan/50">
          <Lock className="h-4 w-4 text-ink-muted" />
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            autoComplete="new-password"
            className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-ink-muted transition-colors hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {errorText && (
        <div className="flex items-center gap-2 rounded-lg border border-neon-red/30 bg-neon-red/10 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neon-red" />
          <span className="font-mono text-[11px] text-neon-red">{errorText}</span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-panel-border bg-void-200/50 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-cyan" />
        <p className="font-mono text-[10px] text-ink-dim">
          {t("auth.registerHint")}
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 py-2.5 font-mono text-sm font-semibold text-neon-cyan transition-all hover:bg-neon-cyan/20 hover:shadow-glow-cyan disabled:opacity-50"
      >
        {submitting ? (
          <span className="animate-pulse">{t("auth.processing")}</span>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            {t("auth.register")}
          </>
        )}
      </button>
    </form>
  );

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-void bg-grid">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent" style={{ animation: "scan 8s linear infinite" }} />
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-neon-purple/10 blur-[120px]" />
      </div>

      {/* 语言切换 */}
      <div ref={langRef} className="absolute right-5 top-5 z-20">
        <button
          onClick={() => setLangOpen((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-neon-cyan/40 bg-void-100/80 px-2.5 text-neon-cyan backdrop-blur-sm transition-all hover:bg-neon-cyan/10 hover:shadow-glow-cyan"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="font-mono text-xs font-semibold">
            {i18n.language === "zh" ? "中文" : "EN"}
          </span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {langOpen && (
          <div className="absolute right-0 top-full mt-2 w-36 overflow-hidden rounded-lg border border-panel-border bg-void-100 shadow-2xl">
            <button
              onClick={() => changeLang("zh")}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neon-cyan/10 ${
                i18n.language === "zh" ? "text-neon-cyan" : "text-ink"
              }`}
            >
              <span className="font-mono text-xs">🇨🇳 中文</span>
              {i18n.language === "zh" && <span className="ml-auto text-neon-cyan">✓</span>}
            </button>
            <button
              onClick={() => changeLang("en")}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neon-cyan/10 ${
                i18n.language === "en" ? "text-neon-cyan" : "text-ink"
              }`}
            >
              <span className="font-mono text-xs">🇺🇸 English</span>
              {i18n.language === "en" && <span className="ml-auto text-neon-cyan">✓</span>}
            </button>
          </div>
        )}
      </div>

      <div className="relative z-10 w-full max-w-md animate-slide-up px-6">
        <div className="rounded-xl border border-panel-border bg-void-100/80 p-6 shadow-2xl backdrop-blur-xl">
          {(mode === "login" || mode === "register") && (
            <div className="mb-6 flex rounded-lg border border-panel-border bg-void-200 p-1">
              <button
                onClick={() => setMode("login")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded py-2 font-mono text-xs font-semibold transition-all ${
                  mode === "login"
                    ? "bg-neon-cyan/20 text-neon-cyan shadow-glow-cyan"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <LogIn className="h-3.5 w-3.5" />
                {t("auth.login")}
              </button>
              <button
                onClick={() => setMode("register")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded py-2 font-mono text-xs font-semibold transition-all ${
                  mode === "register"
                    ? "bg-neon-cyan/20 text-neon-cyan shadow-glow-cyan"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {t("auth.register")}
              </button>
            </div>
          )}

          {mode === "login" && renderLoginForm()}
          {mode === "register" && renderRegisterForm()}
          {mode === "reset_step1" && renderResetStep1()}
          {mode === "reset_step2" && renderResetStep2()}
        </div>

        {(mode === "login" || mode === "register") && (
          <div className="mt-4 text-center">
            <p className="font-mono text-[10px] text-ink-dim">
              {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
              <button
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-neon-cyan transition-colors hover:text-neon-green"
              >
                {mode === "login" ? t("auth.register") : t("auth.login")}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
