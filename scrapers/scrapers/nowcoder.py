"""
Scraper for Nowcoder (牛客网) - PM Interview Experiences
URL: https://www.nowcoder.com/experience/891

Nowcoder interview posts are narrative blog-style write-ups, NOT structured Q&A.
Each post describes an interview experience and embeds multiple questions in free text.

Pipeline:
1. Fetch PM experience collection page → extract post list from __INITIAL_STATE__
2. For each post, visit detail page → extract full text content
3. Use LLM (gpt-4o-mini) to extract individual interview questions from the narrative
4. Return each extracted question as a separate raw question entry
"""
import json
import re
import time
import logging
from typing import List, Dict, Optional, Tuple

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup
from openai import OpenAI

from scrapers.base import BaseScraper
from config import OPENAI_API_KEY

logger = logging.getLogger("Scraper.nowcoder")

EXTRACT_PROMPT = """You are analyzing a Chinese PM (产品经理) interview experience post (面经).
Extract ALL interview questions that the interviewer asked the candidate.

Rules:
1. Extract actual questions asked by the interviewer, NOT self-introductions or the author's reflections.
2. Keep each question in its original language (Chinese or English).
3. If a question is described indirectly (e.g., "面试官让我设计一个xx"), rephrase it as a direct question (e.g., "请设计一个xx").
4. Skip generic icebreakers like "自我介绍" (self-introduction) unless it's specifically about PM skills.
5. Include follow-up questions if they are substantive.
6. For each question, note which interview round it was in (if mentioned).

Return a JSON array where each element has:
- "question": The interview question text
- "round": The interview round (e.g., "一面", "二面", "HR面") or null if unknown

Return ONLY the JSON array, no other text. If no questions found, return [].
Example: [{"question": "如何设计一个推荐系统？", "round": "一面"}]"""


class NowcoderScraper(BaseScraper):
    """Scraper for Nowcoder PM interview experiences"""

    COLLECTION_URL = 'https://www.nowcoder.com/experience/891'
    DETAIL_URL_TEMPLATE = 'https://www.nowcoder.com/feed/main/detail/{uuid}'

    def __init__(self):
        super().__init__(
            source_name='nowcoder',
            source_url=self.COLLECTION_URL
        )
        if OPENAI_API_KEY:
            self.llm_client = OpenAI(api_key=OPENAI_API_KEY)
        else:
            self.llm_client = None

    def scrape(self, days_back: int = 90) -> List[Dict]:
        if not self.llm_client:
            self.logger.error(
                "OPENAI_API_KEY required for Nowcoder scraper "
                "(LLM needed to extract questions from narrative posts)"
            )
            return []

        all_questions = []
        image_posts = []

        with sync_playwright() as p:
            self.logger.info("Launching browser...")
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/120.0.0.0 Safari/537.36'
                ),
                locale='zh-CN',
            )
            page = context.new_page()

            try:
                # Step 1: Get post list from collection page
                posts = self._fetch_post_list(page)
                self.logger.info(f"Found {len(posts)} experience posts")

                # Step 2: For each post, fetch detail and extract questions
                for i, post in enumerate(posts):
                    title_preview = post.get('title', 'Untitled')[:50]
                    self.logger.info(
                        f"Processing post {i+1}/{len(posts)}: {title_preview}..."
                    )

                    try:
                        content, has_images = self._fetch_post_content(page, post)

                        if has_images:
                            image_posts.append(post)

                        if not content or len(content.strip()) < 20:
                            self.logger.warning(
                                f"Post {post['uuid']} has no/minimal content, skipping"
                            )
                            continue

                        questions = self._extract_questions(content, post)
                        all_questions.extend(questions)

                        # Rate limit between detail page fetches
                        if i < len(posts) - 1:
                            time.sleep(1)

                    except Exception as e:
                        self.logger.error(
                            f"Error processing post {post.get('uuid')}: {str(e)}"
                        )
                        continue

            except Exception as e:
                self.logger.error(f"Error during scraping: {str(e)}", exc_info=True)
            finally:
                browser.close()

        # Report image posts
        if image_posts:
            self.logger.warning(
                f"⚠ {len(image_posts)} posts contain images that may include questions:"
            )
            for ip in image_posts:
                url = self.DETAIL_URL_TEMPLATE.format(uuid=ip['uuid'])
                self.logger.warning(
                    f"  - {ip.get('title', 'Untitled')[:60]}: {url}"
                )

        # Normalize
        normalized = [self._normalize_question(q) for q in all_questions]
        self.scraped_questions = normalized

        self.logger.info(f"Total questions extracted: {len(normalized)}")
        return normalized

    # ── Post List Extraction ──────────────────────────────────────────

    def _fetch_post_list(self, page) -> List[Dict]:
        """Fetch list of experience posts from collection page."""
        self.logger.info(f"Navigating to {self.COLLECTION_URL}")
        page.goto(self.COLLECTION_URL, wait_until='networkidle', timeout=30000)
        time.sleep(3)

        posts = []

        # Try __INITIAL_STATE__
        try:
            initial_state = page.evaluate('() => window.__INITIAL_STATE__')
            if initial_state:
                posts = self._parse_post_list_from_state(initial_state)
                self.logger.info(
                    f"Extracted {len(posts)} posts from __INITIAL_STATE__"
                )
        except Exception as e:
            self.logger.warning(f"Could not extract __INITIAL_STATE__: {str(e)}")

        # Scroll to load more posts (infinite scroll)
        if posts:
            for scroll_attempt in range(5):
                page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                time.sleep(2)

                try:
                    new_state = page.evaluate('() => window.__INITIAL_STATE__')
                    if new_state:
                        new_posts = self._parse_post_list_from_state(new_state)
                        existing_uuids = {p['uuid'] for p in posts}
                        added = 0
                        for np in new_posts:
                            if np['uuid'] not in existing_uuids:
                                posts.append(np)
                                added += 1
                        if added == 0:
                            break
                        self.logger.info(
                            f"Scroll {scroll_attempt+1}: loaded {added} more posts"
                        )
                except Exception:
                    break

        # Fallback: DOM parsing
        if not posts:
            self.logger.info("Trying DOM-based post extraction...")
            posts = self._parse_post_list_from_dom(page)

        return posts

    def _parse_post_list_from_state(self, state: Dict) -> List[Dict]:
        """Extract post list from __INITIAL_STATE__."""
        posts = []

        # Try momentData (dict of uuid -> post data)
        moment_data = self._find_in_dict(state, 'momentData')
        if isinstance(moment_data, dict):
            for key, value in moment_data.items():
                post = self._parse_post_from_moment(value)
                if post:
                    posts.append(post)

        # Try ssrInitList (list of post objects)
        ssr_list = self._find_in_dict(state, 'ssrInitList')
        if isinstance(ssr_list, list):
            existing_uuids = {p['uuid'] for p in posts}
            for item in ssr_list:
                if isinstance(item, dict):
                    uuid = item.get('uuid') or item.get('momentId')
                    if uuid and str(uuid) not in existing_uuids:
                        post = self._parse_post_from_moment(item)
                        if post:
                            posts.append(post)

        # Deep search fallback
        if not posts:
            posts = self._deep_search_posts(state)

        return posts

    def _deep_search_posts(self, state: Dict) -> List[Dict]:
        """Deep search for post-like objects in state."""
        posts = []
        self._search_posts_recursive(state, posts, depth=0)
        return posts

    def _search_posts_recursive(self, obj, posts: List[Dict], depth: int):
        if depth > 6:
            return
        if isinstance(obj, dict):
            if 'uuid' in obj and ('content' in obj or 'title' in obj):
                post = self._parse_post_from_moment(obj)
                if post:
                    existing_uuids = {p['uuid'] for p in posts}
                    if post['uuid'] not in existing_uuids:
                        posts.append(post)
            else:
                for v in obj.values():
                    self._search_posts_recursive(v, posts, depth + 1)
        elif isinstance(obj, list):
            for item in obj:
                self._search_posts_recursive(item, posts, depth + 1)

    def _parse_post_from_moment(self, data: Dict) -> Optional[Dict]:
        """Parse a post object from moment data."""
        if not isinstance(data, dict):
            return None

        uuid = data.get('uuid') or data.get('momentId') or data.get('id')
        if not uuid:
            return None

        title = data.get('title') or data.get('name') or ''
        content = data.get('content') or data.get('body') or ''
        company = data.get('companyName') or data.get('company') or ''

        # Try to extract company from title
        if not company and title:
            company = self._extract_company_from_title(title)

        return {
            'uuid': str(uuid),
            'title': title,
            'content': content,
            'company': company,
            'created_at': data.get('createTime') or data.get('createdAt'),
        }

    def _extract_company_from_title(self, title: str) -> str:
        """Extract company name from post title."""
        company_patterns = [
            (r'京东', '京东'),
            (r'腾讯', '腾讯'),
            (r'百度', '百度'),
            (r'字节跳动|字节|ByteDance', '字节跳动'),
            (r'快手', '快手'),
            (r'美团', '美团'),
            (r'阿里巴巴|阿里|蚂蚁', '阿里巴巴'),
            (r'华为', '华为'),
            (r'网易', '网易'),
            (r'小米', '小米'),
            (r'滴滴', '滴滴'),
            (r'拼多多', '拼多多'),
            (r'B站|哔哩哔哩', 'B站'),
            (r'货拉拉', '货拉拉'),
            (r'小红书', '小红书'),
            (r'抖音|TikTok', '抖音'),
            (r'微软|Microsoft', 'Microsoft'),
            (r'谷歌|Google', 'Google'),
        ]
        for pattern, name in company_patterns:
            if re.search(pattern, title):
                return name
        return ''

    def _parse_post_list_from_dom(self, page) -> List[Dict]:
        """Fallback: parse posts from DOM."""
        posts = []
        try:
            links = page.evaluate('''() => {
                const links = document.querySelectorAll('a[href*="/feed/main/detail/"]');
                return Array.from(links).map(a => ({
                    href: a.href,
                    text: a.textContent.trim()
                }));
            }''')

            seen_uuids = set()
            for link in links:
                uuid_match = re.search(r'/detail/([a-f0-9]+)', link['href'])
                if uuid_match:
                    uuid = uuid_match.group(1)
                    if uuid not in seen_uuids:
                        seen_uuids.add(uuid)
                        posts.append({
                            'uuid': uuid,
                            'title': link['text'][:100],
                            'content': '',
                            'company': self._extract_company_from_title(link['text']),
                        })
        except Exception as e:
            self.logger.error(f"DOM parsing failed: {str(e)}")

        return posts

    # ── Post Content Extraction ───────────────────────────────────────

    def _fetch_post_content(self, page, post: Dict) -> Tuple[str, bool]:
        """Fetch full content of a post. Returns (content_text, has_images)."""
        # If we already have substantial content from the list page, use it
        if post.get('content') and len(post['content']) > 200:
            has_images = bool(re.search(r'<img\s', post['content']))
            text = self._html_to_text(post['content'])
            return text, has_images

        # Visit the detail page
        detail_url = self.DETAIL_URL_TEMPLATE.format(uuid=post['uuid'])

        try:
            page.goto(detail_url, wait_until='networkidle', timeout=20000)
            time.sleep(2)

            # Try __INITIAL_STATE__
            try:
                state = page.evaluate('() => window.__INITIAL_STATE__')
                if state:
                    content_html = self._extract_content_from_detail_state(
                        state, post['uuid']
                    )
                    if content_html:
                        has_images = bool(re.search(r'<img\s', content_html))
                        text = self._html_to_text(content_html)

                        # Update company from detail page if missing
                        if not post.get('company'):
                            company = self._find_in_dict(state, 'companyName')
                            if company:
                                post['company'] = company

                        return text, has_images
            except Exception as e:
                self.logger.warning(f"Could not extract detail state: {str(e)}")

            # Fallback: DOM extraction
            try:
                content_html = page.evaluate('''() => {
                    const selectors = [
                        '.feed-detail-content',
                        '.moment-content',
                        '.rich-text',
                        'article',
                        '[class*="content"]'
                    ];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.innerHTML.length > 100) return el.innerHTML;
                    }
                    return '';
                }''')

                if content_html:
                    has_images = bool(re.search(r'<img\s', content_html))
                    text = self._html_to_text(content_html)
                    return text, has_images

            except Exception as e:
                self.logger.error(f"DOM content extraction failed: {str(e)}")

            return '', False

        except PlaywrightTimeout:
            self.logger.error(f"Timeout loading detail page: {detail_url}")
            return '', False

    def _extract_content_from_detail_state(
        self, state: Dict, uuid: str
    ) -> Optional[str]:
        """Extract post content from detail page __INITIAL_STATE__."""
        # Try common paths
        for key in ['momentData', 'feedData', 'detail', 'article']:
            data = self._find_in_dict(state, key)
            if isinstance(data, dict):
                # Direct content
                content = data.get('content') or data.get('body') or data.get('text')
                if content and len(content) > 50:
                    return content
                # Nested by uuid
                if uuid in data:
                    inner = data[uuid]
                    if isinstance(inner, dict):
                        content = inner.get('content') or inner.get('body')
                        if content:
                            return content

        # Deep search for the longest content string
        return self._find_longest_content(state)

    def _find_longest_content(self, obj, depth=0) -> Optional[str]:
        """Find the longest content string in nested data."""
        if depth > 5:
            return None

        best = None
        best_len = 200  # minimum threshold

        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in ('content', 'body', 'text', 'htmlContent') and isinstance(value, str):
                    if len(value) > best_len:
                        best = value
                        best_len = len(value)
                elif isinstance(value, (dict, list)):
                    result = self._find_longest_content(value, depth + 1)
                    if result and len(result) > best_len:
                        best = result
                        best_len = len(result)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    result = self._find_longest_content(item, depth + 1)
                    if result and len(result) > best_len:
                        best = result
                        best_len = len(result)

        return best

    # ── Utilities ─────────────────────────────────────────────────────

    def _find_in_dict(self, d: Dict, key: str, depth: int = 0):
        """Recursively find a key in nested dict."""
        if depth > 5 or not isinstance(d, dict):
            return None
        if key in d:
            return d[key]
        for v in d.values():
            if isinstance(v, dict):
                result = self._find_in_dict(v, key, depth + 1)
                if result is not None:
                    return result
        return None

    def _html_to_text(self, html: str) -> str:
        """Convert HTML content to clean text."""
        if not html:
            return ''

        soup = BeautifulSoup(html, 'lxml')

        # Remove script and style elements
        for tag in soup.find_all(['script', 'style']):
            tag.decompose()

        # Get text with line breaks preserved
        text = soup.get_text(separator='\n')

        # Clean up whitespace
        lines = [line.strip() for line in text.split('\n')]
        text = '\n'.join(line for line in lines if line)

        return text

    # ── LLM Question Extraction ───────────────────────────────────────

    def _extract_questions(self, content: str, post: Dict) -> List[Dict]:
        """Use LLM to extract interview questions from narrative text."""
        # Truncate very long content to stay within token limits
        if len(content) > 8000:
            content = content[:8000]

        company = post.get('company', '')
        title = post.get('title', '')

        user_message = f"Title: {title}\n\nContent:\n{content}"

        try:
            response = self.llm_client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {"role": "system", "content": EXTRACT_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.0,
                max_tokens=4000,
            )

            result_text = response.choices[0].message.content.strip()

            # Strip markdown code fences
            if result_text.startswith("```"):
                result_text = result_text.split("\n", 1)[1]
                if result_text.endswith("```"):
                    result_text = result_text[:-3]
                result_text = result_text.strip()

            extracted = json.loads(result_text)

            questions = []
            for item in extracted:
                q_text = item.get('question', '').strip()
                if q_text and len(q_text) > 5:
                    questions.append({
                        'content': q_text,
                        'company': company,
                        'url': self.DETAIL_URL_TEMPLATE.format(uuid=post['uuid']),
                        'type': None,  # classified by LLM processor later
                        'tags': [item.get('round')] if item.get('round') else [],
                        'published_at': post.get('created_at'),
                    })

            self.logger.info(f"  Extracted {len(questions)} questions from post")
            return questions

        except Exception as e:
            self.logger.error(
                f"LLM extraction failed for post {post.get('uuid')}: {str(e)}"
            )
            return []
