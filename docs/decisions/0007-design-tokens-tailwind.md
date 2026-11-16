# Decision 0007: Tailwind CSS Preset with Brand Theme and Low Stock Alerts

## Status

Accepted

## Context

Both frontend applications (`admin` and `pos`) share common visual branding: a dark green theme (`#0F2F24`), emerald action buttons (`#15803D`), and warm tags for low stock indicators.

## Decision

We centralized the theme in `@gunita/config/tailwind` and built reusable components in `@gunita/ui`.

## Rationale

- Ensures consistent brand styling across Admin and POS terminals.
- Encapsulates low-stock visual alert conventions (`bg-amber-100 text-amber-900 border-amber-300`) inside `StatusBadge`.
- Zero duplication of Tailwind color configuration.
