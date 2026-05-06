# Hermes-WorkBuddy Fusion Bridge

双向 MCP 桥接融合系统，实现 Hermes Agent 和 WorkBuddy 的能力互通。

## 架构

```
WorkBuddy ───MCP───→ Hermes  (13 tools)
Hermes    ───MCP───→ WorkBuddy (10 tools)
        └──Fusion Router──┘  (智能任务路由)
        └──Memory Sync───┘   (双向记忆同步)
        └──Fusion Auto────┘  (定时自动化)
```

## 文件清单

| 文件 | 用途 |
|------|------|
| `hermite-bridge/index.js` | WorkBuddy → Hermes MCP Bridge |
| `workbuddy-bridge/index.js` | Hermes → WorkBuddy MCP Bridge |
| `fusion-cli.js` | 智能任务路由 |
| `memory-sync.js` | 双向记忆同步 |
| `fusion-auto.js` | 自动化工作流引擎 |
| `fusion-dashboard.html` | 统一监控面板 |
| `FUSION.md` | 架构文档 |

## 快速开始

### 1. 双向桥接

```bash
# WorkBuddy → Hermes
node hermite-bridge/index.js

# Hermes → WorkBuddy
node workbuddy-bridge/index.js
```

### 2. 智能路由

```bash
node fusion-cli.js "分析股票技术面"    # → WorkBuddy
node fusion-cli.js "搜索PDF文件"      # → Hermes
```

### 3. 记忆同步

```bash
node memory-sync.js sync    # 双向同步
node memory-sync.js status  # 状态
```

### 4. 自动化工作流

```bash
node fusion-auto.js run      # 执行
node fusion-auto.js install  # 安装 cron
```

### 5. Dashboard

```bash
python -m http.server 8899
# 打开 http://localhost:8899/fusion-dashboard.html
```

## 环境要求

- Hermes Agent v0.12.0+
- WorkBuddy
- Ollama (本地模型)
- Node.js 22+
