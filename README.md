# SideHustle Marketplace

Wholesale marketplace for first-time sellers in Nigeria: buy a starter kit or build your own from verified vendors, and see the expected profit before paying. Money is NGN, stored as integer kobo.

The build follows `plans/code-plan.md` (v0.3) in the project files. This repository is **Phase 0: Foundations**.

## Quick start

Needs Node 22.9+, pnpm 10 and Docker.

```sh
cp .env.example .env
docker compose up -d          # Postgres 16, Redis 7, MinIO, Mailpit
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # API :4000, worker, web :3000
```

- API health: http://localhost:4000/v1/health, OpenAPI: http://localhost:4000/v1/openapi.json
- Component styleguide: http://localhost:3000/styleguide
- Mail catcher: http://localhost:8025

```sh
pnpm test        # unit tests; db and api integration tests run when TEST_DATABASE_URL / TEST_REDIS_URL are set
pnpm lint && pnpm typecheck && pnpm build
pnpm test:e2e    # Playwright + axe against a built web app
pnpm openapi     # regenerate apps/api/openapi.json after an API change
```

## Layout

```
apps/api         Fastify REST API (/v1) in src/server.ts; BullMQ worker in src/worker.ts
apps/web         Next.js App Router, Tailwind v4, next-intl (en-NG)
packages/pricing Pure pricing rules, golden-tested against the prototype (no I/O)
packages/db      Drizzle schema, SQL migrations, prototype seed, catalogue loader
packages/schemas Zod schemas shared by API and web (money, problems, phone, states)
packages/ui      Design tokens from the prototype + first components
packages/config  Shared tsconfig and Vitest preset
```

## Phase 0 status

| Ticket                             | State       | Notes                                                                                |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| 0.1 Monorepo scaffold              | Done        | pnpm, Turborepo, strict TS, ESLint, Prettier, Vitest                                 |
| 0.2 Docker Compose, `.env.example` | Done        | `pnpm dev` boots api, worker and web                                                 |
| 0.3 CI workflow                    | Done        | `.github/workflows/ci.yml`; runs once the repo is on GitHub                          |
| 0.4 Schema v1 + first migration    | Done        | 44 tables; zero-sum ledger trigger, append-only triggers, app role grants            |
| 0.5 Seed converter                 | Done        | Seeded DB reproduces the section 4 golden table and freedom-number orderings         |
| 0.6 Pricing package                | Done        | Golden + AC-01..06 + section 4 extra cases; 100% line and branch coverage (gate 90%) |
| 0.7 UI tokens + first 8 components | Done        | Axe clean in light and dark at 320px and desktop                                     |
| 0.8 Staging, deploy, Sentry        | Not started | Needs a hosting account and Sentry project                                           |
| 0.9 Paystack sandbox spike         | Not started | Needs Paystack test keys and a staging URL for webhooks                              |

## Decisions made while building

Defaults the plan marks **[Default]** are kept (whole-naira rounding of promo prices and bundle discounts, half-up; unavailable kits leave the freedom-number list; promos need an end date, launches do not). Choices made here that the plan did not spell out:

- **Bundle and kit lines are quantity 1** (SRS BR-05). Buyer-fixable problems (MOQ, stock, kit quantity) come back from `cartTotals` as `issues`; malformed input (unknown product, invented option value) throws.
- **An unselected select option takes its first value**, matching the prototype. Unknown option ids or values are rejected, so a tampered request cannot invent a cheaper choice.
- **Stock is checked on combined demand** across product, kit and bundle lines. `stock_qty = null` means "not tracked".
- **Equal promos** resolve to the newest, then the lower id, so prices are deterministic.
- **Deal end dates are stored as an Africa/Lagos calendar date** (`deals.ends_on`) rather than a timestamp, so "ends today" means the end of the Lagos day.
- **Down migrations** are drop-and-reapply (`pnpm db:reset`), because drizzle-kit has no down files. CI proves migrate → reset → migrate.
- **CI uses GitHub service containers** for Postgres and Redis instead of Testcontainers: same isolation, less setup.
- **Hub stock movements**: dispatching reserved stock writes a release and a negative dispatch, so on-hand and available each drop once (`hub_stock_levels` view).
- **New token `--on-danger`**: the prototype's dark-mode danger red with white text fails WCAG AA, which axe caught.
- **Styleguide page instead of Storybook/Ladle**: `/styleguide` in the web app, tested by Playwright + axe.
- **Seed placeholders** (until SRS §11 items 5–8 are decided): 10% global commission, payouts T+3 with no holdback.
