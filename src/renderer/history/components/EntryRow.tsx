import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { tokens } from '../../shared/tokens';
import type { HistoryEntry } from '../../../shared/types';

const OUTPUT_LABEL: Record<HistoryEntry['output'], string> = {
  paste: 'Pasted',
  clipboard: 'Copied',
  both: 'Pasted + copied'
};

const MINUTE = 60_000;
const DAY = 86_400_000;

/**
 * "just now" / "3 min ago" / "Today 14:02" / "Yesterday 14:02" / "Mon 14:02"
 * for the last week, then an absolute date. 24-hour clock, OS locale.
 */
export function formatRelative(createdAt: number, now: number): string {
  const diff = Math.max(0, now - createdAt);
  if (diff < 45_000) return 'just now';
  const mins = Math.round(diff / MINUTE);
  if (mins < 60) return `${mins} min ago`;

  const d = new Date(createdAt);
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (createdAt >= startOfToday) return `Today ${time}`;
  if (createdAt >= startOfToday - DAY) return `Yesterday ${time}`;
  if (createdAt >= startOfToday - 6 * DAY) {
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  const sameYear = d.getFullYear() === today.getFullYear();
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  return `${date}, ${time}`;
}

/** 12_000 → "0:12"; 3_725_000 → "1:02:05". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

interface Props {
  entry: HistoryEntry;
  /** Current time (ms). Passed in so every row re-renders on the same tick. */
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  /** Receives the Delete button so the caller can move focus sensibly. */
  onDelete: (button: HTMLElement) => void;
}

export function EntryRow({ entry, now, expanded, onToggle, onCopy, onDelete }: Props): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Only offer "Show more" when the 3-line clamp actually hides text. While
  // expanded we keep the last measurement so "Show less" stays visible.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = (): void => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, entry.text]);

  const created = new Date(entry.createdAt);
  const validDate = Number.isFinite(created.getTime());

  return (
    <article className="entry" style={row}>
      <div style={meta}>
        <time
          dateTime={validDate ? created.toISOString() : undefined}
          title={validDate ? created.toLocaleString() : undefined}
          style={when}
        >
          {formatRelative(entry.createdAt, now)}
        </time>
        {entry.durationMs > 0 && (
          <span style={{ ...badge, fontFamily: tokens.font.mono }}>
            {formatDuration(entry.durationMs)}
          </span>
        )}
        <span style={badge}>{OUTPUT_LABEL[entry.output]}</span>
        <div className="entry-actions" style={actions}>
          <button className="icon-btn" title="Copy text" aria-label="Copy text" onClick={onCopy}>
            <Copy size={14} strokeWidth={2} />
          </button>
          <button
            className="icon-btn is-danger"
            title="Delete"
            aria-label="Delete entry"
            onClick={(e) => onDelete(e.currentTarget)}
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div
        ref={bodyRef}
        style={{ ...body, ...(expanded ? {} : clamp) }}
        onClick={onToggle}
        title={!expanded && overflows ? 'Click to show the full text' : undefined}
      >
        {entry.text}
      </div>
      {(overflows || expanded) && (
        <button className="text-btn" style={{ marginTop: 4 }} onClick={onToggle}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </article>
  );
}

const row: CSSProperties = {
  background: tokens.color.bgRaised,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: '9px 12px 10px'
};

const meta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
  minHeight: 26
};

const when: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
  color: tokens.color.textDim,
  marginRight: 2,
  whiteSpace: 'nowrap'
};

const badge: CSSProperties = {
  fontSize: 10.5,
  lineHeight: '16px',
  padding: '0 7px',
  borderRadius: 999,
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  color: tokens.color.textDim,
  whiteSpace: 'nowrap'
};

const actions: CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  gap: 2
};

const body: CSSProperties = {
  marginTop: 5,
  fontSize: 13,
  lineHeight: 1.55,
  color: tokens.color.text,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  cursor: 'pointer'
};

const clamp: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};
