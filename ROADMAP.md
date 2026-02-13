# 🗺️ Daily Interview - 产品路线图

## 📍 当前状态（2026-02-12）

### ✅ 已完成
- [x] Next.js 14 前端框架搭建
- [x] PostgreSQL 数据库Schema设计
- [x] Python爬虫架构（base类、数据库操作、标准化）
- [x] 3个爬虫实现（PM Exercises, 牛客网, StellarPeers）
- [x] 前端UI（题目列表页、筛选器）
- [x] API路由（/api/questions, /api/filters）
- [x] GitHub Actions workflow配置
- [x] 完整文档（Product Brief, Technical Architecture, Deployment Guide）

### 🧪 爬虫测试结果
| 信息源 | 题目量 | 登录需求 | 验证码 | 可用性 |
|--------|--------|----------|--------|--------|
| **PM Exercises** | 3135题 | ❌ 否 | ❌ 否 | ✅ 优秀 |
| **StellarPeers** | 未知 | ❌ 否 | ❌ 否 | ⚠️ 需优化导航 |
| **牛客网** | 未知 | ✅ 是 | ✅ 是 | ❌ 需处理登录 |

---

## 🚀 Phase 1: MVP部署（1-2小时）

**目标：** 快速上线可用的产品，验证概念

### 任务清单

#### 1.1 数据库设置（10分钟）
- [ ] 访问 https://supabase.com 创建账号
- [ ] 创建新项目 `daily-interview`
  - [ ] 设置数据库密码（记录在安全的地方）
  - [ ] 选择区域：Singapore (Southeast Asia)
- [ ] 执行Schema
  - [ ] 进入SQL Editor
  - [ ] 复制 `database/schema.sql` 内容
  - [ ] 运行SQL
  - [ ] 验证：Table Editor中看到5个表
  - [ ] 验证：companies表有14条数据
- [ ] 获取连接信息
  - [ ] Settings → API → 复制Project URL
  - [ ] 复制 anon public key
  - [ ] Settings → Database → 复制Connection string
  - [ ] 替换密码到Connection string

**保存的信息：**
```
Project URL: https://xxxxx.supabase.co
Anon Key: eyJhbGc...
Database URL: postgresql://postgres.xxxxx:[PASSWORD]@...
```

#### 1.2 调整爬虫代码（5分钟）
- [ ] 修改 `scrapers/config.py`，MVP只启用PM Exercises：
  ```python
  SOURCES = {
      'pm_exercises': {
          'enabled': True,
          'priority': 'critical'
      },
      'nowcoder': {
          'enabled': False,  # Phase 2再启用
          'priority': 'high'
      },
      'stellarpeers': {
          'enabled': False,  # Phase 2再启用
          'priority': 'medium'
      }
  }
  ```

#### 1.3 推送代码到GitHub（5分钟）
- [ ] 初始化Git仓库
  ```bash
  cd pm-interview-tracker
  git init
  git add .
  git commit -m "Initial commit: Daily Interview MVP"
  ```
- [ ] 在GitHub创建新仓库
  - [ ] 访问 https://github.com/new
  - [ ] 仓库名：`daily-interview` 或 `pm-interview-tracker`
  - [ ] 设为Private（可选）
  - [ ] 不要勾选任何初始化选项
- [ ] 推送代码
  ```bash
  git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
  git branch -M main
  git push -u origin main
  ```

#### 1.4 部署到Vercel（5分钟）
- [ ] 访问 https://vercel.com
- [ ] 登录（用GitHub账号）
- [ ] 点击 "Import Project"
- [ ] 选择刚创建的GitHub仓库
- [ ] 配置环境变量：
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` = [你的Project URL]
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = [你的Anon Key]
- [ ] 点击 "Deploy"
- [ ] 等待部署完成（约2分钟）
- [ ] 获取网站URL：`https://your-project.vercel.app`

#### 1.5 配置GitHub Actions（5分钟）
- [ ] 进入GitHub仓库
- [ ] Settings → Secrets and variables → Actions
- [ ] 添加Secrets：
  - [ ] `DATABASE_URL` = [你的Database Connection String]
  - [ ] `OPENAI_API_KEY` = `skip`（暂时不需要，Phase 2再加）
- [ ] 手动触发第一次运行
  - [ ] Actions tab → Daily Scraper → Run workflow
  - [ ] 等待运行完成（约10-15分钟）
- [ ] 检查日志，确认爬取成功

#### 1.6 验证部署（5分钟）
- [ ] 访问Vercel提供的网站URL
- [ ] 检查首页是否正常显示
- [ ] 点击"开始浏览题目"
- [ ] 验证题目列表显示（应该有几百到上千道题）
- [ ] 测试筛选器功能
- [ ] 点击"查看原文"链接，确认跳转正确

### ✅ Phase 1 完成标志
- ✅ 网站可以访问
- ✅ 显示至少500+道题目
- ✅ 筛选器正常工作
- ✅ 爬虫每天自动运行

**预计时间：1-2小时**
**预计题目量：800-1500道（仅PM Exercises）**

---

## 🔧 Phase 2: 功能增强（1-2周）

**目标：** 添加更多数据源，实现智能排序

### 2.1 增加数据源

#### Task 2.1.1: 优化StellarPeers爬虫
- [ ] 分析StellarPeers的实际题库页面结构
- [ ] 修改爬虫，添加多层导航逻辑
- [ ] 测试并验证数据质量
- [ ] 更新 `config.py`，启用StellarPeers

**预计增加：** 200-500道题目

#### Task 2.1.2: 解决牛客网登录问题

**方案A：使用Cookie（推荐）**
- [ ] 手动在浏览器登录牛客网
- [ ] 使用浏览器开发者工具获取Cookie
  - F12 → Application → Cookies
  - 复制关键Cookie（通常是session相关）
- [ ] 修改爬虫代码，添加Cookie：
  ```python
  context = browser.new_context(
      storage_state={
          'cookies': [
              {
                  'name': 'cookie_name',
                  'value': 'cookie_value',
                  'domain': '.nowcoder.com',
                  'path': '/'
              }
          ]
      }
  )
  ```
- [ ] 将Cookie添加到GitHub Secrets
- [ ] 测试爬虫是否能成功登录

**方案B：半自动登录**
- [ ] 修改爬虫，使用 `page.pause()` 在登录页面暂停
- [ ] 手动完成验证码
- [ ] 保存登录状态供后续使用

**预计增加：** 500-1000道题目（中文题库）

### 2.2 实现GPT相似度检测

#### Task 2.2.1: 启用GPT API
- [ ] 获取OpenAI API Key（https://platform.openai.com）
- [ ] 添加到GitHub Secrets：`OPENAI_API_KEY`
- [ ] 修改 `scrapers/main.py`，启用相似度检测逻辑：
  ```python
  # 取消注释GPT相似度检测代码
  from processors.similarity import SimilarityDetector
  detector = SimilarityDetector(threshold=0.8)
  # ... 相似度检测流程
  ```

#### Task 2.2.2: 实现题目合并
- [ ] 运行爬虫，GPT自动检测相似题目
- [ ] 合并相似题目到 `merged_questions` 表
- [ ] 更新频率统计
- [ ] 验证数据正确性

#### Task 2.2.3: 前端展示优化
- [ ] 修改API，从 `merged_questions` 读取数据
- [ ] 按频率降序排序
- [ ] 显示频率标签（"🔥 出现8次"）
- [ ] 详情页显示所有来源链接

**成本估算：** $15-30/月（GPT-4 API）

### 2.3 UI/UX优化
- [ ] 添加题目详情页（独立路由）
- [ ] 实现分页加载（当前只显示100条）
- [ ] 添加搜索功能（搜索题目内容）
- [ ] 优化移动端适配
- [ ] 添加Loading状态和错误处理

### ✅ Phase 2 完成标志
- ✅ 3个数据源都正常工作
- ✅ 总题目量达到2000+
- ✅ GPT相似度检测正常运行
- ✅ 高频题目排在前面
- ✅ 每道题显示出现频率

---

## 🌟 Phase 3: 高级功能（1-2个月）

**目标：** 打造完整的智能面试准备平台

### 3.1 数据分析和Insights

#### Task 3.1.1: 趋势分析
- [ ] 记录每次爬取的时间戳
- [ ] 分析题目出现频率的时间变化
- [ ] 识别"最近热门"题目（最近1个月新增）
- [ ] 生成趋势报告
  - "Product Design题型增加30%"
  - "Google最近常问AI相关题目"

#### Task 3.1.2: 公司面试特点分析
- [ ] 统计各公司的题型分布
- [ ] 生成公司Insights
  - "Google 60%是Product Design"
  - "Amazon重视Metrics题"
- [ ] 在公司筛选器旁显示特点

#### Task 3.1.3: 智能推荐
- [ ] 基于用户浏览历史推荐相关题目
- [ ] "准备Google面试？优先看这20道高频题"
- [ ] 个性化学习路径

### 3.2 用户功能

#### Task 3.2.1: 用户系统
- [ ] 集成身份认证（Supabase Auth或NextAuth）
- [ ] 支持Google/GitHub登录

#### Task 3.2.2: 个人Dashboard
- [ ] 收藏题目
- [ ] 标记"已准备"/"需要复习"
- [ ] 学习进度追踪
- [ ] 个人笔记

#### Task 3.2.3: 4小时通关计划
- [ ] 根据目标公司生成学习计划
- [ ] "Google PM面试：20道必看题，预计4小时"
- [ ] 进度条和完成度显示

### 3.3 内容质量

#### Task 3.3.1: 题目答案收集
- [ ] 爬取PM Exercises的答案（如果有）
- [ ] 整合优质回答
- [ ] 显示高票答案摘要

#### Task 3.3.2: 题目标签系统
- [ ] 自动识别题目难度（Easy/Medium/Hard）
- [ ] 添加细分标签（Growth, Strategy, Metrics等）
- [ ] 支持多标签筛选

#### Task 3.3.3: 用户贡献
- [ ] 允许用户提交面试题
- [ ] 审核机制（确保质量）
- [ ] 用户评分和反馈

### 3.4 商业化（可选）

#### Task 3.4.1: 免费增值模式
- [ ] 免费用户：查看高频题（Top 100）
- [ ] 付费用户：
  - 查看所有题目
  - AI生成的答案思路
  - 个性化学习计划
  - 无广告体验

#### Task 3.4.2: 会员系统
- [ ] 集成Stripe支付
- [ ] 月订阅：$9.99/月
- [ ] 年订阅：$79.99/年

### ✅ Phase 3 完成标志
- ✅ 完整的用户系统
- ✅ 个性化学习体验
- ✅ 趋势分析和Insights
- ✅ 可持续的商业模式

---

## 🐛 已知问题和待解决

### 技术债务
- [ ] **Windows环境Python包编译问题**
  - 影响：本地开发困难
  - 解决方案：使用WSL2或直接在Linux环境开发
  - 优先级：P2（不影响线上部署）

- [ ] **爬虫反爬对策**
  - 影响：可能被封IP或要求验证
  - 解决方案：
    - 增加随机延迟
    - 使用代理IP池
    - 降低爬取频率
  - 优先级：P1（等遇到问题再处理）

### 功能缺失
- [ ] **题目去重不完善**
  - 当前：Phase 1不做去重
  - Phase 2：实现GPT相似度检测
  - 优先级：P0（Phase 2必须完成）

- [ ] **无分页功能**
  - 当前：只显示前100条
  - 影响：题目多了之后性能问题
  - 优先级：P2

- [ ] **无搜索功能**
  - 当前：只能通过筛选器过滤
  - 影响：用户体验
  - 优先级：P2

---

## 📊 里程碑时间表

| 阶段 | 时间 | 目标 | 题目量 | 状态 |
|------|------|------|--------|------|
| **Phase 1** | Week 1 | MVP上线 | 800-1500 | 🔄 进行中 |
| **Phase 2** | Week 2-3 | 功能增强 | 2000-3000 | ⏳ 待开始 |
| **Phase 3** | Month 2-3 | 完整平台 | 3000+ | ⏳ 待开始 |

---

## 🎯 成功指标

### Phase 1 KPIs
- ✅ 网站成功部署
- ✅ 题目数量 > 500
- ✅ 爬虫每天自动运行成功率 > 95%
- ✅ 页面加载时间 < 2秒

### Phase 2 KPIs
- ✅ 题目数量 > 2000
- ✅ 高频题识别准确率 > 80%
- ✅ 3个数据源都正常工作
- ✅ GPT API成本 < $30/月

### Phase 3 KPIs
- ✅ 月活用户 > 100
- ✅ 用户留存率 > 40%
- ✅ 平均使用时长 > 10分钟
- ✅ 用户反馈NPS > 50

---

## 💡 优化建议

### 性能优化
- [ ] 实现Redis缓存（缓存题目列表）
- [ ] 使用CDN加速静态资源
- [ ] 数据库查询优化（索引、分页）
- [ ] 图片懒加载

### SEO优化
- [ ] 添加meta标签（description, keywords）
- [ ] 生成sitemap.xml
- [ ] 实现Server-Side Rendering（已有，Next.js）
- [ ] 添加结构化数据（JSON-LD）

### 监控和分析
- [ ] 集成Google Analytics
- [ ] 添加错误监控（Sentry）
- [ ] 爬虫运行日志分析
- [ ] 用户行为分析

---

## 📝 文档更新

### 需要持续更新的文档
- [ ] **README.md** - 项目介绍和快速开始
- [ ] **DEPLOYMENT.md** - 部署步骤（每次架构变化都要更新）
- [ ] **ROADMAP.md** - 本文档（每完成一个任务就更新）
- [ ] **CHANGELOG.md** - 记录每次版本更新的内容

### 新文档需求
- [ ] **API.md** - API文档（Phase 2需要）
- [ ] **CONTRIBUTING.md** - 贡献指南（开源时需要）
- [ ] **TROUBLESHOOTING.md** - 常见问题解决

---

## 🎉 下一步行动

**立即执行（现在）：**
1. ✅ 阅读本Roadmap，理解整体计划
2. 🔄 继续创建Supabase数据库（Phase 1.1）
3. 🔄 按照DEPLOYMENT.md完成部署

**本周完成：**
- Phase 1的所有任务
- 网站上线，爬虫运行

**下周开始：**
- Phase 2的数据源扩展
- GPT相似度检测

---

**📌 重要提示：** 每完成一个任务，就在对应的checkbox打勾 ✅

祝部署顺利！🚀
