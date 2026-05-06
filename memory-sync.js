/**
 * MemorySync - WorkBuddy ↔ Hermes 记忆同步系统
 * ==============================================
 *
 * 双向同步两个系统的记忆：
 * 1. WorkBuddy → Hermes: 将 WB 每日日志提炼后注入 Hermes
 * 2. Hermes → WorkBuddy: 将 Hermes 会话见解追加到 WB 日志
 *
 * 使用方式：
 *   node memory-sync.js wb2hm     # WorkBuddy → Hermes
 *   node memory-sync.js hm2wb     # Hermes → WorkBuddy
 *   node memory-sync.js sync      # 双向同步
 *   node memory-sync.js status    # 查看同步状态
 *   node memory-sync.js --dry-run # 预览模式（不写入）
 *   node memory-sync.js --help    # 帮助
 *   node memory-sync.js --version # 版本
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '1.1.0';

// 路径配置 (支持环境变量覆盖)
const PATHS = {
  wbMemory: process.env.WB_MEMORY_PATH ||
    path.join(os.homedir(), 'WorkBuddy', '20260416134437', '.workbuddy', 'memory'),
  hmMemory: process.env.HM_MEMORY_PATH ||
    path.join(os.homedir(), '.hermes', 'memories'),
  hmSessions: process.env.HM_SESSIONS_PATH ||
    path.join(os.homedir(), '.hermes', 'sessions'),
  syncLog: path.join(__dirname, 'sync-log.json')
};

// 帮助
function showHelp() {
  console.log(`
MemorySync v${VERSION}
WorkBuddy ↔ Hermes 双向记忆同步

用法:
  node memory-sync.js <command> [options]

命令:
  sync       双向同步 (默认)
  wb2hm      WorkBuddy → Hermes (单向)
  hm2wb      Hermes → WorkBuddy (单向)
  status     查看同步状态

选项:
  --help, -h      显示此帮助
  --version, -v   显示版本
  --dry-run       预览模式，不实际写入
  --days <n>      同步最近 n 天 (默认: 7)

环境变量:
  WB_MEMORY_PATH     WorkBuddy 记忆目录
  HM_MEMORY_PATH     Hermes 记忆目录
  HM_SESSIONS_PATH   Hermes 会话目录

示例:
  node memory-sync.js sync                   # 双向同步
  node memory-sync.js wb2hm --dry-run        # 预览 WB → HM
  node memory-sync.js sync --days 14         # 同步最近 14 天
  node memory-sync.js status                 # 查看状态
`);
  process.exit(0);
}

// 日期工具
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 读取文件
function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

// 写入文件
function writeFile(p, content, dryRun = false) {
  if (dryRun) {
    console.log(`   [dry-run] 将写入: ${p} (${content.length} 字符)`);
    return;
  }
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

// 加载同步日志
function loadSyncLog() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.syncLog, 'utf-8'));
  } catch {
    return { lastSync: null, wb2hm: [], hm2wb: [] };
  }
}

function saveSyncLog(log, dryRun = false) {
  if (dryRun) {
    console.log('   [dry-run] 将更新同步日志');
    return;
  }
  fs.writeFileSync(PATHS.syncLog, JSON.stringify(log, null, 2), 'utf-8');
}

// ============================================================
// 方向1: WorkBuddy → Hermes
// ============================================================
function syncWbToHm(days = 7, dryRun = false) {
  const log = loadSyncLog();
  const memoryDir = PATHS.wbMemory;

  if (!fs.existsSync(memoryDir)) {
    console.log(`   ⚠️ WorkBuddy 记忆目录不存在: ${memoryDir}`);
    console.log(`   💡 请设置环境变量 WB_MEMORY_PATH`);
    return { direction: 'WorkBuddy → Hermes', error: '目录不存在' };
  }

  // 读取最近 n 天日志
  const recentFiles = [];
  for (let i = 0; i < days; i++) {
    const date = daysAgo(i);
    const file = path.join(memoryDir, `${date}.md`);
    if (fs.existsSync(file)) {
      const content = readFile(file);
      if (content) recentFiles.push({ date, content, size: content.length });
    }
  }

  if (recentFiles.length === 0) {
    console.log('   ⚠️ 无 WorkBuddy 记忆文件可同步');
    return { direction: 'WorkBuddy → Hermes', error: '无可用文件' };
  }

  // 读取 MEMORY.md
  const memFile = path.join(memoryDir, 'MEMORY.md');
  const longMemory = readFile(memFile) || '';

  // 提炼摘要
  let summary = '# Hermes + WorkBuddy 记忆同步报告\n\n';
  summary += `> 自动生成: ${new Date().toISOString()}\n`;
  summary += `> 来源: WorkBuddy Memory (最近 ${days} 天)\n\n`;

  summary += '## 📋 WorkBuddy 最新活动\n\n';
  recentFiles.forEach(f => {
    summary += `### ${f.date}\n`;
    const sections = f.content.match(/##\s+(.+)/g);
    if (sections) {
      sections.forEach(s => summary += `- ${s.replace('## ', '')}\n`);
    }
    summary += '\n';
  });

  summary += '## 🧠 长期记忆\n\n';
  const lSections = longMemory.match(/##\s+(.+)/g);
  if (lSections) {
    lSections.slice(0, 10).forEach(s => summary += `- ${s.replace('## ', '')}\n`);
  }

  // 写入 Hermes
  const hmFile = path.join(PATHS.hmMemory, `wb-sync-${today()}.md`);
  writeFile(hmFile, summary, dryRun);

  // 更新日志
  log.lastSync = new Date().toISOString();
  log.wb2hm.push({ date: today(), file: hmFile, size: summary.length, dryRun });
  saveSyncLog(log, dryRun);

  return {
    direction: 'WorkBuddy → Hermes',
    file: hmFile,
    size: summary.length,
    sections: recentFiles.length
  };
}

// ============================================================
// 方向2: Hermes → WorkBuddy
// ============================================================
function syncHmToWb(dryRun = false) {
  const log = loadSyncLog();

  // 读取 Hermes 会话摘要
  const sessionsDir = PATHS.hmSessions;
  let sessionInsights = '';

  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    files.sort().reverse().slice(0, 3).forEach(f => {
      try {
        const session = JSON.parse(readFile(path.join(sessionsDir, f)) || '{}');
        if (session.title) sessionInsights += `- 会话: ${session.title}\n`;
      } catch { /* skip invalid JSON */ }
    });
  }

  // 读取 Hermes 记忆
  const hmMemDir = PATHS.hmMemory;
  let hmMemSummary = '';
  if (fs.existsSync(hmMemDir)) {
    const memFiles = fs.readdirSync(hmMemDir)
      .filter(f => f.endsWith('.md'))
      .sort().reverse().slice(0, 3);
    memFiles.forEach(f => {
      hmMemSummary += `\n### Hermes/${f}\n`;
      const content = readFile(path.join(hmMemDir, f)) || '';
      hmMemSummary += content.substring(0, 500) + '\n';
    });
  }

  // 追加到 WorkBuddy 今日日志
  const wbToday = path.join(PATHS.wbMemory, `${today()}.md`);
  let wbContent = readFile(wbToday) || `# ${today()} Memory Log\n\n`;

  const hmSection = `\n---\n\n## Hermes 活动同步 (${new Date().toTimeString().slice(0, 8)})\n\n`;
  const hmContent = hmSection + (sessionInsights || '（暂无 Hermes 会话）\n') + hmMemSummary;

  writeFile(wbToday, wbContent + hmContent, dryRun);

  log.hm2wb.push({ date: today(), sessions: sessionInsights.length > 0, dryRun });
  saveSyncLog(log, dryRun);

  return {
    direction: 'Hermes → WorkBuddy',
    added: hmContent.length
  };
}

// ============================================================
// 同步状态
// ============================================================
function showStatus() {
  const log = loadSyncLog();

  console.log('\n📊 记忆同步状态\n');
  console.log('═'.repeat(50));

  console.log(`\n🕐 上次同步: ${log.lastSync || '从未'}`);

  console.log(`\n📤 WorkBuddy → Hermes (${log.wb2hm.length} 次)`);
  log.wb2hm.slice(-3).forEach(s =>
    console.log(`  ${s.date}: ${s.file} (${(s.size / 1024).toFixed(1)}KB)${s.dryRun ? ' [dry-run]' : ''}`)
  );

  console.log(`\n📥 Hermes → WorkBuddy (${log.hm2wb.length} 次)`);
  log.hm2wb.slice(-3).forEach(s =>
    console.log(`  ${s.date}: ${s.sessions ? '含会话' : '无会话'}${s.dryRun ? ' [dry-run]' : ''}`)
  );

  // 统计
  const wbFiles = fs.existsSync(PATHS.wbMemory)
    ? fs.readdirSync(PATHS.wbMemory).filter(f => f.endsWith('.md')).length
    : 0;
  const hmFiles = fs.existsSync(PATHS.hmMemory)
    ? fs.readdirSync(PATHS.hmMemory).filter(f => f.endsWith('.md')).length
    : 0;

  console.log(`\n📁 WorkBuddy 记忆文件: ${wbFiles}`);
  console.log(`📁 Hermes 记忆文件: ${hmFiles}`);

  console.log(`\n📂 WorkBuddy 目录: ${PATHS.wbMemory}`);
  console.log(`📂 Hermes 目录: ${PATHS.hmMemory}`);
  console.log('');
}

// ============================================================
// 主程序
// ============================================================
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) showHelp();
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`MemorySync v${VERSION}`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const nonFlags = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));

  // 提取 --days 参数
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : 7;

  const cmd = nonFlags[0] || 'status';

  if (dryRun) {
    console.log('🔍 预览模式 (--dry-run) — 不会实际写入文件\n');
  }

  switch (cmd) {
    case 'wb2hm': {
      const r1 = syncWbToHm(days, dryRun);
      if (r1.error) {
        console.log(`   ❌ ${r1.error}`);
      } else {
        console.log(`\n✅ ${r1.direction}`);
        console.log(`   文件: ${r1.file}`);
        console.log(`   大小: ${(r1.size / 1024).toFixed(1)}KB`);
        console.log(`   同步: ${r1.sections} 天`);
      }
      break;
    }

    case 'hm2wb': {
      const r2 = syncHmToWb(dryRun);
      console.log(`\n✅ ${r2.direction}`);
      console.log(`   +${r2.added} 字符`);
      break;
    }

    case 'sync': {
      console.log('🔄 开始双向同步...\n');
      if (dryRun) console.log('   (预览模式)\n');

      const wbResult = syncWbToHm(days, dryRun);
      if (!wbResult.error) {
        console.log(`   ✅ WB → HM: ${wbResult.sections} 天, ${(wbResult.size / 1024).toFixed(1)}KB`);
      }

      const hmResult = syncHmToWb(dryRun);
      console.log(`   ✅ HM → WB: +${hmResult.added} 字符\n`);

      if (!dryRun) {
        console.log('✅ 双向同步完成\n');
        showStatus();
      } else {
        console.log('✅ 预览完成 (未实际写入)\n');
      }
      break;
    }

    case 'status':
    default:
      showStatus();
      break;
  }
}

main();
