"""Query all AI Domain Knowledge questions and pick best 10 for answer generation."""
import os
import json
from dotenv import load_dotenv
load_dotenv()
load_dotenv('../.env.local')

import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor(cursor_factory=RealDictCursor)

# Get all AI Domain Knowledge questions
cur.execute("""
    SELECT id, english_content, question_type, frequency
    FROM merged_questions
    WHERE question_type = 'AI Domain Knowledge'
    ORDER BY frequency DESC, id
""")
rows = cur.fetchall()
print(f"Total AI Domain Knowledge questions: {len(rows)}\n")

# Print all for review
for i, r in enumerate(rows, 1):
    print(f"{i}. [freq={r['frequency']}] {r['english_content']}")

# Load summaries to see what topics we cover
summaries_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'video_summaries.json')
with open(summaries_path, 'r', encoding='utf-8') as f:
    summaries = json.load(f)

print(f"\n\n=== Video Summaries ({len(summaries)} videos) ===")
for s in summaries:
    print(f"- [{s['channel']}] {s['title']}")

cur.close()
conn.close()
