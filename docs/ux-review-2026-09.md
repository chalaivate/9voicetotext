# 9VoiceToText — UX/Code Review (September 2026)

สรุปผลการตรวจสอบโค้ดและ UI ของ 9VoiceToText v0.1.1 พร้อมรายการที่แก้ไขแล้วใน v0.2.0
และรายการที่แนะนำให้ทำต่อ

## 1. สิ่งที่แก้ไขแล้วใน v0.2.0

### ไอคอนแอปใหม่

- ไอคอนเดิมเป็น placeholder (วงรีสีน้ำเงินบนพื้นขาว) ไม่ผ่านมาตรฐาน macOS/Windows
- ออกแบบใหม่ตาม 9Expert CI: gradient Brand Blue → Deep Navy, ไมโครโฟนสีขาว,
  คลื่นเสียงสี Lime (`#D4F73F`) สื่อ "voice → text"
- สร้างจาก SVG ด้วย `resources/design/gen-icons.mjs` ได้ครบทุก format:
  `icon.icns` (macOS มี margin ตาม HIG), `icon.ico` (Windows 16–256 px),
  `icon.png` 512 px, `icon@1024.png`
- Tray icon ใหม่แยกตาม platform: macOS ใช้ template สีดำ (สลับตาม light/dark menu bar),
  Windows ใช้สีขาวสำหรับ taskbar มืด, สถานะ recording/processing มีจุดสีแดง/น้ำเงิน
  และรองรับ `@2x` สำหรับจอ Retina/HiDPI

### Overlay (มุมบนขวา) ออกแบบใหม่

- Glass card ขนาด 360×96 พร้อม gradient hairline, glow ตามสถานะ, blur พื้นหลัง
- Status orb แบบ animate: ring กระเพื่อมตอนฟัง, spinner สี Lime ตอนถอดเสียง,
  check pop ตอนสำเร็จ, shake ตอน error
- ข้อความภาษาไทยอ่านง่ายขึ้น: "กำลังฟัง", "กำลังถอดเสียง", "กำลังวางข้อความ",
  "เสร็จเรียบร้อย" พร้อม chip ภาษาอังกฤษ (LISTENING / TRANSCRIBING / DONE)
  และ badge โหมด (LIVE / AUTO / PTT)
- Waveform เปลี่ยนจากเส้นเดี่ยวเป็นแท่ง frequency 14 แท่ง gradient Lime → Blue
- ข้อความ interim ตอน streaming แสดง 2 บรรทัด, แถบ shimmer ด้านล่างตอนประมวลผล
- รองรับ `prefers-reduced-motion`

### Settings window

- Sidebar ใหม่: โลโก้, ไอคอน lucide ทุกแท็บ, active state มีแถบ Blue → Lime,
  footer แสดง version จริง + "Built with Claude Code · Electron · React · TypeScript"
- ธีม Light / Dark / System ทำงานจริง (เดิมมี dropdown แต่ไม่มีผล)
  ผ่าน CSS custom properties ใน `src/renderer/shared/tokens.ts`
- หน้า About ใหม่: hero + version จาก `app.getVersion()`, การ์ด "Built with"
  แสดง toolchain ทั้งหมด, Runtime info (Electron/Chromium/Node)
- หน้าต่างกว้างขึ้นเป็น 860×640 และสี background ตอนเปิดตรงกับธีมที่เลือก

### Bug ที่พบและแก้แล้ว

| #   | ปัญหา                                                                                                                                     | ไฟล์                                                | การแก้                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| 1   | `ui.overlayPosition` มีใน Settings แต่ overlay ยึดมุมบนขวาเสมอ                                                                            | `src/main/windows/overlay.ts`                       | คำนวณตำแหน่งจาก setting ทั้ง 4 มุม                      |
| 2   | `ui.theme` มี dropdown แต่ UI เป็น dark เสมอ                                                                                              | `src/renderer/shared/tokens.ts`, `settings/App.tsx` | ธีมผ่าน CSS variables + `matchMedia` สำหรับ system      |
| 3   | `ui.soundVolume` ไม่ถูกส่งให้ beeps (ดังคงที่ 30%)                                                                                        | `src/renderer/overlay/App.tsx`                      | ส่ง volume จาก settings ทุกครั้งที่เล่นเสียง            |
| 4   | `app.launchOnStartup` ไม่มีผลจริง                                                                                                         | `src/main/index.ts`                                 | เรียก `app.setLoginItemSettings` (เฉพาะ packaged build) |
| 5   | Tray menu แสดง `DEFAULT_HOTKEY` แม้ผู้ใช้เปลี่ยน hotkey แล้ว                                                                              | `src/main/tray/manager.ts`                          | อ่าน combo/mode จาก settings และ refresh เมื่อเปลี่ยน   |
| 6   | หน้า About hardcode "0.1.0 (Sprint 4a)" และเรียก `process.versions` ใน sandboxed renderer (throw ReferenceError เมื่อกด Copy diagnostic)  | `pages/About.tsx`, `ipc/handlers.ts`                | เพิ่ม IPC `app:info`                                    |
| 7   | Packaged build ไม่ได้ copy `resources/icons` ไปที่ `process.resourcesPath` (electron-builder `files` มีแค่ `out/**`) ทำให้ tray icon ว่าง | `electron-builder.yml`                              | เพิ่ม `extraResources`                                  |

หมายเหตุข้อ 7: ตรวจจาก config ใน sandbox Linux ไม่สามารถ build DMG/NSIS ยืนยันได้
ควรทดสอบ `npm run build:mac` บนเครื่องจริงอีกครั้ง

## 1b. อัปเดต v0.3.0 (10 ก.ย. 2569) หลัง feedback จาก อ.เวท

- Overlay เปลี่ยนเป็นแบบ caption: ข้อความถอดเสียงลอยอยู่เหนือเส้น 90% ของจอ
  กึ่งกลาง ฟอนต์ 28 px พื้นหลังใส (ปรับได้) แถบสถานะใสอยู่ใต้เส้น: จุดสี + ป้ายภาษาอังกฤษ
  - คลื่นเสียงตรงกลาง + เวลาอยู่ขวา ไม่มีชื่อโปรแกรม
- Settings › General › Caption: แสดง/ซ่อน, ขนาดฟอนต์, สีตัวอักษร, พื้นหลัง (ใส/กระจกฝ้า/ทึบ),
  สีและความทึบของพื้นหลัง, ตำแหน่งเส้น (% จากบน)
- แก้ bug "ชไลเวท" โผล่ตอนเงียบใน LIVE mode: chunk ที่เงียบไม่ถูกส่งไป API และทุก chunk
  ผ่านตัวกรอง prompt-echo ก่อนแสดง (unit test เพิ่ม 2 เคส)

## 2. รายการที่แนะนำให้ทำต่อ (ยังไม่ได้แก้)

เรียงตามผลกระทบต่อผู้ใช้

1. **Settings ที่ยังไม่มีผลจริง** — `app.checkForUpdates`, `app.historyLimit`,
   `output.restoreClipboard`, `output.pasteDelayMs` ถูกเก็บใน store แต่ไม่มีโค้ดใช้งาน
   ควร implement (electron-updater, history window, ส่ง option เข้า injector)
   หรือซ่อนออกจาก UI ชั่วคราวเพื่อไม่ให้ผู้ใช้สับสน
2. **History window** — tray มีเมนู "History…" แต่ disabled ตลอด (Sprint 4c ยังไม่ทำ)
   เป็นฟีเจอร์ที่เหมาะกับการ demo มาก (ดูข้อความย้อนหลัง, copy ซ้ำ)
3. **Code signing / notarization** — v0.2.0 ยัง unsigned ผู้เรียนที่โหลดไปติดตั้งจะเจอ
   Gatekeeper/SmartScreen ควรสมัคร Apple Developer + ซื้อ cert Windows ก่อนแจกวงกว้าง
4. **CI ยังไม่รัน lint/typecheck** — `.github/workflows/release.yml` รันเฉพาะ `npm test`
   ควรเพิ่ม `npm run typecheck && npm run lint` และ workflow แยกสำหรับ PR
5. **ยังไม่มี renderer/e2e test** — `tests/` มีเฉพาะ unit ของ main process
   มี `test:e2e` script แต่ไม่มี playwright config/spec ควรเพิ่ม smoke test ของ overlay
   โดยใช้ mock `window.voiceToText` (แนวเดียวกับ `resources/design/screenshots.mjs`)
6. **Onboarding ครั้งแรก** — ผู้ใช้ใหม่ต้องรู้เองว่าต้องเปิด Settings ใส่ API key
   ควรเปิด Settings อัตโนมัติเมื่อไม่มี key และแสดง checklist สิทธิ์ (Microphone,
   Accessibility) ในหน้า General
7. **Accessibility** — settings มี `aria-*` แค่ 2 จุด ควรเพิ่ม label ให้ Toggle/Select
   และ focus ring ที่มองเห็นได้
8. **ฟอนต์ CI** — UI ระบุ `LINE Seed Sans TH` / `Google Sans` เป็นอันดับแรกแล้ว แต่จะใช้
   ได้เฉพาะเครื่องที่ติดตั้งฟอนต์ไว้ หากต้องการให้เหมือนกันทุกเครื่องต้อง bundle ฟอนต์
   (ตรวจ license ก่อน)
9. **README ล้าสมัยบางจุด** — ยังอธิบาย overlay แบบเก่า ("overlay turns blue") และ
   status เป็น Sprint 5 ควรอัปเดตให้ตรง v0.2.0

## 3. วิธีสร้างไอคอน / screenshot ใหม่

```bash
npm run build
node resources/design/gen-icons.mjs resources/icons
node resources/design/screenshots.mjs docs/screenshots
THEME=light node resources/design/screenshots.mjs docs/screenshots-light
```

ทั้งสองสคริปต์ใช้ Chromium ของ Playwright (มีอยู่แล้วผ่าน `@playwright/test`)
ถ้ายังไม่มี browser ให้รัน `npx playwright install chromium` หรือกำหนด `CHROME_PATH`
