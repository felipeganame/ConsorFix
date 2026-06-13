-- Bootstrap for ConsorcioFix Postgres (dev).
-- Runs once when the volume is empty.
-- Production parity: same extensions and same owner/app role separation.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- App role (used by API + worker). NOT the owner of the tables: RLS does
-- not apply to owners, so the app role MUST be a separate user (regla 1
-- de CLAUDE.md). The owner role runs migrations.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pass' NOINHERIT;
  END IF;
END $$;

GRANT CONNECT ON DATABASE consorciofix TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Future tables will GRANT SELECT/INSERT/UPDATE/DELETE on app_user
-- inside migrations, after enabling RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
