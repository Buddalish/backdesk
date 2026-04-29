-- supabase/migrations/20260429000001_pages.sql

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  emoji TEXT,
  page_type TEXT NOT NULL CHECK (page_type IN ('dashboard','collection')),
  document JSONB,
  collection_id UUID,                        -- FK added in Task 3 (after collections table exists)
  sort_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pages_type_check CHECK (
    (page_type = 'dashboard' AND document IS NOT NULL AND collection_id IS NULL) OR
    (page_type = 'collection' AND document IS NULL AND collection_id IS NOT NULL)
  )
);

CREATE INDEX pages_owner_idx ON pages (owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX pages_collection_idx ON pages (collection_id) WHERE collection_id IS NOT NULL;

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY pages_owner ON pages FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pages_touch_updated_at BEFORE UPDATE ON pages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
