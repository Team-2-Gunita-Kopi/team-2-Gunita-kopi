/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        gunita: {
          bg: "#0F1410",
          surface: "#151D16",
          card: "#1B251C",
          card2: "#212C22",
          muted: "#2A362B",
          border: "#34433A",
          fg: "#EDE6D6",
          fgMuted: "#A9B3A3",
          moss: "#7FAE68",
          mossStrong: "#5C8A48",
          leaf: "#A7C98B",
          coffee: "#C08A4E",
          coffeeDeep: "#5A3B24",
          bark: "#3B2A1E",
          warn: "#D9A441",
          danger: "#E0715A",
        },
      },
      fontFamily: {
        head: ["var(--font-head)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        num: ["var(--font-num)", "monospace"],
        baybayin: ["var(--font-baybayin)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
