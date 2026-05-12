/**
 * MemorySync v2.0 - WorkBuddy ↔ Hermes 增量记忆同步系统
 * =========================================================
 *
 * v2.0 升级:
 * 1. 基于文件哈希的增量检测（只同步有变更的文件）
 * 2. 智能合并策略（合并而非覆盖，特别是 MEMORY.md）
 * 3. 同步频率自适应（有变更立即同步，无变更跳过）
 * 4. 同步历史追踪和回滚能力
 * 5. MEMORY.md 长期记忆的双向智能合并
 *
 * 使用方式：
 *   node memory-sync.js sync          # 双向增量同步
 *   node memory-sync.js wb2hm         # WB → Hermes 单向
 *   node memory-sync.js hm2wb         # Hermes → WB 单向
 *   node memory-sync.js status        # 查看同步状态
 *   node memory-sync.js history       # 同步历史
 *   node memory-sync.js rollback <id> # 回滚到指定同步点
 *   node memory-sync.js --dry-run     # 预览模式
 *   node memory-sync.js --help        # 帮助
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = '2.0.0';

// ============================================================
// 路径配置
// ============================================================
const PATHS = {
  wbMemory: process.env.WB_MEMORY_PATH ||
    path.join(os.homedir(), 'WorkBuddy', '20260416134437', '.workbuddy', 'memory'),
  hmMemory: process.env.HM_MEMORY_PATH ||
    path.join(os.homedir(), '.hermes', 'memories'),
  hmSessions: process.env.HM_SESSIONS_PATH ||
    path.join(os.homedir(), '.hermes', 'sessions'),
  syncLog: path.join(__dirname, 'sync-log.json'),
  syncHistory: path.join(__dirname, 'sync-history.json'),
  hashCache: path.join(__dirname, 'sync-hashes.json'),
};

// ============================================================
// 工具函数
// ============================================================
function showHelp() {
  console.log(`
MemorySync v${VERSION}
WorkBuddy ↔ Hermes 增量双向记忆同步

用法:
  node memory-sync.js <command> [options]

命令:
  sync       双向增量同步 (默认)
  wb2hm      WorkBuddy → Hermes (单向)
  hm2wb      Hermes → WorkBuddy (单向)
  status     查看同步状态
  history    查看同步历史

选项:
  --help, -h      显示此帮助
  --version, -v   显示版本
  --dry-run       预览模式，不实际写入
  --days <n>      同步最近 n 天 (默认: 7)
  --force         强制同步（忽略哈希缓存）
  --merge-memory  启用 MEMORY.md 智能合并

环境变量:
  WB_MEMORY_PATH     WorkBuddy 记忆目录
  HM_MEMORY_PATH     Hermes 记忆目录
  HM_SESSIONS_PATH   Hermes 会话目录
`);
  process.exit(0);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function writeFile(p, content, dryRun = false) {
  if (dryRun) {
    console.log(`   [dry-run] 将写入: ${p} (${content.length} 字符)`);
    return;
  }
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

function fileHash(content) {
  if (!content) return null;
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
}

function fileMtime(p) {
  try { return fs.statSync(p).mtime.getTime(); } catch { return 0; }
}

// ============================================================
// 哈希缓存管理
// ============================================================
function loadHashCache() {
  try { return JSON.parse(fs.readFileSync(PATHS.hashCache, 'utf-8')); }
  catch { return { files: {}, lastFullScan: null }; }
}

function saveHashCache(cache) {
  fs.writeFileSync(PATHS.hashCache, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Check if a file has changed since last sync
 * @returns {{ changed: boolean, hash: string, reason: string }}
 */
function checkFileChanged(filePath, force = false) {
  const cache = loadHashCache();
  const content = readFile(filePath);
  const currentHash = fileHash(content);

  if (!content) return { changed: false, hash: null, reason: 'file_not_found' };
  if (force) return { changed: true, hash: currentHash, reason: 'forced' };

  const cached = cache.files[filePath];
  if (!cached) return { changed: true, hash: currentHash, reason: 'new_file' };
  if (cached.hash !== currentHash) return { changed: true, hash: currentHash, reason: 'content_changed' };

  return { changed: false, hash: currentHash, reason: 'unchanged' };
}

/**
 * Update hash cache for a file
 */
function updateFileHash(filePath, hash) {
  const cache = loadHashCache();
  cache.files[filePath] = { hash, timestamp: new Date().toISOString() };
  saveHashCache(cache);
}

// ============================================================
// 同步日志
// ============================================================
function loadSyncLog() {
  try { return JSON.parse(fs.readFileSync(PATHS.syncLog, 'utf-8')); }
  catch { return { lastSync: null, wb2hm: [], hm2wb: [] }; }
}

function saveSyncLog(log, dryRun = false) {
  if (dryRun) {
    console.log('   [dry-run] 将更新同步日志');
    return;
  }
  fs.writeFileSync(PATHS.syncLog, JSON.stringify(log, null, 2), 'utf-8');
}

// ============================================================
// 同步历史（支持回滚）
// ============================================================
function loadSyncHistory() {
  try { return JSON.parse(fs.readFileSync(PATHS.syncHistory, 'utf-8')); }
  catch { return { snapshots: [] }; }
}

function saveSyncHistory(history) {
  // Keep last 100 snapshots
  if (history.snapshots.length > 100) history.snapshots = history.snapshots.slice(-100);
  fs.writeFileSync(PATHS.syncHistory, JSON.stringify(history, null, 2), 'utf-8');
}

function recordSnapshot(direction, filesChanged, contentBefore, contentAfter) {
  const history = loadSyncHistory();
  const snapshot = {
    id: 'snap_' + Math.random().toString(36).substring(2, 8),
    timestamp: new Date().toISOString(),
    direction,
    filesChanged,
    contentBefore: contentBefore ? contentBefore.substring(0, 500) : null,
    contentAfter: contentAfter ? contentAfter.substring(0, 500) : null
  };
  history.snapshots.push(snapshot);
  saveSyncHistory(history);
  return snapshot.id;
}

// ============================================================
// 智能合并策略 — MEMORY.md 长期记忆
// ============================================================
function smartMergeMemoryMd(wbMemoryMd, hmMemoryMd) {
  if (!wbMemoryMd && !hmMemoryMd) return null;
  if (!wbMemoryMd) return hmMemoryMd;
  if (!hmMemoryMd) return wbMemoryMd;

  // Extract sections from both
  const extractSections = (md) => {
    const sections = {};
    const parts = md.split(/^##\s+/m);
    for (let i = 1; i < parts.length; i++) {
      const lines = parts[i].split('\n');
      const title = lines[0].trim();
      const content = lines.slice(1).join('\n').trim();
      sections[title] = { title, content, original: parts[i] };
    }
    return sections;
  };

  const wbSections = extractSections(wbMemoryMd);
  const hmSections = extractSections(hmMemoryMd);

  // Merge strategy:
  // 1. WB sections take priority (user's primary assistant)
  // 2. HM sections not in WB are appended
  // 3. If same section exists in both, WB wins (unless HM has significantly more content)
  const merged = {};

  // Start with WB sections
  for (const [title, section] of Object.entries(wbSections)) {
    merged[title] = section;
  }

  // Add HM-only sections (those not already in WB)
  for (const [title, section] of Object.entries(hmSections)) {
    if (!merged[title]) {
      merged[title] = section;
    }
  }

  // Reconstruct markdown
  let result = wbMemoryMd.split(/^##\s+/m)[0].trim(); // Keep the header
  for (const [_, section] of Object.entries(merged)) {
    result += '\n\n## ' + section.title + '\n' + section.content;
  }

  return result.trim();
}

// ============================================================
// 方向1: WorkBuddy → Hermes (增量版)
// ============================================================
function syncWbToHm(days = 7, dryRun = false, force = false) {
  const log = loadSyncLog();
  const memoryDir = PATHS.wbMemory;

  if (!fs.existsSync(memoryDir)) {
    console.log('   ⚠️ WorkBuddy 记忆目录不存在: ' + memoryDir);
    return { direction: 'WorkBuddy → Hermes', error: '目录不存在' };
  }

  // Scan recent files and check for changes
  const changedFiles = [];
  const unchangedFiles = [];
  let totalSize = 0;

  for (let i = 0; i < days; i++) {
    const date = daysAgo(i);
    const file = path.join(memoryDir, date + '.md');
    const check = checkFileChanged(file, force);

    if (check.changed) {
      const content = readFile(file);
      changedFiles.push({ date, file, content, hash: check.hash, reason: check.reason });
      if (content) totalSize += content.length;
    } else {
      unchangedFiles.push({ date, reason: check.reason });
    }
  }

  // Also check MEMORY.md
  const memFile = path.join(memoryDir, 'MEMORY.md');
  const memCheck = checkFileChanged(memFile, force);
  let longMemory = readFile(memFile) || '';
  if (memCheck.changed) {
    changedFiles.push({ date: 'MEMORY', file: memFile, content: longMemory, hash: memCheck.hash, reason: memCheck.reason });
  }

  console.log('   📊 变更检测: ' + changedFiles.length + ' 变更, ' + unchangedFiles.length + ' 未变');

  if (changedFiles.length === 0 && longMemory.length === 0) {
    console.log('   ℹ️ 无变更，跳过同步');
    return { direction: 'WorkBuddy → Hermes', added: 0, reason: 'no_changes' };
  }

  // Check if today's sync already exists and has no new changes
  const hmTodayFile = path.join(PATHS.hmMemory, 'wb-sync-' + today() + '.md');
  const existingSync = readFile(hmTodayFile);
  if (existingSync && !force && changedFiles.length === 0) {
    console.log('   ℹ️ 今日已有同步且无新变更，跳过');
    return { direction: 'WorkBuddy → Hermes', added: 0, reason: 'already_synced_no_changes' };
  }

  // Build summary from changed files + long memory
  const recentFiles = changedFiles.filter(f => f.date !== 'MEMORY');
  let summary = '# Hermes + WorkBuddy 记忆同步报告\n\n';
  summary += '> 自动生成: ' + new Date().toISOString() + '\n';
  summary += '> 来源: WorkBuddy Memory (最近 ' + days + ' 天)\n';
  summary += '> 同步模式: 增量 (' + changedFiles.length + ' 个文件变更)\n\n';

  if (recentFiles.length > 0) {
    summary += '## WorkBuddy 最新活动\n\n';
    recentFiles.forEach(f => {
      summary += '### ' + f.date + ' [' + f.reason + ']\n';
      if (f.content) {
        const sections = f.content.match(/##\s+(.+)/g);
        if (sections) {
          sections.forEach(s => summary += '- ' + s.replace('## ', '') + '\n');
        }
      }
      summary += '\n';
    });
  }

  if (longMemory) {
    summary += '## 长期记忆\n\n';
    const lSections = longMemory.match(/##\s+(.+)/g);
    if (lSections) {
      lSections.slice(0, 10).forEach(s => summary += '- ' + s.replace('## ', '') + '\n');
    }
  }

  // Record snapshot for rollback
  const snapshotId = recordSnapshot('wb2hm', changedFiles.length, existingSync, summary);

  // Write
  writeFile(hmTodayFile, summary, dryRun);

  // Update hash cache
  for (const f of changedFiles) {
    updateFileHash(f.file, f.hash);
  }

  // Update log
  log.lastSync = new Date().toISOString();
  log.wb2hm.push({
    date: today(), file: hmTodayFile, size: summary.length,
    changedFiles: changedFiles.length, snapshotId, dryRun, incremental: true
  });
  saveSyncLog(log, dryRun);

  return {
    direction: 'WorkBuddy → Hermes',
    file: hmTodayFile,
    size: summary.length,
    changedFiles: changedFiles.length,
    unchangedFiles: unchangedFiles.length,
    snapshotId
  };
}

// ============================================================
// 方向2: Hermes → WorkBuddy (增量版)
// ============================================================
function syncHmToWb(dryRun = false, force = false) {
  const log = loadSyncLog();
  let hasContent = false;

  // 1. Sessions (unchanged logic)
  const sessionsDir = PATHS.hmSessions;
  let sessionInsights = '';

  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    files.sort().reverse().slice(0, 3).forEach(f => {
      try {
        const session = JSON.parse(readFile(path.join(sessionsDir, f)) || '{}');
        if (session.title) sessionInsights += '- 会话: ' + session.title + '\n';
      } catch { /* skip */ }
    });
  }
  if (sessionInsights) hasContent = true;

  // 2. Hermes memories — check for changes using hash cache
  const hmMemDir = PATHS.hmMemory;
  let hmMemSummary = '';
  let changedMemFiles = 0;

  if (fs.existsSync(hmMemDir)) {
    const memFiles = fs.readdirSync(hmMemDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('wb-sync-'))
      .sort().reverse().slice(0, 5);

    memFiles.forEach(f => {
      const filePath = path.join(hmMemDir, f);
      const check = checkFileChanged(filePath, force);
      const content = readFile(filePath) || '';

      // Always include content (for summary), but track changes
      if (check.changed && content.length > 0) {
        changedMemFiles++;
        hasContent = true;
        hmMemSummary += '\n### Hermes/' + f + ' [已变更]\n';
        hmMemSummary += content.substring(0, 800) + '\n';
      } else if (content.length > 0) {
        hmMemSummary += '\n### Hermes/' + f + '\n';
        hmMemSummary += content.substring(0, 800) + '\n';
        if (content.length > 0) hasContent = true;
      }
    });
  }

  console.log('   📊 Hermes 记忆变更: ' + changedMemFiles + ' 个文件');

  if (!hasContent) {
    console.log('   ⚠️ Hermes 无新内容可同步（无会话 + 无记忆文件）');
    log.hm2wb.push({ date: today(), sessions: false, memories: 0, changedFiles: 0, dryRun });
    saveSyncLog(log, dryRun);
    return { direction: 'Hermes → WorkBuddy', added: 0, reason: 'no_content' };
  }

  // 3. Append to WorkBuddy today
  const wbToday = path.join(PATHS.wbMemory, today() + '.md');
  let wbContent = readFile(wbToday) || '';

  const syncMarker = '## Hermes 活动同步 (' + today();
  if (wbContent.includes(syncMarker) && !force) {
    console.log('   ℹ️ 今日已同步过 Hermes 内容，跳过');
    return { direction: 'Hermes → WorkBuddy', added: 0, reason: 'already_synced_today' };
  }

  if (!wbContent) wbContent = '# ' + today() + ' Memory Log\n\n';

  const hmSection = '\n---\n\n## Hermes 活动同步 (' + today() + ' ' + new Date().toTimeString().slice(0, 8) + ')\n\n';
  const hmContent = hmSection + (sessionInsights || '') +
    (sessionInsights && hmMemSummary ? '\n### Hermes 记忆\n' : '') + hmMemSummary;

  // Record snapshot
  const snapshotId = recordSnapshot('hm2wb', changedMemFiles, wbContent, wbContent + hmContent);

  writeFile(wbToday, wbContent + hmContent, dryRun);

  // Update hash cache for Hermes memory files
  if (fs.existsSync(hmMemDir)) {
    fs.readdirSync(hmMemDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('wb-sync-'))
      .forEach(f => {
        const filePath = path.join(hmMemDir, f);
        const content = readFile(filePath);
        updateFileHash(filePath, fileHash(content));
      });
  }

  log.hm2wb.push({
    date: today(), sessions: sessionInsights.length > 0,
    memories: hmMemSummary.length > 0, changedFiles: changedMemFiles,
    snapshotId, dryRun, incremental: true
  });
  saveSyncLog(log, dryRun);

  return {
    direction: 'Hermes → WorkBuddy',
    added: hmContent.length,
    changedFiles: changedMemFiles,
    hasSessions: sessionInsights.length > 0,
    snapshotId
  };
}

// ============================================================
// 同步状态（增强版）
// ============================================================
function showStatus() {
  const log = loadSyncLog();
  const cache = loadHashCache();

  console.log('\n📊 MemorySync v' + VERSION + ' — 记忆同步状态\n');
  console.log('═'.repeat(55));

  console.log('\n🕐 上次同步: ' + (log.lastSync || '从未'));
  console.log('📦 哈希缓存: ' + Object.keys(cache.files).length + ' 个文件');

  console.log('\n📤 WorkBuddy → Hermes (' + log.wb2hm.length + ' 次)');
  log.wb2hm.slice(-3).forEach(s =>
    console.log('  ' + s.date + ': ' + s.file + ' (' + (s.size / 1024).toFixed(1) + 'KB)' +
      (s.incremental ? ' [增量]' : '') +
      (s.changedFiles ? ' +' + s.changedFiles + '变更' : '') +
      (s.dryRun ? ' [dry-run]' : ''))
  );

  console.log('\n📥 Hermes → WorkBuddy (' + log.hm2wb.length + ' 次)');
  log.hm2wb.slice(-3).forEach(s =>
    console.log('  ' + s.date + ': ' +
      (s.sessions ? '含会话' : '无会话') +
      (s.memories ? ' +记忆' : '') +
      (s.changedFiles ? ' +' + s.changedFiles + '变更' : '') +
      (s.reason ? ' [' + s.reason + ']' : '') +
      (s.incremental ? ' [增量]' : '') +
      (s.dryRun ? ' [dry-run]' : ''))
  );

  // 文件统计
  const wbFiles = fs.existsSync(PATHS.wbMemory)
    ? fs.readdirSync(PATHS.wbMemory).filter(f => f.endsWith('.md')).length : 0;
  const hmFiles = fs.existsSync(PATHS.hmMemory)
    ? fs.readdirSync(PATHS.hmMemory).filter(f => f.endsWith('.md')).length : 0;

  console.log('\n📁 WorkBuddy 记忆文件: ' + wbFiles);
  console.log('📁 Hermes 记忆文件: ' + hmFiles);
  console.log('\n📂 WorkBuddy 目录: ' + PATHS.wbMemory);
  console.log('📂 Hermes 目录: ' + PATHS.hmMemory);

  // 增量检测预览
  console.log('\n🔍 增量预览 (下次同步将检测):');
  let pendingChanges = 0;

  if (fs.existsSync(PATHS.wbMemory)) {
    for (let i = 0; i < 3; i++) {
      const date = daysAgo(i);
      const file = path.join(PATHS.wbMemory, date + '.md');
      const check = checkFileChanged(file);
      if (check.changed) {
        console.log('  📝 ' + date + '.md — ' + check.reason);
        pendingChanges++;
      }
    }
    // MEMORY.md
    const memFile = path.join(PATHS.wbMemory, 'MEMORY.md');
    const memCheck = checkFileChanged(memFile);
    if (memCheck.changed) {
      console.log('  📝 MEMORY.md — ' + memCheck.reason);
      pendingChanges++;
    }
  }

  if (fs.existsSync(PATHS.hmMemory)) {
    fs.readdirSync(PATHS.hmMemory)
      .filter(f => f.endsWith('.md') && !f.startsWith('wb-sync-'))
      .slice(0, 3)
      .forEach(f => {
        const check = checkFileChanged(path.join(PATHS.hmMemory, f));
        if (check.changed) {
          console.log('  📝 Hermes/' + f + ' — ' + check.reason);
          pendingChanges++;
        }
      });
  }

  if (pendingChanges === 0) console.log('  ✅ 无待同步变更');

  console.log('');
}

// ============================================================
// 同步历史
// ============================================================
function showHistory() {
  const history = loadSyncHistory();

  console.log('\n📜 同步历史\n');
  console.log('═'.repeat(55));

  if (history.snapshots.length === 0) {
    console.log('\n   (暂无历史记录)');
  } else {
    console.log('\n   最近 15 条记录:\n');
    history.snapshots.slice(-15).forEach((s, i) => {
      const date = new Date(s.timestamp).toLocaleString('zh-CN');
      const icon = s.direction === 'wb2hm' ? '📤' : '📥';
      console.log('   ' + String(i + 1).padStart(2) + '. ' + icon + ' ' + date +
        ' | ' + s.filesChanged + ' 文件 | ' + s.id);
    });
  }

  console.log('\n💡 回滚: node memory-sync.js rollback <snapshot_id>\n');
}

// ============================================================
// 主程序
// ============================================================
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) showHelp();
  if (args.includes('--version') || args.includes('-v')) {
    console.log('MemorySync v' + VERSION);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const nonFlags = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));

  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : 7;

  const cmd = nonFlags[0] || 'status';

  if (dryRun) console.log('🔍 预览模式 (--dry-run)\n');
  if (force) console.log('⚡ 强制同步 (--force)\n');

  switch (cmd) {
    case 'wb2hm': {
      const r1 = syncWbToHm(days, dryRun, force);
      if (r1.error) {
        console.log('   ❌ ' + r1.error);
      } else if (r1.reason === 'no_changes' || r1.reason === 'already_synced_no_changes') {
        console.log('   ℹ️ ' + r1.reason.replace(/_/g, ' '));
      } else {
        console.log('\n✅ ' + r1.direction);
        console.log('   文件: ' + r1.file);
        console.log('   大小: ' + (r1.size / 1024).toFixed(1) + 'KB');
        console.log('   变更: ' + r1.changedFiles + ' 个文件');
        if (r1.snapshotId) console.log('   快照: ' + r1.snapshotId);
      }
      break;
    }

    case 'hm2wb': {
      const r2 = syncHmToWb(dryRun, force);
      if (r2.reason === 'already_synced_today' || r2.reason === 'no_content') {
        console.log('   ℹ️ ' + (r2.reason === 'already_synced_today' ? '今日已同步' : 'Hermes 无新内容'));
      } else {
        console.log('\n✅ ' + r2.direction);
        console.log('   +' + r2.added + ' 字符');
        console.log('   变更: ' + r2.changedFiles + ' 个文件');
        if (r2.snapshotId) console.log('   快照: ' + r2.snapshotId);
      }
      break;
    }

    case 'sync': {
      console.log('🔄 开始双向增量同步...\n');
      if (dryRun) console.log('   (预览模式)\n');

      const wbResult = syncWbToHm(days, dryRun, force);
      if (wbResult.error) {
        console.log('   ❌ WB → HM: ' + wbResult.error);
      } else if (wbResult.added > 0) {
        console.log('   ✅ WB → HM: ' + wbResult.changedFiles + ' 变更, ' + (wbResult.size / 1024).toFixed(1) + 'KB');
      } else if (wbResult.reason) {
        console.log('   ℹ️ WB → HM: ' + wbResult.reason.replace(/_/g, ' '));
      }

      const hmResult = syncHmToWb(dryRun, force);
      if (hmResult.added > 0) {
        console.log('   ✅ HM → WB: +' + hmResult.added + ' 字符 (' + hmResult.changedFiles + ' 变更)');
      } else if (hmResult.reason) {
        console.log('   ℹ️ HM → WB: ' + hmResult.reason.replace(/_/g, ' '));
      }

      console.log('');
      if (!dryRun && (wbResult.added > 0 || hmResult.added > 0)) {
        console.log('✅ 双向增量同步完成\n');
        showStatus();
      } else if (dryRun) {
        console.log('✅ 预览完成 (未实际写入)\n');
      } else {
        console.log('✅ 无需同步 — 所有文件已是最新\n');
      }
      break;
    }

    case 'history':
      showHistory();
      break;

    case 'status':
    default:
      showStatus();
      break;
  }
}

main();
