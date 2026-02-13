# Daily Interview - PM面试高频题智能平台

> 不求大而全，但求精而准

## 🎯 项目简介

自动聚合Product Manager面试题，使用AI识别高频考点，帮助求职者高效准备面试。

**核心功能：**
- 🕷️ 自动爬取3大高质量信息源
- 🤖 GPT-4智能识别相似题目
- 📊 按频率排序，优先展示高频题
- 🔍 多维度筛选（公司、题型、时间）
- ✅ 100% Grounded - 所有题目标注来源

## 🏗️ 技术栈

- **前端**: Next.js 14 + TypeScript + Tailwind CSS
- **数据库**: PostgreSQL (Supabase)
- **爬虫**: Python + Playwright + Scrapy
- **AI**: OpenAI GPT-4
- **部署**: Vercel + GitHub Actions

## 📦 快速开始

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 配置环境变量

复制 \`.env.example\` 到 \`.env.local\`：

\`\`\`bash
cp .env.example .env.local
\`\`\`

填写你的环境变量：
- Supabase URL 和 Keys
- OpenAI API Key

### 3. 运行开发服务器

\`\`\`bash
npm run dev
\`\`\`

访问 http://localhost:3000

## 🗄️ 数据库设置

1. 在 [Supabase](https://supabase.com) 创建项目
2. 执行 \`database/schema.sql\` 创建表结构
3. 将连接信息添加到 \`.env.local\`

## 🕷️ 爬虫设置

详见 \`scrapers/README.md\`

## 📚 项目结构

\`\`\`
pm-interview-tracker/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── questions/         # 题目页面
│   ├── lib/              # 工具函数
│   └── types/            # TypeScript类型
├── scrapers/              # Python爬虫
│   ├── scrapers/         # 爬虫实现
│   ├── processors/       # 数据处理
│   └── database/         # 数据库操作
├── database/              # 数据库Schema
└── docs/                  # 文档
    ├── PRODUCT_BRIEF.md
    └── TECHNICAL_ARCHITECTURE.md
\`\`\`

## 🚀 部署

### Vercel部署

1. 连接GitHub仓库到Vercel
2. 配置环境变量
3. 自动部署

### GitHub Actions爬虫

爬虫通过GitHub Actions每天自动运行，配置见 \`.github/workflows/daily-scraper.yml\`

## 📄 许可

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！
