#!/usr/bin/env node
/**
 * refresh-dashboard.js — 将最新数据注入 Fusion Dashboard
 * 用法: node refresh-dashboard.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; } }

const base = path.join(os.homedir(), '.workbuddy', 'mcp-servers');
const routingLog = readJson(path.join(os.homedir(), '.workbuddy', 'fusion-router', 'routing-log.json'));
const syncLog = readJson(path.join(base, 'sync-log.json'));
const conflictLog = readJson(path.join(base, 'conflict-log.json'));

const templateFile = path.join(base, 'fusion-dashboard.html');
let html = fs.readFileSync(templateFile, 'utf8');

// Replace placeholders with latest data
html = html.replace(/__ROUTING_LOG__[\s\S]*?(?=,\s*__SYNC_LOG__)/, JSON.stringify(routingLog) + ',');
html = html.replace(/__SYNC_LOG__[\s\S]*?(?=,\s*__CONFLICT_LOG__)/, JSON.stringify(syncLog) + ',');
html = html.replace(/__CONFLICT_LOG__[\s\S]*?}/, JSON.stringify(conflictLog));

// Fallback: simple replace if regex doesn't work
if (html.includes('__ROUTING_LOG__')) {
  html = html.replace('__ROUTING_LOG__', JSON.stringify(routingLog));
  html = html.replace('__SYNC_LOG__', JSON.stringify(syncLog));
  html = html.replace('__CONFLICT_LOG__', JSON.stringify(conflictLog));
}

fs.writeFileSync(templateFile, html, 'utf8');

const totalRoutes = routingLog.length;
const wb = routingLog.filter(r => r.winner === 'workbuddy').length;
const hm = routingLog.filter(r => r.winner === 'hermes').length;
const both = routingLog.filter(r => r.winner === 'both').length;

console.log('Dashboard refreshed:');
console.log('  Total routes: ' + totalRoutes + ' (WB:' + wb + ' HM:' + hm + ' Both:' + both + ')');
console.log('  Sync history: ' + (syncLog.wb2hm || []).length + ' WB->HM + ' + (syncLog.hm2wb || []).length + ' HM->WB');
console.log('  File: ' + templateFile);
