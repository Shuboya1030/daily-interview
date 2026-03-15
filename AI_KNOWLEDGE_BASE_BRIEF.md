# Product Brief: AI Knowledge Base + Sample Answers

## Problem

PM candidates interviewing for AI-focused roles face "AI Domain Knowledge" questions (e.g., "Explain how recommendation systems work", "What are the tradeoffs of fine-tuning vs RAG?"). These questions require up-to-date understanding of rapidly evolving AI concepts — not textbook answers, but the kind of high-level intuition that comes from following the field closely.

Currently, PM Interview Blend surfaces these questions but offers no guidance on how to answer them. Meanwhile, top AI educators on YouTube produce excellent content explaining these concepts, but candidates don't know which videos are relevant to which interview questions.

## Vision

Two connected systems:

1. **AI Pulse** (working name) — A standalone knowledge base website that curates the best AI YouTube content, extracts high-level insights from transcripts, and presents them in a searchable, browsable format with engagement metrics.

2. **Sample Answers on PM Interview Blend** — For every "AI Domain Knowledge" question, generate a synthesized answer backed by real YouTube sources, displayed directly on the question detail page.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  DATA PIPELINE                       │
│  (GitHub Actions — daily cron)                       │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────┐  │
│  │ YouTube   │──▶│Transcript│──▶│ LLM Insight     │  │
│  │ Discovery │   │Extraction│   │ Extraction      │  │
│  └──────────┘   └──────────┘   └────────┬────────┘  │
│                                          │           │
│                              ┌───────────▼────────┐  │
│                              │  Supabase DB       │  │
│                              │  (shared with      │  │
│                              │   PM Interview     │  │
│                              │   Blend)           │  │
│                              └───────┬──────┬─────┘  │
│                                      │      │        │
│  ┌───────────────────────────────────┘      │        │
│  │  Question ↔ Insight Matching             │        │
│  │  + Sample Answer Generation              │        │
│  └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────────────┐
│  AI Pulse        │       │  PM Interview Blend      │
│  (standalone     │       │  (existing site)         │
│   website)       │       │                          │
│                  │       │  Question Detail:        │
│  Browse videos   │       │  ┌────────────────────┐  │
│  View insights   │       │  │ Sample Answer      │  │
│  See metrics     │       │  │ (AI Domain Know.)  │  │
│                  │       │  │ Sources: [YT][YT]  │  │
└──────────────────┘       │  └────────────────────┘  │
                           └──────────────────────────┘
```

---

## Feature List

### F1 — YouTube Video Discovery & Ingestion
Discover and store high-quality AI videos daily.

- **F1.1** Starter channel list — curated list of AI YouTubers (user-maintained config file)
- **F1.2** YouTube Data API search — daily search for top AI videos by relevance + engagement
- **F1.3** Engagement metrics storage — views, likes, comments, publish date per video
- **F1.4** Daily refresh cron — GitHub Actions workflow, fetch top 50 new videos/day
- **F1.5** Deduplication — detect same video across searches (by video ID, title similarity)

**Technical notes:**
- YouTube Data API v3 — free tier: 10,000 quota units/day
- Search = 100 units, video details = 1 unit → ~100 searches + 5,000 detail lookups/day
- Store: video_id, title, channel, url, thumbnail, views, likes, comments, published_at, description

### F2 — Transcript Extraction
Fetch and store video transcripts for downstream LLM processing.

- **F2.1** Auto-caption extraction — use `youtube-transcript-api` (Python, free, no API key)
- **F2.2** Language handling — prefer English captions; fallback to auto-generated
- **F2.3** Transcript storage — full text in DB, linked to video record
- **F2.4** Retry/skip logic — handle videos with no captions gracefully

**Technical notes:**
- `youtube-transcript-api` is free and doesn't consume YouTube API quota
- Average transcript: 5,000–20,000 tokens (~10–20KB text)
- Storage: 50 videos/day × 15KB = ~22MB/month (well within Supabase free tier)

### F3 — AI Insight Extraction
Process transcripts with LLM to extract high-level insights.

- **F3.1** Topic identification — what is this video fundamentally about? (1–2 sentence summary)
- **F3.2** Insight extraction — 3–8 high-level abstractions per video
  - Example: "RAG is preferable to fine-tuning when the knowledge base changes frequently"
  - NOT: "Step 1: install LangChain, Step 2: configure vector store"
- **F3.3** Concept tagging — extract key AI concepts mentioned (e.g., "RAG", "transformers", "RLHF")
- **F3.4** Relevance scoring — rate how relevant each video is to PM interviews (vs pure engineering)

**Technical notes:**
- GPT-4o-mini for cost efficiency (~$3–5/month for 50 videos/day)
- Prompt engineering critical: must extract *intuition-level* understanding, not tutorials
- Chunk long transcripts if >128K context

### F4 — AI Pulse Website (Knowledge Base)
Standalone website to browse the curated video knowledge base.

- **F4.1** Video list page — all videos with title, channel, thumbnail, metrics (views/likes)
- **F4.2** Sort & filter — by date, views, likes, topic/concept, channel
- **F4.3** Video detail page — topic summary, all extracted insights, engagement metrics, link to YouTube
- **F4.4** Search — full-text search across video titles, topics, and insights
- **F4.5** Daily freshness indicator — show when knowledge base was last updated

**Technical notes:**
- Separate Next.js app (or subdomain), same Supabase DB
- Same cream/orange theme as PM Interview Blend for brand consistency
- Can share Vercel project or separate deployment

### F5 — Question ↔ Knowledge Matching
Semantically link AI Domain Knowledge questions to relevant video insights.

- **F5.1** Embedding generation — embed all video insights + all AI Domain Knowledge questions
- **F5.2** Semantic search — for each question, find top-N most relevant insights
- **F5.3** Relevance threshold — only match above cosine similarity threshold
- **F5.4** Daily refresh — re-match when new videos or questions are added

**Technical notes:**
- Reuse existing `text-embedding-3-small` model from current pipeline
- Could use pgvector in Supabase for vector search (or compute offline in Python)
- Match questions to *insights* (not raw transcripts) for precision

### F6 — Sample Answer Generation
Generate synthesized answers for AI Domain Knowledge questions.

- **F6.1** Context assembly — gather top-matched insights as context for each question
- **F6.2** Answer synthesis — LLM generates a concise, high-level answer using matched insights
- **F6.3** Source citation — each answer lists which YouTube videos contributed
- **F6.4** Answer storage — cache generated answers in DB (regenerate when sources change)
- **F6.5** Quality guardrails — answers must be abstract/conceptual, not copy-paste from transcripts

**Technical notes:**
- GPT-4o-mini or GPT-4o for answer generation
- Prompt: "You are a PM interview coach. Using these insights from industry experts, craft a concise answer that demonstrates high-level understanding..."
- Store in `sample_answers` table linked to merged_question_id

### F7 — PM Interview Blend Integration
Display sample answers on the existing question detail page.

- **F7.1** Answer display — show sample answer on question detail page (AI Domain Knowledge only)
- **F7.2** Source links — list cited YouTube videos with title, channel, thumbnail
- **F7.3** Cross-link to AI Pulse — "Learn more on AI Pulse" link to full video detail
- **F7.4** Freshness indicator — show when the answer was last generated/updated

---

## Database Schema (New Tables)

```sql
-- Videos discovered from YouTube
youtube_videos (
  id              UUID PRIMARY KEY,
  video_id        VARCHAR UNIQUE,        -- YouTube video ID
  title           TEXT,
  channel_name    VARCHAR,
  channel_id      VARCHAR,
  url             TEXT,
  thumbnail_url   TEXT,
  description     TEXT,
  views           BIGINT,
  likes           BIGINT,
  comments        BIGINT,
  published_at    TIMESTAMP,
  discovered_at   TIMESTAMP,
  is_relevant     BOOLEAN DEFAULT true   -- passes PM-relevance filter
)

-- Raw transcripts
video_transcripts (
  id              UUID PRIMARY KEY,
  video_id        UUID REFERENCES youtube_videos(id),
  language        VARCHAR DEFAULT 'en',
  full_text       TEXT,
  token_count     INT,
  extracted_at    TIMESTAMP
)

-- LLM-extracted insights per video
video_insights (
  id              UUID PRIMARY KEY,
  video_id        UUID REFERENCES youtube_videos(id),
  topic_summary   TEXT,                  -- 1-2 sentence topic
  insights        JSONB,                 -- array of insight strings
  concepts        TEXT[],                -- e.g., ["RAG", "fine-tuning", "RLHF"]
  pm_relevance    FLOAT,                 -- 0-1 relevance to PM interviews
  processed_at    TIMESTAMP
)

-- Embeddings for semantic matching
insight_embeddings (
  id              UUID PRIMARY KEY,
  video_id        UUID REFERENCES youtube_videos(id),
  insight_index   INT,                   -- which insight in the array
  embedding       VECTOR(1536),          -- text-embedding-3-small
  created_at      TIMESTAMP
)

-- Generated sample answers
sample_answers (
  id              UUID PRIMARY KEY,
  question_id     UUID REFERENCES merged_questions(id),
  answer_text     TEXT,
  source_videos   JSONB,                 -- [{video_id, title, url, relevance}]
  generated_at    TIMESTAMP,
  model_used      VARCHAR
)
```

---

## MVP vs Full Vision

### MVP (Recommended Scope)

| Feature | Scope | Rationale |
|---------|-------|-----------|
| **F1** Video Discovery | Starter channels only (no broad search) | Simpler, higher quality, no YouTube search quota concerns |
| **F2** Transcripts | Full | Required for everything downstream |
| **F3** Insights | Full | Core value proposition |
| **F4** AI Pulse Website | List + detail pages only (no search) | Enough to browse and validate content quality |
| **F5** Matching | Basic: embed insights, match to questions | Core integration |
| **F6** Sample Answers | Full | The user-facing payoff |
| **F7** Integration | Answer display + source links | Minimal viable integration |

**MVP cuts:**
- No broad YouTube search (use starter channels only → simpler, higher signal)
- No full-text search on AI Pulse (browse/filter only)
- No engagement metric tracking over time (snapshot only)
- No cross-link from AI Pulse → PM Interview Blend questions
- No user ratings or feedback on answers

### Phase 2 (Post-MVP)

- Broad YouTube search for top 50 trending AI videos
- Full-text search on AI Pulse
- Engagement metric trends (track views/likes over time)
- Cross-linking between the two sites
- Answer quality feedback (thumbs up/down)
- More video sources (podcasts, conference talks)
- Auto-detect new quality AI channels from trending content

---

## Cost Estimate (MVP)

| Service | Cost |
|---------|------|
| YouTube Data API | Free (10K units/day) |
| youtube-transcript-api | Free (no API key) |
| OpenAI (insight extraction) | ~$3–5/month |
| OpenAI (embeddings) | ~$1/month |
| OpenAI (answer generation) | ~$2–5/month |
| Supabase | Free tier (shared with existing) |
| Vercel (AI Pulse) | Free tier (hobby) |
| **Total** | **~$6–11/month additional** |

---

## Key Risks & Open Questions

1. **YouTube ToS** — Scraping transcripts is a gray area. `youtube-transcript-api` accesses public caption data. Risk is low but non-zero.
2. **Insight quality** — LLM extraction needs careful prompt engineering to get "PM-interview-level" insights vs generic summaries. Will need iteration.
3. **Starter channel list** — Quality of the entire system depends on curating the right channels. Need user input here.
4. **Transcript availability** — Some videos don't have captions. Auto-generated captions can be noisy. Need fallback strategy.
5. **Answer freshness** — AI field moves fast. How often should answers be regenerated? (Suggestion: weekly, or when new matching videos are added)
6. **Separate site vs section** — AI Pulse as standalone site adds deployment complexity. Alternative: `/knowledge` route in existing app.

---

## Implementation Order (Suggested)

```
Week 1:  F1 (video discovery) + F2 (transcripts) + DB schema
Week 2:  F3 (insight extraction) + F4 (AI Pulse website)
Week 3:  F5 (matching) + F6 (answer generation)
Week 4:  F7 (integration) + testing + polish
```

---

## What I Need From You

1. **Starter channel list** — Which AI YouTubers do you consider high-quality?
2. **Separate site or same site?** — AI Pulse as `ai-pulse.vercel.app` or `pm-interview-blend.vercel.app/knowledge`?
3. **YouTube Data API key** — You'll need a Google Cloud project with YouTube Data API v3 enabled
4. **MVP scope agreement** — Does the MVP cut above make sense, or do you want to adjust?
