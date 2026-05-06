/**
 * Fusion Router - Hermes + WorkBuddy 智能任务路由
 * ================================================
 *
 * 根据任务类型，自动选择最优系统执行：
 * - 量化分析、技能管理、文档处理 → WorkBuddy
 * - 自主代理、浏览器操作、文件管理 → Hermes
 * - 跨系统任务 → 先 Hermes 后 WorkBuddy 协作
 *
 * 使用方式：
 * node fusion-cli.js "<任务描述>"
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 任务分类
const TASK_TYPES = {
  WB: ['量化', '股票', '技术分析', 'skill', '技能', 'tushare', '数据同步',
       '表格', '报告', '文档', '保险', 'code-review', 'xlsx', 'docx'],
  HM: ['浏览器', '打开网页', '截图', '文件搜索', '文件管理', '删除',
       '重命名', '移动文件', '爬虫', '定时任务', 'cron', 'gateway'],
  AUTO: ['融合', '同步', '协调', '跨系统']
};

// Hermes CLI
const HERMES = 'hermes';

// 路由决策
function routeTask(task) {
  const lower = task.toLowerCase();
  for (const kw of TASK_TYPES.HM) 
    if (lower.includes(kw)) return 'HM';
  for (const kw of TASK_TYPES.WB) 
    if (lower.includes(kw)) return 'WB';
  return 'AUTO';
}

// 执行 Hermes 任务
function runHermes(task) {
  return new Promise((resolve, reject) => {
    const proc = spawn(HERMES, ['chat', '--model', 'qwen2.5:1.5b'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    proc.stdin.write(task + '\n');
    proc.stdin.write('exit\n');
    
    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => {});
    proc.on('close', () => resolve(output));
    proc.on('error', reject);
  });
}

// 主流程
async function main() {
  const task = process.argv.slice(2).join(' ');
  if (!task) {
    console.log('Fusion Router 用法: node fusion-cli.js "<任务>"');
    process.exit(1);
  }

  const target = routeTask(task);
  console.log(`\n🎯 Fusion Router\n`);
  console.log(`   任务: ${task}`);
  console.log(`   路由: ${target === 'HM' ? '🤖 Hermes' : target === 'WB' ? '🍃 WorkBuddy' : '🔄 协作模式'}\n`);

  if (target === 'HM') {
    console.log('→ 发送到 Hermes...\n');
    const result = await runHermes(task);
    console.log(result);
  } else if (target === 'WB') {
    console.log('→ 请在 WorkBuddy 中执行此任务\n');
    console.log(`   💡 提示: 直接在 WorkBuddy 对话中输入即可`);
  } else {
    console.log('→ 协作模式：WorkBuddy 负责分析规划，Hermes 负责执行');
    console.log('   1. WorkBuddy 制定方案');
    console.log('   2. Hermes 执行操作');
    console.log('   3. WorkBuddy 审核结果');
  }
}

main().catch(err => {
  console.error('Fusion Router Error:', err.message);
  process.exit(1);
});
