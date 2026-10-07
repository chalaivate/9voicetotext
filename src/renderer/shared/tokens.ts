/**
 * Design tokens from spec §11.4 — single source of truth for all renderer UIs.
 *
 * Colours are exposed as CSS custom properties so the Settings → General →
 * Theme option (system / light / dark) can swap the whole palette at runtime
 * without touching the components. Both palettes live in
 * src/renderer/settings/settings.css; `applyTheme()` stamps `data-theme` on
 * <html>.
 */
export const tokens = {
  color: {
    brandBlue: 'var(--c-brand-blue)',
    brandBlueDark: 'var(--c-brand-blue-dark)',
    brandBlueLight: 'var(--c-brand-blue-light)',
    deepNavy: '#0D1B2A',
    iceWhite: '#F8FAFD',
    slate: '#808A95',
    accent: '#D4F73F',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    /** Link colour with enough contrast on the current surface. */
    link: 'var(--c-link)',
    // Surfaces
    bg: 'var(--c-bg)',
    bgRaised: 'var(--c-bg-raised)',
    bgSidebar: 'var(--c-bg-sidebar)',
    bgHover: 'var(--c-bg-hover)',
    border: 'var(--c-border)',
    text: 'var(--c-text)',
    textDim: 'var(--c-text-dim)',
    textFaint: 'var(--c-text-faint)'
  },
  font: {
    sans: "'LINE Seed Sans TH', 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'Noto Sans Thai', sans-serif",
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
  },
  radius: { sm: '4px', md: '8px', lg: '12px', xl: '16px' },
  spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px' },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.12)',
    md: '0 4px 10px rgba(0,0,0,0.14)',
    lg: '0 12px 30px rgba(0,0,0,0.22)'
  }
} as const;

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_CACHE_KEY = '9vtt.theme';

/**
 * Resolve the preference against the OS and stamp it on <html>. The
 * preference is cached so the next launch can paint the right palette
 * before settings arrive over IPC (no dark→light flash).
 */
export function applyTheme(pref: ThemePreference): 'light' | 'dark' {
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  document.documentElement.dataset['theme'] = resolved;
  try {
    localStorage.setItem(THEME_CACHE_KEY, pref);
  } catch {
    // storage unavailable — the flash-free first paint is a nicety only
  }
  return resolved;
}

/** Apply the cached preference synchronously, before React renders. */
export function applyCachedTheme(): void {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    if (cached === 'light' || cached === 'dark' || cached === 'system') applyTheme(cached);
  } catch {
    // ignore
  }
}
