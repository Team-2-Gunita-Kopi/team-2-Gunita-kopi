# Decision 0005: Turborepo and pnpm Workspaces for Monorepo Tooling

## Status

Accepted

## Context

The monorepo contains three Next.js applications and five shared packages. We need fast builds, reproducible dependencies, and task orchestration that rebuilds only changed applications.

## Decision

We chose **pnpm workspaces** combined with **Turborepo** (`turbo` v2).

## Rationale

- Fast, space-efficient package manager with strict dependency isolation.
- Turborepo task pipeline graphs dependencies between packages and apps (`dependsOn: ["^build"]`).
- Local and remote caching ensures unchanged apps and packages are never rebuilt on CI or Vercel.
