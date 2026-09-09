/**
 * Inline version of resources/icons/icon.svg (the app icon) for use inside
 * the renderer — sidebar header, about page. Keep in sync with the SVG.
 */
export function Logo({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#48B0FF" />
          <stop offset="0.45" stopColor="#2486FF" />
          <stop offset="1" stopColor="#0B3FB8" />
        </linearGradient>
        <linearGradient id="lg-lime" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E6FF6B" />
          <stop offset="1" stopColor="#C6EE1E" />
        </linearGradient>
      </defs>
      <rect x="72" y="72" width="880" height="880" rx="196" fill="url(#lg-bg)" />
      <path d="M72 72 L560 72 L72 560 Z" fill="#FFFFFF" fillOpacity="0.07" />
      <rect x="402" y="176" width="220" height="360" rx="110" fill="#FFFFFF" />
      <g fill="#0D1B2A" fillOpacity="0.22">
        <rect x="462" y="286" width="100" height="22" rx="11" />
        <rect x="462" y="334" width="100" height="22" rx="11" />
        <rect x="462" y="382" width="100" height="22" rx="11" />
      </g>
      <path
        d="M312 430 A200 200 0 0 0 712 430"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.95"
        strokeWidth="46"
        strokeLinecap="round"
      />
      <path d="M512 632 L512 690" stroke="#FFFFFF" strokeWidth="46" strokeLinecap="round" />
      <rect x="322" y="726" width="380" height="48" rx="24" fill="url(#lg-lime)" />
      <rect
        x="402"
        y="808"
        width="220"
        height="48"
        rx="24"
        fill="url(#lg-lime)"
        fillOpacity="0.9"
      />
    </svg>
  );
}
