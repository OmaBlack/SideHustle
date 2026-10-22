ALTER TYPE "public"."payment_provider" ADD VALUE 'dev';--> statement-breakpoint
ALTER TABLE "cart_lines" ADD COLUMN "seen_unit_kobo" bigint;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD COLUMN "seen_available" boolean;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD COLUMN "hidden_reason" text;