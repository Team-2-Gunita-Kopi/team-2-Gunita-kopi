# @gunita/contracts

Shared Zod validation schemas and TypeScript types for all request and response payloads across Gunita Kopi POS:

- Roles (`owner_admin`, `barista`)
- Order statuses (`pending`, `preparing`, `completed`, `cancelled`)
- Order types (`dine-in`, `take-out`, `online`, `pre-order`)
- Outbox statuses (`pending`, `syncing`, `synced`, `failed`)
- Offline sync payload with unique transaction IDs (`clientTxId`)
- Standard API response contract (`ApiResponse<T>`)
- Domain schemas: products, ingredients, stock transactions, suppliers, users, reports, dashboard, receipts, and audit logs.
