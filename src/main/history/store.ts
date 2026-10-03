import { rmSync } from 'node:fs';
import { join } from 'node:path';
import Store from 'electron-store';
import type { HistoryEntry } from '@shared/types';
import { logger } from '@main/utils/logger';

/**
 * Where entries go while `app.persistHistory` is on. The default adapter
 * ({@link createElectronStorePersistence}) writes `history.json` next to the
 * settings file; unit tests pass an in-memory fake.
 */
export interface HistoryPersistence {
  load(): HistoryEntry[];
  save(entries: HistoryEntry[]): void;
  /** Remove the on-disk copy entirely (persistence switched off). */
  wipe(): void;
}

export interface HistoryStoreDeps {
  /** Max entries kept; 0 disables history. Read on every mutation. */
  getLimit: () => number;
  /** Whether entries may be written to disk. Read on every mutation. */
  getPersist: () => boolean;
  persistence?: HistoryPersistence;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface HistoryAddInput {
  text: string;
  durationMs: number;
  output: HistoryEntry['output'];
}

export type HistoryListener = (entries: HistoryEntry[]) => void;

const OUTPUT_MODES: ReadonlySet<string> = new Set(['paste', 'clipboard', 'both']);

/**
 * The most recent transcriptions, newest first, capped at `getLimit()`.
 *
 * Privacy: entries live in memory and vanish on quit. They are mirrored to
 * `persistence` only while `getPersist()` is true, and turning persistence
 * off wipes the on-disk copy at once. The class imports nothing from
 * Electron so it can be unit-tested in plain node.
 */
export class HistoryStore {
  /** Newest first. Never handed out directly — see {@link list}. */
  private entries: HistoryEntry[] = [];
  private counter = 0;
  private readonly listeners = new Set<HistoryListener>();
  private readonly getLimit: () => number;
  private readonly getPersist: () => boolean;
  private readonly persistence: HistoryPersistence | null;
  private readonly now: () => number;

  constructor(deps: HistoryStoreDeps) {
    this.getLimit = deps.getLimit;
    this.getPersist = deps.getPersist;
    this.persistence = deps.persistence ?? null;
    this.now = deps.now ?? Date.now;

    if (!this.persistence) return;
    if (this.getPersist()) {
      const { entries, dropped } = this.loadFromDisk(this.persistence);
      this.entries = entries;
      const before = this.entries.length;
      this.trim(this.limit());
      // Anything filtered or trimmed on load must not linger on disk.
      if (dropped || this.entries.length !== before) {
        const persistence = this.persistence;
        this.guard('save', () => persistence.save(this.list()));
      }
    } else {
      // Persistence is off: make sure no file from an earlier opt-in (or a
      // hand-edited / reset settings file) outlives this startup.
      const persistence = this.persistence;
      this.guard('wipe', () => persistence.wipe());
    }
  }

  /**
   * Record one transcription. Returns `null` (and records nothing) when
   * history is disabled (limit 0) or the text is blank. Identical text twice
   * is two entries on purpose — the user did say it twice.
   */
  add(input: HistoryAddInput): HistoryEntry | null {
    const limit = this.limit();
    const text = typeof input.text === 'string' ? input.text : '';
    if (limit === 0 || text.trim().length === 0) return null;

    const entry: HistoryEntry = {
      id: this.nextId(),
      text,
      createdAt: this.now(),
      durationMs:
        Number.isFinite(input.durationMs) && input.durationMs > 0
          ? Math.round(input.durationMs)
          : 0,
      output: OUTPUT_MODES.has(input.output) ? input.output : 'paste'
    };
    this.entries.unshift(entry);
    this.trim(limit);
    this.commit();
    return { ...entry };
  }

  /** Newest first. Always a fresh array of copies. */
  list(): HistoryEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /** One entry by id (a copy), or `null` when unknown. */
  get(id: string): HistoryEntry | null {
    const found = this.entries.find((e) => e.id === id);
    return found ? { ...found } : null;
  }

  remove(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.commit();
    return true;
  }

  clear(): void {
    this.entries = [];
    this.commit();
  }

  /** Fires after every mutation with the new {@link list}. */
  onChange(cb: HistoryListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Re-read `getLimit()` and trim immediately. Call when settings change so
   * a lowered limit (or 0 = disabled) takes effect without a new recording.
   */
  applyLimit(): void {
    const before = this.entries.length;
    this.trim(this.limit());
    if (this.entries.length !== before) this.commit();
  }

  /**
   * Persistence toggled in Settings. On: write what we hold right now. Off:
   * wipe the disk copy so nothing transcribed outlives the process.
   */
  setPersist(enabled: boolean): void {
    const persistence = this.persistence;
    if (!persistence) return;
    if (enabled) {
      this.guard('save', () => persistence.save(this.list()));
    } else {
      this.guard('wipe', () => persistence.wipe());
    }
  }

  // ---- internals ---------------------------------------------------------

  private limit(): number {
    const raw = this.getLimit();
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.floor(raw));
  }

  /** Drop the oldest entries (tail) beyond `limit`. */
  private trim(limit: number): void {
    if (this.entries.length > limit) this.entries.length = limit;
  }

  /** Monotonic within a process; the clock prefix keeps it unique across runs. */
  private nextId(): string {
    this.counter += 1;
    return `${this.now()}-${this.counter}`;
  }

  private commit(): void {
    const persistence = this.persistence;
    if (persistence && this.getPersist()) {
      this.guard('save', () => persistence.save(this.list()));
    }
    for (const fn of this.listeners) {
      try {
        fn(this.list());
      } catch (err) {
        logger.error('history listener threw', { err: (err as Error).message });
      }
    }
  }

  /** `dropped` is true when the file held entries we refused to load. */
  private loadFromDisk(persistence: HistoryPersistence): {
    entries: HistoryEntry[];
    dropped: boolean;
  } {
    try {
      const raw: unknown = persistence.load();
      if (!Array.isArray(raw)) return { entries: [], dropped: raw != null };
      const entries = raw.filter(isHistoryEntry).map((e) => ({
        id: e.id,
        text: e.text,
        createdAt: e.createdAt,
        durationMs: e.durationMs,
        output: e.output
      }));
      return { entries, dropped: entries.length !== raw.length };
    } catch (err) {
      logger.warn('history load failed, starting empty', { err: (err as Error).message });
      return { entries: [], dropped: false };
    }
  }

  /** A disk failure must never take the recording pipeline down with it. */
  private guard(op: 'save' | 'wipe', fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.error(`history ${op} failed`, { err: (err as Error).message });
    }
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['text'] === 'string' &&
    Number.isFinite(v['createdAt']) &&
    Number.isFinite(v['durationMs']) &&
    typeof v['output'] === 'string' &&
    OUTPUT_MODES.has(v['output'])
  );
}

type HistoryFile = { entries?: HistoryEntry[] };

/**
 * Default adapter: `history.json` in userData via electron-store (same
 * mechanism as settings). The store is created lazily so merely building the
 * adapter touches nothing on disk; the first `save` while persistence is on
 * creates the file, and `wipe` deletes the file itself (conf's `delete()`
 * would leave an empty `{}` behind, and the user is told the file goes away).
 */
export function createElectronStorePersistence(): HistoryPersistence {
  const fileName = 'history';
  let store: Store<HistoryFile> | null = null;
  const getStore = (): Store<HistoryFile> => {
    if (!store) store = new Store<HistoryFile>({ name: fileName });
    return store;
  };
  return {
    load: () => getStore().get('entries') ?? [],
    save: (entries) => getStore().set('entries', entries),
    wipe: () => {
      // Resolve the path the same way electron-store does (userData/<name>.json)
      // without instantiating the store, which would recreate the file.
      const path = store ? store.path : join(userDataDir(), `${fileName}.json`);
      rmSync(path, { force: true });
    }
  };
}

/** electron's userData dir; resolved lazily so the module stays importable in node. */
function userDataDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  return app.getPath('userData');
}
