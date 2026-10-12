import { WIDGET_LAUNCHER_OFFSET_DEFAULT, type WidgetLauncherAlignment } from '../../shared/constants/widget-launcher'

// Geometry for the widget launcher preview: a scaled viewport in which the
// launcher sits, can be dragged or moved with the arrow keys, and opens a panel.
// It mirrors the SDK's viewport limits.

export const PREVIEW_HEIGHT = 720
const LAUNCHER_SIZE = 56
const PANEL_WIDTH = 400
const PANEL_MIN_HEIGHT = 480
const TOP_LIMIT = 14
// Vertical travel of a visitor-placed launcher: ratio 0..1 maps onto this span.
const TRAVEL = PREVIEW_HEIGHT - 70

export interface VisitorPosition {
  side: WidgetLauncherAlignment
  ratio: number
}

export interface Point {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

// A configured offset, or the default when the field is blank or invalid.
function launcherOffset(value: number | string): number {
  const number = Number(value)
  return String(value).trim() !== '' && Number.isSafeInteger(number) && number >= 0
    ? number
    : WIDGET_LAUNCHER_OFFSET_DEFAULT
}

export interface LauncherLayout {
  width: number
  side: WidgetLauncherAlignment
  isTab: boolean
  launcherWidth: number
  visitor: VisitorPosition | null
  sideOffset: number | string
  bottomOffset: number | string
}

function sideMargin(layout: LauncherLayout): number {
  if (layout.isTab) return 0
  if (layout.visitor) return WIDGET_LAUNCHER_OFFSET_DEFAULT
  return Math.min(launcherOffset(layout.sideOffset), layout.width - 112)
}

function settledTop(layout: LauncherLayout): number {
  if (layout.visitor) return TOP_LIMIT + layout.visitor.ratio * TRAVEL
  const bottom = Math.min(launcherOffset(layout.bottomOffset), PREVIEW_HEIGHT - 76)
  return PREVIEW_HEIGHT - LAUNCHER_SIZE - Math.max(layout.isTab ? 12 : 0, bottom)
}

// Where the launcher rests: the configured offsets, or where the visitor left it.
export function settledLauncherPosition(layout: LauncherLayout): Point {
  const margin = sideMargin(layout)
  return {
    x: layout.side === 'left' ? margin : layout.width - layout.launcherWidth - margin,
    y: settledTop(layout),
  }
}

export function launcherRadius(isTab: boolean, dragging: boolean, side: WidgetLauncherAlignment): string {
  if (!isTab) return '28px'
  if (dragging) return '8px'
  return side === 'left' ? '0 8px 8px 0' : '8px 0 0 8px'
}

// The panel opens above the launcher when it fits, else below, else beside it.
export function previewPanelStyle(
  mobile: boolean,
  settled: Point,
  side: WidgetLauncherAlignment,
  launcherWidth: number,
  width: number,
): Record<string, string> {
  if (mobile) return { inset: '0' }
  const above = settled.y - 16 - 12
  const below = PREVIEW_HEIGHT - (settled.y + LAUNCHER_SIZE + 16) - 12
  const fitsAbove = above >= PANEL_MIN_HEIGHT
  const fitsBelow = below >= PANEL_MIN_HEIGHT
  const height = Math.min(680, fitsAbove ? above : fitsBelow ? below : PREVIEW_HEIGHT - 24)
  const alongside = side === 'left' ? settled.x : settled.x + launcherWidth - PANEL_WIDTH
  const beside = side === 'left' ? settled.x + launcherWidth + 16 : settled.x - 16 - PANEL_WIDTH
  const left = fitsAbove || fitsBelow ? alongside : beside
  const top = fitsAbove ? settled.y - 16 - height : fitsBelow ? settled.y + 72 : 12
  return {
    width: `${PANEL_WIDTH}px`,
    height: `${height}px`,
    left: `${clamp(left, 12, width - PANEL_WIDTH - 12)}px`,
    top: `${top}px`,
  }
}

// Where a dropped launcher settles: the nearer side, at the height it was let go.
export function droppedVisitorPosition(drag: Point, launcherWidth: number, width: number): VisitorPosition {
  return {
    side: drag.x + launcherWidth / 2 < width / 2 ? 'left' : 'right',
    ratio: (drag.y - TOP_LIMIT) / TRAVEL,
  }
}

// The launcher position under the pointer, kept inside the viewport. The
// pointer moved by (dx, dy) screen pixels over a preview drawn at `scale`.
export function draggedLauncherPosition(
  start: Point,
  dx: number,
  dy: number,
  scale: number,
  launcherWidth: number,
  width: number,
): Point {
  return {
    x: clamp(start.x + dx / scale, 0, width - launcherWidth),
    y: clamp(start.y + dy / scale, TOP_LIMIT, PREVIEW_HEIGHT - LAUNCHER_SIZE),
  }
}

const ARROW_SIDES = new Map<string, WidgetLauncherAlignment>([
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
])
const ARROW_STEPS = new Map<string, number>([
  ['ArrowLeft', 0],
  ['ArrowRight', 0],
  ['ArrowUp', -20],
  ['ArrowDown', 20],
])

// Keyboard placement: left/right pick a side, up/down move 20px. Null for any
// other key.
export function keyboardVisitorPosition(
  key: string,
  side: WidgetLauncherAlignment,
  top: number,
): VisitorPosition | null {
  const step = ARROW_STEPS.get(key)
  if (step === undefined) return null
  return {
    side: ARROW_SIDES.get(key) ?? side,
    ratio: clamp((top - TOP_LIMIT + step) / TRAVEL, 0, 1),
  }
}
