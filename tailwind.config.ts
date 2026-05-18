import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#f6f7f9",
          muted: "#eef0f4",
          border: "#e2e5ec",
        },
        ink: {
          DEFAULT: "#0f172a",
          muted: "#475569",
          faint: "#94a3b8",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5",
        },
      },
      boxShadow: {
        panel:
          "0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
