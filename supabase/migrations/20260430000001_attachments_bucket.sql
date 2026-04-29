-- supabase/migrations/20260430000001_attachments_bucket.sql

-- Create the attachments bucket (private, owner-scoped)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Read/write/delete only files whose first path segment is the user's auth.uid()
CREATE POLICY attachments_select ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY attachments_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY attachments_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
