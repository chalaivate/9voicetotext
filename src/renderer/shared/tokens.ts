// Design tokens from spec §11.4. Single source of truth for all renderer UIs.
//
// Colours resolve through CSS custom properties so the Settings window can
// switch between the dark and light palettes at runtime (Settings → General →
// Theme). `themeCss` must be injected once per document (see settings/App.tsx).
export const tokens = {
  color: {
    brandBlue: '#2486FF',
    brandBlueDark: '#005CFF',
    brandBlueLight: '#48B0FF',
    deepNavy: '#0D1B2A',
    iceWhite: '#F8FAFD',
    slate: '#808A95',
    accent: '#D4F73F',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    // Surfaces — theme-aware (see `themeCss` below).
    bg: 'var(--c-bg)',
    bgRaised: 'var(--c-bg-raised)',
    bgSidebar: 'var(--c-bg-sidebar)',
    bgInput: 'var(--c-bg-input)',
    border: 'var(--c-border)',
    text: 'var(--c-text)',
    textDim: 'var(--c-text-dim)',
    textFaint: 'var(--c-text-faint)'
  },
  font: {
    sans: '"LINE Seed Sans TH", "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace'
  },
  radius: { sm: '4px', md: '8px', lg: '12px', xl: '16px' },
  spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px' },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.07)',
    lg: '0 10px 25px rgba(0,0,0,0.1)'
  }
} as const;

export type ThemeSetting = 'system' | 'light' | 'dark';

/**
 * Palette definitions. Dark is the default (`:root`); light applies when the
 * document carries `data-theme="light"`. `applyTheme()` resolves 'system'
 * through `prefers-color-scheme`.
 */
export const themeCss = `
  :root {
    color-scheme: dark;
    --c-bg: #13171F;
    --c-bg-raised: #1B2029;
    --c-bg-sidebar: #0F141B;
    --c-bg-input: #0F131A;
    --c-border: #2A313D;
    --c-text: #E8ECF2;
    --c-text-dim: #9BA4B0;
    --c-text-faint: #6B7280;
    --c-card-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    --c-sidebar-glow: rgba(36, 134, 255, 0.16);
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --c-bg: #F4F6FA;
    --c-bg-raised: #FFFFFF;
    --c-bg-sidebar: #EAF0F8;
    --c-bg-input: #FFFFFF;
    --c-border: #D9E0EA;
    --c-text: #0D1B2A;
    --c-text-dim: #4F5B6B;
    --c-text-faint: #8A94A3;
    --c-card-shadow: 0 8px 24px rgba(13, 27, 42, 0.06);
    --c-sidebar-glow: rgba(36, 134, 255, 0.12);
  }
`;

/** Resolve a theme setting to the concrete `data-theme` attribute. */
export function resolveTheme(setting: ThemeSetting): 'light' | 'dark' {
  if (setting === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return setting;
}

export function applyTheme(setting: ThemeSetting): void {
  document.documentElement.dataset['theme'] = resolveTheme(setting);
}
