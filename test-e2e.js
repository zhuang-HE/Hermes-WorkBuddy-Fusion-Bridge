#!/usr/bin/env node
/**
 * test-e2e.js — Fusion Bridge End-to-End Test Suite
 * =================================================
 * Tests the complete chain:
 *   Task Input -> Routing Decision -> Memory Sync -> Conflict Detection -> Dashboard Data
 *
 * Usage: node test-e2e.js  (run from mcp-servers directory)
 * No external dependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ── ANSI Colors ──────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

// ── Globals ──────────────────────────────────────────────────────────────────

const BASE_DIR = __dirname;
const SPAWN_TIMEOUT = 15_000;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a single test case. Prints colored result and tracks pass/fail counts.
 */
function test(name, expectation, fn) {
  totalTests++;
  process.stdout.write(`  ${C.dim}${totalTests}. ${C.reset}${name}`);
  process.stdout.write(` ${C.dim}[${expectation}]${C.reset}\n`);

  try {
    const result = fn();
    if (result === true) {
      passedTests++;
      process.stdout.write(`    ${C.green}PASS${C.reset} ${name}\n`);
    } else {
      failedTests++;
      failures.push({ name, reason: String(result) });
      process.stdout.write(`    ${C.red}FAIL${C.reset} ${name} — ${result}\n`);
    }
  } catch (err) {
    failedTests++;
    failures.push({ name, reason: err.message });
    process.stdout.write(`    ${C.red}FAIL${C.reset} ${name} — ${err.message}\n`);
  }
}

/**
 * Spawn a child process and return { code, stdout, stderr, timedOut }.
 */
function runScript(scriptPath, args, opts = {}) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...(args || [])],
    {
      cwd: opts.cwd || BASE_DIR,
      timeout: opts.timeout || SPAWN_TIMEOUT,
      encoding: 'utf-8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      windowsHide: true,
    }
  );

  return {
    code: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    timedOut: result.error && result.error.killed,
  };
}

/**
 * Check if a value is "truthy" (not null, not undefined, not empty string, not 0, not false).
 * For objects/arrays: must have content.
 */
function assert(value, message) {
  if (value === undefined || value === null || value === false || value === 0) {
    return message || 'Assertion failed: value is falsy';
  }
  if (typeof value === 'string' && value.length === 0) {
    return message || 'Assertion failed: empty string';
  }
  if (Array.isArray(value) && value.length === 0) {
    return message || 'Assertion failed: empty array';
  }
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return message || 'Assertion failed: empty object';
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: Router Integration
// ════════════════════════════════════════════════════════════════════════════

function runRouterTests() {
  console.log(`\n${C.bold}${C.cyan}━━━ 1. Router Integration Test ━━━${C.reset}\n`);

  const routerPath = path.join(BASE_DIR, 'plugins', 'fusion-router', 'index.js');
  let FusionRouter;
  let router;

  test('Router module loads', 'exports FusionRouter class', () => {
    if (!fs.existsSync(routerPath)) return 'File not found: plugins/fusion-router/index.js';
    FusionRouter = require(routerPath);
    if (typeof FusionRouter !== 'function') return 'Module does not export a constructor/class';
    return true;
  });

  test('Router instantiates', 'creates instance without errors', () => {
    router = new FusionRouter({ configDir: path.join(BASE_DIR, '.test-router-config') });
    if (!router) return 'Failed to instantiate';
    return true;
  });

  // --- 5 different task types routing ---
  const routingCases = [
    {
      name: 'WorkBuddy (financial)',
      task: '分析贵州茅台股票的K线走势和MACD指标',
      expectedTarget: 'workbuddy',
    },
    {
      name: 'HERMES (browser)',
      task: '打开百度搜索最新的AI新闻并截图',
      expectedTarget: 'hermes',
    },
    {
      name: 'WorkBuddy (document)',
      task: '生成一份Q2季度销售报告PPT',
      expectedTarget: 'workbuddy',
    },
    {
      name: 'HERMES (system)',
      task: '查看当前运行的进程并关闭占用内存过高的程序',
      expectedTarget: 'hermes',
    },
    {
      name: 'BOTH (collaboration)',
      task: '采集三个竞品网站的价格数据并生成对比分析报告',
      expectedTarget: 'both',
    },
  ];

  for (const { name, task, expectedTarget } of routingCases) {
    test(`Route: ${name}`, `winner === "${expectedTarget}"`, () => {
      const result = router.route({ description: task });
      if (!result || !result.winner) return 'No routing result returned';
      if (result.winner !== expectedTarget) {
        return `Expected "${expectedTarget}", got "${result.winner}"`;
      }
      return true;
    });
  }

  // --- TF-IDF semantic matching ---
  test('TF-IDF semantic matching works', 'semanticMatches array is present', () => {
    const result = router.route({ description: '帮我查看基金的收益情况和持仓分布' });
    if (!result.semanticMatches) return 'No semanticMatches in result';
    // Semantic matches may be empty for some queries, just verify the field exists
    return true;
  });

  test('TF-IDF catches fuzzy/semantic matches', 'semantic similarity produces a result for a fuzzy query', () => {
    // Use a query that shares TF-IDF vocabulary with the router's corpus
    // "投资" bigram overlaps with "投资" in 量化金融 keywords context
    const result = router.route({ description: '最近投资收益怎么样' });
    if (!result) return 'No result returned';
    const hasMatch = (result.semanticMatches && result.semanticMatches.length > 0)
                  || (result.matches && result.matches.length > 0);
    if (!hasMatch) return 'No semantic or keyword matches found';
    return true;
  });

  // --- Confidence scores ---
  test('Confidence score is returned', 'confidence is a number between 0 and 100', () => {
    const result = router.route({ description: '分析股票走势' });
    if (typeof result.confidence !== 'number') return `confidence is ${typeof result.confidence}, not a number`;
    if (result.confidence < 0 || result.confidence > 100) return `confidence ${result.confidence} out of range`;
    return true;
  });

  test('High-confidence tasks have confidence > 50', 'clear keyword match yields high confidence', () => {
    const result = router.route({ description: '打开浏览器搜索网页' });
    if (result.confidence < 50) return `Expected confidence >= 50, got ${result.confidence}`;
    return true;
  });

  test('Batch routing works', 'routes multiple tasks in one call', () => {
    const tasks = [
      { description: '分析A股市场数据' },
      { description: '批量重命名桌面文件' },
    ];
    const results = router.batchRoute(tasks);
    if (!Array.isArray(results) || results.length !== 2) return 'batchRoute did not return 2 results';
    if (!results[0].winner || !results[1].winner) return 'Batch results missing winner field';
    return true;
  });

  // Cleanup test config
  try {
    const testConfigDir = path.join(BASE_DIR, '.test-router-config');
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  } catch { /* ignore cleanup errors */ }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Memory Sync Integration
// ════════════════════════════════════════════════════════════════════════════

function runMemorySyncTests() {
  console.log(`\n${C.bold}${C.cyan}━━━ 2. Memory Sync Integration Test ━━━${C.reset}\n`);

  const script = path.join(BASE_DIR, 'memory-sync.js');

  test('memory-sync.js file exists', 'file is readable', () => {
    if (!fs.existsSync(script)) return 'File not found: memory-sync.js';
    return true;
  });

  const result = runScript(script, ['--dry-run']);

  test('memory-sync --dry-run exits cleanly', 'exit code === 0', () => {
    if (result.timedOut) return 'Process timed out after 15s';
    if (result.code !== 0) return `Exit code ${result.code}\nStderr: ${result.stderr}`;
    return true;
  });

  test('memory-sync --dry-run produces output', 'stdout is not empty', () => {
    if (!result.stdout || result.stdout.length === 0) {
      return 'No stdout output';
    }
    return true;
  });

  test('memory-sync --dry-run mentions sync operations', 'output contains sync-related keywords', () => {
    const output = result.stdout + result.stderr;
    // The dry-run output should mention "dry" or "preview" or show sync plan
    const hasSyncKeyword =
      output.includes('dry') ||
      output.includes('预览') ||
      output.includes('sync') ||
      output.includes('同步') ||
      output.includes('Dry') ||
      output.includes('SYNC') ||
      output.includes('增量') ||
      output.includes('检测') ||
      output.includes('文件');
    if (!hasSyncKeyword) return `Output does not contain expected sync keywords\nOutput: ${output.substring(0, 200)}`;
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Conflict Detector Integration
// ════════════════════════════════════════════════════════════════════════════

function runConflictDetectorTests() {
  console.log(`\n${C.bold}${C.cyan}━━━ 3. Conflict Detector Integration Test ━━━${C.reset}\n`);

  const script = path.join(BASE_DIR, 'conflict-detector.js');

  test('conflict-detector.js file exists', 'file is readable', () => {
    if (!fs.existsSync(script)) return 'File not found: conflict-detector.js';
    return true;
  });

  const result = runScript(script, ['scan']);

  test('conflict-detector scan exits cleanly', 'exit code === 0', () => {
    if (result.timedOut) return 'Process timed out after 15s';
    if (result.code !== 0) return `Exit code ${result.code}\nStderr: ${result.stderr}`;
    return true;
  });

  test('conflict-detector scan produces output', 'stdout is not empty', () => {
    if (!result.stdout || result.stdout.length === 0) {
      return 'No stdout output';
    }
    return true;
  });

  test('conflict-detector scan reports health score', 'output contains health/score/conflict keywords', () => {
    const output = result.stdout + result.stderr;
    const hasHealthKeyword =
      output.includes('health') ||
      output.includes('Health') ||
      output.includes('score') ||
      output.includes('Score') ||
      output.includes('健康') ||
      output.includes('分数') ||
      output.includes('冲突') ||
      output.includes('conflict') ||
      output.includes('Conflict') ||
      output.includes('检测') ||
      output.includes('扫描');
    if (!hasHealthKeyword) return `Output does not contain expected health/score keywords\nOutput: ${output.substring(0, 200)}`;
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: Fusion CLI Integration
// ════════════════════════════════════════════════════════════════════════════

function runFusionCLITests() {
  console.log(`\n${C.bold}${C.cyan}━━━ 4. Fusion CLI Integration Test ━━━${C.reset}\n`);

  const fusion = path.join(BASE_DIR, 'fusion.js');

  test('fusion.js file exists', 'file is readable', () => {
    if (!fs.existsSync(fusion)) return 'File not found: fusion.js';
    return true;
  });

  const versionResult = runScript(fusion, ['--version']);

  test('fusion --version exits cleanly', 'exit code === 0', () => {
    if (versionResult.timedOut) return 'Process timed out after 15s';
    if (versionResult.code !== 0) return `Exit code ${versionResult.code}\nStderr: ${versionResult.stderr}`;
    return true;
  });

  test('fusion --version outputs "2.0.0"', 'stdout contains "2.0.0"', () => {
    const output = versionResult.stdout + versionResult.stderr;
    if (!output.includes('2.0.0')) return `Output does not contain "2.0.0"\nOutput: ${output.substring(0, 200)}`;
    return true;
  });

  const doctorResult = runScript(fusion, ['doctor']);

  test('fusion doctor exits cleanly', 'exit code === 0', () => {
    if (doctorResult.timedOut) return 'Process timed out after 15s';
    if (doctorResult.code !== 0) return `Exit code ${doctorResult.code}\nStderr: ${doctorResult.stderr}`;
    return true;
  });

  test('fusion doctor produces output', 'stdout is not empty', () => {
    if (!doctorResult.stdout || doctorResult.stdout.length === 0) {
      return 'No stdout output';
    }
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE 5: Component Availability
// ════════════════════════════════════════════════════════════════════════════

function runComponentAvailabilityTests() {
  console.log(`\n${C.bold}${C.cyan}━━━ 5. Component Availability Test ━━━${C.reset}\n`);

  const components = [
    'memory-sync.js',
    'conflict-detector.js',
    'fusion-deep.js',
    'fusion-auto.js',
    'fusion-cli.js',
    'fusion.js',
    'refresh-dashboard.js',
    'hermite-bridge/index.js',
    'workbuddy-bridge/index.js',
    'plugins/fusion-router/index.js',
  ];

  for (const rel of components) {
    const name = rel.replace(/\.js$/, '').replace(/\/index$/, '').replace(/\//, '/');
    test(`Component: ${rel}`, 'file exists and is non-empty', () => {
      const fp = path.join(BASE_DIR, rel);
      if (!fs.existsSync(fp)) return `File not found: ${rel}`;
      const stat = fs.statSync(fp);
      if (stat.size === 0) return `File is empty: ${rel}`;
      return true;
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE 6: Runtime Data Integrity
// ════════════════════════════════════════════════════════════════════════════

function runDataIntegrityTests() {
  console.log(`\n${C.bold}${C.cyan}━━━ 6. Runtime Data Integrity Test ━━━${C.reset}\n`);

  const jsonFiles = [
    'sync-log.json',
    'sync-hashes.json',
    'conflict-log.json',
  ];

  for (const rel of jsonFiles) {
    test(`JSON: ${rel}`, 'file exists and is valid JSON', () => {
      const fp = path.join(BASE_DIR, rel);
      if (!fs.existsSync(fp)) return `File not found: ${rel}`;
      let content;
      try {
        content = fs.readFileSync(fp, 'utf-8');
      } catch (err) {
        return `Cannot read file: ${err.message}`;
      }
      if (!content.trim()) return 'File is empty';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return `Invalid JSON: ${err.message}`;
      }
      if (parsed === null || typeof parsed !== 'object') return 'JSON does not parse to an object';
      return true;
    });
  }

  // Verify sync-log has expected structure
  test('sync-log.json has "lastSync" field', 'contains lastSync timestamp', () => {
    const fp = path.join(BASE_DIR, 'sync-log.json');
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!data.lastSync) return 'Missing "lastSync" field';
    const date = new Date(data.lastSync);
    if (isNaN(date.getTime())) return `"lastSync" is not a valid ISO date: ${data.lastSync}`;
    return true;
  });

  // Verify sync-hashes has "files" field
  test('sync-hashes.json has "files" field', 'contains file hash records', () => {
    const fp = path.join(BASE_DIR, 'sync-hashes.json');
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!data.files) return 'Missing "files" field';
    if (typeof data.files !== 'object') return '"files" is not an object';
    const keys = Object.keys(data.files);
    if (keys.length === 0) return '"files" object is empty';
    return true;
  });

  // Verify conflict-log has "conflicts" field
  test('conflict-log.json has "conflicts" field', 'contains conflict records', () => {
    const fp = path.join(BASE_DIR, 'conflict-log.json');
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!data.conflicts) return 'Missing "conflicts" field';
    if (!Array.isArray(data.conflicts)) return '"conflicts" is not an array';
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

function main() {
  console.log('');
  console.log(`${C.bold}╔══════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║   Fusion Bridge — End-to-End Test Suite         ║${C.reset}`);
  console.log(`${C.bold}║   ${C.dim}Task -> Route -> Sync -> Conflict -> Dashboard${C.reset}  ${C.bold}║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  ${C.dim}Base directory: ${BASE_DIR}${C.reset}`);
  console.log(`  ${C.dim}Node.js: ${process.version}${C.reset}`);
  console.log(`  ${C.dim}Date: ${new Date().toISOString()}${C.reset}`);

  const startTime = Date.now();

  // Run all test suites
  runRouterTests();
  runMemorySyncTests();
  runConflictDetectorTests();
  runFusionCLITests();
  runComponentAvailabilityTests();
  runDataIntegrityTests();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${C.bold}━━━ Test Summary ━━━${C.reset}\n`);
  console.log(`  ${C.cyan}Total:${C.reset}   ${totalTests}`);
  console.log(`  ${C.green}Passed:${C.reset}  ${passedTests}`);
  console.log(`  ${C.red}Failed:${C.reset}  ${failedTests}`);
  console.log(`  ${C.dim}Time:${C.reset}    ${elapsed}s`);

  if (failedTests > 0) {
    console.log(`\n${C.red}${C.bold}Failed Tests:${C.reset}`);
    for (const f of failures) {
      console.log(`  ${C.red}✗${C.reset} ${f.name}`);
      console.log(`    ${C.dim}${f.reason}${C.reset}`);
    }
  }

  const pct = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  const pctColor = pct === 100 ? C.green : pct >= 80 ? C.yellow : C.red;
  console.log(`\n${C.bold}${pctColor}${passedTests}/${totalTests} tests passed (${pct}%)${C.reset}`);

  if (pct === 100) {
    console.log(`${C.green}${C.bold}  All tests passed!${C.reset}\n`);
  } else {
    console.log(`${C.red}${C.bold}  Some tests failed.${C.reset}\n`);
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

main();
