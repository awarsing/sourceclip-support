<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type {
  WidgetLauncherAlignment,
  WidgetLauncherCloseBehavior,
} from '#layers/feedlog/shared/constants/widget-launcher'
import {
  draggedLauncherPosition,
  droppedVisitorPosition,
  keyboardVisitorPosition,
  launcherRadius,
  PREVIEW_HEIGHT,
  previewPanelStyle,
  settledLauncherPosition,
  type VisitorPosition,
} from '~/lib/widget-launcher-preview'

const props = defineProps<{
  alignment: WidgetLauncherAlignment
  bottomOffset: number | string
  sideOffset: number | string
  closeBehavior: WidgetLauncherCloseBehavior
  enabled: boolean
}>()
const { t } = useI18n()
const { data: config, error: configError, refresh } = useFetch('/api/widget/config', { server: false })
const device = ref<'desktop' | 'mobile'>('desktop')
const frame = ref<HTMLElement | null>(null)
const launcher = ref<HTMLButtonElement | null>(null)
const resetButton = ref<HTMLButtonElement | null>(null)
const scale = ref(0.4)
const width = computed(() => (device.value === 'desktop' ? 900 : 390))
const height = PREVIEW_HEIGHT
const mode = ref<'button' | 'tab' | 'hidden'>('button')
const panelOpen = ref(false)
const visitorPosition = ref<VisitorPosition | null>(null)
const dragPosition = ref<{ x: number; y: number } | null>(null)
let pointer: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null
let suppressClick = false
let observer: ResizeObserver | undefined

// Match the existing portal preview: scale a complete viewport, never squeeze
// the widget itself into the settings card's available width.
function measure() {
  if (frame.value) scale.value = frame.value.clientWidth / width.value
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (frame.value) observer.observe(frame.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())
const brandStyle = computed(() =>
  config.value
    ? { '--primary': config.value.branding.primary, '--primary-foreground': config.value.branding.primaryForeground }
    : {},
)
const side = computed(() => visitorPosition.value?.side ?? props.alignment)
const isTab = computed(() => mode.value === 'tab')
const launcherWidth = computed(() => (isTab.value ? 22 : 56))
const settledPosition = computed(() =>
  settledLauncherPosition({
    width: width.value,
    side: side.value,
    isTab: isTab.value,
    launcherWidth: launcherWidth.value,
    visitor: visitorPosition.value,
    sideOffset: props.sideOffset,
    bottomOffset: props.bottomOffset,
  }),
)
const position = computed(() => dragPosition.value ?? settledPosition.value)
const launcherStyle = computed<CSSProperties>(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  width: `${launcherWidth.value}px`,
  borderRadius: launcherRadius(isTab.value, !!dragPosition.value, side.value),
}))
const panelStyle = computed<CSSProperties>(() =>
  previewPanelStyle(device.value === 'mobile', settledPosition.value, side.value, launcherWidth.value, width.value),
)
const footerHint = computed(() => {
  if (!props.enabled) return t('settings.widget.previewDisabled')
  return mode.value === 'hidden' ? t('settings.widget.previewState_hidden') : t('settings.widget.previewHint')
})
const showLauncher = computed(
  () => props.enabled && mode.value !== 'hidden' && !(device.value === 'mobile' && panelOpen.value),
)
const showPanel = computed(() => props.enabled && panelOpen.value)
const launcherClass = computed(() =>
  isTab.value
    ? 'bg-card text-primary border-border shadow-sm'
    : 'bg-primary text-primary-foreground border-transparent shadow-xl',
)
const launcherLabelKey = computed(() =>
  isTab.value ? 'settings.widget.previewRestore' : 'settings.widget.previewOpenLauncher',
)
const closeButtonClass = computed(() => (side.value === 'right' ? '-left-5' : '-right-5'))
const showCloseButton = computed(
  () => mode.value === 'button' && props.closeBehavior !== 'none' && !panelOpen.value && !dragPosition.value,
)

function releasePointer(id: number) {
  if (launcher.value?.hasPointerCapture(id)) launcher.value.releasePointerCapture(id)
}

function settleDrop() {
  if (dragPosition.value) {
    visitorPosition.value = droppedVisitorPosition(dragPosition.value, launcherWidth.value, width.value)
  }
}

function endDrag(cancel = false) {
  if (!pointer) return
  const { id, moved } = pointer
  if (moved && !cancel) settleDrop()
  pointer = null
  dragPosition.value = null
  releasePointer(id)
}
function reset() {
  endDrag(true)
  mode.value = 'button'
  panelOpen.value = false
  visitorPosition.value = null
  suppressClick = false
}
watch(() => [props.alignment, props.bottomOffset, props.sideOffset, props.closeBehavior, props.enabled], reset)
watch(device, () => {
  reset()
  nextTick(measure)
})
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || panelOpen.value) return
  pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    left: settledPosition.value.x,
    top: settledPosition.value.y,
    moved: false,
  }
  suppressClick = false
  launcher.value?.setPointerCapture(event.pointerId)
}
// A press only becomes a drag once the pointer travels 8px.
function isDragging(dx: number, dy: number) {
  return !!pointer && (pointer.moved || Math.hypot(dx, dy) >= 8)
}
function moveDrag(event: PointerEvent) {
  if (pointer?.id !== event.pointerId) return
  const dx = event.clientX - pointer.x
  const dy = event.clientY - pointer.y
  if (!isDragging(dx, dy)) return
  pointer.moved = true
  suppressClick = true
  dragPosition.value = draggedLauncherPosition(
    { x: pointer.left, y: pointer.top },
    dx,
    dy,
    scale.value,
    launcherWidth.value,
    width.value,
  )
}
function openPanel() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  mode.value = 'button'
  panelOpen.value = !panelOpen.value
}
function focusAfterClose() {
  nextTick(() => (mode.value === 'hidden' ? resetButton.value : launcher.value)?.focus())
}
function closeLauncher() {
  mode.value = props.closeBehavior === 'hide' ? 'hidden' : 'tab'
  panelOpen.value = false
  focusAfterClose()
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    endDrag(true)
    return
  }
  if (panelOpen.value) return
  const next = keyboardVisitorPosition(event.key, side.value, settledPosition.value.y)
  if (!next) return
  event.preventDefault()
  visitorPosition.value = next
}
function closePanel() {
  panelOpen.value = false
  focusAfterClose()
}
</script>

<template>
  <div
    class="min-w-0 space-y-3"
    data-widget-preview
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {{ $t('settings.widget.previewTitle') }}
      </p>
      <WidgetPreviewDeviceToggle v-model="device" />
    </div>
    <div
      v-if="configError"
      class="text-xs text-destructive"
      role="alert"
    >
      {{ $t('settings.widget.previewFailed') }} <button
        type="button"
        class="underline"
        @click="refresh()"
      >
        {{ $t('settings.widget.retry') }}
      </button>
    </div>
    <div
      class="rounded-lg border border-border bg-muted/30 overflow-hidden mx-auto"
      :class="{ 'max-w-[260px]': device === 'mobile' }"
    >
      <div
        ref="frame"
        class="relative overflow-hidden"
        :style="{ height: `${height * scale}px` }"
      >
        <div
          class="preview-canvas absolute left-0 top-0 origin-top-left bg-background text-foreground overflow-hidden"
          :style="{ ...brandStyle, width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` }"
          :data-device="device"
        >
          <WidgetPreviewMockSite :enabled="enabled" />
          <div
            v-if="showLauncher"
            class="preview-anchor absolute h-14 group"
            :class="{ dragging: dragPosition }"
            :style="launcherStyle"
            :data-mode="mode"
            :data-side="side"
          >
            <button
              ref="launcher"
              type="button"
              class="preview-launcher absolute inset-0 h-14 select-none touch-none border grid place-items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              :class="launcherClass"
              :style="{ borderRadius: launcherStyle.borderRadius }"
              :aria-label="$t(launcherLabelKey)"
              @pointerdown="startDrag"
              @pointermove="moveDrag"
              @pointerup="endDrag()"
              @pointercancel="endDrag(true)"
              @lostpointercapture="endDrag(true)"
              @keydown="onKey"
              @click="openPanel"
            >
              <span
                v-if="isTab"
                class="text-xs font-semibold [writing-mode:vertical-rl]"
              >Help</span><Icon
                v-else
                name="lucide:square-pen"
                size="26"
              />
            </button>
            <button
              v-if="showCloseButton"
              type="button"
              class="preview-close absolute -top-5 size-11 grid place-items-center text-muted-foreground hover:text-foreground"
              :class="closeButtonClass"
              :aria-label="$t('settings.widget.previewCloseLauncher')"
              @click="closeLauncher"
            >
              <Icon
                name="lucide:x"
                size="18"
              />
            </button>
          </div>
          <div
            v-if="showPanel"
            class="absolute flex flex-col bg-background shadow-xl overflow-hidden"
            :class="{ 'rounded-2xl': device === 'desktop' }"
            :style="panelStyle"
            data-preview-panel
            @keydown.esc="closePanel"
          >
            <WidgetPreviewPanel :org="config?.org" @close="closePanel" />
          </div>
        </div>
      </div>
    </div>
    <div class="text-center text-[11px] leading-5 text-muted-foreground">
      <span role="status">{{ footerHint }}</span>
      <Button
        variant="link"
        size="xs"
        class="ml-2 align-baseline text-[11px] font-normal text-muted-foreground underline hover:text-foreground"
        as-child
      >
        <button
          ref="resetButton"
          type="button"
          @click="reset"
        >
          {{ $t('settings.widget.previewReset') }}
        </button>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.preview-anchor { transition: left 220ms ease, top 220ms ease, width 220ms ease; }
.preview-anchor.dragging { transition: none; }
.preview-launcher { transition: border-radius 220ms ease, color 220ms ease, background-color 220ms ease; }
.preview-anchor[data-mode='tab'] .preview-launcher::after { content: ''; position: absolute; top: 0; bottom: 0; width: 44px; }
.preview-anchor[data-side='left'] .preview-launcher::after { left: 0; }
.preview-anchor[data-side='right'] .preview-launcher::after { right: 0; }
.preview-close { opacity: 0; transition: opacity 150ms ease; }
.preview-anchor:hover .preview-close, .preview-anchor:focus-within .preview-close, [data-device='mobile'] .preview-close { opacity: 1; }
@media (hover: none) { .preview-close { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .preview-anchor, .preview-launcher, .preview-close { transition: none; } }
</style>
