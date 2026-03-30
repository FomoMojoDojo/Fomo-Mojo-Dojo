import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.CAPTURE_URL || 'http://127.0.0.1:8080';
const outDir = path.resolve('artifacts/media');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(1200);

const video = page.video();

const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
const maxScroll = Math.max(0, scrollHeight - 720);
const frames = 64;

for (let i = 0; i < frames; i += 1) {
  const t = i / (frames - 1);
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
  const y = Math.round(maxScroll * eased);
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await page.waitForTimeout(70);
}

await page.waitForTimeout(700);
await context.close();
await browser.close();

if (!video) throw new Error('Video object was not created');
const rawPath = await video.path();
const finalPath = path.join(outDir, 'map-animation.webm');
await fs.copyFile(rawPath, finalPath);
console.log(finalPath);
