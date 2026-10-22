# Paystack webhook design and spike findings

Status: design notes for `POST /v1/payments/webhook/paystack` (plan 009, ticket 0.9), written against a throwaway prototype. The implementation lives in `apps/api/src/modules/payments/` (routes and service) and `apps/api/src/lib/payments/provider.ts`; use this document as the spec when hardening it.

Sources and verification status (2026-10-22):

- Schema and TRD facts below were checked against the repository (`packages/db/src/schema/commerce.ts`, `ops.ts`, migrations 0002/0003).
- Paystack facts (header `x-paystack-signature`, HMAC-SHA512 of the raw body keyed with the secret key, event `charge.success` with `data.reference`, `data.amount` in kobo, `data.currency`) are **unverified against current Paystack docs**: `https://paystack.com/docs/payments/webhooks/` returned HTTP 403 to the automated fetcher on this date. They come from the plan and prior knowledge. Someone with browser access must confirm them before ticket 2.4.
- Part B (sandbox round trip): **Not run: no test keys / staging URL (2026-10-22)**.

## 1. Event flow

1. Paystack sends `POST /v1/payments/webhook/paystack` with header `x-paystack-signature` and a JSON body.
2. A parser registered only inside the webhook plugin captures the body as a raw `Buffer` (Fastify would otherwise discard the raw bytes).
3. If `PAYSTACK_SECRET_KEY` is unset, respond 503 problem `PAYMENTS_NOT_CONFIGURED`.
4. Verify the signature over the raw bytes. Missing or wrong: 401 problem `INVALID_SIGNATURE`, no database access.
5. Parse the JSON. Events other than `charge.success` are acknowledged with 200 and ignored.
6. Open one database transaction.
7. Look up the order by `orders.ref = data.reference` with `SELECT ... FOR UPDATE`. Unknown reference: commit nothing, respond 200 (retrying will not help; alert).
8. `INSERT INTO payments ... ON CONFLICT (provider, provider_ref) DO NOTHING RETURNING id`. No row returned means a replay: respond 200, do nothing else.
9. Check amount and currency against the order. On a mismatch mark the payment `failed`, write an alert outbox row, leave the order alone.
10. On a match and `order.status = 'pending_payment'`: set the order `paid` and `paid_at`, insert one balanced `payment` journal with its entries, insert one outbox row (`payments.succeeded`).
11. Commit, respond 200.

Any exception rolls the whole transaction back and returns 5xx, so Paystack retries; step 8 makes the retry safe.

## 2. Signature verification

Recommendation: HMAC-SHA512 of the raw request body, hex digest, keyed with the secret key, compared to `x-paystack-signature` using `crypto.timingSafeEqual` on equal-length buffers (check lengths first; `timingSafeEqual` throws on a length mismatch). Never verify against re-serialised JSON.

Raw body: an encapsulated `addContentTypeParser('application/json', { parseAs: 'buffer' }, ...)` inside the webhook plugin only, so every other route keeps normal JSON parsing. The route declares no body schema; the handler parses and validates the JSON itself after the signature passes.

Missing or invalid signature: 401 problem `INVALID_SIGNATURE`, before any database call. Signature failures are logged without the body.

Alternative considered: also allow-listing Paystack source IPs. Useful as defence in depth, but proxies make `req.ip` unreliable; leave it to the edge.

## 3. Idempotency

`INSERT INTO payments (...) ON CONFLICT (provider, provider_ref) DO NOTHING RETURNING id`, backed by the unique index `payments_provider_ref_key`. If nothing is returned the delivery is a replay: respond 200 and stop.

Why it is safe under concurrent duplicates: two transactions inserting the same `(provider, provider_ref)` serialise on the unique index. The second blocks until the first commits (then takes the conflict path and returns nothing) or rolls back (then it inserts and proceeds). All side effects (order update, journal, outbox) are in the same transaction as the insert and only run when the insert returned a row, so exactly one transaction ever applies them. The order row lock in step 7 additionally serialises different references for the same order. The outbox `dedupe_key` is a second guard.

The reference doubles as the idempotency key; Paystack may redeliver with the same reference after failures or timeouts.

## 4. Amount and currency check

Compare `data.amount` (kobo, integer) with `orders.total_kobo` and `data.currency` with `NGN`. On a mismatch: store the payment as `failed` with `raw_payload`, do not change the order, do not post to the ledger, write an alert outbox row (`payments.mismatch`, dedupe key `paystack:<reference>:mismatch`) and respond 200 (retries would not change the outcome). A later correct delivery with a different reference can still pay the order.

Because the unique index is on `(provider, provider_ref)`, a mismatching reference cannot later be "fixed" to success. That is deliberate: it needs a human decision (refund or manual adjustment).

## 5. Order state

Allowed transition from a webhook: `pending_payment -> paid` only. `paid_at` comes from the server clock at commit (the payment's `paid_at` could use Paystack's `paid_at` once verified).

If the order is not `pending_payment` (for example `expired` or already `paid` by another reference), the prototype records the payment as `success`, leaves the order unchanged, posts no journal, and writes an alert outbox row (`payments.needs_review`). See open questions: money has been taken for an order that cannot be fulfilled.

The client redirect never marks an order paid.

## 6. Ledger postings (provisional)

Provisional, pending SRS section 11 items 5-8 (commission, payout timing, who bears fees and discounts). The `ledger_account` enum is sufficient; no schema change is needed.

Sign convention (as in the schema test): cash received is a negative `buyer_clearing` entry, amounts owed are positive.

`payment` journal for a successful payment of `total_kobo` T:

| Account            | Amount (kobo)                                 | Notes                                                                                      |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `buyer_clearing`   | `-T`                                          | cash received from the provider                                                            |
| `vendor_payable`   | `+sum(line total - line discount)` per vendor | one entry per vendor with `vendor_id`, from `order_lines` that carry a `vendor_id`         |
| `platform_revenue` | `+(T - sum of vendor payables)`               | delivery fee, hub-fulfilled lines and anything not attributed to a vendor, so it sums to 0 |

Commission (seed placeholder: global 10%, `commission_rules.rate_bps = 1000`) is **not** taken at payment time in the prototype. Recommendation: post it in a separate `commission` journal when the fulfilment is delivered (move `rate * vendor gross` from `vendor_payable` to `platform_revenue`), so refunds before delivery need no commission reversal. Discounts funded by the platform (`platform_discount`) and provider fees (`provider_fees`, known from the `charge.success` `fees` field or settlement) are likewise separate journals. The prototype's vendor split only handles lines that already carry a `vendor_id`; kit parent lines are skipped because child lines carry the vendors.

Migration 0002's deferred trigger rejects any unbalanced journal at commit, which would roll back the whole webhook transaction; this is the desired safety net.

## 7. Outbox

Topic `payments.succeeded`, payload `{ order_id, order_ref, payment_id, amount_kobo }`, `dedupe_key = paystack:<reference>:charge.success`. Alerts use the topics `payments.mismatch` and `payments.needs_review` with keys `paystack:<reference>:mismatch` and `paystack:<reference>:needs-review`. The worker (not part of this spike) drains the outbox and sends notifications; nothing is sent from the request path.

## 8. Reconciliation (design only)

TRD: every 15 minutes, find payments or orders still `pending_payment` for more than 10 minutes that have an initialised transaction, and ask Paystack (`GET /transaction/verify/:reference`) for their status. A `success` result is fed through the same transactional function as the webhook (the shared function must take the verified transaction data, not the HTTP request), so webhook and reconciliation can race safely. Abandoned or failed results update `payments.status`. Requires remembering the initialised reference per order at checkout (ticket 2.4). Alert when reconciliation finds a success that the webhook missed.

## 9. Open questions for the owner

1. What happens when a payment succeeds for an `expired` or already-paid order: automatic refund, or revive the order if stock is still reserved?
2. Commission: rate basis (vendor gross vs net of discount), when it is recognised, and who funds platform discounts (SRS section 11 items 5-8).
3. Who bears Paystack fees, and are they recorded per payment via `provider_fees`?
4. Is the Paystack `reference` always our `orders.ref`, or do we generate a separate reference at initialise time? (The prototype assumes `orders.ref`.)
5. Alerting channel for `payments.mismatch` and `payments.needs_review`.
6. Partial payments or overpayments: reject as a mismatch (prototype) or accept and refund the difference?
7. Do we keep the full raw payload (PII such as email and card last4) in `payments.raw_payload`, and for how long?

## Sandbox findings

Not run: no test keys / staging URL (2026-10-22). Part B must still confirm the signature header, the digest encoding, the `charge.success` payload fields, and the retry behaviour against a real test transaction.
