import { spawn } from 'node:child_process';

/**
 * Simulate a paste keystroke. Implementation deliberately uses OS-built-in
 * automation tools instead of `node-key-sender`, because that package needs
 * `cliclick` (mac), `xdotool` (linux), or `win-keytool` (win) installed —
 * all of which add friction. `osascript` and `powershell` are always present.
 *
 * Tracked in docs/spec-changes.md (Sprint 3 dep deviation).
 */
export class KeystrokeError extends Error {
  constructor(
    message: string,
    public readonly platform: NodeJS.Platform,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'KeystrokeError';
  }
}

const MAC_PASTE_SCRIPT = 'tell application "System Events" to keystroke "v" using command down';

const WIN_PASTE_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '[System.Windows.Forms.SendKeys]::SendWait("^v")'
].join('; ');

export interface PasteRunner {
  run(): Promise<void>;
}

export function createPasteRunner(): PasteRunner {
  const platform = process.platform;
  return {
    run: () => simulatePaste(platform)
  };
}

function simulatePaste(platform: NodeJS.Platform): Promise<void> {
  if (platform === 'darwin') {
    return runCommand('osascript', ['-e', MAC_PASTE_SCRIPT], platform);
  }
  if (platform === 'win32') {
    return runCommand('powershell.exe', ['-NoProfile', '-Command', WIN_PASTE_SCRIPT], platform);
  }
  // Linux fallback — try xdotool. Most Linux desktops have it; if not, throw.
  if (platform === 'linux') {
    return runCommand('xdotool', ['key', 'ctrl+v'], platform);
  }
  return Promise.reject(
    new KeystrokeError(`Paste keystroke not implemented for platform "${platform}".`, platform)
  );
}

function runCommand(cmd: string, args: string[], platform: NodeJS.Platform): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(new KeystrokeError(`${cmd} failed to launch: ${err.message}`, platform));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new KeystrokeError(
          `${cmd} exited ${code}. ${stderr.trim().slice(0, 200) || 'no stderr'}`,
          platform,
          stderr
        )
      );
    });
  });
}
