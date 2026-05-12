#!/usr/bin/env node
// fusion.js — Unified Fusion CLI v2.0.0
// Integrates all Hermes + WorkBuddy fusion components into a single entry point.
// No external dependencies.

const VERSION = "2.0.0";
const BASE_DIR = __dirname;
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── ANSI Colors ────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
};

// ── Logging ─────────────────────────────────────────────────────────────────

function log(level, msg) {
  const symbols = { ok: `${C.green}✓${C.reset}`, err: `${C.red}✗${C.reset}`, warn: `${C.yellow}!${C.reset}`, info: `${C.cyan}i${C.reset}`, dim: `${C.dim}·${C.reset}` };
  const sym = symbols[level] || " ";
  console.log(` ${sym}  ${msg}`);
}

function logHeader(title) {
  console.log(`\n${C.bold}${C.cyan}━━━ ${title} ${"─".repeat(Math.max(1, 50 - title.length))}${C.reset}`);
}

// ── Component Registry ─────────────────────────────────────────────────────

const COMPONENTS = {
  sync:      { file: "memory-sync.js",       name: "Memory Sync",       icon: "🔄", version: null },
  route:     { file: "plugins/fusion-router/index.js", name: "Fusion Router",     icon: "➜",  version: null },
  conflict:  { file: "conflict-detector.js",  name: "Conflict Detector", icon: "⚡", version: null },
  dashboard: { file: "refresh-dashboard.js",  name: "Dashboard",         icon: "📊", version: null },
  deep:      { file: "fusion-deep.js",        name: "Fusion Deep",       icon: "🧠", version: null },
  auto:      { file: "fusion-auto.js",        name: "Fusion Auto",       icon: "⚙",  version: null },
  metrics:   { file: "fusion-metrics.js",     name: "Fusion Metrics",    icon: "📈", version: null },
  test:      { file: "test-e2e.js",           name: "E2E Tests",         icon: "🧪", version: null },
};

// ── Delegation Helper ──────────────────────────────────────────────────────

/**
 * Delegate execution to a component script by spawning node with stdio passthrough.
 * @param {string} key - Component key in COMPONENTS
 * @param {string[]} args - Arguments to forward to the script
 */
function delegate(key, args) {
  const comp = COMPONENTS[key];
  if (!comp) {
    log("err", `Unknown component: ${key}`);
    process.exit(1);
  }

  const scriptPath = path.join(BASE_DIR, comp.file);
  if (!fs.existsSync(scriptPath)) {
    log("err", `Component script not found: ${comp.file}`);
    log("dim", `Expected at: ${scriptPath}`);
    process.exit(1);
  }

  // Show delegation banner
  console.log(`${C.bold}${comp.icon} ${comp.name}${C.reset} ${C.dim}(${comp.file})${C.reset}`);
  console.log(`${C.dim}> node "${comp.file}" ${args.join(" ")}${C.reset}\n`);

  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: BASE_DIR,
    stdio: "inherit",
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

// ── Built-in: status ───────────────────────────────────────────────────────

function showStatus() {
  logHeader("Environment Checks");

  runCommand("hermes", ["--version"], (ok, out) => {
    log(ok ? "ok" : "warn", `Hermes CLI    ${ok ? out.trim() : "(not found)"}`);
  }, true);

  runCommand(process.execPath, ["--version"], (ok, out) => {
    log(ok ? "ok" : "err", `Node.js        ${out.trim().split("\n")[0]}`);
  }, true);

  runCommand("ollama", ["list"], (ok, out) => {
    const lines = (out || "").trim().split("\n").filter(Boolean);
    log(ok ? "ok" : "warn", `Ollama        ${ok ? lines.length - 1 + " models" : "(not found)"}`);
  }, true);

  runCommand("hermes", ["gateway", "status"], (ok, out) => {
    const line = (out || "").split("\n").find(l => l.includes("running") || l.includes("stopped") || l.includes("Gateway"));
    log(ok ? "ok" : "warn", `Hermes Gateway ${(line || out || "").trim()}`);
  }, true);

  logHeader("Component Files");

  let allExist = true;
  for (const [key, comp] of Object.entries(COMPONENTS)) {
    const fp = path.join(BASE_DIR, comp.file);
    const exists = fs.existsSync(fp);
    if (!exists) allExist = false;
    log(exists ? "ok" : "err", `${comp.icon} ${comp.name.padEnd(18)} ${comp.file}`);
  }

  logHeader("Runtime Data");

  const dataFiles = [
    "sync-log.json", "sync-hashes.json", "sync-history.json",
    "conflict-log.json", "routing-log.json", "adaptive-weights.json",
  ];

  for (const df of dataFiles) {
    const fp = path.join(BASE_DIR, df);
    if (fs.existsSync(fp)) {
      try {
        const raw = fs.readFileSync(fp, "utf-8");
        const parsed = JSON.parse(raw);
        const count = Array.isArray(parsed) ? parsed.length
          : typeof parsed === "object" ? Object.keys(parsed).length
          : 1;
        log("ok", `${df.padEnd(26)} ${count} entries`);
      } catch {
        log("warn", `${df.padEnd(26)} (parse error)`);
      }
    } else {
      log("dim", `${df.padEnd(26)} (not found)`);
    }
  }

  console.log("");
}

// ── Built-in: doctor ───────────────────────────────────────────────────────

function runDoctor() {
  logHeader("Fusion Doctor — Diagnostics");

  let pass = 0;
  let total = 0;

  function check(label, okFn) {
    total++;
    const result = okFn();
    if (result.ok) pass++;
    log(result.ok ? "ok" : "err", `${label.padEnd(40)} ${result.msg}`);
  }

  // ── Environment ──
  logHeader("Environment");
  check("Node.js >= 22", () => {
    const v = process.versions.node.split(".")[0];
    return { ok: parseInt(v, 10) >= 22, msg: `v${process.versions.node}` };
  });

  check("hermes CLI available", () => {
    try {
      const r = require("child_process").execSync("hermes --version", { encoding: "utf-8", timeout: 5000 }).trim();
      return { ok: true, msg: r || "found" };
    } catch {
      return { ok: false, msg: "not found" };
    }
  });

  check("ollama available", () => {
    try {
      require("child_process").execSync("ollama list", { encoding: "utf-8", timeout: 5000 });
      return { ok: true, msg: "running" };
    } catch {
      return { ok: false, msg: "not found or not running" };
    }
  });

  // ── Component Integrity ──
  logHeader("Component Integrity");
  for (const [key, comp] of Object.entries(COMPONENTS)) {
    check(`File: ${comp.file}`, () => {
      const exists = fs.existsSync(path.join(BASE_DIR, comp.file));
      return { ok: exists, msg: exists ? "present" : "missing" };
    });
  }

  // ── MCP Bridges ──
  logHeader("MCP Bridges");
  const bridgeDirs = ["hermite-bridge", "workbuddy-bridge"];
  for (const bd of bridgeDirs) {
    check(`Bridge dir: ${bd}/`, () => {
      const dp = path.join(BASE_DIR, bd);
      const exists = fs.existsSync(dp) && fs.statSync(dp).isDirectory();
      return { ok: exists, msg: exists ? "present" : "missing" };
    });
  }

  // ── Config Dirs ──
  logHeader("Config Directories");
  const configDirs = [
    path.join(require("os").homedir(), ".workbuddy", "mcp-servers"),
    path.join(require("os").homedir(), ".workbuddy", "config"),
  ];
  for (const cd of configDirs) {
    check(`Config: ${path.basename(cd)}/`, () => {
      const exists = fs.existsSync(cd) && fs.statSync(cd).isDirectory();
      return { ok: exists, msg: exists ? "present" : "missing" };
    });
  }

  // ── Score Summary ──
  const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
  console.log("");
  const color = pct >= 90 ? C.green : pct >= 70 ? C.yellow : C.red;
  console.log(`${C.bold}${color}Score: ${pass}/${total} (${pct}%)${C.reset}`);
  if (pct >= 90) {
    log("ok", "All systems operational.");
  } else if (pct >= 70) {
    log("warn", "Some issues detected — review above.");
  } else {
    log("err", "Multiple issues found — action required.");
  }
  console.log("");

  process.exit(pct < 70 ? 1 : 0);
}

// ── Command Runner Helper ──────────────────────────────────────────────────

/**
 * Run a command synchronously and call back with the result.
 */
function runCommand(cmd, args, cb, silent) {
  try {
    const child = spawn(cmd, args, { stdio: silent ? "pipe" : "inherit", shell: true, timeout: 8000 });
    let stdout = "";
    let stderr = "";
    if (silent) {
      child.stdout.on("data", d => stdout += d.toString());
      child.stderr.on("data", d => stderr += d.toString());
    }
    child.on("close", (code) => {
      cb(code === 0, silent ? stdout : "");
    });
    child.on("error", () => {
      cb(false, "");
    });
  } catch {
    cb(false, "");
  }
}

// ── Help Text ──────────────────────────────────────────────────────────────

function showHelp() {
  const help = `
${C.bold}${C.cyan}
 █████╗ ███╗   ██╗██╗   ██╗████████╗██╗  ██╗
██╔══██╗████╗  ██║██║   ██║╚══██╔══╝██║  ██║
███████║██╔██╗ ██║██║   ██║   ██║   ███████║
██╔══██║██║╚██╗██║██║   ██║   ██║   ██╔══██║
██║  ╚═╝██║ ╚████║╚██████╔╝   ██║   ██║  ██║
╚═╝     ╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝
              Fusion CLI v${VERSION}
${C.reset}
${C.bold}Usage:${C.reset}
  fusion <command> [subcommand|options]

${C.bold}Commands:${C.reset}

  sync / s          Memory synchronization
    sync            Full bidirectional sync (default)
    wb2hm           WorkBuddy → Hermes one-way
    hm2wb           Hermes → WorkBuddy one-way
    force, --force  Force full re-sync
    history         Show sync history
    status          Sync status overview
    dry-run, --dry-run  Preview without applying changes

  route / r         Intelligent task routing
    <task>          Route a task description (default)
    test            Run routing test suite
    feedback        Provide feedback to improve routes
    weights         View/adjust adaptive weights

  conflict / c      Conflict detection & resolution
    scan            Scan for conflicts (default)
    fix             Auto-fix detected conflicts
    history         Show conflict resolution history

  dashboard / d     Dashboard management
    (none)          Refresh and open dashboard (default)
    refresh         Refresh data only
    open            Open dashboard in browser

  deep / d?         Deep fusion operations
    deep-sync       Deep knowledge sync (default)
    inject          Inject new knowledge patterns
    mirror          Mirror cross-system state
    evolve          Evolve fusion models
    status          Deep fusion engine status

  auto / a          Automation & scheduling
    run             Run automation pipeline (default)
    install         Install cron/scheduled tasks
    status          Automation scheduler status

  status / st       Show environment & runtime status
  doctor / dr       Comprehensive diagnostics with scoring
  metrics / m       Performance metrics collection & report
  test / t          Run end-to-end test suite
  help              Show this help message
  --version, -v     Show version number

${C.bold}Examples:${C.reset}
  fusion s                  # Full sync
  fusion s wb2hm            # WorkBuddy → Hermes
  fusion route "debug auth" # Route a task
  fusion c fix              # Fix conflicts
  fusion d open             # Open dashboard
  fusion st                 # Check status
  fusion dr                 # Run diagnostics
  fusion m report           # Show metrics report
  fusion m collect          # Collect metrics from all components
  fusion t                  # Run E2E tests

`;
  console.log(help);
}

// ── Argument Parsing ───────────────────────────────────────────────────────

const argv = process.argv.slice(2);

if (argv.length === 0 || (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"))) {
  showHelp();
  process.exit(0);
}

if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v")) {
  console.log(`fusion v${VERSION}`);
  process.exit(0);
}

// Parse command
const cmd = argv[0];
const restArgs = argv.slice(1);

switch (cmd) {
  // ── sync ────────────────────────────────────────
  case "sync":
  case "s": {
    const sub = restArgs[0];
    const subArgs = restArgs.slice(1);

    if (sub === "force" || sub === "--force") {
      delegate("sync", ["--force"]);
    } else if (sub === "dry-run" || sub === "--dry-run") {
      delegate("sync", ["--dry-run"]);
    } else if (sub && !["wb2hm", "hm2wb", "history", "status"].includes(sub)) {
      // Treat unknown subcommand as default sync but pass it along
      delegate("sync", restArgs);
    } else {
      delegate("sync", restArgs.length > 0 ? restArgs : []);
    }
    break;
  }

  // ── route ───────────────────────────────────────
  case "route":
  case "r": {
    const sub = restArgs[0];

    if (["test", "feedback", "weights"].includes(sub)) {
      delegate("route", restArgs);
    } else {
      // Positional task argument is default
      delegate("route", restArgs);
    }
    break;
  }

  // ── conflict ────────────────────────────────────
  case "conflict":
  case "c": {
    const sub = restArgs[0] || "scan";

    if (["scan", "fix", "history"].includes(sub)) {
      delegate("conflict", restArgs);
    } else {
      delegate("conflict", restArgs); // pass through unknown
    }
    break;
  }

  // ── dashboard ───────────────────────────────────
  case "dashboard":
  case "d": {
    const sub = restArgs[0];

    if (sub === "refresh") {
      delegate("dashboard", ["refresh"]);
    } else if (sub === "open") {
      delegate("dashboard", ["open"]);
    } else if (sub === undefined || sub === "") {
      // Default: no subcommand → just delegate empty
      delegate("dashboard", []);
    } else {
      delegate("dashboard", restArgs);
    }
    break;
  }

  // ── deep ────────────────────────────────────────
  case "deep": {
    const sub = restArgs[0] || "deep-sync";

    if (["inject", "mirror", "evolve", "status", "deep-sync"].includes(sub)) {
      delegate("deep", restArgs);
    } else {
      delegate("deep", restArgs);
    }
    break;
  }

  // ── auto ────────────────────────────────────────
  case "auto":
  case "a": {
    const sub = restArgs[0];

    if (["run", "install", "status"].includes(sub)) {
      delegate("auto", restArgs);
    } else {
      // Default is "run"
      delegate("auto", restArgs.length > 0 ? restArgs : ["run"]);
    }
    break;
  }

  // ── status (built-in) ───────────────────────────
  case "status":
  case "st": {
    showStatus();
    break;
  }

  // ── doctor (built-in) ───────────────────────────
  case "doctor":
  case "dr": {
    runDoctor();
    break;
  }

  // ── metrics ───────────────────────────────────────
  case "metrics":
  case "m": {
    delegate("metrics", restArgs.length > 0 ? restArgs : ["report"]);
    break;
  }

  // ── test ─────────────────────────────────────────
  case "test":
  case "t": {
    delegate("test", restArgs);
    break;
  }

  // ── help ────────────────────────────────────────
  case "help":
  case "-h":
  case "--help": {
    showHelp();
    break;
  }

  // ── version ─────────────────────────────────────
  case "--version":
  case "-v": {
    console.log(`fusion v${VERSION}`);
    break;
  }

  default:
    console.log(`${C.red}Unknown command: ${cmd}${C.reset}`);
    console.log(`Run ${C.cyan}fusion help${C.reset} for available commands.`);
    process.exit(1);
}
