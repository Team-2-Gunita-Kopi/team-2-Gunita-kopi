# Decision 0007: Tailwind CSS Preset with Brand Theme and Low Stock Alerts

## Status

Accepted. Amended 2026-11-16: the light green theme was replaced by the dark "nature" theme.

## Context

Both frontend applications (`admin` and `pos`) share common visual branding. The original light theme (`#0F2F24` forest, `#15803D` emerald) was replaced by the dark nature theme ported from the prototype: near-black green background (`#0F1410`), cream foreground (`#EDE6D6`), moss/leaf greens and coffee accents.

## Decision

- The canonical styles live in `@gunita/ui/styles.css` (CSS custom properties on `:root`), imported by both root layouts before `globals.css`.
- `@gunita/config/tailwind` and `DESIGN_TOKENS` mirror the same token values under `gunita.*`; font families `head`, `body`, `num`, `baybayin` resolve to CSS variables.
- Fonts (Lora, Raleway, Fira Code, Noto Sans Tagalog) are loaded with `next/font/google` and exposed as `--font-lora`, `--font-raleway`, `--font-fira`, `--font-tagalog`, which `styles.css` maps onto `--font-head/body/num/baybayin`.
- The admin app renders `<body class="owner-mode">` for the owner's denser type scale.
- Tailwind `preflight` is disabled in both apps so its reset does not override `styles.css`.

## Rationale

- Ensures consistent brand styling across Admin and POS terminals.
- Single source of truth for tokens; Tailwind utilities and plain CSS stay in sync.
- Low-stock and status conventions are encapsulated in `StatusBadge` using the `warn` and `danger` tokens.
