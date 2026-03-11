/**
 * Capture nasOS screenshots for README documentation.
 * Usage: npx playwright test --config=docs/capture-screenshots.mjs
 *   OR:  node docs/capture-screenshots.mjs  (uses playwright directly)
 *
 * Requires: backend running on :8080, frontend on :5175
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(__dirname, 'screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE = 'http://localhost:5175';
const WIDTH = 1280;
const HEIGHT = 800;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });

  // ── 1. Login Screen ──────────────────────────────────────────
  console.log('1/6  Login screen...');
  const loginPage = await ctx.newPage();
  await loginPage.goto(BASE, { waitUntil: 'networkidle' });
  await loginPage.waitForTimeout(1000);
  await loginPage.screenshot({ path: join(SHOTS_DIR, 'login.png') });

  // ── 2. Authenticate ──────────────────────────────────────────
  console.log('     Logging in...');
  // Fill in login form
  await loginPage.fill('input[autocomplete="username"], input[type="text"]', 'admin');
  await loginPage.fill('input[type="password"]', 'admin123');
  await loginPage.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")');
  await loginPage.waitForTimeout(2000);

  // ── 3. Desktop Overview (hero image) ─────────────────────────
  console.log('2/6  Desktop overview...');
  // Open File Manager by double-clicking desktop icon
  const fileIcon = loginPage.locator('text=File Manager').first();
  if (await fileIcon.isVisible()) {
    await fileIcon.dblclick();
    await loginPage.waitForTimeout(800);
  }
  // Open System Monitor
  const monIcon = loginPage.locator('text=Monitor').first();
  if (await monIcon.isVisible()) {
    await monIcon.dblclick();
    await loginPage.waitForTimeout(800);
  }
  await loginPage.waitForTimeout(500);
  await loginPage.screenshot({ path: join(SHOTS_DIR, 'desktop.png') });

  // ── 4. File Manager ──────────────────────────────────────────
  console.log('3/6  File Manager...');
  // Close System Monitor if open and maximize File Manager
  // Just take a screenshot of the current state - File Manager should be visible
  // We'll take a fresh page approach - close all and open just File Manager
  await loginPage.keyboard.press('Alt+F4');  // close top window
  await loginPage.waitForTimeout(300);
  await loginPage.screenshot({ path: join(SHOTS_DIR, 'file-manager.png') });

  // ── 5. Docker App Store ──────────────────────────────────────
  console.log('4/6  Docker App Store...');
  await loginPage.keyboard.press('Alt+F4');  // close File Manager
  await loginPage.waitForTimeout(300);
  const dockerIcon = loginPage.locator('text=Docker').first();
  if (await dockerIcon.isVisible()) {
    await dockerIcon.dblclick();
    await loginPage.waitForTimeout(1000);
  }
  // Click the "App Store" tab
  const catalogTab = loginPage.locator('button:has-text("App Store")').first();
  if (await catalogTab.isVisible()) {
    await catalogTab.click();
    await loginPage.waitForTimeout(1000);
  }
  await loginPage.screenshot({ path: join(SHOTS_DIR, 'docker-appstore.png') });

  // ── 6. Settings Panel ────────────────────────────────────────
  console.log('5/6  Settings...');
  await loginPage.keyboard.press('Alt+F4');
  await loginPage.waitForTimeout(300);
  const settingsIcon = loginPage.locator('text=Settings').first();
  if (await settingsIcon.isVisible()) {
    await settingsIcon.dblclick();
    await loginPage.waitForTimeout(1000);
  }
  await loginPage.screenshot({ path: join(SHOTS_DIR, 'settings.png') });

  // ── 7. System Monitor ────────────────────────────────────────
  console.log('6/6  System Monitor...');
  await loginPage.keyboard.press('Alt+F4');
  await loginPage.waitForTimeout(300);
  const monitorIcon = loginPage.locator('text=Monitor').first();
  if (await monitorIcon.isVisible()) {
    await monitorIcon.dblclick();
    await loginPage.waitForTimeout(1500);  // Let sparklines populate
  }
  await loginPage.screenshot({ path: join(SHOTS_DIR, 'system-monitor.png') });

  console.log('Done! Screenshots saved to docs/screenshots/');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
