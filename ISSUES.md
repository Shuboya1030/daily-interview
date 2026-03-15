# Issues & Improvements Tracker

> 2026-02-13 部署后发现的问题和改进项

---

## P0 - 核心价值（不解决产品没意义）

### 1. 只有一个数据源 (PM Exercises)
- **问题**: 目前只爬取了 PM Exercises 一个网站，用户没有理由来这里而不是去原网站
- **核心价值**: 多源聚合才是这个产品的存在意义
- **策略**: 用户每周手动登录一次需要验证的网站，导出 Cookie，爬虫带 Cookie 爬取
- **候选数据源调研结果** (2026-02-13):

  | 数据源 | 题目数量 | 登录/反爬 | 可行性 | 优先级 |
  |--------|---------|-----------|--------|--------|
  | PM Exercises | 3000+ | 无需登录 | ✅ 已实现 | - |
  | StellarPeers | 未知 | 无需登录，JS动态加载(AJAX) | ✅ 需要Playwright | 高 |
  | Glassdoor | 大量 | Cloudflare反爬 + 登录 | ⚠️ Cookie方案可行 | 高 |
  | Nowcoder 牛客网 | 大量 | 登录 + 验证码 | ⚠️ Cookie方案可行 | 中 |
  | Exponent | 有限 | 部分内容付费墙 | ❌ 免费内容太少 | 低 |
  | IGotAnOffer | ~30 | 无需登录，静态页面 | ✅ 容易但量少 | 低 |

- **Cookie 半自动方案流程**:
  1. 用户在浏览器中手动登录目标网站（处理人机验证）
  2. 导出浏览器 Cookie（可用浏览器插件或开发者工具）
  3. Cookie 存储为 GitHub Secret 或本地文件
  4. 爬虫带 Cookie 请求，绕过登录
  5. 每周重复一次（Cookie 有效期通常 7-30 天）

### 2. 题目没有按频率排序
- **问题**: 当前按爬取时间排序，没有频率概念
- **核心价值**: 高频题识别是产品的核心差异化功能
- **依赖**: 需要多数据源 + GPT 相似度检测才有意义
- **建议方案**:
  - 先实现多源爬取
  - 然后用 GPT-4 做跨源相似度检测（threshold > 80%）
  - 相同题目合并后按频率降序排列

---

## P1 - 数据质量

### 3. 题目发布日期缺失
- **问题**: 当前显示的是爬取日期 (scraped_at)，而非题目原始发布日期
- **用户期望**: 看到题目在信息源上的发布时间
- **现状**: PM Exercises 有 Unix timestamp (`created` 字段) 但爬虫没提取
- **建议方案**: 更新爬虫，从页面底层数据中提取 `created` 字段并存入 `published_at`

### 4. 公司信息缺失
- **问题**: 所有20道题的 company 字段都是 null
- **现状**: PM Exercises 页面有 "Asked at Google" 等标签，但爬虫没提取到
- **建议方案**: 更新 CSS selector，正确提取公司标签

### 5. 只爬了1页（20道题）
- **问题**: PM Exercises 有 3000+ 道题，目前只爬了第一页的20道
- **原因**: 分页导航没有成功跳转到下一页
- **建议方案**: 调试分页逻辑，至少爬取前50-100页

---

## P2 - 用户体验

### 6. 部署环境变量容易出错
- **问题**: Vercel 环境变量手动输入时，anon key 被换行符破坏导致 500 错误
- **教训**: 长字符串粘贴时要注意不要引入换行
- **状态**: 已修复

### 7. GitHub Actions 连接数据库的 IPv6 问题
- **问题**: 直接连接 Supabase 使用 IPv6，GitHub Actions 不支持
- **解决**: 已改用 Transaction Pooler (IPv4, port 6543)
- **状态**: 已修复

### 8. GitHub Actions 版本过时
- **问题**: actions/upload-artifact@v3 已废弃
- **解决**: 已升级到 v4/v5
- **状态**: 已修复

---

## P3 - 未来增强

### 9. GPT 相似度检测系统未实现
- **说明**: Phase 2 功能，依赖多数据源
- **已准备**: OpenAI API Key 已配置为 GitHub Secret
- **代码**: similarity.py 已写好框架

### 10. 用户系统和个性化
- **说明**: Phase 3 功能
- **包括**: 收藏、笔记、学习计划

---

## 优先级建议

```
第一步: 加入更多数据源（P0-1）→ 产品有存在意义
第二步: 实现频率排序（P0-2）→ 核心差异化
第三步: 修复数据质量（P1）→ 用户体验提升
第四步: 后续增强（P2-P3）→ 产品迭代
```

---

## Backlog

- [ ] Admin 页面：点击视频可查看 transcript 全文
- [ ] 实现 RAG（用原始 transcript 替代 summary 生成 Expert Inspirations）
- [ ] Admin 页面：显示每个视频的 transcript 语言（中/英）
- [ ] 支持中文 transcript 的 Expert Inspirations 生成（双语知识库）

---

## 技术债务

- [ ] Playwright 版本锁定 (1.49.1)，需要定期更新
- [ ] 爬虫只在 GitHub Actions (Ubuntu) 上测试过，本地 Windows 无法运行
- [ ] 数据库没有定期备份策略
- [ ] 没有监控和告警（爬虫失败时只有 GitHub Actions 日志）
