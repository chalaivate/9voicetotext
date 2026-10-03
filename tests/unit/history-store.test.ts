import { describe, expect, it, vi } from 'vitest';
import { HistoryStore, type HistoryPersistence } from '@main/history/store';
import type { HistoryEntry } from '@shared/types';

/** In-memory stand-in for the electron-store adapter. `disk === null` = no file. */
interface FakePersistence extends HistoryPersistence {
  readonly disk: HistoryEntry[] | null;
  load: ReturnType<typeof vi.fn<[], HistoryEntry[]>>;
  save: ReturnType<typeof vi.fn<[HistoryEntry[]], void>>;
  wipe: ReturnType<typeof vi.fn<[], void>>;
}

function fakePersistence(initial: HistoryEntry[] | null = null): FakePersistence {
  let disk: HistoryEntry[] | null = initial;
  return {
    get disk() {
      return disk;
    },
    load: vi.fn<[], HistoryEntry[]>(() => disk ?? []),
    save: vi.fn<[HistoryEntry[]], void>((entries) => {
      disk = entries.map((e) => ({ ...e }));
    }),
    wipe: vi.fn<[], void>(() => {
      disk = null;
    })
  };
}

interface Harness {
  store: HistoryStore;
  persistence: FakePersistence;
  /** Mutable knobs the store reads through its getters. */
  knobs: { limit: number; persist: boolean; now: number };
}

function makeStore(
  opts: {
    limit?: number;
    persist?: boolean;
    disk?: HistoryEntry[] | null;
    withPersistence?: boolean;
  } = {}
): Harness {
  const knobs = { limit: opts.limit ?? 50, persist: opts.persist ?? false, now: 1_700_000_000_000 };
  const persistence = fakePersistence(opts.disk ?? null);
  const store = new HistoryStore({
    getLimit: () => knobs.limit,
    getPersist: () => knobs.persist,
    now: () => knobs.now,
    ...(opts.withPersistence === false ? {} : { persistence })
  });
  return { store, persistence, knobs };
}

function entry(partial: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    text: `text ${partial.id}`,
    createdAt: 1,
    durationMs: 1000,
    output: 'paste',
    ...partial
  };
}

const add = (store: HistoryStore, text: string, durationMs = 1500): HistoryEntry | null =>
  store.add({ text, durationMs, output: 'paste' });

describe('HistoryStore', () => {
  describe('add / list', () => {
    it('records an entry and returns it with the given fields', () => {
      const { store, knobs } = makeStore();
      knobs.now = 42_000;
      const e = store.add({ text: 'สวัสดีครับ hello', durationMs: 2345, output: 'clipboard' });
      expect(e).toEqual({
        id: expect.any(String),
        text: 'สวัสดีครับ hello',
        createdAt: 42_000,
        durationMs: 2345,
        output: 'clipboard'
      });
      expect(store.list()).toEqual([e]);
    });

    it('lists newest first', () => {
      const { store, knobs } = makeStore();
      add(store, 'first');
      knobs.now += 1000;
      add(store, 'second');
      knobs.now += 1000;
      add(store, 'third');
      expect(store.list().map((e) => e.text)).toEqual(['third', 'second', 'first']);
    });

    it('returns copies, never the internal array or objects', () => {
      const { store } = makeStore();
      const added = add(store, 'keep me')!;
      const first = store.list();
      first.pop();
      first.push(entry({ id: 'injected' }));
      added.text = 'tampered';
      const [only, ...rest] = store.list();
      expect(rest).toEqual([]);
      expect(only?.text).toBe('keep me');
      only!.text = 'tampered again';
      expect(store.list()[0]?.text).toBe('keep me');
    });

    it('keeps identical text as separate entries (no dedupe)', () => {
      const { store } = makeStore();
      add(store, 'same');
      add(store, 'same');
      const list = store.list();
      expect(list).toHaveLength(2);
      expect(list[0]?.id).not.toBe(list[1]?.id);
    });

    it('generates unique, monotonic ids even when the clock stands still', () => {
      const { store } = makeStore();
      const ids = ['a', 'b', 'c', 'd'].map((t) => add(store, t)!.id);
      expect(new Set(ids).size).toBe(4);
      ids.forEach((id) => expect(id).toMatch(/^\d+-\d+$/));
      const counters = ids.map((id) => Number(id.split('-')[1]));
      expect(counters).toEqual([...counters].sort((a, b) => a - b));
    });

    it('ignores blank text and records nothing', () => {
      const { store } = makeStore();
      const listener = vi.fn();
      store.onChange(listener);
      expect(add(store, '')).toBeNull();
      expect(add(store, '   \n\t ')).toBeNull();
      expect(store.list()).toEqual([]);
      expect(listener).not.toHaveBeenCalled();
    });

    it('normalises an unknown or negative duration to 0', () => {
      const { store } = makeStore();
      expect(add(store, 'neg', -5)?.durationMs).toBe(0);
      expect(add(store, 'nan', Number.NaN)?.durationMs).toBe(0);
      expect(add(store, 'frac', 1234.6)?.durationMs).toBe(1235);
    });

    it('get() finds one entry by id, as a copy', () => {
      const { store } = makeStore();
      const e = add(store, 'find me')!;
      const got = store.get(e.id);
      expect(got).toEqual(e);
      got!.text = 'nope';
      expect(store.get(e.id)?.text).toBe('find me');
      expect(store.get('missing')).toBeNull();
    });
  });

  describe('limit', () => {
    it('trims to the limit, dropping the oldest', () => {
      const { store } = makeStore({ limit: 2 });
      add(store, 'one');
      add(store, 'two');
      add(store, 'three');
      expect(store.list().map((e) => e.text)).toEqual(['three', 'two']);
    });

    it('limit 0 records nothing', () => {
      const { store } = makeStore({ limit: 0 });
      expect(add(store, 'dropped')).toBeNull();
      expect(store.list()).toEqual([]);
    });

    it('applyLimit() trims immediately when the limit is lowered', () => {
      const { store, knobs } = makeStore({ limit: 5 });
      ['a', 'b', 'c', 'd', 'e'].forEach((t) => add(store, t));
      const listener = vi.fn();
      store.onChange(listener);

      knobs.limit = 2;
      store.applyLimit();
      expect(store.list().map((e) => e.text)).toEqual(['e', 'd']);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(store.list());
    });

    it('applyLimit() with limit 0 clears everything', () => {
      const { store, knobs } = makeStore({ limit: 5 });
      add(store, 'a');
      add(store, 'b');
      knobs.limit = 0;
      store.applyLimit();
      expect(store.list()).toEqual([]);
      expect(add(store, 'after disable')).toBeNull();
    });

    it('applyLimit() is a no-op (no change event) when nothing needs trimming', () => {
      const { store, knobs } = makeStore({ limit: 2 });
      add(store, 'a');
      const listener = vi.fn();
      store.onChange(listener);
      knobs.limit = 10;
      store.applyLimit();
      expect(listener).not.toHaveBeenCalled();
      expect(store.list()).toHaveLength(1);
    });
  });

  describe('remove / clear', () => {
    it('remove() deletes one entry by id and reports whether it existed', () => {
      const { store } = makeStore();
      const a = add(store, 'a')!;
      const b = add(store, 'b')!;
      expect(store.remove(a.id)).toBe(true);
      expect(store.list().map((e) => e.id)).toEqual([b.id]);
      expect(store.remove(a.id)).toBe(false);
      expect(store.remove('never-existed')).toBe(false);
    });

    it('clear() empties the list', () => {
      const { store } = makeStore();
      add(store, 'a');
      add(store, 'b');
      store.clear();
      expect(store.list()).toEqual([]);
    });
  });

  describe('onChange', () => {
    it('fires after every mutation with the current list', () => {
      const { store } = makeStore();
      const seen: HistoryEntry[][] = [];
      store.onChange((entries) => seen.push(entries));

      const a = add(store, 'a')!;
      const b = add(store, 'b')!;
      store.remove(a.id);
      store.clear();

      expect(seen.map((l) => l.map((e) => e.id))).toEqual([[a.id], [b.id, a.id], [b.id], []]);
    });

    it('does not fire for a failed remove', () => {
      const { store } = makeStore();
      const listener = vi.fn();
      store.onChange(listener);
      expect(store.remove('nope')).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });

    it('hands each listener its own copy', () => {
      const { store } = makeStore();
      let first: HistoryEntry[] | null = null;
      let second: HistoryEntry[] | null = null;
      store.onChange((l) => {
        first = l;
      });
      store.onChange((l) => {
        second = l;
      });
      add(store, 'x');
      expect(first).not.toBeNull();
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });

    it('unsubscribes', () => {
      const { store } = makeStore();
      const listener = vi.fn();
      const off = store.onChange(listener);
      add(store, 'a');
      off();
      add(store, 'b');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not block the others', () => {
      const { store } = makeStore();
      const good = vi.fn();
      store.onChange(() => {
        throw new Error('boom');
      });
      store.onChange(good);
      expect(() => add(store, 'a')).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistence', () => {
    const onDisk = [
      entry({ id: 'd3', text: 'newest', createdAt: 3 }),
      entry({ id: 'd2', text: 'middle', createdAt: 2 }),
      entry({ id: 'd1', text: 'oldest', createdAt: 1 })
    ];

    it('loads from disk on construction when persist is on', () => {
      const { store, persistence } = makeStore({ persist: true, disk: onDisk });
      expect(persistence.load).toHaveBeenCalledTimes(1);
      expect(store.list()).toEqual(onDisk);
    });

    it('trims the loaded entries to the limit', () => {
      const { store } = makeStore({ persist: true, disk: onDisk, limit: 2 });
      expect(store.list().map((e) => e.id)).toEqual(['d3', 'd2']);
    });

    it('drops malformed entries found on disk', () => {
      const junk = [
        onDisk[0],
        { id: 1, text: 'bad id' },
        { id: 'x', text: 'bad output', createdAt: 1, durationMs: 0, output: 'email' },
        null,
        'string'
      ] as unknown as HistoryEntry[];
      const { store } = makeStore({ persist: true, disk: junk });
      expect(store.list()).toEqual([onDisk[0]]);
    });

    it('wipes a leftover file on construction when persist is off (never loads it)', () => {
      const { store, persistence } = makeStore({ persist: false, disk: onDisk });
      expect(persistence.load).not.toHaveBeenCalled();
      expect(persistence.wipe).toHaveBeenCalledTimes(1);
      expect(persistence.disk).toBeNull();
      expect(store.list()).toEqual([]);
    });

    it('re-saves on construction when the loaded list had to be trimmed', () => {
      const { persistence } = makeStore({ persist: true, disk: onDisk, limit: 2 });
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(persistence.disk?.map((e) => e.id)).toEqual(['d3', 'd2']);
    });

    it('re-saves on construction when malformed entries were dropped', () => {
      const junk = [onDisk[0], { id: 'bad' }] as unknown as HistoryEntry[];
      const { persistence } = makeStore({ persist: true, disk: junk });
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(persistence.disk).toEqual([onDisk[0]]);
    });

    it('does not re-save on construction when the file was already clean', () => {
      const { persistence } = makeStore({ persist: true, disk: onDisk });
      expect(persistence.save).not.toHaveBeenCalled();
    });

    it('drops entries whose timestamps are not finite numbers', () => {
      const junk = [
        onDisk[0],
        { ...onDisk[1], createdAt: Number.POSITIVE_INFINITY },
        { ...onDisk[2], durationMs: Number.NaN }
      ] as HistoryEntry[];
      const { store } = makeStore({ persist: true, disk: junk });
      expect(store.list()).toEqual([onDisk[0]]);
    });

    it('saves after every mutation only while persist is on', () => {
      const { store, persistence, knobs } = makeStore({ persist: false });
      add(store, 'memory only');
      store.clear();
      expect(persistence.save).not.toHaveBeenCalled();

      knobs.persist = true;
      const a = add(store, 'on disk')!;
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(persistence.disk).toEqual([a]);

      store.remove(a.id);
      expect(persistence.save).toHaveBeenCalledTimes(2);
      expect(persistence.disk).toEqual([]);

      add(store, 'b');
      store.clear();
      expect(persistence.save).toHaveBeenCalledTimes(4);
      expect(persistence.disk).toEqual([]);
    });

    it('applyLimit() saves the trimmed list when persist is on', () => {
      const { store, persistence, knobs } = makeStore({ persist: true, limit: 3 });
      ['a', 'b', 'c'].forEach((t) => add(store, t));
      persistence.save.mockClear();
      knobs.limit = 1;
      store.applyLimit();
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(persistence.disk?.map((e) => e.text)).toEqual(['c']);
    });

    it('setPersist(false) wipes the on-disk copy and keeps memory', () => {
      const { store, persistence, knobs } = makeStore({ persist: true });
      add(store, 'secret');
      expect(persistence.disk).toHaveLength(1);

      knobs.persist = false;
      store.setPersist(false);
      expect(persistence.wipe).toHaveBeenCalledTimes(1);
      expect(persistence.disk).toBeNull();
      expect(store.list()).toHaveLength(1);

      // Later mutations stay in memory only.
      add(store, 'still private');
      expect(persistence.disk).toBeNull();
    });

    it('setPersist(true) writes the current in-memory entries', () => {
      const { store, persistence, knobs } = makeStore({ persist: false });
      const a = add(store, 'a')!;
      const b = add(store, 'b')!;
      expect(persistence.disk).toBeNull();

      knobs.persist = true;
      store.setPersist(true);
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(persistence.disk).toEqual([b, a]);
    });

    it('works without any persistence adapter', () => {
      const { store } = makeStore({ persist: true, withPersistence: false });
      expect(() => {
        add(store, 'a');
        store.setPersist(true);
        store.setPersist(false);
        store.applyLimit();
        store.clear();
      }).not.toThrow();
    });

    it('survives a failing adapter', () => {
      const broken: HistoryPersistence = {
        load: () => {
          throw new Error('disk on fire');
        },
        save: () => {
          throw new Error('disk on fire');
        },
        wipe: () => {
          throw new Error('disk on fire');
        }
      };
      const store = new HistoryStore({
        getLimit: () => 10,
        getPersist: () => true,
        persistence: broken,
        now: () => 1
      });
      expect(store.list()).toEqual([]);
      expect(() => add(store, 'a')).not.toThrow();
      expect(() => store.setPersist(false)).not.toThrow();
      expect(store.list()).toHaveLength(1);
    });
  });
});
