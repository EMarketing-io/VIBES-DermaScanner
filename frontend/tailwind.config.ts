import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
      },
      colors: {
        brand: {
          rust: "#b5541c",
          ink: "#1a1a1a",
          paper: "#f9f7f4",
        },
      },
    },
  },
  plugins: [],
};

export default config;
