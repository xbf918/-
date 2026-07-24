/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 基底色板 - 深邃黑底
        void: {
          DEFAULT: "#0a0e1a",
          50: "#1a2030",
          100: "#131826",
          200: "#0f1422",
          300: "#0a0e1a",
          400: "#070a14",
          500: "#04060d",
        },
        panel: {
          DEFAULT: "#131826",
          light: "#1a2030",
          border: "#1f2940",
        },
        // 强调色 - 霓虹系
        neon: {
          green: "#00ff88",
          red: "#ff3366",
          cyan: "#00d4ff",
          amber: "#ffaa00",
          purple: "#a855f7",
        },
        // 文本色阶
        ink: {
          DEFAULT: "#e8eaf0",
          muted: "#6b7390",
          dim: "#4a526b",
        },
      },
      fontFamily: {
        display: ['"Unbounded"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
        sans: ['"Manrope"', "sans-serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "flicker": "flicker 3s linear infinite",
        "scan": "scan 4s linear infinite",
        "shimmer": "shimmer 2.5s linear infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1", filter: "drop-shadow(0 0 4px currentColor)" },
          "50%": { opacity: "0.6", filter: "drop-shadow(0 0 12px currentColor)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "flicker": {
          "0%, 100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.4" },
          "94%": { opacity: "1" },
          "96%": { opacity: "0.7" },
          "97%": { opacity: "1" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "grid-glow": "linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px)",
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
      boxShadow: {
        "glow-green": "0 0 20px rgba(0, 255, 136, 0.35)",
        "glow-red": "0 0 20px rgba(255, 51, 102, 0.35)",
        "glow-cyan": "0 0 20px rgba(0, 212, 255, 0.35)",
        "glow-amber": "0 0 20px rgba(255, 170, 0, 0.35)",
        "inset-line": "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      },
      gridTemplateColumns: {
        "14": "repeat(14, minmax(0, 1fr))",
      },
    },
  },
  plugins: [],
};
