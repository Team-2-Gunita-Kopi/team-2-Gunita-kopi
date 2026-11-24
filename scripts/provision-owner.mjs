#!/usr/bin/env node
// One-time Owner account provisioning, run by the developer (never from a browser).
//
//   OWNER_SETUP_TOKEN=<value from the API environment> API_URL=https://<api host> \
//     node scripts/provision-owner.mjs
//
// Calls POST /api/setup/owner on apps/api, which creates the Supabase Auth user and the single
// owner_admin profile. The API refuses a second Owner (also enforced by the database). The password
// is typed at a hidden prompt, so it never lands in shell history or environment variables.
// Afterwards remove OWNER_SETUP_TOKEN from the API environment.
import { createInterface } from "node:readline";

const apiUrl = (process.env.API_URL ?? "http://localhost:3002").replace(/\/$/, "");
const token = process.env.OWNER_SETUP_TOKEN ?? "";
if (token.length < 32) {
  console.error("Set OWNER_SETUP_TOKEN (the same 32+ character value as in the API environment).");
  process.exit(1);
}
if (!/^https:\/\//.test(apiUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(apiUrl)) {
  console.error("API_URL must use https (http only for localhost).");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let hidden = false;
rl._writeToOutput = (s) => {
  if (!hidden || s.includes("\n")) rl.output.write(hidden ? "\n" : s);
};
const ask = (q, hide = false) =>
  new Promise((resolve) => {
    hidden = false;
    rl.question(q, (a) => {
      hidden = false;
      resolve(a);
    });
    hidden = hide;
  });

const fullName = (await ask("Full name: ")).trim();
const username = (await ask("Username: ")).trim();
const email = (await ask("Owner email (receives sign-in codes): ")).trim();
const password = await ask("Password (min 8 characters): ", true);
const confirmPassword = await ask("Confirm password: ", true);
rl.close();

if (password !== confirmPassword) {
  console.error("Passwords do not match.");
  process.exit(1);
}

const res = await fetch(`${apiUrl}/api/setup/owner`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-setup-token": token },
  body: JSON.stringify({ fullName, username, email, password, confirmPassword }),
}).catch((err) => {
  console.error(`API unreachable at ${apiUrl}: ${err.message}`);
  process.exit(1);
});
const body = await res.json().catch(() => null);
if (!res.ok || !body?.success) {
  console.error(`Owner setup failed (${res.status}): ${body?.error?.message ?? "no details"}`);
  process.exit(1);
}
console.log(`Owner created: ${body.data.username} <${body.data.email}>.`);
console.log("Remove OWNER_SETUP_TOKEN from the API environment now.");
