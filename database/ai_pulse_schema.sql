-- AI Pulse Knowledge Base Schema
-- Extends the existing Daily Interview database

-- ==============================================
-- 1. YouTube Videos Table
-- ==============================================
CREATE TABLE IF NOT EXISTS youtube_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id VARCHAR(20) UNIQUE NOT NULL,    -- YouTube video ID (e.g., "dQw4w9WgXcQ")
  title TEXT NOT NULL,
  channel_name VARCHAR(200),
  channel_id VARCHAR(50),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  description TEXT,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  duration_seconds INT,
  published_at TIMESTAMP WITH TIME ZONE,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_relevant BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_youtube_videos_video_id ON youtube_videos(video_id);
CREATE INDEX idx_youtube_videos_channel ON youtube_videos(channel_name);
CREATE INDEX idx_youtube_videos_published ON youtube_videos(published_at DESC);
CREATE INDEX idx_youtube_videos_views ON youtube_videos(views DESC);

-- ==============================================
-- 2. Video Transcripts Table
-- ==============================================
CREATE TABLE IF NOT EXISTS video_transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES youtube_videos(id) ON DELETE CASCADE,
  language VARCHAR(10) DEFAULT 'en',
  full_text TEXT NOT NULL,
  token_count INT,
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(video_id, language)
);

CREATE INDEX idx_video_transcripts_video ON video_transcripts(video_id);

-- ==============================================
-- 3. Video Insights Table (LLM-extracted)
-- ==============================================
CREATE TABLE IF NOT EXISTS video_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES youtube_videos(id) ON DELETE CASCADE UNIQUE,
  topic_summary TEXT,                  -- 1-2 sentence summary
  insights JSONB,                      -- array of insight strings
  concepts TEXT[],                     -- e.g., ARRAY['RAG', 'fine-tuning', 'RLHF']
  pm_relevance FLOAT DEFAULT 0.5,     -- 0-1 relevance to PM interviews
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_video_insights_video ON video_insights(video_id);
CREATE INDEX idx_video_insights_concepts ON video_insights USING GIN(concepts);

-- ==============================================
-- 4. Sample Answers Table (for PM Interview Blend)
-- ==============================================
CREATE TABLE IF NOT EXISTS sample_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES merged_questions(id) ON DELETE CASCADE UNIQUE,
  answer_text TEXT NOT NULL,
  source_videos JSONB,                 -- [{video_id, title, url, relevance_score}]
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  model_used VARCHAR(50)
);

CREATE INDEX idx_sample_answers_question ON sample_answers(question_id);

-- ==============================================
-- 5. RLS Policies
-- ==============================================
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on youtube_videos" ON youtube_videos FOR SELECT USING (true);
CREATE POLICY "Allow public read on video_transcripts" ON video_transcripts FOR SELECT USING (true);
CREATE POLICY "Allow public read on video_insights" ON video_insights FOR SELECT USING (true);
CREATE POLICY "Allow public read on sample_answers" ON sample_answers FOR SELECT USING (true);

-- ==============================================
-- 6. Validation
-- ==============================================
DO $$
BEGIN
  RAISE NOTICE 'AI Pulse schema created successfully!';
  RAISE NOTICE 'Tables: youtube_videos, video_transcripts, video_insights, sample_answers';
END $$;
