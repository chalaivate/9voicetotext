import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { applyTheme, themeCss, tokens } from '../shared/tokens';
import { BrandMark } from '../shared/components/BrandMark';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { ToastHost, toast } from '../shared/components/Toast';
import type { SettingsShape } from '../../preload/api';
import type { HistoryEntry } from '../../shared/types';
import { EntryRow } from './components/EntryRow';

/** Normalise for a case-insensitive, Thai-safe substring match. */
function fold(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase();
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Initial load + live updates from main (settings for theme/limit/persist,
  // history for the list itself).
  useEffect(() => {
    let alive = true;
    void window.voiceToText.settings
      .get()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => undefined);
    const offSettings = window.voiceToText.settings.onChange(setSettings);

    const receive = (list: HistoryEntry[]): void => {
      setEntries(list);
      setNow(Date.now());
    };
    void window.voiceToText.history
      .list()
      .then((list) => {
        if (alive) receive(list);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    const offHistory = window.voiceToText.history.onChange(receive);

    return () => {
      alive = false;
      offSettings();
      offHistory();
    };
  }, []);

  // Apply the theme now and re-apply when the OS scheme flips in 'system'.
  const theme = settings?.ui.theme ?? 'system';
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (): void => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Tick so "just now" ages into "3 min ago" without any new entries.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const focusSearch = useCallback((): void => {
    const input = searchBoxRef.current?.querySelector('input');
    input?.focus();
    input?.select();
  }, []);

  // Cmd/Ctrl+F → search. Escape → clear the search, or close the window.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // `code` covers non-Latin layouts (Thai) where `key` is not 'f'.
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyF' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === 'Escape') {
        if (query) setQuery('');
        else window.voiceToText.windows.closeSelf();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [query, focusSearch]);

  const sorted = useMemo(
    () => [...(entries ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [entries]
  );
  const needle = fold(query.trim());
  const filtered = useMemo(
    () => (needle ? sorted.filter((e) => fold(e.text).includes(needle)) : sorted),
    [sorted, needle]
  );

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setEntries(await window.voiceToText.history.list());
    } catch {
      /* keep whatever we have */
    }
  }, []);

  const copy = useCallback(async (id: string): Promise<void> => {
    try {
      await window.voiceToText.history.copy(id);
      toast('Copied', 'success');
    } catch {
      toast('Copy failed', 'error');
    }
  }, []);

  const remove = useCallback(
    async (id: string, from?: HTMLElement): Promise<void> => {
      // Keep keyboard users in place: move focus to the neighbouring row's
      // first action (or the search box) before this row leaves the DOM.
      const article = from?.closest('article');
      const neighbour = article?.nextElementSibling ?? article?.previousElementSibling;
      const target =
        neighbour?.querySelector<HTMLElement>('button.icon-btn') ??
        searchBoxRef.current?.querySelector<HTMLElement>('input') ??
        null;
      // Optimistic: main broadcasts the authoritative list right after.
      setEntries((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
      if (from && target) requestAnimationFrame(() => target.focus());
      try {
        await window.voiceToText.history.remove(id);
      } catch {
        toast('Delete failed', 'error');
        await refresh();
      }
    },
    [refresh]
  );

  const clearAll = useCallback(async (): Promise<void> => {
    if (!window.confirm('Clear all history? This cannot be undone.')) return;
    setEntries([]);
    setExpanded(new Set());
    try {
      await window.voiceToText.history.clear();
      toast('History cleared', 'info');
    } catch {
      toast('Could not clear history', 'error');
      await refresh();
    }
  }, [refresh]);

  const toggle = useCallback((id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loaded = settings !== null && entries !== null;
  const limit = settings?.app.historyLimit ?? 50;
  const persist = settings?.app.persistHistory ?? false;
  const historyOff = limit === 0;
  const openSettings = (): void => window.voiceToText.windows.openSettings();

  let content: ReactNode;
  if (!loaded) {
    content = <div style={{ color: tokens.color.textDim, padding: 24 }}>Loading…</div>;
  } else if (historyOff) {
    content = (
      <EmptyState
        title="History is turned off"
        hint="Set a history limit above 0 in Settings to start keeping transcriptions."
        action={
          <Button variant="secondary" size="sm" onClick={openSettings}>
            Open Settings
          </Button>
        }
      />
    );
  } else if (sorted.length === 0) {
    content = (
      <EmptyState
        title="No transcriptions yet"
        hint="Press your hotkey, speak, and the result will appear here."
      />
    );
  } else if (filtered.length === 0) {
    content = <EmptyState title={`Nothing matches “${query.trim()}”`} />;
  } else {
    content = filtered.map((entry) => (
      <EntryRow
        key={entry.id}
        entry={entry}
        now={now}
        expanded={expanded.has(entry.id)}
        onToggle={() => toggle(entry.id)}
        onCopy={() => void copy(entry.id)}
        onDelete={(el) => void remove(entry.id, el)}
      />
    ));
  }

  const footerText = historyOff
    ? 'History is off.'
    : persist
      ? 'Saved on this computer.'
      : 'Kept in memory only — cleared when the app quits.';

  return (
    <>
      <style>{`
        ${themeCss}
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body, html, #root {
          margin: 0; padding: 0; height: 100vh;
          background: ${tokens.color.bg}; color: ${tokens.color.text};
          font-family: ${tokens.font.sans};
          -webkit-font-smoothing: antialiased;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${tokens.color.border}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${tokens.color.slate}; }
        .entry { animation: rowIn 160ms ease; transition: border-color 120ms ease; }
        .entry:hover { border-color: ${tokens.color.textFaint}; }
        .entry-actions { opacity: 0; transition: opacity 120ms ease; }
        .entry:hover .entry-actions, .entry:focus-within .entry-actions { opacity: 1; }
        .icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; padding: 0;
          border: none; border-radius: ${tokens.radius.md};
          background: transparent; color: ${tokens.color.textDim}; cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
        }
        .icon-btn:hover { background: var(--c-sidebar-glow); color: ${tokens.color.text}; }
        .icon-btn.is-danger:hover { background: rgba(255, 59, 48, 0.12); color: ${tokens.color.error}; }
        .text-btn {
          background: none; border: none; padding: 0; margin: 0;
          font: inherit; font-size: 11px; font-weight: 500;
          color: ${tokens.color.link}; cursor: pointer;
        }
        .text-btn:hover { text-decoration: underline; }
        .search-input:focus { border-color: ${tokens.color.brandBlue} !important; }
        .icon-btn:focus-visible, .text-btn:focus-visible {
          outline: 2px solid ${tokens.color.brandBlue}; outline-offset: 1px;
        }
      `}</style>
      <div style={layout}>
        <header style={header}>
          <BrandMark size={24} />
          <h1 style={title}>History</h1>
          {loaded && !historyOff && <span style={countPill}>{`${sorted.length} of ${limit}`}</span>}
          <div ref={searchBoxRef} style={searchBox}>
            <Search size={14} strokeWidth={2} style={searchIcon} />
            <Input
              className="search-input"
              placeholder="Search"
              aria-label="Search history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ height: 30, fontSize: 12.5, paddingLeft: 30, paddingRight: query ? 30 : 10 }}
            />
            {query && (
              <button
                className="icon-btn"
                style={clearSearch}
                aria-label="Clear search"
                title="Clear search (Esc)"
                onClick={() => setQuery('')}
              >
                <X size={13} strokeWidth={2} />
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={sorted.length === 0}
            onClick={() => void clearAll()}
          >
            Clear all
          </Button>
        </header>
        <main style={list}>{content}</main>
        <footer style={footer}>
          <span>{footerText}</span>
          <button className="text-btn" onClick={openSettings}>
            Change
          </button>
        </footer>
      </div>
      <ToastHost />
    </>
  );
}

function EmptyState({
  title,
  hint,
  action
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div style={empty}>
      <div style={{ fontSize: 14, fontWeight: 600, color: tokens.color.textDim }}>{title}</div>
      {hint && (
        <div
          style={{
            fontSize: 12,
            color: tokens.color.textFaint,
            marginTop: 6,
            maxWidth: 320,
            lineHeight: 1.5
          }}
        >
          {hint}
        </div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

const layout: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  width: '100vw',
  overflow: 'hidden'
};

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
  padding: '12px 16px 10px',
  borderBottom: `1px solid ${tokens.color.border}`,
  flexShrink: 0
};

const title: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: -0.2,
  margin: 0
};

const countPill: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 10.5,
  fontWeight: 600,
  padding: '1px 8px',
  borderRadius: 999,
  background: tokens.color.bgRaised,
  border: `1px solid ${tokens.color.border}`,
  color: tokens.color.textDim,
  whiteSpace: 'nowrap'
};

const searchBox: CSSProperties = {
  position: 'relative',
  flex: '1 1 160px',
  minWidth: 140
};

const searchIcon: CSSProperties = {
  position: 'absolute',
  left: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  color: tokens.color.textFaint,
  pointerEvents: 'none'
};

const clearSearch: CSSProperties = {
  position: 'absolute',
  right: 2,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 24,
  height: 24
};

const list: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 16px 12px'
};

const empty: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '32px 16px',
  minHeight: 180
};

const footer: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '7px 16px',
  fontSize: 11,
  color: tokens.color.textFaint,
  borderTop: `1px solid ${tokens.color.border}`,
  background: tokens.color.bgSidebar,
  flexShrink: 0
};
