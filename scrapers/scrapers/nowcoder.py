"""
Scraper for Nowcoder (牛客网)
URL: https://www.nowcoder.com/interview/center?jobId=11229
"""
from typing import List, Dict
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import time
import json
import re

from scrapers.base import BaseScraper


class NowcoderScraper(BaseScraper):
    """Scraper for Nowcoder (牛客网)"""

    def __init__(self):
        super().__init__(
            source_name='nowcoder',
            source_url='https://www.nowcoder.com/interview/center?jobId=11229'
        )

    def scrape(self, days_back: int = 90) -> List[Dict]:
        """
        Scrape questions from Nowcoder

        Note: This site uses Vue.js and stores data in window.__INITIAL_STATE__
        """
        all_questions = []

        with sync_playwright() as p:
            self.logger.info("Launching browser...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            try:
                # Navigate to main page
                self.logger.info(f"Navigating to {self.source_url}")
                page.goto(self.source_url, wait_until='networkidle', timeout=30000)

                # Wait for content to load
                time.sleep(3)

                # Try to extract data from window.__INITIAL_STATE__
                initial_state = page.evaluate('() => window.__INITIAL_STATE__')

                if initial_state:
                    self.logger.info("Found initial state data")
                    questions = self._parse_initial_state(initial_state)
                    all_questions.extend(questions)
                else:
                    # Fallback: scrape from DOM
                    self.logger.info("Parsing from DOM")
                    questions = self._scrape_from_dom(page)
                    all_questions.extend(questions)

                # Try to load more content by scrolling
                self.logger.info("Scrolling to load more content")
                for _ in range(3):
                    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                    time.sleep(2)

                    # Scrape newly loaded content
                    new_questions = self._scrape_from_dom(page)
                    for q in new_questions:
                        # Avoid duplicates
                        if not any(existing.get('url') == q.get('url') for existing in all_questions):
                            all_questions.append(q)

            except PlaywrightTimeout as e:
                self.logger.error(f"Timeout error: {str(e)}")
            except Exception as e:
                self.logger.error(f"Error during scraping: {str(e)}", exc_info=True)
            finally:
                browser.close()

        # Normalize all questions
        normalized = [self._normalize_question(q) for q in all_questions]
        self.scraped_questions = normalized

        self.logger.info(f"Total questions scraped: {len(normalized)}")
        return normalized

    def _parse_initial_state(self, state: Dict) -> List[Dict]:
        """Parse questions from window.__INITIAL_STATE__"""
        questions = []

        try:
            # Navigate through the state object to find questions
            # The structure varies, so we need to explore
            if isinstance(state, dict):
                questions = self._extract_questions_from_dict(state)

        except Exception as e:
            self.logger.error(f"Error parsing initial state: {str(e)}")

        return questions

    def _extract_questions_from_dict(self, data: Dict, depth: int = 0) -> List[Dict]:
        """Recursively extract questions from nested dict"""
        questions = []

        if depth > 5:  # Prevent infinite recursion
            return questions

        for key, value in data.items():
            # Look for question-like data
            if isinstance(value, dict):
                # Check if this looks like a question object
                if 'content' in value or 'title' in value or 'question' in value:
                    question = self._parse_question_object(value)
                    if question:
                        questions.append(question)
                else:
                    # Recurse deeper
                    questions.extend(self._extract_questions_from_dict(value, depth + 1))

            elif isinstance(value, list):
                # Check if this is a list of questions
                for item in value:
                    if isinstance(item, dict):
                        if 'content' in item or 'title' in item or 'question' in item:
                            question = self._parse_question_object(item)
                            if question:
                                questions.append(question)

        return questions

    def _parse_question_object(self, obj: Dict) -> Dict:
        """Parse a single question object"""
        data = {}

        # Extract content/title
        data['content'] = (
            obj.get('content') or
            obj.get('title') or
            obj.get('question') or
            obj.get('name') or
            ''
        ).strip()

        if not data['content']:
            return None

        # Extract company
        data['company'] = (
            obj.get('company') or
            obj.get('companyName') or
            obj.get('企业') or
            ''
        ).strip()

        # Extract URL/ID
        question_id = obj.get('id') or obj.get('questionId')
        if question_id:
            data['url'] = f"https://www.nowcoder.com/interview/question/{question_id}"
        else:
            data['url'] = self.source_url

        # Extract type
        data['type'] = (
            obj.get('type') or
            obj.get('questionType') or
            obj.get('category') or
            ''
        ).strip()

        # Extract metadata
        data['answer_count'] = obj.get('answerCount') or obj.get('回答数')
        data['view_count'] = obj.get('viewCount') or obj.get('浏览量')

        return data if data['content'] else None

    def _scrape_from_dom(self, page) -> List[Dict]:
        """Scrape questions from DOM"""
        questions = []

        try:
            # Wait for question cards
            page.wait_for_selector('.interview-item, .question-item, [class*="question"]', timeout=5000)

            # Find all question elements
            elements = page.locator('.interview-item, .question-item, [class*="question-card"]').all()

            self.logger.info(f"Found {len(elements)} question elements in DOM")

            for element in elements:
                try:
                    data = {}

                    # Question content
                    title_elem = element.locator('h3, h4, .title, [class*="title"]').first
                    if title_elem.count() > 0:
                        data['content'] = title_elem.inner_text().strip()

                    if not data.get('content'):
                        # Fallback to all text
                        data['content'] = element.inner_text().strip()[:200]

                    # URL
                    link = element.locator('a').first
                    if link.count() > 0:
                        href = link.get_attribute('href')
                        if href:
                            if href.startswith('http'):
                                data['url'] = href
                            else:
                                data['url'] = f"https://www.nowcoder.com{href}"
                    else:
                        data['url'] = self.source_url

                    # Company
                    company_elem = element.locator('.company, [class*="company"]').first
                    if company_elem.count() > 0:
                        data['company'] = company_elem.inner_text().strip()

                    if data.get('content'):
                        questions.append(data)

                except Exception as e:
                    self.logger.warning(f"Error extracting question: {str(e)}")
                    continue

        except Exception as e:
            self.logger.error(f"Error scraping from DOM: {str(e)}")

        return questions
