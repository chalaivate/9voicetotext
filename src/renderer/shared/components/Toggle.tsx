import { tokens } from '../tokens';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({ checked, onChange, disabled, ariaLabel }: Props): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? tokens.color.brandBlue : tokens.color.border,
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 150ms ease',
        padding: 0
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: tokens.shadow.sm,
          transition: 'left 150ms ease'
        }}
      />
    </button>
  );
}
