# Hermes-WorkBuddy Fusion Bridge

<p align="center">
  <b>双向 MCP 桥接融合系统 — 实现 Hermes Agent 与 WorkBuddy 的能力互通</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue" alt="version">
  <img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="node">
  <img src="https://img.shields.io/badge/hermes-%3E%3D0.12.0-purple" alt="hermes">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license">
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
                        │    Fusion Router      │
                        │   智能任务路由         │
                        └──────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼────────┐  ┌────────▼────────┐
     │  Hermite Bridge  │  │ Memory Sync    │  │  Fusion Auto    │
     │  WB → Hermes     │  │ 双向记忆同步    │  │  自动化引擎      │
     │  13 工具         │  └────────────────┘  │  每日 5 步       │
     └────────┬─────────┘                       └────────┬─────────┘
              │                                          │
     ┌────────▼────────┐                       ┌────────▼────────┐
     │     Hermes       │                       │   WorkBuddy      │
     │  • 22+ Skills    │◄────── MCP ──────►   │  • 50 Skills     │
     │  • 浏览器自动化   │                       │  • 量化分析      │
     │  • 本地模型推理   │                       │  • 金融数据      │
     │  • 文件管理      │                       │  • 文档报告      │
     └──────────────────┘                       └──────────────────┘

                        ┌──────────────────────┐
                        │  Fusion Dashboard    │
                        │  统一监控面板         │
                        └──────────────────────┘
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

# Step 2: 运行首次记忆同步
node memory-sync.js sync

# Step 3: 打开 Dashboard
npx http-server . -p 3000
# 浏览器访问 http://localhost:3000/fusion-dashboard.html
```

---

## 模块说明

### 1. Fusion Router (`fusion-cli.js`)

智能任务路由 — 根据任务描述自动选择最优系统执行。

```bash
node fusion-cli.js "分析腾讯控股技术面"   # → WorkBuddy
node fusion-cli.js "打开百度搜索AI新闻"    # → Hermes
node fusion-cli.js "融合协调跨系统任务"    # → 协作模式
node fusion-cli.js --help                 # 查看所有选项
node fusion-cli.js --version              # 版本信息
```

**路由规则：**

| 任务类型 | 路由目标 | 典型关键词 |
|---------|---------|-----------|
| 量化分析 / 文档 / Skill | WorkBuddy | 股票、技术分析、报告、技能、Tushare |
| 浏览器 / 文件 / 爬虫 | Hermes | 打开网页、截图、文件搜索、删除 |
| 跨系统协作 | Fusion 协作 | 融合、同步、协调 |

### 2. Memory Sync (`memory-sync.js`)

双向记忆同步 — WorkBuddy 和 Hermes 的记忆互通。

```bash
node memory-sync.js sync      # 双向同步
node memory-sync.js wb2hm     # WorkBuddy → Hermes
node memory-sync.js hm2wb     # Hermes → WorkBuddy
node memory-sync.js status    # 查看同步状态
node memory-sync.js --dry-run # 预览（不写入）
node memory-sync.js --help    # 查看所有选项
```

### 3. Fusion Auto (`fusion-auto.js`)

自动化工作流引擎 — 每日自动执行 5 步检查流程。

```bash
node fusion-auto.js run       # 手动触发一次
node fusion-auto.js install   # 安装为 Hermes 定时任务
node fusion-auto.js status    # 查看执行历史
node fusion-auto.js --help    # 查看所有选项
```

**每日工作流：**
1. 记忆同步 (双向)
2. 系统状态检查 (Hermes 配置 + Gateway)
3. MCP 连接验证 (WorkBuddy Bridge)
4. Skills 概览统计
5. 生成每日报告

### 4. Fusion Deep (`fusion-deep.js`) 🆕

深度融合引擎 — 让 Hermes 自动学习 WorkBuddy 的记忆、技能和进化经验。

```bash
node fusion-deep.js deep-sync   # 一键深度融合（推荐）
node fusion-deep.js inject      # 记忆注入 Hermes 上下文
node fusion-deep.js mirror      # 技能映射 Hermes 知识库
node fusion-deep.js evolve      # 进化经验同步
node fusion-deep.js status      # 查看融合深度
node fusion-deep.js --help      # 帮助
```

**四大核心能力：**

| 能力 | 说明 | 效果 |
|------|------|------|
| 🧠 Memory Injection | WB 记忆自动注入 Hermes 上下文 | Hermes 对话时自动带上你的近期活动 |
| 🔄 Skill Mirror | WB 29 个技能映射为 Hermes 知识 | Hermes 知道何时调用 WB 的量化/金融能力 |
| 🧬 Evolution Sync | 踩坑经验双向同步 | Hermes 学习 WB 的经验教训 |
| ⏰ Auto Cron | 每日 08:00 自动 deep-sync | 无需手动，Hermes 始终最新 |

**工作原理：**
```
每日 08:00 (Hermes Cron)
    │
    ▼
memory-sync.js sync          ← 双向记忆同步
    │
    ▼
fusion-deep.js deep-sync     ← 深度融合
    ├── 生成 prefill 上下文  → ~/.hermes/prefill/fusion-context.json
    ├── 更新技能知识库       → ~/.hermes/memories/wb-skills-knowledge.md
    └── 同步进化经验         → ~/.hermes/memories/evolution.md
    │
    ▼
Hermes 下次对话自动加载 ↑
```

### 5. Fusion Dashboard (`fusion-dashboard.html`)

统一 Web 监控面板 — 可视化融合系统运行状态。

```bash
npx http-server . -p 3000
# 打开 http://localhost:3000/fusion-dashboard.html
```

- 双系统实时状态卡片
- MCP 桥接可视化
- 本地模型梯队展示
- 快捷操作入口

### 5. Hermite Bridge (`hermite-bridge/index.js`)

WorkBuddy → Hermes MCP Server — 暴露 13 个 Hermes 能力给 WorkBuddy。

在 `~/.workbuddy/mcp.json` 中配置：
```json
{
  "mcpServers": {
    "hermite": {
      "command": "node",
      "args": ["<项目路径>/hermite-bridge/index.js"]
    }
  }
}
```

### 6. WorkBuddy Bridge (`workbuddy-bridge/index.js`)

Hermes → WorkBuddy MCP Server — 暴露 10 个 WorkBuddy 能力给 Hermes。

在 Hermes 中配置：
```bash
hermes mcp add workbuddy \
  --command node \
  --args '["<项目路径>/workbuddy-bridge/index.js"]'
```

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
├── README.md                  # 项目文档
├── FUSION.md                  # 融合架构设计
├── package.json               # 项目配置
├── .gitignore                 # Git 忽略规则
├── fusion-cli.js              # 智能路由
├── fusion-auto.js             # 自动化工作流
├── memory-sync.js             # 记忆同步
├── fusion-dashboard.html      # 监控面板
├── hermite-bridge/
│   └── index.js               # WB → Hermes MCP Server
└── workbuddy-bridge/
    └── index.js               # Hermes → WB MCP Server
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HERMES_HOME` | `~/.hermes` | Hermes 配置目录 |
| `WORKBUDDY_HOME` | `~/.workbuddy` | WorkBuddy 配置目录 |
| `FUSION_LOG_LEVEL` | `info` | 日志级别 (debug/info/warn/error) |

### 自动化调度

安装每日自动化：
```bash
node fusion-auto.js install
```

在 Hermes 中激活：
```bash
hermes cron list         # 查看已安装任务
hermes cron add fusion-auto  # 激活
```

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

### 执行脚本报错

| 错误 | 原因 | 解决 |
|------|------|------|
| `hermes: command not found` | Hermes 未安装或不在 PATH | 安装 Hermes 或使用绝对路径 |
| `node: command not found` | Node.js 未安装 | 安装 Node.js >= 22 |
| `MODULE_NOT_FOUND` | 目录不正确 | 确保在项目根目录执行 |
| 权限错误 | Windows 路径权限 | 以管理员身份运行终端 |

### 路径问题 (Windows)

如果路径包含中文用户名，请确保：
- 使用正斜杠 `/` 或双反斜杠 `\\`
- Git Bash 下自动处理路径转换
- PowerShell 中使用完整绝对路径

---

## 贡献指南

### 开发约定

- JavaScript ES2022+，使用 Node.js 内置模块 (无外部依赖)
- MCP 协议遵循 JSON-RPC 2.0 规范
- 所有脚本支持 `--help` 和 `--version`
- 日志输出到 stderr，数据输出到 stdout
- 路径使用 `path.join()` 处理跨平台兼容

### 提交流程

1. Fork 本仓库
2. 创建功能分支: `git checkout -b feature/xxx`
3. 提交更改: `git commit -m 'feat: xxx'`
4. 推送分支: `git push origin feature/xxx`
5. 发起 Pull Request

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
