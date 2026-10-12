<script setup lang="ts">
// Logo picker for the branding card. The logo doubles as the upload trigger:
// hover reveals an edit overlay.
const props = defineProps<{
  logoUrl: string | null
  hasLogo: boolean
  initial: string
  isOwner: boolean
  uploading: boolean
}>()

const emit = defineEmits<{ pick: [file: File]; remove: [] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const locked = computed(() => !props.isOwner || props.uploading)
const showOverlay = computed(() => props.isOwner || props.uploading)

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('pick', file)
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div>
    <label class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('settings.branding.logo') }}</label>
    <div class="mt-2 flex items-center gap-4">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" :disabled="locked" @change="onFileChange">
      <button
        type="button"
        class="group relative w-16 h-16 rounded-xl border border-border bg-background grid place-items-center overflow-hidden shrink-0 disabled:cursor-not-allowed"
        :disabled="locked"
        @click="fileInput?.click()"
      >
        <img v-if="logoUrl" :src="logoUrl" alt="Logo" class="w-full h-full object-contain">
        <span v-else class="font-heading font-bold text-2xl text-muted-foreground">{{ initial }}</span>
        <span
          v-if="showOverlay"
          class="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
          :class="{ '!opacity-100': uploading }"
        >
          <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:pencil'" size="16" :class="{ 'animate-spin': uploading }" />
        </span>
      </button>
      <button
        v-if="hasLogo"
        class="h-9 px-3.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        :disabled="locked"
        @click="emit('remove')"
      >
        <Icon name="lucide:trash-2" size="14" />
        {{ $t('settings.branding.removeLogo') }}
      </button>
    </div>
    <!-- Helper on its own full-width line so it stays one line in the
         narrow split column instead of wrapping beside the buttons. -->
    <p class="text-[11px] text-muted-foreground mt-2">{{ $t('settings.branding.logoHint') }}</p>
  </div>
</template>
