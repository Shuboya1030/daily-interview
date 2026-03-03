-- RAG Schema: pgvector extension + transcript_chunks table + similarity search
-- Run this in Supabase SQL Editor

-- ==============================================
-- 1. Enable pgvector extension
-- ==============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================
-- 2. Transcript Chunks Table
-- ==============================================
CREATE TABLE IF NOT EXISTS transcript_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(video_id, chunk_index)
);

-- ==============================================
-- 3. Indexes
-- ==============================================
CREATE INDEX idx_transcript_chunks_video ON transcript_chunks(video_id);

-- IVFFlat index for approximate nearest neighbor search
-- 100 lists is appropriate for ~1000-3000 chunks
CREATE INDEX idx_transcript_chunks_embedding ON transcript_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ==============================================
-- 4. RLS Policies
-- ==============================================
ALTER TABLE transcript_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on transcript_chunks"
  ON transcript_chunks FOR SELECT USING (true);

-- ==============================================
-- 5. Similarity Search RPC Function
-- ==============================================
CREATE OR REPLACE FUNCTION match_transcript_chunks(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  video_id UUID,
  chunk_index INT,
  chunk_text TEXT,
  token_count INT,
  similarity FLOAT,
  video_title TEXT,
  channel_name VARCHAR(200),
  video_url TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.video_id,
    tc.chunk_index,
    tc.chunk_text,
    tc.token_count,
    (1 - (tc.embedding <=> query_embedding))::FLOAT AS similarity,
    yv.title AS video_title,
    yv.channel_name,
    yv.url AS video_url
  FROM transcript_chunks tc
  JOIN youtube_videos yv ON tc.video_id = yv.id
  WHERE 1 - (tc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY tc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
