# Contributing to Gunita Kopi POS

Welcome to the Gunita Kopi POS project. To maintain high code quality and architectural integrity across our monorepo, all contributors must follow these guidelines.

## Branch and Pull Request Flow

1. **Protected Main Branch**: The `main` branch is protected. Direct pushes to `main` are strictly forbidden.
2. **Feature Branches**: All work must be developed on descriptive feature branches created from `main`:
   - `feature/description` (e.g. `feature/order-discount-ui`)
   - `fix/description` (e.g. `fix/pos-offline-queue`)
   - `chore/description` (e.g. `chore/upgrade-next`)
3. **Continuous Integration**: Every Pull Request must pass all CI checks (linting, typechecking, tests, build, and security audit) before merging.
4. **Vercel Previews**: Vercel automatically deploys a preview of the one app for each PR.
5. **Code Review**: At least one approval is required before merging. Squash and merge is the preferred merge method.

## Conventional Commits

We enforce the [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages.

Format: `<type>(<scope>): <short description>`

### Allowed Types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation updates
- `style`: Code style changes (whitespace, formatting, semicolons)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, tooling, or dependency updates

### Allowed Scopes:

- `admin`, `pos`, `api`
- `contracts`, `db-types`, `auth`, `ui`, `config`
- `supabase`, `ci`, `deps`

### Examples:

- `feat(pos): add offline outbox sync trigger`
- `fix(api): correct CORS headers for admin origin`
- `chore(config): update base tsconfig target`

## Golden Rules

1. **Direct DB Access Forbidden for Websites**: the Owner area (`/admin`) and the POS area (`/staff`) must never connect to Supabase database directly. All business data flows through the backend (`src/server`) with a Bearer token.
2. **Zero Service Role Key Exposure**: `SUPABASE_SERVICE_ROLE_KEY` must never be present in browser code, client bundles, or anywhere outside the backend (`src/server`).
3. **Monorepo Tooling**: Use `pnpm` exclusively. Never run `npm` or `yarn`.
