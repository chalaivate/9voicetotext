import { clipboard, nativeImage, type NativeImage } from 'electron';

/**
 * Snapshot of the clipboard's contents at a point in time. Captures every
 * format we know how to put back. If a format wasn't present, the field is
 * left undefined so we don't overwrite later state with empty values.
 *
 * Spec §8.4 emphasises: "ต้องทำงานได้กับทุกแอปโดยไม่ทำให้ clipboard ผู้ใช้เสีย".
 */
export interface ClipboardSnapshot {
  text?: string;
  html?: string;
  rtf?: string;
  bookmark?: { title: string; url: string };
  image?: NativeImage;
  hadAnything: boolean;
}

export function saveClipboard(): ClipboardSnapshot {
  const snap: ClipboardSnapshot = { hadAnything: false };

  const text = clipboard.readText();
  if (text) {
    snap.text = text;
    snap.hadAnything = true;
  }

  const html = clipboard.readHTML();
  if (html) {
    snap.html = html;
    snap.hadAnything = true;
  }

  const rtf = clipboard.readRTF();
  if (rtf) {
    snap.rtf = rtf;
    snap.hadAnything = true;
  }

  try {
    const bm = clipboard.readBookmark();
    if (bm.title || bm.url) {
      snap.bookmark = bm;
      snap.hadAnything = true;
    }
  } catch {
    // readBookmark is macOS-only and may throw on other platforms — ignore.
  }

  const image = clipboard.readImage();
  if (image && !image.isEmpty()) {
    snap.image = image;
    snap.hadAnything = true;
  }

  return snap;
}

export function writeText(text: string): void {
  clipboard.writeText(text);
}

export function restoreClipboard(snap: ClipboardSnapshot): void {
  if (!snap.hadAnything) {
    clipboard.clear();
    return;
  }
  // electron's clipboard.write() lets us put multiple formats back atomically.
  const data: Parameters<typeof clipboard.write>[0] = {};
  if (snap.text !== undefined) data.text = snap.text;
  if (snap.html !== undefined) data.html = snap.html;
  if (snap.rtf !== undefined) data.rtf = snap.rtf;
  if (snap.bookmark) {
    data.bookmark = snap.bookmark.title;
    // electron's `write` doesn't separately accept the URL; fall back to text.
    if (snap.bookmark.url && data.text === undefined) {
      data.text = snap.bookmark.url;
    }
  }
  if (snap.image) {
    data.image = nativeImage.createFromBuffer(snap.image.toPNG());
  }
  clipboard.write(data);
}
