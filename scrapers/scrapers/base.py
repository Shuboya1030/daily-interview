"""
Base scraper class for all scrapers
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import time
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

from config import SCRAPE_TIMEOUT, MAX_RETRIES, USER_AGENT, SCRAPE_DAYS_BACK

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class BaseScraper(ABC):
    """Base class for all scrapers"""

    def __init__(self, source_name: str, source_url: str):
        self.source_name = source_name
        self.source_url = source_url
        self.logger = logging.getLogger(f"Scraper.{source_name}")
        self.scraped_questions = []

    @abstractmethod
    def scrape(self, days_back: int = SCRAPE_DAYS_BACK) -> List[Dict]:
        """
        Main scraping method - must be implemented by subclasses

        Args:
            days_back: Number of days to scrape back

        Returns:
            List of question dictionaries
        """
        pass

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers for requests"""
        return {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        }

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def _fetch_with_retry(self, fetch_func, *args, **kwargs):
        """Wrapper for retry logic"""
        return fetch_func(*args, **kwargs)

    def _normalize_question(self, raw_data: Dict) -> Dict:
        """
        Normalize raw scraped data into standard format

        Args:
            raw_data: Raw scraped data

        Returns:
            Normalized question dict
        """
        return {
            'content': raw_data.get('content', '').strip(),
            'source': self.source_name,
            'source_url': raw_data.get('url', self.source_url),
            'company': raw_data.get('company', '').strip() if raw_data.get('company') else None,
            'question_type': self._normalize_question_type(raw_data.get('type')),
            'metadata': {
                'answer_count': raw_data.get('answer_count'),
                'view_count': raw_data.get('view_count'),
                'tags': raw_data.get('tags', []),
            },
            'published_at': self._parse_date(raw_data.get('published_at'))
        }

    def _normalize_question_type(self, raw_type: Optional[str]) -> Optional[str]:
        """Normalize question type to standard categories"""
        if not raw_type:
            return None

        type_mapping = {
            'product design': 'Product Design',
            'design': 'Product Design',
            'behavioral': 'Behavioral',
            'metrics': 'Metrics',
            'analytics': 'Metrics',
            'strategy': 'Product Strategy',
            'technical': 'Technical',
            'estimation': 'Estimation',
            'execution': 'Execution',
        }

        return type_mapping.get(raw_type.lower(), raw_type)

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to datetime"""
        if not date_str:
            return None

        # Add parsing logic based on different formats
        # For now, return None
        return None

    def _should_scrape_question(self, published_at: Optional[datetime], days_back: int) -> bool:
        """Check if question is within date range"""
        if not published_at:
            # If no date, include it
            return True

        cutoff_date = datetime.now() - timedelta(days=days_back)
        return published_at >= cutoff_date

    def run(self, days_back: int = SCRAPE_DAYS_BACK) -> List[Dict]:
        """
        Run the scraper

        Args:
            days_back: Number of days to scrape back

        Returns:
            List of normalized questions
        """
        self.logger.info(f"Starting scraper for {self.source_name}")
        self.logger.info(f"Scraping last {days_back} days")

        try:
            questions = self.scrape(days_back)
            self.logger.info(f"Scraped {len(questions)} questions from {self.source_name}")
            return questions

        except Exception as e:
            self.logger.error(f"Error scraping {self.source_name}: {str(e)}", exc_info=True)
            return []

    def save_to_file(self, filename: str):
        """Save scraped questions to JSON file for debugging"""
        import json

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.scraped_questions, f, indent=2, ensure_ascii=False)

        self.logger.info(f"Saved {len(self.scraped_questions)} questions to {filename}")
