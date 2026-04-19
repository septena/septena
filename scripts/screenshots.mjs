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
      // fast with empty state (what we want for screenshots).
      SETLIST_INTEGRATIONS_DIR: "/tmp/setlist-nonexistent-integrations",
      SETLIST_CACHE_DIR: join(tmpdir(), "setlist-demo-cache"),
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
  // Skipped: we use `next dev` to sidestep prerender/Suspense edge cases on
  // sections that use useSearchParams without a Suspense boundary.
}

async function startFrontend() {
  console.log(`⚡  Starting dev server on :${FRONTEND_PORT}…`);
  const proc = spawn(join(ROOT, "node_modules", ".bin", "next"), [
    "dev", "--port", String(FRONTEND_PORT),
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      SETLIST_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (c) => { log += c; });
  proc.stderr.on("data", (c) => { log += c; });

  await waitFor(`http://127.0.0.1:${FRONTEND_PORT}/`, 120_000, log);
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

  for (const section of SECTIONS) {
    const url = `http://127.0.0.1:${FRONTEND_PORT}${section.path}`;
    console.log(`    → ${section.slug}  (${url})`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // Settle charts — SWR + recharts animations can continue after networkidle.
    await page.waitForTimeout(2000);
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
