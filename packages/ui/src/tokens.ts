export const DESIGN_TOKENS = {
  colors: {
    // Gunita dark green theme
    forestDark: "#091A14",
    forest: "#0F2F24",
    forestLight: "#1C4B3B",
    // Main action button green
    accent: "#15803D",
    accentHover: "#166534",
    accentLight: "#DCFCE7",
    accentFocus: "rgba(21, 128, 61, 0.25)",
    // Warm colored tags for low stock
    warmStock: {
      bg: "#FEF3C7",
      text: "#92400E",
      border: "#FDE68A",
      solid: "#D97706",
    },
    // Neutrals
    background: "#F9FAFB",
    surface: "#FFFFFF",
    border: "#E5E7EB",
    textMain: "#111827",
    textMuted: "#6B7280",
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  fonts: {
    body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    heading:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
} as const;
