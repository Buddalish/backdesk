-- supabase/migrations/20260429000003_collection_views_index.sql
CREATE INDEX collection_views_collection_idx ON collection_views (collection_id);
