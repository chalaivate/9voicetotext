import type { CSSProperties } from 'react';
import type { AppState } from '../../../shared/types';

interface Props {
  state: AppState;
}

const colors: Record<AppState, string> = {
  idle: '#808A95',
  recording: '#FF3B30',
  processing: '#2486FF',
  injecting: '#2486FF',
  success: '#34C759',
  error: '#FF9500'
};

const baseStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  flexShrink: 0
};

export function StatusBadge({ state }: Props): JSX.Element {
  const style: CSSProperties = {
    ...baseStyle,
    background: colors[state],
    boxShadow: state === 'recording' ? '0 0 0 4px rgba(255, 59, 48, 0.25)' : '0 0 0 0 transparent',
    animation: state === 'recording' ? 'pulse 1.2s ease-out infinite' : 'none'
  };
  return <span style={style} aria-label={state} />;
}
