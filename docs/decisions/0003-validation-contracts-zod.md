# Decision 0003: Zod for Request/Response Schemas and Types

## Status

Accepted

## Context

All three applications (`admin`, `pos`, `api`) share data contracts. We need a single source of truth for runtime validation and static TypeScript type inference for requests, responses, and offline sync payloads.

## Decision

We chose **Zod** (`zod` v3) packaged in `@gunita/contracts`.

## Rationale

- High performance runtime schema validation with automatic TypeScript type inference (`z.infer<T>`).
- Seamless integration with Next.js Route Handlers.
- Standardizes API contracts across frontend fetch clients and backend endpoints.
