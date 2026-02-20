"""Summarize video transcripts into ~400 word summaries with relevance scoring.

Writes summaries + relevance scores to video_summaries DB table (incremental).
Also saves to video_summaries.json for backward compatibility.
"""
import json
import os
import sys

from dotenv import load_dotenv
load_dotenv()
load_dotenv('../.env.local')

import psycopg2
from psycopg2.extras import RealDictCursor
from openai import OpenAI

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor(cursor_factory=RealDictCursor)

# Get all transcripts with video info (include DB UUID as db_id)
cur.execute('''
    SELECT yv.id as db_id, yv.video_id, yv.title, yv.channel_name, yv.url, yv.views,
           vt.full_text, vt.token_count
    FROM youtube_videos yv
    JOIN video_transcripts vt ON yv.id = vt.video_id
    ORDER BY yv.views DESC
''')
all_videos = cur.fetchall()

# Check which videos already have summaries (incremental)
cur.execute('SELECT video_id FROM video_summaries')
existing_ids = {row['video_id'] for row in cur.fetchall()}

videos = [v for v in all_videos if v['db_id'] not in existing_ids]
print(f"Total videos with transcripts: {len(all_videos)}")
print(f"Already summarized: {len(existing_ids)}")
print(f"New to process: {len(videos)}\n")

if not videos:
    print("Nothing new to summarize. Loading existing summaries for report...")

SUMMARY_PROMPT = """Summarize this YouTube video transcript in 300-500 words. Focus on:
- Key concepts, frameworks, and ideas discussed
- Any AI/tech insights relevant to product managers
- Practical advice or mental models shared

Keep the summary factual and information-dense. Do NOT include filler phrases like "the video discusses" — just state the content directly.

Video: {title} by {channel}
Transcript:
{transcript}"""

RELEVANCE_PROMPT = """Rate how useful this video is for someone preparing for an AI Product Manager interview.

Consider:
- Does it cover AI concepts (LLMs, RAG, agents, fine-tuning, eval, etc.)?
- Does it offer PM frameworks, product thinking, or career advice?
- Would insights from this video help answer AI PM interview questions?

Videos that are purely tutorials (step-by-step how-to), entertainment, or off-topic tech news should score low.
Videos about AI strategy, PM skills, AI product design, or industry trends should score high.

Return ONLY a JSON object, nothing else:
{{"score": 0.X, "reason": "one sentence explanation"}}

Video: {title} by {channel}
Summary: {summary}"""

new_summaries = []
for i, v in enumerate(videos, 1):
    print(f"[{i}/{len(videos)}] {v['title'][:70]}...", end=" ", flush=True)

    transcript = v['full_text'][:60000]

    try:
        # Step 1: Generate summary
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": SUMMARY_PROMPT.format(
                    title=v['title'],
                    channel=v['channel_name'],
                    transcript=transcript,
                )
            }],
            temperature=0.2,
            max_tokens=700,
        )
        summary = resp.choices[0].message.content

        # Step 2: Rate relevance
        rel_resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": RELEVANCE_PROMPT.format(
                    title=v['title'],
                    channel=v['channel_name'],
                    summary=summary,
                )
            }],
            temperature=0.1,
            max_tokens=100,
        )
        rel_text = rel_resp.choices[0].message.content.strip()
        # Parse JSON response (strip markdown code blocks if present)
        try:
            import re as _re
            cleaned = _re.sub(r'^```(?:json)?\s*', '', rel_text)
            cleaned = _re.sub(r'\s*```$', '', cleaned).strip()
            rel_data = json.loads(cleaned)
            score = float(rel_data['score'])
            reason = rel_data.get('reason', '')
        except (json.JSONDecodeError, KeyError, ValueError):
            score = 0.5
            reason = 'Failed to parse relevance'

        if score > 0.7:
            category = 'high'
        elif score >= 0.4:
            category = 'medium'
        else:
            category = 'low'

        # Step 3: Write to DB
        cur.execute('''
            INSERT INTO video_summaries (video_id, summary_text, relevance_score, relevance_category, model_used)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (video_id) DO UPDATE SET
                summary_text = EXCLUDED.summary_text,
                relevance_score = EXCLUDED.relevance_score,
                relevance_category = EXCLUDED.relevance_category,
                model_used = EXCLUDED.model_used,
                summarized_at = NOW()
        ''', (str(v['db_id']), summary, score, category, 'gpt-4o-mini'))
        conn.commit()

        new_summaries.append({
            "video_id": v['video_id'],
            "title": v['title'],
            "channel": v['channel_name'],
            "url": v['url'],
            "views": v['views'],
            "summary": summary,
            "relevance_score": score,
            "relevance_category": category,
            "relevance_reason": reason,
        })

        word_count = len(summary.split())
        print(f"OK ({word_count} words, {category} {score:.2f}) — {reason}")
    except Exception as e:
        print(f"ERROR: {e}")

# Load existing summaries from DB for the full JSON export
cur.execute('''
    SELECT yv.video_id, yv.title, yv.channel_name as channel, yv.url, yv.views,
           vs.summary_text as summary, vs.relevance_score, vs.relevance_category
    FROM video_summaries vs
    JOIN youtube_videos yv ON yv.id = vs.video_id
    ORDER BY yv.views DESC
''')
all_summaries = cur.fetchall()

# Save all summaries to JSON (including previously existing ones)
output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'video_summaries.json')
json_data = []
for s in all_summaries:
    json_data.append({
        "video_id": s['video_id'],
        "title": s['title'],
        "channel": s['channel'],
        "url": s['url'],
        "views": s['views'],
        "summary": s['summary'],
        "relevance_score": s['relevance_score'],
        "relevance_category": s['relevance_category'],
    })

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(json_data, f, indent=2, ensure_ascii=False)

# Quality report
total = len(all_summaries)
high = sum(1 for s in all_summaries if s['relevance_category'] == 'high')
med = sum(1 for s in all_summaries if s['relevance_category'] == 'medium')
low = sum(1 for s in all_summaries if s['relevance_category'] == 'low')

print(f"\n{'='*60}")
print(f"QUALITY REPORT — Video Knowledge Base")
print(f"{'='*60}")
print(f"Total videos summarized: {total}")
print(f"  High relevance (>0.7):   {high:3d} ({high*100//total if total else 0}%)")
print(f"  Medium relevance (0.4-0.7): {med:3d} ({med*100//total if total else 0}%)")
print(f"  Low relevance (<0.4):    {low:3d} ({low*100//total if total else 0}%)")
print(f"{'='*60}")
print(f"Usable for answer generation (high+medium): {high+med} ({(high+med)*100//total if total else 0}%)")
print(f"Low quality / irrelevant: {low} ({low*100//total if total else 0}%)")

if low > 0:
    print(f"\nLow-relevance videos:")
    for s in all_summaries:
        if s['relevance_category'] == 'low':
            print(f"  - [{s['relevance_score']:.2f}] {s['title'][:80]} ({s['channel']})")

total_words = sum(len(s['summary'].split()) for s in all_summaries)
print(f"\nTotal summary words: {total_words:,} (~{total_words * 4 // 3:,} tokens)")
print(f"Saved {len(json_data)} summaries to video_summaries.json")

cur.close()
conn.close()
