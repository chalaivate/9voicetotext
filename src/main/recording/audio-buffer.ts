/**
 * Holds the audio bytes for a single recording attempt. Spec §4.3 requires
 * that audio never be persisted to disk and is cleared from memory after the
 * transcription completes — so this is a deliberately small wrapper that owns
 * the buffer's lifetime explicitly.
 */
export class AudioBuffer {
  private bytes: Uint8Array | null = null;
  private mime = 'audio/webm';

  set(data: Uint8Array, mimeType: string): void {
    this.bytes = data;
    this.mime = mimeType;
  }

  takeBuffer(): { audio: Buffer; mimeType: string } | null {
    if (!this.bytes) return null;
    const audio = Buffer.from(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const mimeType = this.mime;
    this.clear();
    return { audio, mimeType };
  }

  clear(): void {
    this.bytes = null;
    this.mime = 'audio/webm';
  }

  get sizeBytes(): number {
    return this.bytes?.byteLength ?? 0;
  }
}
