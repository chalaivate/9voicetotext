export const isMac = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';
export const isLinux = process.platform === 'linux';

export function platformName(): 'macos' | 'windows' | 'linux' | 'unknown' {
  if (isMac) return 'macos';
  if (isWindows) return 'windows';
  if (isLinux) return 'linux';
  return 'unknown';
}
