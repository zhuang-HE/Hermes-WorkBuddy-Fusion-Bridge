/**
 * ConflictDetector - Hermes + WorkBuddy 冲突检测与自动修复引擎
 * ===============================================================
 *
 * 三大检测维度：
 * 1. Memory Conflict    — 双向记忆内容冲突（同一主题矛盾信息）
 * 2. Route Conflict     — 路由决策冲突（重复路由/矛盾决策）
 * 3. State Conflict     — 系统状态不一致（文件丢失、配置漂移）
 *
 * 修复策略优先级：
 *   WB 长期记忆 > 最新时间戳 > 信息完整度 > 来源可靠性
 *
 * 使用方式：
 *   node conflict-detector.js scan       # 全面扫描
 *   node conflict-detector.js fix        # 扫描并自动修复
 *   node conflict-detector.js history    # 冲突历史
 *   node conflict-detector.js --help     # 帮助
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = '1.0.0';

// ============================================================
// 路径配置
// ============================================================
const PATHS = {
  wbMemory: process.env.WB_MEMORY_PATH ||
    path.join(os.homedir(), 'WorkBuddy', '20260416134437', '.workbuddy', 'memory'),
  hmMemory: process.env.HM_MEMORY_PATH ||
    path.join(os.homedir(), '.hermes', 'memories'),
  hmConfig: path.join(os.homedir(), '.hermes', 'config.yaml'),
  routingLog: path.join(os.homedir(), '.workbuddy', 'fusion-router', 'routing-log.json'),
  conflictLog: path.join(__dirname, 'conflict-log.json'),
  conflictDir: path.join(__dirname, 'conflicts'),
};

// ============================================================
// 工具函数
// ============================================================
function readFile(p) { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } }
function writeFile(p, content) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}
function fileHash(p) {
  try {
    const content = fs.readFileSync(p);
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
  } catch { return null; }
}
function fileMtime(p) {
  try { return fs.statSync(p).mtime.toISOString(); } catch { return null; }
}
function today() { return new Date().toISOString().slice(0, 10); }

function loadConflictLog() {
  try { return JSON.parse(fs.readFileSync(PATHS.conflictLog, 'utf-8')); }
  catch { return { conflicts: [], fixes: [], stats: { total: 0, autoFixed: 0, manual: 0 } }; }
}

function saveConflictLog(log) {
  writeFile(PATHS.conflictLog, JSON.stringify(log, null, 2));
}

// ============================================================
// 1. Memory Conflict Detection — 记忆内容冲突检测
// ============================================================

/**
 * 从 markdown 文本中提取主题-内容映射
 * ## 标题 → 标题下的内容段落
 */
function extractTopics(markdown) {
  const topics = {};
  const sections = markdown.split(/^##\s+/m);
  for (let i = 1; i < sections.length; i++) {
    const lines = sections[i].split('\n');
    const title = lines[0].trim().replace(/[#*]/g, '').trim();
    const content = lines.slice(1).join('\n').trim();
    if (title && content) {
      topics[title] = content;
    }
  }
  return topics;
}

/**
 * 计算两段文本的相似度 (0-1)
 * 使用词级别 Jaccard 相似度 + 关键短语匹配
 */
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  // Tokenize: split by non-alphanumeric, lowercase for CJK support
  const tokenize = (s) => {
    // CJK characters as individual tokens + words
    const tokens = [];
    const cjk = s.match(/[\u4e00-\u9fff]/g) || [];
    tokens.push(...cjk);
    const words = s.match(/[a-zA-Z0-9_]+/gi) || [];
    tokens.push(...words.map(w => w.toLowerCase()));
    return tokens;
  };

  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 检测 WB 和 Hermes 记忆中的主题冲突
 */
function detectMemoryConflicts() {
  const conflicts = [];

  // 读取两边的记忆
  const wbFiles = fs.existsSync(PATHS.wbMemory)
    ? fs.readdirSync(PATHS.wbMemory).filter(f => f.endsWith('.md'))
    : [];
  const hmFiles = fs.existsSync(PATHS.hmMemory)
    ? fs.readdirSync(PATHS.hmMemory).filter(f => f.endsWith('.md') && !f.startsWith('wb-sync-'))
    : [];

  // 提取所有主题
  const wbTopics = {};  // title → { content, source, file, mtime }
  const hmTopics = {};

  for (const f of wbFiles) {
    const content = readFile(path.join(PATHS.wbMemory, f));
    if (!content) continue;
    const topics = extractTopics(content);
    for (const [title, body] of Object.entries(topics)) {
      // Normalize title for matching
      const key = title.replace(/\s+/g, '').toLowerCase();
      wbTopics[key] = { title, content: body, source: 'workbuddy', file: f, mtime: fileMtime(path.join(PATHS.wbMemory, f)) };
    }
  }

  for (const f of hmFiles) {
    const content = readFile(path.join(PATHS.hmMemory, f));
    if (!content) continue;
    const topics = extractTopics(content);
    for (const [title, body] of Object.entries(topics)) {
      const key = title.replace(/\s+/g, '').toLowerCase();
      hmTopics[key] = { title, content: body, source: 'hermes', file: f, mtime: fileMtime(path.join(PATHS.hmMemory, f)) };
    }
  }

  // 找到相同主题（精确匹配 + 模糊匹配）
  const allKeys = new Set([...Object.keys(wbTopics), ...Object.keys(hmTopics)]);

  for (const key of allKeys) {
    const wb = wbTopics[key];
    const hm = hmTopics[key];

    // 精确匹配冲突
    if (wb && hm) {
      const similarity = textSimilarity(wb.content, hm.content);
      // 如果相似度在 0.2-0.7 之间，说明有部分重叠但不完全一致（可能是冲突）
      // 如果相似度很低 (< 0.2)，说明是不同内容（可能不是冲突）
      // 如果相似度很高 (> 0.7)，说明基本一致（无冲突）
      if (similarity > 0.15 && similarity < 0.75) {
        conflicts.push({
          type: 'memory_topic_mismatch',
          severity: similarity < 0.35 ? 'high' : 'medium',
          topic: wb.title,
          similarity: Math.round(similarity * 100) / 100,
          wb: { source: wb.file, mtime: wb.mtime, preview: wb.content.substring(0, 100) },
          hm: { source: hm.file, mtime: hm.mtime, preview: hm.content.substring(0, 100) },
          recommendation: wb.mtime > hm.mtime ? 'workbuddy_newer' : 'hermes_newer'
        });
      }
    }
  }

  // 模糊匹配：查找标题相似的但不同 key 的主题
  const wbKeys = Object.keys(wbTopics);
  const hmKeys = Object.keys(hmTopics);
  for (const wKey of wbKeys) {
    if (hmTopics[wKey]) continue; // already checked exact match
    for (const hKey of hmKeys) {
      const titleSim = textSimilarity(wbTopics[wKey].title, hmTopics[hKey].title);
      if (titleSim > 0.5) {
        const contentSim = textSimilarity(wbTopics[wKey].content, hmTopics[hKey].content);
        if (contentSim > 0.15 && contentSim < 0.75) {
          conflicts.push({
            type: 'memory_topic_fuzzy',
            severity: 'low',
            topic_wb: wbTopics[wKey].title,
            topic_hm: hmTopics[hKey].title,
            titleSimilarity: Math.round(titleSim * 100) / 100,
            similarity: Math.round(contentSim * 100) / 100,
            wb: { source: wbTopics[wKey].file, mtime: wbTopics[wKey].mtime },
            hm: { source: hmTopics[hKey].file, mtime: hmTopics[hKey].mtime }
          });
        }
      }
    }
  }

  // 检测 wb-sync 文件与原始 HM 记忆的一致性
  const syncFiles = fs.existsSync(PATHS.hmMemory)
    ? fs.readdirSync(PATHS.hmMemory).filter(f => f.startsWith('wb-sync-') && f.endsWith('.md'))
    : [];

  for (const sf of syncFiles) {
    const dateStr = sf.replace('wb-sync-', '').replace('.md', '');
    const hmEvo = readFile(path.join(PATHS.hmMemory, 'evolution.md'));
    const syncContent = readFile(path.join(PATHS.hmMemory, sf));
    if (!syncContent) continue;

    // 检查 sync 文件是否引用了过时信息
    // 如果 evolution.md 存在且包含更新的信息，sync 可能过时
    if (hmEvo && syncContent.length > 0) {
      const evoMtime = fileMtime(path.join(PATHS.hmMemory, 'evolution.md'));
      const syncMtime = fileMtime(path.join(PATHS.hmMemory, sf));
      if (evoMtime && syncMtime && evoMtime > syncMtime) {
        // evolution.md 比 sync 文件更新，可能包含更新的信息
        // 这是信息性的，不一定是冲突
      }
    }

    // 检查 sync 文件内部一致性：是否多次同步导致重复内容
    const lines = syncContent.split('\n').filter(l => l.trim());
    const uniqueLines = new Set(lines);
    if (lines.length > uniqueLines.size * 1.5) {
      conflicts.push({
        type: 'sync_dedup',
        severity: 'low',
        file: sf,
        totalLines: lines.length,
        uniqueLines: uniqueLines.size,
        duplicateRatio: Math.round((1 - uniqueLines.size / lines.length) * 100)
      });
    }
  }

  return conflicts;
}

// ============================================================
// 2. Route Conflict Detection — 路由决策冲突检测
// ============================================================
function detectRouteConflicts() {
  const conflicts = [];

  if (!fs.existsSync(PATHS.routingLog)) return conflicts;

  let logData;
  try {
    logData = JSON.parse(fs.readFileSync(PATHS.routingLog, 'utf-8'));
  } catch { return conflicts; }

  const routes = Array.isArray(logData) ? logData : (logData.routes || logData.logs || []);
  if (routes.length < 2) return conflicts;

  // 1. 检测相似任务的矛盾路由
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i];
      const b = routes[j];
      if (!a.task || !b.task) continue;

      const taskSim = textSimilarity(a.task, b.task);
      if (taskSim > 0.5 && a.winner !== b.winner) {
        // 相似任务但路由到不同目标
        const timeA = new Date(a.timestamp || a.time || 0);
        const timeB = new Date(b.timestamp || b.time || 0);
        const hoursDiff = Math.abs(timeA - timeB) / 3600000;

        // 如果时间差小于 24 小时，说明可能是真正的冲突
        if (hoursDiff < 24) {
          conflicts.push({
            type: 'route_contradiction',
            severity: 'medium',
            task_a: a.task,
            task_b: b.task,
            route_a: a.winner,
            route_b: b.winner,
            similarity: Math.round(taskSim * 100) / 100,
            hoursDiff: Math.round(hoursDiff)
          });
        }
      }
    }
  }

  // 2. 检测低置信度路由（可能需要人工确认）
  const lowConfidence = routes.filter(r => r.confidence < 40);
  if (lowConfidence.length > 0) {
    conflicts.push({
      type: 'low_confidence_routes',
      severity: 'low',
      count: lowConfidence.length,
      examples: lowConfidence.slice(0, 3).map(r => ({
        task: r.task,
        winner: r.winner,
        confidence: r.confidence
      }))
    });
  }

  // 3. 检测路由分布极度不均衡（某一方被严重忽略）
  const distribution = {};
  routes.forEach(r => { distribution[r.winner] = (distribution[r.winner] || 0) + 1; });
  const total = routes.length;
  for (const [target, count] of Object.entries(distribution)) {
    const percent = count / total;
    if (percent > 0.8 && total > 5) {
      conflicts.push({
        type: 'route_imbalance',
        severity: 'low',
        dominant: target,
        dominantPercent: Math.round(percent * 100),
        total
      });
    }
  }

  return conflicts;
}

// ============================================================
// 3. State Conflict Detection — 系统状态一致性检测
// ============================================================
function detectStateConflicts() {
  const conflicts = [];

  // 1. 检查 Hermes 配置中 prefill 路径是否有效
  const config = readFile(PATHS.hmConfig);
  if (config) {
    const prefillMatch = config.match(/prefill_messages_file:\s*['"]?([^'"\n]+)/);
    if (prefillMatch) {
      const prefillPath = prefillMatch[1].replace(/\\/g, '/').replace(/^\//, '');
      const fullPath = path.join(prefillPath.startsWith(':') ? '' : '', prefillPath);
      // Try to resolve
      const testPaths = [
        prefillMatch[1],
        path.join(os.homedir(), prefillPath.replace(/^\//, '')),
        path.join('C:/', prefillPath),
      ];
      const exists = testPaths.some(p => {
        try { return fs.existsSync(p); } catch { return false; }
      });
      if (!exists) {
        conflicts.push({
          type: 'prefill_missing',
          severity: 'high',
          configuredPath: prefillMatch[1],
          message: 'Hermes prefill 配置指向不存在的文件'
        });
      }
    }
  }

  // 2. 检查 WB 记忆目录完整性
  if (fs.existsSync(PATHS.wbMemory)) {
    const files = fs.readdirSync(PATHS.wbMemory);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    const emptyFiles = mdFiles.filter(f => {
      const content = readFile(path.join(PATHS.wbMemory, f));
      return !content || content.trim().length < 10;
    });
    if (emptyFiles.length > 0) {
      conflicts.push({
        type: 'empty_memory_files',
        severity: 'low',
        count: emptyFiles.length,
        files: emptyFiles
      });
    }
  }

  // 3. 检查 Hermes 记忆目录健康
  if (fs.existsSync(PATHS.hmMemory)) {
    const hmFiles = fs.readdirSync(PATHS.hmMemory).filter(f => f.endsWith('.md'));
    const wbSyncFiles = hmFiles.filter(f => f.startsWith('wb-sync-'));
    const nativeFiles = hmFiles.filter(f => !f.startsWith('wb-sync-'));

    // wb-sync 文件是否过多（超过 30 天的应清理）
    const staleSyncFiles = wbSyncFiles.filter(f => {
      const dateStr = f.replace('wb-sync-', '').replace('.md', '');
      try {
        const fileDate = new Date(dateStr);
        const daysOld = (Date.now() - fileDate.getTime()) / 86400000;
        return daysOld > 30;
      } catch { return false; }
    });

    if (staleSyncFiles.length > 0) {
      conflicts.push({
        type: 'stale_sync_files',
        severity: 'low',
        count: staleSyncFiles.length,
        files: staleSyncFiles,
        message: `发现 ${staleSyncFiles.length} 个超过 30 天的 wb-sync 文件，建议清理`
      });
    }

    // 原生记忆文件数量过少
    if (nativeFiles.length < 2 && wbSyncFiles.length > 5) {
      conflicts.push({
        type: 'hermes_memory_imbalance',
        severity: 'medium',
        nativeCount: nativeFiles.length,
        syncCount: wbSyncFiles.length,
        message: 'Hermes 原生记忆过少，大部分记忆来自 WB 同步'
      });
    }
  }

  // 4. 检查 fusion-deep.json 日志
  const evolveLog = readFile(path.join(__dirname, 'fusion-deep.json'));
  if (evolveLog) {
    try {
      const log = JSON.parse(evolveLog);
      if (log.lastSync) {
        const lastSyncDate = new Date(log.lastSync);
        const daysSinceSync = (Date.now() - lastSyncDate.getTime()) / 86400000;
        if (daysSinceSync > 7) {
          conflicts.push({
            type: 'stale_deep_sync',
            severity: 'medium',
            daysSinceSync: Math.round(daysSinceSync),
            lastSync: log.lastSync,
            message: `深度融合已 ${Math.round(daysSinceSync)} 天未更新`
          });
        }
      }
    } catch { /* ignore parse error */ }
  }

  return conflicts;
}

// ============================================================
// Auto Fix — 自动修复策略
// ============================================================
function autoFix(conflicts) {
  const fixes = [];

  for (const conflict of conflicts) {
    switch (conflict.type) {
      case 'stale_sync_files': {
        // 清理超过 30 天的 wb-sync 文件
        for (const f of conflict.files) {
          try {
            const filePath = path.join(PATHS.hmMemory, f);
            fs.unlinkSync(filePath);
            fixes.push({
              action: 'deleted_stale_sync',
              file: f,
              message: `已删除过期同步文件: ${f}`
            });
          } catch (err) {
            fixes.push({
              action: 'delete_failed',
              file: f,
              error: err.message
            });
          }
        }
        break;
      }

      case 'empty_memory_files': {
        // 不自动删除空文件，仅记录
        fixes.push({
          action: 'logged_empty_files',
          count: conflict.count,
          message: `发现 ${conflict.count} 个空记忆文件，建议手动审查`
        });
        break;
      }

      case 'sync_dedup': {
        // 对重复内容过多的 sync 文件进行去重
        const filePath = path.join(PATHS.hmMemory, conflict.file);
        const content = readFile(filePath);
        if (content) {
          const lines = content.split('\n');
          const seen = new Set();
          const deduped = lines.filter(l => {
            const key = l.trim();
            if (!key) return true; // keep blank lines
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          writeFile(filePath, deduped.join('\n'));
          fixes.push({
            action: 'deduped_sync_file',
            file: conflict.file,
            before: conflict.totalLines,
            after: deduped.length,
            message: `已去重 ${conflict.file}: ${conflict.totalLines} → ${deduped.length} 行`
          });
        }
        break;
      }

      case 'route_contradiction': {
        // 记录路由矛盾，建议人工审查
        fixes.push({
          action: 'logged_route_contradiction',
          message: `路由矛盾: "${conflict.task_a}" → ${conflict.route_a} vs "${conflict.task_b}" → ${conflict.route_b}`,
          recommendation: '建议统一相似任务的路由规则'
        });
        break;
      }

      case 'prefill_missing': {
        // 尝试重新生成 prefill
        fixes.push({
          action: 'needs_prefill_regen',
          message: 'Prefill 文件缺失，运行 fusion-deep.js deep-sync 修复',
          severity: 'high'
        });
        break;
      }

      case 'stale_deep_sync': {
        // 提示运行 deep-sync
        fixes.push({
          action: 'needs_deep_sync',
          message: `深度融合已 ${conflict.daysSinceSync} 天未更新`,
          command: 'node fusion-deep.js deep-sync'
        });
        break;
      }

      default: {
        fixes.push({
          action: 'no_auto_fix',
          type: conflict.type,
          message: `无自动修复方案，需人工审查`
        });
      }
    }
  }

  return fixes;
}

// ============================================================
// CLI — 命令行接口
// ============================================================
function showHelp() {
  console.log(`
ConflictDetector v${VERSION}
Hermes + WorkBuddy 冲突检测与自动修复引擎

用法:
  node conflict-detector.js scan       # 全面扫描冲突
  node conflict-detector.js fix        # 扫描并自动修复
  node conflict-detector.js history    # 查看冲突历史
  node conflict-detector.js --help     # 帮助
  node conflict-detector.js --version  # 版本

检测维度:
  1. Memory Conflict     — 双向记忆内容冲突
  2. Route Conflict      — 路由决策冲突
  3. State Conflict      — 系统状态不一致

修复策略:
  - 过期 sync 文件 → 自动删除 (>30天)
  - 重复内容 sync → 自动去重
  - 空记忆文件 → 记录告警
  - 路由矛盾 → 记录建议
  - prefill 缺失 → 提示重建
`);
  process.exit(0);
}

function runScan(autoFixEnabled = false) {
  console.log(`\n🔍 ConflictDetector v${VERSION} — 冲突扫描${autoFixEnabled ? ' + 自动修复' : ''}\n`);
  console.log('═'.repeat(55));

  // 三维扫描
  console.log('\n📋 [1/3] 记忆内容冲突检测...');
  const memoryConflicts = detectMemoryConflicts();
  console.log(`   发现 ${memoryConflicts.length} 个记忆冲突`);

  console.log('\n📋 [2/3] 路由决策冲突检测...');
  const routeConflicts = detectRouteConflicts();
  console.log(`   发现 ${routeConflicts.length} 个路由冲突`);

  console.log('\n📋 [3/3] 系统状态一致性检测...');
  const stateConflicts = detectStateConflicts();
  console.log(`   发现 ${stateConflicts.length} 个状态冲突`);

  const allConflicts = [...memoryConflicts, ...routeConflicts, ...stateConflicts];

  // 按严重程度分类
  const bySeverity = { high: [], medium: [], low: [] };
  allConflicts.forEach(c => {
    if (bySeverity[c.severity]) bySeverity[c.severity].push(c);
    else bySeverity.low.push(c);
  });

  console.log('\n' + '═'.repeat(55));
  console.log('\n📊 冲突汇总\n');

  console.log(`   🔴 高严重度: ${bySeverity.high.length}`);
  bySeverity.high.forEach(c => console.log(`      - [${c.type}] ${c.message || c.topic || c.file || 'N/A'}`));

  console.log(`   🟡 中严重度: ${bySeverity.medium.length}`);
  bySeverity.medium.forEach(c => console.log(`      - [${c.type}] ${c.message || c.topic || 'N/A'}`));

  console.log(`   🟢 低严重度: ${bySeverity.low.length}`);
  bySeverity.low.slice(0, 5).forEach(c => console.log(`      - [${c.type}] ${c.message || c.topic || c.file || 'N/A'}`));
  if (bySeverity.low.length > 5) console.log(`      ... 还有 ${bySeverity.low.length - 5} 个`);

  // 自动修复
  let fixes = [];
  if (autoFixEnabled && allConflicts.length > 0) {
    console.log('\n🔧 自动修复中...\n');
    fixes = autoFix(allConflicts);
    fixes.forEach(f => {
      const icon = f.action.includes('failed') ? '❌' : '✅';
      console.log(`   ${icon} ${f.message}`);
    });
  }

  // 记录到日志
  const log = loadConflictLog();
  const scanResult = {
    timestamp: new Date().toISOString(),
    totalConflicts: allConflicts.length,
    bySeverity: {
      high: bySeverity.high.length,
      medium: bySeverity.medium.length,
      low: bySeverity.low.length
    },
    conflicts: allConflicts,
    fixes: fixes
  };
  log.conflicts.push(scanResult);
  log.stats.total += allConflicts.length;
  if (autoFixEnabled) {
    log.stats.autoFixed += fixes.filter(f => !f.action.includes('failed')).length;
  }
  // Keep last 50 scans
  if (log.conflicts.length > 50) log.conflicts = log.conflicts.slice(-50);
  saveConflictLog(log);

  // 健康评分
  const maxScore = 100;
  const deductions = bySeverity.high.length * 20 + bySeverity.medium.length * 8 + bySeverity.low.length * 2;
  const healthScore = Math.max(0, maxScore - deductions);

  console.log('\n' + '═'.repeat(55));
  console.log(`\n   融合健康评分: ${healthScore}/100`);
  if (healthScore >= 90) console.log('   状态: 🟢 优秀');
  else if (healthScore >= 70) console.log('   状态: 🟡 良好');
  else if (healthScore >= 50) console.log('   状态: 🟠 需关注');
  else console.log('   状态: 🔴 需立即处理');

  console.log(`\n   💡 运行 "node conflict-detector.js fix" 自动修复可修复项\n`);

  return scanResult;
}

function showHistory() {
  const log = loadConflictLog();

  console.log(`\n📜 冲突检测历史\n`);
  console.log('═'.repeat(55));
  console.log(`\n📊 累计统计`);
  console.log(`   总冲突数: ${log.stats.total}`);
  console.log(`   自动修复: ${log.stats.autoFixed}`);
  console.log(`   人工处理: ${log.stats.manual}`);

  const scans = log.conflicts;
  if (scans.length === 0) {
    console.log('\n   (暂无历史记录)');
  } else {
    console.log(`\n   最近 ${Math.min(10, scans.length)} 次扫描:\n`);
    scans.slice(-10).forEach((s, i) => {
      const date = s.timestamp ? new Date(s.timestamp).toLocaleString('zh-CN') : 'N/A';
      console.log(`   ${String(i + 1).padStart(2)}. ${date} | ${s.totalConflicts} 冲突 (🔴${s.bySeverity.high} 🟡${s.bySeverity.medium} 🟢${s.bySeverity.low})${s.fixes?.length ? ` | 修复 ${s.fixes.length}` : ''}`);
    });
  }

  console.log('');
}

// ============================================================
// 主程序
// ============================================================
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) showHelp();
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`ConflictDetector v${VERSION}`);
    process.exit(0);
  }

  const nonFlags = args.filter(a => !a.startsWith('--'));
  const cmd = nonFlags[0] || 'scan';

  switch (cmd) {
    case 'scan':
      runScan(false);
      break;
    case 'fix':
      runScan(true);
      break;
    case 'history':
      showHistory();
      break;
    default:
      console.log(`未知命令: ${cmd}`);
      showHelp();
  }
}

main();
