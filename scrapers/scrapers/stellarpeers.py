"""
Scraper for StellarPeers
Strategy: Fetch question URLs from sitemap XML, then scrape each page
URL: https://stellarpeers.com/interview-questions/
"""
from typing import List, Dict
import requests
import re
import time
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

from scrapers.base import BaseScraper
from config import USER_AGENT


class StellarPeersScraper(BaseScraper):
    """Scraper for StellarPeers using sitemap + individual page scraping"""

    SITEMAPS = [
        'https://stellarpeers.com/sp_intvw_question-sitemap.xml',
        'https://stellarpeers.com/sp_intvw_question-sitemap2.xml',
    ]

    def __init__(self):
        super().__init__(
            source_name='stellarpeers',
            source_url='https://stellarpeers.com/interview-questions/'
        )
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        })

    def scrape(self, days_back: int = 90) -> List[Dict]:
        """
        Scrape questions from StellarPeers via sitemap

        Steps:
        1. Fetch sitemap XML to get all question URLs + dates
        2. Filter by days_back
        3. Visit each question page to extract metadata
        """
        all_questions = []

        # Step 1: Get question URLs from sitemaps
        self.logger.info("Fetching question URLs from sitemaps...")
        question_urls = self._get_urls_from_sitemaps()
        self.logger.info(f"Found {len(question_urls)} question URLs in sitemaps")

        if not question_urls:
            self.logger.error("No URLs found in sitemaps")
            return []

        # Limit pages for MVP (avoid long-running scrapes)
        MAX_PAGES = 100
        if len(question_urls) > MAX_PAGES:
            self.logger.info(f"Limiting to {MAX_PAGES} questions (out of {len(question_urls)})")
            question_urls = question_urls[:MAX_PAGES]

        # Step 2: Scrape each question page
        total = len(question_urls)
        for idx, url_info in enumerate(question_urls):
            url = url_info['url']
            lastmod = url_info.get('lastmod')

            if idx > 0 and idx % 50 == 0:
                self.logger.info(f"Progress: {idx}/{total} questions scraped")

            try:
                question = self._scrape_question_page(url, lastmod)
                if question and question.get('content'):
                    all_questions.append(question)
            except Exception as e:
                self.logger.warning(f"Error scraping {url}: {str(e)}")
                continue

            # Polite delay
            if idx % 10 == 0 and idx > 0:
                time.sleep(1)

        # Normalize
        normalized = [self._normalize_question(q) for q in all_questions]
        self.scraped_questions = normalized

        self.logger.info(f"Total questions scraped from StellarPeers: {len(normalized)}")
        return normalized

    def _get_urls_from_sitemaps(self) -> List[Dict]:
        """Fetch and parse sitemap XMLs to get question URLs"""
        urls = []

        for sitemap_url in self.SITEMAPS:
            try:
                self.logger.info(f"Fetching sitemap: {sitemap_url}")
                resp = self.session.get(sitemap_url, timeout=15)
                resp.raise_for_status()

                root = ET.fromstring(resp.content)
                # Handle XML namespace
                ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

                for url_elem in root.findall('ns:url', ns):
                    loc = url_elem.find('ns:loc', ns)
                    lastmod = url_elem.find('ns:lastmod', ns)

                    if loc is not None and loc.text:
                        url_text = loc.text.strip()
                        # Skip the collection index page
                        if url_text.endswith('/interview-question-collection/'):
                            continue

                        entry = {'url': url_text}
                        if lastmod is not None and lastmod.text:
                            entry['lastmod'] = lastmod.text.strip()

                        urls.append(entry)

                self.logger.info(f"Got {len(urls)} URLs so far")

            except Exception as e:
                self.logger.error(f"Error fetching sitemap {sitemap_url}: {str(e)}")
                continue

        return urls

    def _scrape_question_page(self, url: str, lastmod: str = None) -> Dict:
        """Scrape a single question page for metadata"""
        try:
            resp = self.session.get(url, timeout=15)
            resp.raise_for_status()

            soup = BeautifulSoup(resp.text, 'html.parser')
            data = {}

            # Question title from <h1> or og:title
            h1 = soup.find('h1')
            if h1:
                data['content'] = h1.get_text(strip=True)
            else:
                og_title = soup.find('meta', property='og:title')
                if og_title:
                    data['content'] = og_title.get('content', '').strip()

            if not data.get('content'):
                return {}

            # Clean up title - remove site name suffix
            data['content'] = re.sub(r'\s*[-–|].*StellarPeers.*$', '', data['content']).strip()

            # URL
            data['url'] = url

            # Company - extract from breadcrumb, tags, or page content
            data['company'] = self._extract_company(soup)

            # Question type - extract from breadcrumb or categories
            data['type'] = self._extract_type(soup, url)

            # Published date from meta tags
            date_published = soup.find('meta', property='article:published_time')
            if date_published:
                data['published_at'] = date_published.get('content', '')
            elif lastmod:
                data['published_at'] = lastmod

            return data

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return {}
            raise
        except Exception as e:
            self.logger.warning(f"Error parsing {url}: {str(e)}")
            return {}

    def _extract_company(self, soup) -> str:
        """Extract company name from the page"""
        # Check breadcrumbs
        breadcrumbs = soup.find_all('a', class_=re.compile(r'breadcrumb', re.I))
        for bc in breadcrumbs:
            text = bc.get_text(strip=True)
            if text in self._known_companies():
                return text

        # Check for company mentions in structured data
        schema = soup.find('script', type='application/ld+json')
        if schema:
            import json
            try:
                ld = json.loads(schema.string)
                if isinstance(ld, dict):
                    about = ld.get('about', {})
                    if isinstance(about, dict) and about.get('name'):
                        return about['name']
            except:
                pass

        # Extract from URL slug
        url_text = soup.find('link', rel='canonical')
        if url_text:
            href = url_text.get('href', '')
            for company in self._known_companies():
                if company.lower().replace(' ', '-') in href.lower():
                    return company

        # Extract from page title
        title = soup.find('h1')
        if title:
            title_text = title.get_text(strip=True)
            for company in self._known_companies():
                if company.lower() in title_text.lower():
                    return company

        return None

    def _extract_type(self, soup, url: str) -> str:
        """Extract question type from page or URL"""
        url_lower = url.lower()

        # Map URL patterns to question types
        type_patterns = {
            'design': 'Product Design',
            'improve': 'Product Design',
            'build': 'Product Design',
            'metric': 'Metrics',
            'measure': 'Metrics',
            'kpi': 'Metrics',
            'estimate': 'Estimation',
            'how-many': 'Estimation',
            'calculate': 'Estimation',
            'strategy': 'Product Strategy',
            'market': 'Product Strategy',
            'launch': 'Product Strategy',
            'compete': 'Product Strategy',
            'prioritize': 'Execution',
            'roadmap': 'Execution',
            'goal': 'Execution',
            'tell-me-about': 'Behavioral',
            'leadership': 'Behavioral',
            'conflict': 'Behavioral',
            'challenge': 'Behavioral',
            'team': 'Behavioral',
            'technical': 'Technical',
            'system-design': 'Technical',
            'architecture': 'Technical',
            'api': 'Technical',
        }

        for pattern, qtype in type_patterns.items():
            if pattern in url_lower:
                return qtype

        # Check page content for type hints
        breadcrumbs = soup.find_all(['a', 'span'], class_=re.compile(r'breadcrumb|category', re.I))
        for bc in breadcrumbs:
            text = bc.get_text(strip=True).lower()
            for pattern, qtype in type_patterns.items():
                if pattern in text:
                    return qtype

        return None

    def _known_companies(self) -> List[str]:
        """List of known companies to match against"""
        return [
            'Google', 'Meta', 'Facebook', 'Amazon', 'Apple', 'Microsoft',
            'Netflix', 'Uber', 'Airbnb', 'LinkedIn', 'Spotify', 'Twitter',
            'Stripe', 'Slack', 'Zoom', 'Pinterest', 'Snapchat', 'TikTok',
            'Tesla', 'Salesforce', 'Adobe', 'Oracle', 'IBM', 'Intel',
            'PayPal', 'Shopify', 'DoorDash', 'Instacart', 'Lyft',
            'WhatsApp', 'Instagram', 'YouTube', 'Gmail', 'Dropbox',
            'Robinhood', 'Coinbase', 'OpenAI', 'Anthropic', 'Databricks',
        ]
