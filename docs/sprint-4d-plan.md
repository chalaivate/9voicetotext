# Sprint 4d Plan — gpt-4o-transcribe + Auto-stop + Streaming

**Goal:** ยกระดับคุณภาพการ transcribe + เพิ่ม "auto-stop on silence" mode + ทยอยพิมพ์ข้อความระหว่างพูด

**Total estimate:** 6–10 วัน (ขึ้นอยู่กับว่าทำ Phase 4 หรือไม่)

---

## Decision Matrix

ก่อนเริ่ม decision 4 ข้อที่ต้อง lock:

### D1: Model

| Option                   | ราคา/min | Streaming | Quality                      | Recommendation     |
| ------------------------ | -------: | :-------: | ---------------------------- | ------------------ |
| `whisper-1` (ปัจจุบัน)   |   $0.006 |    ❌     | ดี                           | —                  |
| **`gpt-4o-transcribe`**  |   $0.006 |    ✅     | **ดีกว่า, hallucinate น้อย** | ✅ **เลือกตัวนี้** |
| `gpt-4o-mini-transcribe` |   $0.003 |    ✅     | ใกล้ whisper-1               | สำหรับใช้หนักจริงๆ |

**ตัดสินใจ:** ตั้งเป็นค่า default `gpt-4o-transcribe` แต่เปิด Settings ให้ user เลือกได้ทั้ง 3 model

### D2: Auto-stop UX

- **Press once → record → silence 10s → auto-stop** ✅
- **Press hotkey อีกครั้ง → cancel ทันที** (ไม่รอ silence)
- **Esc → cancel** (เผื่อ user)
- **กดค้างแบบ PTT** ใน mode นี้ → อัด normal (override silence detection ตอนกดค้าง)

**Settings ที่เพิ่ม:**

- `audio.silenceThreshold` (RMS 0–1, default 0.015)
- `audio.silenceDurationMs` (1000–30000, default 10000)
- `audio.maxRecordingMs` (existing 5min limit ยังคงไว้)

### D3: Streaming approach

| Option                                       | UX                                    | Complexity |       Cost | ตัดสินใจ                  |
| -------------------------------------------- | ------------------------------------- | :--------: | ---------: | ------------------------- |
| **A) Single-recording + streaming response** | text ขึ้นเป็น chunks หลังหยุด (~1-3s) |    ⭐⭐    | $0.006/min | ✅ **Phase 3**            |
| **B) Chunked recording (5s/chunk)**          | text ขึ้นทุก ~5s **ระหว่างพูด**       |  ⭐⭐⭐⭐  | $0.006/min | ⏸️ **Phase 4 (optional)** |
| C) Realtime WebSocket API                    | text ขึ้นแทบ real-time (<200ms)       | ⭐⭐⭐⭐⭐ | $0.04+/min | ❌ overkill + แพง         |

**คำแนะนำ:** Phase 3 (Option A) ก่อน — ได้ "feel" ของ streaming โดย complexity ต่ำ. ถ้าใช้แล้วยังอยากได้ live จริงๆ ค่อย Phase 4

### D4: Output mode interaction กับ streaming

ตอนนี้มี output mode `paste` / `clipboard` / `both`. กับ streaming:

- **paste mode:** จะ paste แต่ละ chunk หรือรอจบ?
  - **เลือก:** รอจบ — chunks ใน overlay UI เท่านั้น, paste ครั้งเดียวตอน final
  - เหตุผล: paste แต่ละ chunk จะเลื่อน cursor ทำให้แก้ยาก
- **clipboard mode:** copy ครั้งเดียวตอนจบ
- **both:** paste + copy ครั้งเดียวตอนจบ

---

## Phase 1: Model swap → `gpt-4o-transcribe`

**Effort:** 0.5 วัน
**Value:** hallucination ลดทันที

### Tasks

1. Schema: เพิ่ม `transcription.model` field (enum: `whisper-1` | `gpt-4o-transcribe` | `gpt-4o-mini-transcribe`, default = `gpt-4o-transcribe`)
2. Constants: รายชื่อ model + ราคา (สำหรับแสดงใน Settings)
3. Whisper client: อ่าน model จาก settings แทน hard-coded `'whisper-1'`
4. Settings UI (Transcription page): Add model selector dropdown
5. Verify response format compatibility — `gpt-4o-transcribe` คืน JSON เหมือน whisper-1 (text, language, duration, segments)
6. Tests: เพิ่ม case ที่ verify model parameter ถูกส่ง
7. Spec-changes log entry

### Verification

- พูด "ชไลเวท" หลายๆ ครั้ง → ตรวจ accuracy
- เปรียบเทียบกับ whisper-1: ใช้สลับ model ใน Settings, อัดประโยคเดียวกัน
- ดูจำนวน hallucination ใน 10 minute test session

---

## Phase 2: Auto-stop mode (VAD)

**Effort:** 2 วัน
**Value:** ใช้สบายขึ้นมาก ไม่ต้องค้างหรือกด 2 ครั้ง

### Architecture

```
┌─ Renderer (overlay window) ─────────────────────┐
│                                                 │
│  MediaRecorder ←──────── audio stream           │
│         │                                       │
│         ▼                                       │
│   AnalyserNode (existing)                       │
│         │                                       │
│         ▼                                       │
│  ┌──────────────────┐                           │
│  │ SilenceDetector  │ ──── if silence >10s ───┐ │
│  │                  │                          │ │
│  │ RMS > threshold? │                          │ │
│  └──────────────────┘                          │ │
│                                                 │ │
└──────────────────────── IPC: recording:autoStop│─┘
                                                  │
┌─ Main process ──────────────────────────────────┐
│                                                  │
│  RecordingController.autoStop() ←────────────────┘
│   → same path as user-pressed stop                │
│   → submitAudio → Whisper → inject                │
│                                                   │
└───────────────────────────────────────────────────┘
```

### New schema fields

```ts
audio: {
  ...existing,
  silenceThresholdRms: number,     // 0–1, default 0.015
  silenceDurationMs: number,        // 1000–30000, default 10000
}

hotkey: {
  combo: string,
  mode: 'toggle' | 'push-to-talk' | 'auto-stop',  // ← new option
}
```

### Tasks

1. **`SilenceDetector` class** in renderer
   - Polls AnalyserNode RMS every 100ms
   - State: `quiet` (RMS < threshold for >X ms) | `loud`
   - `onSilenceTimeout(callback, durationMs)` → fires after N ms quiet
   - Reset timer on RMS spike

2. **New IPC channel:** `recording:autoStop`
   - Renderer → Main when silence detected
   - Main fires `controller.stop()` (existing)

3. **Controller mode-aware logic**
   - `pressed()` in `auto-stop` mode:
     - if idle → start (ไม่ stop on second press; cancel แทน)
     - if recording → cancel (release renderer + idle)
   - `released()` ignored in auto-stop mode
   - Listen for `autoStop` IPC → call `stop()` (already exists)

4. **Renderer App.tsx**
   - Read `hotkey.mode` from settings
   - If `auto-stop`: instantiate SilenceDetector after recording starts
   - Send `recording:autoStop` IPC when triggered
   - Cancel detector on stop/cancel

5. **Settings UI**
   - **Hotkeys page:** add `'auto-stop'` to mode dropdown
   - **Audio page:** new card "Silence detection" with sliders:
     - "Silence sensitivity" (RMS threshold, with live meter)
     - "Auto-stop delay" (silence duration, 1–30s)
   - Live preview: show "Listening..." vs "Silent (5s)" indicator

6. **Tests**
   - Unit: SilenceDetector with mock RMS source
   - Integration: controller in auto-stop mode → mock silence event → verify stop()

### UX details

- Overlay shows countdown ใน recording state: "Listening… (silence in 7s)" เมื่อเริ่มเงียบ
- Re-press hotkey ใน recording = cancel (ไม่ส่ง Whisper)
- Esc key globally = cancel (ทุก mode)

---

## Phase 3: Streaming response (Option A)

**Effort:** 2-3 วัน
**Value:** เห็น text ทยอยขึ้น ระหว่าง processing (after stop) → feel ลื่นกว่าเดิม

### Architecture

```
User stops recording
        ↓
Audio sent to gpt-4o-transcribe (with stream: true)
        ↓
Response: SSE stream of { delta: "..." } events
        ↓
Main process accumulates → broadcasts each delta to overlay
        ↓
Overlay: shows interim text growing live
        ↓
On final event: full text → controller.handleResult → inject as before
```

### Tasks

1. **Whisper client streaming support**
   - New method: `transcribeStream(req): AsyncIterable<{ delta: string, isFinal: boolean }>`
   - Use `stream: true` parameter in API request
   - Parse SSE events with undici fetch
   - Accumulate full text + emit deltas

2. **Recording controller streaming integration**
   - New state: `processing` already exists, but now add `interimText` field
   - Listen to streaming events
   - Broadcast each delta to overlay via existing `state:update` IPC
   - On final: same path as today (inject)

3. **Overlay UI**
   - Show interim text as it grows during `processing` state
   - Different visual style: lighter/grey for interim, normal for final
   - Auto-scroll if overflows

4. **Settings toggle**
   - **Transcription page:** "Streaming transcription" toggle (default on if model supports)
   - Auto-disable for `whisper-1` (no streaming support)
   - Auto-enable for `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`

5. **Tests**
   - Mock SSE source → verify deltas accumulated correctly
   - Verify isFinal triggers inject
   - Streaming + filter interaction (filter runs on final text only)

### UX details

- "Processing…" → "การทำงานของเ..." (interim, light grey) → "การทำงานของเรา ✓" (final, normal)
- Estimated latency: 200ms → first delta, 1-2s → final
- ใน clipboard-only mode: copy ครั้งเดียวตอน final

---

## Phase 4 (OPTIONAL): True live streaming via chunked recording

**Effort:** 4-5 วัน
**Value:** text ขึ้นจริง **ระหว่างพูด** ทุก ~5 วินาที — feel realtime จริง

⚠️ **Decision point หลัง Phase 3:** ถ้า Phase 3 (single-recording streaming) feel ดีพอแล้ว, skip Phase 4

### Architecture

```
Recording (continuous) ──┬─ chunk 1 (0-5s) ──→ gpt-4o-transcribe (stream)
                         ├─ chunk 2 (5-10s) ─→ gpt-4o-transcribe (stream)
                         └─ chunk 3 (10-15s) → gpt-4o-transcribe (stream)
                                  ↓
                         Concatenate chunks → final text
                         (with overlap region for sentence boundaries)
```

### Challenges

- **Word boundary cuts:** chunk จบกลางคำ → Whisper อาจตัดผิด
  - แก้: overlap chunks 0.5s, dedupe ทับซ้อน
- **Sentence context:** chunk แยกกัน, ไม่มี cross-context
  - แก้: ส่ง previous transcription เป็น `prompt` parameter ของ chunk ถัดไป
- **Edit/correct:** Whisper อาจแก้ chunk ก่อนหน้าเมื่อได้ context ใหม่
  - แก้: รอ final ก่อน paste, แสดงเฉพาะใน overlay ขณะอัด
- **Cost multiplier:** 3 chunks vs 1 request = 3x API call overhead (แต่ราคารวมเท่าเดิมเพราะคิดตาม audio duration)

### Tasks (high-level)

1. Refactor MediaRecorder → emit chunks at fixed intervals
2. ChunkedTranscriber class — manages parallel + sequential transcription requests
3. Text accumulator — handles overlap dedup, sentence context
4. Streaming UI — show chunks live + correction edits
5. Heavy tests for edge cases (empty chunks, network failures, word splits)

---

## Schema diff summary (Phases 1-3)

```ts
// Add to settings schema:
{
  hotkey: {
    mode: 'toggle' | 'push-to-talk' | 'auto-stop',  // ← new value
  },
  audio: {
    silenceThresholdRms: number,        // ← new (0–1, default 0.015)
    silenceDurationMs: number,          // ← new (default 10000)
  },
  transcription: {
    model: 'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe',  // ← new
    streaming: boolean,                  // ← new (default true)
  },
}
```

---

## Recommended execution order

1. **Phase 1 (0.5 d)** ← เริ่มเลย - quick win, ลด hallucination
2. **Phase 2 (2 d)** ← ของที่ user ขอเป็นหลัก
3. **Phase 3 (2 d)** ← streaming response, get feel ของ "ทยอย"
4. **Decision gate** — Phase 4 จำเป็นมั้ย?
5. **Phase 4 (5 d)** ← ถ้าตัดสินใจทำ

**Total Phase 1-3:** ~5 วัน
**Total Phase 1-4:** ~10 วัน

---

## ความสัมพันธ์กับ Sprint อื่นๆ

- **Sprint 4c (History + Onboarding):** สามารถสลับลำดับ — ถ้า Sprint 4d ก่อน, history page จะมีโครงสร้างพร้อม store transcription metadata จาก streaming
- **Sprint 5 (Packaging):** ไม่กระทบ — Phase 1-3 เพิ่มฟีเจอร์เฉยๆ ไม่เปลี่ยน packaging ขั้นตอน

---

## Risks

| Risk                                                  | Impact | Mitigation                                                        |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| `gpt-4o-transcribe` API ไม่ stable / quality variance | High   | Phase 1 verify carefully + keep whisper-1 as fallback in Settings |
| VAD threshold ปรับยาก (false positive/negative)       | Medium | Live RMS meter ใน Audio settings                                  |
| Streaming SSE parsing edge cases (network drops)      | Medium | Fallback to non-streaming on stream error                         |
| Phase 4 chunk boundary issues                         | High   | สร้าง MVP ก่อน, decision gate หลัง Phase 3                        |
| User ใช้ auto-stop ในห้องที่มี noise สูง → ไม่ stop   | Medium | Threshold slider + manual cancel via second press                 |
