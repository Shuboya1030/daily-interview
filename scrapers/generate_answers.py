"""Generate sample answers for 10 curated PM interview questions using video summaries."""
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

# Load summaries
summaries_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'video_summaries.json')
with open(summaries_path, 'r', encoding='utf-8') as f:
    summaries = json.load(f)

# Build the knowledge base context string
KNOWLEDGE_BASE = ""
for s in summaries:
    KNOWLEDGE_BASE += f"\n---\n[{s['title']}] by {s['channel']} ({s['views']:,} views)\nURL: {s['url']}\n{s['summary']}\n"

print(f"Knowledge base: {len(summaries)} videos, ~{len(KNOWLEDGE_BASE.split()) * 4 // 3:,} tokens")

SYSTEM_PROMPT = """You are an expert AI product management interview coach. You have a knowledge base of summaries from top AI YouTube videos by creators like Jeff Su, Peter Yang, IBM Technology, Lenny's Podcast, Y Combinator, and others.

Your job: generate a concise, insightful sample answer to a PM interview question.

FORMAT (strict):
1. A 1-2 sentence high-level insight that directly answers the question
2. 2-3 bullet points with specific, concrete supporting insights (each bullet 1-2 sentences max)
3. A "References" line listing 2-3 YouTube videos that most informed the answer (title only, no URLs)

RULES:
- Total answer MUST be under 150 words (excluding references)
- Each bullet should be a distinct, specific, non-overlapping insight
- Draw on concrete concepts, frameworks, and examples from the video knowledge base
- Sound like a confident, knowledgeable PM candidate — no filler, no hedging
- Prioritize practical insights over textbook definitions
- Only cite videos that actually informed your answer
- If the knowledge base doesn't cover the topic well, supplement with your own knowledge but note it

KNOWLEDGE BASE:
""" + KNOWLEDGE_BASE

# 10 curated questions that match our video content well
CURATED_QUESTION_IDS = [
    "de36fb41-eb14-41af-9aa4-4c97a0fc8c20",  # What is your understanding of an AI product manager?
    "08eab2ae-042f-4406-b21d-426ae70c64d1",  # Can you talk about your understanding of agents and workflows?
    "353607e1-e6a0-4ae7-9c17-6fb08cab25f8",  # How to alleviate hallucinations?
    "25",  # placeholder — will use english_content match below
    "39daad54-5e48-4642-9a88-0937b66f548e",  # Talk about an AI product you have researched
    "27d56c3c-21b6-4325-96f1-6d86f4ce11ed",  # Share pitfalls encountered while writing prompts
    "0bf778b4-1c46-49ee-9355-66548311bc7a",  # Differences in product direction between language models and image models
    "72",  # placeholder
    "76",  # placeholder
    "24",  # placeholder
]

# Use english_content matching for robustness
CURATED_QUESTIONS = [
    "What is your understanding of an AI product manager?",
    "Can you talk about your understanding of agents and workflows?",
    "How to alleviate hallucinations?",
    "What AI applications have you used, and what are their advantages and disadvantages?",
    "Talk about an AI product you have researched.",
    "You have written some prompts; can you share some pitfalls you encountered while writing various prompts?",
    "Do you think prompts have a threshold? Why was prompt engineering emphasized in the early stages of large models, then not mentioned in the middle, and recently brought up again?",
    "What is your understanding of the boundaries of AI capabilities?",
    "Do you understand RAG?",
    "How is the effectiveness of an AI project tested, and what are the evaluation criteria?",
]


def generate_answer(question_text):
    """Generate a sample answer for one question."""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Interview question: {question_text}\n\nGenerate a sample answer."},
        ],
        temperature=0.3,
        max_tokens=800,
    )
    return resp.choices[0].message.content


def main():
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Fetch the 10 curated questions by english_content match
    cur.execute('''
        SELECT id, english_content, question_type, frequency
        FROM merged_questions
        WHERE english_content = ANY(%s)
    ''', (CURATED_QUESTIONS,))
    questions = cur.fetchall()

    # Map for lookup
    q_map = {q['english_content']: q for q in questions}

    # Ensure order matches CURATED_QUESTIONS and fill in any missing ones
    ordered = []
    for qtext in CURATED_QUESTIONS:
        if qtext in q_map:
            ordered.append(q_map[qtext])
        else:
            ordered.append({"id": None, "english_content": qtext, "question_type": "AI Domain Knowledge", "frequency": 1})

    print(f"\nMatched {len(questions)}/{len(CURATED_QUESTIONS)} questions from DB")
    print(f"Generating answers for {len(ordered)} questions...\n")

    results = []
    for i, q in enumerate(ordered, 1):
        qtext = q['english_content']
        print(f"[{i}/{len(ordered)}] {qtext[:80]}...", end=" ", flush=True)

        try:
            answer = generate_answer(qtext)
            results.append({
                "question_id": str(q['id']) if q['id'] else None,
                "question": qtext,
                "answer": answer,
            })
            print("OK")

            # Always print full Q&A for review
            print(f"\n{'='*60}")
            print(f"Q: {qtext}")
            print(f"{'='*60}")
            print(answer)
            print()
        except Exception as e:
            print(f"ERROR: {e}")

    # Store in DB
    stored = 0
    for r in results:
        if r['question_id']:
            cur.execute('''
                INSERT INTO sample_answers (question_id, answer_text, source_videos, model_used)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (question_id) DO UPDATE SET
                    answer_text = EXCLUDED.answer_text,
                    source_videos = EXCLUDED.source_videos,
                    model_used = EXCLUDED.model_used,
                    generated_at = NOW()
            ''', (
                r['question_id'],
                r['answer'],
                json.dumps([{"title": s['title'], "url": s['url'], "channel": s['channel']} for s in summaries]),
                'gpt-4o-mini',
            ))
            stored += 1
    conn.commit()
    print(f"\nStored {stored} answers in sample_answers table")

    # Also save to JSON for review
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sample_answers.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Saved to sample_answers.json")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
