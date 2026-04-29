-- supabase/migrations/20260428000001_profiles.sql

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_path TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light','dark','system')),
  theme_accent TEXT NOT NULL DEFAULT 'default'
    CHECK (theme_accent IN ('default','blue','emerald','rose','amber','violet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self ON profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
