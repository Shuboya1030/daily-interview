-- Page Views Tracking Table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX idx_page_views_path ON page_views(path);
CREATE INDEX idx_page_views_visitor ON page_views(visitor_id);
CREATE INDEX idx_page_views_daily ON page_views(created_at::date);

-- Enable RLS
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anon (for tracking)
CREATE POLICY "Allow anon insert on page_views" ON page_views FOR INSERT WITH CHECK (true);

-- Allow select only via service role (for dashboard)
-- No public SELECT policy = only service_role can read
