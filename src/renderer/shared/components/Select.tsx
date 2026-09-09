import type { SelectHTMLAttributes } from 'react';
import { tokens } from '../tokens';

interface Option {
  value: string;
  label: string;
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
}

export function Select({ options, value, onValueChange, style, ...rest }: Props): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
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
        cursor: 'pointer',
        ...style
      }}
      {...rest}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
