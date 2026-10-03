// Icon generator for 9VoiceToText. Renders SVG via Chromium (playwright-core,
// already a dev dependency through @playwright/test), then packs PNGs into
// .ico / .icns with hand-written container writers.
//
//   node resources/design/gen-icons.mjs resources/icons
//
// Set CHROME_PATH to point at a Chromium binary if Playwright's own browser
// download is not available.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? './out';
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- app icon
// `inset` = transparent margin fraction (macOS icons float inside the grid).
function appIconSvg({ inset = 0 } = {}) {
  const S = 1024;
  const m = S * inset;
  const w = S - 2 * m;
  const r = w * 0.225;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4AA6FF"/>
      <stop offset="0.55" stop-color="#2486FF"/>
      <stop offset="1" stop-color="#0B3E9C"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.7" cy="0.95" r="0.9">
      <stop offset="0" stop-color="#0D1B2A" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#0D1B2A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#E6F0FF"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E9FF6A"/>
      <stop offset="1" stop-color="#C6EE1E"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#06214F" flood-opacity="0.45"/>
    </filter>
    <clipPath id="clip"><rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${r}"/></clipPath>
  </defs>

  <!-- background tile -->
  <rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${r}" fill="url(#bg)"/>
  <g clip-path="url(#clip)">
    <rect x="${m}" y="${m}" width="${w}" height="${w}" fill="url(#vignette)"/>
    <rect x="${m}" y="${m}" width="${w}" height="${w}" fill="url(#glow)"/>
    <!-- subtle diagonal sheen -->
    <path d="M${m} ${m + w * 0.62} L${m + w} ${m + w * 0.18} L${m + w} ${m} L${m} ${m} Z" fill="#FFFFFF" fill-opacity="0.06"/>
  </g>
  <!-- inner rim -->
  <rect x="${m + 6}" y="${m + 6}" width="${w - 12}" height="${w - 12}" rx="${r - 6}" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="6"/>

  <!-- artwork, designed on 1024 grid then scaled into the tile -->
  <g transform="translate(${m} ${m}) scale(${w / S})">
    <g filter="url(#shadow)">
      <!-- microphone capsule -->
      <rect x="318" y="196" width="196" height="352" rx="98" fill="url(#mic)"/>
      <!-- capsule grille lines -->
      <g stroke="#2486FF" stroke-opacity="0.35" stroke-width="10" stroke-linecap="round">
        <line x1="366" y1="300" x2="466" y2="300"/>
        <line x1="366" y1="352" x2="466" y2="352"/>
        <line x1="366" y1="404" x2="466" y2="404"/>
      </g>
      <!-- cradle -->
      <path d="M254 402 v56 a162 162 0 0 0 324 0 v-56" fill="none" stroke="url(#mic)" stroke-width="46" stroke-linecap="round"/>
      <!-- stem + base -->
      <line x1="416" y1="622" x2="416" y2="720" stroke="url(#mic)" stroke-width="46" stroke-linecap="round"/>
      <line x1="316" y1="746" x2="516" y2="746" stroke="url(#mic)" stroke-width="46" stroke-linecap="round"/>
      <!-- lime sound bars: voice -> text -->
      <g fill="url(#lime)">
        <rect x="628" y="402" width="52" height="116" rx="26"/>
        <rect x="712" y="318" width="52" height="284" rx="26"/>
        <rect x="796" y="382" width="52" height="156" rx="26"/>
      </g>
    </g>
  </g>
</svg>`;
}

// ---------------------------------------------------------------- tray glyphs
// 16x16 design grid. `color` fills the glyph. `dot` draws a status dot.
function trayGlyphSvg({ size, color, dot = null }) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">
  <g fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round">
    <rect x="5.7" y="1.2" width="4.6" height="8" rx="2.3" fill="${color}" stroke="none"/>
    <path d="M3.6 7.4 v1.4 a4.4 4.4 0 0 0 8.8 0 V7.4"/>
    <line x1="8" y1="13.2" x2="8" y2="15"/>
    <line x1="5.6" y1="15" x2="10.4" y2="15"/>
  </g>
  ${dot ? `<circle cx="13" cy="3" r="2.6" fill="${dot}" stroke="#000" stroke-opacity="0.25" stroke-width="0.6"/>` : ''}
</svg>`;
}

// ---------------------------------------------------------------- rendering
async function renderPng(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`
  );
  return page.screenshot({ omitBackground: true, type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
}

function writeIco(entries) {
  // entries: [{size, png}]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dirs = [];
  let offset = 6 + 16 * entries.length;
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    d.writeUInt8(0, 2);
    d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(e.png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.png.length;
    dirs.push(d);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

function writeIcns(entries) {
  // entries: [{type, png}]
  const chunks = entries.map(({ type, png }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([h, png]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });

// App icon — full-bleed for PNG/ICO, inset for ICNS (macOS grid convention).
const full = appIconSvg({ inset: 0 });
const mac = appIconSvg({ inset: 0.1 });

writeFileSync(join(OUT, 'icon.png'), await renderPng(page, full, 512));
writeFileSync(join(OUT, 'icon@1024.png'), await renderPng(page, full, 1024));
writeFileSync(join(OUT, 'icon-preview.png'), await renderPng(page, full, 256));
writeFileSync(join(OUT, 'icon-mac-preview.png'), await renderPng(page, mac, 256));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = [];
for (const s of icoSizes) icoEntries.push({ size: s, png: await renderPng(page, full, s) });
writeFileSync(join(OUT, 'icon.ico'), writeIco(icoEntries));

const icnsTypes = [
  ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]
];
const icnsEntries = [];
const cache = new Map();
for (const [type, s] of icnsTypes) {
  if (!cache.has(s)) cache.set(s, await renderPng(page, mac, s));
  icnsEntries.push({ type, png: cache.get(s) });
}
writeFileSync(join(OUT, 'icon.icns'), writeIcns(icnsEntries));

// Tray icons. macOS: black template (alpha-only) idle; Windows: white glyph.
// Recording/processing keep a coloured status dot and are NOT template images.
const tray = [
  ['tray-idle', { color: '#000000' }],
  ['tray-idle-light', { color: '#FFFFFF' }],
  ['tray-recording', { color: '#000000', dot: '#FF3B30' }],
  ['tray-recording-light', { color: '#FFFFFF', dot: '#FF3B30' }],
  ['tray-processing', { color: '#000000', dot: '#2486FF' }],
  ['tray-processing-light', { color: '#FFFFFF', dot: '#2486FF' }]
];
for (const [name, opts] of tray) {
  writeFileSync(join(OUT, `${name}.png`), await renderPng(page, trayGlyphSvg({ size: 16, ...opts }), 16));
  writeFileSync(join(OUT, `${name}@2x.png`), await renderPng(page, trayGlyphSvg({ size: 32, ...opts }), 32));
}

await browser.close();
console.log('done ->', OUT);
