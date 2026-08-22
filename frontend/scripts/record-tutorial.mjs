/**
 * Records the "How to use" tutorial by driving the real app in Chromium.
 * Usage: node scripts/record-tutorial.mjs  (dev server on :5173, API on :8001)
 * Output: public/tutorial/how-to-use.webm + .mp4 (ffmpeg), ~2 minutes.
 */
import { chromium } from 'playwright';
import { mkdirSync, renameSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT_DIR = path.resolve('public/tutorial');
const TMP = path.resolve('.tutorial-tmp');
const W = 1280, H = 720;
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// Headless, but on the real GPU via ANGLE/D3D11 (SwiftShader breaks the offscreen render engine).
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: TMP, size: { width: W, height: H } },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.addInitScript(() => { localStorage.removeItem('token'); localStorage.setItem('helpSeen', '1'); });

const sleep = (ms) => page.waitForTimeout(ms);

/** Big caption bar + animated cursor ring, injected into the live page. */
async function caption(text, step) {
  await page.evaluate(({ text, step }) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 99999,
        background: 'rgba(12,14,18,.92)', color: '#fff', padding: '14px 22px', borderRadius: '12px',
        font: '600 22px/1.3 Inter, system-ui, sans-serif', maxWidth: '80%', boxShadow: '0 10px 30px rgba(0,0,0,.5)',
        border: '1px solid rgba(255,180,84,.5)', pointerEvents: 'none', display: 'flex', gap: '14px', alignItems: 'center',
      });
      document.body.appendChild(el);
    }
    el.innerHTML = (step ? `<span style="background:#ffb454;color:#1a1a1a;border-radius:999px;min-width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;font-weight:800">${step}</span>` : '') + `<span>${text}</span>`;
  }, { text, step });
}

async function clickText(text, { exact = true, force = true } = {}) {
  const loc = page.getByRole('button', { name: text, exact });
  await loc.first().scrollIntoViewIfNeeded();
  await sleep(150); // let layout settle before measuring
  const box = await loc.first().boundingBox();
  if (box) await highlight(box);
  await loc.first().click({ force });
}

async function highlight(box) {
  await page.evaluate(({ x, y, w, h }) => {
    const r = document.createElement('div');
    Object.assign(r.style, {
      position: 'fixed', left: x - 6 + 'px', top: y - 6 + 'px', width: w + 12 + 'px', height: h + 12 + 'px',
      border: '3px solid #ffb454', borderRadius: '8px', zIndex: 99998, pointerEvents: 'none',
      boxShadow: '0 0 0 6px rgba(255,180,84,.25)', transition: 'opacity .6s', opacity: '1',
    });
    document.body.appendChild(r);
    setTimeout(() => { r.style.opacity = '0'; setTimeout(() => r.remove(), 700); }, 900);
  }, { x: box.x, y: box.y, w: box.width, h: box.height });
  await sleep(500);
}

async function setField(label, value) {
  const input = page.locator('label.field', { hasText: label }).locator('input, select').first();
  const box = await input.boundingBox();
  if (box) await highlight(box);
  const tag = await input.evaluate((e) => e.tagName);
  if (tag === 'SELECT') await input.selectOption(value);
  else { await input.fill(String(value)); await input.press('Tab'); }
}

// ---------------------------------------------------------------------------------------------
async function onFail(err) {
  console.error('STEP FAILED:', String(err).slice(0, 200));
  try {
    await page.screenshot({ path: path.resolve('.tutorial-fail.png') });
    console.error('buttons:', await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).join(' | ')));
    console.error('modals:', await page.evaluate(() => document.querySelectorAll('.modal').length), 'pointerLock:', await page.evaluate(() => !!document.pointerLockElement));
  } catch {}
  process.exit(1);
}
try {
await page.goto('http://localhost:5173/');
await page.waitForSelector('.panel');
await sleep(800);

await caption('ArchViz Studio — type dimensions, see the building in 3D instantly', '');
await sleep(3200);

await caption('The left panel holds all controls. The plan is on the left, the 3D view on the right.', 1);
await sleep(3500);

await caption('Add a wall by dimensions: start point, length, direction. Each wall starts where the last one ended.', 2);
await setField('Start X', 0); await setField('Start Y', 10);
await setField('Length (m)', 6); await setField('Direction', 'E');
await clickText('Add wall'); await sleep(1200);
await setField('Direction', 'N'); await setField('Length (m)', 4); await clickText('Add wall'); await sleep(1200);
await setField('Direction', 'W'); await setField('Length (m)', 6); await clickText('Add wall'); await sleep(1200);
await setField('Direction', 'S'); await setField('Length (m)', 4); await clickText('Add wall'); await sleep(900);
await clickText('Fit view'); await sleep(1500);

await caption('Select a wall and add doors or windows — their size and position are editable.', 3);
await clickText('+ Window'); await sleep(1800);
await setField('Width', 2.4); await sleep(1500);

await caption('Rebuild the floor, pick materials, and choose a roof: flat, gable or hip.', 4);
await clickText('Rebuild floor'); await sleep(1200);
await setField('Floor material', 'oak'); await sleep(1200);
await setField('Type', 'hip'); await sleep(2200);

await caption('The sun study shows real shadows for your site — drag time and month.', 5);
const time = page.locator('label.field', { hasText: 'Time' }).locator('input[type=range]');
for (const v of [8, 10, 12, 14, 16, 15]) { await time.fill(String(v)); await sleep(450); }
await sleep(1200);

await caption('Render image: a fast preview in seconds, or a photoreal path-traced render.', 6);
await clickText('Fit view'); await sleep(800);
await clickText('Render image'); await sleep(1000);
await clickText('Start render'); await page.waitForSelector('.render-preview', { timeout: 60000 }); await sleep(3000);
await clickText('Close'); await sleep(800);

await caption('Walk inside at eye height with the mouse and WASD keys.', 7);
await clickText('Walk inside'); await sleep(600);
await page.mouse.click(960, 400); await sleep(400); // click the 3D view to take the pointer lock, like a user would
for (const k of ['KeyW', 'KeyW', 'KeyA', 'KeyW']) { await page.keyboard.down(k); await sleep(350); await page.keyboard.up(k); }
await sleep(600);
await page.keyboard.press('Escape'); await page.evaluate(() => document.exitPointerLock?.()); await sleep(500);
await clickText('Orbit'); await sleep(800);

await caption('Export: 3D model for Blender or Twinmotion, USDZ for iPhone AR, dimensioned PDF plans.', 8);
await page.hover('.menu > button'); await sleep(3000);
await page.mouse.move(10, 400); await sleep(600);

await caption('Import plan: upload a scan or photo of a floor plan and the walls are extracted automatically.', 9);
await clickText('Import plan'); await sleep(3200);
await clickText('Close'); await sleep(600);

await caption('Phone / AR: scan the QR code with an Android phone to place the building on a table or on site.', 10);
await clickText('Phone / AR'); await sleep(3200);
await clickText('Close'); await sleep(600);

await caption('Register and Save to keep projects on the server and share them. That is ArchViz Studio.', '');
await sleep(3500);

await context.close();
await browser.close();
} catch (err) { await onFail(err); }

const webm = readdirSync(TMP).find((f) => f.endsWith('.webm'));
const outWebm = path.join(OUT_DIR, 'how-to-use.webm');
renameSync(path.join(TMP, webm), outWebm);
rmSync(TMP, { recursive: true, force: true });
try {
  execSync(`ffmpeg -y -loglevel error -i "${outWebm}" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "${path.join(OUT_DIR, 'how-to-use.mp4')}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -loglevel error -i "${outWebm}" -ss 14 -frames:v 1 -q:v 3 "${path.join(OUT_DIR, 'poster.jpg')}"`, { stdio: 'inherit' });
  console.log('Wrote', outWebm, 'and how-to-use.mp4 + poster.jpg');
} catch {
  console.log('ffmpeg not available — kept', outWebm, 'only');
}
if (existsSync(path.join(OUT_DIR, 'how-to-use.mp4'))) rmSync(outWebm);
