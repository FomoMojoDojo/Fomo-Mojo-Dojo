import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fm: {
          bg0: "#070a11",
          bg1: "#0a1221",
          bg2: "#121d31",
          line: "#1f2f45",
          text: "#f5f7ff",
          muted: "#9ca8ba",
          teal: "#24dbc1",
          green: "#74fda2",
        },
      },
      boxShadow: {
        glow: "0 0 80px rgba(36, 219, 193, 0.24)",
        card: "0 20px 60px rgba(2, 6, 23, 0.45)",
      },
      maxWidth: {
        narrative: "74rem",
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      animation: {
        "soft-float": "soft-float 8s ease-in-out infinite",
        "pulse-slow": "pulse-slow 6s ease-in-out infinite",
        reveal: "reveal 720ms cubic-bezier(.16,.84,.44,1) both",
      },
      keyframes: {
        "soft-float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
