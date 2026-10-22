# Personal data breach runbook

NDPA 2023 s.40: notify the Nigeria Data Protection Commission (NDPC) **within 72 hours** of becoming aware of a breach likely to risk people's rights, and tell affected people **without undue delay** when the risk is high. Fill in the names and contacts below before launch.

| Role                    | Who                  |
| ----------------------- | -------------------- |
| Incident lead           | [name, phone]        |
| Data Protection Officer | [name, email, phone] |
| Engineering on call     | [name, phone]        |
| Legal counsel           | [firm, contact]      |

## 1. Contain (first hour)

- Revoke leaked credentials: rotate database, Redis, Paystack, SMS, email and storage keys; redeploy.
- If accounts are at risk, revoke all sessions: `UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;` (forces everyone to log in again).
- Preserve evidence: export application logs, `audit_log` rows and provider dashboards for the period. Do not delete anything.

## 2. Assess (within 24 hours)

Record in the incident log: what happened and when; which data (identity, contact, delivery addresses, orders, payment references, KYC documents); how many people; whether the data was encrypted; whether it is now out of our control; the likely harm (fraud, phishing, physical safety from addresses).

## 3. Notify (within 72 hours of awareness)

- **NDPC**: through the NDPC's breach notification channel (check ndpc.gov.ng for the current form). Include the nature of the breach, categories and approximate numbers of people and records, the DPO's contact, likely consequences, and measures taken. If facts are incomplete, notify anyway and send updates.
- **Affected people** (if high risk): SMS and email in plain language: what happened, what data, what we have done, what they should do (for example change their password, watch for calls asking for OTPs), and how to reach the DPO.
- **Processors and partners** involved, and Paystack if payment references are affected.

## 4. Recover and learn

- Fix the root cause; add a test or monitor that would have caught it.
- Write a short post-incident review, and keep it with the incident log (s.40 requires records of every breach, even ones not notified).
