<script setup lang="ts">
import { toast } from 'vue-sonner'
import { formatStamp } from './-help-logic'

const props = defineProps<{
  article: { createdAt: string; updatedAt: string } | null | undefined
  isNew: boolean
  url: string
}>()
const { t } = useI18n()
const createdAt = computed(() => (props.article ? formatStamp(props.article.createdAt) : '—'))
const updatedAt = computed(() => (props.article ? formatStamp(props.article.updatedAt) : '—'))

async function copyUrl() {
  await navigator.clipboard.writeText(`${location.origin}${props.url}`)
  toast.success(t('help.admin.editor.copied'))
}
</script>

<template>
  <div>
    <p class="mb-1.5 text-[11px] font-bold uppercase leading-[17px] tracking-[.05em] text-muted-foreground">{{ $t('help.admin.editor.details') }}</p>
    <div class="flex justify-between py-1 text-xs">
      <span class="text-muted-foreground">{{ $t('help.admin.editor.created') }}</span>
      <b>{{ createdAt }}</b>
    </div>
    <div class="flex justify-between py-1 text-xs">
      <span class="text-muted-foreground">{{ $t('help.admin.editor.updated') }}</span>
      <b>{{ updatedAt }}</b>
    </div>
    <div class="mt-2.5 flex justify-between py-1 text-xs">
      <span class="text-muted-foreground">{{ $t('help.admin.editor.articleUrl') }}</span>
    </div>
    <p v-if="isNew" class="mt-1.5 text-[11px] leading-4 text-muted-foreground">{{ $t('help.admin.editor.urlPending') }}</p>
    <div v-else class="mt-1.5 flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5">
      <code class="min-w-0 flex-1 truncate text-[11px]">{{ url }}</code>
      <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground" @click="copyUrl">
        <Icon name="lucide:link" size="13" />
      </button>
    </div>
  </div>
</template>
