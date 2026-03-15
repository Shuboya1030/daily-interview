"""
AI Pulse — Main pipeline.

Usage:
    cd scrapers/
    python -m youtube.pipeline
"""
import sys
import logging
from datetime import datetime

from youtube.config import YOUTUBE_API_KEY, OPENAI_API_KEY
from youtube.discovery import discover_videos
from youtube.transcripts import fetch_transcript
from youtube.insights import extract_insights
from youtube.db import VideoDB

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("youtube.pipeline")


def run():
    """Execute the full AI Pulse pipeline."""
    logger.info("=" * 60)
    logger.info("AI Pulse Pipeline Started")
    logger.info("=" * 60)
    start = datetime.now()

    if not YOUTUBE_API_KEY:
        logger.error("YOUTUBE_API_KEY not set. Exiting.")
        return

    db = VideoDB()

    # ── Step 1: Discover videos ──────────────────────────────
    incremental = "--new-only" in sys.argv
    if incremental:
        logger.info("\n[1/4] Discovering NEW videos only (skipping existing channels)...")
    else:
        logger.info("\n[1/4] Discovering videos...")
    videos = discover_videos(skip_existing_channels=incremental)
    if not videos:
        logger.error("No videos discovered. Exiting.")
        return

    # ── Step 2: Store videos ─────────────────────────────────
    logger.info("\n[2/4] Storing videos in database...")
    count = db.upsert_videos(videos)
    logger.info(f"  Upserted {count} videos")

    # ── Step 3: Fetch transcripts ────────────────────────────
    logger.info("\n[3/4] Fetching transcripts...")
    need_transcripts = db.get_videos_without_transcripts()
    logger.info(f"  {len(need_transcripts)} videos need transcripts")

    transcript_count = 0
    for v in need_transcripts:
        t = fetch_transcript(v["video_id"])
        if t:
            db.insert_transcript(
                video_uuid=str(v["id"]),
                language=t["language"],
                full_text=t["full_text"],
                token_count=t["token_count"],
            )
            transcript_count += 1
    logger.info(f"  Fetched {transcript_count} transcripts")

    # ── Step 4: Extract insights ─────────────────────────────
    if OPENAI_API_KEY:
        logger.info("\n[4/4] Extracting insights with LLM...")
        need_insights = db.get_videos_without_insights()
        logger.info(f"  {len(need_insights)} videos need insight extraction")

        insight_count = 0
        from_transcript = 0
        from_metadata = 0
        for v in need_insights:
            video_dict = {
                "video_id": v["video_id"],
                "title": v["title"],
                "channel_name": v["channel_name"],
                "description": v.get("description", ""),
                "views": v.get("views", 0),
            }
            transcript = v.get("transcript_text")
            data = extract_insights(video_dict, transcript)
            if data:
                db.insert_insight(
                    video_uuid=str(v["id"]),
                    topic_summary=data["topic_summary"],
                    insights=data["insights"],
                    concepts=data["concepts"],
                    pm_relevance=data["pm_relevance"],
                )
                insight_count += 1
                if data.get("source") == "transcript":
                    from_transcript += 1
                else:
                    from_metadata += 1
        logger.info(
            f"  Extracted insights for {insight_count} videos "
            f"({from_transcript} from transcripts, {from_metadata} from metadata)"
        )
    else:
        logger.warning("  OPENAI_API_KEY not set -- skipping insight extraction")

    # ── Summary ──────────────────────────────────────────────
    stats = db.get_stats()
    duration = (datetime.now() - start).total_seconds()

    logger.info("\n" + "=" * 60)
    logger.info("AI Pulse Pipeline Complete!")
    logger.info("=" * 60)
    logger.info(f"  Videos:      {stats.get('youtube_videos', 0)}")
    logger.info(f"  Transcripts: {stats.get('video_transcripts', 0)}")
    logger.info(f"  Insights:    {stats.get('video_insights', 0)}")
    logger.info(f"  Duration:    {duration:.1f}s")
    logger.info("=" * 60)


if __name__ == "__main__":
    run()
