/**
 * Fusion Router - Hermes + WorkBuddy 智能任务路由
 * ================================================
 *
 * 根据任务类型，自动选择最优系统执行：
 * - 量化分析、技能管理、文档处理 → WorkBuddy
 * - 浏览器操作、文件管理、爬虫     → Hermes
 * - 跨系统任务                     → 协作模式
 *
 * 使用方式：
 *   node fusion-cli.js "<任务描述>"
 *   node fusion-cli.js --help
 *   node fusion-cli.js --version
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = '1.1.0';

// 任务分类
const TASK_TYPES = {
  WB: ['量化', '股票', '技术分析', 'skill', '技能', 'tushare', '数据同步',
       '表格', '报告', '文档', '保险', 'code-review', 'xlsx', 'docx', 'pptx',
       '回测', '选股', '基本面', '缠论', '信号', '五维', '情绪指数'],
  HM: ['浏览器', '打开网页', '截图', '文件搜索', '文件管理', '删除',
       '重命名', '移动文件', '爬虫', '定时任务', 'cron', 'gateway',
       'pdf', '图片', '视频', '压缩', '解压', '下载'],
  AUTO: ['融合', '同步', '协调', '跨系统', '联合']
};

// 帮助信息
function showHelp() {
  console.log(`
Fusion Router v${VERSION}
智能任务路由 — 自动选择 Hermes 或 WorkBuddy 执行任务

用法:
  node fusion-cli.js "<任务描述>"
  node fusion-cli.js [选项]

选项:
  --help, -h     显示此帮助
  --version, -v  显示版本
  --dry-run      仅显示路由结果，不执行

示例:
  node fusion-cli.js "分析腾讯控股技术面"    → WorkBuddy
  node fusion-cli.js "打开百度搜索AI新闻"    → Hermes
  node fusion-cli.js "融合协调跨系统任务"    → 协作模式

路由规则:
  量化/文档/Skill  → WorkBuddy (股票/技术分析/报告/技能/Tushare...)
  浏览器/文件/爬虫  → Hermes   (打开网页/截图/文件搜索/PDF/timer...)
  跨系统协作       → Fusion   (融合/同步/协调/联合)
`);
  process.exit(0);
}

// 路由决策
function routeTask(task) {
  const lower = task.toLowerCase();
  for (const kw of TASK_TYPES.HM)
    if (lower.includes(kw.toLowerCase())) return 'HM';
  for (const kw of TASK_TYPES.WB)
    if (lower.includes(kw.toLowerCase())) return 'WB';
  return 'AUTO';
}

// 检查 Hermes 是否可用
function checkHermes() {
  try {
    const which = require('child_process').execSync('where hermes 2>nul || which hermes 2>/dev/null', { encoding: 'utf-8' });
    return which.trim().length > 0;
  } catch {
    return false;
  }
}

// 执行 Hermes 任务
function runHermes(task) {
  return new Promise((resolve, reject) => {
    const proc = spawn('hermes', ['chat', '--model', 'qwen2.5:1.5b'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
    });
    proc.stdin.write(task + '\n');
    proc.stdin.write('exit\n');
    proc.stdin.end();

    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => {});
    proc.on('close', code => {
      if (code === 0) resolve(output);
      else resolve(`Hermes exited with code ${code}\n${output}`);
    });
    proc.on('error', reject);
  });
}

// 主流程
async function main() {
  const args = process.argv.slice(2);

  // 处理 flag 参数
  if (args.includes('--help') || args.includes('-h')) showHelp();
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Fusion Router v${VERSION}`);
    process.exit(0);
  }

  const isDryRun = args.includes('--dry-run');
  const task = args.filter(a => !a.startsWith('--') && !a.startsWith('-')).join(' ');

  if (!task) {
    console.error('错误: 请提供任务描述。使用 --help 查看用法。');
    process.exit(1);
  }

  const target = routeTask(task);

  console.log(`\n🎯 Fusion Router v${VERSION}`);
  console.log(`   任务: ${task}`);
  console.log(`   路由: ${target === 'HM' ? '🤖 Hermes' : target === 'WB' ? '🍃 WorkBuddy' : '🔄 协作模式'}\n`);

  if (isDryRun) {
    console.log('   (--dry-run 模式，未实际执行)');
    process.exit(0);
  }

  if (target === 'HM') {
    if (!checkHermes()) {
      console.error('   ❌ 错误: Hermes CLI 不可用。请确保 hermes 已安装且在 PATH 中。');
      process.exit(1);
    }
    console.log('→ 发送到 Hermes...\n');
    try {
      const result = await runHermes(task);
      console.log(result);
    } catch (err) {
      console.error(`❌ Hermes 执行失败: ${err.message}`);
      process.exit(1);
    }
  } else if (target === 'WB') {
    console.log('→ 请在 WorkBuddy 中执行此任务\n');
    console.log('   💡 提示: 直接复制任务描述到 WorkBuddy 对话即可');
  } else {
    console.log('→ 协作模式');
    console.log('   1️⃣  WorkBuddy: 分析问题，制定方案');
    console.log('   2️⃣  Hermes:    执行操作 (浏览器/文件/定时)');
    console.log('   3️⃣  WorkBuddy: 审核结果，生成报告');
    console.log('\n   💡 建议: 先在 WorkBuddy 中分析，再将执行步骤交给 Hermes');
  }
}

main().catch(err => {
  console.error(`\n❌ Fusion Router 错误: ${err.message}`);
  process.exit(1);
});
