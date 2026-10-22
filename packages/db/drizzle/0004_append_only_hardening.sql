-- Row triggers do not fire on TRUNCATE, so block it per statement on every append-only table.
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_journals_no_truncate BEFORE TRUNCATE ON ledger_journals
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint
CREATE TRIGGER hub_stock_movements_no_truncate BEFORE TRUNCATE ON hub_stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- 0002 granted only the tables that existed then. Tables created by later migrations (run as this
-- same owner role) get the app role's grants automatically; append-only ones must still REVOKE.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sidehustle_app;
