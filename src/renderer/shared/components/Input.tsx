import type { InputHTMLAttributes } from 'react';
import { tokens } from '../tokens';

type Props = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, ...rest }: Props): JSX.Element {
  return (
    <input
      style={{
        fontFamily: tokens.font.sans,
        fontSize: 13,
        height: 34,
        padding: '0 10px',
        borderRadius: tokens.radius.md,
        background: tokens.color.bgInput,
        border: `1px solid ${tokens.color.border}`,
        color: tokens.color.text,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        ...style
      }}
      {...rest}
    />
  );
}
