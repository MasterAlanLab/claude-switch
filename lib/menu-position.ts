export interface RectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export function menuPosition(
  anchor: RectLike,
  menu: Pick<RectLike, 'width' | 'height'>,
  viewport: { width: number; height: number },
) {
  const gap = 5;
  const margin = 8;
  const left = Math.min(
    Math.max(margin, anchor.right - menu.width),
    viewport.width - menu.width - margin,
  );
  const below = anchor.bottom + gap;
  const top =
    below + menu.height <= viewport.height - margin
      ? below
      : Math.max(margin, anchor.top - menu.height - gap);
  return { top, left };
}
