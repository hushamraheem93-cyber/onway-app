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
        // OnWay brand
        brand: {
          50: "#FFF3EC",
          100: "#FFE3D2",
          200: "#FFC3A1",
          300: "#FF9E6B",
          400: "#FF7A3D",
          500: "#F4600A", // primary orange
          600: "#D94E00",
          700: "#AE3E00",
          800: "#7F2E00",
          900: "#5A2100",
        },
        ink: {
          DEFAULT: "#141419",
          soft: "#2A2A32",
          muted: "#6B6B76",
        },
        cream: "#FFF7F2",
      },
      fontFamily: {
        sans: ["var(--font-body)", "var(--font-arabic)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-arabic)", "system-ui", "sans-serif"],
        arabic: ["var(--font-arabic)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,20,25,0.04), 0 8px 24px rgba(20,20,25,0.06)",
        "card-hover": "0 2px 4px rgba(20,20,25,0.06), 0 18px 40px rgba(244,96,10,0.14)",
        glow: "0 20px 60px -12px rgba(244,96,10,0.45)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "dash-move": {
          to: { strokeDashoffset: "-1000" },
        },
        "pin-drop": {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "60%": { transform: "translateY(2px)", opacity: "1" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.9s ease both",
        float: "float 5s ease-in-out infinite",
        "dash-move": "dash-move 22s linear infinite",
        "pin-drop": "pin-drop 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-ring": "pulse-ring 2.2s ease-out infinite",
        marquee: "marquee 32s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
