import { AlertTriangle, Check, ClipboardCheck, Mic, Sparkles } from 'lucide-react';
import type { AppState } from '../../../shared/types';

interface Props {
  state: AppState;
}

/**
 * Animated status orb on the left of the overlay. Colour + icon change per
 * state; recording adds expanding pulse rings, processing spins a gradient
 * ring around the sparkles icon. All motion lives in overlay/styles.ts.
 */
export function StatusOrb({ state }: Props): JSX.Element {
  const icon = (() => {
    switch (state) {
      case 'recording':
        return <Mic size={20} strokeWidth={2.4} />;
      case 'processing':
        return <Sparkles size={20} strokeWidth={2.2} />;
      case 'injecting':
        return <ClipboardCheck size={20} strokeWidth={2.2} />;
      case 'success':
        return <Check size={22} strokeWidth={3} />;
      case 'error':
        return <AlertTriangle size={20} strokeWidth={2.4} />;
      default:
        return <Mic size={20} strokeWidth={2.2} />;
    }
  })();

  return (
    <div className={`orb orb--${state}`} aria-label={state}>
      {state === 'recording' && (
        <>
          <span className="orb__ring orb__ring--1" />
          <span className="orb__ring orb__ring--2" />
        </>
      )}
      {(state === 'processing' || state === 'injecting') && <span className="orb__spin" />}
      <span className="orb__icon">{icon}</span>
    </div>
  );
}
