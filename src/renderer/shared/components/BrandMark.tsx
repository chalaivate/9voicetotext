/**
 * Inline copy of the app icon (see resources/design/gen-icons.mjs) so the
 * renderer can show the logo without loading a file from disk.
 */
export function BrandMark({ size = 32 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden
      style={{ display: 'block', flexShrink: 0, borderRadius: size * 0.225 }}
    >
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4AA6FF" />
          <stop offset="0.55" stopColor="#2486FF" />
          <stop offset="1" stopColor="#0B3E9C" />
        </linearGradient>
        <linearGradient id="bm-lime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9FF6A" />
          <stop offset="1" stopColor="#C6EE1E" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#bm-bg)" />
      <rect x="318" y="196" width="196" height="352" rx="98" fill="#FFFFFF" />
      <g stroke="#2486FF" strokeOpacity="0.35" strokeWidth="10" strokeLinecap="round">
        <line x1="366" y1="300" x2="466" y2="300" />
        <line x1="366" y1="352" x2="466" y2="352" />
        <line x1="366" y1="404" x2="466" y2="404" />
      </g>
      <path
        d="M254 402 v56 a162 162 0 0 0 324 0 v-56"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="46"
        strokeLinecap="round"
      />
      <line
        x1="416"
        y1="622"
        x2="416"
        y2="720"
        stroke="#FFFFFF"
        strokeWidth="46"
        strokeLinecap="round"
      />
      <line
        x1="316"
        y1="746"
        x2="516"
        y2="746"
        stroke="#FFFFFF"
        strokeWidth="46"
        strokeLinecap="round"
      />
      <g fill="url(#bm-lime)">
        <rect x="628" y="402" width="52" height="116" rx="26" />
        <rect x="712" y="318" width="52" height="284" rx="26" />
        <rect x="796" y="382" width="52" height="156" rx="26" />
      </g>
    </svg>
  );
}
