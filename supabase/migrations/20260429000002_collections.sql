-- supabase/migrations/20260429000002_collections.sql

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  managed_by_connection TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collections_owner_idx ON collections (owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE TRIGGER collections_touch BEFORE UPDATE ON collections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY collections_owner ON collections FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

-- Now that collections exists, add the FK from pages.collection_id
ALTER TABLE pages ADD CONSTRAINT pages_collection_fk
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;

CREATE TABLE collection_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN
    ('text','number','currency','date','datetime','select','multi_select','checkbox')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collection_fields_collection_idx ON collection_fields (collection_id);

ALTER TABLE collection_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_fields_owner ON collection_fields FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

CREATE TABLE collection_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'user',
  source_external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collection_rows_collection_idx ON collection_rows (collection_id);
CREATE UNIQUE INDEX collection_rows_dedup_idx
  ON collection_rows (owner_type, owner_id, collection_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE TRIGGER collection_rows_touch BEFORE UPDATE ON collection_rows
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE collection_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_rows_owner ON collection_rows FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

CREATE TABLE collection_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'list' CHECK (type IN ('list')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE collection_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_views_owner ON collection_views FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());
