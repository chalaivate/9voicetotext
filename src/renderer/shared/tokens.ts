// Design tokens from spec §11.4. Single source of truth for all renderer UIs.
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
    // Surfaces (settings UI; not in spec but derived for dark theme)
    bg: '#13171F',
    bgRaised: '#1B2029',
    bgSidebar: '#0F141B',
    border: '#2A313D',
    text: '#E8ECF2',
    textDim: '#9BA4B0',
    textFaint: '#6B7280'
  },
  font: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
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
