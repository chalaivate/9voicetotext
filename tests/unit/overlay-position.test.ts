import { describe, expect, it } from 'vitest';
import { computeOverlayPosition } from '@shared/overlay-position';

const workArea = { x: 0, y: 25, width: 1440, height: 875 }; // macOS menu bar at top
const size = { width: 340, height: 96 };

describe('computeOverlayPosition', () => {
  it('top-right (default) hugs the top-right corner of the work area', () => {
    expect(computeOverlayPosition(workArea, 'top-right', size, 20)).toEqual({
      x: 1440 - 340 - 20,
      y: 25 + 20
    });
  });

  it('top-left', () => {
    expect(computeOverlayPosition(workArea, 'top-left', size, 20)).toEqual({ x: 20, y: 45 });
  });

  it('bottom-right stays above the dock / taskbar', () => {
    expect(computeOverlayPosition(workArea, 'bottom-right', size, 20)).toEqual({
      x: 1080,
      y: 25 + 875 - 96 - 20
    });
  });

  it('bottom-left', () => {
    expect(computeOverlayPosition(workArea, 'bottom-left', size, 20)).toEqual({
      x: 20,
      y: 784
    });
  });

  it('respects a secondary display offset and rounds to whole pixels', () => {
    const second = { x: 1440.4, y: -300.6, width: 2560, height: 1440 };
    expect(computeOverlayPosition(second, 'top-right', size, 16)).toEqual({
      x: Math.round(1440.4 + 2560 - 340 - 16),
      y: Math.round(-300.6 + 16)
    });
  });

  it('falls back to top-right for an unknown value', () => {
    expect(computeOverlayPosition(workArea, 'nowhere' as unknown as 'top-right', size, 20)).toEqual(
      computeOverlayPosition(workArea, 'top-right', size, 20)
    );
  });
});
