-- supabase/migrations/20260430000002_connection_imports.sql

CREATE TABLE connection_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  connection TEXT NOT NULL,
  filename TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_added INT NOT NULL DEFAULT 0,
  rows_skipped_duplicate INT NOT NULL DEFAULT 0,
  rows_skipped_unsupported INT NOT NULL DEFAULT 0,
  pipeline_rows_created INT NOT NULL DEFAULT 0,
  pipeline_rows_updated INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('parsed','failed','partial')),
  error_message TEXT
);

CREATE INDEX connection_imports_owner_idx ON connection_imports (owner_type, owner_id, imported_at DESC);

ALTER TABLE connection_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY connection_imports_owner ON connection_imports FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());
