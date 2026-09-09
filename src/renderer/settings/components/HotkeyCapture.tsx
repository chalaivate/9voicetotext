import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { tokens } from '../../shared/tokens';
import { Button } from '../../shared/components/Button';

/**
 * Map a browser KeyboardEvent into an Electron accelerator string.
 * We deliberately reject combos that have no modifier (would conflict with
 * normal typing) or combos that are modifier-only (no main key yet).
 */
function eventToAccelerator(e: KeyboardEvent<HTMLDivElement>): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.metaKey) mods.push('Command');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  const key = e.key;
  // Modifier-only — wait for the user to press a real key.
  if (
    key === 'Control' ||
    key === 'Meta' ||
    key === 'Shift' ||
    key === 'Alt' ||
    key === 'CapsLock' ||
    key === 'OS' ||
    key === 'Hyper' ||
    key === 'Super'
  ) {
    return null;
  }
  if (mods.length === 0) return null;

  // Normalize main key for Electron accelerator syntax
  const main = normalizeKey(key, e.code);
  if (!main) return null;

  return [...mods, main].join('+');
}

function normalizeKey(key: string, code: string): string | null {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  // Function keys, arrows, etc — Electron uses these names directly.
  if (/^F\d{1,2}$/.test(key)) return key;
  if (key === 'Escape') return 'Escape';
  if (key === 'Enter' || key === 'Return') return 'Return';
  if (key === 'Tab') return 'Tab';
  if (key === 'Backspace') return 'Backspace';
  if (key === 'Delete') return 'Delete';
  if (key === 'ArrowUp') return 'Up';
  if (key === 'ArrowDown') return 'Down';
  if (key === 'ArrowLeft') return 'Left';
  if (key === 'ArrowRight') return 'Right';
  if (key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown') return key;
  // Fallback to keyCode-style if the key name is something exotic
  if (code.startsWith('Key') && code.length === 4) return code.slice(3); // KeyA → A
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return null;
}

/** Format an Electron accelerator for display (Cmd icon on macOS, etc). */
export function formatAccelerator(accel: string): string {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  return accel
    .split('+')
    .map((part) => {
      if (!isMac) return part;
      switch (part) {
        case 'Command':
        case 'Cmd':
        case 'CommandOrControl':
        case 'CmdOrCtrl':
          return '⌘';
        case 'Control':
        case 'Ctrl':
          return '⌃';
        case 'Alt':
        case 'Option':
          return '⌥';
        case 'Shift':
          return '⇧';
        default:
          return part;
      }
    })
    .join(isMac ? '' : '+');
}

interface Props {
  value: string;
  onChange(combo: string): void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'capturing' }
  | { kind: 'pending'; combo: string }
  | { kind: 'checking'; combo: string }
  | { kind: 'conflict'; combo: string; message: string };

export function HotkeyCapture({ value, onChange }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const captureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status.kind === 'capturing' && captureRef.current) {
      captureRef.current.focus();
    }
  }, [status.kind]);

  function startCapture(): void {
    setStatus({ kind: 'capturing' });
  }

  function cancelCapture(): void {
    setStatus({ kind: 'idle' });
  }

  async function handleKey(e: KeyboardEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      cancelCapture();
      return;
    }
    const combo = eventToAccelerator(e);
    if (!combo) return;

    setStatus({ kind: 'checking', combo });
    const result = await window.voiceToText.hotkey.check(combo);
    if (result.ok) {
      setStatus({ kind: 'pending', combo: result.accelerator ?? combo });
    } else {
      setStatus({
        kind: 'conflict',
        combo,
        message: result.message ?? 'Cannot register this shortcut.'
      });
    }
  }

  function save(): void {
    if (status.kind === 'pending') {
      onChange(status.combo);
      setStatus({ kind: 'idle' });
    }
  }

  return (
    <div style={wrap}>
      {(status.kind === 'idle' || status.kind === 'capturing') && (
        <div style={display}>
          <span style={accelLabel}>{formatAccelerator(value)}</span>
        </div>
      )}
      {(status.kind === 'pending' || status.kind === 'checking' || status.kind === 'conflict') && (
        <div style={display}>
          <span style={accelLabel}>{formatAccelerator(status.combo)}</span>
          {status.kind === 'pending' && <Pill color={tokens.color.success}>Available</Pill>}
          {status.kind === 'checking' && <Pill color={tokens.color.link}>Checking…</Pill>}
          {status.kind === 'conflict' && <Pill color={tokens.color.error}>Conflict</Pill>}
        </div>
      )}

      {status.kind === 'capturing' && (
        <div
          ref={captureRef}
          tabIndex={0}
          role="button"
          aria-label="Press the new hotkey combination"
          onKeyDown={handleKey}
          onBlur={cancelCapture}
          style={captureBox}
        >
          Press the new combination… (Esc to cancel)
        </div>
      )}

      {status.kind === 'conflict' && <div style={errorMsg}>{status.message}</div>}

      <div style={btnRow}>
        {status.kind === 'idle' && (
          <Button variant="secondary" size="sm" onClick={startCapture}>
            Change…
          </Button>
        )}
        {status.kind === 'capturing' && (
          <Button variant="ghost" size="sm" onClick={cancelCapture}>
            Cancel
          </Button>
        )}
        {(status.kind === 'pending' ||
          status.kind === 'checking' ||
          status.kind === 'conflict') && (
          <>
            <Button variant="primary" size="sm" onClick={save} disabled={status.kind !== 'pending'}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelCapture}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }): JSX.Element {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color,
        background: 'transparent',
        border: `1px solid ${color}`,
        padding: '2px 8px',
        borderRadius: 999
      }}
    >
      {children}
    </span>
  );
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
  width: '100%'
};

const display: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  padding: '6px 12px',
  minWidth: 160,
  justifyContent: 'space-between'
};

const accelLabel: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 13,
  fontWeight: 500,
  color: tokens.color.text,
  letterSpacing: '0.05em'
};

const captureBox: CSSProperties = {
  fontSize: 12,
  color: tokens.color.link,
  border: `1px dashed ${tokens.color.link}`,
  borderRadius: tokens.radius.md,
  padding: '12px 14px',
  outline: 'none',
  cursor: 'text',
  textAlign: 'center',
  width: '100%'
};

const errorMsg: CSSProperties = {
  fontSize: 11,
  color: tokens.color.error,
  alignSelf: 'flex-end'
};

const btnRow: CSSProperties = {
  display: 'flex',
  gap: 8
};
