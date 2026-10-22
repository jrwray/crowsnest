// Take README screenshots of Crowsnest with live data.
// Usage: node tools/screenshot.mjs <site dir> <out dir>
// Needs internet access for the feeds, so CI runs it (see .github/workflows/screenshots.yml).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const [root = '_site', out = 'screenshots'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  let p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(8123);

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  recordVideo: { dir: out, size: { width: 1440, height: 900 } }
});
const page = await ctx.newPage();
// Set a location so weather shows (headless Chrome has no geolocation).
await page.addInitScript(() => {
  localStorage.setItem('crowsnest:sync:customLocation',
    JSON.stringify({ lat: 39.0997, lon: -94.5786, city: 'Kansas City, Missouri' }));
});
await page.goto('http://localhost:8123/index.html');
await page.addStyleTag({ content: '.demo-banner{display:none!important}' }); // screenshots show the extension, not the demo
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(8000);
await page.screenshot({ path: join(out, 'dark.png') });

// A short tour for the GIF: scroll the feeds, run a search mode, switch theme.
await page.mouse.move(460, 600);
await page.mouse.wheel(0, 500); await page.waitForTimeout(1200);
await page.mouse.wheel(0, -500); await page.waitForTimeout(800);
await page.click('#mode-toggle').catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, 'light.png') });
await page.click('#mode-toggle').catch(() => {});
await page.waitForTimeout(1200);

await ctx.close();
await browser.close();
server.close();
console.log(`Saved screenshots and video to ${out}`);
