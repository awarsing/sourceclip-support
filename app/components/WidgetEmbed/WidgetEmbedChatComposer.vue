<script setup lang="ts">
import WidgetEmbedImage from './WidgetEmbedImage.vue'
import type { ChatAttachment } from './-chat-logic'

const props = defineProps<{
  attachments: ChatAttachment[]
  uploading: boolean
  busy: boolean
  awaitingRun: boolean
  uploadError: string
}>()
const emit = defineEmits<{ send: []; files: [files: File[]]; remove: [index: number]; dismissError: [] }>()
const draft = defineModel<string>('draft', { required: true })
const { t } = useI18n()

const draftEl = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const showStaged = computed(() => props.attachments.length > 0 || props.uploading)
const attachDisabled = computed(() => props.uploading || props.busy)
const sendDisabled = computed(() => (!draft.value.trim() && !props.attachments.length) || attachDisabled.value)

function autosize() {
  const el = draftEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(draft, autosize, { flush: 'post' })

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  emit('files', files)
}

function onPaste(e: ClipboardEvent) {
  const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
  if (!images.length) return
  // A copied file carries its name as text/plain; without this it lands in the draft.
  e.preventDefault()
  emit('files', images)
}

function onEnterKey(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  emit('send')
}
</script>

<template>
  <div class="px-3 py-2.5 bg-card shrink-0">
    <p v-if="uploadError" class="mb-2 flex items-start gap-1.5 text-[11px] text-destructive">
      <Icon name="lucide:alert-circle" size="13" class="shrink-0 mt-px" />
      <span class="flex-1">{{ uploadError }}</span>
      <button
        class="shrink-0 hover:opacity-70 transition-opacity"
        :aria-label="t('widget.close')"
        @click="emit('dismissError')"
      >
        <Icon name="lucide:x" size="12" />
      </button>
    </p>

    <!-- Staged attachments: already uploaded, waiting to ride along with the message. -->
    <div v-if="showStaged" class="flex flex-wrap gap-1.5 mb-2">
      <div
        v-for="(a, i) in attachments"
        :key="a.key"
        class="relative h-12 w-16 rounded-md overflow-hidden border border-border group"
      >
        <WidgetEmbedImage :storage-key="a.key" />
        <button
          class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
          :aria-label="t('widget.cancel')"
          :disabled="awaitingRun"
          @click="emit('remove', i)"
        >
          <Icon name="lucide:x" size="14" />
        </button>
      </div>
      <div v-if="uploading" class="h-12 w-16 rounded-md border border-border grid place-items-center">
        <Icon name="lucide:loader-2" size="14" class="animate-spin text-muted-foreground" />
      </div>
    </div>

    <!-- Controls sit on their own row so the textarea can grow into the card
         instead of stretching the buttons beside it. -->
    <div class="rounded-md border border-border bg-card transition-shadow focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="onFilePicked"
      >
      <textarea
        ref="draftEl"
        v-model="draft"
        :disabled="awaitingRun"
        rows="1"
        maxlength="4000"
        :placeholder="t('widget.placeholder')"
        class="w-full min-h-12 max-h-[120px] px-3 py-2 bg-transparent text-[13.5px] leading-normal resize-none overscroll-y-contain focus:outline-none no-scrollbar"
        @keydown.enter.exact="onEnterKey"
        @paste="onPaste"
      />
      <div class="flex items-center justify-between px-1.5 py-1">
        <button
          :disabled="attachDisabled"
          class="h-6.5 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          :aria-label="t('widget.attachImage')"
          @click="fileInput?.click()"
        >
          <Icon name="lucide:image" size="15" />
        </button>
        <button
          :disabled="sendDisabled"
          class="relative px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-heading font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          @click="emit('send')"
        >
          <span :class="{ invisible: awaitingRun }">{{ t('widget.send') }}</span>
          <span v-if="awaitingRun" class="absolute inset-0 grid place-items-center" role="status" :aria-label="t('widget.send')">
            <Icon name="lucide:loader-2" size="14" class="animate-spin" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
