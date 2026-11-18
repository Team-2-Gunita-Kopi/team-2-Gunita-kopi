import type { Config } from "tailwindcss";
import sharedPreset from "@gunita/config/tailwind";

const config: Config = {
  presets: [sharedPreset],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  corePlugins: { preflight: false },
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
