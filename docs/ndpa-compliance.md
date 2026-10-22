# NDPA 2023 compliance map

How SideHustle meets the Nigeria Data Protection Act 2023 (NDPA) and the SRS privacy requirements (NFR-PRV-01..03, FR-ACC-08, FR-ADM-10, DR-04..06). This is an engineering map, not legal advice: the **Owner actions** at the end must be done by the company, ideally with a data protection lawyer, before launch.

Section numbers are given for orientation and were not checked against the gazetted text; confirm them with counsel.

SideHustle is a **data controller** for buyers, vendor staff and recipients. Paystack, the SMS and email providers, hosting, storage and logistics partners are **processors**.

## What the code does

| NDPA duty                                       | Section       | How it is met                                                                                                                                                                                                                                 | Where                                                                                                |
| ----------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Lawful basis for each use                       | s.25          | Contract (account, orders), legal obligation (order and payment records), legitimate interest (verification, fraud), consent (marketing only)                                                                                                 | Privacy notice; `consents` table                                                                     |
| Consent is recorded, specific and withdrawable  | s.25–26       | Separate opt-in for marketing at sign-up; every consent stored with purpose, policy version, time; withdraw from the account page                                                                                                             | `apps/api/src/modules/identity/routes.ts` (signup), `PUT /v1/me/consents/marketing`                  |
| Children                                        | s.31          | Sign-up requires confirming 18+; recorded as consent purpose `age_18_plus`                                                                                                                                                                    | `SignupInput.ageConfirmed` in `packages/schemas`                                                     |
| Transparency                                    | s.27          | Privacy notice with controller, purposes, lawful bases, recipients, transfers, retention, rights, NDPC complaint route; linked from sign-up                                                                                                   | `apps/web/src/app/privacy/page.tsx`, `messages/en-NG.json` → `privacy`                               |
| Data minimisation                               | s.24(1)(c)    | Only fields the SRS needs (DR-04); Paystack payloads cut to reference, amount, status, channel, time; vendors see only what they need to ship                                                                                                 | `minimalPaymentPayload` in `apps/api/src/modules/privacy/service.ts`; `GET /v1/vendor/orders`        |
| Storage limitation                              | s.24(1)(d)    | Nightly retention job per data type; admin-configurable with legal minimums (orders/payments ≥ 6 years)                                                                                                                                       | `runRetention`, `RETENTION_TYPES`, worker job `privacy.retention`, Admin → Settings → Data retention |
| Right of access and portability                 | s.34, s.38    | "Download my data": immediate JSON export of profile, consents, sign-ins, orders, payments, requests, saved kits, messages                                                                                                                    | `GET /v1/me/data-export`                                                                             |
| Right to rectification                          | s.35          | Edit profile; change email or phone with password check, re-verification required                                                                                                                                                             | `PUT /v1/me/profile`, `PUT /v1/me/contact`                                                           |
| Right to erasure                                | s.36          | "Delete my account": password check, immediate anonymisation and deletion; orders kept (legal obligation) without the account identity; refused while an order is active or the person runs a vendor team                                     | `POST /v1/me/delete`, `eraseUser`                                                                    |
| Right to withdraw consent / object to marketing | s.26, s.36    | Marketing toggle on the account page                                                                                                                                                                                                          | Account page                                                                                         |
| Security of processing                          | s.39          | TLS; Argon2id passwords; hashed session, OTP and email tokens; codes and links redacted from the message queue after sending; CSRF; rate limits; role checks and vendor tenancy on every request; dev shortcuts refused in staging/production | `lib/auth.ts`, `lib/password.ts`, `modules/notifications/service.ts`, `config.ts`                    |
| Accountability and records                      | s.24(3), s.28 | Append-only audit log of admin actions, admin views of order details, data exports, contact changes and erasures                                                                                                                              | `audit_log`; Admin → Audit log                                                                       |
| Breach notification                             | s.40          | 72-hour NDPC notification and data-subject notice procedure                                                                                                                                                                                   | `docs/breach-runbook.md`                                                                             |

## Owner actions before launch (not code)

1. **Register with the NDPC** as a data controller of major importance if SideHustle meets the threshold, and pay the fee.
2. **Designate a Data Protection Officer** (s.32) and publish their contact in the privacy notice (replace `[dpo@ email address]`).
3. **Fill the bracketed items** in the privacy notice: company legal name, RC number, address, processors and the countries they store data in. Have a lawyer review the text.
4. **Sign data processing agreements** with Paystack, the SMS provider (Termii), the email provider (Resend), hosting, storage and any logistics partner (s.29).
5. **Cross-border transfers** (s.41–43): hosting and email providers may store data outside Nigeria. Record the legal basis for each, such as adequacy or NDPC-approved contractual clauses.
6. **Confirm retention periods** with a lawyer (SRS §11 item 7). The seeded values are placeholders; the admin screen enforces the minimums in `RETENTION_TYPES`.
7. **Run a data protection impact assessment** (s.28) for KYC and licence documents before vendor document uploads go live, and keep them in a private, encrypted bucket with logged access (DR-05).
8. **Database encryption at rest and backups**: confirm the chosen host encrypts storage and backups (NFR-SEC-01) when ticket 0.8 picks it.
9. **File the annual compliance audit returns** with the NDPC if required for your category.
10. **Train staff** who use the admin console; their views of buyer data are logged.

## Not built yet

- Vendor document uploads (ticket 3.1) — must land with the DPIA in item 7.
- An admin queue for rights requests made by email (people who cannot log in). Until then the DPO handles them by hand, within 30 days, using the same export and erase functions.
