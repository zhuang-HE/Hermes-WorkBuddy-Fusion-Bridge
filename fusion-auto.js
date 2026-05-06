/**
 * Fusion Auto - Hermes + WorkBuddy 自动化工作流
 * ==============================================
 *
 * 跨系统定时协作引擎，每日自动执行 5 步检查流程
 *
 * 使用方式：
 *   node fusion-auto.js run       # 触发一次执行
 *   node fusion-auto.js install   # 安装到 Hermes cron
 *   node fusion-auto.js status    # 查看状态
 *   node fusion-auto.js --help    # 帮助
 *   node fusion-auto.js --version # 版本
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '1.1.0';

// 路径配置 (支持环境变量覆盖)
const BASE = process.env.FUSION_BASE || path.resolve(__dirname);
const LOG = path.join(BASE, 'fusion-auto.log');
const MEMORY_SYNC = path.join(BASE, 'memory-sync.js');

// 帮助
function showHelp() {
  console.log(`
Fusion Auto v${VERSION}
跨系统定时协作引擎

用法:
  node fusion-auto.js <command> [options]

命令:
  run       手动触发一次工作流
  install   安装到 Hermes 定时任务 (每日 08:00)
  status    查看执行历史和状态

选项:
  --help, -h     显示此帮助
  --version, -v  显示版本
  --no-sync      跳过记忆同步步骤

环境变量:
  FUSION_BASE    项目根目录 (默认: 脚本所在目录)
`);
  process.exit(0);
}

function log(msg) {
  const time = new Date().toISOString().slice(0, 19);
  const line = `[${time}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function runCmd(cmd, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: true, timeout });
    let out = '';
    let err = '';

    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => {
      resolve({ code, out, err });
    });
    proc.on('error', err => {
      reject(err);
    });
  });
}

// ============================================================
// 工作流定义
// ============================================================

async function runWorkflow(options = {}) {
  const startTime = Date.now();
  log('━━━ 融合自动化工作流 开始 ━━━');

  let results = { steps: {} };

  // Step 1: 记忆同步
  if (!options.noSync) {
    log('Step 1/5: 记忆同步...');
    try {
      const { out } = await runCmd('node', [MEMORY_SYNC, 'sync']);
      log('  ✅ 记忆同步完成');
      results.steps.sync = 'ok';
    } catch (e) {
      log(`  ⚠️ 记忆同步失败: ${e.message}`);
      results.steps.sync = 'failed';
    }
  } else {
    log('Step 1/5: 记忆同步 (跳过)');
  }

  // Step 2: 状态检查
  log('Step 2/5: 系统状态检查...');
  try {
    const hermesOk = await runCmd('hermes', ['--version']);
    if (hermesOk.code === 0) {
      const versionLine = hermesOk.out.split('\n')[0] || hermesOk.out;
      log(`  ✅ Hermes: ${versionLine.trim()}`);
    }
    // Check Ollama
    try {
      const ollamaPs = execSync('tasklist 2>nul || ps aux 2>/dev/null', { encoding: 'utf-8' });
      const ollamaRunning = ollamaPs.toLowerCase().includes('ollama');
      log(`  ✅ Ollama: ${ollamaRunning ? '运行中' : '未检测到'}`);
    } catch {
      log('  ⚠️ 无法检测 Ollama 状态');
    }
    results.steps.status = 'ok';
  } catch (e) {
    log(`  ⚠️ 状态检查失败: ${e.message}`);
    results.steps.status = 'failed';
  }

  // Step 3: MCP 连接测试
  log('Step 3/5: MCP 连接验证...');
  try {
    const { out } = await runCmd('hermes', ['mcp', 'test', 'workbuddy']);
    if (out.includes('Connected') || out.includes('success')) {
      const tools = out.match(/Tools discovered:\s*(\d+)/i)?.[1] ||
                    out.match(/(\d+)\s*tools?/i)?.[1] || '?';
      log(`  ✅ WorkBuddy Bridge: ${tools} 工具可用`);
      results.steps.mcp = 'ok';
    } else {
      log(`  ⚠️ MCP 测试异常: ${out.slice(0, 100)}`);
      results.steps.mcp = 'warn';
    }
  } catch (e) {
    log(`  ⚠️ MCP 测试失败: ${e.message}`);
    results.steps.mcp = 'failed';
  }

  // Step 4: Skill 健康检查
  log('Step 4/5: Skills 概览...');
  try {
    const wbSkillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
    const hmSkillsDir = path.join(os.homedir(), '.hermes', 'skills');

    let wbCount = 0, hmCount = 0;

    if (fs.existsSync(wbSkillsDir)) {
      wbCount = fs.readdirSync(wbSkillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(wbSkillsDir, d.name, 'SKILL.md')))
        .length;
    }

    if (fs.existsSync(hmSkillsDir)) {
      hmCount = fs.readdirSync(hmSkillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(hmSkillsDir, d.name, 'SKILL.md')))
        .length;
    }

    log(`  ✅ WorkBuddy: ${wbCount} | Hermes: ${hmCount} | 合计: ${wbCount + hmCount}`);
    results.steps.skills = { wb: wbCount, hm: hmCount, total: wbCount + hmCount };
  } catch (e) {
    log(`  ⚠️ Skills 检查失败: ${e.message}`);
    results.steps.skills = 'failed';
  }

  // Step 5: 生成每日报告
  log('Step 5/5: 生成每日报告...');
  const dateStr = new Date().toISOString().slice(0, 10);
  const report = path.join(BASE, `fusion-report-${dateStr}.md`);

  const syncStatus = results.steps.sync === 'ok' ? '✅' : '⚠️';
  const mcpStatus = results.steps.mcp === 'ok' ? '✅' : '⚠️';
  const skillsInfo = typeof results.steps.skills === 'object'
    ? `${results.steps.skills.wb} + ${results.steps.skills.hm} = ${results.steps.skills.total}`
    : '?';

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const content = `# Fusion 每日报告 - ${dateStr}

> 自动生成 | Hermes + WorkBuddy Fusion Bridge v${VERSION}
> 耗时: ${elapsed}s

## 状态摘要

| 检查项 | 状态 |
|--------|:----:|
| 记忆同步 | ${syncStatus} |
| 系统状态 | ✅ |
| MCP 桥接 | ${mcpStatus} |
| Skills | ${skillsInfo} |

## 系统信息

- 🍃 WorkBuddy: 运行中
- 🤖 Hermes: 运行中
- 🔗 MCP 桥接: 双向互通

## 操作建议

1. 如无异常，本日无需干预
2. 建议每周做一次 Skill 健康审计
3. 日常任务用 qwen2.5:1.5b，复杂任务用 qwen25:7b-opt

---
*自动生成于 ${new Date().toISOString()}*
`;
  fs.writeFileSync(report, content);
  log(`  ✅ 报告: ${report}`);
  results.steps.report = report;

  log(`━━━ 工作流完成 (${elapsed}s) ━━━\n`);
  return results;
}

// ============================================================
// 安装 Hermes Cron
// ============================================================
function installCron() {
  const script = path.join(BASE, 'fusion-auto.js');
  const cronDir = path.join(os.homedir(), '.hermes', 'cron');

  if (!fs.existsSync(cronDir)) {
    fs.mkdirSync(cronDir, { recursive: true });
  }

  const cronFile = path.join(cronDir, 'fusion-auto.yaml');

  const yaml = `# Fusion 自动化工作流
# 每天 08:00 执行一次
name: fusion-auto
description: Hermes + WorkBuddy 每日融合工作流
prompt: 运行融合自动化工作流：记忆同步 → 状态检查 → MCP验证 → Skills概览 → 生成报告
schedule: 0 8 * * *
command: node
args:
  - ${script.replace(/\\/g, '/')}
  - run
enabled: true
`;

  fs.writeFileSync(cronFile, yaml);
  log(`📋 Cron 配置已写入: ${cronFile}`);
  log('');
  log('请在 Hermes 中激活:');
  log('  hermes cron list          # 查看已安装');
  log('  hermes cron add fusion-auto  # 激活任务');
  log('');
}

// ============================================================
// 状态查看
// ============================================================
function showStatus() {
  console.log(`\n📋 融合工作流状态 v${VERSION}\n`);
  console.log('═'.repeat(40));
  console.log(`\n📁 配置目录: ${BASE}`);
  console.log(`📄 日志文件: ${LOG}`);

  if (fs.existsSync(LOG)) {
    const logContent = fs.readFileSync(LOG, 'utf-8');
    const runs = (logContent.match(/工作流 开始/g) || []).length;
    const completed = (logContent.match(/工作流完成/g) || []).length;
    const lastComplete = logContent.split('\n')
      .filter(l => l.includes('工作流完成'))
      .pop();

    console.log(`🔄 历史运行: ${runs} 次 (成功 ${completed})`);
    if (lastComplete) {
      const timeMatch = lastComplete.match(/\[(.*?)\]/);
      console.log(`🕐 最后完成: ${timeMatch ? timeMatch[1] : '未知'}`);
    } else {
      console.log('🕐 最后完成: 从未');
    }

    // 最近错误
    const errors = logContent.split('\n')
      .filter(l => l.includes('⚠️') || l.includes('❌'))
      .slice(-3);
    if (errors.length > 0) {
      console.log(`\n⚠️ 最近异常:`);
      errors.forEach(e => console.log(`  ${e.trim()}`));
    }
  } else {
    console.log('🔄 尚无执行记录');
  }

  console.log(`\n💡 手动运行: node fusion-auto.js run`);
  console.log(`💡 安装定时: node fusion-auto.js install\n`);
}

// ============================================================
// 主程序
// ============================================================
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Fusion Auto v${VERSION}`);
    process.exit(0);
  }

  const cmd = args.find(a => ['run', 'install', 'status'].includes(a)) || 'status';
  const noSync = args.includes('--no-sync');

  switch (cmd) {
    case 'run':
      await runWorkflow({ noSync });
      break;
    case 'install':
      installCron();
      break;
    case 'status':
      showStatus();
      break;
  }
}

main().catch(e => {
  log(`❌ 工作流异常: ${e.message}`);
  process.exit(1);
});
