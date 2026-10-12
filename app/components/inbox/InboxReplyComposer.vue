<script setup lang="ts">
import { type DeliveryMode, isImeComposing, pastedImages } from '~/lib/pages/inbox'

const props = defineProps<{
  canReply: boolean
  aiHandling: boolean
  sending: boolean
  uploading: boolean
  ready: boolean
  images: { key: string }[]
}>()
const emit = defineEmits<{ send: []; upload: [files: File[]]; removeImage: [index: number] }>()
const draft = defineModel<string>('draft', { required: true })
const deliveryMode = defineModel<DeliveryMode>('deliveryMode', { required: true })
const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const replyInput = ref<HTMLTextAreaElement | null>(null)

const locked = computed(() => !props.canReply || props.sending)
const attachLocked = computed(() => locked.value || props.uploading)
const sendLabel = computed(() =>
  t(deliveryMode.value === 'immediate' ? 'inbox.deliveryImmediate' : 'inbox.deliveryAuto'),
)

function send() {
  if (props.ready) emit('send')
}
function sendKey(event: KeyboardEvent) {
  if (isImeComposing(event)) return
  event.preventDefault()
  send()
}
function pickFiles(event: Event) {
  const input = event.target as HTMLInputElement
  emit('upload', Array.from(input.files || []))
  input.value = ''
}
function pasteImages(event: ClipboardEvent) {
  const files = pastedImages(event.clipboardData)
  if (!files.length) return
  event.preventDefault()
  emit('upload', files)
}

defineExpose({ focus: () => replyInput.value?.focus() })
</script>

<template>
  <form class="shrink-0 border-t border-border bg-card p-3 sm:p-4" @submit.prevent="send">
    <div class="overflow-hidden rounded-lg border border-border bg-card transition-shadow focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
      <div class="flex items-center gap-1.5 px-3 pt-2.5 text-[11px] font-semibold text-foreground"><Icon name="lucide:message-square" size="13" />{{ t('inbox.replyToCustomer') }}</div>
      <p v-if="aiHandling" id="inbox-reply-unavailable" class="px-3 pt-1.5 text-xs text-muted-foreground">{{ t('inbox.aiReplyUnavailable') }}</p>
      <textarea ref="replyInput" v-model="draft" :disabled="locked" :placeholder="t('inbox.replyPlaceholder')" :aria-label="t('inbox.replyPlaceholder')" :aria-describedby="aiHandling ? 'inbox-reply-unavailable' : undefined" maxlength="4000" rows="3" class="block max-h-32 min-h-16 w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-50" @keydown.enter.exact="sendKey" @paste="pasteImages" />
      <div v-if="images.length || uploading" class="flex gap-2 overflow-x-auto px-3 pb-2">
        <div v-for="(image, index) in images" :key="image.key" class="relative size-14 shrink-0 overflow-hidden rounded-md border border-border [&_img]:size-14 [&_img]:object-cover"><WidgetEmbedImage :storage-key="image.key" /><Button type="button" variant="secondary" size="icon" class="absolute right-0 top-0 size-5" :disabled="locked" :title="t('inbox.removeImage')" :aria-label="t('inbox.removeImage')" @click="emit('removeImage', index)"><Icon name="lucide:x" size="12" /></Button></div>
        <div v-if="uploading" class="grid size-14 shrink-0 place-items-center rounded-md border border-border"><Icon name="lucide:loader-2" size="16" class="animate-spin text-muted-foreground" /></div>
      </div>
      <div class="flex items-center justify-between gap-2 px-2 pb-2">
        <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" :disabled="attachLocked" @change="pickFiles">
        <Button type="button" variant="ghost" size="icon" class="hover:bg-secondary/50 hover:text-foreground dark:hover:bg-secondary/50 size-8 text-muted-foreground" :disabled="attachLocked" :title="t('widget.attachImage')" :aria-label="t('widget.attachImage')" @click="fileInput?.click()"><Icon name="lucide:image" size="16" /></Button>
        <div class="flex items-center gap-2">
          <span class="hidden whitespace-nowrap text-[10px] text-muted-foreground lg:inline">Enter</span>
          <div class="inline-flex w-56 shrink-0 items-stretch rounded-md" :class="{ 'opacity-50': !ready }" data-inbox-send>
            <Button type="submit" variant="default" size="sm" class="h-9 min-w-0 flex-1 gap-1.5 rounded-r-none text-xs disabled:opacity-100" :disabled="!ready"><Icon :name="sending ? 'lucide:loader-2' : 'lucide:send'" size="14" :class="{ 'animate-spin': sending }" />{{ sendLabel }}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button type="button" variant="default" size="sm" class="h-9 w-8 rounded-l-none border-l border-primary-foreground/25 px-0 disabled:opacity-100" :disabled="attachLocked" :title="t('inbox.deliveryMode')" :aria-label="t('inbox.deliveryMode')"><Icon name="lucide:chevron-down" size="14" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" class="w-56 max-w-[calc(100vw-2rem)]">
                <FilterOptionItem v-for="mode in (['auto', 'immediate'] as const)" :key="mode" :selected="deliveryMode === mode" :description="t(mode === 'auto' ? 'inbox.deliveryAutoDescription' : 'inbox.deliveryImmediateDescription')" :text-value="t(mode === 'auto' ? 'inbox.deliveryAuto' : 'inbox.deliveryImmediate')" class="py-2.5" @select="deliveryMode = mode">{{ t(mode === 'auto' ? 'inbox.deliveryAuto' : 'inbox.deliveryImmediate') }}</FilterOptionItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  </form>
</template>
