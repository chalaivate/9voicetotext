/**
 * Design tokens from spec §11.4 — single source of truth for all renderer UIs.
 *
 * Colours are exposed as CSS custom properties so the Settings → General →
 * Theme option (system / light / dark) can swap the whole palette at runtime
 * without touching the components. `themeCss` below defines both palettes;
 * `applyTheme()` stamps `data-theme` on <html>.
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

/** Palette definitions. Dark is the default; light overrides via data-theme. */
export const themeCss = `
:root {
  color-scheme: dark;
  --c-brand-blue: #2486FF;
  --c-brand-blue-dark: #005CFF;
  --c-brand-blue-light: #48B0FF;
  --c-link: #48B0FF;
  --c-bg: #13171F;
  --c-bg-raised: #1B2029;
  --c-bg-sidebar: #0F141B;
  --c-bg-hover: rgba(255, 255, 255, 0.05);
  --c-border: #2A313D;
  --c-text: #E8ECF2;
  --c-text-dim: #9BA4B0;
  --c-text-faint: #6B7280;
}
:root[data-theme='light'] {
  color-scheme: light;
  --c-link: #005CFF;
  --c-bg: #F3F5F9;
  --c-bg-raised: #FFFFFF;
  --c-bg-sidebar: #E9EEF6;
  --c-bg-hover: rgba(13, 27, 42, 0.05);
  --c-border: #D8DEE8;
  --c-text: #0D1B2A;
  --c-text-dim: #5B6675;
  --c-text-faint: #8A94A3;
}
`;

/** Resolve the preference against the OS and stamp it on <html>. */
export function applyTheme(pref: ThemePreference): 'light' | 'dark' {
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  document.documentElement.dataset['theme'] = resolved;
  return resolved;
}
