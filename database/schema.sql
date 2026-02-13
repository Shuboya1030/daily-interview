-- Daily Interview Database Schema
-- PostgreSQL / Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- 1. Companies Table
-- ==============================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(20),  -- 'FAANG', 'Unicorn', 'Big Tech'
  industry VARCHAR(50),  -- 'Fintech', 'AI', 'Health', etc.
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_type ON companies(type);

-- Insert initial companies from company_taxonomy.json
INSERT INTO companies (name, type, industry) VALUES
  ('Google', 'FAANG', 'Search & Cloud'),
  ('Meta', 'FAANG', 'Social Media'),
  ('Amazon', 'FAANG', 'E-commerce & Cloud'),
  ('Apple', 'FAANG', 'Consumer Electronics'),
  ('Microsoft', 'FAANG', 'Office & Cloud'),
  ('Netflix', 'FAANG', 'Streaming'),
  ('Stripe', 'Unicorn', 'Fintech'),
  ('OpenAI', 'Unicorn', 'AI'),
  ('Anthropic', 'Unicorn', 'AI'),
  ('Databricks', 'Unicorn', 'Data & Analytics'),
  ('Airbnb', 'Unicorn', 'Travel & Hospitality'),
  ('Uber', 'Unicorn', 'Transportation'),
  ('LinkedIn', 'Big Tech', 'Professional Network'),
  ('Salesforce', 'Big Tech', 'CRM & SaaS')
ON CONFLICT (name) DO NOTHING;

-- ==============================================
-- 2. Raw Questions Table (爬取的原始数据)
-- ==============================================
CREATE TABLE IF NOT EXISTS raw_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  source VARCHAR(50) NOT NULL,  -- 'pm_exercises', 'nowcoder', 'stellarpeers'
  source_url TEXT NOT NULL,
  company VARCHAR(100),  -- 直接存储公司名称（爬取时的原始值）
  question_type VARCHAR(50),  -- 'Behavioral', 'Product Design', 'Metrics', etc.
  metadata JSONB,  -- 灵活存储：答案数、浏览量、标签等
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE,  -- 题目发布时间（如果能获取）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_raw_questions_source ON raw_questions(source);
CREATE INDEX idx_raw_questions_company ON raw_questions(company);
CREATE INDEX idx_raw_questions_type ON raw_questions(question_type);
CREATE INDEX idx_raw_questions_published ON raw_questions(published_at DESC NULLS LAST);
CREATE INDEX idx_raw_questions_scraped ON raw_questions(scraped_at DESC);

-- GIN index for JSONB metadata search
CREATE INDEX idx_raw_questions_metadata ON raw_questions USING GIN(metadata);

-- ==============================================
-- 3. Merged Questions Table (合并后的高频题)
-- ==============================================
CREATE TABLE IF NOT EXISTS merged_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_content TEXT NOT NULL,  -- 标准版本的题目内容（选择最完整的）
  frequency INT DEFAULT 1 NOT NULL,  -- 出现次数
  question_type VARCHAR(50),  -- 题型
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for sorting and filtering
CREATE INDEX idx_merged_questions_frequency ON merged_questions(frequency DESC);
CREATE INDEX idx_merged_questions_type ON merged_questions(question_type);
CREATE INDEX idx_merged_questions_updated ON merged_questions(updated_at DESC);

-- Full-text search index
CREATE INDEX idx_merged_questions_content_fts ON merged_questions USING GIN(to_tsvector('english', canonical_content));

-- ==============================================
-- 4. Question Mappings Table (原始题目 <-> 合并题目)
-- ==============================================
CREATE TABLE IF NOT EXISTS question_mappings (
  raw_question_id UUID REFERENCES raw_questions(id) ON DELETE CASCADE,
  merged_question_id UUID REFERENCES merged_questions(id) ON DELETE CASCADE,
  similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (raw_question_id, merged_question_id)
);

-- Indexes for JOIN operations
CREATE INDEX idx_question_mappings_raw ON question_mappings(raw_question_id);
CREATE INDEX idx_question_mappings_merged ON question_mappings(merged_question_id);

-- ==============================================
-- 5. Question-Company Relationship (题目-公司关联)
-- ==============================================
CREATE TABLE IF NOT EXISTS question_companies (
  merged_question_id UUID REFERENCES merged_questions(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (merged_question_id, company_id)
);

-- Indexes for filtering
CREATE INDEX idx_question_companies_merged ON question_companies(merged_question_id);
CREATE INDEX idx_question_companies_company ON question_companies(company_id);

-- ==============================================
-- 6. Helpful Views
-- ==============================================

-- View: Questions with all metadata
CREATE OR REPLACE VIEW v_questions_full AS
SELECT
  mq.id,
  mq.canonical_content,
  mq.frequency,
  mq.question_type,
  mq.updated_at,
  -- Aggregate companies
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'type', c.type,
        'industry', c.industry
      )
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'::json
  ) as companies,
  -- Aggregate sources
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'source', rq.source,
        'source_url', rq.source_url,
        'published_at', rq.published_at
      )
    ) FILTER (WHERE rq.id IS NOT NULL),
    '[]'::json
  ) as sources,
  -- Count of raw questions
  COUNT(DISTINCT rq.id) as source_count
FROM merged_questions mq
LEFT JOIN question_mappings qm ON mq.id = qm.merged_question_id
LEFT JOIN raw_questions rq ON qm.raw_question_id = rq.id
LEFT JOIN question_companies qc ON mq.id = qc.merged_question_id
LEFT JOIN companies c ON qc.company_id = c.id
GROUP BY mq.id, mq.canonical_content, mq.frequency, mq.question_type, mq.updated_at;

-- ==============================================
-- 7. Utility Functions
-- ==============================================

-- Function: Update merged_question frequency
CREATE OR REPLACE FUNCTION update_merged_question_frequency()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE merged_questions
  SET
    frequency = (
      SELECT COUNT(*)
      FROM question_mappings
      WHERE merged_question_id = NEW.merged_question_id
    ),
    updated_at = NOW()
  WHERE id = NEW.merged_question_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update frequency on new mapping
CREATE TRIGGER trigger_update_frequency
AFTER INSERT OR DELETE ON question_mappings
FOR EACH ROW
EXECUTE FUNCTION update_merged_question_frequency();

-- ==============================================
-- 8. Row Level Security (RLS) - Optional for Supabase
-- ==============================================

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merged_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_companies ENABLE ROW LEVEL SECURITY;

-- Allow public read access (适合公开网站)
CREATE POLICY "Allow public read on companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Allow public read on raw_questions" ON raw_questions FOR SELECT USING (true);
CREATE POLICY "Allow public read on merged_questions" ON merged_questions FOR SELECT USING (true);
CREATE POLICY "Allow public read on question_mappings" ON question_mappings FOR SELECT USING (true);
CREATE POLICY "Allow public read on question_companies" ON question_companies FOR SELECT USING (true);

-- Only service role can write (爬虫使用service role key)
-- This is handled by Supabase automatically

-- ==============================================
-- 9. Initial Data Validation
-- ==============================================

-- Check tables created successfully
DO $$
BEGIN
  RAISE NOTICE 'Schema created successfully!';
  RAISE NOTICE 'Tables: companies, raw_questions, merged_questions, question_mappings, question_companies';
  RAISE NOTICE 'Views: v_questions_full';
  RAISE NOTICE 'Initial companies inserted: %', (SELECT COUNT(*) FROM companies);
END $$;
