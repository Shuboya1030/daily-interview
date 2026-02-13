"""
Scraper for Product Management Exercises
URL: https://www.productmanagementexercises.com/interview-questions
"""
from typing import List, Dict
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import time
import re

from scrapers.base import BaseScraper


class PMExercisesScraper(BaseScraper):
    """Scraper for Product Management Exercises"""

    def __init__(self):
        super().__init__(
            source_name='pm_exercises',
            source_url='https://www.productmanagementexercises.com/interview-questions'
        )

    def scrape(self, days_back: int = 90) -> List[Dict]:
        """
        Scrape questions from PM Exercises

        Note: This site has 2000+ questions with pagination
        We'll scrape multiple pages to get comprehensive coverage
        """
        all_questions = []

        with sync_playwright() as p:
            self.logger.info("Launching browser...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            try:
                # Navigate to main questions page
                self.logger.info(f"Navigating to {self.source_url}")
                page.goto(self.source_url, wait_until='networkidle', timeout=30000)

                # Wait for questions to load
                page.wait_for_selector('.question-card, .question-item, [data-question]', timeout=10000)

                # Get total number of pages (if pagination exists)
                total_pages = self._get_total_pages(page)
                self.logger.info(f"Found {total_pages} pages to scrape")

                # Scrape multiple pages (limit to 10 pages for MVP)
                pages_to_scrape = min(10, total_pages)

                for page_num in range(1, pages_to_scrape + 1):
                    self.logger.info(f"Scraping page {page_num}/{pages_to_scrape}")

                    questions = self._scrape_page(page)
                    all_questions.extend(questions)

                    self.logger.info(f"Scraped {len(questions)} questions from page {page_num}")

                    # Navigate to next page if not last
                    if page_num < pages_to_scrape:
                        success = self._go_to_next_page(page, page_num)
                        if not success:
                            self.logger.warning("Could not navigate to next page, stopping")
                            break

                        time.sleep(2)  # Polite delay

            except PlaywrightTimeout as e:
                self.logger.error(f"Timeout error: {str(e)}")
            except Exception as e:
                self.logger.error(f"Error during scraping: {str(e)}", exc_info=True)
            finally:
                browser.close()

        # Normalize all questions
        normalized = [self._normalize_question(q) for q in all_questions]
        self.scraped_questions = normalized

        return normalized

    def _get_total_pages(self, page) -> int:
        """Get total number of pages"""
        try:
            # Try to find pagination element
            pagination = page.locator('.pagination, .page-numbers, [aria-label*="pagination"]').first
            if pagination.count() > 0:
                # Extract last page number
                last_page_text = pagination.locator('a, button').last.inner_text()
                match = re.search(r'\d+', last_page_text)
                if match:
                    return int(match.group())
        except:
            pass

        return 1  # Default to 1 page if can't determine

    def _scrape_page(self, page) -> List[Dict]:
        """Scrape all questions from current page"""
        questions = []

        try:
            # Wait for question cards to load
            page.wait_for_selector('.question-card, .question-item, article', timeout=5000)

            # Find all question elements (try multiple selectors)
            question_elements = page.locator(
                '.question-card, .question-item, article[class*="question"], [data-testid*="question"]'
            ).all()

            self.logger.info(f"Found {len(question_elements)} question elements")

            for idx, element in enumerate(question_elements):
                try:
                    question = self._extract_question_data(element, page)
                    if question and question.get('content'):
                        questions.append(question)
                except Exception as e:
                    self.logger.warning(f"Error extracting question {idx}: {str(e)}")
                    continue

        except Exception as e:
            self.logger.error(f"Error scraping page: {str(e)}")

        return questions

    def _extract_question_data(self, element, page) -> Dict:
        """Extract data from a single question element"""
        data = {}

        try:
            # Question title/content (try multiple selectors)
            title_selectors = [
                'h2', 'h3', '.question-title', '.title',
                '[class*="title"]', 'a[href*="questions"]'
            ]

            for selector in title_selectors:
                title_elem = element.locator(selector).first
                if title_elem.count() > 0:
                    data['content'] = title_elem.inner_text().strip()
                    break

            if not data.get('content'):
                # Fallback: use all text from element
                data['content'] = element.inner_text().strip()[:200]

            # Question URL
            link = element.locator('a').first
            if link.count() > 0:
                href = link.get_attribute('href')
                if href:
                    if href.startswith('http'):
                        data['url'] = href
                    else:
                        data['url'] = f"https://www.productmanagementexercises.com{href}"
            else:
                data['url'] = self.source_url

            # Company (look for company tags/badges)
            company_elem = element.locator('.company, .badge, [class*="company"]').first
            if company_elem.count() > 0:
                data['company'] = company_elem.inner_text().strip()

            # Question type/category
            category_elem = element.locator('.category, .tag, [class*="category"], [class*="type"]').first
            if category_elem.count() > 0:
                data['type'] = category_elem.inner_text().strip()

            # Metadata: answer count
            answer_elem = element.locator('[class*="answer"], [class*="response"]').first
            if answer_elem.count() > 0:
                answer_text = answer_elem.inner_text()
                match = re.search(r'(\d+)', answer_text)
                if match:
                    data['answer_count'] = int(match.group(1))

            # Metadata: view count
            view_elem = element.locator('[class*="view"]').first
            if view_elem.count() > 0:
                view_text = view_elem.inner_text()
                match = re.search(r'([\d,]+)', view_text)
                if match:
                    view_count_str = match.group(1).replace(',', '')
                    data['view_count'] = int(view_count_str)

        except Exception as e:
            self.logger.warning(f"Error extracting question data: {str(e)}")

        return data

    def _go_to_next_page(self, page, current_page: int) -> bool:
        """Navigate to next page"""
        try:
            # Try to find and click next button
            next_button = page.locator('a:has-text("Next"), button:has-text("Next"), [aria-label*="next"]').first

            if next_button.count() > 0 and next_button.is_visible():
                next_button.click()
                page.wait_for_load_state('networkidle')
                return True

            # Alternative: click on page number
            next_page_num = current_page + 1
            page_link = page.locator(f'a:has-text("{next_page_num}"), button:has-text("{next_page_num}")').first

            if page_link.count() > 0:
                page_link.click()
                page.wait_for_load_state('networkidle')
                return True

        except Exception as e:
            self.logger.error(f"Error navigating to next page: {str(e)}")

        return False
