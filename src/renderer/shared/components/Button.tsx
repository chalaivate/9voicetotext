import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { tokens } from '../tokens';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({ variant = 'secondary', size = 'md', style, ...rest }: Props): JSX.Element {
  const palette: Record<NonNullable<Props['variant']>, CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg, ${tokens.color.brandBlueLight}, ${tokens.color.brandBlue})`,
      color: '#fff',
      border: 'none',
      boxShadow: '0 4px 12px rgba(36, 134, 255, 0.35)'
    },
    secondary: {
      background: tokens.color.bgRaised,
      color: tokens.color.text,
      border: `1px solid ${tokens.color.border}`
    },
    ghost: {
      background: 'transparent',
      color: tokens.color.textDim,
      border: '1px solid transparent'
    },
    danger: {
      background: tokens.color.error,
      color: '#fff',
      border: 'none'
    }
  };

  const sizing: Record<NonNullable<Props['size']>, CSSProperties> = {
    sm: { padding: '4px 10px', fontSize: 12, height: 26 },
    md: { padding: '8px 14px', fontSize: 13, height: 34 }
  };

  return (
    <button
      style={{
        fontFamily: tokens.font.sans,
        fontWeight: 500,
        borderRadius: tokens.radius.md,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        transition: 'background 120ms ease, opacity 120ms ease',
        ...palette[variant],
        ...sizing[size],
        ...style
      }}
      {...rest}
    />
  );
}
