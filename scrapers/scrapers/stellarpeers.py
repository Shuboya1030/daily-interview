"""
Scraper for StellarPeers
URL: https://stellarpeers.com/interview-questions/
"""
from typing import List, Dict
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import time
import re

from scrapers.base import BaseScraper


class StellarPeersScraper(BaseScraper):
    """Scraper for StellarPeers"""

    def __init__(self):
        super().__init__(
            source_name='stellarpeers',
            source_url='https://stellarpeers.com/interview-questions/'
        )

    def scrape(self, days_back: int = 90) -> List[Dict]:
        """
        Scrape questions from StellarPeers

        Note: This site uses AJAX for loading content
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

                # Try different selectors for questions
                selectors = [
                    '.question-card',
                    '.question-item',
                    'article',
                    '[class*="question"]',
                    '.card',
                ]

                questions_found = False
                for selector in selectors:
                    try:
                        page.wait_for_selector(selector, timeout=5000)
                        questions = self._scrape_questions(page, selector)
                        if questions:
                            all_questions.extend(questions)
                            questions_found = True
                            break
                    except:
                        continue

                if not questions_found:
                    self.logger.warning("No questions found with standard selectors, trying fallback")
                    # Fallback: get all links that might be questions
                    questions = self._scrape_questions_fallback(page)
                    all_questions.extend(questions)

                # Try to load more by scrolling or clicking "Load More"
                self._load_more_content(page)

                # Scrape again after loading more
                for selector in selectors:
                    try:
                        new_questions = self._scrape_questions(page, selector)
                        for q in new_questions:
                            if not any(existing.get('url') == q.get('url') for existing in all_questions):
                                all_questions.append(q)
                    except:
                        continue

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

    def _scrape_questions(self, page, selector: str) -> List[Dict]:
        """Scrape questions using given selector"""
        questions = []

        try:
            elements = page.locator(selector).all()
            self.logger.info(f"Found {len(elements)} elements with selector '{selector}'")

            for element in elements:
                try:
                    data = {}

                    # Question content/title
                    title_elem = element.locator('h2, h3, h4, .title, [class*="title"]').first
                    if title_elem.count() > 0:
                        data['content'] = title_elem.inner_text().strip()
                    else:
                        # Fallback to first paragraph or all text
                        p_elem = element.locator('p').first
                        if p_elem.count() > 0:
                            data['content'] = p_elem.inner_text().strip()
                        else:
                            data['content'] = element.inner_text().strip()[:200]

                    if not data.get('content') or len(data['content']) < 10:
                        continue

                    # URL
                    link = element.locator('a').first
                    if link.count() > 0:
                        href = link.get_attribute('href')
                        if href:
                            if href.startswith('http'):
                                data['url'] = href
                            else:
                                data['url'] = f"https://stellarpeers.com{href}"
                    else:
                        data['url'] = self.source_url

                    # Company (might be in badges or tags)
                    company_elem = element.locator('.company, .badge, [class*="company"]').first
                    if company_elem.count() > 0:
                        data['company'] = company_elem.inner_text().strip()

                    # Type/Category
                    category_elem = element.locator('.category, .tag, [class*="type"]').first
                    if category_elem.count() > 0:
                        data['type'] = category_elem.inner_text().strip()

                    if data.get('content'):
                        questions.append(data)

                except Exception as e:
                    self.logger.warning(f"Error extracting question: {str(e)}")
                    continue

        except Exception as e:
            self.logger.error(f"Error scraping with selector {selector}: {str(e)}")

        return questions

    def _scrape_questions_fallback(self, page) -> List[Dict]:
        """Fallback method: scrape all links that look like questions"""
        questions = []

        try:
            # Find all links that might be questions
            links = page.locator('a[href*="question"], a[href*="interview"]').all()

            self.logger.info(f"Found {len(links)} potential question links")

            for link in links:
                try:
                    data = {}

                    # Get link text as content
                    data['content'] = link.inner_text().strip()

                    if not data['content'] or len(data['content']) < 10:
                        continue

                    # Get URL
                    href = link.get_attribute('href')
                    if href:
                        if href.startswith('http'):
                            data['url'] = href
                        else:
                            data['url'] = f"https://stellarpeers.com{href}"
                    else:
                        continue

                    questions.append(data)

                except Exception as e:
                    continue

        except Exception as e:
            self.logger.error(f"Error in fallback scraping: {str(e)}")

        return questions

    def _load_more_content(self, page):
        """Try to load more content by scrolling or clicking"""
        try:
            # Try to find and click "Load More" button
            load_more_selectors = [
                'button:has-text("Load More")',
                'button:has-text("Show More")',
                'a:has-text("More")',
                '[class*="load-more"]'
            ]

            for selector in load_more_selectors:
                button = page.locator(selector).first
                if button.count() > 0 and button.is_visible():
                    self.logger.info("Clicking 'Load More' button")
                    button.click()
                    time.sleep(2)
                    return

            # Fallback: scroll to bottom
            self.logger.info("Scrolling to load more content")
            for _ in range(3):
                page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                time.sleep(2)

        except Exception as e:
            self.logger.warning(f"Error loading more content: {str(e)}")
