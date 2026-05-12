# Hermes-WorkBuddy Fusion Bridge

<p align="center">
  <b>双向 MCP 桥接融合系统 — 实现 Hermes Agent 与 WorkBuddy 的能力互通</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue" alt="version">
  <img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="node">
  <img src="https://img.shields.io/badge/hermes-%3E%3D0.12.0-purple" alt="hermes">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license">
  <img src="https://img.shields.io/badge/phases-8%2F8-brightgreen" alt="phases">
</p>

---

## 目录

- [架构总览](#架构总览)
- [快速开始](#快速开始)
- [模块说明](#模块说明)
- [API 参考](#api-参考)
- [配置指南](#配置指南)
- [故障排除](#故障排除)
- [贡献指南](#贡献指南)

---

## 架构总览

```
                        ┌──────────────────────┐
                        │    Fusion Router v2    │
                        │  TF-IDF 语义 + 自适应   │
                        │  18 规则 · 3 路由目标   │
                        └──────────┬───────────┘
                                   │
     ┌─────────────────────────────┼──────────────────────────────┐
     │                             │                              │
┌────▼─────────────┐  ┌────────────▼───────────┐  ┌──────────────▼─────────┐
│ Memory Sync v2   │  │ Conflict Detector v1   │  │ Fusion Dashboard       │
│ 增量 MD5 哈希    │  │ 三维冲突检测            │  │ 健康评分 + 实时监控     │
│ 智能段落合并      │  │ 自动修复 + 健康评分     │  │ 路由/同步/冲突面板      │
└────┬─────────────┘  └────────────────────────┘  └────────────────────────┘
     │
     ├── WB → HM: 记忆同步 + 增量检测 + 快照回滚
     ├── HM → WB: evolution + skills knowledge
     └── Memory Merge: WB 优先的段落级合并
     │
┌────▼─────────────┐  ┌──────────────────────────────────────────────────┐
│  Hermite Bridge  │  │  Fusion Deep                                      │
│  WB → Hermes     │  │  记忆注入 + 技能镜像 + 进化同步 + 自动 Cron       │
│  13 工具         │  └──────────────────────────────────────────────────┘
└────┬─────────────┘
     │
┌────▼─────────────┐  ┌──────────────────────────────────────────────────┐
│     Hermes       │  │   WorkBuddy                                      │
│  22+ Skills      │◄─────────── MCP ─────────────►                      │
│  浏览器/文件/Cron │  │   50+ Skills                                      │
│  本地模型推理     │  │   量化/金融/文档/代码                              │
└──────────────────┘  └──────────────────────────────────────────────────┘
```

### 能力融合矩阵

| 能力领域 | WorkBuddy | Hermes | 融合后 |
|---------|:---------:|:------:|:------:|
| 量化分析 / 技术面 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| 文档 / 报告生成 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Skill 生态管理 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| 浏览器自动化 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 文件操作 / 搜索 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 定时任务 / Cron | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 本地模型推理 | - | ⭐⭐⭐ | ⭐⭐⭐ |
| 金融数据 (Tushare) | ⭐⭐⭐ | - | ⭐⭐⭐ |
| 智能任务路由 | - | - | ⭐⭐⭐ |
| 冲突检测与修复 | - | - | ⭐⭐⭐ |

---

## 快速开始

### 环境要求

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 22 | JavaScript 运行时 |
| Hermes Agent | >= 0.12.0 | 本地 AI Agent |
| Ollama | 任意 | 本地模型服务 (Hermes 依赖) |
| WorkBuddy | 最新版 | AI 编程助手 |

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/zhuang-HE/Hermes-WorkBuddy-Fusion-Bridge.git
cd Hermes-WorkBuddy-Fusion-Bridge

# 2. 检查环境
node -v          # 需 >= 22
hermes --version  # 需 >= 0.12.0
ollama list       # 确认模型已安装
```

### 三步启动

```bash
# Step 1: 配置双向 MCP 桥接
node fusion-cli.js setup

# Step 2: 运行首次记忆同步 (增量模式)
node memory-sync.js sync

# Step 3: 扫描系统健康状态
node conflict-detector.js scan
```

---

## 模块说明

### 1. Fusion Router v2.0 (`plugins/fusion-router/index.js`)

智能任务路由 — TF-IDF 语义 + 关键词混合匹配，自适应权重学习。

**四层路由架构：**
1. **关键词匹配** — 精确关键词命中
2. **TF-IDF 语义** — CJK bigram 分词 + 余弦相似度
3. **能力级匹配** — 基于规则优先级排序
4. **上下文感知** — 最近任务历史的工作流连续性加成

**18 条路由规则：**

| 目标 | 规则 | 优先级 |
|------|------|:------:|
| WorkBuddy (9) | 量化金融、文档处理、保险产品、数据分析、代码审查、研究分析、多模态生成、知识管理、AI生成 | 65-90 |
| Hermes (5) | 浏览器自动化、文件操作、系统管理、实时交互、本地推理 | 70-85 |
| Both (4) | 竞品分析、爬取分析、大项目、自动化工作流 | 80-92 |

**自适应权重：** 基于反馈动态调整规则权重 (0.5x-1.5x)

### 2. Memory Sync v2.0 (`memory-sync.js`)

双向记忆同步 — MD5 增量检测 + 智能段落合并 + 快照回滚。

```bash
node memory-sync.js sync      # 双向增量同步
node memory-sync.js wb2hm     # WorkBuddy → Hermes
node memory-sync.js hm2wb     # Hermes → WorkBuddy
node memory-sync.js --force   # 强制全量同步
node memory-sync.js history   # 同步历史 + 快照
node memory-sync.js status    # 查看同步状态
node memory-sync.js --dry-run # 预览（不写入）
```

**v2.0 新特性：**
- MD5 哈希增量检测 — 跳过未变更文件
- 智能段落合并 — MEMORY.md WB 优先的 section-level merge
- 快照与回滚 — 每次同步记录快照，支持回滚到历史版本
- 自适应频率 — 无变更时自动跳过

### 3. Conflict Detector v1.0 (`conflict-detector.js`) 🆕

三维冲突检测引擎 — 记忆内容、路由决策、系统状态一致性检测。

```bash
node conflict-detector.js scan     # 扫描冲突
node conflict-detector.js fix      # 自动修复
node conflict-detector.js history  # 冲突历史
```

**三维检测：**
1. **Memory Conflict** — 双向记忆内容冲突 (Jaccard 相似度 + 主题匹配)
2. **Route Conflict** — 路由决策冲突 (相似任务矛盾路由、低置信度告警)
3. **State Conflict** — 系统状态不一致 (prefill 缺失、过期 sync 文件)

**健康评分：** 基于严重度扣分制 (100 - highx20 - mediumx8 - lowx2)

### 4. Fusion Dashboard (`fusion-dashboard.html`) 🆕

统一 Web 监控面板 — 可视化融合系统运行状态。

```bash
node refresh-dashboard.js   # 注入最新数据
# 然后打开 fusion-dashboard.html
```

**面板组件：**
- 融合健康评分 (动态 SVG 环形图)
- 7 个系统组件实时状态
- 6 个核心指标卡片
- 路由分发比例可视化 (堆叠条形图)
- 最近路由记录 + 同步时间线
- 冲突检测面板 (severity 分级)

### 5. Fusion Deep (`fusion-deep.js`)

深度融合引擎 — 让 Hermes 自动学习 WorkBuddy 的记忆、技能和进化经验。

```bash
node fusion-deep.js deep-sync   # 一键深度融合
node fusion-deep.js inject      # 记忆注入
node fusion-deep.js mirror      # 技能映射
node fusion-deep.js evolve      # 进化同步
node fusion-deep.js status      # 融合深度
```

### 6. Fusion Auto (`fusion-auto.js`)

自动化工作流引擎 — 每日 5 步检查流程。

```bash
node fusion-auto.js run       # 手动触发
node fusion-auto.js install   # 安装定时任务
node fusion-auto.js status    # 执行历史
```

### 7. Hermite Bridge (`hermite-bridge/index.js`)

WorkBuddy → Hermes MCP Server — 13 个工具。

### 8. WorkBuddy Bridge (`workbuddy-bridge/index.js`)

Hermes → WorkBuddy MCP Server — 10 个工具。

---

## API 参考

### WorkBuddy → Hermes 工具 (13个)

| 工具名 | 参数 | 功能 |
|-------|------|------|
| `hermes_status` | - | 获取 Hermes 系统状态 |
| `hermes_skills_list` | - | 列出已安装 Skills |
| `hermes_skills_search` | `query` | 搜索 Skills |
| `hermes_sessions_list` | - | 会话历史列表 |
| `hermes_insights` | - | 使用分析报告 |
| `hermes_chat` | `message` | 直接对话 |
| `hermes_model_info` | - | 当前模型信息 |
| `hermes_memory_list` | - | 记忆列表 |
| `hermes_cron_list` | - | 定时任务列表 |
| `hermes_run_skill` | `skill_name` | 执行指定 Skill |
| `hermes_gateway_status` | - | Gateway 状态 |
| `hermes_doctor` | - | 系统诊断 |
| `hermes_exec` | `command` | 执行 CLI 命令 |

### Hermes → WorkBuddy 工具 (10个)

| 工具名 | 参数 | 功能 |
|-------|------|------|
| `workbuddy_status` | - | WorkBuddy 系统状态 |
| `workbuddy_skills_list` | - | 列出 Skills |
| `workbuddy_skills_search` | `query` | 搜索 Skills |
| `workbuddy_skill_info` | `skill_name` | Skill 详情 |
| `workbuddy_memory_list` | - | 记忆文件列表 |
| `workbuddy_memory_read` | `filename` | 读取记忆文件 |
| `workbuddy_memory_search` | `query` | 搜索记忆 |
| `workbuddy_config_list` | - | MCP 配置列表 |
| `workbuddy_tushare_test` | - | Tushare 连接测试 |
| `workbuddy_exec` | `command` | 执行命令 |

---

## 配置指南

### 项目结构

```
Hermes-WorkBuddy-Fusion-Bridge/
├── README.md                    # 项目文档
├── FUSION.md                    # 融合架构设计
├── package.json                 # 项目配置
├── .gitignore                   # Git 忽略规则
├── fusion-cli.js                # 智能路由 CLI
├── fusion-auto.js               # 自动化工作流
├── fusion-deep.js               # 深度融合引擎
├── memory-sync.js               # 记忆同步 v2.0
├── conflict-detector.js         # 冲突检测 v1.0
├── refresh-dashboard.js         # Dashboard 数据刷新
├── fusion-dashboard.html        # 监控面板
├── harness-dashboard.html       # Harness 专项面板
├── hermite-bridge/
│   └── index.js                 # WB → Hermes MCP (13 tools)
└── workbuddy-bridge/
    └── index.js                 # Hermes → WB MCP (10 tools)
```

### 运行时数据文件 (自动生成，不在 Git 中)

```
~/.workbuddy/mcp-servers/
├── sync-log.json               # 同步日志
├── sync-hashes.json            # 增量哈希缓存
├── sync-history.json           # 同步历史快照
├── conflict-log.json           # 冲突检测日志
├── routing-log.json            # 路由决策日志
├── routing-feedback.json       # 路由反馈记录
├── adaptive-weights.json       # 自适应权重
└── fusion-deep.json            # 深度融合状态
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HERMES_HOME` | `~/.hermes` | Hermes 配置目录 |
| `WORKBUDDY_HOME` | `~/.workbuddy` | WorkBuddy 配置目录 |
| `FUSION_LOG_LEVEL` | `info` | 日志级别 (debug/info/warn/error) |

---

## 故障排除

### MCP 连接失败

```bash
# 检查 Hermes 配置
cat ~/.hermes/config.yaml | grep -A 5 mcp_servers

# 手动测试连接
hermes mcp test workbuddy

# 检查 WorkBuddy MCP 配置
cat ~/.workbuddy/mcp.json | jq .mcpServers
```

### 冲突检测误报

冲突检测器使用 24 小时窗口内的路由记录进行矛盾检测。运行过路由测试后可能产生误报，执行以下命令清理：
```bash
node conflict-detector.js fix
```

---

## 贡献指南

### Commit 规范

| 类型 | 说明 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | 修复 Bug |
| `docs:` | 文档变更 |
| `refactor:` | 代码重构 |
| `chore:` | 构建/工具变更 |

---

## 许可证

MIT © 2026 zhuang-HE

---

<p align="center">
  <sub>Built with ❤️ for the Hermes + WorkBuddy ecosystem</sub>
</p>
