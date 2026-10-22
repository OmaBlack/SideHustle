ALTER TYPE "public"."payment_provider" ADD VALUE 'dev';--> statement-breakpoint
ALTER TABLE "cart_lines" ADD COLUMN "seen_unit_kobo" bigint;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD COLUMN "seen_available" boolean;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "discount_funded_by" "funded_by";--> statement-breakpoint
-- FR-ADM-06: the audit log is append-only for every role, like the ledger (migration 0002).
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
