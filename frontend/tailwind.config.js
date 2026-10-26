/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#06130e", 900: "#0a1d16", 800: "#10291f", 700: "#17382b", 600: "#1f4a38" },
        line: "#1d3b2e",
        mint: { DEFAULT: "#6ee7b7", dim: "#34b88a" },
        coral: { DEFAULT: "#ff6b57", dim: "#c24a3a" },
        muted: "#8fa89c",
        amber: { warn: "#f2b84b" },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
