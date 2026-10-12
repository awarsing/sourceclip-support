<script setup lang="ts">
import '~/assets/css/help-article.css'

defineProps<{ title: string; description: string; content: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="fixed inset-0 z-[60] flex justify-center bg-[rgba(40,40,40,.3)] pt-9" @click="emit('close')">
    <div class="flex max-h-full w-[1080px] max-w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-border bg-background" @click.stop>
      <div class="flex h-[46px] shrink-0 items-center justify-between border-b border-border bg-card px-5">
        <span class="flex items-center gap-2 text-xs font-bold leading-4 text-muted-foreground">
          <Icon name="lucide:eye" size="14" />
          {{ $t('help.admin.editor.previewHeader') }}
        </span>
        <button type="button" class="flex h-[26px] w-[26px] items-center justify-center rounded text-muted-foreground hover:bg-secondary" @click="emit('close')">
          <Icon name="lucide:x" size="15" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto px-8 pt-7">
        <div class="mx-auto max-w-[720px]">
          <h1 class="mb-2.5 text-[30px] font-bold leading-[38px]! tracking-[-.02em]">{{ title }}</h1>
          <p v-if="description" class="mb-5 text-base leading-[26px] text-muted-foreground">{{ description }}</p>
          <hr class="mb-6 border-border">
          <ClientOnly>
            <div class="help-article-styled">
              <ThemedMdPreview :model-value="content" />
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
