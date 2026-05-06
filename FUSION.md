# Hermes + WorkBuddy 融合架构

> v1.1.0 | 2026-05-06 | 全模块已上线

## 架构拓扑

```
┌──────────────────────────────────────────────────────────────────┐
│                        Fusion Layer                               │
│                                                                   │
│  ┌────────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Fusion Router   │  │ Memory Sync │  │   Fusion Dashboard   │  │
│  │ 智能任务路由     │  │ 双向记忆同步 │  │   统一监控面板        │  │
│  │ fusion-cli.js   │  │memory-sync  │  │ fusion-dashboard.html│  │
│  └───────┬─────────┘  └──────┬──────┘  └──────────┬───────────┘  │
│          │                   │                     │              │
├──────────┼───────────────────┼─────────────────────┼──────────────┤
│          │          MCP Bridge Layer               │              │
│          │                   │                     │              │
│  ┌───────▼─────────┐  ┌──────▼──────┐             │              │
│  │  Hermite Bridge  │  │  WB Bridge  │             │              │
│  │  (WB → Hermes)  │  │ (HM → WB)  │             │              │
│  │  13 Tools        │  │  10 Tools   │             │              │
│  └───────┬──────────┘  └──────┬──────┘             │              │
│          │                    │                    │              │
├──────────┼────────────────────┼────────────────────┼──────────────┤
│          │        Agent Layer │                    │              │
│          ▼                    ▼                    │              │
│  ┌───────────────┐   ┌───────────────┐            │              │
│  │    Hermes     │   │  WorkBuddy    │◄───────────┘              │
│  │  v0.12.0      │   │  AI 编程助手   │                           │
│  │  22+ Skills   │   │  50 Skills    │                           │
│  │  Ollama 本地   │   │  量化+金融    │                           │
│  │  3 模型梯队    │   │  Deepseek-V4  │                           │
│  └───────────────┘   └───────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

## MCP 桥接详情

### 方向1: WorkBuddy → Hermes (hermite-bridge)

```
WorkBuddy 调用               Hermes CLI 执行
─────────────────           ─────────────────
@hermite hermes_status  →   hermes status
@hermite hermes_chat    →   hermes chat -z <msg>
@hermite hermes_exec    →   hermes <command>
...
```

**13 个暴露工具**: status, skills_list, skills_search, sessions_list, insights, chat, model_info, memory_list, cron_list, run_skill, gateway_status, doctor, exec

**MCP 配置** (`~/.workbuddy/mcp.json`):
```json
{
  "mcpServers": {
    "hermite": {
      "command": "node",
      "args": ["<path>/hermite-bridge/index.js"]
    }
  }
}
```

### 方向2: Hermes → WorkBuddy (workbuddy-bridge)

```
Hermes 调用                   本地文件/命令
─────────────────           ─────────────────
workbuddy_skills_list   →   读取 ~/.workbuddy/skills/
workbuddy_memory_read   →   读取 memory/*.md
workbuddy_tushare_test  →   python -c "import tushare..."
...
```

**10 个暴露工具**: status, skills_list, skills_search, skill_info, memory_list, memory_read, memory_search, config_list, tushare_test, exec

**Hermes 配置** (`~/.hermes/config.yaml`):
```yaml
mcp_servers:
  workbuddy:
    command: node
    args:
      - <path>/workbuddy-bridge/index.js
    enabled: true
```

## 融合能力矩阵

| 能力 | WorkBuddy | Hermes | 融合后 | 融合方式 |
|------|:---------:|:------:|:------:|---------|
| 技术分析/量化 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ | WB 主导 + HM 辅助数据 |
| 文档/报告 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | WB 生成 + HM 格式美 |
| Skill 管理 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ | WB 维护 + HM 搜索 |
| 浏览器自动化 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ | HM agent-browser |
| 文件操作 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ | HM 文件管理 |
| Cron 定时 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ | HM cron + Fusion Auto |
| 本地模型推理 | — | ⭐⭐⭐ | ⭐⭐⭐ | HM Ollama 本地 |
| 记忆同步 | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | memory-sync.js 双向 |
| 任务路由 | — | — | ⭐⭐⭐ | Fusion Router 自动 |

## 任务分配规则

| 任务类型 | 路由目标 | 典型场景 |
|---------|---------|---------|
| 量化分析/选股 | WorkBuddy | 技术分析、回测、信号共振 |
| Skill 创建/审计 | WorkBuddy | 创建技能、健康审计、触发词优化 |
| 文档/报告 | WorkBuddy | PPTX、DOCX、Markdown |
| 浏览器操作 | Hermes | 打开网页、截图、表单、爬虫 |
| 文件搜索/管理 | Hermes | 查找、重命名、批量处理 |
| 定时任务 | Hermes | 每日数据同步、记忆整理 |
| 跨系统协作 | Fusion (路由) | 分析+执行，WB 规划 + HM 操作 |

## 本地模型梯队

| 模型 | 大小 | 速度 | 用途 |
|------|------|------|------|
| `qwen2.5:1.5b` | ~1GB | ~30 t/s | 默认 · 日常对话 |
| `qwen3:4b-opt` | ~2GB | ~20 t/s | 思考模式 · 复杂推理 |
| `qwen25:7b-opt` | ~4GB | ~15 t/s | 强力模式 · 代码生成 |

调用规则：
- 快速任务 → `qwen2.5:1.5b` (默认)
- 需要思考 → `/model qwen3:4b-opt`
- 重度任务 → `/model qwen25:7b-opt`

## 文件清单

```
Hermes-WorkBuddy-Fusion-Bridge/
├── README.md                   # 项目文档 (使用指南 + API 参考)
├── FUSION.md                   # 本文件 (架构设计)
├── package.json                # 项目配置
├── .gitignore                  # Git 忽略规则
├── fusion-cli.js               # 智能任务路由 (--help 支持)
├── fusion-auto.js              # 自动化工作流 (5 步每日检查)
├── memory-sync.js              # 双向记忆同步 (--dry-run 支持)
├── fusion-dashboard.html       # 统一 Web 监控面板
├── hermite-bridge/
│   └── index.js                # WB → Hermes MCP Server (13 tools)
└── workbuddy-bridge/
    └── index.js                # Hermes → WB MCP Server (10 tools)
```

## 演进路线

| 阶段 | 内容 | 状态 |
|------|------|:----:|
| Phase 1 | 双向 MCP 桥接 | ✅ 完成 |
| Phase 2 | Fusion Router 智能路由 | ✅ 完成 |
| Phase 3 | Memory Sync 记忆同步 | ✅ 完成 |
| Phase 4 | Fusion Dashboard 监控面板 | ✅ 完成 |
| Phase 5 | Fusion Auto 自动化 | ✅ 完成 |
| Phase 6 | 一键部署脚本 | 📋 计划中 |
| Phase 7 | 冲突检测与自动修复 | 📋 计划中 |
| Phase 8 | 性能监控 & 告警 | 📋 计划中 |
