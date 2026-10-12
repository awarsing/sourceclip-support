<script setup lang="ts">
defineProps<{
  hasCover: boolean
  showImage: boolean
  previewUrl: string | null
  uploading: boolean
}>()
const emit = defineEmits<{ pick: [file: File]; remove: [] }>()
const fileInput = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  if (fileInput.value) fileInput.value.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit('pick', file)
}

function remove(e: Event) {
  e.stopPropagation()
  emit('remove')
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <section class="shrink-0 rounded-xl border border-border bg-card p-5 shadow-sm">
    <h3 class="mb-3 text-sm font-semibold text-foreground">{{ $t('changelog.editor.featuredImage') }}</h3>
    <div class="relative">
      <button
        class="group flex h-28 w-full flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50"
        @click="triggerUpload"
      >
        <template v-if="showImage">
          <img :src="previewUrl!" class="absolute inset-0 h-full w-full rounded-lg object-cover" :alt="$t('a11y.coverImage')" >
          <!-- Upload loading overlay -->
          <div v-if="uploading" class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/50">
            <div class="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
            <span class="mt-2 text-xs font-medium text-white">{{ $t('changelog.editor.uploading') }}</span>
          </div>
          <!-- Hover replace overlay (only when not uploading) -->
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm">
              <Icon name="lucide:upload-cloud" size="18" class="text-foreground" />
            </div>
            <span class="mt-2 text-xs font-medium text-white">{{ $t('changelog.editor.clickReplace') }}</span>
          </div>
        </template>
        <template v-else>
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm transition-colors group-hover:bg-card">
            <Icon name="lucide:upload-cloud" size="20" class="text-muted-foreground" />
          </div>
          <span class="text-xs font-medium text-muted-foreground group-hover:text-foreground">
            {{ $t('changelog.editor.clickUpload') }}
          </span>
          <span class="text-[11px] text-muted-foreground/60">
            {{ $t('changelog.editor.coverHint') }}
          </span>
        </template>
      </button>
      <button
        v-if="hasCover"
        type="button"
        class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
        @click="remove"
      >
        <Icon name="lucide:x" size="14" />
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onFileChange"
      >
    </div>
  </section>
</template>
