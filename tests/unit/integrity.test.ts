import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { checkChromiumResources, chromiumResourcesPakPath } from '@main/app/integrity';

describe('chromium resources integrity check', () => {
  it('looks for resources.pak next to the executable on Windows / Linux', () => {
    const exe = join('/', 'opt', '9VoiceToText', '9VoiceToText');
    expect(chromiumResourcesPakPath(exe, 'linux')).toBe(
      join('/', 'opt', '9VoiceToText', 'resources.pak')
    );
    expect(chromiumResourcesPakPath(exe, 'win32')).toBe(
      join('/', 'opt', '9VoiceToText', 'resources.pak')
    );
  });

  it('skips the check on macOS', () => {
    expect(
      chromiumResourcesPakPath(
        '/Applications/9VoiceToText.app/Contents/MacOS/9VoiceToText',
        'darwin'
      )
    ).toBeNull();
    expect(checkChromiumResources('/x/y', 'darwin', () => false)).toEqual({
      ok: true,
      missing: []
    });
  });

  it('reports the missing file', () => {
    const result = checkChromiumResources('/app/9VoiceToText.exe', 'win32', () => false);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([join('/app', 'resources.pak')]);
  });

  it('passes when the file exists', () => {
    expect(checkChromiumResources('/app/9VoiceToText.exe', 'win32', () => true).ok).toBe(true);
  });
});
