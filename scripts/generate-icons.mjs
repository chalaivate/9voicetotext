/**
 * Icon pipeline — renders resources/icons/icon.svg (+ the tray glyphs defined
 * below) into every raster the app and electron-builder need:
 *
 *   resources/icons/icon.png            1024×1024 master
 *   resources/icons/icon-<n>.png        16 … 512 (for docs / stores)
 *   resources/icons/icon.ico            Windows (16,24,32,48,64,128,256 — PNG entries)
 *   resources/icons/icon.icns           macOS   (icp4 … ic14 — PNG entries)
 *   resources/icons/tray-<state>.png    16×16 monochrome template (macOS menu bar)
 *   resources/icons/tray-<state>@2x.png 32×32
 *   resources/icons/tray-<state>-color.png / @2x   colour variant (Windows / Linux)
 *
 * Uses the Chromium that ships with Playwright (already a devDependency) so
 * no ImageMagick / sharp native toolchain is required.
 *
 *   npm run icons
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(root, 'resources', 'icons');

const APP_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// icns type → pixel size (PNG payloads are accepted for all of these on 10.7+)
const ICNS_TYPES = {
  icp4: 16,
  icp5: 32,
  icp6: 64,
  ic07: 128,
  ic08: 256,
  ic09: 512,
  ic10: 1024,
  ic11: 32,
  ic12: 64,
  ic13: 256,
  ic14: 512
};

/**
 * Tray glyphs. 22×22 design grid (macOS menu-bar friendly), rendered at
 * 16 / 32 px. `template` variants are pure black on transparent so macOS
 * can recolour them for light/dark menu bars; `color` variants are a brand
 * roundel for Windows/Linux where template images are not supported.
 */
function trayGlyph(state, variant) {
  const fg = variant === 'template' ? '#000' : '#FFF';
  const roundel = {
    idle: '#2486FF',
    recording: '#FF3B30',
    processing: '#2486FF'
  }[state];

  // Base microphone (capsule + cradle + stem), drawn in the 22×22 grid.
  const mic = `
    <rect x="8" y="2" width="6" height="11" rx="3" fill="${fg}"/>
    <path d="M5 9.5a6 6 0 0 0 12 0" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round"/>
    <path d="M11 15.5V19" stroke="${fg}" stroke-width="2" stroke-linecap="round"/>
    <path d="M7.5 19h7" stroke="${fg}" stroke-width="2" stroke-linecap="round"/>`;

  let stateMark = '';
  if (state === 'recording') {
    // Solid "live" dot at the top-right — reads as "REC" even at 16px.
    stateMark =
      variant === 'template'
        ? `<circle cx="18" cy="4.5" r="3.5" fill="${fg}"/>`
        : `<circle cx="18" cy="4.5" r="3.5" fill="#FFF"/><circle cx="18" cy="4.5" r="2" fill="${roundel}"/>`;
  } else if (state === 'processing') {
    // Three dots on the right — "thinking".
    stateMark = `
      <circle cx="18" cy="8" r="1.4" fill="${fg}"/>
      <circle cx="18" cy="12" r="1.4" fill="${fg}"/>
      <circle cx="18" cy="16" r="1.4" fill="${fg}"/>`;
  }

  const background =
    variant === 'color'
      ? `<rect x="0" y="0" width="22" height="22" rx="6" fill="${roundel}"/>`
      : '';
  const inner =
    variant === 'color'
      ? `<g transform="translate(1.5 1.5) scale(0.86)">${mic}${stateMark}</g>`
      : `${mic}${stateMark}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="22" height="22">${background}${inner}</svg>`;
}

/** Rasterise an SVG string in the page to PNG bytes at the given pixel size. */
async function rasterize(page, svg, size) {
  const dataUrl = await page.evaluate(
    async ({ svg, size }) => {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      return canvas.toDataURL('image/png');
    },
    { svg, size }
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

function buildIco(entries /* [{size, png}] */) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

function buildIcns(entries /* [{type, png}] */) {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'ascii');
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

async function main() {
  await mkdir(iconDir, { recursive: true });
  const svg = await readFile(join(iconDir, 'icon.svg'), 'utf8');

  // Honour a pre-installed Chromium (CI images, sandboxes) so `npx playwright
  // install` is not required just to regenerate icons.
  const executablePath = process.env.ICON_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  // ---- App icon -----------------------------------------------------------
  const pngBySize = new Map();
  for (const size of APP_SIZES) {
    pngBySize.set(size, await rasterize(page, svg, size));
  }
  await writeFile(join(iconDir, 'icon.png'), pngBySize.get(1024));
  for (const size of APP_SIZES.filter((s) => s !== 1024)) {
    await writeFile(join(iconDir, `icon-${size}.png`), pngBySize.get(size));
  }
  await writeFile(
    join(iconDir, 'icon.ico'),
    buildIco(ICO_SIZES.map((size) => ({ size, png: pngBySize.get(size) })))
  );
  await writeFile(
    join(iconDir, 'icon.icns'),
    buildIcns(
      Object.entries(ICNS_TYPES).map(([type, size]) => ({ type, png: pngBySize.get(size) }))
    )
  );

  // ---- Tray icons ---------------------------------------------------------
  for (const state of ['idle', 'recording', 'processing']) {
    for (const variant of ['template', 'color']) {
      const suffix = variant === 'color' ? '-color' : '';
      const glyph = trayGlyph(state, variant);
      await writeFile(
        join(iconDir, `tray-${state}${suffix}.png`),
        await rasterize(page, glyph, 16)
      );
      await writeFile(
        join(iconDir, `tray-${state}${suffix}@2x.png`),
        await rasterize(page, glyph, 32)
      );
    }
    // Legacy filenames from the pre-pipeline era.
    await rm(join(iconDir, `tray-${state}-16.png`), { force: true });
  }

  await browser.close();
  console.log(`icons written to ${iconDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
