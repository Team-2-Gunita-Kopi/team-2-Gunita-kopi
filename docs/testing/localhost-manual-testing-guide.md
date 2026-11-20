# Localhost Manual Testing Guide (synthetic data)

Status on 2026-11-19, second pass: **the seed is ready and has been validated on PGlite, but it has not
been loaded into a persistent database.** Docker Desktop is still not installed, and installing it needs
administrator approval (see "Installing Docker Desktop" below). Without it the local Supabase stack
(Postgres, Auth, PostgREST and Storage) cannot run, and the apps need all four. Nothing on this page has
been run end to end yet. The `testowner` and `testbarista` accounts do not exist yet.

Every record created here is **synthetic test data**. Names end in "(synthetic)", and the quantities,
costs, stock levels, recipes, add-on mappings and orders are invented. They are not Gunita Kopi business
information. Never load them into the live project.

## 0. Quick start for a fresh clone (groupmate)

**Use the local Supabase stack only.** Do not put the team's live Supabase URL, keys or database
password in any file on your machine, and do not run `supabase link`, `db push` or `migration repair`.
The seed script refuses any target that is not `127.0.0.1` or `localhost`.

```bash
# 1. Clone the testing branch (replace <testing-branch> with the name you were given)
git clone --branch <testing-branch> https://github.com/Team-2-Sweet-Creatures/team-2-Gunita-kopi.git
cd team-2-Gunita-kopi

# 2. Node 22 (see .nvmrc) and the pinned pnpm
node -v                                  # must print v22.x
npx -y pnpm@12.21.0 install --frozen-lockfile

# 3. Start Docker Desktop and wait for "Engine running", then:
docker ps

# 4. Local Supabase: applies every migration in supabase/migrations, in order
cp -n supabase/.env.example supabase/.env      # email settings for the local stack (codes go to http://127.0.0.1:54326)
npx -y supabase@2.122.1 start

# 5. Synthetic data, test accounts and local env files (Git Bash)
bash supabase/seed/seed-localhost.sh

# 6. Apps: api http://localhost:3002, admin http://localhost:3000, pos http://localhost:3001
npx -y pnpm@12.21.0 dev
```

7. Passwords are in `supabase/.env.seed-accounts.local` (gitignored). Sign in as `testowner` at
   http://localhost:3000, then enter the 6-digit code from the local mail viewer (Inbucket,
   http://localhost:54326). Sign in as `testbarista` at
   http://localhost:3001.

The seed script writes `apps/{api,admin,pos}/.env.development.local`. These hold the local Supabase URL
and keys, plus one generated `INTERNAL_PROXY_SECRET` shared by the three apps; without it every sign-in
answers 503. A fresh clone needs no `.env.local` at all. If you already have `.env.local` files, the
`.env.development.local` values take precedence in `pnpm dev`. Every variable the apps need is listed,
without values, in `apps/*/.env.example`.

## 1. Requirements

| Need | Why | How |
|---|---|---|
| Docker Desktop (WSL 2 backend) | `npx supabase@2.122.1 start` runs the local stack in containers | install it, start it, check with `docker ps` |
| Node 22 and pnpm 12.21.0 | project tooling | `.nvmrc`, `npx -y pnpm@12.21.0` |
| Git Bash | the seed script is bash | already used in this repo |
| The local mail viewer (Inbucket, http://localhost:54326) | the Owner's second sign-in step is a 6-digit code emailed on every sign-in (`MFA_REQUIRED` without it) | started by `supabase start` |

The alternative is a separate free Supabase project used as staging. It needs explicit approval and its
own credentials. The seed script refuses non-local targets as written, so staging would need a reviewed
change to the script.

## 2. Start the local database

```bash
cd C:/Users/Meynard/team-2-Gunita-kopi
cp -n supabase/.env.example supabase/.env      # email settings for the local stack (codes go to http://127.0.0.1:54326)
npx -y supabase@2.122.1 start      # first run downloads images and applies every file in supabase/migrations
npx -y supabase@2.122.1 status     # API URL must be http://127.0.0.1:54321
```

The local stack applies **all** migrations, including `20261120000000` (Owner MFA, strict stock roles)
and `20261120000100` (`product-images` bucket). Live does not have those two yet. Local behaviour is
therefore slightly stricter than live: at the database level the Owner can no longer record stock-out,
and Owner data needs a session approved after the emailed code (`20261120001100`).

It also applies `20261120000500` (cash-only payments), which is not on live either.

`supabase/config.toml` sets the Owner sign-in code for the local stack: `[auth.email]` OTP length 6,
expiry 300 seconds, 60 seconds between emails, and the Magic Link template
`supabase/templates/owner-sign-in-code.html` (shows `{{ .Token }}`). TOTP is off. That file only configures
the local stack; nothing is pushed to live. Not yet exercised, because no local stack has run.

### Installing Docker Desktop (needs you, as administrator)

1. Run this in a terminal and accept the Windows administrator (UAC) prompt:
   `winget install -e --id Docker.DockerDesktop`. Alternatively, download the installer from
   docs.docker.com/desktop/setup/install/windows-install/.
2. Keep "Use WSL 2 instead of Hyper-V" checked. Sign out and back in, or restart, if the installer asks.
3. Start Docker Desktop once and accept its terms. Wait until it reports "Engine running".
4. Check with `docker ps` in Git Bash, which should print an empty table. Then continue with the
   commands above.

## 3. Seed the synthetic dataset (once)

```bash
bash supabase/seed/seed-localhost.sh
```

What it does:

1. Reads the target from `supabase status`, and refuses anything that is not `127.0.0.1` or `localhost`.
   No production URL or key is read.
2. Writes `apps/{api,admin,pos}/.env.development.local` for the local stack, all three together and
   only if none of them exists. They are gitignored and share one generated `INTERNAL_PROXY_SECRET`.
   `next dev` reads them before `.env.local`, so the live `.env.local` files are not changed. Mock mode
   is set to false (`NEXT_PUBLIC_USE_MOCKS=false`, `MOCK_MODE=false`).
3. Creates two Auth users through the local Auth admin API, with random passwords stored only in
   `supabase/.env.seed-accounts.local` (gitignored, never committed).
4. Loads `supabase/seed/synthetic_localhost_seed.sql` with `psql` inside the local database container.

It refuses to run a second time and never deletes anything.

## 4. Start the apps (real API, no mocks)

```bash
npx -y pnpm@12.21.0 dev      # api :3002, admin :3000, pos :3001
```

Use `dev`. `next start` does not read `.env.development.local` and would use the live settings in
`.env.local`. Before signing in, check that `apps/api/.env.development.local` exists and has the local
`NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321`).

## 5. Test accounts

| Username | Role | Site | Password |
|---|---|---|---|
| `testowner` | owner_admin (email `test-owner@example.com`, a placeholder) | http://localhost:3000 | in `supabase/.env.seed-accounts.local` |
| `testbarista` | barista | http://localhost:3001 | in `supabase/.env.seed-accounts.local` |

After the password, the Owner enters the code emailed to `test-owner@example.com` (shown in Inbucket).

## 6. What is seeded

| Data | Contents |
|---|---|
| Products | the 76 catalog products from the migrations, unchanged |
| Suppliers | 4 synthetic suppliers (A to C active, D inactive) |
| Ingredients | 20 synthetic ingredients. 11 are add-ons named after the official add-ons (Biscoff (Spread/Biscuits), Caramel, Chocolate, Espresso Extra Shots, Gunita, Jam, Matcha, Milk, Oreo Biscuits, Sauce, Syrup), each at ₱25.00 with a synthetic quantity per selection. |
| Stock states | Jam out-of-stock (no opening stock). Oreo Biscuits and Pita Bread low-stock. The rest available. |
| Stock history | opening stock-in by the Owner for 19 ingredients, the stock-outs from checkout, one Barista spoilage stock-out (Milk, 500 ml) |
| Recipes and costing | a recipe for all 76 products, by category. Packaging ₱6.00 for drinks and ₱4.00 for food. Ingredient cost is computed by the database. |
| Orders | 10 orders placed through `process_checkout_transaction` as the Barista, cash only, with add-on rows. Orders 1–6 completed, 7 preparing, 8 cancelled, 9–10 pending. Three completed orders are back-dated 1, 2 and 35 days, so the daily and monthly reports have several rows. |

How to recognise the synthetic records: supplier and ingredient names end in "(synthetic)", user names
start with "test", order `client_tx_id` values start with `5e000000-`, and remarks say "(synthetic)".

## 7. Restarting without losing data

```bash
npx -y supabase@2.122.1 stop       # keeps the database volume
cp -n supabase/.env.example supabase/.env      # email settings for the local stack (codes go to http://127.0.0.1:54326)
npx -y supabase@2.122.1 start
npx -y pnpm@12.21.0 dev
```

Do **not** run `supabase db reset`, `supabase stop --no-backup`, `TRUNCATE` or any delete on this database.
Each of these destroys the dataset, and the team will authorize cleanup separately.

## 8. Known limitations

- The seed SQL was validated on PGlite on both migration chains: counts, stock equal to stock-in minus
  stock-out for every ingredient, change amounts, costing totals, report rows, and refusal on a second
  run. The shell script was only syntax-checked, because no local stack exists here.
- If the script stops after creating the Auth users but before the SQL finishes, the second run is
  refused because the accounts file exists. Recovering needs a decision: remove the two local Auth users
  and the accounts file, then rerun.
- Add-ons appear only for Iced Coffee and Non-Coffee. Jam has no stock, so the POS should show it as not
  available.
- Product images are not seeded.
- Manual testing through the UI has **not** been done. It is the team's next activity.
