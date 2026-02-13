# Technical Architecture - Daily Interview

## 🎯 核心要求

1. **每天能爬取信息源** - 定时自动化
2. **Scalable** - 支持扩展到更多信息源和更大数据量
3. **准确全面** - 数据质量和覆盖度优先
4. **部署在Vercel** - 前端和API托管

---

## 🏗️ 推荐技术栈

### 前端
```
Next.js 14 (React框架)
├── TypeScript
├── Tailwind CSS (样式)
├── shadcn/ui (组件库)
└── SWR / TanStack Query (数据获取)
```

**为什么选Next.js？**
- ✅ 与Vercel原生集成，部署零配置
- ✅ 服务端渲染（SSR）+ 静态生成（SSG）→ SEO友好
- ✅ API Routes → 可以处理后端逻辑
- ✅ 自动代码分割 → 性能优化
- ✅ 生态成熟，开发效率高

### 后端API
```
Next.js API Routes (Serverless Functions)
├── 部署在Vercel Edge Functions
├── 处理前端请求
└── 连接数据库
```

**为什么用Serverless？**
- ✅ 自动扩展（满足scalable要求）
- ✅ 按需付费，成本低
- ✅ 与Vercel无缝集成
- ❌ 限制：单个函数最长10秒（Hobby）或60秒（Pro）

### 数据库
```
PostgreSQL (Supabase 或 Neon)
├── 关系型数据库
├── 支持全文搜索
├── JSON字段存储灵活数据
└── 与Vercel集成良好
```

**为什么选PostgreSQL？**
- ✅ 结构化数据（题目、公司、来源关系清晰）
- ✅ 强大的查询能力（JOIN、聚合、排序）
- ✅ 支持全文搜索（pg_trgm, ts_vector）
- ✅ JSONB字段存储灵活的元数据
- ✅ Supabase提供免费tier + 实时订阅功能
- ✅ Scalable：支持百万级数据

**替代方案：**
- MongoDB：更灵活，但关系查询较弱，不推荐

### 爬虫系统（关键！）
```
独立爬虫服务（不在Vercel运行）
├── Python (Scrapy + Playwright)
├── 定时任务触发
└── 爬取结果写入PostgreSQL
```

**部署方案：**

**Option A: GitHub Actions（推荐MVP）** ⭐
```yaml
# .github/workflows/daily-scraper.yml
schedule:
  - cron: '0 2 * * *'  # 每天凌晨2点UTC运行
```
- ✅ 免费（每月2000分钟免费）
- ✅ 与Git仓库集成，版本管理方便
- ✅ 日志可追溯
- ✅ 简单易维护
- ❌ 限制：单个job最长6小时

**Option B: Railway / Render**
- 部署独立的定时任务服务
- 成本：$5-10/月
- 更稳定，适合Production

**Option C: AWS Lambda + EventBridge**
- 完全serverless
- 按需付费
- 配置稍复杂

**MVP推荐：GitHub Actions**

### AI相似度检测
```
OpenAI API (GPT-4-turbo)
├── 在爬虫pipeline中调用
├── 批量处理优化成本
└── 结果缓存
```

---

## 📊 数据流架构

```
┌─────────────────────────────────────────────────┐
│         Daily Scraping (GitHub Actions)         │
│                                                   │
│  ┌──────────────┐    ┌──────────────┐           │
│  │ PM Exercises │    │  Nowcoder    │           │
│  │   Scraper    │    │   Scraper    │  ...      │
│  └──────┬───────┘    └──────┬───────┘           │
│         │                   │                    │
│         └───────┬───────────┘                    │
│                 ↓                                 │
│         ┌───────────────┐                        │
│         │ Data Cleaning │                        │
│         │  Normalization│                        │
│         └───────┬───────┘                        │
│                 ↓                                 │
│         ┌───────────────┐                        │
│         │  GPT-4 API    │                        │
│         │  Similarity   │                        │
│         │  Detection    │                        │
│         └───────┬───────┘                        │
│                 ↓                                 │
│         ┌───────────────┐                        │
│         │  PostgreSQL   │                        │
│         │   (Supabase)  │                        │
│         └───────┬───────┘                        │
└─────────────────┼───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│          Next.js App (Vercel)                   │
│                                                   │
│  ┌──────────────┐         ┌──────────────┐      │
│  │   Frontend   │ ←────→  │  API Routes  │      │
│  │  (React UI)  │         │ (Serverless) │      │
│  └──────────────┘         └──────┬───────┘      │
│                                   │              │
│                                   ↓              │
│                           ┌───────────────┐      │
│                           │  PostgreSQL   │      │
│                           │   (Query)     │      │
│                           └───────────────┘      │
└─────────────────────────────────────────────────┘
                  ↓
           ┌──────────────┐
           │     User     │
           └──────────────┘
```

---

## 🗄️ 数据库Schema设计

### 核心表结构

```sql
-- 原始题目表（爬取的原始数据）
CREATE TABLE raw_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source VARCHAR(50) NOT NULL,  -- 'pm_exercises', 'nowcoder', etc.
  source_url TEXT NOT NULL,
  company VARCHAR(100),
  question_type VARCHAR(50),
  metadata JSONB,  -- 答案数、浏览量等灵活数据
  scraped_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 合并后的题目表（高频题）
CREATE TABLE merged_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_content TEXT NOT NULL,  -- 标准版本的题目内容
  frequency INT DEFAULT 1,  -- 出现次数
  question_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 题目关联表（原始题目 -> 合并题目）
CREATE TABLE question_mappings (
  raw_question_id UUID REFERENCES raw_questions(id),
  merged_question_id UUID REFERENCES merged_questions(id),
  similarity_score FLOAT,  -- GPT计算的相似度
  PRIMARY KEY (raw_question_id, merged_question_id)
);

-- 公司表
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(20),  -- 'FAANG', 'Unicorn', 'Big Tech'
  industry VARCHAR(50),  -- 'Fintech', 'AI', etc.
  logo_url TEXT
);

-- 题目-公司关联表
CREATE TABLE question_companies (
  merged_question_id UUID REFERENCES merged_questions(id),
  company_id UUID REFERENCES companies(id),
  PRIMARY KEY (merged_question_id, company_id)
);

-- 索引优化
CREATE INDEX idx_merged_questions_frequency ON merged_questions(frequency DESC);
CREATE INDEX idx_merged_questions_type ON merged_questions(question_type);
CREATE INDEX idx_raw_questions_published ON raw_questions(published_at DESC);
CREATE INDEX idx_question_companies_merged ON question_companies(merged_question_id);
```

---

## 🕷️ 爬虫系统设计

### 项目结构
```
scrapers/
├── config.py              # 配置（数据库连接、API keys）
├── requirements.txt       # Python依赖
├── scrapers/
│   ├── base.py           # 基础爬虫类
│   ├── pm_exercises.py   # PM Exercises爬虫
│   ├── nowcoder.py       # 牛客网爬虫
│   └── stellarpeers.py   # StellarPeers爬虫
├── processors/
│   ├── cleaner.py        # 数据清洗
│   ├── normalizer.py     # 标准化（公司名、题型）
│   └── similarity.py     # GPT相似度检测
├── database/
│   └── db.py             # 数据库操作
└── main.py               # 主入口
```

### 爬虫Pipeline

```python
# main.py 伪代码
def daily_scrape():
    # 1. 爬取所有源
    raw_questions = []
    for scraper in [PMExercisesScraper(), NowcoderScraper(), StellarPeersScraper()]:
        questions = scraper.scrape(days=90)  # 最近3个月
        raw_questions.extend(questions)

    # 2. 数据清洗和标准化
    cleaned = normalize_data(raw_questions)

    # 3. 存入raw_questions表
    db.insert_raw_questions(cleaned)

    # 4. GPT相似度检测（只处理新题目）
    new_questions = get_unprocessed_questions()
    for new_q in new_questions:
        # 与现有merged_questions对比
        similar_q = find_similar_with_gpt(new_q, threshold=0.8)

        if similar_q:
            # 合并到现有题目
            merge_to_existing(new_q, similar_q)
        else:
            # 创建新的merged_question
            create_new_merged(new_q)

    # 5. 更新频率统计
    update_frequency_counts()
```

### 反爬策略
- User-Agent轮换
- 请求延迟（random.uniform(1, 3)秒）
- IP代理池（如需要）
- 错误重试机制

---

## 🚀 部署流程

### 1. Vercel部署（前端 + API）
```bash
# 自动部署
git push origin main
# Vercel自动构建和部署
```

### 2. 数据库设置（Supabase）
```bash
# 创建Supabase项目
# 执行schema.sql创建表结构
# 获取连接字符串添加到环境变量
```

### 3. GitHub Actions爬虫
```yaml
# .github/workflows/daily-scraper.yml
name: Daily Scraper
on:
  schedule:
    - cron: '0 2 * * *'  # 每天UTC 2:00
  workflow_dispatch:  # 手动触发

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r scrapers/requirements.txt
      - run: python scrapers/main.py
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## 💰 成本估算

| 服务 | 用途 | 成本 |
|------|------|------|
| Vercel Hobby | 前端+API托管 | $0/月（免费tier够用） |
| Supabase Free | PostgreSQL数据库 | $0/月（500MB存储，够MVP） |
| GitHub Actions | 爬虫定时任务 | $0/月（2000分钟免费） |
| OpenAI API | GPT-4相似度检测 | ~$15-30/月（估算） |
| **总计** | | **$15-30/月** |

---

## 📈 扩展性考虑

### 数据量增长
- 预估：3个源 × 2000题 = 6000题
- PostgreSQL可轻松支持百万级
- 索引优化保证查询性能

### 添加新信息源
- 新建scraper类继承BaseScraper
- 添加到pipeline
- 无需修改核心逻辑

### 性能优化
- CDN（Vercel自动）
- 数据库查询缓存（SWR）
- API响应缓存（Next.js ISR）

---

## ✅ 为什么这个架构满足核心要求？

| 要求 | 解决方案 | ✓ |
|------|----------|---|
| **每天能爬取** | GitHub Actions定时任务 | ✅ |
| **Scalable** | Vercel自动扩展 + PostgreSQL | ✅ |
| **准确全面** | 3个高质量源 + GPT智能去重 | ✅ |
| **部署Vercel** | Next.js原生支持 | ✅ |

---

## 🎯 MVP实现优先级

**Week 1-2: 基础设施**
1. 数据库schema设计和创建
2. Next.js项目搭建
3. 基础UI（列表页、详情页）

**Week 3-4: 爬虫系统**
1. 开发3个scraper
2. 数据清洗和标准化
3. GitHub Actions配置

**Week 5: AI集成**
1. GPT相似度检测
2. 题目合并逻辑
3. 频率统计

**Week 6: 测试和优化**
1. 端到端测试
2. 性能优化
3. 部署到Production
