import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  draggedLauncherPosition,
  droppedVisitorPosition,
  keyboardVisitorPosition,
  type LauncherLayout,
  launcherRadius,
  PREVIEW_HEIGHT,
  previewPanelStyle,
  settledLauncherPosition,
} from '../app/lib/widget-launcher-preview'

const layout = (overrides: Partial<LauncherLayout> = {}): LauncherLayout => ({
  width: 900,
  side: 'right',
  isTab: false,
  launcherWidth: 56,
  visitor: null,
  sideOffset: 24,
  bottomOffset: 30,
  ...overrides,
})

test('the launcher rests at the configured offsets', () => {
  assert.deepEqual(settledLauncherPosition(layout()), { x: 900 - 56 - 24, y: PREVIEW_HEIGHT - 56 - 30 })
  assert.deepEqual(settledLauncherPosition(layout({ side: 'left' })), { x: 24, y: PREVIEW_HEIGHT - 56 - 30 })
})

test('blank, negative or fractional offsets fall back to the default', () => {
  for (const bad of ['', ' ', '-1', '2.5', 'abc']) {
    const { x, y } = settledLauncherPosition(layout({ side: 'left', sideOffset: bad, bottomOffset: bad }))
    assert.deepEqual({ x, y }, { x: 20, y: PREVIEW_HEIGHT - 56 - 20 })
  }
  assert.equal(settledLauncherPosition(layout({ side: 'left', sideOffset: '0' })).x, 0)
})

test('offsets are capped to keep the launcher inside the viewport', () => {
  assert.equal(settledLauncherPosition(layout({ side: 'left', width: 390, sideOffset: 1000 })).x, 390 - 112)
  assert.equal(settledLauncherPosition(layout({ bottomOffset: 5000 })).y, PREVIEW_HEIGHT - 56 - (PREVIEW_HEIGHT - 76))
})

test('a collapsed tab hugs the edge and keeps a small bottom gap', () => {
  const tab = layout({ isTab: true, launcherWidth: 22, bottomOffset: 0 })
  assert.deepEqual(settledLauncherPosition(tab), { x: 900 - 22, y: PREVIEW_HEIGHT - 56 - 12 })
})

test('a visitor-placed launcher uses the default margin and its saved height', () => {
  const placed = layout({ side: 'left', visitor: { side: 'left', ratio: 0.5 } })
  assert.deepEqual(settledLauncherPosition(placed), { x: 20, y: 14 + 0.5 * (PREVIEW_HEIGHT - 70) })
})

test('the launcher is round, a dragged tab square, a resting tab flush to its edge', () => {
  assert.equal(launcherRadius(false, true, 'left'), '28px')
  assert.equal(launcherRadius(true, true, 'left'), '8px')
  assert.equal(launcherRadius(true, false, 'left'), '0 8px 8px 0')
  assert.equal(launcherRadius(true, false, 'right'), '8px 0 0 8px')
})

test('the panel fills the phone and otherwise opens above, below or beside the launcher', () => {
  assert.deepEqual(previewPanelStyle(true, { x: 0, y: 0 }, 'right', 56, 390), { inset: '0' })
  assert.deepEqual(previewPanelStyle(false, { x: 820, y: 634 }, 'right', 56, 900), {
    width: '400px',
    height: '606px',
    left: '476px',
    top: '12px',
  })
  assert.deepEqual(previewPanelStyle(false, { x: 20, y: 14 }, 'left', 56, 900), {
    width: '400px',
    height: '622px',
    left: '20px',
    top: '86px',
  })
  assert.deepEqual(previewPanelStyle(false, { x: 20, y: 330 }, 'left', 56, 900), {
    width: '400px',
    height: '680px',
    left: '92px',
    top: '12px',
  })
  assert.equal(previewPanelStyle(false, { x: 820, y: 330 }, 'right', 56, 900).left, '404px')
})

test('the panel never leaves the viewport horizontally', () => {
  assert.equal(previewPanelStyle(false, { x: 0, y: 634 }, 'right', 56, 900).left, '12px')
  assert.equal(previewPanelStyle(false, { x: 880, y: 634 }, 'left', 56, 900).left, '488px')
})

test('a dropped launcher settles on the nearer side at its height', () => {
  assert.deepEqual(droppedVisitorPosition({ x: 100, y: 14 }, 56, 900), { side: 'left', ratio: 0 })
  assert.deepEqual(droppedVisitorPosition({ x: 600, y: 14 + (PREVIEW_HEIGHT - 70) }, 56, 900), {
    side: 'right',
    ratio: 1,
  })
})

test('dragging scales pointer travel and clamps to the viewport', () => {
  assert.deepEqual(draggedLauncherPosition({ x: 100, y: 100 }, 20, 40, 0.5, 56, 900), { x: 140, y: 180 })
  assert.deepEqual(draggedLauncherPosition({ x: 100, y: 100 }, -500, -500, 1, 56, 900), { x: 0, y: 14 })
  assert.deepEqual(draggedLauncherPosition({ x: 800, y: 600 }, 500, 500, 1, 56, 900), {
    x: 900 - 56,
    y: PREVIEW_HEIGHT - 56,
  })
})

test('arrow keys pick a side or move 20px, clamped; other keys do nothing', () => {
  const span = PREVIEW_HEIGHT - 70
  assert.deepEqual(keyboardVisitorPosition('ArrowLeft', 'right', 14 + span / 2), { side: 'left', ratio: 0.5 })
  assert.deepEqual(keyboardVisitorPosition('ArrowRight', 'left', 14), { side: 'right', ratio: 0 })
  assert.deepEqual(keyboardVisitorPosition('ArrowUp', 'right', 114), { side: 'right', ratio: 80 / span })
  assert.deepEqual(keyboardVisitorPosition('ArrowDown', 'left', 14 + span), { side: 'left', ratio: 1 })
  assert.deepEqual(keyboardVisitorPosition('ArrowUp', 'left', 14), { side: 'left', ratio: 0 })
  assert.equal(keyboardVisitorPosition('Enter', 'left', 14), null)
  assert.equal(keyboardVisitorPosition('constructor', 'left', 14), null)
})
