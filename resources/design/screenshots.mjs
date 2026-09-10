// UI screenshot harness for docs/screenshots. Run `npm run build` first, then:
//   node resources/design/screenshots.mjs docs/screenshots
// Set THEME=light for the light palette, CHROME_PATH to a Chromium binary.
// Screenshot harness: serves out/renderer, mocks window.voiceToText, drives states.
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../../out/renderer', import.meta.url).pathname;
const OUT = process.argv[2] ?? './shots';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': mime[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const settings = {
  hotkey: { combo: 'Control+Command+Space', mode: 'toggle' },
  audio: { inputDeviceId: '', sampleRate: 16000, silenceThresholdRms: 0.015, silenceDurationMs: 10000 },
  transcription: { provider: 'whisper-api', model: 'gpt-4o-transcribe', apiKeyRef: '', language: 'auto', customVocabulary: ['9Expert', 'Power BI', 'Claude Code'], vocabularyPresets: { coding: true, microsoft365: true, brandNames: true, thai: true }, filterHallucinations: true, enablePostProcessing: false, postProcessPreset: 'default', streaming: true, streamingChunkMs: 5000 },
  output: { mode: 'paste', restoreClipboard: true, pasteDelayMs: 150 },
  ui: { overlayPosition: 'top-right', showWaveform: true, soundEnabled: false, soundVolume: 30, theme: process.env.THEME ?? 'dark', caption: { show: true, fontSize: 28, textColor: '#FFFFFF', background: 'none', backgroundColor: '#0D1B2A', backgroundOpacity: 60, anchorPercent: 90 } },
  app: { launchOnStartup: false, checkForUpdates: true, historyLimit: 50 }
};

const mockScript = `
(() => {
  const listeners = {};
  const on = (ch) => (cb) => { (listeners[ch] ||= new Set()).add(cb); return () => listeners[ch].delete(cb); };
  const emit = (ch, p) => { for (const cb of listeners[ch] ?? []) cb(p); };
  let settings = ${JSON.stringify(settings)};
  const deepMerge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? deepMerge(a[k] ?? {}, b[k]) : b[k]; return o; };
  window.voiceToText = {
    recording: { onStart: on('start'), onStop: on('stop'), sendAudio() {}, cancel() {}, autoStop() {}, sendChunk() {}, silentAudio() {} },
    state: { onUpdate: on('state') },
    settings: { get: async () => settings, set: async (p) => { settings = deepMerge(settings, p); emit('settings', settings); return settings; }, reset: async () => settings, onChange: on('settings') },
    secrets: { setApiKey: async () => true, hasApiKey: async () => true, deleteApiKey: async () => true, keyMask: async () => 'sk-****…9xQ2', testApiKey: async () => ({ ok: true, message: 'Key is valid.' }) },
    hotkey: { check: async (c) => ({ ok: true, accelerator: c }) },
    vocabulary: { preview: async () => 'Technical terms: TypeScript, React… Names: ชไลเวท, 9Expert' },
    windows: { closeSelf() {} },
    app: { info: async () => ({ version: '0.2.0', electron: '30.5.1', chrome: '124.0.6367.243', node: '20.16.0', platform: 'darwin', arch: 'arm64' }) }
  };
  window.__mock = { emit };
})();`;

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const ctx = await browser.newContext({ deviceScaleFactor: 2, permissions: ['microphone'] });
await ctx.addInitScript(mockScript);

// ---- overlay states
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
await page.setViewportSize({ width: 900, height: 264 });
await page.goto(`${base}/overlay/index.html`);
await page.addStyleTag({ content: 'html { background: linear-gradient(135deg,#dbe6f6,#eef2f8 50%,#f3eee2) !important; } body::before { content: ""; position: fixed; left: 0; right: 0; top: 196px; border-top: 1px dashed rgba(36,134,255,0.6); pointer-events: none; }' });
await page.waitForTimeout(300);
const states = [
  ['recording', { state: 'recording', interimText: '' }, true],
  ['recording-live', { state: 'recording', interimText: 'สวัสดีครับ วันนี้เราจะมาเรียนรู้เรื่อง Power BI กับ Copilot กันนะครับ' }, true],
  ['processing', { state: 'processing' }, false],
  ['injecting', { state: 'injecting' }, false],
  ['success', { state: 'success', text: 'สวัสดีครับ วันนี้เราจะมาเรียนรู้เรื่อง Power BI กับ Copilot' }, false],
  ['error', { state: 'error', message: 'ไม่พบ API key — เปิด Settings เพื่อใส่ key' }, false]
];
for (const [name, update, rec] of states) {
  if (rec) { await page.evaluate(() => window.__mock.emit('start')); await page.waitForTimeout(400); }
  await page.evaluate((u) => window.__mock.emit('state', u), update);
  await page.waitForTimeout(rec ? 900 : 350);
  await page.screenshot({ path: join(OUT, `overlay-${name}.png`), omitBackground: false });
  if (rec) { await page.evaluate(() => window.__mock.emit('stop')); await page.waitForTimeout(100); }
}

// ---- settings pages
const sp = await ctx.newPage();
sp.on('pageerror', (e) => console.error('PAGEERROR', e.message));
sp.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
await sp.setViewportSize({ width: 860, height: 620 });
await sp.goto(`${base}/settings/index.html`);
await sp.waitForTimeout(500);
await sp.screenshot({ path: join(OUT, 'settings-general.png') });
for (const tab of ['Hotkeys', 'Audio', 'Transcription', 'Vocabulary', 'About']) {
  const btn = sp.getByRole('button', { name: tab, exact: false }).first();
  if (await btn.count()) { await btn.click(); await sp.waitForTimeout(350); await sp.screenshot({ path: join(OUT, `settings-${tab.toLowerCase()}.png`) }); }
}
await browser.close();
server.close();
console.log('shots ->', OUT);
