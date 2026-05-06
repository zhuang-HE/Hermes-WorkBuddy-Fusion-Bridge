/**
 * WorkBuddy Bridge - WorkBuddy + Hermes MCP Server
 * ================================================
 *
 * 这个 MCP Server 暴露 WorkBuddy 的能力给 Hermes，
 * 让 Hermes 可以调用 WorkBuddy 的 Skills 和功能。
 *
 * 使用方式：
 * 在 Hermes 中添加：
 * hermes mcp add workbuddy --command node --args ["C:/Users/庄赫/.workbuddy/mcp-servers/workbuddy-bridge/index.js"]
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// WorkBuddy 配置路径
const WORKBUDDY_PATH = 'C:/Users/庄赫/.workbuddy';
const SKILLS_PATH = path.join(WORKBUDDY_PATH, 'skills');
const MEMORY_PATH = 'C:/Users/庄赫/WorkBuddy/20260416134437/.workbuddy/memory';

// MCP 协议常量
const JSONRPC_VERSION = '2.0';

// 日志函数
function log(...args) {
  console.error('[WorkBuddy Bridge]', ...args);
}

// 执行命令
function execCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    log('Executing:', command, args.join(' '));

    const proc = spawn(command, args, {
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
        reject(new Error(`Command exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// 读取文件内容
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// 列出目录中的 Skills
function listSkills() {
  try {
    const dirs = fs.readdirSync(SKILLS_PATH, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    return dirs.map(name => {
      const skillPath = path.join(SKILLS_PATH, name);
      const skillMd = path.join(skillPath, 'SKILL.md');

      let description = name;
      if (fs.existsSync(skillMd)) {
        const content = readFile(skillMd);
        const match = content.match(/description:\s*(.+)/i);
        if (match) description = match[1].trim();
      }

      return { name, description, path: skillPath };
    });
  } catch (error) {
    log('Error listing skills:', error);
    return [];
  }
}

// 列出记忆文件
function listMemory() {
  try {
    const memoryDir = MEMORY_PATH;
    if (!fs.existsSync(memoryDir)) {
      return { files: [], message: 'Memory directory not found' };
    }

    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(memoryDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          path: filePath
        };
      });

    return { files, count: files.length };
  } catch (error) {
    log('Error listing memory:', error);
    return { files: [], error: error.message };
  }
}

// MCP 工具定义
const tools = [
  {
    name: 'workbuddy_status',
    description: '获取 WorkBuddy 系统状态',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'workbuddy_skills_list',
    description: '列出 WorkBuddy 已安装的 Skills',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'workbuddy_skills_search',
    description: '搜索 WorkBuddy Skills',
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
    name: 'workbuddy_skill_info',
    description: '获取指定 Skill 的详细信息',
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
    name: 'workbuddy_memory_list',
    description: '列出 WorkBuddy 记忆文件',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'workbuddy_memory_read',
    description: '读取 WorkBuddy 记忆文件',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: '文件名（如 2026-05-06.md）'
        }
      },
      required: ['filename']
    }
  },
  {
    name: 'workbuddy_memory_search',
    description: '搜索记忆内容',
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
    name: 'workbuddy_config_list',
    description: '列出 WorkBuddy MCP 配置',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'workbuddy_tushare_test',
    description: '测试 Tushare 数据连接',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'workbuddy_exec',
    description: '执行任意命令',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '命令'
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
      case 'workbuddy_status':
        return JSON.stringify({
          status: 'online',
          skills_path: SKILLS_PATH,
          memory_path: MEMORY_PATH,
          skills_count: listSkills().length,
          mcp_config: readFile(path.join(WORKBUDDY_PATH, 'mcp.json')) ? 'exists' : 'not found'
        }, null, 2);

      case 'workbuddy_skills_list':
        const skills = listSkills();
        return `WorkBuddy Skills (${skills.length}):\n\n` +
          skills.map(s => `- ${s.name}: ${s.description}`).join('\n');

      case 'workbuddy_skills_search':
        const allSkills = listSkills();
        const query = args.query.toLowerCase();
        const filtered = allSkills.filter(s =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
        );
        return `搜索 "${args.query}" 结果 (${filtered.length}):\n\n` +
          filtered.map(s => `- ${s.name}: ${s.description}`).join('\n');

      case 'workbuddy_skill_info':
        const skillName = args.skill_name;
        const skillPath = path.join(SKILLS_PATH, skillName);
        const skillMd = path.join(skillPath, 'SKILL.md');

        if (!fs.existsSync(skillMd)) {
          return `Skill "${skillName}" not found`;
        }

        const content = readFile(skillMd);
        return `Skill: ${skillName}\n\n${content}`;

      case 'workbuddy_memory_list':
        const mem = listMemory();
        return `WorkBuddy Memory Files (${mem.count || 0}):\n\n` +
          (mem.files || []).map(f => `- ${f.name} (${(f.size/1024).toFixed(1)} KB)`).join('\n');

      case 'workbuddy_memory_read':
        const filename = args.filename;
        const memPath = path.join(MEMORY_PATH, filename);
        if (!fs.existsSync(memPath)) {
          return `Memory file "${filename}" not found`;
        }
        return readFile(memPath);

      case 'workbuddy_memory_search':
        // 简单搜索：列出包含关键词的记忆文件
        const allMem = listMemory();
        const results = [];
        const searchQuery = args.query.toLowerCase();

        for (const f of (allMem.files || [])) {
          const content = readFile(f.path) || '';
          if (content.toLowerCase().includes(searchQuery)) {
            // 提取匹配的行
            const lines = content.split('\n')
              .filter(line => line.toLowerCase().includes(searchQuery))
              .slice(0, 3);
            results.push(`## ${f.name}\n${lines.join('\n')}`);
          }
        }

        return results.length > 0
          ? `搜索 "${args.query}" 结果:\n\n${results.join('\n\n')}`
          : `未找到包含 "${args.query}" 的记忆`;

      case 'workbuddy_config_list':
        const mcpConfig = readFile(path.join(WORKBUDDY_PATH, 'mcp.json'));
        if (!mcpConfig) {
          return 'MCP config not found';
        }
        const config = JSON.parse(mcpConfig);
        const servers = Object.keys(config.mcpServers || {});
        return `WorkBuddy MCP Servers (${servers.length}):\n\n` +
          servers.map(name => {
            const server = config.mcpServers[name];
            const status = server.disabled ? '❌ disabled' : '✅ enabled';
            return `- ${name}: ${status}`;
          }).join('\n');

      case 'workbuddy_tushare_test':
        // 测试 Tushare 连接
        return await execCommand('python', [
          '-c',
          'import tushare as ts; print("Tushare version:", ts.__version__); df = ts.realtime_quote(secid="000001.SZ"); print("Test data:", df[["code","name","price"]].to_string())'
        ]);

      case 'workbuddy_exec':
        const cmd = args.command;
        return await execCommand('cmd', ['/c', cmd]);

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
            name: 'workbuddy-bridge',
            version: '1.0.0'
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

log('WorkBuddy Bridge started. Waiting for requests...');
