# @gunita/auth

Authentication and authorization helpers for Gunita Kopi POS:

- Role definitions: `owner_admin` and `barista`
- Role type guards: `isOwnerAdmin`, `isBarista`, `hasRole`
- Client & edge token extraction helpers (`decodeJwtPayload`, `extractRoleFromToken`, `extractUserIdFromToken`)
- Guaranteed zero secrets: strictly contains no service role keys or private secrets.
