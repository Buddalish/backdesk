-- Replace the partial unique index with a full unique index so that
-- PostgREST / Supabase .upsert({ onConflict: "..." }) can resolve the conflict
-- target at the API layer.
--
-- A partial unique index (WHERE source_external_id IS NOT NULL) cannot be used with
-- ON CONFLICT (columns) in PostgreSQL — the conflict target must exactly describe the
-- index, which PostgREST does not support. A full unique index works because
-- PostgreSQL's NULL semantics (NULL != NULL) naturally allow multiple rows whose
-- source_external_id is NULL, which is exactly what we want for user-created rows.

DROP INDEX IF EXISTS collection_rows_dedup_idx;

CREATE UNIQUE INDEX collection_rows_dedup_idx
  ON collection_rows (owner_type, owner_id, collection_id, source_external_id);
