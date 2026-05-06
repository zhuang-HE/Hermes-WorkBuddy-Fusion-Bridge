/**
 * Hermite Bridge - Hermes + WorkBuddy MCP Server
 * ================================================
 *
 * 这个 MCP Server 桥接 Hermes 和 WorkBuddy，
 * 让 WorkBuddy 可以调用 Hermes 的能力。
 *
 * 使用方式：
 * 在 ~/.workbuddy/mcp.json 中添加：
 * {
 *   "mcpServers": {
 *     "hermite": {
 *       "command": "node",
 *       "args": ["C:/Users/庄赫/.workbuddy/mcp-servers/hermite-bridge/index.js"]
 *     }
 *   }
 * }
 */

const { spawn } = require('child_process');
const readline = require('readline');

// Hermes CLI 路径
const HERMES_CLI = 'hermes';

// MCP 协议常量
const JSONRPC_VERSION = '2.0';

// 日志函数
function log(...args) {
  console.error('[Hermite Bridge]', ...args);
}

// 执行 Hermes 命令
function execHermes(args) {
  return new Promise((resolve, reject) => {
    log('Executing:', HERMES_CLI, args.join(' '));

    const proc = spawn(HERMES_CLI, args, {
      shell: true,
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Hermes exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// MCP 工具定义
const tools = [
  {
    name: 'hermes_status',
    description: '获取 Hermes 系统状态',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_skills_list',
    description: '列出 Hermes 已安装的 Skills',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_skills_search',
    description: '搜索 Hermes Skills',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'hermes_sessions_list',
    description: '列出 Hermes 会话历史',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_insights',
    description: '获取 Hermes 使用分析',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_chat',
    description: '与 Hermes 对话（通过 CLI）',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '要发送的消息'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'hermes_model_info',
    description: '获取当前使用的模型信息',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_memory_list',
    description: '列出 Hermes 记忆',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_cron_list',
    description: '列出 Hermes 定时任务',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_run_skill',
    description: '执行 Hermes Skill',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'Skill 名称'
        }
      },
      required: ['skill_name']
    }
  },
  {
    name: 'hermes_gateway_status',
    description: '获取 Hermes Gateway 状态',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_doctor',
    description: '运行 Hermes 诊断',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'hermes_exec',
    description: '执行任意 Hermes CLI 命令',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '命令（如 status, skills list）'
        }
      },
      required: ['command']
    }
  }
];

// 处理工具调用
async function handleToolCall(toolName, args) {
  log('Tool call:', toolName, args);

  try {
    switch (toolName) {
      case 'hermes_status':
        return await execHermes(['status']);

      case 'hermes_skills_list':
        return await execHermes(['skills', 'list']);

      case 'hermes_skills_search':
        return await execHermes(['skills', 'search', args.query]);

      case 'hermes_sessions_list':
        return await execHermes(['sessions', 'list']);

      case 'hermes_insights':
        return await execHermes(['insights']);

      case 'hermes_chat':
        // 使用非交互式方式（如果支持）
        return await execHermes(['chat', '-z', args.message]);

      case 'hermes_model_info':
        // Hermes 没有 model list 命令，改用 status
        return await execHermes(['status']);

      case 'hermes_memory_list':
        return await execHermes(['memory', 'list']);

      case 'hermes_cron_list':
        return await execHermes(['cron', 'list']);

      case 'hermes_run_skill':
        return await execHermes(['skills', 'run', args.skill_name]);

      case 'hermes_gateway_status':
        return await execHermes(['gateway', 'status']);

      case 'hermes_doctor':
        return await execHermes(['doctor']);

      case 'hermes_exec':
        // 解析命令字符串并执行
        const cmdParts = args.command.split(' ').filter(p => p.trim());
        return await execHermes(cmdParts);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    log('Error:', error.message);
    return `Error: ${error.message}`;
  }
}

// MCP 协议处理
function sendResponse(id, result) {
  const response = {
    jsonrpc: JSONRPC_VERSION,
    id,
    result
  };
  console.log(JSON.stringify(response));
}

function sendError(id, code, message) {
  const response = {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message }
  };
  console.log(JSON.stringify(response));
}

// 解析 MCP 请求
function parseRequest(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// 主循环 - 读取 stdin 并处理请求
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let requestId = 0;

rl.on('line', async (line) => {
  const data = parseRequest(line);
  if (!data) return;

  const { id, method, params } = data;

  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'hermite-bridge',
            version: '1.1.0'
          }
        });
        break;

      case 'tools/list':
        sendResponse(id, { tools });
        break;

      case 'tools/call':
        const { name, arguments: args } = params;
        const result = await handleToolCall(name, args || {});
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        });
        break;

      case 'shutdown':
        sendResponse(id, null);
        process.exit(0);

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    log('Request error:', error);
    sendError(id, -32603, error.message);
  }
});

// 错误处理
process.on('uncaughtException', (error) => {
  log('Uncaught exception:', error);
  process.exit(1);
});

log('Hermite Bridge started. Waiting for requests...');
