export const DESIGN_TOKENS = {
  colors: {
    // Gunita dark "nature" theme (mirrors css/styles.css :root)
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
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  fonts: {
    head: "var(--font-head)",
    body: "var(--font-body)",
    num: "var(--font-num)",
    baybayin: "var(--font-baybayin)",
  },
} as const;
