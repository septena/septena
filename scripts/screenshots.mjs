#!/usr/bin/env node
/**
 * Screenshot automation — spins up a full ephemeral Setlist instance
 * (FastAPI backend + Next.js frontend) pointed at a seeded demo vault,
 * visits each section, saves screenshots to docs/screenshots/.
 *
 * Usage:
 *   node scripts/screenshots.mjs                  # default sections, full pipeline
 *   node scripts/screenshots.mjs --sections a,b   # only these sections
 *   node scripts/screenshots.mjs --keep           # don't tear down servers on exit
 *   node scripts/screenshots.mjs --out dir/       # custom output directory
 *
 * Requires: `npm install -D playwright` and a seeded demo vault at
 * /tmp/setlist-demo-vault (auto-seeded if missing).
 */

import { chromium } from "playwright";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { tmpdir } from "os";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

// ── Args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const get = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : null; };

const OUT_DIR = get("--out") ?? join(ROOT, "docs", "screenshots");
const DEMO_VAULT = join(tmpdir(), "setlist-demo-vault");
const BACKEND_PORT = 14445;
const FRONTEND_PORT = 14444;
const VIEWPORT = { width: 1440, height: 900 };
const KEEP_SERVERS = has("--keep");
const CACHE_DIR = join(tmpdir(), "setlist-demo-cache");
const HEALTH_CACHE_PATH = join(CACHE_DIR, "health-cache.json");

const DEFAULT_SECTIONS = [
  { slug: "overview", path: "/" },
  { slug: "exercise", path: "/exercise" },
  { slug: "nutrition", path: "/nutrition" },
  { slug: "habits", path: "/habits" },
  { slug: "supplements", path: "/supplements" },
  { slug: "caffeine", path: "/caffeine" },
  { slug: "chores", path: "/chores" },
  { slug: "sleep", path: "/sleep" },
  { slug: "body", path: "/body" },
  { slug: "health", path: "/health" },
  { slug: "insights", path: "/insights" },
];
const SECTIONS = get("--sections")
  ? DEFAULT_SECTIONS.filter((s) => get("--sections").split(",").includes(s.slug))
  : DEFAULT_SECTIONS;

// ── Seed demo vault ─────────────────────────────────────────────────────────
async function seedVault() {
  console.log(`🌱  Seeding demo vault at ${DEMO_VAULT}…`);
  return new Promise((resolve, reject) => {
    const p = spawn("python3", [
      join(ROOT, "scripts", "seed_demo_vault.py"),
      "--vault", DEMO_VAULT,
      "--days", "30",
    ], { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let err = "";
    p.stderr.on("data", (c) => { err += c; });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`seed failed (${code}): ${err}`));
    });
  });
}

// ── Seed health cache ───────────────────────────────────────────────────────
async function seedHealthCache() {
  console.log(`🩺  Seeding demo health cache at ${HEALTH_CACHE_PATH}…`);
  return new Promise((resolve, reject) => {
    const p = spawn("python3", [
      join(ROOT, "scripts", "seed_demo_health.py"),
      "--out", HEALTH_CACHE_PATH,
      "--days", "30",
    ], { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let err = "";
    p.stderr.on("data", (c) => { err += c; });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`health seed failed (${code}): ${err}`));
    });
  });
}

// ── Start backend ───────────────────────────────────────────────────────────
async function startBackend() {
  console.log(`🐍  Starting backend on :${BACKEND_PORT}…`);
  const proc = spawn("python3", [
    "-m", "uvicorn", "main:app", "--port", String(BACKEND_PORT), "--log-level", "warning",
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      SETLIST_VAULT: DEMO_VAULT,
      // Integrations dir that doesn't exist → Oura/Withings/HAE all fail
      // fast. In demo mode the health router serves the pre-seeded cache
      // (see SETLIST_DEMO_HEALTH + seed_demo_health.py).
      SETLIST_INTEGRATIONS_DIR: "/tmp/setlist-nonexistent-integrations",
      SETLIST_CACHE_DIR: CACHE_DIR,
      SETLIST_DEMO_HEALTH: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (c) => { log += c; });
  proc.stderr.on("data", (c) => { log += c; });

  await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/config`, 30_000, log);
  console.log(`✓    Backend ready`);
  return proc;
}

// ── Start frontend ──────────────────────────────────────────────────────────
async function buildFrontend() {
  // Production build: `next dev`'s HMR WebSocket crashes in headless
  // Chromium (ERR_INVALID_HTTP_RESPONSE), which aborts hydration before
  // useSWR fires any fetches. `next start` has no HMR client.
  console.log(`🔨  Building frontend…`);
  return new Promise((resolve, reject) => {
    // --webpack: Turbopack's prod parser rejects valid JSX in
    // components/nutrition-dashboard.tsx; webpack build succeeds.
    const p = spawn(join(ROOT, "node_modules", ".bin", "next"), ["build", "--webpack"], {
      cwd: ROOT,
      env: {
        ...process.env,
        SETLIST_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
        NEXT_DIST_DIR: ".next-screenshots",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    p.stdout.on("data", (c) => { log += c; });
    p.stderr.on("data", (c) => { log += c; });
    p.on("exit", (code) => {
      if (code === 0) { console.log(`✓    Build complete`); resolve(); }
      else reject(new Error(`next build failed (${code}):\n${log}`));
    });
  });
}

async function startFrontend() {
  console.log(`⚡  Starting prod server on :${FRONTEND_PORT}…`);
  const proc = spawn(join(ROOT, "node_modules", ".bin", "next"), [
    "start", "--port", String(FRONTEND_PORT),
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      SETLIST_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
      NEXT_DIST_DIR: ".next-screenshots",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (c) => { log += c; });
  proc.stderr.on("data", (c) => { log += c; });

  await waitFor(`http://127.0.0.1:${FRONTEND_PORT}/`, 60_000, log);
  console.log(`✓    Frontend ready`);
  return proc;
}

async function waitFor(url, timeoutMs, context) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}\n${context}`);
}

// ── Screenshot ──────────────────────────────────────────────────────────────
async function takeScreenshots() {
  console.log(`📸  Launching browser…`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "light",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  mkdirSync(OUT_DIR, { recursive: true });

  page.on("pageerror", (err) => console.log(`      ! pageerror: ${err.message}`));
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("webpack-hmr") || t.includes("Download the React DevTools")) return;
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`      ! ${msg.type()}: ${t}`);
    }
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("_next") || url.includes("hot-update")) return;
    console.log(`      ! requestfailed: ${url} (${req.failure()?.errorText})`);
  });

  for (const section of SECTIONS) {
    const url = `http://127.0.0.1:${FRONTEND_PORT}${section.path}`;
    console.log(`    → ${section.slug}  (${url})`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    try {
      await page.waitForFunction(() => {
        const txt = document.body?.innerText ?? "";
        return !/Loading/i.test(txt);
      }, null, { timeout: 10_000 });
    } catch {}
    await page.waitForTimeout(800);
    // Hide Next.js dev chrome.
    await page.addStyleTag({ content: `
      [data-nextjs-toast], [data-next-badge], nextjs-portal,
      #__next-route-announcer__ { display: none !important; }
    ` });
    const out = join(OUT_DIR, `${section.slug}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`      saved → ${out}`);
  }

  await browser.close();
}

// ── Main ────────────────────────────────────────────────────────────────────
let backend, frontend;
try {
  await seedVault();
  await seedHealthCache();
  backend = await startBackend();
  await buildFrontend();
  frontend = await startFrontend();
  await takeScreenshots();
  console.log(`✓    All screenshots saved under ${OUT_DIR}`);
} catch (err) {
  console.error(`✗    ${err.message}`);
  process.exitCode = 1;
} finally {
  if (!KEEP_SERVERS) {
    if (frontend) frontend.kill("SIGTERM");
    if (backend) backend.kill("SIGTERM");
    console.log("✓    Servers stopped");
  } else {
    console.log(`ℹ    Servers left running (--keep). PIDs: backend=${backend?.pid} frontend=${frontend?.pid}`);
  }
}
