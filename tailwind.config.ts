import type { Config } from "tailwindcss";

/**
 * BENIT design tokens.
 * Palette is fixed by brand (dark base + single orange accent + cream).
 * Everything else (type scale, radius, depth, motion) lives here so every
 * surface — landing, auth, dashboard, public menu — speaks the same language.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#101010",
        surface: {
          DEFAULT: "#1C1C1C",
          card: "#242424",
          elevated: "#2C2C2C",
        },
        brand: {
          DEFAULT: "#FF6A00",
          hover: "#FF7D1F",
          muted: "rgba(255, 106, 0, 0.14)",
          ink: "#C24F00", // accessible orange on cream
        },
        foreground: {
          DEFAULT: "#F3F3F0",
          muted: "#A1A1A1",
          subtle: "#6E6E6E",
        },
        cream: {
          DEFAULT: "#F3F3F0",
          deep: "#E8E7E1",
          line: "#D6D5CE",
          ink: "#101010",
          muted: "#5A5A55",
        },
        border: {
          DEFAULT: "#333333",
          strong: "#474747",
        },
        success: "#3DD68C",
        warning: "#F5B841",
        danger: "#FF5D5D",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Fluid display scale (clamp: mobile → desktop)
        "display-2xl": ["clamp(3.25rem, 9vw, 9.5rem)", { lineHeight: "0.9", letterSpacing: "-0.035em" }],
        "display-xl": ["clamp(2.75rem, 6.5vw, 6.5rem)", { lineHeight: "0.94", letterSpacing: "-0.028em" }],
        "display-lg": ["clamp(2.25rem, 4.6vw, 4.5rem)", { lineHeight: "0.98", letterSpacing: "-0.035em" }],
        "display-md": ["clamp(1.75rem, 3vw, 2.75rem)", { lineHeight: "1.04", letterSpacing: "-0.03em" }],
        "display-sm": ["clamp(1.375rem, 2vw, 1.75rem)", { lineHeight: "1.12", letterSpacing: "-0.02em" }],
        eyebrow: ["0.75rem", { lineHeight: "1", letterSpacing: "0.14em" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "22px",
        "3xl": "32px",
      },
      boxShadow: {
        hairline: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        raised: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 24px -12px rgba(0,0,0,0.7)",
        float: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -20px rgba(0,0,0,0.85)",
        glow: "0 0 0 1px rgba(255,106,0,0.45), 0 12px 40px -8px rgba(255,106,0,0.45)",
        cream: "0 1px 0 rgba(16,16,16,0.04), 0 20px 50px -24px rgba(16,16,16,0.35)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
        "in-out-quart": "cubic-bezier(0.76, 0, 0.24, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        fast: "140ms",
        base: "220ms",
        slow: "420ms",
        slower: "700ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.85)" },
        },
        ring: {
          "0%": { transform: "scale(0.6)", opacity: "0.9" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
        "order-arrive": {
          "0%": { opacity: "0", transform: "translateY(-12px) scale(0.98)", boxShadow: "0 0 0 0 rgba(255,106,0,0.6)" },
          "60%": { opacity: "1", transform: "translateY(0) scale(1)", boxShadow: "0 0 0 6px rgba(255,106,0,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,106,0,0)" },
        },
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "bag-bump": {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.06)" },
          "70%": { transform: "scale(0.98)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 420ms cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-right": "slide-in-right 420ms cubic-bezier(0.16,1,0.3,1)",
        "slide-in-left": "slide-in-left 420ms cubic-bezier(0.16,1,0.3,1)",
        "slide-in-bottom": "slide-in-bottom 420ms cubic-bezier(0.16,1,0.3,1)",
        "overlay-in": "overlay-in 220ms ease-out",
        "scale-in": "scale-in 220ms cubic-bezier(0.16,1,0.3,1)",
        "pulse-dot": "pulse 1.8s ease-in-out infinite",
        ring: "ring 1.8s cubic-bezier(0.16,1,0.3,1) infinite",
        "order-arrive": "order-arrive 900ms cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s linear infinite",
        "accordion-down": "accordion-down 420ms cubic-bezier(0.16,1,0.3,1)",
        "accordion-up": "accordion-up 300ms cubic-bezier(0.76,0,0.24,1)",
        breathe: "breathe 6s ease-in-out infinite",
        "bag-bump": "bag-bump 520ms cubic-bezier(0.34,1.56,0.64,1)",
      },
    },
  },
  plugins: [],
};

export default config;
