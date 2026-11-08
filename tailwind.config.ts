import type { Config } from "tailwindcss";

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
        },
        foreground: {
          DEFAULT: "#F3F3F0",
          muted: "#A1A1A1",
        },
        border: "#333333",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

