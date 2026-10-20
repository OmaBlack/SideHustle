CREATE TYPE "public"."custom_request_status" AS ENUM('new', 'quoted', 'accepted', 'declined', 'paid');--> statement-breakpoint
CREATE TYPE "public"."data_request_kind" AS ENUM('export', 'delete');--> statement-breakpoint
CREATE TYPE "public"."deal_kind" AS ENUM('promo', 'launch');--> statement-breakpoint
CREATE TYPE "public"."deal_scope" AS ENUM('product', 'category');--> statement-breakpoint
CREATE TYPE "public"."email_token_purpose" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_kind" AS ENUM('vendor', 'hub');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_mode" AS ENUM('drop_ship', 'hub');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_status" AS ENUM('awaiting_confirmation', 'confirmed', 'rejected', 'dispatched', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."funded_by" AS ENUM('vendor', 'platform');--> statement-breakpoint
CREATE TYPE "public"."hub_movement_kind" AS ENUM('receipt', 'adjustment', 'reservation', 'release', 'dispatch');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('buyer_clearing', 'vendor_payable', 'platform_revenue', 'platform_discount', 'provider_fees', 'refunds');--> statement-breakpoint
CREATE TYPE "public"."ledger_journal_kind" AS ENUM('payment', 'discount', 'commission', 'refund', 'payout', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."licence_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."line_type" AS ENUM('product', 'kit', 'bundle');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('sms', 'email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'expired', 'in_fulfilment', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('paystack', 'flutterwave');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'success', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('drop_ship', 'hub');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'committed', 'released');--> statement-breakpoint
CREATE TYPE "public"."retention_action" AS ENUM('archive', 'purge');--> statement-breakpoint
CREATE TYPE "public"."rule_scope" AS ENUM('global', 'category', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'vendor_staff', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vendor_staff_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('pending', 'verified', 'suspended');--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "data_request_kind" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"result_key" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "email_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"state" text,
	"business_name" text,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bundle_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" "rule_scope" NOT NULL,
	"scope_id" uuid,
	"min_kobo" bigint NOT NULL,
	"pct" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_rules_scope_key" UNIQUE NULLS NOT DISTINCT("scope","scope_id"),
	CONSTRAINT "bundle_rules_scope_id" CHECK (("bundle_rules"."scope" = 'global') = ("bundle_rules"."scope_id" IS NULL)),
	CONSTRAINT "bundle_rules_min_nonneg" CHECK ("bundle_rules"."min_kobo" >= 0),
	CONSTRAINT "bundle_rules_pct" CHECK ("bundle_rules"."pct" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" "rule_scope" NOT NULL,
	"scope_id" uuid,
	"rate_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rules_scope_key" UNIQUE NULLS NOT DISTINCT("scope","scope_id"),
	CONSTRAINT "commission_rules_scope_id" CHECK (("commission_rules"."scope" = 'global') = ("commission_rules"."scope_id" IS NULL)),
	CONSTRAINT "commission_rules_rate" CHECK ("commission_rules"."rate_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kind" "deal_kind" NOT NULL,
	"scope" "deal_scope" NOT NULL,
	"category_id" uuid NOT NULL,
	"product_id" uuid,
	"discount_pct" smallint DEFAULT 0 NOT NULL,
	"headline" text NOT NULL,
	"detail" text,
	"starts_at" timestamp with time zone,
	"ends_on" date,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "deals_kind_discount" CHECK (("deals"."kind" = 'launch' AND "deals"."discount_pct" = 0) OR ("deals"."kind" = 'promo' AND "deals"."discount_pct" BETWEEN 1 AND 90)),
	CONSTRAINT "deals_scope_product" CHECK (("deals"."scope" = 'product') = ("deals"."product_id" IS NOT NULL)),
	CONSTRAINT "deals_headline_length" CHECK (char_length("deals"."headline") <= 60),
	CONSTRAINT "deals_promo_end" CHECK ("deals"."kind" = 'launch' OR "deals"."ends_on" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "delivery_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"fee_kobo" bigint NOT NULL,
	"eta_text" text,
	"eligible_states" text[] DEFAULT '{}'::text[] NOT NULL,
	"partner" text,
	"rate_card" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_methods_fee_nonneg" CHECK ("delivery_methods"."fee_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hub_stock" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" "hub_movement_kind" NOT NULL,
	"qty" integer NOT NULL,
	"order_id" uuid,
	"actor_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kit_extras" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kit_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kit_items" (
	"kit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kit_items_kit_id_product_id_pk" PRIMARY KEY("kit_id","product_id"),
	CONSTRAINT "kit_items_qty_positive" CHECK ("kit_items"."qty" >= 1)
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_kobo" bigint NOT NULL,
	"tip" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer NOT NULL,
	"platform_funded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "kits_price_nonneg" CHECK ("kits"."price_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"cost_kobo" bigint NOT NULL,
	"rrp_kobo" bigint NOT NULL,
	"moq" integer DEFAULT 1 NOT NULL,
	"lead_time_text" text,
	"note" text,
	"note_placeholder" text,
	"art_key" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"fulfilment_mode" "fulfilment_mode" DEFAULT 'drop_ship' NOT NULL,
	"stock_qty" integer,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_cost_nonneg" CHECK ("products"."cost_kobo" >= 0),
	CONSTRAINT "products_rrp_nonneg" CHECK ("products"."rrp_kobo" >= 0),
	CONSTRAINT "products_moq_positive" CHECK ("products"."moq" >= 1),
	CONSTRAINT "products_stock_nonneg" CHECK ("products"."stock_qty" IS NULL OR "products"."stock_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "restricted_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" uuid,
	"product_id" uuid,
	"required_licence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restricted_items_target" CHECK (("restricted_items"."category_id" IS NULL) <> ("restricted_items"."product_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "vendor_licences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"licence_type" text NOT NULL,
	"document_key" text NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "licence_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_staff" (
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "vendor_staff_role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_staff_vendor_id_user_id_pk" PRIMARY KEY("vendor_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"location" text NOT NULL,
	"origin_note" text,
	"since_year" smallint,
	"lead_time_text" text,
	"ships_to" text,
	"about" text,
	"about2" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"accepts_custom" boolean DEFAULT false NOT NULL,
	"custom_note" text,
	"featured" boolean DEFAULT false NOT NULL,
	"reply_time_text" text,
	"rating" numeric(2, 1),
	"orders_count" integer DEFAULT 0 NOT NULL,
	"status" "vendor_status" DEFAULT 'pending' NOT NULL,
	"brand_color" text,
	"kyc_status" "kyc_status" DEFAULT 'not_started' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cart_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"line_type" "line_type" NOT NULL,
	"product_id" uuid,
	"kit_id" uuid,
	"qty" integer NOT NULL,
	"options" jsonb,
	"note" text,
	"name" text,
	"items" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_lines_qty_positive" CHECK ("cart_lines"."qty" >= 1),
	CONSTRAINT "cart_lines_ref" CHECK (("cart_lines"."line_type" = 'product' AND "cart_lines"."product_id" IS NOT NULL AND "cart_lines"."kit_id" IS NULL)
       OR ("cart_lines"."line_type" = 'kit' AND "cart_lines"."kit_id" IS NOT NULL AND "cart_lines"."product_id" IS NULL)
       OR ("cart_lines"."line_type" = 'bundle' AND "cart_lines"."items" IS NOT NULL AND "cart_lines"."product_id" IS NULL AND "cart_lines"."kit_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"total_kobo" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_quotes_total_nonneg" CHECK ("checkout_quotes"."total_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "custom_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"project_type" text NOT NULL,
	"brief" text NOT NULL,
	"quantity_estimate" integer,
	"status" "custom_request_status" DEFAULT 'new' NOT NULL,
	"quoted_amount_kobo" bigint,
	"quote_expires_at" timestamp with time zone,
	"vendor_reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfilments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "fulfilment_kind" NOT NULL,
	"vendor_id" uuid,
	"status" "fulfilment_status" DEFAULT 'awaiting_confirmation' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"reject_reason" text,
	"dispatched_at" timestamp with time zone,
	"tracking_ref" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfilments_kind_vendor" CHECK (("fulfilments"."kind" = 'vendor') = ("fulfilments"."vendor_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" smallint,
	"response" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"account" "ledger_account" NOT NULL,
	"vendor_id" uuid,
	"amount_kobo" bigint NOT NULL,
	"funded_by" "funded_by",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_journals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"kind" "ledger_journal_kind" NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"parent_line_id" uuid,
	"fulfilment_id" uuid,
	"vendor_id" uuid,
	"line_type" "line_type" NOT NULL,
	"product_id" uuid,
	"kit_id" uuid,
	"bundle_id" uuid,
	"name_snapshot" text NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"qty" integer NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"options_snapshot" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_unit_nonneg" CHECK ("order_lines"."unit_price_kobo" >= 0),
	CONSTRAINT "order_lines_discount_nonneg" CHECK ("order_lines"."discount_kobo" >= 0),
	CONSTRAINT "order_lines_qty_positive" CHECK ("order_lines"."qty" >= 1)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"buyer_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"delivery_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"total_kobo" bigint NOT NULL,
	"delivery_method" text NOT NULL,
	"address" jsonb,
	"recipient" text NOT NULL,
	"phone" text NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_subtotal_nonneg" CHECK ("orders"."subtotal_kobo" >= 0),
	CONSTRAINT "orders_discount_nonneg" CHECK ("orders"."discount_kobo" >= 0),
	CONSTRAINT "orders_delivery_nonneg" CHECK ("orders"."delivery_fee_kobo" >= 0),
	CONSTRAINT "orders_total_nonneg" CHECK ("orders"."total_kobo" >= 0),
	CONSTRAINT "orders_total_matches" CHECK ("orders"."total_kobo" = "orders"."subtotal_kobo" - "orders"."discount_kobo" + "orders"."delivery_fee_kobo")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_ref" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"channel" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_nonneg" CHECK ("payments"."amount_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payout_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid,
	"days_after_delivery" integer NOT NULL,
	"holdback_bps" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_settings_vendor_key" UNIQUE NULLS NOT DISTINCT("vendor_id"),
	CONSTRAINT "payout_settings_holdback" CHECK ("payout_settings"."holdback_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_nonneg" CHECK ("payouts"."amount_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"fulfilment_id" uuid,
	"amount_kobo" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_line_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "saved_bundles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"source" "reservation_source" NOT NULL,
	"qty" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservations_qty_positive" CHECK ("stock_reservations"."qty" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"template" text NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"provider_ref" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"data_type" text NOT NULL,
	"retain_days" integer NOT NULL,
	"action" "retention_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_stock" ADD CONSTRAINT "hub_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_stock_movements" ADD CONSTRAINT "hub_stock_movements_product_id_hub_stock_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."hub_stock"("product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_stock_movements" ADD CONSTRAINT "hub_stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_extras" ADD CONSTRAINT "kit_extras_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_items" ADD CONSTRAINT "restricted_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_items" ADD CONSTRAINT "restricted_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_licences" ADD CONSTRAINT "vendor_licences_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_staff" ADD CONSTRAINT "vendor_staff_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_staff" ADD CONSTRAINT "vendor_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfilments" ADD CONSTRAINT "fulfilments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_parent_line_id_order_lines_id_fk" FOREIGN KEY ("parent_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_fulfilment_id_fulfilments_id_fk" FOREIGN KEY ("fulfilment_id") REFERENCES "public"."fulfilments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_checkout_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."checkout_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_settings" ADD CONSTRAINT "payout_settings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_fulfilment_id_fulfilments_id_fk" FOREIGN KEY ("fulfilment_id") REFERENCES "public"."fulfilments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_bundles" ADD CONSTRAINT "saved_bundles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "otp_codes_user_idx" ON "otp_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "deals_vendor_idx" ON "deals" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_methods_code_key" ON "delivery_methods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "hub_stock_movements_product_idx" ON "hub_stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kits_slug_key" ON "kits" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_vendor_idx" ON "products" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cart_lines_cart_idx" ON "cart_lines" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_user_key" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checkout_quotes_user_idx" ON "checkout_quotes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fulfilments_order_idx" ON "fulfilments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "fulfilments_vendor_idx" ON "fulfilments" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_user_key" ON "idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_vendor_idx" ON "ledger_entries" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "ledger_journals_order_idx" ON "ledger_journals" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_ref_key" ON "orders" USING btree ("ref");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_quote_key" ON "orders" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_line_key" ON "reviews" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_active_idx" ON "stock_reservations" USING btree ("product_id") WHERE "stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_unsent_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."sent_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_key" ON "outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policies_type_key" ON "retention_policies" USING btree ("data_type");