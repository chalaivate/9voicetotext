import { describe, expect, it } from 'vitest';
import { parseHotkey, HotkeyParseError } from '@main/hotkey/parser';

describe('parseHotkey', () => {
  it('parses a standard CommandOrControl+Shift+Space combo', () => {
    const parsed = parseHotkey('CommandOrControl+Shift+Space');
    expect(parsed.modifiers).toEqual(['CommandOrControl', 'Shift']);
    expect(parsed.key).toBe('Space');
    expect(parsed.accelerator).toBe('CommandOrControl+Shift+Space');
  });

  it('accepts whitespace around tokens', () => {
    const parsed = parseHotkey(' Cmd + Shift + A ');
    expect(parsed.accelerator).toBe('Cmd+Shift+A');
  });

  it('rejects a single-key combo (no modifier)', () => {
    expect(() => parseHotkey('Space')).toThrow(HotkeyParseError);
  });

  it('rejects a modifier-only combo', () => {
    expect(() => parseHotkey('Shift+Cmd')).toThrow(HotkeyParseError);
  });

  it('rejects two non-modifier keys', () => {
    expect(() => parseHotkey('Shift+Space+A')).toThrow(HotkeyParseError);
  });

  it('rejects an empty string', () => {
    expect(() => parseHotkey('')).toThrow(HotkeyParseError);
  });
});
