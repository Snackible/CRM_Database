// One schema for both Postgres hosts (Neon in production, PGlite locally). Everything is IF NOT EXISTS,
// so it runs safely on every cold start.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS imports (
  id serial PRIMARY KEY,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total_rows int NOT NULL DEFAULT 0,
  rows_done int NOT NULL DEFAULT 0,
  added int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  unmatched int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  mapping jsonb NOT NULL DEFAULT '{}',
  options jsonb NOT NULL DEFAULT '{}',
  errors jsonb NOT NULL DEFAULT '[]',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS clients (
  id serial PRIMARY KEY,
  client_code text,
  name text NOT NULL,
  segment text,
  city text,
  owner text,
  email text,
  phone text,
  since date,
  is_sample boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clients_code_key ON clients (lower(client_code)) WHERE client_code IS NOT NULL AND client_code <> '';

CREATE TABLE IF NOT EXISTS contacts (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text, role text, phone text, email text
);
CREATE INDEX IF NOT EXISTS contacts_client_idx ON contacts (client_id);

CREATE TABLE IF NOT EXISTS notes (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  body text NOT NULL,
  author text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_client_idx ON notes (client_id);

CREATE TABLE IF NOT EXISTS documents (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  text text NOT NULL,
  chars int NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_client_idx ON documents (client_id);

CREATE TABLE IF NOT EXISTS facts (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_label text,
  source_date date,
  snippet text,
  document_id int REFERENCES documents(id) ON DELETE SET NULL,
  confirmed_on date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facts_client_idx ON facts (client_id);

CREATE TABLE IF NOT EXISTS purchases (
  id bigserial PRIMARY KEY,
  client_id int REFERENCES clients(id) ON DELETE CASCADE,
  raw_client jsonb,
  raw_key text,
  order_ref text,
  order_date date,
  product text,
  quantity numeric,
  rate numeric,
  amount numeric,
  channel text,
  source text NOT NULL DEFAULT 'manual',
  extra jsonb NOT NULL DEFAULT '{}',
  row_hash text UNIQUE,
  import_id int REFERENCES imports(id) ON DELETE SET NULL,
  entered_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_client_idx ON purchases (client_id);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (order_date);
CREATE INDEX IF NOT EXISTS purchases_import_idx ON purchases (import_id);
CREATE INDEX IF NOT EXISTS purchases_unmatched_idx ON purchases (raw_key) WHERE client_id IS NULL;

CREATE TABLE IF NOT EXISTS client_aliases (
  alias_key text PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE
);

-- Where an import came from: an uploaded CSV, or a Google Sheet feed (see lib/sheets.js, lib/sheetSync.js).
ALTER TABLE imports ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'csv';

CREATE TABLE IF NOT EXISTS sheet_sources (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sheet_id text NOT NULL,
  tab text NOT NULL,
  mapping jsonb NOT NULL,
  options jsonb NOT NULL DEFAULT '{}',
  last_synced_at timestamptz,
  last_result jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Leads and prospects (from a Google Sheet leads feed) are clients with stage 'lead' until they order.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'client';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS import_id int REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_key text;
CREATE INDEX IF NOT EXISTS clients_lead_key_idx ON clients (lead_key) WHERE lead_key IS NOT NULL;
ALTER TABLE sheet_sources ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'purchases';

-- Which sheet rows a leads feed has already loaded, so reading the sheet again adds only what changed.
CREATE TABLE IF NOT EXISTS lead_rows (
  source_id int NOT NULL REFERENCES sheet_sources(id) ON DELETE CASCADE,
  row_hash text NOT NULL,
  client_id int REFERENCES clients(id) ON DELETE CASCADE,
  import_id int REFERENCES imports(id) ON DELETE SET NULL,
  PRIMARY KEY (source_id, row_hash)
);

CREATE TABLE IF NOT EXISTS import_mappings (
  source text PRIMARY KEY,
  mapping jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
