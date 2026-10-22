# SideHustle Marketplace

Wholesale marketplace for first-time sellers in Nigeria: buy a starter kit or build your own from verified vendors, and see the expected profit before paying. Money is NGN, stored as integer kobo.

The build follows `plans/code-plan.md` (v0.3) in the project files and SRS v0.2; where the SRS and TRD differ, SRS §11 wins. Phase 0 (foundations) is done, and the buyer, vendor and admin flows of Phases 1–3 are built on top of it.

## Quick start

Needs Node 22.9+, pnpm 10 and Docker.

```sh
cp .env.example .env
docker compose up -d          # Postgres 16, Redis 7, MinIO, Mailpit
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm db:seed:demo             # admin@, vendor@ (Luxe Leather Label) and buyer@sidehustle.test, password "sidehustle-demo"
pnpm dev                      # API :4000, worker, web :3000
```

`DEV_TOOLS=true` (set in `.env.example`) is local only: it echoes OTP codes and email links and enables the dev payment page, and the API refuses it in staging and production. With no `PAYSTACK_SECRET_KEY`, checkout uses the **dev payment provider**: "Pay" opens `/pay/dev/<ref>`, whose button runs the same server-side payment path a verified Paystack webhook would. One-time codes and email links are shown on the verify page in development, since SMS and email providers are not connected yet.

- API health: http://localhost:4000/v1/health, OpenAPI: http://localhost:4000/v1/openapi.json
- Component styleguide: http://localhost:3000/styleguide
- Mail catcher: http://localhost:8025

```sh
pnpm test        # unit tests; db and api integration tests run when TEST_DATABASE_URL / TEST_REDIS_URL are set
pnpm lint && pnpm typecheck && pnpm build
pnpm test:e2e    # Playwright: buyer/vendor/admin flows + axe on every page; needs Postgres and Redis (E2E_DATABASE_URL, default sidehustle_e2e)
pnpm openapi     # regenerate apps/api/openapi.json after an API change
```

## Layout

```
apps/api         Fastify REST API (/v1) in src/server.ts; BullMQ worker in src/worker.ts
                 src/modules: identity, account, catalogue, cart, checkout, orders, payments,
                 requests, vendor, admin, notifications; src/lib: auth, rate limits, pricing context,
                 payment providers (Paystack, dev), outbox, audit
apps/web         Next.js App Router, Tailwind v4, next-intl (en-NG), TanStack Query
                 buyer pages, /vendor portal, /admin console; /v1 proxied to the API
packages/pricing Pure pricing rules, golden-tested against the prototype (no I/O)
packages/db      Drizzle schema, SQL migrations, prototype seed, catalogue loader
packages/schemas Zod schemas shared by API and web (money, problems, phone, states)
packages/ui      Design tokens from the prototype + the 18 components in plan section 9
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

## Phases 1–3 status

Ticket numbers are from plan section 11. "Done" means built, tested and clicked through locally; nothing is on staging yet (0.8).

| Ticket                              | State                           | Notes                                                                                                                                                     |
| ----------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.7 UI components (rest of plan §9) | Done                            | ProductCard, KitCard, VendorCard + Monogram, Slideshow (APG), ProfitCalculator, BundleSummary, OrderProgress, Toast, EmptyState, BottomTabBar, ProductArt |
| 1.1 Identity                        | Done                            | Signup with consent, login/logout, Argon2id, Postgres sessions (30 min idle, 30 day absolute), device list and revoke, CSRF, Redis rate limits            |
| 1.3 Catalogue API + search          | Done                            | Case-insensitive search over name, vendor, location, category; sort by price, margin, MOQ                                                                 |
| 1.4–1.8, 1.10, 1.11                 | Done                            | Home (slideshow, how it works, categories, kits, vendors, grid), product page, kits, freedom number, builder, vendors, account                            |
| 1.9 Cart                            | Done                            | Merge identical lines, MOQ/stock issues, change flags, header count, toast                                                                                |
| 1.W Walking skeleton                | Done locally                    | With the dev payment provider; Paystack sandbox waits for keys (0.9 Part B)                                                                               |
| 2.0 Verification                    | Done, providers pending         | Phone OTP and email link before first checkout; password reset. Messages are logged until Termii/Resend accounts exist                                    |
| 2.1–2.3 Checkout                    | Done                            | Delivery methods and eligible states, quote with change diff, idempotent order creation, row-locked reservations, snapshots, vendor + hub fulfilments     |
| 2.4 Paystack adapter                | Built, not run against Paystack | Initialize, verify, refund, HMAC webhook; unit-tested with a stubbed fetch                                                                                |
| 2.5 Ledger + outbox                 | Done                            | Balanced payment, commission and refund journals; outbox with dedupe keys (AC-08)                                                                         |
| 2.6 Worker                          | Done                            | Order expiry, outbox drain, vendor 12h SLA reminder, 15-minute reconciliation                                                                             |
| 2.7–2.8 Orders, login gate          | Done                            | Four-step progress per fulfilment, tracking, polling (no SSE yet), return-to-page after login                                                             |
| 3.1–3.5 Vendor portal               | Done                            | Apply, products with options and stock, restriction check, deals with preview and moderation, fulfilments, custom requests, licences                      |
| 3.6–3.10 Admin console              | Done                            | Vendor review, moderation, orders, refunds, disputes, hub fulfilments and stock, rules, kits, delivery, commission, retention, config, audit log          |
| 3.11 Data export/deletion           | Partly                          | Requests and consent are recorded; the export and deletion jobs are not written                                                                           |

Tests: 64 API tests (56 against Postgres + Redis), 24 UI component tests, and 77 Playwright runs (flows plus axe on every page, light and dark, 320px and desktop).

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

### Defaults picked for Phases 1–3

These were not settled by the plan or SRS; each is easy to change.

- **Money on the wire** is integer kobo in fields ending `Kobo` (e.g. `totalKobo`), not the `{ amount_kobo, currency }` wrapper of plan section 6, until a second currency exists.
- **Dev payment provider** when `PAYSTACK_SECRET_KEY` is empty (refused in production). Its completion endpoint calls the same `processPaymentSuccess` as the webhook and reconciliation job.
- **Deal moderation**: deals from verified vendors publish at once unless the headline or description contains a link, email address or Nigerian phone number; those wait for an admin (plan section 10). Admins can remove any deal.
- **Vendors record delivery** (and admins for the hub) until carrier tracking webhooks exist (v1.1).
- **Late payment refund** is automatic when the stock is gone, as decided on 19 Oct; it is recorded as a payment journal plus a refund journal.
- **Ledger accounts**: the payment journal credits each vendor's payable with its lines less vendor-funded kit gaps; platform-funded discounts (bundles, platform-funded kits) go to `platform_discount`; delivery fees are platform revenue. Commission is a separate journal on what each vendor is paid, rounded half-up per line. Refunds debit `buyer_clearing` against `refunds`; who bears a refund in settlement is left for the payouts work.
- **Kit child lines** carry each component's wholesale price with its share of the kit gap as `discount_kobo`, so per-vendor amounts always add up to the kit price.
- **Cart change flags** clear when the buyer acknowledges them, re-adds the line, or reviews checkout.
- **Logged-out add to cart** keeps the line in sessionStorage and merges it after login; logged-out builder drafts also live in sessionStorage (plan section 9).
- **Search** uses `ILIKE` over the four fields; Postgres full-text and trigram indexes (plan 1.3) can replace it when the catalogue grows.
- **Catalogue pages** render on the server per request with a 30-second fetch cache rather than ISR with tag revalidation, so `next build` never needs the API.
- **API proxy**: the web app forwards `/v1/*` to `API_ORIGIN` from a route handler, read at request time, so one build runs anywhere. The client IP the API rate-limits on comes from `CLIENT_IP_HEADER` (default `xff-last`, the last `X-Forwarded-For` entry, which is the one your platform's load balancer appends; or a header the platform overwrites, such as `cf-connecting-ip` or `x-real-ip`). The browser-supplied chain is never forwarded. On the API set `TRUST_PROXY` to the web service's private address range as a comma-separated IP/CIDR list (for example `TRUST_PROXY=10.0.0.0/8`) rather than `true`, and keep the API off the public internet; `false` (the default) ignores `X-Forwarded-For` entirely.
- **Licence documents** are recorded by reference (`document_key`); uploads to the private bucket arrive with the storage provider.
- **The audit log is append-only for every role** (trigger in migration 0003), matching the ledger.
- **Demo accounts** come from `pnpm db:seed:demo` and are refused in production.
- **Advisor fixes 002 and 003** (kit pricing when a component is unavailable; own-property option lookup) were cherry-picked from the local `advisor/*` branches because the flows depend on them. The other advisor branches are not included.
- **NDPA**: the code side is mapped in `docs/ndpa-compliance.md`, with a breach runbook in `docs/breach-runbook.md`. Erasure is immediate (not a queued job) and keeps finished orders for the 6-year retention period without the account identity; retention periods are placeholders until SRS §11 item 7 is settled with counsel.
