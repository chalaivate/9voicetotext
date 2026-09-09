export type OverlayPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Where to place the overlay window inside a display's work area (the
 * screen minus dock / taskbar) for the user's chosen corner. Pure so it
 * can be unit-tested without Electron.
 */
export function computeOverlayPosition(
  workArea: Rect,
  position: OverlayPosition,
  size: Size,
  edgeOffset: number
): { x: number; y: number } {
  const left = workArea.x + edgeOffset;
  const right = workArea.x + workArea.width - size.width - edgeOffset;
  const top = workArea.y + edgeOffset;
  const bottom = workArea.y + workArea.height - size.height - edgeOffset;

  switch (position) {
    case 'top-left':
      return { x: Math.round(left), y: Math.round(top) };
    case 'bottom-right':
      return { x: Math.round(right), y: Math.round(bottom) };
    case 'bottom-left':
      return { x: Math.round(left), y: Math.round(bottom) };
    case 'top-right':
    default:
      return { x: Math.round(right), y: Math.round(top) };
  }
}
