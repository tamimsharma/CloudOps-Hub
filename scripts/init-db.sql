-- CloudOps Hub - idempotent PostgreSQL initialization
-- Mounted by docker-compose into /docker-entrypoint-initdb.d/init-db.sql.
-- Every statement is safe to run more than once.
--
-- psql meta-commands (\gexec, \c) are used because CREATE DATABASE cannot be
-- executed inside a transaction block (so it cannot be wrapped in DO ... END).

-- 1) Application role -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cloudops') THEN
    CREATE ROLE cloudops LOGIN PASSWORD 'cloudops';
  ELSE
    ALTER ROLE cloudops WITH LOGIN PASSWORD 'cloudops' CREATEDB;
  END IF;
END
$$;

-- 2) Application database ----------------------------------------------------
-- The docker entrypoint already creates POSTGRES_DB (cloudops_hub) owned by
-- POSTGRES_USER, so this is a no-op on the default compose stack.
SELECT 'CREATE DATABASE cloudops_hub OWNER cloudops'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cloudops_hub')
\gexec

-- 3) Privileges inside the application database ------------------------------
\c cloudops_hub

GRANT ALL PRIVILEGES ON SCHEMA public TO cloudops;
ALTER SCHEMA public OWNER TO cloudops;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudops') THEN
    GRANT ALL PRIVILEGES ON DATABASE cloudops_hub TO cloudops;
    ALTER ROLE cloudops WITH LOGIN CREATEDB;
  END IF;
END
$$;
