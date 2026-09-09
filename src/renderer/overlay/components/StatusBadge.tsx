import type { AppState } from '../../../shared/types';

interface Props {
  state: AppState;
}

/**
 * Circular state badge on the left of the overlay. The colour comes from the
 * `--ov-accent` CSS variable set on the root by state; this component only
 * decides the glyph and the motion (ripple while recording, spinner while
 * the API is working, pop on success).
 */
export function StatusBadge({ state }: Props): JSX.Element {
  return (
    <div className="ov-badge" aria-label={state} role="img">
      {state === 'recording' && (
        <>
          <span className="ov-ring" />
          <span className="ov-ring ov-ring--2" />
        </>
      )}
      {(state === 'processing' || state === 'injecting') && <span className="ov-spinner" />}
      <Glyph state={state} />
    </div>
  );
}

function Glyph({ state }: Props): JSX.Element {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };
  switch (state) {
    case 'success':
      return (
        <svg {...common}>
          <path d="M5 12.5l4.2 4.2L19 7.5" />
        </svg>
      );
    case 'error':
      return (
        <svg {...common}>
          <path d="M12 3.5l9 16H3l9-16z" />
          <path d="M12 10v4.5" />
          <path d="M12 17.6h.01" />
        </svg>
      );
    case 'processing':
      // Sparkle — "AI is transcribing".
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <path
            d="M12 7.5c.6 2.5 2 3.9 4.5 4.5-2.5.6-3.9 2-4.5 4.5-.6-2.5-2-3.9-4.5-4.5 2.5-.6 3.9-2 4.5-4.5z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case 'injecting':
      // Clipboard → cursor.
      return (
        <svg {...common}>
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <path d="M9 4.5V3h6v1.5" />
          <path d="M9 11h6M9 15h4" />
        </svg>
      );
    case 'recording':
    case 'idle':
    default:
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
          <path d="M6 11a6 6 0 0 0 12 0" />
          <path d="M12 17v3.5M9 20.5h6" />
        </svg>
      );
  }
}
