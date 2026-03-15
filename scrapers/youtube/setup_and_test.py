"""
AI Pulse — One-command setup + test script.

Run from pm-interview-tracker/scrapers/:
    python -m youtube.setup_and_test

This script:
1. Creates the DB tables (if not exist)
2. Discovers videos from starter channels
3. Fetches transcripts
4. Prints a summary of what was collected
"""
import os
import sys
import json
import logging
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()
load_dotenv('../.env.local')

DATABASE_URL = os.getenv('DATABASE_URL')
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Check .env.local")
    sys.exit(1)
if not YOUTUBE_API_KEY:
    print("ERROR: YOUTUBE_API_KEY not set. Check .env.local")
    sys.exit(1)

import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("setup_and_test")


def step1_migrate_db():
    """Create AI Pulse tables if they don't exist."""
    logger.info("=" * 60)
    logger.info("STEP 1: Database migration")
    logger.info("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    schema_path = os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'ai_pulse_schema.sql')
    with open(schema_path, 'r') as f:
        sql = f.read()

    cur.execute(sql)
    conn.commit()

    # Verify
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('youtube_videos', 'video_transcripts', 'video_insights', 'sample_answers')
        ORDER BY table_name
    """)
    tables = [row[0] for row in cur.fetchall()]
    cur.close()
    conn.close()

    for t in tables:
        logger.info(f"  Table: {t} ✓")
    logger.info(f"  {len(tables)} tables ready\n")
    return len(tables) == 4


def step2_discover_videos():
    """Fetch videos from starter channels."""
    logger.info("=" * 60)
    logger.info("STEP 2: Discover videos from YouTube")
    logger.info("=" * 60)

    from youtube.discovery import discover_videos
    videos = discover_videos()

    logger.info(f"\n  Discovered {len(videos)} videos total")

    # Show top 10 by views
    videos.sort(key=lambda v: v.get('views', 0), reverse=True)
    logger.info("\n  Top 10 by views:")
    for v in videos[:10]:
        logger.info(
            f"    [{v['video_id']}] {v['title'][:60]}"
            f"  | {v.get('views',0):,} views | {v.get('likes',0):,} likes"
        )
    print()
    return videos


def step3_store_videos(videos):
    """Store videos in database."""
    logger.info("=" * 60)
    logger.info("STEP 3: Store videos in database")
    logger.info("=" * 60)

    from youtube.db import VideoDB
    count = VideoDB.upsert_videos(videos)
    logger.info(f"  Upserted {count} videos\n")
    return count


def step4_fetch_transcripts():
    """Fetch transcripts for videos without them."""
    logger.info("=" * 60)
    logger.info("STEP 4: Fetch transcripts")
    logger.info("=" * 60)

    from youtube.db import VideoDB
    from youtube.transcripts import fetch_transcript

    need = VideoDB.get_videos_without_transcripts()
    logger.info(f"  {len(need)} videos need transcripts")

    success = 0
    failed = 0
    for v in need:
        t = fetch_transcript(v['video_id'])
        if t:
            VideoDB.insert_transcript(
                video_uuid=str(v['id']),
                language=t['language'],
                full_text=t['full_text'],
                token_count=t['token_count'],
            )
            success += 1
            logger.info(
                f"  ✓ {v['title'][:50]}... "
                f"({t['token_count']:,} tokens, lang={t['language']})"
            )
        else:
            failed += 1
            logger.info(f"  ✗ {v['title'][:50]}... (no transcript)")

    logger.info(f"\n  Transcripts fetched: {success}, skipped: {failed}\n")
    return success


def step5_summary():
    """Print final DB stats."""
    logger.info("=" * 60)
    logger.info("SUMMARY")
    logger.info("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT COUNT(*) as n FROM youtube_videos")
    videos = cur.fetchone()['n']

    cur.execute("SELECT COUNT(*) as n FROM video_transcripts")
    transcripts = cur.fetchone()['n']

    cur.execute("SELECT COUNT(*) as n FROM video_insights")
    insights = cur.fetchone()['n']

    # Show a few sample transcripts with lengths
    cur.execute("""
        SELECT yv.title, yv.channel_name, yv.views, vt.token_count, vt.language
        FROM youtube_videos yv
        JOIN video_transcripts vt ON yv.id = vt.video_id
        ORDER BY yv.views DESC
        LIMIT 5
    """)
    samples = cur.fetchall()

    cur.close()
    conn.close()

    logger.info(f"  Videos in DB:      {videos}")
    logger.info(f"  Transcripts in DB: {transcripts}")
    logger.info(f"  Insights in DB:    {insights}")

    if samples:
        logger.info("\n  Sample transcripts:")
        for s in samples:
            logger.info(
                f"    {s['title'][:50]}... | {s['channel_name']} | "
                f"{s['views']:,} views | {s['token_count']:,} tokens ({s['language']})"
            )

    logger.info("\n" + "=" * 60)
    logger.info("Setup & test complete!")
    logger.info("=" * 60)


if __name__ == "__main__":
    start = datetime.now()

    step1_migrate_db()
    videos = step2_discover_videos()
    step3_store_videos(videos)
    step4_fetch_transcripts()
    step5_summary()

    duration = (datetime.now() - start).total_seconds()
    logger.info(f"Total time: {duration:.1f}s")
