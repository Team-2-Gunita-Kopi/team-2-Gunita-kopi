# Decision 0002: Dexie for Client-Side IndexedDB Storage

## Status

Accepted

## Context

The POS application must store sales transactions, product menus, and ingredient levels on device before syncing with the backend API. Native IndexedDB has a cumbersome low-level callback API that is prone to errors.

## Decision

We chose **Dexie** (`dexie` v4) as the client-side IndexedDB wrapper.

## Rationale

- Officially specified in the Phase 3 Technology Stack.
- Typesafe TypeScript schema definitions (`EntityTable`).
- Zero external dependencies and minimal bundle impact.
- Robust support for compound querying and transactions needed for outbox management.
