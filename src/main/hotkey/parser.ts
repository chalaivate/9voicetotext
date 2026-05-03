const VALID_MODIFIERS = new Set([
  'CommandOrControl',
  'CmdOrCtrl',
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta'
]);

export interface ParsedHotkey {
  modifiers: string[];
  key: string;
  accelerator: string;
}

export class HotkeyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HotkeyParseError';
  }
}

export function parseHotkey(combo: string): ParsedHotkey {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new HotkeyParseError(
      `Hotkey must include at least one modifier and one key. Got "${combo}".`
    );
  }

  const modifiers: string[] = [];
  let key: string | undefined;

  for (const part of parts) {
    if (VALID_MODIFIERS.has(part)) {
      modifiers.push(part);
    } else {
      if (key !== undefined) {
        throw new HotkeyParseError(`Hotkey "${combo}" has more than one non-modifier key.`);
      }
      key = part;
    }
  }

  if (modifiers.length === 0) {
    throw new HotkeyParseError(
      `Hotkey "${combo}" requires at least one modifier (Cmd, Ctrl, Shift, Alt).`
    );
  }
  if (key === undefined) {
    throw new HotkeyParseError(`Hotkey "${combo}" needs a non-modifier key.`);
  }

  return {
    modifiers,
    key,
    accelerator: [...modifiers, key].join('+')
  };
}
