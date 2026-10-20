-- Extensions the schema relies on: citext for case-insensitive emails, pg_trgm for catalogue search (ticket 1.3).
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
