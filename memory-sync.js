/**
 * MemorySync - WorkBuddy ↔ Hermes 记忆同步系统
 * ==============================================
 *
 * 双向同步两个系统的记忆：
 * 1. WorkBuddy → Hermes: 将 WB 每日日志提炼后注入 Hermes
 * 2. Hermes → WorkBuddy: 将 Hermes 会话见解追加到 WB 日志
 *
 * 使用方式：
 *   node memory-sync.js wb2hm    # WorkBuddy → Hermes
 *   node memory-sync.js hm2wb    # Hermes → WorkBuddy
 *   node memory-sync.js sync     # 双向同步
 *   node memory-sync.js status   # 查看同步状态
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const PATHS = {
  wbMemory: 'C:/Users/庄赫/WorkBuddy/20260416134437/.workbuddy/memory',
  hmMemory: 'C:/Users/庄赫/.hermes/memories',
  hmSessions: 'C:/Users/庄赫/.hermes/sessions',
  syncLog: 'C:/Users/庄赫/.workbuddy/mcp-servers/sync-log.json'
};

// 日期工具
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 读取文件
function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

// 写入文件
function writeFile(p, content) {
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

function saveSyncLog(log) {
  fs.writeFileSync(PATHS.syncLog, JSON.stringify(log, null, 2), 'utf-8');
}

// ============================================================
// 方向1: WorkBuddy → Hermes
// ============================================================
function syncWbToHm() {
  const log = loadSyncLog();
  const memoryDir = PATHS.wbMemory;
  
  // 读取最近 7 天日志
  const recentFiles = [];
  for (let i = 0; i <= 7; i++) {
    const date = daysAgo(i);
    const file = path.join(memoryDir, `${date}.md`);
    if (fs.existsSync(file)) {
      const content = readFile(file);
      if (content) recentFiles.push({ date, content, size: content.length });
    }
  }

  // 读取 MEMORY.md
  const memFile = path.join(memoryDir, 'MEMORY.md');
  const longMemory = readFile(memFile) || '';

  // 提炼摘要
  let summary = '# Hermes + WorkBuddy 记忆同步报告\n\n';
  summary += `> 自动生成: ${new Date().toISOString()}\n`;
  summary += `> 来源: WorkBuddy Memory\n\n`;
  
  summary += '## 📋 WorkBuddy 最新活动\n\n';
  recentFiles.forEach(f => {
    summary += `### ${f.date}\n`;
    // 提取 ## 标题作为要点
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
  writeFile(hmFile, summary);

  // 更新日志
  log.lastSync = new Date().toISOString();
  log.wb2hm.push({ date: today(), file: hmFile, size: summary.length });
  saveSyncLog(log);

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
function syncHmToWb() {
  const log = loadSyncLog();
  
  // 读取 Hermes 会话摘要
  const sessionsDir = PATHS.hmSessions;
  let sessionInsights = '';
  
  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    files.sort().reverse().slice(0, 3).forEach(f => {
      try {
        const session = JSON.parse(readFile(path.join(sessionsDir, f)));
        if (session.title) sessionInsights += `- 会话: ${session.title}\n`;
      } catch {}
    });
  }

  // 读取 Hermes 记忆
  const hmMemDir = PATHS.hmMemory;
  let hmMemSummary = '';
  if (fs.existsSync(hmMemDir)) {
    fs.readdirSync(hmMemDir).forEach(f => {
      hmMemSummary += `\n### Hermes/${f}\n`;
      const content = readFile(path.join(hmMemDir, f)) || '';
      hmMemSummary += content.substring(0, 500) + '\n';
    });
  }

  // 追加到 WorkBuddy 今日日志
  const wbToday = path.join(PATHS.wbMemory, `${today()}.md`);
  let wbContent = readFile(wbToday) || `# ${today()} Memory Log\n\n`;
  
  const hmSection = `\n---\n\n## Hermes 活动同步 (${new Date().toTimeString().slice(0,8)})\n\n`;
  const hmContent = hmSection + (sessionInsights || '（暂无 Hermes 会话）\n');
  
  writeFile(wbToday, wbContent + hmContent);

  log.hm2wb.push({ date: today(), sessions: sessionInsights.length > 0 });
  saveSyncLog(log);

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
    console.log(`  ${s.date}: ${s.file} (${(s.size/1024).toFixed(1)}KB)`)
  );
  
  console.log(`\n📥 Hermes → WorkBuddy (${log.hm2wb.length} 次)`);
  log.hm2wb.slice(-3).forEach(s => 
    console.log(`  ${s.date}: ${s.sessions ? '含会话' : '无会话'}`)
  );
  
  // 统计
  const wbFiles = fs.existsSync(PATHS.wbMemory) ? fs.readdirSync(PATHS.wbMemory).length : 0;
  const hmFiles = fs.existsSync(PATHS.hmMemory) ? fs.readdirSync(PATHS.hmMemory).length : 0;
  
  console.log(`\n📁 WorkBuddy 记忆文件: ${wbFiles}`);
  console.log(`📁 Hermes 记忆文件: ${hmFiles}`);
  console.log('');
}

// ============================================================
// 主程序
// ============================================================
function main() {
  const cmd = process.argv[2] || 'status';
  
  switch (cmd) {
    case 'wb2hm':
      const r1 = syncWbToHm();
      console.log(`\n✅ ${r1.direction}`);
      console.log(`   文件: ${r1.file}`);
      console.log(`   大小: ${(r1.size/1024).toFixed(1)}KB`);
      console.log(`   节: ${r1.sections} 天\n`);
      break;
      
    case 'hm2wb':
      const r2 = syncHmToWb();
      console.log(`\n✅ ${r2.direction}`);
      console.log(`   +${r2.added} 字符\n`);
      break;
      
    case 'sync':
      console.log('\n🔄 开始双向同步...\n');
      syncWbToHm();
      syncHmToWb();
      console.log('✅ 双向同步完成\n');
      showStatus();
      break;
      
    case 'status':
    default:
      showStatus();
      break;
  }
}

main();
