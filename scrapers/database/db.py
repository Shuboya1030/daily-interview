"""
Database operations for Daily Interview
"""
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from contextlib import contextmanager
from typing import List, Dict, Optional
import json
from datetime import datetime

from config import DATABASE_URL


@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


class DatabaseManager:
    """Manage all database operations"""

    @staticmethod
    def insert_raw_questions(questions: List[Dict]) -> int:
        """
        Insert raw questions into database

        Args:
            questions: List of question dictionaries

        Returns:
            Number of questions inserted
        """
        if not questions:
            return 0

        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
            INSERT INTO raw_questions
                (content, source, source_url, company, question_type, metadata, published_at)
            VALUES %s
            ON CONFLICT (content, source) DO UPDATE SET
                company = COALESCE(EXCLUDED.company, raw_questions.company),
                question_type = COALESCE(EXCLUDED.question_type, raw_questions.question_type),
                metadata = EXCLUDED.metadata,
                published_at = COALESCE(EXCLUDED.published_at, raw_questions.published_at)
            RETURNING id
            """

            # Deduplicate within batch — ON CONFLICT can't handle
            # two rows with the same (content, source) in one INSERT
            seen = {}
            for q in questions:
                key = (q['content'], q['source'])
                seen[key] = (
                    q['content'],
                    q['source'],
                    q['source_url'],
                    q.get('company'),
                    q.get('question_type'),
                    json.dumps(q.get('metadata', {})),
                    q.get('published_at')
                )
            values = list(seen.values())

            execute_values(cursor, query, values)
            inserted_count = cursor.rowcount
            cursor.close()

            return inserted_count

    @staticmethod
    def get_unprocessed_questions(limit: int = 100) -> List[Dict]:
        """
        Get raw questions that haven't been processed for similarity

        Returns:
            List of unprocessed questions
        """
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
            SELECT rq.*
            FROM raw_questions rq
            LEFT JOIN question_mappings qm ON rq.id = qm.raw_question_id
            WHERE qm.raw_question_id IS NULL
            ORDER BY rq.scraped_at DESC
            LIMIT %s
            """

            cursor.execute(query, (limit,))
            questions = cursor.fetchall()
            cursor.close()

            return [dict(q) for q in questions]

    @staticmethod
    def get_all_merged_questions() -> List[Dict]:
        """Get all merged questions for similarity comparison"""
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
            SELECT id, canonical_content, question_type
            FROM merged_questions
            ORDER BY updated_at DESC
            """

            cursor.execute(query)
            questions = cursor.fetchall()
            cursor.close()

            return [dict(q) for q in questions]

    @staticmethod
    def create_merged_question(content: str, question_type: Optional[str] = None,
                               question_types: Optional[List[str]] = None,
                               english_content: Optional[str] = None,
                               first_seen_at=None) -> str:
        """
        Create a new merged question

        Returns:
            UUID of created question
        """
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
            INSERT INTO merged_questions
                (canonical_content, question_type, question_types, frequency,
                 english_content, first_seen_at)
            VALUES (%s, %s, %s, 1, %s, %s)
            RETURNING id
            """

            cursor.execute(query, (content, question_type, question_types,
                                   english_content, first_seen_at))
            merged_id = cursor.fetchone()[0]
            cursor.close()

            return str(merged_id)

    @staticmethod
    def create_question_mapping(raw_id: str, merged_id: str, similarity: float):
        """Create mapping between raw and merged question"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
            INSERT INTO question_mappings (raw_question_id, merged_question_id, similarity_score)
            VALUES (%s, %s, %s)
            ON CONFLICT (raw_question_id, merged_question_id) DO NOTHING
            """

            cursor.execute(query, (raw_id, merged_id, similarity))
            cursor.close()

    @staticmethod
    def update_question_frequency(merged_id: str):
        """Update frequency count for merged question"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
            UPDATE merged_questions
            SET
                frequency = (
                    SELECT COUNT(*)
                    FROM question_mappings
                    WHERE merged_question_id = %s
                ),
                updated_at = NOW()
            WHERE id = %s
            """

            cursor.execute(query, (merged_id, merged_id))
            cursor.close()

    @staticmethod
    def get_or_create_company(name: str, company_type: Optional[str] = None) -> str:
        """Get existing company or create new one"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Try to get existing
            cursor.execute("SELECT id FROM companies WHERE name = %s", (name,))
            result = cursor.fetchone()

            if result:
                return str(result[0])

            # Create new
            cursor.execute(
                "INSERT INTO companies (name, type) VALUES (%s, %s) RETURNING id",
                (name, company_type)
            )
            company_id = cursor.fetchone()[0]
            cursor.close()

            return str(company_id)

    @staticmethod
    def link_question_to_company(merged_id: str, company_id: str):
        """Link merged question to company"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
            INSERT INTO question_companies (merged_question_id, company_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """

            cursor.execute(query, (merged_id, company_id))
            cursor.close()

    @staticmethod
    def ensure_llm_columns():
        """Add LLM-related columns if they don't exist"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DO $$
                BEGIN
                    -- raw_questions: LLM processing columns
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'raw_questions' AND column_name = 'english_content'
                    ) THEN
                        ALTER TABLE raw_questions ADD COLUMN english_content TEXT;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'raw_questions' AND column_name = 'llm_types'
                    ) THEN
                        ALTER TABLE raw_questions ADD COLUMN llm_types TEXT[];
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'raw_questions' AND column_name = 'llm_processed'
                    ) THEN
                        ALTER TABLE raw_questions ADD COLUMN llm_processed BOOLEAN DEFAULT FALSE;
                    END IF;

                    -- merged_questions: multi-type column
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'merged_questions' AND column_name = 'question_types'
                    ) THEN
                        ALTER TABLE merged_questions ADD COLUMN question_types TEXT[];
                    END IF;

                    -- merged_questions: english_content for bilingual display
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'merged_questions' AND column_name = 'english_content'
                    ) THEN
                        ALTER TABLE merged_questions ADD COLUMN english_content TEXT;
                    END IF;

                    -- merged_questions: earliest published date from raw questions
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'merged_questions' AND column_name = 'first_seen_at'
                    ) THEN
                        ALTER TABLE merged_questions ADD COLUMN first_seen_at TIMESTAMPTZ;
                    END IF;
                END $$;
            """)
            cursor.close()

    @staticmethod
    def get_llm_unprocessed_questions() -> List[Dict]:
        """Get raw questions that haven't been LLM-processed yet"""
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, content, source, company, question_type
                FROM raw_questions
                WHERE llm_processed = FALSE OR llm_processed IS NULL
                ORDER BY scraped_at DESC
            """)
            questions = cursor.fetchall()
            cursor.close()
            return [dict(q) for q in questions]

    @staticmethod
    def update_llm_results(results: List[Dict]):
        """Batch update raw questions with LLM results"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            for r in results:
                cursor.execute("""
                    UPDATE raw_questions
                    SET english_content = %s,
                        llm_types = %s,
                        llm_processed = TRUE
                    WHERE id = %s
                """, (r['english_content'], r['llm_types'], str(r['id'])))
            cursor.close()

    @staticmethod
    def deduplicate_raw_questions() -> int:
        """
        Remove duplicate raw questions and add unique constraint.
        Keeps the oldest row for each (content, source) pair.
        Returns number of duplicates removed.
        """
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Count before
            cursor.execute("SELECT COUNT(*) FROM raw_questions")
            before = cursor.fetchone()[0]

            # Delete duplicates, keeping the earliest scraped_at for each (content, source)
            cursor.execute("""
                DELETE FROM raw_questions
                WHERE id NOT IN (
                    SELECT DISTINCT ON (content, source) id
                    FROM raw_questions
                    ORDER BY content, source, scraped_at ASC
                )
            """)
            removed = cursor.rowcount

            # Add unique constraint if not exists
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'uq_raw_questions_content_source'
                    ) THEN
                        ALTER TABLE raw_questions
                        ADD CONSTRAINT uq_raw_questions_content_source
                        UNIQUE (content, source);
                    END IF;
                END $$;
            """)

            cursor.close()
            return removed

    @staticmethod
    def get_all_raw_questions() -> List[Dict]:
        """Get all raw questions for embedding processing"""
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
            SELECT id, content, english_content, source, source_url,
                   company, question_type, llm_types, metadata, published_at
            FROM raw_questions
            ORDER BY scraped_at DESC
            """

            cursor.execute(query)
            questions = cursor.fetchall()
            cursor.close()

            return [dict(q) for q in questions]

    @staticmethod
    def clear_merged_data():
        """Clear all merged questions and mappings for a full rebuild"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM question_companies")
            cursor.execute("DELETE FROM question_mappings")
            cursor.execute("DELETE FROM merged_questions")
            cursor.close()

    @staticmethod
    def update_merged_frequency(merged_id: str, count: int):
        """Set frequency for a merged question directly"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            query = """
            UPDATE merged_questions
            SET frequency = %s, updated_at = NOW()
            WHERE id = %s
            """

            cursor.execute(query, (count, merged_id))
            cursor.close()

    @staticmethod
    def get_stats() -> Dict:
        """Get database statistics"""
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            stats = {}

            # Total questions
            cursor.execute("SELECT COUNT(*) as count FROM raw_questions")
            stats['raw_questions'] = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM merged_questions")
            stats['merged_questions'] = cursor.fetchone()['count']

            # By source
            cursor.execute("""
                SELECT source, COUNT(*) as count
                FROM raw_questions
                GROUP BY source
            """)
            stats['by_source'] = {row['source']: row['count'] for row in cursor.fetchall()}

            # By type
            cursor.execute("""
                SELECT question_type, COUNT(*) as count
                FROM merged_questions
                WHERE question_type IS NOT NULL
                GROUP BY question_type
                ORDER BY count DESC
            """)
            stats['by_type'] = {row['question_type']: row['count'] for row in cursor.fetchall()}

            cursor.close()
            return stats
