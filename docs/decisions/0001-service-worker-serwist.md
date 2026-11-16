# Decision 0001: Serwist for Service Worker Management

## Status

Accepted

## Context

Gunita Kopi POS is an offline-first progressive web application. We need a modern, actively maintained service worker tool compatible with Next.js App Router and TypeScript to manage precaching, static assets, and background sync events. Legacy tools like `next-pwa` are unmaintained and incompatible with newer Next.js versions.

## Decision

We chose **Serwist** (`@serwist/next` and `serwist`).

## Rationale

- Actively maintained fork and modern successor to workbox/next-pwa specifically targeted for modern Next.js and TypeScript.
- First-class support for Next.js App Router and webpack compilation.
- Provides standard precaching, runtime caching strategies (`defaultCache`), and seamless worker lifecycle hooks (`sync`, `install`, `activate`).
- Keeps service worker code type-safe in `apps/pos/src/sw.ts`.
