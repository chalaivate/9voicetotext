/**
 * Overlay stylesheet, injected once by App.tsx. Kept as a template string so
 * the overlay bundle stays a single self-contained HTML page (no external
 * CSS request while the window is being shown for the first time).
 *
 * Palette follows the 9Expert CI: Brand Blue #2486FF, Deep Navy #0D1B2A,
 * Lime #D4F73F. State colours reuse the shared design tokens.
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
  }
  body, html, #root {
    margin: 0; padding: 0; height: 100%;
    background: transparent; overflow: hidden;
  }
  * { box-sizing: border-box; }

  .ovl {
    position: relative;
    margin: 8px;
    height: calc(100% - 16px);
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 18px 12px 14px;
    border-radius: 22px;
    color: var(--ice);
    font-family: "LINE Seed Sans TH", "Google Sans", -apple-system, BlinkMacSystemFont,
      "Segoe UI", system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.3;
    background:
      linear-gradient(135deg, rgba(20, 34, 52, 0.94) 0%, rgba(13, 27, 42, 0.90) 60%, rgba(10, 18, 30, 0.94) 100%);
    border: 1px solid rgba(255, 255, 255, 0.10);
    box-shadow:
      0 18px 40px rgba(0, 0, 0, 0.42),
      0 0 0 1px rgba(0, 0, 0, 0.25),
      0 0 32px var(--accent-soft);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    overflow: hidden;
    animation: ovl-in 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
    transition: box-shadow 300ms ease, border-color 300ms ease;
  }
  .ovl::before {
    /* gradient hairline that tracks the state colour */
    content: "";
    position: absolute; inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(120deg, var(--accent) 0%, rgba(255,255,255,0.10) 45%, var(--lime) 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.75;
    pointer-events: none;
    transition: background 300ms ease;
  }
  .ovl__sheen {
    position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.10), transparent 55%);
    pointer-events: none;
  }

  .ovl--recording  { --accent: var(--red);    --accent-soft: rgba(255, 59, 48, 0.32); }
  .ovl--processing { --accent: var(--blue);   --accent-soft: rgba(36, 134, 255, 0.38); }
  .ovl--injecting  { --accent: var(--blue-light); --accent-soft: rgba(72, 176, 255, 0.38); }
  .ovl--success    { --accent: var(--green);  --accent-soft: rgba(52, 199, 89, 0.36); }
  .ovl--error      { --accent: var(--orange); --accent-soft: rgba(255, 149, 0, 0.36); }

  /* ------------------------------------------------------------ body */
  .ovl__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .ovl__title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ovl__title {
    font-size: 15px; font-weight: 700; letter-spacing: 0.1px;
    white-space: nowrap; text-shadow: 0 1px 0 rgba(0,0,0,0.25);
  }
  .ovl__timer {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 13px; font-weight: 600; color: rgba(248, 250, 253, 0.85);
  }
  .ovl__chip {
    font-size: 9px; font-weight: 800; letter-spacing: 1.2px;
    padding: 2px 7px; border-radius: 999px;
    background: var(--accent); color: #fff;
    box-shadow: 0 0 10px var(--accent-soft);
    flex-shrink: 0; line-height: 1.4;
    transition: background 300ms ease;
  }
  .ovl__chip--mode { background: var(--lime); color: var(--navy); box-shadow: none; }
  .ovl__sub {
    font-size: 11.5px; color: rgba(248, 250, 253, 0.72);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ovl__sub--interim {
    font-style: italic; color: rgba(248, 250, 253, 0.80);
    white-space: normal; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    max-height: 32px;
  }
  .ovl__sub--result { color: var(--ice); font-weight: 500; }

  /* ------------------------------------------------------------ orb */
  .orb {
    position: relative; flex-shrink: 0;
    width: 46px; height: 46px; border-radius: 50%;
    display: grid; place-items: center;
    background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 45%),
      linear-gradient(160deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--navy)));
    box-shadow: 0 6px 18px var(--accent-soft), inset 0 0 0 1px rgba(255,255,255,0.18);
    color: #fff;
    transition: background 300ms ease, box-shadow 300ms ease;
  }
  .orb__icon { display: grid; place-items: center; position: relative; z-index: 2; }
  .orb--success .orb__icon { animation: orb-pop 360ms cubic-bezier(0.2, 1.4, 0.4, 1); }
  .orb--error .orb__icon { animation: orb-shake 420ms ease; }
  .orb__ring {
    position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid var(--accent);
    animation: orb-ring 1.6s ease-out infinite;
    opacity: 0;
  }
  .orb__ring--2 { animation-delay: 0.8s; }
  .orb__spin {
    position: absolute; inset: -4px; border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0 60%, var(--lime) 85%, transparent 100%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
    animation: orb-spin 1s linear infinite;
  }

  /* ------------------------------------------------------------ right side */
  .ovl__wave { flex-shrink: 0; display: grid; place-items: center; }
  .ovl__dots { flex-shrink: 0; display: flex; gap: 5px; align-items: center; padding-right: 4px; }
  .ovl__dots span {
    width: 6px; height: 6px; border-radius: 50%; background: var(--lime);
    animation: dot-bounce 1.1s ease-in-out infinite;
  }
  .ovl__dots span:nth-child(2) { animation-delay: 0.15s; }
  .ovl__dots span:nth-child(3) { animation-delay: 0.30s; }

  /* ------------------------------------------------------------ bottom bar + brand */
  .ovl__bar {
    position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
    background: linear-gradient(90deg, var(--accent), var(--lime));
    opacity: 0.85;
  }
  .ovl__bar--busy {
    background: linear-gradient(90deg, transparent, var(--lime) 40%, var(--accent) 60%, transparent);
    background-size: 50% 100%;
    animation: bar-shimmer 1.2s linear infinite;
  }
  .ovl__brand {
    position: absolute; right: 14px; bottom: 6px;
    font-size: 8.5px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: rgba(248, 250, 253, 0.34);
    pointer-events: none;
  }

  /* ------------------------------------------------------------ motion */
  @keyframes ovl-in {
    from { opacity: 0; transform: translateY(-10px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes orb-ring {
    0%   { transform: scale(0.9); opacity: 0.85; }
    100% { transform: scale(1.75); opacity: 0; }
  }
  @keyframes orb-spin { to { transform: rotate(360deg); } }
  @keyframes orb-pop {
    0%   { transform: scale(0.4); opacity: 0; }
    60%  { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(1); }
  }
  @keyframes orb-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }
  @keyframes dot-bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
    40% { transform: translateY(-5px); opacity: 1; }
  }
  @keyframes bar-shimmer {
    from { background-position: -100% 0; }
    to   { background-position: 200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ovl, .orb__icon, .orb__ring, .orb__spin, .ovl__dots span, .ovl__bar--busy { animation: none !important; }
  }
`;
