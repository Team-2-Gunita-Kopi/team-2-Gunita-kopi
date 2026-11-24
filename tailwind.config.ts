import type { Config } from "tailwindcss";
import sharedPreset from "./tailwind.preset.cjs";

const config: Config = {
  presets: [sharedPreset],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};

export default config;
