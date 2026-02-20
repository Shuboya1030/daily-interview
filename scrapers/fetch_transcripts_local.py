"""
Transcript fetcher — run from a personal computer (residential IP).

Usage:
    # Fetch all videos without transcripts (default)
    python fetch_transcripts_local.py

    # Fetch only specific channels
    python fetch_transcripts_local.py --channels "Lenny's Podcast" "Peter Yang"

    # Discover + fetch new videos from YouTube channels
    python fetch_transcripts_local.py --discover "Lenny's Podcast" "Peter Yang"

Setup:
    pip install youtube-transcript-api psycopg2-binary requests
"""

import argparse
import http.cookiejar
import os
import sys
import time

from dotenv import load_dotenv
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env.local'))

DATABASE_URL = os.getenv('DATABASE_URL',
    "postgresql://postgres.qaieagvlhdvcrdcmchrd:8Y3qw.pvGGxYzxf@aws-1-us-east-2.pooler.supabase.com:5432/postgres")
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY', '')
COOKIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies.txt")

# ── Dependencies check ────────────────────────────────────────
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Missing psycopg2. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("Missing requests. Run: pip install requests")
    sys.exit(1)

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    print("Missing youtube-transcript-api. Run: pip install youtube-transcript-api")
    sys.exit(1)

# ── Initialize API (with cookies if available) ────────────────
if os.path.exists(COOKIES_FILE):
    print(f"Loading cookies from: {COOKIES_FILE}")
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    })
    count = 0
    with open(COOKIES_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                domain, _, path, secure, _, name, value = parts[:7]
                session.cookies.set(name, value, domain=domain, path=path)
                count += 1
    print(f"  Loaded {count} cookies")
    api = YouTubeTranscriptApi(http_client=session)
else:
    print("No cookies.txt found — running without cookies")
    api = YouTubeTranscriptApi()


# ── Channel ID mapping (name -> YouTube channel ID) ───────────
# Add more channels here as needed
CHANNEL_IDS = {
    "Lenny's Podcast": "UCsYMk_FCTGBxmwKFiCynFwA",
    "Peter Yang": "UC1MHdSKSMnMk4Fk0lVOJ7dg",
    "Jeff Su": "UC-cqJZBUg3raaEkgIEBOXPQ",
    "AI Explained": "UCNJ1Ymd5yFuUPtn21xtRbbw",
    "IBM Technology": "UCKWaEZ-_VweaEx1j62do_vQ",
    "Y Combinator": "UCcefcZRL2oaA_uBNeo5UOWg",
    "a16z": "UCM4GYACzXMRKPFHLGJqCFEg",
    "Two Minute Papers": "UCbfYPyITQ-7l4upoX8nvctg",
}


def discover_channel_videos(channel_name, cur, conn):
    """Use YouTube Data API v3 to discover recent videos from a channel
    and insert new ones into youtube_videos (with dedup)."""
    if not YOUTUBE_API_KEY:
        print(f"  No YOUTUBE_API_KEY set — cannot discover videos for {channel_name}")
        return 0

    channel_id = CHANNEL_IDS.get(channel_name)
    if not channel_id:
        print(f"  Unknown channel: {channel_name}. Add its ID to CHANNEL_IDS in the script.")
        return 0

    # Get existing video_ids for this channel to deduplicate
    cur.execute("SELECT video_id FROM youtube_videos WHERE channel_name = %s", (channel_name,))
    existing_ids = {r['video_id'] for r in cur.fetchall()}
    print(f"  {channel_name}: {len(existing_ids)} videos already in DB")

    # Fetch from YouTube Data API (up to 50 recent videos)
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "key": YOUTUBE_API_KEY,
        "channelId": channel_id,
        "part": "snippet",
        "type": "video",
        "order": "date",
        "maxResults": 50,
    }

    try:
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  YouTube API error: {e}")
        return 0

    new_count = 0
    for item in data.get("items", []):
        vid = item["id"]["videoId"]
        if vid in existing_ids:
            continue

        snippet = item["snippet"]
        title = snippet.get("title", "")
        description = snippet.get("description", "")
        published_at = snippet.get("publishedAt")
        thumbnail = snippet.get("thumbnails", {}).get("high", {}).get("url", "")

        # Get video stats (views, likes, duration)
        stats = get_video_stats(vid)

        cur.execute("""
            INSERT INTO youtube_videos (video_id, title, channel_name, channel_id, url,
                                        thumbnail_url, description, views, likes,
                                        duration_seconds, published_at, is_relevant)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true)
            ON CONFLICT (video_id) DO NOTHING
        """, (
            vid, title, channel_name, channel_id,
            f"https://www.youtube.com/watch?v={vid}",
            thumbnail, description,
            stats.get("views", 0), stats.get("likes", 0),
            stats.get("duration", 0), published_at,
        ))
        new_count += 1

    conn.commit()
    print(f"  Discovered {new_count} new videos from {channel_name}")
    return new_count


def get_video_stats(video_id):
    """Fetch view count, likes, and duration for a single video."""
    if not YOUTUBE_API_KEY:
        return {}
    try:
        url = "https://www.googleapis.com/youtube/v3/videos"
        resp = requests.get(url, params={
            "key": YOUTUBE_API_KEY,
            "id": video_id,
            "part": "statistics,contentDetails",
        })
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return {}
        stats = items[0].get("statistics", {})
        content = items[0].get("contentDetails", {})
        duration = parse_duration(content.get("duration", "PT0S"))
        return {
            "views": int(stats.get("viewCount", 0)),
            "likes": int(stats.get("likeCount", 0)),
            "duration": duration,
        }
    except Exception:
        return {}


def parse_duration(iso_duration):
    """Parse ISO 8601 duration (PT1H2M3S) to seconds."""
    import re
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso_duration)
    if not m:
        return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def fetch_transcript(video_id):
    """Fetch transcript for a single video. Returns dict or None."""
    try:
        transcript_list = api.list(video_id)

        transcript = None
        lang = "en"

        # Try manually created English
        try:
            transcript = transcript_list.find_manually_created_transcript(["en"])
        except Exception:
            pass

        # Try auto-generated English
        if transcript is None:
            try:
                transcript = transcript_list.find_generated_transcript(["en"])
                lang = "en-auto"
            except Exception:
                pass

        # Fall back to any language
        if transcript is None:
            for t in transcript_list:
                transcript = t
                lang = t.language_code
                break

        if transcript is None:
            return None

        entries = transcript.fetch()
        full_text = " ".join(e.text for e in entries)
        token_count = len(full_text) // 4
        return {"language": lang, "full_text": full_text, "token_count": token_count}

    except Exception as e:
        err = str(e).lower()
        if "blocking" in err or "blocked" in err or "bot" in err or "sign in" in err or "ip" in err:
            return "BLOCKED"
        if "no transcript" in err or "subtitles are disabled" in err:
            return None
        print(f"  Error: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Fetch YouTube transcripts")
    parser.add_argument("--channels", nargs="+", help="Only fetch transcripts for these channels")
    parser.add_argument("--discover", nargs="+", help="Discover new videos from these channels first, then fetch transcripts")
    args = parser.parse_args()

    print("Connecting to Supabase...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Step 0: Discover new videos if requested
    if args.discover:
        print(f"\n=== Discovering new videos from: {', '.join(args.discover)} ===\n")
        total_new = 0
        for ch in args.discover:
            total_new += discover_channel_videos(ch, cur, conn)
        print(f"\nTotal new videos discovered: {total_new}\n")

    # Step 1: Build the query for videos without transcripts
    query = """
        SELECT yv.id, yv.video_id, yv.title, yv.channel_name, yv.views
        FROM youtube_videos yv
        LEFT JOIN video_transcripts vt ON yv.id = vt.video_id
        WHERE vt.id IS NULL AND yv.is_relevant = true
    """
    params = []

    # Filter by channel if specified (use --channels or --discover channels)
    channel_filter = args.channels or args.discover
    if channel_filter:
        query += " AND yv.channel_name = ANY(%s)"
        params.append(channel_filter)

    query += " ORDER BY yv.views DESC"
    cur.execute(query, params)
    videos = cur.fetchall()

    if channel_filter:
        print(f"Found {len(videos)} videos without transcripts (channels: {', '.join(channel_filter)})\n")
    else:
        print(f"Found {len(videos)} videos without transcripts\n")

    if not videos:
        print("All matching videos already have transcripts!")
        cur.close()
        conn.close()
        return

    success = 0
    failed = 0
    blocked = 0

    for i, v in enumerate(videos, 1):
        print(f"[{i}/{len(videos)}] [{v['channel_name']}] {v['title'][:55]}...")
        t = fetch_transcript(v["video_id"])

        time.sleep(1.5)

        if t == "BLOCKED":
            blocked += 1
            print(f"  BLOCKED by YouTube")
            if blocked >= 3:
                print("\nYouTube is blocking this IP.")
                print("Try running from a different network (home WiFi, phone hotspot).")
                break
            continue

        if t:
            blocked = 0
            cur.execute("""
                INSERT INTO video_transcripts (video_id, language, full_text, token_count)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (video_id, language) DO UPDATE SET
                    full_text = EXCLUDED.full_text,
                    token_count = EXCLUDED.token_count,
                    extracted_at = NOW()
            """, (str(v["id"]), t["language"], t["full_text"], t["token_count"]))
            conn.commit()
            success += 1
            print(f"  OK - {t['token_count']:,} tokens ({t['language']})")
        else:
            blocked = 0
            failed += 1
            print(f"  SKIP - no transcript available")

    cur.close()
    conn.close()

    print(f"\nDone! Fetched {success} transcripts, skipped {failed}")
    if success > 0:
        print("Transcripts are now in your Supabase DB.")
        print("\nNext step: run 'python summarize_transcripts.py' to generate summaries")


if __name__ == "__main__":
    main()
