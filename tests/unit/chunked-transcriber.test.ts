import { describe, expect, it, vi } from 'vitest';
import {
  ChunkedTranscriber,
  buildChunkPrompt,
  dedupeChunkOverlap
} from '@main/transcription/chunked-transcriber';
import type { TranscribeResult } from '@shared/types';

interface Harness {
  transcriber: ChunkedTranscriber;
  whisper: { transcribe: ReturnType<typeof vi.fn> };
  onInterimUpdate: ReturnType<typeof vi.fn>;
  onFinal: ReturnType<typeof vi.fn>;
  onChunkError: ReturnType<typeof vi.fn>;
  vocab: { current: string };
}

function makeHarness(opts: { vocab?: string } = {}): Harness {
  const whisper = { transcribe: vi.fn() };
  const onInterimUpdate = vi.fn();
  const onFinal = vi.fn();
  const onChunkError = vi.fn();
  const vocab = { current: opts.vocab ?? 'CodingVocab' };

  const transcriber = new ChunkedTranscriber({
    whisper,
    getVocabularyPrompt: () => vocab.current,
    onInterimUpdate,
    onFinal,
    onChunkError
  });
  transcriber.startSession();

  return { transcriber, whisper, onInterimUpdate, onFinal, onChunkError, vocab };
}

const result = (text: string): TranscribeResult => ({
  text,
  language: 'th',
  duration: 5,
  segments: []
});

const audio = new Uint8Array([1, 2, 3]);

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
}
function makeDeferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ChunkedTranscriber', () => {
  it('accumulates text from successive chunks', async () => {
    const h = makeHarness();
    h.whisper.transcribe
      .mockResolvedValueOnce(result('hello'))
      .mockResolvedValueOnce(result('world'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });

    expect(h.transcriber.getRunningText()).toBe('hello world');
    expect(h.onInterimUpdate).toHaveBeenCalledTimes(2);
    expect(h.onInterimUpdate).toHaveBeenLastCalledWith('hello world');
  });

  it('passes previous chunks as Whisper prompt context', async () => {
    const h = makeHarness({ vocab: 'V' });
    h.whisper.transcribe
      .mockResolvedValueOnce(result('first chunk'))
      .mockResolvedValueOnce(result('second chunk'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });

    // First call uses just the vocab prompt (no running text yet).
    expect(h.whisper.transcribe.mock.calls[0]![0].options.prompt).toBe('V');
    // Second call appends the first chunk's text.
    expect(h.whisper.transcribe.mock.calls[1]![0].options.prompt).toBe('V first chunk');
  });

  it('emits onFinal once after the last chunk', async () => {
    const h = makeHarness();
    h.whisper.transcribe
      .mockResolvedValueOnce(result('one'))
      .mockResolvedValueOnce(result('two'))
      .mockResolvedValueOnce(result('three'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 2,
      isFinal: true,
      durationMs: 2000
    });

    expect(h.onFinal).toHaveBeenCalledOnce();
    expect(h.onFinal).toHaveBeenCalledWith('one two three', 12_000);
  });

  it('skips a single failed chunk and continues with the rest', async () => {
    const h = makeHarness();
    h.whisper.transcribe
      .mockResolvedValueOnce(result('alpha'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(result('gamma'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 2,
      isFinal: true,
      durationMs: 5000
    });

    expect(h.transcriber.getRunningText()).toBe('alpha gamma');
    expect(h.onChunkError).toHaveBeenCalledOnce();
    expect(h.onChunkError.mock.calls[0]![0]).toBe(1);
    expect(h.onFinal).toHaveBeenCalledWith('alpha gamma', 15_000);
  });

  it('treats empty chunk text as silence (does not append)', async () => {
    const h = makeHarness();
    h.whisper.transcribe.mockResolvedValueOnce(result('hi')).mockResolvedValueOnce(result('   '));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });

    expect(h.transcriber.getRunningText()).toBe('hi');
  });

  it('processes chunks in submission order even when slow', async () => {
    const h = makeHarness();
    // Pre-create deferreds so resolve handles exist before mockImpl runs.
    const d1 = makeDeferred<TranscribeResult>();
    const d2 = makeDeferred<TranscribeResult>();
    h.whisper.transcribe
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    const p1 = h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    const p2 = h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: true,
      durationMs: 5000
    });

    // Resolve in submission order. The transcriber's promise chain
    // means the second whisper.transcribe call won't fire until the
    // first finishes — so resolving d1 first then d2 is the only viable
    // order regardless of which we'd want to test.
    d1.resolve(result('A'));
    await p1;
    d2.resolve(result('B'));
    await p2;

    expect(h.transcriber.getRunningText()).toBe('A B');
    expect(h.onFinal).toHaveBeenCalledWith('A B', 10_000);
  });

  it('dedupes prompt-echo across chunks (regression test)', async () => {
    const h = makeHarness();
    // Simulate the bug: Whisper echoes the previous chunk's text at the
    // start of the next chunk's output (because we send it as `prompt`).
    h.whisper.transcribe
      .mockResolvedValueOnce(result('สวัสดีครับ'))
      .mockResolvedValueOnce(result('สวัสดีครับ ผมชื่อเวท'))
      .mockResolvedValueOnce(result('ผมชื่อเวท ขอบคุณมากครับ'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 2,
      isFinal: true,
      durationMs: 5000
    });

    // Without dedupe this would be:
    // "สวัสดีครับ สวัสดีครับ ผมชื่อเวท ผมชื่อเวท ขอบคุณมากครับ"
    expect(h.transcriber.getRunningText()).toBe('สวัสดีครับ ผมชื่อเวท ขอบคุณมากครับ');
  });

  it('drops a chunk that is a pure prompt-echo (no new content)', async () => {
    const h = makeHarness();
    h.whisper.transcribe
      .mockResolvedValueOnce(result('hello world'))
      .mockResolvedValueOnce(result('hello world')) // pure echo, no new content
      .mockResolvedValueOnce(result('hello world! goodbye'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: false,
      durationMs: 5000
    });
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 2,
      isFinal: true,
      durationMs: 5000
    });

    expect(h.transcriber.getRunningText()).toBe('hello world! goodbye');
  });

  it('empty-audio final marker finalizes without calling Whisper', async () => {
    const h = makeHarness();
    h.whisper.transcribe.mockResolvedValueOnce(result('first chunk text'));

    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });

    // Now an empty-audio marker chunk arrives (renderer sent this
    // because the trailing chunk was < minChunkDurationMs).
    await h.transcriber.submit({
      audio: Buffer.alloc(0),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: true,
      durationMs: 200
    });

    // Whisper was called exactly once (for chunk 0), NOT for the marker.
    expect(h.whisper.transcribe).toHaveBeenCalledTimes(1);
    // Final fired with the accumulated text from chunk 0.
    expect(h.onFinal).toHaveBeenCalledWith('first chunk text', 5000);
  });

  it('empty-audio non-final marker is a no-op (defensive)', async () => {
    const h = makeHarness();
    await h.transcriber.submit({
      audio: Buffer.alloc(0),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 200
    });
    expect(h.whisper.transcribe).not.toHaveBeenCalled();
    expect(h.onFinal).not.toHaveBeenCalled();
    expect(h.transcriber.getRunningText()).toBe('');
  });

  it('startSession resets state for a new recording', async () => {
    const h = makeHarness();
    h.whisper.transcribe.mockResolvedValueOnce(result('first session'));
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: true,
      durationMs: 5000
    });
    expect(h.transcriber.getRunningText()).toBe('first session');

    h.transcriber.startSession();
    expect(h.transcriber.getRunningText()).toBe('');

    h.whisper.transcribe.mockResolvedValueOnce(result('second session'));
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: true,
      durationMs: 5000
    });
    expect(h.transcriber.getRunningText()).toBe('second session');
  });
});

describe('dedupeChunkOverlap', () => {
  it('returns chunk unchanged when there is no running text', () => {
    expect(dedupeChunkOverlap('', 'hello world')).toBe('hello world');
  });

  it('returns empty string when chunk is a pure echo of running tail', () => {
    expect(dedupeChunkOverlap('สวัสดีครับ', 'สวัสดีครับ')).toBe('');
  });

  it('strips the overlap when chunk starts with running suffix', () => {
    expect(dedupeChunkOverlap('สวัสดีครับ', 'สวัสดีครับ ผมชื่อเวท')).toBe('ผมชื่อเวท');
  });

  it('English overlap with whitespace normalization', () => {
    expect(dedupeChunkOverlap('hello world', 'world how are you')).toBe('how are you');
  });

  it('returns chunk unchanged when no overlap exists', () => {
    expect(dedupeChunkOverlap('abcdef', 'xyz123')).toBe('xyz123');
  });

  it('ignores tiny overlaps (under 5 chars) to avoid false matches', () => {
    // last char of running matches start of chunk — 1 char only — should not trim
    expect(dedupeChunkOverlap('hi', 'i am here')).toBe('i am here');
  });

  it('caps search at 200 chars even with very long running text', () => {
    const longRunning = 'x'.repeat(5000) + ' alpha beta';
    expect(dedupeChunkOverlap(longRunning, 'alpha beta gamma')).toBe('gamma');
  });

  it('handles long Thai overlap typical of Whisper prompt-echo', () => {
    const running = 'ขอทดลองพูดประโยคยาวๆเพื่อทดสอบการถอดเสียงในโหมดสตรีมมิ่ง';
    const echoed = `${running} และต่อด้วยเนื้อหาใหม่`;
    expect(dedupeChunkOverlap(running, echoed)).toBe('และต่อด้วยเนื้อหาใหม่');
  });
});

describe('buildChunkPrompt', () => {
  it('returns just the vocab when no running text', () => {
    expect(buildChunkPrompt('CodingVocab', '')).toBe('CodingVocab');
    expect(buildChunkPrompt('CodingVocab', '   ')).toBe('CodingVocab');
  });

  it('appends running text after vocab', () => {
    expect(buildChunkPrompt('Vocab', 'hello world')).toBe('Vocab hello world');
  });

  it('truncates long running text to keep prompt under Whisper budget', () => {
    const long = 'x'.repeat(2000);
    const prompt = buildChunkPrompt('V', long);
    // Should keep tail (last 800 chars) — the most recent context matters
    // most for a streaming session.
    expect(prompt.length).toBeLessThanOrEqual(810); // 800 + "V " + slack
    expect(prompt.startsWith('V ')).toBe(true);
  });
});

describe('ChunkedTranscriber — per-chunk hallucination guard', () => {
  it('drops a chunk that merely echoes the vocabulary prompt (silent-audio case)', async () => {
    const h = makeHarness({ vocab: 'Names: ชไลเวท, อ.เวท, 9Expert, 9Expert Training.' });
    h.whisper.transcribe
      .mockResolvedValueOnce(result('สวัสดีครับ วันนี้เราจะเรียน Power BI'))
      // A silent chunk: the model "transcribes" the prompt instead.
      .mockResolvedValueOnce(result('ชไลเวท'))
      .mockResolvedValueOnce(result('กับ Copilot กันครับ'));

    for (let index = 0; index < 3; index++) {
      await h.transcriber.submit({
        audio: Buffer.from(audio),
        mimeType: 'audio/webm',
        index,
        isFinal: index === 2,
        durationMs: 5000
      });
    }

    expect(h.transcriber.getRunningText()).toBe(
      'สวัสดีครับ วันนี้เราจะเรียน Power BI กับ Copilot กันครับ'
    );
    expect(h.onFinal).toHaveBeenCalledWith(
      'สวัสดีครับ วันนี้เราจะเรียน Power BI กับ Copilot กันครับ',
      15000
    );
  });

  it('keeps real speech that happens to contain vocabulary terms', async () => {
    const h = makeHarness({ vocab: 'Names: ชไลเวท, อ.เวท, 9Expert.' });
    h.whisper.transcribe.mockResolvedValueOnce(
      result('ผมชื่อชไลเวท เป็นวิทยากรของ 9Expert สอนเรื่อง Power BI มาหลายปีแล้วครับ')
    );
    await h.transcriber.submit({
      audio: Buffer.from(audio),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: true,
      durationMs: 5000
    });
    expect(h.transcriber.getRunningText()).toContain('วิทยากรของ 9Expert');
  });
});
