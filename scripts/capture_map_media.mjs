import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.CAPTURE_URL || 'http://127.0.0.1:8080';
const outDir = path.resolve('artifacts/media');
const framesDir = path.join(outDir, 'map-frames');

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(framesDir, { recursive: true });

function clipped(box, viewport, pad = { x: 40, y: 28 }) {
  const x = Math.max(0, Math.floor(box.x - pad.x));
  const y = Math.max(0, Math.floor(box.y - pad.y));
  const maxW = viewport.width - x;
  const maxH = viewport.height - y;
  const width = Math.max(10, Math.min(maxW, Math.ceil(box.width + pad.x * 2)));
  const height = Math.max(10, Math.min(maxH, Math.ceil(box.height + pad.y * 2)));
  return { x, y, width, height };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1720, height: 1080 },
  deviceScaleFactor: 2,
});

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(3500);

// Make captures a little more dramatic with gentle contrast/shadow and subtle vignette.
await page.addStyleTag({
  content: `
    body { filter: contrast(1.05) saturate(1.06); }
    .capture-vignette {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      background: radial-gradient(circle at 50% 35%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.17) 100%);
    }
  `,
});
await page.evaluate(() => {
  const el = document.createElement('div');
  el.className = 'capture-vignette';
  document.body.appendChild(el);
});

const viewport = page.viewportSize() || { width: 1720, height: 1080 };

// 1) Current position (hero/current reality area)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await page.waitForTimeout(350);
const currentRealityCard = page.locator('div.bg-ink.rounded-2xl').first();
if (await currentRealityCard.count()) {
  await currentRealityCard.screenshot({ path: path.join(outDir, 'current-position.png') });
} else {
  await page.screenshot({ path: path.join(outDir, 'current-position.png') });
}

// 2) Biggest constraint (card headline containing "current constraint")
const constraint = page.getByText(/current constraint\./i).first();
const constraintCard = constraint.locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
if (await constraintCard.count()) {
  await constraintCard.screenshot({ path: path.join(outDir, 'biggest-constraint.png') });
} else {
  const constraintBox = await constraint.boundingBox();
  if (constraintBox) {
    await page.screenshot({
      path: path.join(outDir, 'biggest-constraint.png'),
      clip: clipped(constraintBox, viewport, { x: 140, y: 120 }),
    });
  } else {
    await page.screenshot({ path: path.join(outDir, 'biggest-constraint.png') });
  }
}

// 3) Next move (right-side card)
const nextMove = page.getByText(/Your Next Move/i).first();
const nextMoveCard = nextMove.locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
if (await nextMoveCard.count()) {
  await nextMoveCard.screenshot({ path: path.join(outDir, 'next-move.png') });
} else {
  const nextMoveBox = await nextMove.boundingBox();
  if (nextMoveBox) {
    await page.screenshot({
      path: path.join(outDir, 'next-move.png'),
      clip: clipped(nextMoveBox, viewport, { x: 120, y: 70 }),
    });
  } else {
    await page.screenshot({ path: path.join(outDir, 'next-move.png') });
  }
}

// 4) Map animation frames (smooth scroll through map context)
const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
const maxScroll = Math.max(0, scrollHeight - viewport.height);
const frameCount = 40;

for (let i = 0; i < frameCount; i += 1) {
  const t = i / (frameCount - 1);
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
  const y = Math.round(maxScroll * eased);
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await page.waitForTimeout(70);
  const framePath = path.join(framesDir, `frame-${String(i + 1).padStart(3, '0')}.png`);
  await page.screenshot({ path: framePath });
}

await browser.close();

console.log(JSON.stringify({
  outDir,
  screenshots: [
    path.join(outDir, 'current-position.png'),
    path.join(outDir, 'biggest-constraint.png'),
    path.join(outDir, 'next-move.png'),
  ],
  framesDir,
}, null, 2));
