import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // SyncMeCal design tokens (from design-guidelines.pdf)
        primary: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          light: "#DBEAFE",
        },
        cta: {
          DEFAULT: "#22C55E",
          hover: "#16A34A",
          light: "#DCFCE7",
        },
        ink: {
          DEFAULT: "#111827",
          secondary: "#6B7280",
          disabled: "#9CA3AF",
        },
        surface: "#FFFFFF",
        bg: "#F5F7FA",
        border: "#E5E7EB",
        warning: "#F59E0B",
        danger: "#EF4444",
        sun: "#FCD34D",
        sky: "#BAE6FD",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(17,24,39,.06)",
        lift: "0 6px 18px rgba(17,24,39,.08)",
      },
      keyframes: {
        sink: {
          "0%":   { transform: "translateY(-20px) rotate(0deg)" },
          "25%":  { transform: "translateY(0) rotate(-8deg)" },
          "55%":  { transform: "translateY(40px) rotate(-22deg)", opacity: "0.95" },
          "100%": { transform: "translateY(130px) rotate(-34deg)", opacity: "0.25" },
        },
        bob: {
          "0%,100%": { transform: "translateY(0) rotate(-1deg)" },
          "50%":     { transform: "translateY(-6px) rotate(1.5deg)" },
        },
      },
      animation: {
        sink: "sink 2.4s cubic-bezier(.5,.05,.9,.6) 0.2s forwards",
        bob: "bob 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
