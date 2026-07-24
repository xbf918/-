import { useState, useEffect } from "react";
import { LayoutDashboard, Grid3X3, Columns2, PanelLeftClose, ChevronRight, Sparkles, TrendingUp, Zap, Shield, BarChart3, Settings, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
export function LayoutPreview() {
 const [activeLayout, setActiveLayout] = useState(0);
 const [darkMode, setDarkMode] = useState(true);

 useEffect(() => {
 document.body.style.overflow = "auto";
 document.documentElement.style.overflow = "auto";
 document.body.style.height = "auto";
 document.documentElement.style.height = "auto";
 return () => {
 document.body.style.overflow = "";
 document.documentElement.style.overflow = "";
 document.body.style.height = "";
 document.documentElement.style.height = "";
 };
 }, []);
 const layouts = [
 {
 id: 0,
 name: "经典三栏布局",
 description: "左侧导航 + 中间主图表 + 右侧信息面板",
 icon: Grid3X3,
 features: ["左侧导航栏", "中央K线图", "右侧信号/订单", "底部指标"],
 },
 {
 id: 1,
 name: "顶部导航布局",
 description: "顶部导航 + 全宽主图表 + 底部信息区",
 icon: Columns2,
 features: ["顶部交易对", "全屏K线图", "底部多面板", "简洁布局"],
 },
 {
 id: 2,
 name: "沉浸式布局",
 description: "全屏主图表 + 可折叠侧边面板",
 icon: PanelLeftClose,
 features: ["全屏K线图", "可折叠侧边栏", "最小干扰", "专注交易"],
 },
 {
 id: 3,
 name: "加密交易所风格",
 description: "参考Binance/KuCoin的专业交易布局",
 icon: LayoutDashboard,
 features: ["顶部导航", "左侧市场", "中央图表", "右侧交易"],
 },
 ];
 return (<div className={cn("min-h-screen overflow-y-auto", darkMode ? "bg-void" : "bg-gray-50")} style={{ overflow: "auto" }}>
 <div className={cn("sticky top-0 z-50 flex items-center justify-between border-b px-6 py-4", darkMode ? "border-panel-border bg-void-100/90 backdrop-blur-xl" : "border-gray-200 bg-white/90 backdrop-blur-xl")}>
 <div className="flex items-center gap-4">
 <div className={cn("flex items-center gap-2", darkMode ? "text-neon-cyan" : "text-blue-600")}>
 <Sparkles className="h-5 w-5"/>
 <span className="font-display text-lg font-bold">CryptoPulse</span>
 </div>
 <span className="text-xs text-ink-dim">UI布局预览</span>
 </div>
 <div className="flex items-center gap-4">
 <button onClick={() => setDarkMode(!darkMode)} className={cn("flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors", darkMode
 ? "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20"
 : "border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200")}>
 {darkMode ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
 {darkMode ? "浅色模式" : "深色模式"}
 </button>
 </div>
 </div>

 <div className="container mx-auto px-6 py-8">
 <div className={cn("mb-8 rounded-2xl p-6 text-center", darkMode ? "bg-gradient-to-r from-neon-purple/20 via-neon-cyan/10 to-neon-green/20" : "bg-gradient-to-r from-blue-50 to-purple-50")}>
 <h1 className={cn("mb-2 text-3xl font-bold", darkMode ? "text-ink" : "text-gray-900")}>
 专业金融交易软件布局方案
 </h1>
 <p className={cn("max-w-2xl mx-auto", darkMode ? "text-ink-muted" : "text-gray-600")}>
 以下展示四种专业金融软件布局方案，基于加密货币交易所风格设计。
 请选择您喜欢的布局后，我将全面升级系统UI。
 </p>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
 {layouts.map((layout) => {
 const Icon = layout.icon;
 const isActive = activeLayout === layout.id;
 return (<button key={layout.id} onClick={() => setActiveLayout(layout.id)} className={cn("group text-left rounded-2xl border p-6 transition-all", isActive
 ? darkMode
 ? "border-neon-cyan bg-neon-cyan/5 shadow-[0_0_30px_rgba(0,255,255,0.15)]"
 : "border-blue-500 bg-blue-50 shadow-lg"
 : darkMode
 ? "border-panel-border bg-void-100 hover:border-neon-cyan/50"
 : "border-gray-200 bg-white hover:border-blue-300")}>
 <div className="flex items-start justify-between mb-4">
 <div className={cn("flex items-center gap-3", isActive ? darkMode ? "text-neon-cyan" : "text-blue-600" : darkMode ? "text-ink" : "text-gray-900")}>
 <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", isActive
 ? darkMode ? "bg-neon-cyan/20" : "bg-blue-100"
 : darkMode ? "bg-void-200" : "bg-gray-100")}>
 <Icon className="h-6 w-6"/>
 </div>
 <div>
 <h3 className="text-lg font-bold">{layout.name}</h3>
 <p className={cn("text-sm", darkMode ? "text-ink-muted" : "text-gray-500")}>
 {layout.description}
 </p>
 </div>
 </div>
 <ChevronRight className={cn("h-5 w-5 transition-transform", isActive ? "rotate-90" : "group-hover:translate-x-1", isActive ? darkMode ? "text-neon-cyan" : "text-blue-600" : darkMode ? "text-ink-dim" : "text-gray-400")}/>
 </div>
 <div className="flex flex-wrap gap-2">
 {layout.features.map((feature) => (<span key={feature} className={cn("rounded-full px-3 py-1 text-xs font-medium", isActive
 ? darkMode
 ? "bg-neon-cyan/15 text-neon-cyan"
 : "bg-blue-100 text-blue-700"
 : darkMode
 ? "bg-void-200 text-ink-muted"
 : "bg-gray-100 text-gray-600")}>
 {feature}
 </span>))}
 </div>
 </button>);
 })}
 </div>

 <div className={cn("rounded-2xl border overflow-hidden", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center justify-between border-b px-6 py-4", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className="flex items-center gap-3">
 <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", darkMode ? "bg-neon-cyan/20" : "bg-blue-100")}>
 <Eye className={cn("h-4 w-4", darkMode ? "text-neon-cyan" : "text-blue-600")}/>
 </div>
 <span className={cn("font-semibold", darkMode ? "text-ink" : "text-gray-900")}>
 {layouts[activeLayout].name} - 布局预览
 </span>
 </div>
 <div className={cn("flex items-center gap-2 text-xs", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className={cn("flex h-2 w-2 rounded-full", darkMode ? "bg-neon-green animate-pulse" : "bg-green-500 animate-pulse")}/>
 实时预览模式
 </div>
 </div>

 <div className={cn("p-6", darkMode ? "bg-void" : "bg-gray-50")}>
 {activeLayout === 0 && <LayoutPreviewClassic darkMode={darkMode}/>}
 {activeLayout === 1 && <LayoutPreviewTopNav darkMode={darkMode}/>}
 {activeLayout === 2 && <LayoutPreviewImmersive darkMode={darkMode}/>}
 {activeLayout === 3 && <LayoutPreviewExchange darkMode={darkMode}/>}
 </div>
 </div>

 <div className="mt-8 flex justify-center gap-4">
 <button onClick={() => setActiveLayout((prev) => (prev - 1 + layouts.length) % layouts.length)} className={cn("flex items-center gap-2 rounded-lg border px-6 py-3 font-medium transition-colors", darkMode
 ? "border-panel-border bg-void-100 text-ink-muted hover:border-neon-cyan/50 hover:text-neon-cyan"
 : "border-gray-300 bg-white text-gray-600 hover:border-blue-500 hover:text-blue-600")}>
 <ChevronRight className="h-4 w-4 -scale-x-100"/>
 上一个
 </button>
 <button onClick={() => setActiveLayout((prev) => (prev + 1) % layouts.length)} className={cn("flex items-center gap-2 rounded-lg border px-6 py-3 font-medium transition-colors", darkMode
 ? "border-panel-border bg-void-100 text-ink-muted hover:border-neon-cyan/50 hover:text-neon-cyan"
 : "border-gray-300 bg-white text-gray-600 hover:border-blue-500 hover:text-blue-600")}>
 下一个
 <ChevronRight className="h-4 w-4"/>
 </button>
 </div>
 </div>
 </div>);
}
function LayoutPreviewClassic({ darkMode }: {
 darkMode: boolean;
}) {
 return (<div className="grid h-[500px] grid-cols-12 gap-3">
 <div className={cn("col-span-1 rounded-xl border flex flex-col items-center py-4", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <NavIcon icon={LayoutDashboard} active darkMode={darkMode}/>
 <NavIcon icon={TrendingUp} darkMode={darkMode}/>
 <NavIcon icon={Zap} darkMode={darkMode}/>
 <NavIcon icon={Settings} darkMode={darkMode}/>
 </div>

 <div className={cn("col-span-8 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center justify-between border-b px-4 py-2", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className={cn("font-mono text-sm font-bold", darkMode ? "text-ink" : "text-gray-900")}>BTC/USDT</div>
 <div className={cn("flex items-center gap-2", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">15m</span>
 <span className="text-xs">1h</span>
 <span className="text-xs">4h</span>
 </div>
 </div>
 <div className={cn("flex-1 flex items-center justify-center", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("text-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <TrendingUp className="mx-auto h-12 w-12 mb-2 opacity-50"/>
 <div className="font-mono text-sm">主K线图表区域</div>
 <div className="text-xs mt-1">占屏幕最大空间</div>
 </div>
 </div>
 <div className={cn("border-t h-24", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className={cn("flex items-center justify-between px-4 py-2", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">MACD</span>
 <span className="text-xs">RSI</span>
 <span className="text-xs">KDJ</span>
 <span className="text-xs">Positions</span>
 </div>
 <div className={cn("h-14 flex items-center justify-center", darkMode ? "bg-void" : "bg-gray-100")}>
 <span className={cn("text-xs", darkMode ? "text-ink-dim" : "text-gray-400")}>指标图表区域</span>
 </div>
 </div>
 </div>

 <div className={cn("col-span-3 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("border-b p-3", darkMode ? "border-panel-border bg-neon-purple/10" : "border-gray-200 bg-purple-50")}>
 <div className={cn("flex items-center gap-2 mb-1", darkMode ? "text-neon-purple" : "text-purple-600")}>
 <Sparkles className="h-4 w-4"/>
 <span className="text-xs font-bold">AI信号分析</span>
 </div>
 <div className={cn("flex items-center justify-between", darkMode ? "text-ink" : "text-gray-900")}>
 <span className={cn("font-bold", darkMode ? "text-neon-green" : "text-green-600")}>LONG</span>
 <span className="font-mono text-sm">85%</span>
 </div>
 </div>
 <div className={cn("flex-1 p-3 overflow-hidden", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("h-full flex flex-col justify-center text-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-50"/>
 <span className="text-xs">五档盘口</span>
 </div>
 </div>
 <div className={cn("border-t p-3", darkMode ? "border-panel-border" : "border-gray-200")}>
 <button className={cn("w-full rounded-lg py-2 font-medium text-sm", darkMode ? "bg-neon-cyan/20 text-neon-cyan" : "bg-blue-100 text-blue-600")}>
 买入 BTC
 </button>
 <button className={cn("w-full mt-2 rounded-lg py-2 font-medium text-sm", darkMode ? "bg-neon-red/20 text-neon-red" : "bg-red-100 text-red-600")}>
 卖出 BTC
 </button>
 </div>
 </div>
 </div>);
}
function LayoutPreviewTopNav({ darkMode }: {
 darkMode: boolean;
}) {
 return (<div className="flex flex-col h-[500px] gap-3">
 <div className={cn("rounded-xl border flex items-center justify-between px-4 py-3", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className="flex items-center gap-4">
 <div className={cn("font-mono text-sm font-bold", darkMode ? "text-ink" : "text-gray-900")}>BTC/USDT</div>
 <div className={cn("flex items-center gap-1", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">15m</span>
 <span className="text-xs">1h</span>
 <span className="text-xs">4h</span>
 <span className="text-xs">1d</span>
 </div>
 </div>
 <div className="flex items-center gap-4">
 <div className={cn("text-right", darkMode ? "text-ink" : "text-gray-900")}>
 <div className={cn("font-mono text-lg font-bold", darkMode ? "text-neon-green" : "text-green-600")}>$62,900</div>
 <div className={cn("text-xs", darkMode ? "text-neon-green" : "text-green-600")}>+2.35%</div>
 </div>
 <div className={cn("flex items-center gap-2", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">Binance</span>
 <span className="text-xs">OKX</span>
 </div>
 </div>
 </div>

 <div className={cn("flex-1 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex-1 flex items-center justify-center", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("text-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <TrendingUp className="mx-auto h-16 w-16 mb-3 opacity-50"/>
 <div className="font-mono text-lg">全屏主K线图表</div>
 <div className="text-sm mt-2">最大化图表展示空间</div>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-4 gap-3">
 <div className={cn("rounded-xl border p-3", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center gap-2 mb-2", darkMode ? "text-neon-purple" : "text-purple-600")}>
 <Sparkles className="h-4 w-4"/>
 <span className="text-xs font-bold">AI信号</span>
 </div>
 <div className={cn("font-bold", darkMode ? "text-neon-green" : "text-green-600")}>LONG 85%</div>
 </div>
 <div className={cn("rounded-xl border p-3", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center gap-2 mb-2", darkMode ? "text-neon-cyan" : "text-blue-600")}>
 <BarChart3 className="h-4 w-4"/>
 <span className="text-xs font-bold">订单簿</span>
 </div>
 <div className={cn("text-xs", darkMode ? "text-ink-muted" : "text-gray-500")}>买盘: $1.2M</div>
 <div className={cn("text-xs", darkMode ? "text-ink-muted" : "text-gray-500")}>卖盘: $1.8M</div>
 </div>
 <div className={cn("rounded-xl border p-3", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center gap-2 mb-2", darkMode ? "text-neon-amber" : "text-amber-600")}>
 <Zap className="h-4 w-4"/>
 <span className="text-xs font-bold">持仓</span>
 </div>
 <div className={cn("text-xs", darkMode ? "text-ink-muted" : "text-gray-500")}>BTC: 0.100</div>
 <div className={cn("text-xs", darkMode ? "text-neon-green" : "text-green-600")}>P&L: +$40.0</div>
 </div>
 <div className={cn("rounded-xl border p-3", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center gap-2 mb-2", darkMode ? "text-neon-green" : "text-green-600")}>
 <Shield className="h-4 w-4"/>
 <span className="text-xs font-bold">风险</span>
 </div>
 <div className={cn("text-xs", darkMode ? "text-ink-muted" : "text-gray-500")}>风险等级: 低</div>
 <div className={cn("text-xs", darkMode ? "text-ink-muted" : "text-gray-500")}>最大回撤: 2.3%</div>
 </div>
 </div>
 </div>);
}
function LayoutPreviewImmersive({ darkMode }: {
 darkMode: boolean;
}) {
 return (<div className="flex flex-col h-[500px] gap-3">
 <div className="flex gap-3">
 <div className={cn("flex-1 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center justify-between border-b px-4 py-2", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className={cn("font-mono text-sm font-bold", darkMode ? "text-ink" : "text-gray-900")}>BTC/USDT</div>
 <div className={cn("flex items-center gap-4", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">15m</span>
 <span className="text-xs">Binance</span>
 </div>
 </div>
 <div className={cn("flex-1 flex items-center justify-center", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("text-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <TrendingUp className="mx-auto h-20 w-20 mb-4 opacity-50"/>
 <div className="font-mono text-xl">沉浸式K线图表</div>
 <div className="text-sm mt-3">专注交易，最小干扰</div>
 </div>
 </div>
 </div>

 <div className={cn("w-64 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("border-b p-3", darkMode ? "border-panel-border bg-neon-purple/10" : "border-gray-200 bg-purple-50")}>
 <div className={cn("flex items-center gap-2", darkMode ? "text-neon-purple" : "text-purple-600")}>
 <Sparkles className="h-4 w-4"/>
 <span className="text-xs font-bold">AI综合信号</span>
 </div>
 </div>
 <div className={cn("flex-1 p-3 overflow-hidden", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("h-full flex flex-col justify-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <div className={cn("text-center", darkMode ? "text-ink" : "text-gray-900")}>
 <span className={cn("text-3xl font-bold", darkMode ? "text-neon-green" : "text-green-600")}>LONG</span>
 <div className={cn("text-lg mt-1", darkMode ? "text-ink" : "text-gray-900")}>85%</div>
 </div>
 <div className={cn("mt-4 text-xs text-center", darkMode ? "text-ink-muted" : "text-gray-500")}>
 12个智能体综合分析
 </div>
 </div>
 </div>
 </div>
 </div>

 <div className={cn("rounded-xl border", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center justify-between px-4 py-2", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <div className="flex items-center gap-4">
 <span className="text-xs">MACD</span>
 <span className="text-xs">RSI</span>
 <span className="text-xs">KDJ</span>
 <span className="text-xs">CVD</span>
 <span className="text-xs">持仓</span>
 <span className="text-xs">历史</span>
 </div>
 <div className={cn("flex items-center gap-2", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">← 折叠侧边面板</span>
 </div>
 </div>
 </div>
 </div>);
}
function LayoutPreviewExchange({ darkMode }: {
 darkMode: boolean;
}) {
 return (<div className="grid h-[500px] grid-cols-12 gap-3">
 <div className={cn("col-span-2 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("border-b px-3 py-2", darkMode ? "border-panel-border" : "border-gray-200")}>
 <span className={cn("text-xs font-bold", darkMode ? "text-ink" : "text-gray-900")}>市场</span>
 </div>
 <div className={cn("flex-1 overflow-hidden", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("h-full flex flex-col justify-center text-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <div className="space-y-2">
 <div className={cn("flex justify-between text-xs", darkMode ? "text-ink" : "text-gray-900")}>
 <span>BTC/USDT</span>
 <span className={darkMode ? "text-neon-green" : "text-green-600"}>+2.35%</span>
 </div>
 <div className={cn("flex justify-between text-xs", darkMode ? "text-ink" : "text-gray-900")}>
 <span>ETH/USDT</span>
 <span className={darkMode ? "text-neon-red" : "text-red-600"}>-1.20%</span>
 </div>
 <div className={cn("flex justify-between text-xs", darkMode ? "text-ink" : "text-gray-900")}>
 <span>SOL/USDT</span>
 <span className={darkMode ? "text-neon-green" : "text-green-600"}>+5.80%</span>
 </div>
 <div className={cn("flex justify-between text-xs", darkMode ? "text-ink" : "text-gray-900")}>
 <span>AVAX/USDT</span>
 <span className={darkMode ? "text-neon-green" : "text-green-600"}>+3.20%</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 <div className={cn("col-span-7 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("flex items-center justify-between border-b px-4 py-2", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className={cn("font-mono text-sm font-bold", darkMode ? "text-ink" : "text-gray-900")}>BTC/USDT Perpetual</div>
 <div className={cn("flex items-center gap-4", darkMode ? "text-ink-muted" : "text-gray-500")}>
 <span className="text-xs">15m</span>
 <span className="text-xs">1h</span>
 <span className="text-xs">4h</span>
 </div>
 </div>
 <div className={cn("flex-1 flex items-center justify-center", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("text-center", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <TrendingUp className="mx-auto h-14 w-14 mb-3 opacity-50"/>
 <div className={cn("font-mono text-lg mb-1", darkMode ? "text-ink" : "text-gray-900")}>$62,900.00</div>
 <div className={cn("text-sm", darkMode ? "text-neon-green" : "text-green-600")}>+2.35% (+$1,438.15)</div>
 </div>
 </div>
 </div>

 <div className={cn("col-span-3 rounded-xl border flex flex-col", darkMode ? "border-panel-border bg-void-100" : "border-gray-200 bg-white")}>
 <div className={cn("border-b p-3", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className={cn("flex items-center gap-2 mb-1", darkMode ? "text-neon-purple" : "text-purple-600")}>
 <Sparkles className="h-4 w-4"/>
 <span className="text-xs font-bold">AI信号</span>
 </div>
 <div className={cn("flex items-center justify-between", darkMode ? "text-ink" : "text-gray-900")}>
 <span className={cn("font-bold", darkMode ? "text-neon-green" : "text-green-600")}>LONG</span>
 <span className="font-mono text-sm">85%</span>
 </div>
 </div>
 <div className={cn("flex-1 overflow-hidden", darkMode ? "bg-void" : "bg-gray-100")}>
 <div className={cn("h-full p-3", darkMode ? "text-ink-dim" : "text-gray-400")}>
 <div className={cn("flex justify-between text-xs mb-1", darkMode ? "text-neon-green" : "text-green-600")}>
 <span>买盘</span>
 <span>$1.2M</span>
 </div>
 <div className="w-full h-8 bg-gray-700 rounded overflow-hidden">
 <div className={cn("h-full", darkMode ? "bg-neon-green" : "bg-green-500")} style={{ width: "40%" }}/>
 </div>
 <div className={cn("flex justify-between text-xs mt-1", darkMode ? "text-neon-red" : "text-red-600")}>
 <span>卖盘</span>
 <span>$1.8M</span>
 </div>
 <div className="w-full h-8 bg-gray-700 rounded overflow-hidden">
 <div className={cn("h-full", darkMode ? "bg-neon-red" : "bg-red-500")} style={{ width: "60%" }}/>
 </div>
 </div>
 </div>
 <div className={cn("border-t p-3", darkMode ? "border-panel-border" : "border-gray-200")}>
 <div className={cn("flex items-center gap-2 mb-2", darkMode ? "text-neon-cyan" : "text-blue-600")}>
 <Zap className="h-4 w-4"/>
 <span className="text-xs font-bold">快捷交易</span>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <button className={cn("rounded-lg py-2 text-xs font-medium", darkMode ? "bg-neon-green/20 text-neon-green" : "bg-green-100 text-green-600")}>
 买入
 </button>
 <button className={cn("rounded-lg py-2 text-xs font-medium", darkMode ? "bg-neon-red/20 text-neon-red" : "bg-red-100 text-red-600")}>
 卖出
 </button>
 </div>
 </div>
 </div>
 </div>);
}
function NavIcon({ icon: Icon, active, darkMode }: {
 icon: React.ComponentType<{
 className?: string;
 }>;
 active?: boolean;
 darkMode: boolean;
}) {
 return (<div className={cn("flex h-10 w-10 items-center justify-center rounded-lg transition-colors mb-2", active
 ? darkMode
 ? "bg-neon-cyan/20 text-neon-cyan"
 : "bg-blue-100 text-blue-600"
 : darkMode
 ? "text-ink-muted hover:text-ink"
 : "text-gray-400 hover:text-gray-600")}>
 <Icon className="h-5 w-5"/>
 </div>);
}
