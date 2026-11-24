// One-time Owner provisioning (scripts/provision-owner.mjs). Needs the setup token and refuses a
// second Owner. Every other backend route is private (src/server/dispatch.ts).
export { POST } from "@/server/routes/setup/owner/route";
