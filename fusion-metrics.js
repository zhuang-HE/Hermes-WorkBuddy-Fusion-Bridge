#!/usr/bin/env node
/**
 * Fusion Metrics — Performance metrics collection and reporting for Fusion Bridge
 * =============================================================================
 *
 * Metric types:
 *   histogram — latency measurements (array of values)
 *   counter   — event counts (integer)
 *   gauge     — current values (number)
 *
 * Usage:
 *   node fusion-metrics.js              Print formatted report
 *   node fusion-metrics.js report       Print formatted report
 *   node fusion-metrics.js collect      Run all instrumentations
 *   node fusion-metrics.js export [fp]  Export metrics to JSON
 *   node fusion-metrics.js clear        Clear all metrics
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const DEFAULT_FILE = path.join(__dirname, 'fusion-metrics.json');

// ── Percentile (sorted array, linear interpolation) ─────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ── MetricsCollector ────────────────────────────────────────────────────────

class MetricsCollector {
  constructor() {
    /** @type {Map<string, {name:string, type:string, values:number[], tags:Object, timestamps:string[], createdAt:string, updatedAt:string}>} */
    this._metrics = new Map();
  }

  // -- Core recording --------------------------------------------------------

  /**
   * Record a metric data point with timestamp.
   * @param {string} metricName
   * @param {number} value
   * @param {{tags?:Object}} [opts]
   */
  record(metricName, value, opts = {}) {
    const tags = opts.tags || {};
    const now = new Date().toISOString();
    let entry = this._metrics.get(metricName);
    if (!entry) {
      entry = { name: metricName, type: 'histogram', values: [], tags, timestamps: [], createdAt: now, updatedAt: now };
      this._metrics.set(metricName, entry);
    }
    if (Object.keys(tags).length > 0 && !deepEqual(entry.tags, tags)) {
      entry.tags = { ...entry.tags, ...tags };
    }
    entry.values.push(value);
    entry.timestamps.push(now);
    entry.updatedAt = now;
    return this;
  }

  /**
   * Record a latency histogram value (milliseconds).
   * @param {string} metricName
   * @param {number} valueMs
   * @param {{tags?:Object}} [opts]
   */
  histogram(metricName, valueMs, opts = {}) {
    return this.record(metricName, valueMs, opts);
  }

  /**
   * Increment a counter by 1.
   * @param {string} metricName
   * @param {{tags?:Object}} [opts]
   */
  counter(metricName, opts = {}) {
    const tags = opts.tags || {};
    const now = new Date().toISOString();
    let entry = this._metrics.get(metricName);
    if (!entry) {
      entry = { name: metricName, type: 'counter', values: [1], tags, timestamps: [now], createdAt: now, updatedAt: now };
      this._metrics.set(metricName, entry);
      return this;
    }
    entry.values[0] = (typeof entry.values[0] === 'number' ? entry.values[0] : entry.values.length) + 1;
    entry.timestamps.push(now);
    entry.updatedAt = now;
    return this;
  }

  /**
   * Set a gauge value.
   * @param {string} metricName
   * @param {number} value
   * @param {{tags?:Object}} [opts]
   */
  gauge(metricName, value, opts = {}) {
    const tags = opts.tags || {};
    const now = new Date().toISOString();
    let entry = this._metrics.get(metricName);
    if (!entry) {
      entry = { name: metricName, type: 'gauge', values: [value], tags, timestamps: [now], createdAt: now, updatedAt: now };
      this._metrics.set(metricName, entry);
      return this;
    }
    entry.values[0] = value;
    entry.timestamps.push(now);
    entry.updatedAt = now;
    return this;
  }

  // -- Queries ---------------------------------------------------------------

  /**
   * Get summary stats for a metric: count, min, max, avg, p50, p95, p99.
   * @param {string} metricName
   * @returns {{count:number, min:number, max:number, avg:number, p50:number, p95:number, p99:number}|null}
   */
  getSummary(metricName) {
    const entry = this._metrics.get(metricName);
    if (!entry) return null;

    const vals = entry.values.slice();
    const count = vals.length;

    if (entry.type === 'counter') {
      return { count: 1, value: vals[0], min: vals[0], max: vals[0], avg: vals[0], p50: vals[0], p95: vals[0], p99: vals[0] };
    }
    if (entry.type === 'gauge') {
      return { count: 1, value: vals[0], min: vals[0], max: vals[0], avg: vals[0], p50: vals[0], p95: vals[0], p99: vals[0] };
    }

    // histogram
    const sorted = vals.slice().sort((a, b) => a - b);
    const sum = vals.reduce((s, v) => s + v, 0);
    return {
      count,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / count,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
    };
  }

  /**
   * Return all recorded metrics as an array of entries.
   */
  getAllMetrics() {
    return [...this._metrics.values()];
  }

  // -- Lifecycle -------------------------------------------------------------

  /**
   * Clear all metrics.
   */
  clear() {
    this._metrics.clear();
    return this;
  }

  /**
   * Export to a plain JSON-serialisable object.
   */
  export() {
    return {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      metrics: [...this._metrics.values()],
    };
  }

  /**
   * Import from a plain object (as returned by .export()).
   * @param {Object} data
   */
  import(data) {
    if (!data || !Array.isArray(data.metrics)) {
      throw new Error('Invalid import data: expected { metrics: [...] }');
    }
    this._metrics.clear();
    for (const entry of data.metrics) {
      this._metrics.set(entry.name, {
        name: entry.name,
        type: entry.type || 'histogram',
        values: Array.isArray(entry.values) ? entry.values : [],
        tags: entry.tags || {},
        timestamps: Array.isArray(entry.timestamps) ? entry.timestamps : [],
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: entry.updatedAt || new Date().toISOString(),
      });
    }
    return this;
  }

  /**
   * Save metrics to a JSON file.
   * @param {string} [filepath]
   */
  save(filepath) {
    filepath = filepath || DEFAULT_FILE;
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(this.export(), null, 2), 'utf-8');
    return this;
  }

  /**
   * Load metrics from a JSON file.
   * @param {string} [filepath]
   */
  load(filepath) {
    filepath = filepath || DEFAULT_FILE;
    const raw = fs.readFileSync(filepath, 'utf-8');
    this.import(JSON.parse(raw));
    return this;
  }

  // -- Built-in instrumentations ---------------------------------------------

  /**
   * Run memory-sync and record timing.
   * @returns {{elapsedMs:number, ok:boolean, error?:Error}}
   */
  instrumentSync() {
    const start = process.hrtime.bigint();
    let ok = true;
    let error = null;
    try {
      const syncScript = path.join(__dirname, 'memory-sync.js');
      if (!fs.existsSync(syncScript)) throw new Error('memory-sync.js not found');
      // Use synchronous require of the child to measure wall-clock accurately.
      // memory-sync.js runs via CLI; invoke via spawnSync.
      const { spawnSync } = require('child_process');
      const result = spawnSync(process.execPath, [syncScript, 'sync'], {
        cwd: __dirname,
        timeout: 120_000,
        stdio: 'pipe',
      });
      ok = result.status === 0;
      if (!ok && result.stderr) {
        error = new Error(result.stderr.toString().trim().split('\n')[0]);
      }
    } catch (e) {
      ok = false;
      error = e;
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    this.histogram('sync', elapsedMs).counter('sync_total');
    return { elapsedMs, ok, error };
  }

  /**
   * Run conflict-detector scan and record timing.
   * @returns {{elapsedMs:number, ok:boolean, error?:Error}}
   */
  instrumentConflict() {
    const start = process.hrtime.bigint();
    let ok = true;
    let error = null;
    try {
      const conflictScript = path.join(__dirname, 'conflict-detector.js');
      if (!fs.existsSync(conflictScript)) throw new Error('conflict-detector.js not found');
      const { spawnSync } = require('child_process');
      const result = spawnSync(process.execPath, [conflictScript, 'scan'], {
        cwd: __dirname,
        timeout: 120_000,
        stdio: 'pipe',
      });
      ok = result.status === 0;
      if (!ok && result.stderr) {
        error = new Error(result.stderr.toString().trim().split('\n')[0]);
      }
    } catch (e) {
      ok = false;
      error = e;
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    this.histogram('conflict_scan', elapsedMs).counter('conflict_total');
    return { elapsedMs, ok, error };
  }

  /**
   * Run fusion-router on a task and record timing + confidence.
   * @param {string} task - The task description to route
   * @returns {{elapsedMs:number, confidence:number, route:string|null, ok:boolean, error?:Error}}
   */
  instrumentRoute(task) {
    const start = process.hrtime.bigint();
    let ok = true;
    let error = null;
    let route = null;
    let confidence = 0;
    try {
      const routerScript = path.join(__dirname, 'plugins', 'fusion-router', 'index.js');
      if (!fs.existsSync(routerScript)) throw new Error('fusion-router/index.js not found');
      const { spawnSync } = require('child_process');
      const result = spawnSync(process.execPath, [routerScript, task], {
        cwd: __dirname,
        timeout: 60_000,
        stdio: 'pipe',
      });
      ok = result.status === 0;
      const stdout = (result.stdout || '').toString();
      // Attempt to extract confidence from output lines like "Confidence: 0.85"
      const confMatch = stdout.match(/confidence[:\s]+([\d.]+)/i);
      if (confMatch) confidence = parseFloat(confMatch[1]);
      const routeMatch = stdout.match(/route[:\s]+(\S+)/i) || stdout.match(/(workbuddy|hermes|both)/i);
      if (routeMatch) route = routeMatch[1].toLowerCase();
      if (!ok && result.stderr) {
        error = new Error(result.stderr.toString().trim().split('\n')[0]);
      }
    } catch (e) {
      ok = false;
      error = e;
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    this.histogram('route', elapsedMs).counter('route_total');
    if (confidence > 0) this.gauge('route_confidence', confidence);
    return { elapsedMs, confidence, route, ok, error };
  }

  /**
   * Run fusion-deep deep-sync and record timing.
   * @returns {{elapsedMs:number, ok:boolean, error?:Error}}
   */
  instrumentDeepSync() {
    const start = process.hrtime.bigint();
    let ok = true;
    let error = null;
    try {
      const deepScript = path.join(__dirname, 'fusion-deep.js');
      if (!fs.existsSync(deepScript)) throw new Error('fusion-deep.js not found');
      const { spawnSync } = require('child_process');
      const result = spawnSync(process.execPath, [deepScript, 'deep-sync'], {
        cwd: __dirname,
        timeout: 180_000,
        stdio: 'pipe',
      });
      ok = result.status === 0;
      if (!ok && result.stderr) {
        error = new Error(result.stderr.toString().trim().split('\n')[0]);
      }
    } catch (e) {
      ok = false;
      error = e;
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    this.histogram('deep_sync', elapsedMs);
    return { elapsedMs, ok, error };
  }

  // -- Report ----------------------------------------------------------------

  /**
   * Print a formatted metrics report to stdout.
   */
  printReport() {
    const metrics = this.getAllMetrics();
    const histograms = metrics.filter(m => m.type === 'histogram');
    const counters = metrics.filter(m => m.type === 'counter');
    const gauges = metrics.filter(m => m.type === 'gauge');

    console.log('\n═══ Fusion Metrics Report ═══');

    // --- Latency table ---
    if (histograms.length > 0) {
      console.log('\nLatency (ms):');

      // Column widths
      const nameW = Math.max(12, ...histograms.map(m => m.name.length));
      const numW = 6;

      const hBorder = `┌${'─'.repeat(nameW + 2)}┬${'─'.repeat(numW + 2)}┬${'─'.repeat(numW + 2)}┬${'─'.repeat(numW + 2)}┬${'─'.repeat(numW + 2)}┬${'─'.repeat(numW + 2)}┬${'─'.repeat(numW + 2)}┐`;
      const hSep    = `├${'─'.repeat(nameW + 2)}┼${'─'.repeat(numW + 2)}┼${'─'.repeat(numW + 2)}┼${'─'.repeat(numW + 2)}┼${'─'.repeat(numW + 2)}┼${'─'.repeat(numW + 2)}┼${'─'.repeat(numW + 2)}┤`;
      const hBottom = `└${'─'.repeat(nameW + 2)}┴${'─'.repeat(numW + 2)}┴${'─'.repeat(numW + 2)}┴${'─'.repeat(numW + 2)}┴${'─'.repeat(numW + 2)}┴${'─'.repeat(numW + 2)}┴${'─'.repeat(numW + 2)}┘`;

      const hdr = (label, w) => label.padStart(w);
      const val = (n, w) => (typeof n === 'number' ? Math.round(n) : n).toString().padStart(w);

      console.log(hBorder);
      console.log(`│ ${hdr('Metric', nameW)} │${hdr('Count', numW)} │${hdr('Min', numW)} │${hdr('Avg', numW)} │${hdr('P50', numW)} │${hdr('P95', numW)} │${hdr('P99', numW)} │`);
      console.log(hSep);

      for (const m of histograms) {
        const s = this.getSummary(m.name);
        console.log(`│ ${m.name.padEnd(nameW)} │${val(s.count, numW)} │${val(s.min, numW)} │${val(s.avg, numW)} │${val(s.p50, numW)} │${val(s.p95, numW)} │${val(s.p99, numW)} │`);
      }

      console.log(hBottom);
    }

    // --- Counters ---
    if (counters.length > 0) {
      console.log('\nCounters:');
      for (const m of counters) {
        const v = typeof m.values[0] === 'number' ? m.values[0] : m.values.length;
        console.log(`  ${m.name}: ${v}`);
      }
    }

    // --- Gauges ---
    if (gauges.length > 0) {
      console.log('\nGauges:');
      for (const m of gauges) {
        console.log(`  ${m.name}: ${m.values[0]}`);
      }
    }

    if (metrics.length === 0) {
      console.log('\n  (no metrics recorded)');
    }

    console.log('');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => deepEqual(a[k], b[k]));
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function runCLI() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'report';
  const collector = new MetricsCollector();

  // Try to load existing data
  try {
    if (fs.existsSync(DEFAULT_FILE)) {
      collector.load(DEFAULT_FILE);
    }
  } catch {
    // start fresh
  }

  switch (cmd) {
    case 'report':
      collector.printReport();
      break;

    case 'collect': {
      console.log('Running instrumentations...\n');

      const results = [];

      // Sync
      console.log('  [1/4] memory-sync ...');
      const syncR = collector.instrumentSync();
      console.log(`    -> ${syncR.ok ? 'OK' : 'FAIL'} (${syncR.elapsedMs.toFixed(0)}ms)`);
      results.push(syncR);

      // Conflict scan
      console.log('  [2/4] conflict-detector scan ...');
      const confR = collector.instrumentConflict();
      console.log(`    -> ${confR.ok ? 'OK' : 'FAIL'} (${confR.elapsedMs.toFixed(0)}ms)`);
      results.push(confR);

      // Route (sample task)
      console.log('  [3/4] fusion-router (sample task) ...');
      const task = args[1] || 'analyse financial data';
      const routeR = collector.instrumentRoute(task);
      console.log(`    -> ${routeR.ok ? 'OK' : 'FAIL'} (${routeR.elapsedMs.toFixed(0)}ms, confidence: ${routeR.confidence})`);
      results.push(routeR);

      // Deep sync
      console.log('  [4/4] fusion-deep deep-sync ...');
      const deepR = collector.instrumentDeepSync();
      console.log(`    -> ${deepR.ok ? 'OK' : 'FAIL'} (${deepR.elapsedMs.toFixed(0)}ms)`);
      results.push(deepR);

      // Persist
      collector.save();

      console.log(`\nMetrics saved to ${DEFAULT_FILE}`);
      console.log();
      collector.printReport();
      break;
    }

    case 'export': {
      const fp = args[1] || DEFAULT_FILE;
      collector.save(fp);
      console.log(`Exported metrics to ${fp}`);
      break;
    }

    case 'clear': {
      collector.clear();
      collector.save();
      console.log('All metrics cleared.');
      break;
    }

    default:
      console.log(`Unknown command: ${cmd}`);
      console.log('Usage: node fusion-metrics.js [report|collect|export [filepath]|clear]');
      process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  runCLI();
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = { MetricsCollector, percentile };
