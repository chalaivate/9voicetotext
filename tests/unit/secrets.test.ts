import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock keytar before importing the module under test.
const store = new Map<string, string>();
const k = (s: string, a: string): string => `${s}:${a}`;

vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(async (s: string, a: string, p: string) => {
      store.set(k(s, a), p);
    }),
    getPassword: vi.fn(async (s: string, a: string) => store.get(k(s, a)) ?? null),
    deletePassword: vi.fn(async (s: string, a: string) => store.delete(k(s, a)))
  }
}));

import { setApiKey, getApiKey, deleteApiKey, hasApiKey, maskKey } from '@main/store/secrets';

beforeEach(() => {
  store.clear();
});

describe('secrets', () => {
  it('setApiKey + getApiKey round-trips via keytar', async () => {
    await setApiKey('sk-abc123XYZ');
    expect(await getApiKey()).toBe('sk-abc123XYZ');
    expect(await hasApiKey()).toBe(true);
  });

  it('trims whitespace from input', async () => {
    await setApiKey('   sk-trimmed   ');
    expect(await getApiKey()).toBe('sk-trimmed');
  });

  it('rejects empty keys', async () => {
    await expect(setApiKey('')).rejects.toThrow(/empty/);
    await expect(setApiKey('   ')).rejects.toThrow(/empty/);
  });

  it('deleteApiKey removes it', async () => {
    await setApiKey('sk-abc');
    expect(await hasApiKey()).toBe(true);
    await deleteApiKey();
    expect(await hasApiKey()).toBe(false);
    expect(await getApiKey()).toBeNull();
  });

  describe('maskKey', () => {
    it('returns placeholder for empty', () => {
      expect(maskKey(null)).toBe('(no key set)');
      expect(maskKey(undefined)).toBe('(no key set)');
      expect(maskKey('')).toBe('(no key set)');
    });
    it('returns short fallback for very short keys', () => {
      expect(maskKey('1234567')).toBe('****');
    });
    it('shows first 3 + last 4 for normal keys', () => {
      expect(maskKey('sk-proj-abcDEFghi9876')).toBe('sk-…9876');
    });
  });
});
