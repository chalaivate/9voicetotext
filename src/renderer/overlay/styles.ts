/**
 * Overlay stylesheet, injected once by App.tsx.
 *
 * Layout (v0.3 "caption" overlay): the window is a wide transparent strip.
 * An invisible anchor line sits `OVERLAY.captionAreaHeight` px from the
 * top (aligned by main to N% of the screen). Caption text grows upward
 * from that line; the status pill hangs centred just below it.
 *
 *   ┌──────────────────────────────────────────┐
 *   │            caption text (grows ↑)        │  cap-area
 *   ├──────────────────────────────────────────┤  ← anchor line
 *   │          ● Listening ~~~~~ 0:12          │  pill-area
 *   └──────────────────────────────────────────┘
 */
export const overlayStyles = `
  :root {
    --blue: #2486FF;
    --blue-light: #48B0FF;
    --navy: #0D1B2A;
    --lime: #D4F73F;
    --red: #FF3B30;
    --green: #34C759;
    --orange: #FF9500;
    --ice: #F8FAFD;
    --accent: var(--blue);
    --accent-soft: rgba(36, 134, 255, 0.35);
    --cap-area: 196px;
  }
  body, html, #root { margin: 0; padding: 0; height: 100%; background: transparent; overflow: hidden; }
  * { box-sizing: border-box; }

  .ovl {
    height: 100%;
    display: flex; flex-direction: column;
    font-family: "LINE Seed Sans TH", "Google Sans", -apple-system, BlinkMacSystemFont,
      "Segoe UI", system-ui, sans-serif;
    color: var(--ice);
    animation: ovl-in 220ms ease-out;
  }
  .ovl--recording  { --accent: var(--red);        --accent-soft: rgba(255, 59, 48, 0.35); }
  .ovl--processing { --accent: var(--blue);       --accent-soft: rgba(36, 134, 255, 0.40); }
  .ovl--injecting  { --accent: var(--blue-light); --accent-soft: rgba(72, 176, 255, 0.40); }
  .ovl--success    { --accent: var(--green);      --accent-soft: rgba(52, 199, 89, 0.40); }
  .ovl--error      { --accent: var(--orange);     --accent-soft: rgba(255, 149, 0, 0.40); }

  /* ------------------------------------------------ caption (above the line) */
  .cap-area {
    height: var(--cap-area); flex-shrink: 0;
    display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
    padding: 0 16px 10px;
  }
  .cap {
    max-width: 100%;
    text-align: center;
    line-height: 1.45;
    font-weight: 500;
    letter-spacing: 0.005em;
    padding: 6px 18px;
    border-radius: 16px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
    text-wrap: balance;
    transition: opacity 200ms ease, background 200ms ease;
    animation: cap-in 200ms ease-out;
  }
  /* transparent: readability comes from a soft multi-layer shadow */
  .cap--none {
    background: transparent;
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.7),
      0 0 6px rgba(0, 0, 0, 0.55),
      0 0 16px rgba(0, 0, 0, 0.45),
      0 0 32px rgba(0, 0, 0, 0.35);
  }
  .cap--glass {
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  }
  .cap--solid { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25); }
  .cap--dim { opacity: 0.7; }

  /* ------------------------------------------------ status pill (below the line) */
  .pill-area { flex: 1; display: flex; justify-content: center; align-items: flex-start; padding-top: 10px; }
  .pill {
    display: flex; align-items: center; gap: 12px;
    height: 44px; padding: 0 18px 0 16px;
    border-radius: 999px;
    background: rgba(13, 27, 42, 0.52);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.35),
      inset 0 0 0 1px rgba(255, 255, 255, 0.10),
      0 0 24px var(--accent-soft);
    font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
    white-space: nowrap;
    transition: box-shadow 300ms ease;
  }
  .pill__dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft), 0 0 10px var(--accent);
    transition: background 300ms ease;
  }
  .pill--recording .pill__dot { animation: dot-pulse 1.4s ease-out infinite; }
  .pill--processing .pill__dot, .pill--injecting .pill__dot {
    background: transparent;
    box-shadow: none;
    border: 2px solid var(--accent-soft);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  .pill__label { color: var(--ice); }
  .pill__wave { display: grid; place-items: center; margin: 0 2px; }
  .pill__time {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 13px; font-weight: 500;
    color: rgba(248, 250, 253, 0.8);
    min-width: 3.2ch; text-align: right;
  }
  .pill__msg {
    font-weight: 500; font-size: 13px; color: rgba(248, 250, 253, 0.85);
    max-width: 520px; overflow: hidden; text-overflow: ellipsis;
    border-left: 1px solid rgba(255, 255, 255, 0.18); padding-left: 12px;
  }

  /* ------------------------------------------------ motion */
  @keyframes ovl-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes cap-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes dot-pulse {
    0%   { box-shadow: 0 0 0 3px var(--accent-soft), 0 0 10px var(--accent); }
    70%  { box-shadow: 0 0 0 9px rgba(255, 59, 48, 0), 0 0 14px var(--accent); }
    100% { box-shadow: 0 0 0 3px rgba(255, 59, 48, 0), 0 0 10px var(--accent); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .ovl, .cap, .pill__dot { animation: none !important; }
  }
`;
