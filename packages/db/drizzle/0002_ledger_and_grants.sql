-- Double-entry: every ledger journal's entries must sum to zero, checked at commit (TRD §7.3, plan section 3).
CREATE OR REPLACE FUNCTION ledger_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  jid uuid := COALESCE(NEW.journal_id, OLD.journal_id);
  total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_kobo), 0) INTO total FROM ledger_entries WHERE journal_id = jid;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger journal % does not balance (sum % kobo)', jid, total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();--> statement-breakpoint

-- Append-only tables: rows are never changed or removed, whichever role connects.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_journals_append_only BEFORE UPDATE OR DELETE ON ledger_journals
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
CREATE TRIGGER hub_stock_movements_append_only BEFORE UPDATE OR DELETE ON hub_stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- Hub on-hand and available stock derived from the movement log (FR-ADM-07).
CREATE VIEW hub_stock_levels AS
SELECT
  h.product_id,
  h.low_stock_threshold,
  COALESCE(SUM(m.qty) FILTER (WHERE m.kind IN ('receipt', 'adjustment', 'dispatch')), 0)::integer AS on_hand,
  COALESCE(SUM(m.qty), 0)::integer AS available
FROM hub_stock h
LEFT JOIN hub_stock_movements m ON m.product_id = h.product_id
GROUP BY h.product_id, h.low_stock_threshold;--> statement-breakpoint

-- The role the API and worker connect as. It may read and write everything except changing audit and ledger history.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sidehustle_app') THEN
    CREATE ROLE sidehustle_app NOLOGIN;
  END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sidehustle_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sidehustle_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON ledger_entries, ledger_journals, audit_log, hub_stock_movements FROM sidehustle_app;
