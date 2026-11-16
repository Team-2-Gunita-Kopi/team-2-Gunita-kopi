# Decision 0004: Vitest for Unit and Integration Testing

## Status

Accepted

## Context

We need a fast, modern test runner for TypeScript contracts, server authorization guards, idempotency checks, and route handlers.

## Decision

We chose **Vitest** (`vitest` v3).

## Rationale

- Officially specified in the Phase 3 Technology Stack.
- Native ESM and TypeScript support without complex Babel or Jest transformation setups.
- Instant execution speed and seamless integration with Turborepo task pipeline.
