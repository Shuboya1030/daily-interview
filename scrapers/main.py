"""
Daily Interview - Main Scraper Entry Point

Simplified version: Scrape and store raw questions
GPT similarity detection will be added later
"""
import sys
import logging
from datetime import datetime
from typing import List, Dict

from config import SCRAPE_DAYS_BACK, SOURCES, OPENAI_API_KEY
from database.db import DatabaseManager
from processors.normalizer import DataNormalizer
from processors.embeddings import EmbeddingProcessor
from scrapers import PMExercisesScraper, NowcoderScraper, StellarPeersScraper

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/scraper.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("Main")


class DailyInterviewScraper:
    """Main scraper orchestrator"""

    def __init__(self):
        self.db = DatabaseManager()
        self.normalizer = DataNormalizer()
        self.scrapers = self._initialize_scrapers()

    def _initialize_scrapers(self):
        """Initialize all enabled scrapers"""
        scrapers = []

        if SOURCES['pm_exercises']['enabled']:
            scrapers.append(PMExercisesScraper())

        if SOURCES['nowcoder']['enabled']:
            scrapers.append(NowcoderScraper())

        if SOURCES['stellarpeers']['enabled']:
            scrapers.append(StellarPeersScraper())

        return scrapers

    def run(self, days_back: int = SCRAPE_DAYS_BACK):
        """
        Run the complete scraping pipeline

        Steps:
        1. Scrape from all sources
        2. Normalize and clean data
        3. Store in raw_questions table
        4. (GPT similarity detection - TO BE ADDED LATER)
        """
        logger.info("=" * 60)
        logger.info("Daily Interview Scraper Started")
        logger.info(f"Scraping last {days_back} days")
        logger.info("=" * 60)

        start_time = datetime.now()

        # Step 1: Scrape from all sources
        all_questions = []

        for scraper in self.scrapers:
            logger.info(f"\n{'='*60}")
            logger.info(f"Running {scraper.source_name} scraper")
            logger.info(f"{'='*60}")

            try:
                questions = scraper.run(days_back)
                logger.info(f"✓ {scraper.source_name}: Scraped {len(questions)} questions")
                all_questions.extend(questions)

            except Exception as e:
                logger.error(f"✗ {scraper.source_name}: Failed - {str(e)}", exc_info=True)
                continue

        logger.info(f"\n{'='*60}")
        logger.info(f"Total questions scraped: {len(all_questions)}")
        logger.info(f"{'='*60}")

        if not all_questions:
            logger.error("No questions scraped. Exiting.")
            return

        # Step 2: Additional normalization
        logger.info("\nNormalizing data...")
        normalized_questions = []

        for q in all_questions:
            try:
                # Clean content
                if q.get('content'):
                    q['content'] = self.normalizer.clean_question_content(q['content'])

                # Normalize company name
                if q.get('company'):
                    q['company'] = self.normalizer.normalize_company_name(q['company'])

                # Infer question type if missing
                if not q.get('question_type') and q.get('content'):
                    inferred_type = self.normalizer.extract_question_type_from_content(q['content'])
                    if inferred_type:
                        q['question_type'] = inferred_type

                normalized_questions.append(q)

            except Exception as e:
                logger.warning(f"Error normalizing question: {str(e)}")
                continue

        logger.info(f"✓ Normalized {len(normalized_questions)} questions")

        # Step 3: Store in database
        logger.info("\nStoring questions in database...")

        try:
            inserted_count = self.db.insert_raw_questions(normalized_questions)
            logger.info(f"✓ Inserted {inserted_count} new questions into database")

        except Exception as e:
            logger.error(f"✗ Database insertion failed: {str(e)}", exc_info=True)
            return

        # Step 4: Deduplicate raw questions
        logger.info("\nDeduplicating raw questions...")
        try:
            removed = self.db.deduplicate_raw_questions()
            logger.info(f"✓ Removed {removed} duplicate raw questions")
        except Exception as e:
            logger.error(f"✗ Deduplication failed: {str(e)}", exc_info=True)

        # Step 5: Run embedding-based similarity detection
        if OPENAI_API_KEY:
            logger.info("\nRunning embedding-based similarity detection...")
            try:
                embedding_processor = EmbeddingProcessor()
                merge_stats = embedding_processor.process_and_merge(self.db)
                logger.info(f"✓ Merge complete: {merge_stats}")
            except Exception as e:
                logger.error(f"✗ Embedding processing failed: {str(e)}", exc_info=True)
        else:
            logger.warning("⚠ OPENAI_API_KEY not set, skipping similarity detection")

        # Step 6: Get statistics
        logger.info("\nFetching database statistics...")

        try:
            stats = self.db.get_stats()
            logger.info(f"\n{'='*60}")
            logger.info("Database Statistics")
            logger.info(f"{'='*60}")
            logger.info(f"Total raw questions: {stats.get('raw_questions', 0)}")
            logger.info(f"Total merged questions: {stats.get('merged_questions', 0)}")

            logger.info("\nBy Source:")
            for source, count in stats.get('by_source', {}).items():
                logger.info(f"  {source}: {count}")

            if stats.get('by_type'):
                logger.info("\nBy Type:")
                for qtype, count in sorted(stats.get('by_type', {}).items(), key=lambda x: x[1], reverse=True):
                    logger.info(f"  {qtype}: {count}")

        except Exception as e:
            logger.warning(f"Could not fetch stats: {str(e)}")

        # Summary
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        logger.info(f"\n{'='*60}")
        logger.info("Scraping Complete!")
        logger.info(f"{'='*60}")
        logger.info(f"Duration: {duration:.2f} seconds")
        logger.info(f"Questions scraped: {len(all_questions)}")
        logger.info(f"Questions inserted: {inserted_count}")
        logger.info(f"{'='*60}\n")


def main():
    """Main entry point"""
    try:
        scraper = DailyInterviewScraper()
        scraper.run()

    except KeyboardInterrupt:
        logger.info("\n\nScraping interrupted by user")
        sys.exit(0)

    except Exception as e:
        logger.error(f"\n\nFatal error: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
