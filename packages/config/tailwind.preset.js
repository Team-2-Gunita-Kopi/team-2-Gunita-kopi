/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        gunita: {
          bg: "#F9FAFB",
          surface: "#FFFFFF",
          forest: "#0F2F24",
          forestDark: "#091A14",
          forestLight: "#1C4B3B",
          accent: "#15803D",
          accentHover: "#166534",
          accentLight: "#DCFCE7",
          warm: {
            bg: "#FEF3C7",
            text: "#92400E",
            border: "#FDE68A",
            solid: "#D97706",
          },
          border: "#E5E7EB",
          muted: "#6B7280",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
