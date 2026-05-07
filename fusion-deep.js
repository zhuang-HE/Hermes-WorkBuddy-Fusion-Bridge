/**
 * Fusion Deep - Hermes + WorkBuddy 深度融合引擎
 * ================================================
 *
 * 四大核心能力：
 * 1. Memory Injection  - WB 记忆自动注入 Hermes 上下文
 * 2. Skill Mirror       - WB 技能映射为 Hermes 知识
 * 3. Evolution Sync     - 踩坑经验双向同步
 * 4. Auto Cron          - 每日自动更新融合上下文
 *
 * 使用方式：
 *   node fusion-deep.js inject     # 生成并注入上下文
 *   node fusion-deep.js mirror     # 同步技能知识
 *   node fusion-deep.js evolve     # 同步进化经验
 *   node fusion-deep.js deep-sync  # 一键全部执行
 *   node fusion-deep.js install    # 安装为每日 Cron
 *   node fusion-deep.js status     # 查看融合深度状态
 *   node fusion-deep.js --help     # 帮助
 *   node fusion-deep.js --version  # 版本
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '1.0.0';

// ============================================================
// 路径配置
// ============================================================
const PATHS = {
  // WorkBuddy
  wbMemory: process.env.WB_MEMORY_PATH ||
    path.join(os.homedir(), 'WorkBuddy', '20260416134437', '.workbuddy', 'memory'),
  wbSkills: process.env.WB_SKILLS_PATH ||
    path.join(os.homedir(), '.workbuddy', 'skills'),

  // Hermes
  hmConfig: path.join(os.homedir(), '.hermes', 'config.yaml'),
  hmMemory: process.env.HM_MEMORY_PATH ||
    path.join(os.homedir(), '.hermes', 'memories'),
  hmCron: path.join(os.homedir(), '.hermes', 'cron'),

  // Fusion 输出
  fusionDir: process.env.FUSION_DIR || path.resolve(__dirname),
  prefillFile: path.join(os.homedir(), '.hermes', 'prefill', 'fusion-context.json'),
  skillMirrorFile: path.join(os.homedir(), '.hermes', 'memories', 'wb-skills-knowledge.md'),
  evolveLog: path.join(__dirname, 'fusion-deep.json')
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
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================
// 帮助
// ============================================================
function showHelp() {
  console.log(`
Fusion Deep v${VERSION}
Hermes + WorkBuddy 深度融合引擎

用法:
  node fusion-deep.js <command> [options]

命令:
  inject      生成融合上下文并注入 Hermes prefill
  mirror      同步 WB Skills → Hermes 知识库
  evolve      同步 踩坑经验 双向
  deep-sync   一键执行 inject + mirror + evolve
  install     安装为 Hermes 每日 Cron (每天 08:00)
  status      查看融合深度状态

选项:
  --help, -h      显示此帮助
  --version, -v   显示版本
  --dry-run       预览模式，不实际写入

说明:
  inject  → 让 Hermes 每次对话自动带上 WB 近期记忆
  mirror  → 让 Hermes 知道 WB 有哪些能力可以调用
  evolve  → 让 Hermes 学习 WB 的踩坑经验
  deep-sync → 以上三步一口气执行
`);
  process.exit(0);
}

// ============================================================
// 1. Memory Injection — WB 记忆 → Hermes 上下文
// ============================================================
function generateInjection(dryRun = false) {
  console.log('\n🧠 Memory Injection — WB 记忆 → Hermes 上下文\n');

  if (!fs.existsSync(PATHS.wbMemory)) {
    console.log('   ⚠️ WB 记忆目录不存在，请设置 WB_MEMORY_PATH');
    return { error: 'WB 记忆目录不存在' };
  }

  // 读取最近 7 天日志
  const recentLogs = [];
  for (let i = 0; i < 7; i++) {
    const date = daysAgo(i);
    const file = path.join(PATHS.wbMemory, `${date}.md`);
    const content = readFile(file);
    if (content) recentLogs.push({ date, content });
  }

  // 读取长期记忆
  const longMem = readFile(path.join(PATHS.wbMemory, 'MEMORY.md')) || '';

  // 提取重点：提取 ## 标题作为要点列表
  const activitySummary = recentLogs.map(log => {
    const sections = (log.content.match(/##\s+(.+)/g) || [])
      .map(s => s.replace('## ', '').trim())
      .filter(s => !s.startsWith('执行时间'));
    return `### ${log.date}\n${sections.map(s => `- ${s}`).join('\n')}`;
  }).join('\n\n');

  // 提取长期记忆要点
  const longMemPoints = (longMem.match(/##\s+(.+)/g) || [])
    .map(s => s.replace('## ', '').trim())
    .slice(0, 15);

  // 生成 prefill JSON（符合 OpenAI 消息格式）
  const prefillMessages = [
    {
      role: 'system',
      content: `你是 Hermes Agent，你与 WorkBuddy (另一个 AI 助手) 深度融合。

## WorkBuddy 背景
WorkBuddy 是用户的另一个 AI 编程助手，擅长量化分析、金融数据、文档报告、Skill 生态管理。
你通过 MCP 桥接可以与 WorkBuddy 互通，调用其量化和金融能力。

## 最近 7 天 WorkBuddy 活动

${activitySummary}

## 长期记忆要点
${longMemPoints.map(p => `- ${p}`).join('\n')}

## 融合协作规则

1. 当用户提到量化/股票/技术分析时，调用 workbuddy MCP 工具
2. 当用户需要浏览器/文件操作时，使用你的 agent-browser 和终端能力
3. 当任务需要规划+执行时，先分析再行动
4. 用户的工作背景：腾讯产品经理，量化交易系统开发者，WorkBuddy 核心贡献者

---
*此上下文由 Fusion Deep Engine 自动生成于 ${new Date().toISOString()}*
*每次 deep-sync 后自动更新*`
    }
  ];

  if (dryRun) {
    console.log(`   [dry-run] 将生成 prefill: ${PATHS.prefillFile}`);
    console.log(`   [dry-run] 上下文大小: ${JSON.stringify(prefillMessages).length} 字符`);
    console.log(`   [dry-run] 涵盖 ${recentLogs.length} 天记忆`);
    return { prefillFile: PATHS.prefillFile, size: JSON.stringify(prefillMessages).length };
  }

  writeFile(PATHS.prefillFile, JSON.stringify(prefillMessages, null, 2));

  // 更新 Hermes config 设置 prefill_messages_file
  const config = readFile(PATHS.hmConfig);
  if (config) {
    const normalizedPath = PATHS.prefillFile.replace(/\\/g, '/');
    let newConfig;
    if (config.includes('prefill_messages_file:')) {
      newConfig = config.replace(
        /prefill_messages_file:.*/,
        `prefill_messages_file: '${normalizedPath}'`
      );
    } else {
      // 在 _config_version 前插入
      newConfig = config.replace(
        /(^\n_config_version:)/m,
        `prefill_messages_file: '${normalizedPath}'\n$1`
      );
    }
    writeFile(PATHS.hmConfig, newConfig);
    console.log(`   ✅ 已设置 Hermes prefill_messages_file`);
  }

  console.log(`   ✅ 上下文已注入: ${PATHS.prefillFile}`);
  console.log(`   ✅ 涵盖 ${recentLogs.length} 天记忆`);
  return { prefillFile: PATHS.prefillFile, size: JSON.stringify(prefillMessages).length };
}

// ============================================================
// 2. Skill Mirror — WB 技能 → Hermes 知识
// ============================================================
function mirrorSkills(dryRun = false) {
  console.log('\n🔄 Skill Mirror — WB Skills → Hermes 知识库\n');

  if (!fs.existsSync(PATHS.wbSkills)) {
    console.log('   ⚠️ WB Skills 目录不存在');
    return { error: 'WB Skills 目录不存在' };
  }

  const skillDirs = fs.readdirSync(PATHS.wbSkills, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const skills = [];
  for (const name of skillDirs) {
    const skillMd = path.join(PATHS.wbSkills, name, 'SKILL.md');
    const content = readFile(skillMd);
    if (!content) continue;

    // 提取 frontmatter
    const frontmatter = {};
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      fmMatch[1].split('\n').forEach(line => {
        const [k, ...v] = line.split(':');
        if (k && v.length) frontmatter[k.trim()] = v.join(':').trim();
      });
    }

    // 提取触发词
    const triggers = frontmatter.triggers || frontmatter.tags || '';
    const description = frontmatter.description || '';

    // 提取踩坑经验
    const pitfalls = content.includes('踩坑') || content.includes('踩坑经验');

    skills.push({
      name,
      description,
      triggers: triggers.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5),
      hasPitfalls: pitfalls
    });
  }

  // 按领域分类
  const categories = {
    '量化金融': s => ['tushare', 'stock', 'finance', '量化', '股票'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    '开发工具': s => ['harmonyos', 'android', '小程序', 'code-review'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    '文档办公': s => ['docx', 'pptx', 'pdf', 'xlsx', 'documentation'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    'AI 工程': s => ['skill', 'agent', 'memory', 'learning', 'evolution'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    '设计创意': s => ['design', 'image', 'visual', 'media'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    '研究搜索': s => ['research', 'search', 'browser'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    '安全运维': s => ['security', 'shield', 'git'].some(k =>
      s.name.includes(k) || s.description.includes(k)),
    '其他': () => true
  };

  const categorized = {};
  for (const s of skills) {
    let cat = '其他';
    for (const [cName, pred] of Object.entries(categories)) {
      if (pred(s)) { cat = cName; break; }
    }
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push(s);
  }

  // 生成知识文档
  let knowledge = `# WorkBuddy 技能知识库\n\n`;
  knowledge += `> 自动生成: ${new Date().toISOString()}\n`;
  knowledge += `> WorkBuddy Skills 总数: ${skills.length}\n`;
  knowledge += `> 含踩坑经验: ${skills.filter(s => s.hasPitfalls).length}\n\n`;

  knowledge += `## 融合调用指南\n\n`;
  knowledge += `当用户需要以下能力时，通过 MCP 调用 WorkBuddy：\n\n`;

  for (const [cat, catSkills] of Object.entries(categorized)) {
    knowledge += `### ${cat}\n\n`;
    catSkills.forEach(s => {
      knowledge += `- **${s.name}**: ${s.description}`;
      if (s.triggers.length > 0) {
        knowledge += ` (触发词: ${s.triggers.join(', ')})`;
      }
      knowledge += `\n`;
    });
    knowledge += `\n`;
  }

  knowledge += `## 调用方式\n\n`;
  knowledge += `\`\`\`\n`;
  knowledge += `workbuddy_skills_search query="技能名"    # 搜索技能\n`;
  knowledge += `workbuddy_skill_info skill_name="技能名"   # 查看详情\n`;
  knowledge += `workbuddy_tushare_test                     # 测试金融数据\n`;
  knowledge += `\`\`\`\n`;

  if (dryRun) {
    console.log(`   [dry-run] 将生成知识库: ${PATHS.skillMirrorFile}`);
    console.log(`   [dry-run] ${skills.length} 个技能, ${Object.keys(categorized).length} 个分类`);
    return { skills: skills.length, categories: Object.keys(categorized).length };
  }

  writeFile(PATHS.skillMirrorFile, knowledge);
  console.log(`   ✅ 知识库已生成: ${PATHS.skillMirrorFile}`);
  console.log(`   ✅ ${skills.length} 个技能, ${Object.keys(categorized).length} 个分类`);
  return { skills: skills.length, categories: Object.keys(categorized).length };
}

// ============================================================
// 3. Evolution Sync — 踩坑经验双向同步
// ============================================================
function syncEvolution(dryRun = false) {
  console.log('\n🧬 Evolution Sync — 踩坑经验双向同步\n');

  const evolveLog = (() => {
    try { return JSON.parse(readFile(PATHS.evolveLog) || '{}'); }
    catch { return {}; }
  })();

  // 从 WB Skills 提取踩坑经验
  const pitfalls = [];
  if (fs.existsSync(PATHS.wbSkills)) {
    const dirs = fs.readdirSync(PATHS.wbSkills, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const d of dirs) {
      const skillMd = path.join(PATHS.wbSkills, d.name, 'SKILL.md');
      const content = readFile(skillMd);
      if (!content) continue;

      // 尝试提取踩坑章节
      const pitMatch = content.match(/##\s*踩坑[\s\S]*?(?=##\s|\n---)/i);
      if (pitMatch) {
        // 提取列表项
        const items = pitMatch[0].match(/[-*]\s+.+/g) || [];
        items.forEach(item => {
          pitfalls.push({
            source: `WB/${d.name}`,
            content: item.replace(/^[-*]\s+/, '').trim(),
            date: today()
          });
        });
      }
    }
  }

  // 读取 Hermes 已有记忆
  const hmMemoryFile = path.join(PATHS.hmMemory, 'evolution.md');
  const existingHmEvo = readFile(hmMemoryFile) || '';

  // 生成进化记忆
  let evoContent = `# 融合进化记忆\n\n`;
  evoContent += `> 最后更新: ${new Date().toISOString()}\n`;
  evoContent += `> 来源: WorkBuddy Skills + Hermes Sessions\n\n`;

  evoContent += `## 从 WorkBuddy 学到的踩坑经验\n\n`;
  if (pitfalls.length > 0) {
    pitfalls.forEach(p => {
      evoContent += `- [${p.source}] ${p.content}\n`;
    });
    evoContent += `\n共 ${pitfalls.length} 条经验\n`;
  } else {
    evoContent += `（暂无新经验）\n`;
  }

  evoContent += `\n## 融合协作经验\n\n`;
  evoContent += `- MCP 桥接传输延迟约 1-2 秒，复杂任务建议拆分步骤\n`;
  evoContent += `- Hermes 擅长浏览器和文件操作，WorkBuddy 擅长量化和文档\n`;
  evoContent += `- 跨系统任务建议：WB 规划 → HM 执行 → WB 审核\n`;

  if (dryRun) {
    console.log(`   [dry-run] 将写入进化记忆: ${hmMemoryFile}`);
    console.log(`   [dry-run] 提取到 ${pitfalls.length} 条踩坑经验`);
    return { pitfalls: pitfalls.length };
  }

  writeFile(hmMemoryFile, evoContent);

  // 记录同步
  evolveLog.lastSync = new Date().toISOString();
  evolveLog.pitfallCount = pitfalls.length;
  writeFile(PATHS.evolveLog, JSON.stringify(evolveLog, null, 2));

  console.log(`   ✅ 进化记忆已写入: ${hmMemoryFile}`);
  console.log(`   ✅ 同步了 ${pitfalls.length} 条踩坑经验`);
  return { pitfalls: pitfalls.length };
}

// ============================================================
// 4. Install Cron — 每日自动化
// ============================================================
function installCron() {
  console.log('\n⏰ 安装 Fusion Deep 每日 Cron\n');

  const scriptPath = path.join(PATHS.fusionDir, 'fusion-deep.js');
  const cronFile = path.join(PATHS.hmCron, 'fusion-deep.yaml');

  const yaml = `# Fusion Deep — 每日深度融合
# 每天 08:00 执行
name: fusion-deep
description: >
  每日深度融合工作流：
  1. 生成融合上下文注入 Hermes
  2. 同步 WB Skills 知识库
  3. 同步踩坑进化经验
prompt: >
  运行深度融合引擎: memory-sync && fusion-deep deep-sync
schedule: 0 8 * * *
command: node
args:
  - ${scriptPath.replace(/\\/g, '/')}
  - deep-sync
enabled: true
`;

  if (!fs.existsSync(PATHS.hmCron)) {
    fs.mkdirSync(PATHS.hmCron, { recursive: true });
  }

  writeFile(cronFile, yaml);
  console.log(`   ✅ Cron 配置已写入: ${cronFile}`);
  console.log('');
  console.log('   请在 Hermes 中激活:');
  console.log('   hermes cron list');
  console.log('   hermes cron add fusion-deep');
  console.log('');
}

// ============================================================
// 5. Status — 融合深度总览
// ============================================================
function showStatus() {
  console.log(`\n🔬 Fusion Deep v${VERSION} — 融合深度总览\n`);
  console.log('═'.repeat(55));

  // 检查各组件状态
  const checks = {
    'WB 记忆目录': fs.existsSync(PATHS.wbMemory),
    'WB Skills 目录': fs.existsSync(PATHS.wbSkills),
    'Hermes 配置': fs.existsSync(PATHS.hmConfig),
    'Prefill 注入': fs.existsSync(PATHS.prefillFile),
    'Skill 知识库': fs.existsSync(PATHS.skillMirrorFile),
    '进化记忆': fs.existsSync(path.join(PATHS.hmMemory, 'evolution.md')),
    'Evolution Log': fs.existsSync(PATHS.evolveLog)
  };

  console.log('\n📋 融合组件状态\n');
  for (const [name, ok] of Object.entries(checks)) {
    const status = ok ? '✅' : '❌';
    console.log(`   ${status}  ${name}`);
  }

  // 读取进化日志
  if (checks['Evolution Log']) {
    const log = JSON.parse(readFile(PATHS.evolveLog) || '{}');
    if (log.lastSync) {
      console.log(`\n🕐 上次 deep-sync: ${log.lastSync}`);
      console.log(`🧬 踩坑经验数: ${log.pitfallCount || 0}`);
    }
  }

  // 读取 prefill 大小
  if (checks['Prefill 注入']) {
    const prefill = readFile(PATHS.prefillFile) || '';
    console.log(`📄 Prefill 上下文: ${(prefill.length / 1024).toFixed(1)}KB`);
  }

  // 读取 Skill 知识库大小
  if (checks['Skill 知识库']) {
    const mirror = readFile(PATHS.skillMirrorFile) || '';
    console.log(`📚 Skill 知识库: ${mirror.split('\n').length} 行`);
  }

  console.log('\n💡 运行 "node fusion-deep.js deep-sync" 更新所有组件');
  console.log('');
}

// ============================================================
// 主程序
// ============================================================
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) showHelp();
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Fusion Deep v${VERSION}`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const nonFlags = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));
  const cmd = nonFlags[0] || 'status';

  if (dryRun) console.log('🔍 预览模式 (--dry-run)\n');

  switch (cmd) {
    case 'inject':
      generateInjection(dryRun);
      break;

    case 'mirror':
      mirrorSkills(dryRun);
      break;

    case 'evolve':
      syncEvolution(dryRun);
      break;

    case 'deep-sync':
      console.log('🚀 Fusion Deep Sync — 全面深度融合\n');
      console.log('═'.repeat(50));
      generateInjection(dryRun);
      mirrorSkills(dryRun);
      syncEvolution(dryRun);
      console.log('\n═'.repeat(50));
      console.log('✅ 深度融合同步完成\n');
      console.log('💡 下次 Hermes 对话将自动加载最新上下文\n');
      break;

    case 'install':
      installCron();
      break;

    case 'status':
    default:
      showStatus();
      break;
  }
}

main().catch(err => {
  console.error(`\n❌ Fusion Deep 错误: ${err.message}`);
  process.exit(1);
});
