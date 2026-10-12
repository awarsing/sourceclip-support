<script setup lang="ts">
import type { HelpArticleStatus } from '#layers/feedlog/shared/constants/help'
import { formatStamp } from './-help-logic'

const props = defineProps<{
  article: { status: HelpArticleStatus; updatedAt: string } | null | undefined
  dirty: boolean
  saving: boolean
}>()
const emit = defineEmits<{ back: []; delete: []; preview: []; saveDraft: []; togglePublish: [] }>()
const { t } = useI18n()

const stateClass = computed(() =>
  props.dirty ? 'font-bold text-[var(--accent)]' : 'font-medium text-muted-foreground',
)
const stateText = computed(() => {
  if (!props.article) return t('help.admin.editor.notSaved')
  if (props.dirty) return t('help.admin.editor.unsaved')
  return t('help.admin.editor.lastSaved', { at: formatStamp(props.article.updatedAt) })
})
const publishLabel = computed(() =>
  props.article?.status === 'published' ? t('help.admin.unpublish') : t('help.admin.publish'),
)
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
    <div class="flex items-center gap-4">
      <button type="button" data-testid="help-editor-back" class="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" @click="emit('back')">
        <Icon name="lucide:arrow-left" size="16" />
        {{ $t('help.admin.editor.back') }}
      </button>
      <div class="h-4 w-px bg-border" />
      <HelpStatusBadge v-if="article" :status="article.status" />
      <span class="text-xs" :class="stateClass">
        {{ stateText }}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <template v-if="article">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-destructive/40 px-3 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          :disabled="saving"
          @click="emit('delete')"
        >
          <Icon name="lucide:trash-2" size="14" />
          {{ $t('help.admin.editor.delete') }}
        </button>
        <div class="h-4 w-px bg-border" />
      </template>
      <button type="button" class="inline-flex h-9 items-center gap-2 rounded-2xl border border-border bg-background px-3 text-xs font-bold text-muted-foreground hover:text-foreground" @click="emit('preview')">
        <Icon name="lucide:eye" size="16" />
        {{ $t('help.admin.editor.preview') }}
      </button>
      <button type="button" class="inline-flex h-9 items-center gap-2 rounded-2xl border border-border bg-background px-3 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50" :disabled="saving" @click="emit('saveDraft')">
        <Icon name="lucide:save" size="16" />
        {{ $t('help.admin.editor.saveDraft') }}
      </button>
      <button type="button" class="inline-flex h-9 items-center rounded-2xl border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" :disabled="saving" @click="emit('togglePublish')">
        {{ publishLabel }}
      </button>
    </div>
  </header>
</template>
