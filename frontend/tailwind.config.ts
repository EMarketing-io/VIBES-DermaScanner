import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { inter: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        brand: {
          blue:   "#0ea5e9",
          purple: "#8b5cf6",
          pink:   "#ec4899",
        },
      },
    },
  },
  plugins: [],
};

export default config;
